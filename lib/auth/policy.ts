import type { userRoleEnum } from "@/lib/db/schema";

/**
 * Role-based access control for the admin panel.
 *
 * This module is the single source of truth for "who may do what". It is pure
 * data and pure functions — no database, no Auth.js, no React — so it can be
 * imported by a server action, a route handler, a server component and a test
 * without dragging any of those into each other. Every permission check in the
 * admin panel goes through `can()`; a component that decides for itself whether
 * to show a delete button is a bug, because the button is not the thing that
 * enforces anything.
 *
 * ## The roles
 *
 * The database enum is `admin | editor | contributor` (lib/db/schema.ts). Those
 * names predate the panel and are kept rather than migrated, so the mapping
 * onto how the team actually talks is written down here once:
 *
 * | enum          | the team calls this | may do                                    |
 * |---------------|---------------------|-------------------------------------------|
 * | `admin`       | super admin         | everything, including deleting sensitive   |
 * | `editor`      | admin               | edit everything, delete non-sensitive      |
 * | `contributor` | media personnel     | edit content and manage media, delete none |
 *
 * ## What "sensitive" means
 *
 * Four groups, chosen deliberately (see `SENSITIVE_RESOURCES`): patient-
 * submitted data, published clinical content, testimonials, and user accounts.
 * Only a super admin may delete any of them. The reasoning is not uniform —
 * patient data is an NDPR obligation, clinical content deletion takes a live
 * page off a hospital site, testimonials carry consent records, and user
 * accounts are the privilege-escalation surface — but the rule is, so it is
 * expressed once instead of four times.
 *
 * Deletes across the whole panel are soft (`deleted_at`), except UploadThing
 * objects, which are genuinely destroyed by the CDN and so are treated as a
 * non-sensitive resource an editor may remove.
 */

/** The database's `user_role` enum, as a type. */
export type Role = (typeof userRoleEnum.enumValues)[number];

/**
 * Everything the panel can act on. One entry per thing a permission can be
 * granted over, named for the table or store it maps to.
 */
export type Resource =
  // Content
  | "services"
  | "doctors"
  | "locations"
  | "hmos"
  | "testimonials"
  | "authors"
  | "blog_posts"
  | "awards"
  | "faqs"
  // Patient-submitted
  | "bookings"
  | "contact_submissions"
  | "corporate_enquiries"
  | "newsletter_subscribers"
  // Operational
  | "media"
  | "users"
  | "audit_log";

export type Action = "read" | "create" | "update" | "delete" | "publish";

/**
 * Resources only a super admin may delete.
 *
 * Deliberately broad. The failure mode of an over-restrictive list is an
 * annoyed editor asking someone else to press the button; the failure mode of
 * an under-restrictive one is a deleted patient record or a clinical page that
 * silently 404s for everyone who had the link.
 */
export const SENSITIVE_RESOURCES = new Set<Resource>([
  // Patient-submitted data — NDPR. Retention is a policy decision, not an
  // editor's judgement call.
  "bookings",
  "contact_submissions",
  "corporate_enquiries",
  "newsletter_subscribers",
  // Published clinical content — deleting one takes a live page off a hospital
  // site and breaks every inbound link to it.
  "services",
  "doctors",
  "locations",
  // Real patient quotes with consent recorded against them.
  "testimonials",
  // Privilege escalation.
  "users",
]);

/** Resources `contributor` (media personnel) may touch at all. */
const CONTRIBUTOR_RESOURCES = new Set<Resource>([
  "media",
  "blog_posts",
  "authors",
  "faqs",
  "awards",
]);

/** Read-only for everyone. Written by the system, never by a person. */
const APPEND_ONLY_RESOURCES = new Set<Resource>(["audit_log"]);

/**
 * May `role` perform `action` on `resource`?
 *
 * The only permission check in the codebase. Deny is the default: an unknown
 * role or an unlisted combination returns `false` rather than falling through
 * to a permissive branch.
 */
export function can(role: Role, action: Action, resource: Resource): boolean {
  // Nothing is ever written to the audit log through the panel — it would stop
  // being evidence the moment it were editable.
  if (APPEND_ONLY_RESOURCES.has(resource)) {
    return action === "read" && role === "admin";
  }

  switch (role) {
    case "admin":
      return true;

    case "editor":
      // Everything except deleting sensitive resources, and except touching
      // user accounts at all — an editor who can re-role an account can make
      // themselves a super admin.
      if (resource === "users") return action === "read";
      if (action === "delete") return !SENSITIVE_RESOURCES.has(resource);
      return true;

    case "contributor":
      if (!CONTRIBUTOR_RESOURCES.has(resource)) return false;
      // Media personnel curate the media library, including removing files
      // they uploaded by mistake. Everything else they can draft and edit, but
      // publishing and deleting are someone else's call.
      if (resource === "media") return action !== "publish";
      return action === "read" || action === "create" || action === "update";

    default:
      return false;
  }
}

/**
 * Throwing form of `can()`, for server actions and route handlers.
 *
 * The message names the action and resource but never the role or the user —
 * an authorisation error should not teach the caller what role would have
 * worked.
 */
export function assertCan(
  role: Role,
  action: Action,
  resource: Resource,
): void {
  if (!can(role, action, resource)) {
    throw new ForbiddenError(`Not permitted: ${action} on ${resource}.`);
  }
}

/** Thrown by `assertCan`. Mapped to a 403 by the admin route handlers. */
export class ForbiddenError extends Error {
  readonly status = 403 as const;

  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Human-readable role label for the admin UI. Never used for a check. */
export const ROLE_LABELS: Record<Role, string> = {
  admin: "Super admin",
  editor: "Admin",
  contributor: "Media",
};
