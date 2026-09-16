"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { hashPassword } from "@/lib/auth/password";
import { ForbiddenError } from "@/lib/auth/policy";
import { requireCan } from "@/lib/auth/session";
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
  writeAuditEntry,
} from "@/lib/db/queries/users";
import { userRoleEnum } from "@/lib/db/schema";
import { staffPassword } from "@/lib/validation/password";

/**
 * Staff account management.
 *
 * Every action re-checks permission for itself. A server action is a public POST
 * endpoint: the fact that only a super admin sees these controls decides what is
 * rendered, never what is allowed.
 *
 * Two layers of checking, deliberately:
 *  - `requireCan(..., "users")` — may this role manage accounts at all.
 *  - `lib/auth/staff-guards.ts` — is this specific change safe, i.e. does it
 *    leave someone able to administer the panel afterwards.
 *
 * Everything here writes an audit entry. Account and role changes are the events
 * an incident review asks about first, and they are invisible in the content
 * tables.
 */

export interface StaffActionState {
  error?: string;
  message?: string;
}

const ROLES = userRoleEnum.enumValues;

const createSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(320),
  role: z.enum(ROLES),
  password: z.string().min(1, "Enter a password."),
});

/** Same schema the forms run client-side; the server result is the one that counts. */
function passwordError(email: string, password: string): string | null {
  const result = staffPassword.safeParse({ email, password });
  return result.success ? null : (result.error.issues[0]?.message ?? "Choose a different password.");
}

const idSchema = z.object({ userId: z.string().uuid() });

const roleSchema = idSchema.extend({ role: z.enum(ROLES) });

const passwordSchema = idSchema.extend({ password: z.string().min(1) });

/**
 * Wraps an action body with the permission check, turning a `ForbiddenError`
 * into a message instead of a stack trace. Anything else rethrows — an
 * unexpected failure must not be reported to the user as a permission problem.
 */
async function withPermission(
  action: "create" | "update" | "delete",
  body: (actorId: string) => Promise<StaffActionState>,
): Promise<StaffActionState> {
  try {
    const actor = await requireCan(action, "users");
    return await body(actor.id);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { error: "Only a super admin can manage staff accounts." };
    }
    throw error;
  }
}

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

/** Create a staff account with an initial password set by the super admin. */
export async function createStaffAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  return withPermission("create", async (actorId) => {
    const parsed = createSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      role: formData.get("role"),
      password: formData.get("password"),
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Check the details." };
    }

    const { name, email, role, password } = parsed.data;

    const invalidPassword = passwordError(email, password);
    if (invalidPassword) return { error: invalidPassword };

    const passwordHash = await hashPassword(password);

    let created: { id: string };
    try {
      created = await createStaffAccount({ name, email, passwordHash, role });
    } catch (error) {
      // The unique index on email is the duplicate check — a select-then-insert
      // would race with a second super admin adding the same person.
      const message = error instanceof Error ? error.message : "";
      if (/unique|duplicate/i.test(message)) {
        return { error: "An account with that email already exists." };
      }
      throw error;
    }

    await writeAuditEntry({
      userId: actorId,
      action: "user.created",
      entityType: "users",
      entityId: created.id,
      // Role and email only. Never the password or its hash.
      metadata: { email, role },
    });

    revalidatePath("/admin/users");
    return { message: `Created ${email}. Share the password with them directly.` };
  });
}

/** Change a staff account's role. */
export async function changeRoleAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  return withPermission("update", async (actorId) => {
    const parsed = roleSchema.safeParse({
      userId: formData.get("userId"),
      role: formData.get("role"),
    });

    if (!parsed.success) return { error: "That is not a valid role." };

    const context = await contextFor(actorId, parsed.data.userId);
    if (!context) return { error: "That account no longer exists." };

    const guard = canChangeRole(context, parsed.data.role);
    if (!guard.ok) return { error: guard.reason };

    await setStaffRole(parsed.data.userId, parsed.data.role);

    await writeAuditEntry({
      userId: actorId,
      action: "user.role_changed",
      entityType: "users",
      entityId: parsed.data.userId,
      metadata: { from: context.targetRole, to: parsed.data.role },
    });

    revalidatePath("/admin/users");
    return { message: "Role updated." };
  });
}

/** Deactivate an account. Soft delete — the audit trail keeps resolving. */
export async function deactivateStaffAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  return withPermission("delete", async (actorId) => {
    const parsed = idSchema.safeParse({ userId: formData.get("userId") });
    if (!parsed.success) return { error: "That account no longer exists." };

    const context = await contextFor(actorId, parsed.data.userId);
    if (!context) return { error: "That account no longer exists." };

    const guard = canDeactivate(context);
    if (!guard.ok) return { error: guard.reason };

    await deactivateStaffAccount(parsed.data.userId);

    await writeAuditEntry({
      userId: actorId,
      action: "user.deactivated",
      entityType: "users",
      entityId: parsed.data.userId,
      metadata: { role: context.targetRole },
    });

    revalidatePath("/admin/users");
    return { message: "Account deactivated. They can no longer sign in." };
  });
}

/** Reactivate a deactivated account. */
export async function reactivateStaffAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  return withPermission("update", async (actorId) => {
    const parsed = idSchema.safeParse({ userId: formData.get("userId") });
    if (!parsed.success) return { error: "That account no longer exists." };

    await reactivateStaffAccount(parsed.data.userId);

    await writeAuditEntry({
      userId: actorId,
      action: "user.reactivated",
      entityType: "users",
      entityId: parsed.data.userId,
    });

    revalidatePath("/admin/users");
    return { message: "Account reactivated." };
  });
}

/** Clear a lockout before it expires on its own, without changing the password. */
export async function unlockStaffAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  return withPermission("update", async (actorId) => {
    const parsed = idSchema.safeParse({ userId: formData.get("userId") });
    if (!parsed.success) return { error: "That account no longer exists." };

    await unlockStaffAccount(parsed.data.userId);

    await writeAuditEntry({
      userId: actorId,
      action: "user.unlocked",
      entityType: "users",
      entityId: parsed.data.userId,
    });

    revalidatePath("/admin/users");
    return { message: "Lockout cleared." };
  });
}

/**
 * Set a new password for someone else.
 *
 * There is no self-service reset — no email provider is configured
 * (`RESEND_ENABLED=false` must keep working, per CLAUDE.md), and a reset link
 * that cannot be delivered is worse than none. A super admin sets the password
 * and passes it on directly.
 */
export async function resetPasswordAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  return withPermission("update", async (actorId) => {
    const parsed = passwordSchema.safeParse({
      userId: formData.get("userId"),
      password: formData.get("password"),
    });

    if (!parsed.success) return { error: "Enter a new password." };

    const target = await getUserById(parsed.data.userId);
    if (!target) return { error: "That account no longer exists." };

    const invalidPassword = passwordError(target.email, parsed.data.password);
    if (invalidPassword) return { error: invalidPassword };

    await updatePasswordHash(
      parsed.data.userId,
      await hashPassword(parsed.data.password),
    );
    await unlockStaffAccount(parsed.data.userId);

    await writeAuditEntry({
      userId: actorId,
      action: "user.password_reset",
      entityType: "users",
      entityId: parsed.data.userId,
    });

    revalidatePath("/admin/users");
    return { message: "Password updated. Share it with them directly." };
  });
}

/**
 * Single entry point for the per-row controls in the staff list.
 *
 * Each row has four things it can do, and one dispatcher means one
 * `useActionState` and one `aria-live` region per row rather than four of each —
 * so a screen reader hears one clear result instead of four regions competing to
 * announce.
 *
 * The intent is validated against a closed list, and each branch delegates to
 * the action that already does its own permission check. This adds a
 * convenience, not a shortcut past anything.
 */
export async function staffRowAction(
  prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const intent = formData.get("intent");

  switch (intent) {
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
      return { error: "Unknown action." };
  }
}
