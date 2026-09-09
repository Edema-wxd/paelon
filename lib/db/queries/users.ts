import { and, eq, isNull, sql } from "drizzle-orm";

import type { Role } from "@/lib/auth/policy";
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

/* -------------------------------------------------------------------------- */
/* Staff account management                                                   */
/* -------------------------------------------------------------------------- */

/** A staff account as the admin panel shows it. Never carries `password_hash`. */
export interface StaffAccount {
  id: string;
  name: string;
  email: string;
  role: Role;
  lastLoginAt: Date | null;
  lockedUntil: Date | null;
  failedAttempts: number;
  createdAt: Date;
  deletedAt: Date | null;
}

/**
 * Every staff account, deactivated ones included, oldest first.
 *
 * The column list is written out rather than `select()` so `password_hash` can
 * never reach a client component by someone spreading the row into props. A
 * hash is not a secret you can rotate quietly — it is the password, offline.
 */
export async function listStaffAccounts(): Promise<StaffAccount[]> {
  return db()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      lastLoginAt: users.lastLoginAt,
      lockedUntil: users.lockedUntil,
      failedAttempts: users.failedAttempts,
      createdAt: users.createdAt,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .orderBy(users.createdAt);
}

/**
 * How many active super admins exist.
 *
 * Guards the one irreversible mistake this panel can make: the last super admin
 * demoting, deactivating or locking themselves out, after which nobody can
 * manage accounts and recovery means running a script against production.
 */
export async function countActiveSuperAdmins(): Promise<number> {
  const rows = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, "admin"), isNull(users.deletedAt)));

  return rows[0]?.count ?? 0;
}

/** Create a staff account. Throws on a duplicate email — the unique index is the check. */
export async function createStaffAccount(input: {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
}): Promise<{ id: string }> {
  const rows = await db()
    .insert(users)
    .values({
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      role: input.role,
    })
    .returning({ id: users.id });

  // `returning` on an insert of one row cannot come back empty.
  return rows[0] as { id: string };
}

/** Change a staff account's role. */
export async function setStaffRole(userId: string, role: Role): Promise<void> {
  await db()
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/**
 * Deactivate an account.
 *
 * A soft delete, so the audit log's `user_id` foreign key still resolves and
 * "who changed this booking" keeps answering after someone leaves. `getUserByEmail`
 * and `getUserById` both filter on `deleted_at`, so the account cannot sign in
 * and its next session re-check drops the role.
 */
export async function deactivateStaffAccount(userId: string): Promise<void> {
  await db()
    .update(users)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/** Reactivate a deactivated account, clearing any lockout it carried. */
export async function reactivateStaffAccount(userId: string): Promise<void> {
  await db()
    .update(users)
    .set({
      deletedAt: null,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/** Clear a lockout without touching the password. */
export async function unlockStaffAccount(userId: string): Promise<void> {
  await db()
    .update(users)
    .set({ failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
}
