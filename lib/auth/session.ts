import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import {
  assertCan,
  can,
  ROLE_LABELS,
  type Action,
  type Resource,
  type Role,
} from "@/lib/auth/policy";

/**
 * The join between "who are you" (lib/auth/config.ts) and "may you do this"
 * (lib/auth/policy.ts).
 *
 * Every admin server component, server action and route handler starts with one
 * of these. They are not a convenience wrapper — they are where authorisation is
 * actually enforced. A layout check alone protects nothing: a server action is
 * a POST endpoint that any authenticated user can call directly, whatever the
 * UI chose to render for them.
 */

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** The role's UI label. Display only. */
  roleLabel: string;
}

/** The signed-in admin, or `null`. Never redirects — for code that has a fallback. */
export async function getAdminUser(): Promise<AdminUser | null> {
  const session = await auth();
  const user = session?.user;

  // `role` is dropped by the jwt callback when the account has been locked or
  // soft-deleted since sign-in, so its absence is a revoked session, not a bug.
  if (!user?.id || !user.role) return null;

  return {
    id: user.id,
    name: user.name ?? "",
    email: user.email ?? "",
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] ?? user.role,
  };
}

/**
 * The signed-in admin, or a redirect to the login page.
 *
 * `next` carries where they were going so the login can send them back, and is
 * a path rather than a URL — an open redirect on an admin login is how a
 * phishing page gets to wear your domain.
 */
export async function requireAdminUser(next?: string): Promise<AdminUser> {
  const user = await getAdminUser();
  if (user) return user;

  const safeNext = next && next.startsWith("/") && !next.startsWith("//")
    ? `?next=${encodeURIComponent(next)}`
    : "";

  redirect(`/admin/login${safeNext}`);
}

/**
 * The signed-in admin, guaranteed to hold `action` on `resource`.
 *
 * Throws `ForbiddenError` rather than redirecting when signed in but not
 * permitted — a 403 is the truthful answer, and bouncing someone to a login
 * page they are already past is a confusing way to say "no".
 */
export async function requireCan(
  action: Action,
  resource: Resource,
): Promise<AdminUser> {
  const user = await requireAdminUser();
  assertCan(user.role, action, resource);
  return user;
}

/** Non-throwing check, for deciding whether to render a control. */
export async function currentUserCan(
  action: Action,
  resource: Resource,
): Promise<boolean> {
  const user = await getAdminUser();
  return user ? can(user.role, action, resource) : false;
}
