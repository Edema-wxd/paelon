import NextAuth, { type DefaultSession, type Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";
import type { Role } from "@/lib/auth/policy";
import {
  getUserByEmail,
  getUserById,
  isLockedOut,
  recordFailedLogin,
  recordSuccessfulLogin,
  updatePasswordHash,
  writeAuditEntry,
} from "@/lib/db/queries/users";
import { logger } from "@/lib/logger";
import { checkRateLimit, clientIpFrom, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Auth.js v5 configuration for the admin panel.
 *
 * ## Why JWT and not database sessions
 *
 * Auth.js cannot issue a database session from a Credentials provider — the
 * provider returns a user, not an account, and the adapter has nothing to hang
 * a session row on. So the strategy is JWT and the `sessions` table stays
 * empty, exactly as the comment on it in lib/db/schema.ts predicted.
 *
 * The cost of a JWT is that it is a snapshot: a user demoted from super admin
 * to media would keep their old role until the token expired. `SESSION_RECHECK`
 * below closes that by re-reading the row periodically, which is the trade —
 * one query every few minutes rather than one on every request.
 *
 * ## Why authorisation is not here
 *
 * This file answers "who are you". `lib/auth/policy.ts` answers "may you do
 * this", and `lib/auth/session.ts` joins them. Route protection is enforced in
 * the admin layout and again in every server action — never in middleware
 * alone, which has a history of being bypassable and cannot make a database
 * call to check whether an account is still active. `middleware.ts` only
 * redirects requests with no session cookie at all (spec §8 Access).
 *
 * ## Session cookie
 *
 * Auth.js defaults the session cookie to `HttpOnly` and `SameSite=Lax`, but
 * derives `Secure` from the request URL's protocol. Behind a TLS-terminating
 * proxy that does not forward the protocol, that reads `http:` and the cookie
 * ships without `Secure`. `useSecureCookies` pins it to the environment instead
 * (spec §14 Auth), which also gives the cookie its `__Secure-` prefix.
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    /** Epoch ms of the last database re-read. See `SESSION_RECHECK`. */
    checkedAt: number;
  }
}

/** How long a JWT may go without its role being re-read from the database. */
const SESSION_RECHECK_MS = 5 * 60 * 1000;

/** Admin sessions are short. This is a hospital back office, not a consumer app. */
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/**
 * A real argon2id hash of a value nobody knows, verified against whenever the
 * email is unknown.
 *
 * Without it, a login for a non-existent account returns in microseconds while
 * a real one takes ~50ms, and that difference is a free account-enumeration
 * oracle against a hospital's staff list.
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG";

const credentialsSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(1024),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: "/admin/login", error: "/admin/login" },
  trustHost: true,
  useSecureCookies: process.env.NODE_ENV === "production",

  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      /**
       * Returns a user on success and `null` on every failure.
       *
       * Every failure path is indistinguishable to the caller — unknown email,
       * wrong password, locked account and soft-deleted account all produce the
       * same `null` and the same generic message on the login page. The
       * specifics go to the audit log, where staff can see them and an attacker
       * cannot.
       *
       * The per-IP rate limit runs first, here rather than in `loginAction`, so
       * it also covers direct POSTs to `/api/auth/callback/credentials`. A
       * limited attempt writes no audit row — the limit exists partly to stop
       * the audit table being flooded — and never reaches the password check.
       */
      async authorize(raw, request) {
        const limit = await checkRateLimit(
          RATE_LIMITS.login,
          clientIpFrom(request.headers),
        );
        if (!limit.allowed) {
          logger.warn("auth.login_rate_limited", {});
          return null;
        }

        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await getUserByEmail(email);

        if (!user) {
          // Burn the same time a real verify would, then fail.
          await verifyPassword(DUMMY_HASH, password);
          await writeAuditEntry({
            userId: null,
            action: "auth.login_failed",
            entityType: "users",
            metadata: { reason: "unknown_email" },
          });
          return null;
        }

        if (isLockedOut(user)) {
          await writeAuditEntry({
            userId: user.id,
            action: "auth.login_blocked",
            entityType: "users",
            entityId: user.id,
            metadata: { reason: "locked_out" },
          });
          return null;
        }

        const ok = await verifyPassword(user.passwordHash, password);

        if (!ok) {
          await recordFailedLogin(user.id);
          await writeAuditEntry({
            userId: user.id,
            action: "auth.login_failed",
            entityType: "users",
            entityId: user.id,
            metadata: { reason: "bad_password" },
          });
          return null;
        }

        // Transparently upgrade a hash made with weaker parameters. This is the
        // only moment the plaintext is available to do it.
        if (needsRehash(user.passwordHash)) {
          await updatePasswordHash(user.id, await hashPassword(password));
        }

        await recordSuccessfulLogin(user.id);
        await writeAuditEntry({
          userId: user.id,
          action: "auth.login",
          entityType: "users",
          entityId: user.id,
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],

  callbacks: {
    /**
     * Puts the id and role on the token at sign-in, then re-reads them from the
     * database at most every `SESSION_RECHECK_MS`.
     *
     * A user who has been soft-deleted or locked out since sign-in loses their
     * role on the next re-check, and `session` below turns a missing role into
     * a rejected session — so revoking an account does not wait for the token
     * to expire.
     */
    async jwt({ token, user }: { token: JWT; user?: { id?: string; role?: Role } }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role as Role;
        token.checkedAt = Date.now();
        return token;
      }

      if (!token.id) return token;
      if (Date.now() - (token.checkedAt ?? 0) < SESSION_RECHECK_MS) return token;

      const current = await getUserById(token.id);
      if (!current || isLockedOut(current)) {
        // Drop the role. `session` refuses to build a session without one.
        token.role = undefined as unknown as Role;
        return token;
      }

      token.role = current.role;
      token.checkedAt = Date.now();
      return token;
    },

    async session({ session, token }: { session: Session; token: JWT }) {
      session.user.id = token.id;
      session.user.role = token.role;
      return session;
    },
  },
});
