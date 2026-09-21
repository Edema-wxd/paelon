import { z } from "zod";

import { hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";
import type { Role } from "@/lib/auth/policy";
import {
  getUserByEmail,
  recordSuccessfulLogin,
  reserveLoginAttempt,
  updatePasswordHash,
  writeAuditEntry,
} from "@/lib/db/queries/users";
import { logger } from "@/lib/logger";
import {
  clientIpFrom,
  RATE_LIMITS,
  reserveRateLimitSlot,
  type RateLimitReservation,
} from "@/lib/rate-limit";

/**
 * The Credentials provider's `authorize`, kept out of `lib/auth/config.ts` so it
 * can be tested against a database without booting Auth.js.
 */

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

/** What a successful sign-in hands to Auth.js. */
export interface AuthorizedUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: Role;
}

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
 *
 * Both limits — per IP and per account — count the attempt *before* the
 * password is checked and hand it back when the password turns out to be
 * right. Checking a counter, spending ~50ms on argon2 and only then
 * recording the failure would let a burst of parallel requests all read
 * the same pre-attempt state and all get a guess through. The refund is
 * what keeps them failure limits: staff on a shared hospital IP signing
 * in at the start of a shift must not use up each other's budget.
 *
 * With no client IP header (self-hosted without a proxy that sets one)
 * every request would share the `"unknown"` bucket, and five wrong
 * passwords from anyone would lock every member of staff out. The IP
 * limit is skipped there and the per-account lockout (A2) still applies.
 */
export async function authorizeCredentials(
  raw: unknown,
  headers: Headers,
): Promise<AuthorizedUser | null> {
  const ip = clientIpFrom(headers);
  const ipKnown = ip !== "unknown";

  let reservation: RateLimitReservation | null = null;
  if (!ipKnown) {
    logger.warn("auth.login_ip_unknown", {});
  } else {
    reservation = await reserveRateLimitSlot(RATE_LIMITS.login, ip);
    if (!reservation.allowed) {
      logger.warn("auth.login_rate_limited", {});
      return null;
    }
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

  // Counts this attempt against the account and reports the lock state as it
  // was before it. `recordSuccessfulLogin` below gives the attempt back.
  const { lockedOut } = await reserveLoginAttempt(user.id);

  if (lockedOut) {
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

  // The password was right, so neither limit should have spent anything on it.
  await recordSuccessfulLogin(user.id);
  await reservation?.release();
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
}
