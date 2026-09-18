import Link from "next/link";
import type { Metadata } from "next";

import { can, canOnRow, type Action, type Resource } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";

/**
 * Admin overview.
 *
 * Deliberately thin. It says who you are signed in as and what you may do,
 * which is the one thing a role-based panel should never leave someone guessing
 * about — the alternative is discovering your permissions by clicking something
 * and getting a 403.
 */

export const metadata: Metadata = {
  title: "Overview",
  robots: { index: false, follow: false, nocache: true },
};

type Access = "allowed" | "own" | "denied";

const ACCESS_TEXT: Record<Access, string> = {
  allowed: "Allowed",
  own: "Only items you created",
  denied: "Not permitted",
};

export default async function AdminOverviewPage() {
  const user = await requireAdminUser();

  /**
   * `can()` says yes when *some* rows qualify; `canOnRow()` against an unowned
   * row says whether *every* row does. The gap between them is an ownership
   * limit, and it is stated rather than rounded up to "Allowed".
   */
  function access(action: Action, resource: Resource): Access {
    if (!can(user.role, action, resource)) return "denied";
    return canOnRow(user, action, resource, {}) ? "allowed" : "own";
  }

  const capabilities: { label: string; access: Access }[] = [
    { label: "Upload media", access: access("create", "media") },
    // A contributor may delete only files they uploaded, and no file records an
    // uploader until the `media` table exists (D3). The actions refuse the
    // delete outright, so say so rather than promising "your own files".
    {
      label: "Delete media",
      access: canOnRow(user, "delete", "media", {}) ? "allowed" : "denied",
    },
    { label: "Edit content", access: access("update", "blog_posts") },
    { label: "Publish content", access: access("publish", "blog_posts") },
    { label: "View patient enquiries", access: access("read", "bookings") },
    { label: "Delete patient data", access: access("delete", "bookings") },
    { label: "Manage staff accounts", access: access("update", "users") },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-primary">
        Signed in as {user.name || user.email}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your role is <strong className="text-primary">{user.roleLabel}</strong>.
      </p>

      <h2 className="mt-8 text-lg font-medium text-primary">What you can do</h2>
      <ul className="mt-4 space-y-2">
        {capabilities.map((capability) => (
          <li
            key={capability.label}
            className="flex items-center justify-between rounded-md bg-white px-4 py-3 text-sm"
          >
            <span className="text-primary">{capability.label}</span>
            {/* Text, not a colour or an icon alone — colour is never the sole
                state indicator (CLAUDE.md, accessibility gates). */}
            <span
              className={
                capability.access === "denied" ? "text-muted-foreground" : "text-primary"
              }
            >
              {ACCESS_TEXT[capability.access]}
            </span>
          </li>
        ))}
      </ul>

      {can(user.role, "read", "media") ? (
        <p className="mt-8 text-sm">
          <Link
            href="/admin/media"
            className="text-accent underline underline-offset-4 hover:no-underline"
          >
            Go to the media library
          </Link>
        </p>
      ) : null}
    </div>
  );
}
