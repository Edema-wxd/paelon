import {
  AdminNav,
  type AdminNavGroup,
  type AdminNavItem,
} from "@/components/admin/admin-nav";
import { can, type Action, type Resource } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import { getInboxCounts, type InboxCounts } from "@/lib/db/queries/dashboard";

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
 * Every admin route in spec §8, grouped by what the person is there to do.
 *
 * Patients first, because those queues are the only part of the panel where
 * something is waiting on a reply; then the public website's content, the blog
 * and its library, and the admin-only operational screens last.
 *
 * `built: false` keeps a route out of the nav. A link to an unbuilt page is a
 * 404 with extra steps, and in a back office it reads as something broken
 * rather than unfinished. Shipping a route means flipping its flag.
 *
 * `gate` is the permission the destination page itself checks. Omitted only for
 * the overview, which every signed-in role may see.
 */
type NavEntry = Omit<AdminNavItem, "count"> & {
  gate?: { action: Action; resource: Resource };
  built: boolean;
  /** Which inbox count to badge this item with. */
  badge?: keyof InboxCounts;
};

const NAV: ReadonlyArray<{ label?: string; items: NavEntry[] }> = [
  {
    items: [{ href: "/admin", label: "Overview", icon: "overview", built: true }],
  },
  {
    label: "Patients",
    items: [
      { href: "/admin/bookings", label: "Bookings", icon: "bookings", gate: { action: "read", resource: "bookings" }, built: true, badge: "newBookings", countLabel: "new" },
      { href: "/admin/contact", label: "Contact", icon: "contact", gate: { action: "read", resource: "contact_submissions" }, built: true, badge: "openContact", countLabel: "open" },
      { href: "/admin/corporate-enquiries", label: "Corporate enquiries", icon: "corporate", gate: { action: "read", resource: "corporate_enquiries" }, built: true, badge: "openCorporate", countLabel: "open" },
    ],
  },
  {
    label: "Website",
    items: [
      { href: "/admin/services", label: "Services", icon: "services", gate: { action: "read", resource: "services" }, built: true },
      { href: "/admin/doctors", label: "Doctors", icon: "doctors", gate: { action: "read", resource: "doctors" }, built: true },
      { href: "/admin/locations", label: "Locations", icon: "locations", gate: { action: "read", resource: "locations" }, built: true },
      { href: "/admin/hmos", label: "HMOs", icon: "hmos", gate: { action: "read", resource: "hmos" }, built: true },
      { href: "/admin/testimonials", label: "Testimonials", icon: "testimonials", gate: { action: "read", resource: "testimonials" }, built: true },
      { href: "/admin/awards", label: "Awards", icon: "awards", gate: { action: "read", resource: "awards" }, built: true },
      { href: "/admin/faqs", label: "FAQs", icon: "faqs", gate: { action: "read", resource: "faqs" }, built: true },
      // The About page's prose, which was content/about.json until migration
      // 0005. Last in the group because the sections of /about that are rows —
      // the team, the awards — are edited above it.
      { href: "/admin/about", label: "About page", icon: "about", gate: { action: "read", resource: "about_content" }, built: true },
    ],
  },
  {
    label: "Blog & media",
    items: [
      { href: "/admin/blog", label: "Posts", icon: "blog", gate: { action: "read", resource: "blog_posts" }, built: true },
      // Not in §8's route list, which names `/admin/blog` alone. `authors` is
      // its own content type in §5 with its own permission, every post
      // requires one, and there is nowhere else to create one — so the screen
      // exists and the nav says so. Raised as a spec gap rather than left
      // implicit.
      { href: "/admin/authors", label: "Authors", icon: "authors", gate: { action: "read", resource: "authors" }, built: true },
      // Shared by every content type, not only the blog — grouped here because
      // posts are where most uploads start.
      { href: "/admin/media", label: "Media library", icon: "media", gate: { action: "read", resource: "media" }, built: true },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/admin/users", label: "Staff", icon: "staff", gate: { action: "read", resource: "users" }, built: true },
      { href: "/admin/audit", label: "Audit log", icon: "audit", gate: { action: "read", resource: "audit_log" }, built: true },
      { href: "/admin/analytics", label: "Analytics", icon: "analytics", gate: { action: "read", resource: "analytics" }, built: true },
      { href: "/admin/settings", label: "Settings", icon: "settings", gate: { action: "read", resource: "site_settings" }, built: true },
    ],
  },
];

export default async function AdminDashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAdminUser();

  const counts = await getInboxCounts(
    can(user.role, "read", "bookings"),
    can(user.role, "read", "contact_submissions"),
    can(user.role, "read", "corporate_enquiries"),
  );

  const groups: AdminNavGroup[] = NAV.map((group) => ({
    label: group.label,
    items: group.items
      .filter(
        (item) =>
          item.built &&
          (!item.gate || can(user.role, item.gate.action, item.gate.resource)),
      )
      .map(({ href, label, icon, badge, countLabel }) => ({
        href,
        label,
        icon,
        countLabel,
        count: badge ? counts[badge] : null,
      })),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="mx-auto flex min-h-svh max-w-360 flex-col lg:flex-row">
      {/* Sticky on desktop with its own scroll, so the nav and sign-out stay
          in reach on a long list page. `z-10` keeps it above the page on
          mobile, where it sits on top as a collapsible bar. */}
      <aside className="sticky top-0 z-10 shrink-0 border-b border-border bg-background lg:h-svh lg:w-60 lg:border-r lg:border-b-0">
        <AdminNav groups={groups} user={user} />
      </aside>

      <main id="main" className="min-w-0 flex-1 bg-secondary px-4 py-8 lg:px-10">
        {children}
      </main>
    </div>
  );
}
