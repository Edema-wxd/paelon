import Link from "next/link";
import type { Metadata } from "next";

import { can } from "@/lib/auth/policy";
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

export default async function AdminOverviewPage() {
  const user = await requireAdminUser();

  const capabilities = [
    { label: "Upload media", allowed: can(user.role, "create", "media") },
    { label: "Delete media", allowed: can(user.role, "delete", "media") },
    { label: "Edit content", allowed: can(user.role, "update", "blog_posts") },
    { label: "Publish content", allowed: can(user.role, "publish", "blog_posts") },
    { label: "View patient enquiries", allowed: can(user.role, "read", "bookings") },
    { label: "Delete patient data", allowed: can(user.role, "delete", "bookings") },
    { label: "Manage staff accounts", allowed: can(user.role, "update", "users") },
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
                capability.allowed ? "text-primary" : "text-muted-foreground"
              }
            >
              {capability.allowed ? "Allowed" : "Not permitted"}
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
