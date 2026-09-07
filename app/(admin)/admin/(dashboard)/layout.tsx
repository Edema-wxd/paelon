import { AdminNav, type AdminNavItem } from "@/components/admin/admin-nav";
import { can, type Action, type Resource } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";

/**
 * Protected admin shell. Everything under it requires a signed-in account.
 *
 * `/admin/login` is deliberately a sibling of this group, not a child, so the
 * login page is reachable signed out.
 *
 * This check is the first line, not the only one. A Next.js layout does not
 * re-run for a server action, so every action and route handler under here
 * calls `requireCan()` for itself — the nav below hides links a role cannot
 * use, but hiding a button has never stopped anyone from POSTing to it.
 */

/**
 * Only routes that exist. A nav link to an unbuilt page is a 404 with extra
 * steps, and in a back office it reads as something being broken rather than
 * unfinished.
 *
 * Still to build, each gated on the resource named beside it:
 *   /admin/content    content CRUD          blog_posts, services, locations
 *   /admin/enquiries  patient submissions   bookings
 *   /admin/users      staff accounts        users
 *   /admin/audit      audit log viewer      audit_log
 */
const NAV: Array<AdminNavItem & { action: Action; resource: Resource }> = [
  { href: "/admin", label: "Overview", action: "read", resource: "media" },
  { href: "/admin/media", label: "Media", action: "read", resource: "media" },
];

export default async function AdminDashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAdminUser();

  const items = NAV.filter((item) =>
    can(user.role, item.action, item.resource),
  ).map(({ href, label }) => ({ href, label }));

  return (
    <div className="mx-auto flex min-h-svh max-w-360 flex-col lg:flex-row">
      <aside className="shrink-0 border-b border-border bg-background lg:w-64 lg:border-r lg:border-b-0">
        <AdminNav items={items} user={user} />
      </aside>

      <main id="main" className="flex-1 bg-secondary px-4 py-8 lg:px-8">
        {children}
      </main>
    </div>
  );
}
