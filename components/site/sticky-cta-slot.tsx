"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Hides the sticky mobile CTA inside the booking flow (CLAUDE.md, conversion
 * baseline item 5: "Hidden inside `/book`").
 *
 * A bar offering "Book" on top of the booking form is noise at best; at worst
 * it sits over the Continue button on a small screen and costs the submission.
 *
 * A client wrapper rather than a check in the layout, because a server layout
 * has no pathname. The bar itself stays a server component and is passed
 * through as `children`, so nothing it renders — or the content getters it
 * calls — crosses into the client bundle.
 */
export function StickyCtaSlot({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/book" || pathname.startsWith("/book/")) return null;

  return <>{children}</>;
}
