import type { userRoleEnum } from "@/lib/db/schema";

/**
 * Role-based access control for the admin panel.
 *
 * This module is the single source of truth for "who may do what". It is pure
 * data and pure functions — no database, no Auth.js, no React — so it can be
 * imported by a server action, a route handler, a server component and a test
 * without dragging any of those into each other. Every permission check in the
 * admin panel goes through `can()` or `canOnRow()`; a component that decides
 * for itself whether to show a delete button is a bug, because the button is
 * not the thing that enforces anything.
 *
 * ## The roles (spec §8 Roles, decisions B1–B3)
 *
 * Labelled in the UI by their enum names (B1).
 *
 * | role          | content¹         | media                          | patient data² | users | audit log, analytics |
 * |---------------|------------------|--------------------------------|---------------|-------|----------------------|
 * | `admin`       | all              | all                            | all           | all   | read                 |
 * | `editor`      | all              | all                            | read, update  | none  | none                 |
 * | `contributor` | editorial³ only: | read, create,                  | none          | none  | none                 |
 * |               | read, create,    | update own, delete own         |               |       |                      |
 * |               | update own       |                                |               |       |                      |
 *
 * ¹ services, doctors, locations, hmos, testimonials, authors, blog_posts,
 *   awards, faqs. "All" means read, create, update, publish, delete.
 * ² bookings, contact_submissions, corporate_enquiries, newsletter_subscribers.
 * ³ blog_posts, authors, faqs, awards. Never publish, never delete.
 *
 * ## Two checks, because ownership is a fact about a row
 *
 * `can(role, action, resource)` answers "may this role ever do this to this
 * kind of thing". For a contributor's update it returns `true`, because some
 * rows qualify — that is what the nav and the dashboard need.
 *
 * `canOnRow(user, action, resource, row)` answers "may this user do this to
 * this row". It is `can()` plus the ownership rule, and it is the check every
 * write against an existing row must use. Calling `can()` alone before
 * updating a specific row lets a contributor edit anyone's post.
 *
 * ## What "sensitive" means
 *
 * Patient-submitted data and user accounts (`SENSITIVE_RESOURCES`). Only an
 * `admin` may delete them. Patient data is an NDPR obligation; user accounts
 * are the privilege-escalation surface. Content is deliberately not on the
 * list (B2 option C): an editor can already take a page off the site by
 * unpublishing it, and every content delete is soft, so blocking the delete
 * protects little.
 *
 * Deletes across the whole panel are soft (`deleted_at`), except UploadThing
 * objects, which the CDN genuinely destroys.
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
  | "audit_log"
  | "analytics";

export type Action = "read" | "create" | "update" | "delete" | "publish";

/** Resources only an `admin` may delete. */
export const SENSITIVE_RESOURCES = new Set<Resource>([
  // Patient-submitted data — NDPR. Retention is a policy decision, not an
  // editor's judgement call.
  "bookings",
  "contact_submissions",
  "corporate_enquiries",
  "newsletter_subscribers",
  // Privilege escalation.
  "users",
]);

/** Patient-submitted data. Editors work the queue; contributors never see it. */
const PATIENT_DATA_RESOURCES = new Set<Resource>([
  "bookings",
  "contact_submissions",
  "corporate_enquiries",
  "newsletter_subscribers",
]);

/** Resources a `contributor` may touch at all (B3 allow-list). */
const CONTRIBUTOR_RESOURCES = new Set<Resource>([
  "media",
  "blog_posts",
  "authors",
  "faqs",
  "awards",
]);

/**
 * Actions a `contributor` may take only on rows they own, per resource. An
 * action absent here is decided by `can()` alone.
 *
 * Media delete is owner-only rather than denied: the allow-list B3 kept let
 * media personnel remove files, and spec §8 applies ownership to media "likewise".
 */
const CONTRIBUTOR_OWNED_ACTIONS: Partial<Record<Resource, ReadonlySet<Action>>> = {
  blog_posts: new Set(["update"]),
  authors: new Set(["update"]),
  faqs: new Set(["update"]),
  awards: new Set(["update"]),
  media: new Set(["update", "delete"]),
};

/** Read-only for everyone. Written by the system, never by a person. */
const APPEND_ONLY_RESOURCES = new Set<Resource>(["audit_log"]);

/**
 * May `role` perform `action` on `resource`?
 *
 * Deny is the default: an unknown role or an unlisted combination returns
 * `false` rather than falling through to a permissive branch.
 *
 * For a `contributor` updating editorial content or updating/deleting media
 * this returns `true` because *some* rows qualify. Before acting on a specific
 * row, use `canOnRow()`.
 */
export function can(role: Role, action: Action, resource: Resource): boolean {
  // Nothing is ever written to the audit log through the panel — it would stop
  // being evidence the moment it were editable.
  if (APPEND_ONLY_RESOURCES.has(resource)) {
    return action === "read" && role === "admin";
  }

  // The Umami dashboard embed (spec §8 `/admin/analytics`). There is nothing to
  // write, and traffic figures are an admin-only view.
  if (resource === "analytics") {
    return action === "read" && role === "admin";
  }

  switch (role) {
    case "admin":
      return true;

    case "editor":
      // No staff list and no account changes (B2 A′) — an editor who can
      // re-role an account can make themselves an admin.
      if (resource === "users") return false;
      if (action === "delete") return !SENSITIVE_RESOURCES.has(resource);
      // Submissions arrive from public forms; staff read them and move them
      // through the workflow, they do not author or publish them.
      if (PATIENT_DATA_RESOURCES.has(resource)) {
        return action === "read" || action === "update";
      }
      return true;

    case "contributor":
      if (!CONTRIBUTOR_RESOURCES.has(resource)) return false;
      if (action === "read" || action === "create") return true;
      return CONTRIBUTOR_OWNED_ACTIONS[resource]?.has(action) ?? false;

    default:
      return false;
  }
}

/** The acting user, as far as ownership is concerned. */
export interface PolicyUser {
  id: string;
  role: Role;
}

/**
 * The ownership columns of a row, in Drizzle's camelCase. Content tables carry
 * `createdByUserId` (`created_by_user_id`); the `media` table carries
 * `uploadedBy` (`uploaded_by`). `null` means nobody owns it — a seeded row.
 */
export interface OwnedRow {
  createdByUserId?: string | null;
  uploadedBy?: string | null;
}

/** Which column records ownership, per resource. */
function ownerOf(resource: Resource, row: OwnedRow): string | null {
  const owner = resource === "media" ? row.uploadedBy : row.createdByUserId;
  return owner ?? null;
}

/**
 * May `user` perform `action` on this specific `row` of `resource`?
 *
 * `can()` plus the contributor ownership rule (spec §8 Roles, B3 option C). A
 * row with no recorded owner is owned by nobody, so a contributor may not
 * update it; nor may a user with an empty id, which guards against a
 * half-built session matching an unowned row.
 *
 * For `create` there is no row yet — pass the row being inserted, or `{}`; the
 * answer is `can()`'s either way.
 */
export function canOnRow(
  user: PolicyUser,
  action: Action,
  resource: Resource,
  row: OwnedRow,
): boolean {
  if (!can(user.role, action, resource)) return false;
  if (user.role !== "contributor") return true;
  if (!CONTRIBUTOR_OWNED_ACTIONS[resource]?.has(action)) return true;

  const owner = ownerOf(resource, row);
  return user.id !== "" && owner !== null && owner === user.id;
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

/** Throwing form of `canOnRow()`. Same message rules as `assertCan`. */
export function assertCanOnRow(
  user: PolicyUser,
  action: Action,
  resource: Resource,
  row: OwnedRow,
): void {
  if (!canOnRow(user, action, resource, row)) {
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

/** Role label for the admin UI — the enum name (B1). Never used for a check. */
export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  editor: "Editor",
  contributor: "Contributor",
};
