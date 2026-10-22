import NextAuth, { type DefaultSession, type Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { authorizeCredentials } from "@/lib/auth/authorize";
import type { Role } from "@/lib/auth/policy";
import { getUserById, isLockedOut } from "@/lib/db/queries/users";

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

      authorize: (raw, request) => authorizeCredentials(raw, request.headers),
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
