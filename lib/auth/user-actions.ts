"use server";

import { z } from "zod";

import {
  adminAction,
  done,
  fail,
  type ActionResult,
  type ActionState,
} from "@/lib/admin/action";
import { hashPassword } from "@/lib/auth/password";
import { isUniqueViolation } from "@/lib/db/errors";
import {
  canChangeRole,
  canDeactivate,
  type StaffChangeContext,
} from "@/lib/auth/staff-guards";
import {
  countActiveSuperAdmins,
  createStaffAccount,
  deactivateStaffAccount,
  getUserById,
  reactivateStaffAccount,
  setStaffRole,
  unlockStaffAccount,
  updatePasswordHash,
} from "@/lib/db/queries/users";
import { userRoleEnum } from "@/lib/db/schema";
import { staffPassword } from "@/lib/validation/password";

/**
 * Staff account management, built on `adminAction` (lib/admin/action.ts), which
 * does the session, `can(..., "users")`, parsing, audit row and revalidation.
 *
 * What stays here is the second layer: `lib/auth/staff-guards.ts` decides
 * whether a specific change is safe, i.e. whether it leaves someone able to
 * administer the panel afterwards.
 *
 * Audit metadata is roles only. The target is identified by `entity_id`; their
 * email is personal data and does not belong in the audit log.
 */

export type StaffResult = ActionResult<{ message: string }>;
export type StaffState = ActionState<{ message: string }>;

const ROLES = userRoleEnum.enumValues;
const USERS_PATH = "/admin/users";

const createSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name.").max(120),
    email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(320),
    role: z.enum(ROLES, "Choose a role."),
    password: z.string().min(1, "Enter a password."),
  })
  // Same rule the form runs client-side; this is the one that counts.
  .superRefine(({ email, password }, ctx) => {
    const result = staffPassword.safeParse({ email, password });
    if (result.success) return;
    for (const issue of result.error.issues) {
      ctx.addIssue({ code: "custom", path: ["password"], message: issue.message });
    }
  });

const idSchema = z.object({ userId: z.uuid("That account no longer exists.") });

const roleSchema = idSchema.extend({ role: z.enum(ROLES, "That is not a valid role.") });

const passwordSchema = idSchema.extend({
  password: z.string().min(1, "Enter a new password."),
});

const NOT_FOUND = "That account no longer exists.";

/**
 * Build the guard context for a change to `targetId`.
 *
 * Returns `null` when the target does not exist or is already deactivated, which
 * the callers report as "not found" — there is no reason to distinguish the two
 * for someone who should not be probing either way.
 */
async function contextFor(
  actorId: string,
  targetId: string,
): Promise<StaffChangeContext | null> {
  const target = await getUserById(targetId);
  if (!target) return null;

  return {
    actorId,
    targetId,
    targetRole: target.role,
    activeSuperAdmins: await countActiveSuperAdmins(),
  };
}

/** Create a staff account with an initial password set by an admin. */
export const createStaffAction = adminAction(
  {
    resource: "users",
    action: "create",
    schema: createSchema,
    event: "user.created",
    path: USERS_PATH,
  },
  async ({ name, email, role, password }) => {
    const passwordHash = await hashPassword(password);

    let created: { id: string };
    try {
      created = await createStaffAccount({ name, email, passwordHash, role });
    } catch (error) {
      // The unique index on email is the duplicate check — a select-then-insert
      // would race with a second admin adding the same person. Matched by
      // SQLSTATE: drizzle's wrapper message says only "Failed query: …".
      if (isUniqueViolation(error)) {
        const duplicate = "An account with that email already exists.";
        return fail(duplicate, { fields: { email: [duplicate] } });
      }
      throw error;
    }

    return done(
      { message: `Created ${email}. Share the password with them directly.` },
      { entityId: created.id, metadata: { role } },
    );
  },
);

/** Change a staff account's role. */
export const changeRoleAction = adminAction(
  {
    resource: "users",
    action: "update",
    schema: roleSchema,
    event: "user.role_changed",
    path: USERS_PATH,
  },
  async ({ userId, role }, { user }) => {
    const context = await contextFor(user.id, userId);
    if (!context) return fail(NOT_FOUND);

    const guard = canChangeRole(context, role);
    if (!guard.ok) return fail(guard.reason);

    await setStaffRole(userId, role);

    return done(
      { message: "Role updated." },
      { entityId: userId, metadata: { from: context.targetRole, to: role } },
    );
  },
);

/** Deactivate an account. Soft delete — the audit trail keeps resolving. */
export const deactivateStaffAction = adminAction(
  {
    resource: "users",
    action: "delete",
    schema: idSchema,
    event: "user.deactivated",
    path: USERS_PATH,
  },
  async ({ userId }, { user }) => {
    const context = await contextFor(user.id, userId);
    if (!context) return fail(NOT_FOUND);

    const guard = canDeactivate(context);
    if (!guard.ok) return fail(guard.reason);

    await deactivateStaffAccount(userId);

    return done(
      { message: "Account deactivated. They can no longer sign in." },
      { entityId: userId, metadata: { role: context.targetRole } },
    );
  },
);

/** Reactivate a deactivated account. */
export const reactivateStaffAction = adminAction(
  {
    resource: "users",
    action: "update",
    schema: idSchema,
    event: "user.reactivated",
    path: USERS_PATH,
  },
  async ({ userId }) => {
    await reactivateStaffAccount(userId);
    return done({ message: "Account reactivated." }, { entityId: userId });
  },
);

/** Clear a lockout before it expires on its own, without changing the password. */
export const unlockStaffAction = adminAction(
  {
    resource: "users",
    action: "update",
    schema: idSchema,
    event: "user.unlocked",
    path: USERS_PATH,
  },
  async ({ userId }) => {
    await unlockStaffAccount(userId);
    return done({ message: "Lockout cleared." }, { entityId: userId });
  },
);

/**
 * Set a new password for someone else.
 *
 * There is no self-service reset — no email provider is configured
 * (`RESEND_ENABLED=false` must keep working, per CLAUDE.md), and a reset link
 * that cannot be delivered is worse than none. An admin sets the password
 * and passes it on directly.
 */
export const resetPasswordAction = adminAction(
  {
    resource: "users",
    action: "update",
    schema: passwordSchema,
    event: "user.password_reset",
    path: USERS_PATH,
  },
  async ({ userId, password }) => {
    const target = await getUserById(userId);
    if (!target) return fail(NOT_FOUND);

    // The rule depends on the target's email, which only the database knows.
    const rule = staffPassword.safeParse({ email: target.email, password });
    if (!rule.success) {
      const messages = rule.error.issues.map((issue) => issue.message);
      return fail(messages[0] ?? "Choose a different password.", {
        fields: { password: messages },
      });
    }

    await updatePasswordHash(userId, await hashPassword(password));
    await unlockStaffAccount(userId);

    return done(
      { message: "Password updated. Share it with them directly." },
      { entityId: userId },
    );
  },
);

/**
 * Single entry point for the per-row controls in the staff list.
 *
 * Each row has four things it can do, and one dispatcher means one
 * `useActionState` and one `aria-live` region per row rather than four of each —
 * so a screen reader hears one clear result instead of four regions competing to
 * announce.
 *
 * The intent is validated against a closed list, and each branch delegates to
 * an action that runs the full `adminAction` pipeline. This adds a convenience,
 * not a shortcut past anything.
 */
export async function staffRowAction(
  prev: StaffState,
  formData: FormData,
): Promise<StaffResult> {
  switch (formData.get("intent")) {
    case "role":
      return changeRoleAction(prev, formData);
    case "deactivate":
      return deactivateStaffAction(prev, formData);
    case "reactivate":
      return reactivateStaffAction(prev, formData);
    case "unlock":
      return unlockStaffAction(prev, formData);
    case "password":
      return resetPasswordAction(prev, formData);
    default:
      return fail("Unknown action.");
  }
}
