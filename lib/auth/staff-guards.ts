import type { Role } from "@/lib/auth/policy";

/**
 * Rules about staff accounts that hold regardless of who is asking.
 *
 * `lib/auth/policy.ts` answers "may this role manage accounts at all". These are
 * the checks that still apply once the answer is yes — a super admin has
 * permission to change any role, and must still be stopped from removing the
 * last super admin, because the result is a panel nobody can administer and a
 * recovery that means running a script against production.
 *
 * The password rule is a Zod schema, `staffPassword` in `lib/validation/`, so
 * the forms can run the same check before submitting.
 *
 * Pure functions with every input passed in, so the whole guard set is testable
 * without a database and cannot be accidentally skipped by a caller that forgot
 * to await something.
 */

export type GuardResult = { ok: true } | { ok: false; reason: string };

const OK: GuardResult = { ok: true };

/** Context the guards need about the account being changed. */
export interface StaffChangeContext {
  /** Who is making the change. */
  actorId: string;
  /** The account being changed. */
  targetId: string;
  /** The target's current role. */
  targetRole: Role;
  /** Active super admins right now, the target included if they are one. */
  activeSuperAdmins: number;
}

/**
 * May `actor` change `target`'s role to `nextRole`?
 *
 * Self-changes are refused outright rather than only when they would drop the
 * last super admin. Someone editing their own permissions is either a mistake or
 * an escalation, and neither is worth supporting in a back office where a second
 * super admin can do it in ten seconds.
 */
export function canChangeRole(
  context: StaffChangeContext,
  nextRole: Role,
): GuardResult {
  if (context.actorId === context.targetId) {
    return {
      ok: false,
      reason: "You cannot change your own role. Ask another admin.",
    };
  }

  if (
    context.targetRole === "admin" &&
    nextRole !== "admin" &&
    context.activeSuperAdmins <= 1
  ) {
    return {
      ok: false,
      reason:
        "This is the only admin. Promote someone else before changing this role.",
    };
  }

  return OK;
}

/** May `actor` deactivate `target`? */
export function canDeactivate(context: StaffChangeContext): GuardResult {
  if (context.actorId === context.targetId) {
    return {
      ok: false,
      reason: "You cannot deactivate your own account.",
    };
  }

  if (context.targetRole === "admin" && context.activeSuperAdmins <= 1) {
    return {
      ok: false,
      reason:
        "This is the only admin. Promote someone else before deactivating this account.",
    };
  }

  return OK;
}
