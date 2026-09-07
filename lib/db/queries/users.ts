import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { auditLog, users, type User } from "@/lib/db/schema";

/**
 * Admin account reads and writes.
 *
 * Nothing here is wrapped in `cachedRead`. Authentication state must never come
 * from a cache: a locked-out account that is still cached as unlocked is an
 * open door, and `unstable_cache` would happily serve one for an hour.
 */

/** Consecutive failures before an account is locked. */
export const MAX_FAILED_ATTEMPTS = 5;

/** How long a lockout lasts. */
export const LOCKOUT_MINUTES = 15;

/**
 * Look up an active account by email, case-insensitively.
 *
 * Soft-deleted accounts are excluded here rather than at the call site, so a
 * revoked account cannot log in through a path that forgot to check.
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await db()
    .select()
    .from(users)
    .where(
      and(
        sql`lower(${users.email}) = lower(${email})`,
        isNull(users.deletedAt),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/** Look up an active account by id. Used to re-check the session's role on every request. */
export async function getUserById(id: string): Promise<User | null> {
  const rows = await db()
    .select()
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);

  return rows[0] ?? null;
}

/** True when the account is currently locked out. */
export function isLockedOut(user: Pick<User, "lockedUntil">): boolean {
  return user.lockedUntil !== null && user.lockedUntil > new Date();
}

/**
 * Record a failed login and lock the account once the threshold is reached.
 *
 * The increment and the lock are one statement so two simultaneous attempts
 * cannot both read `attempts = 4` and each write `5`, leaving the account
 * unlocked after six failures.
 */
export async function recordFailedLogin(userId: string): Promise<void> {
  await db()
    .update(users)
    .set({
      failedAttempts: sql`${users.failedAttempts} + 1`,
      lockedUntil: sql`
        case
          when ${users.failedAttempts} + 1 >= ${MAX_FAILED_ATTEMPTS}
          then now() + interval '${sql.raw(String(LOCKOUT_MINUTES))} minutes'
          else ${users.lockedUntil}
        end
      `,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/** Clear the failure counter and stamp the login. Called only after a verified password. */
export async function recordSuccessfulLogin(userId: string): Promise<void> {
  await db()
    .update(users)
    .set({
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/** Replace a stored hash — used to upgrade argon2 parameters transparently on login. */
export async function updatePasswordHash(
  userId: string,
  passwordHash: string,
): Promise<void> {
  await db()
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/**
 * Append an audit entry.
 *
 * Never throws into the caller: an audit write that fails must not roll back
 * the action it was describing, and must not hand a stack trace to whoever
 * triggered it. Failures surface in the server log instead.
 *
 * `metadata` is written verbatim, so callers must keep patient identifiers out
 * of it (master spec §14).
 */
export async function writeAuditEntry(entry: {
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}): Promise<void> {
  try {
    await db()
      .insert(auditLog)
      .values({
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        metadata: entry.metadata ?? {},
        ipAddress: entry.ipAddress ?? null,
      });
  } catch (error) {
    const { logger } = await import("@/lib/logger");
    logger.error("audit.write_failed", {
      action: entry.action,
      entityType: entry.entityType,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}
