import Link from "next/link";

import { SignOutButton } from "@/components/admin/sign-out-button";
import type { AdminUser } from "@/lib/auth/session";

/**
 * Admin sidebar.
 *
 * `items` is filtered by the caller against `can()` — this component renders
 * what it is given and decides nothing. Hiding a link is a courtesy, not a
 * control: the destination enforces its own permission, so a hand-typed URL
 * gets a 403 rather than a page.
 */

export interface AdminNavItem {
  href: string;
  label: string;
}

export function AdminNav({
  items,
  user,
}: {
  items: AdminNavItem[];
  user: AdminUser;
}) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div>
        <Link
          href="/admin"
          className="block rounded-md text-lg font-bold text-primary"
        >
          Paelon Admin
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">
          {user.name || user.email} · {user.roleLabel}
        </p>
      </div>

      <nav aria-label="Admin" className="flex-1">
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded-md px-3 py-2 text-sm text-primary transition-colors hover:bg-secondary"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-border pt-2">
        <SignOutButton />
      </div>
    </div>
  );
}
