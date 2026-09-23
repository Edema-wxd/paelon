import { AdminNav, type AdminNavItem } from "@/components/admin/admin-nav";
import { can, type Action, type Resource } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";

/**
 * Protected admin shell. Everything under it requires a signed-in account.
 *
 * `/admin/login` is deliberately a sibling of this group, not a child, so the
 * login page is reachable signed out.
 *
 * Signed-out visitors are redirected from here, before the page runs, so they
 * always land back on `/admin` after signing in rather than on the page they
 * asked for. A layout cannot see the requested pathname; preserving it would
 * take middleware, which is not worth adding to a panel this size.
 * `requireAdminUser` and the login page both support a `?next=` path for when
 * one is available.
 *
 * This check is the first line, not the only one. A Next.js layout does not
 * re-run for a server action, so every action and route handler under here
 * runs its own check (`adminAction` or `requireCan()`) — the nav below hides
 * links a role cannot use, but hiding a button has never stopped anyone from
 * POSTing to it.
 */

/**
 * Every admin route in spec §8, in spec order.
 *
 * `built: false` keeps a route out of the nav. A link to an unbuilt page is a
 * 404 with extra steps, and in a back office it reads as something broken
 * rather than unfinished. Shipping a route means flipping its flag.
 *
 * `gate` is the permission the destination page itself checks. Omitted only for
 * the overview, which every signed-in role may see.
 */
const NAV: ReadonlyArray<
  AdminNavItem & { gate?: { action: Action; resource: Resource }; built: boolean }
> = [
  { href: "/admin", label: "Overview", built: true },
  { href: "/admin/bookings", label: "Bookings", gate: { action: "read", resource: "bookings" }, built: true },
  { href: "/admin/contact", label: "Contact", gate: { action: "read", resource: "contact_submissions" }, built: true },
  { href: "/admin/corporate-enquiries", label: "Corporate enquiries", gate: { action: "read", resource: "corporate_enquiries" }, built: true },
  { href: "/admin/services", label: "Services", gate: { action: "read", resource: "services" }, built: false },
  { href: "/admin/doctors", label: "Doctors", gate: { action: "read", resource: "doctors" }, built: false },
  { href: "/admin/locations", label: "Locations", gate: { action: "read", resource: "locations" }, built: false },
  { href: "/admin/hmos", label: "HMOs", gate: { action: "read", resource: "hmos" }, built: false },
  { href: "/admin/testimonials", label: "Testimonials", gate: { action: "read", resource: "testimonials" }, built: false },
  { href: "/admin/blog", label: "Blog", gate: { action: "read", resource: "blog_posts" }, built: false },
  { href: "/admin/awards", label: "Awards", gate: { action: "read", resource: "awards" }, built: true },
  { href: "/admin/faqs", label: "FAQs", gate: { action: "read", resource: "faqs" }, built: true },
  { href: "/admin/media", label: "Media", gate: { action: "read", resource: "media" }, built: true },
  { href: "/admin/users", label: "Staff", gate: { action: "read", resource: "users" }, built: true },
  { href: "/admin/audit", label: "Audit log", gate: { action: "read", resource: "audit_log" }, built: true },
  { href: "/admin/analytics", label: "Analytics", gate: { action: "read", resource: "analytics" }, built: false },
];

export default async function AdminDashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAdminUser();

  const items = NAV.filter(
    (item) =>
      item.built &&
      (!item.gate || can(user.role, item.gate.action, item.gate.resource)),
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
