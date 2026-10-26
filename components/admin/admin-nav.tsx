"use client";

import {
  Award,
  BarChart3,
  Building2,
  CalendarCheck,
  CircleHelp,
  FileText,
  Image,
  Info,
  LayoutDashboard,
  MapPin,
  Menu,
  MessageSquare,
  MessageSquareQuote,
  PenLine,
  ScrollText,
  Settings,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { SignOutButton } from "@/components/admin/sign-out-button";
import type { AdminUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

/**
 * Admin sidebar.
 *
 * `groups` is filtered by the caller against `can()` — this component renders
 * what it is given and decides nothing. Hiding a link is a courtesy, not a
 * control: the destination enforces its own permission, so a hand-typed URL
 * gets a 403 rather than a page.
 *
 * A client component for two reasons only: the current page is marked from
 * `usePathname()`, and below `lg` the list collapses behind a Menu button so
 * twenty links do not sit between a phone user and the page they opened.
 * Icons arrive as keys rather than components, because a server layout cannot
 * hand a function to a client component.
 */

const ICONS = {
  overview: LayoutDashboard,
  bookings: CalendarCheck,
  contact: MessageSquare,
  corporate: Building2,
  services: Stethoscope,
  doctors: UserRound,
  locations: MapPin,
  hmos: ShieldCheck,
  testimonials: MessageSquareQuote,
  awards: Award,
  faqs: CircleHelp,
  about: Info,
  blog: FileText,
  authors: PenLine,
  media: Image,
  staff: Users,
  audit: ScrollText,
  analytics: BarChart3,
  settings: Settings,
} satisfies Record<string, LucideIcon>;

export type AdminNavIcon = keyof typeof ICONS;

export interface AdminNavItem {
  href: string;
  label: string;
  icon: AdminNavIcon;
  /** Items waiting in this queue. Omitted or zero renders no badge. */
  count?: number | null;
  /** Read aloud after the count, e.g. "new" → "45 new". */
  countLabel?: string;
}

export interface AdminNavGroup {
  /** Omitted for the ungrouped first item. */
  label?: string;
  items: AdminNavItem[];
}

/** `/admin` matches only itself; every other item owns its subtree. */
function isCurrent(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({
  groups,
  user,
}: {
  groups: AdminNavGroup[];
  user: AdminUser;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const listId = useId();

  // Following a link is the end of the menu's job on a phone.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex flex-col lg:h-full">
      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:pt-6 lg:pb-5">
        <Link
          href="/admin"
          className="flex items-baseline gap-2 rounded-md text-primary"
        >
          <span className="text-lg font-bold tracking-tight">Paelon</span>
          <span className="text-sm text-muted-foreground">Admin</span>
        </Link>

        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-primary transition-transform duration-150 ease-out active:scale-[0.97] lg:hidden"
        >
          {open ? <X aria-hidden className="size-4" /> : <Menu aria-hidden className="size-4" />}
          Menu
        </button>
      </div>

      <div
        id={listId}
        className={cn(
          // Below lg the bar is sticky, so an open menu taller than the screen
          // must scroll inside itself or its last links are unreachable.
          "max-h-[calc(100svh-3.5rem)] flex-col overflow-y-auto border-t border-border",
          "lg:flex lg:max-h-none lg:min-h-0 lg:flex-1 lg:overflow-visible lg:border-t-0",
          open ? "flex" : "hidden",
        )}
      >
        <nav aria-label="Admin" className="px-3 pb-4 lg:flex-1 lg:overflow-y-auto">
          {groups.map((group, index) => (
            <div key={group.label ?? index} className={index > 0 ? "mt-4" : "mt-3 lg:mt-0"}>
              {/* A labelled list, not a heading: the sidebar precedes each
                  page's h1, and h2s here would break the heading order. */}
              {group.label ? (
                <p
                  id={`${listId}-${index}`}
                  className="px-2 pb-1.5 text-xs font-medium text-muted-foreground"
                >
                  {group.label}
                </p>
              ) : null}
              <ul
                className="space-y-px"
                aria-labelledby={group.label ? `${listId}-${index}` : undefined}
              >
                {group.items.map((item) => (
                  <li key={item.href}>
                    <NavLink item={item} current={isCurrent(pathname, item.href)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex items-center justify-between gap-2 border-t border-border py-3 pr-3 pl-5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-primary">
              {user.name || user.email}
            </p>
            <p className="text-xs text-muted-foreground">{user.roleLabel}</p>
          </div>
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}

function NavLink({ item, current }: { item: AdminNavItem; current: boolean }) {
  const Icon = ICONS[item.icon];
  const count = item.count ?? 0;

  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2 py-2.5 text-sm lg:py-1.5 transition-colors duration-150",
        current
          ? "bg-surface font-medium text-primary shadow-sm"
          : "text-primary/80 hover:bg-surface/60 hover:text-primary",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "size-4 shrink-0",
          current ? "text-accent" : "text-muted-foreground group-hover:text-primary",
        )}
      />
      <span className="flex-1 truncate">{item.label}</span>
      {count > 0 ? (
        <span className="rounded-full bg-accent px-1.5 py-px text-xs font-medium text-accent-foreground tabular-nums">
          {count > 99 ? "99+" : count}
          <span className="sr-only"> {item.countLabel ?? "waiting"}</span>
        </span>
      ) : null}
    </Link>
  );
}
