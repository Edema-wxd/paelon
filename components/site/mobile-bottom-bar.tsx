import { CalendarPlus, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";

import { getPrimaryLocation, toTelHref } from "@/lib/content";

/**
 * Sticky mobile bar: Call · WhatsApp · Book (spec §6). Always visible below
 * the `lg` breakpoint; hidden on desktop where the header carries the same
 * actions.
 *
 * Absent from the Figma export, which is desktop-only — designed fresh here.
 */
export function MobileBottomBar() {
  const location = getPrimaryLocation();
  if (!location) return null;

  // TODO(seed): no WhatsApp number is seeded. Spec §10 wants a deep link with
  // a pre-populated greeting; the tile links to /contact until the number and
  // the WhatsApp Business provider are confirmed (spec §18).
  const whatsappHref = location.whatsapp
    ? `https://wa.me/${location.whatsapp.replace(/[^\d]/g, "")}`
    : "/contact";

  const tile =
    "flex flex-1 flex-col items-center justify-center gap-1 py-3 text-xs font-medium";

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface lg:hidden">
      <nav aria-label="Quick actions" className="mx-auto flex max-w-md">
        <a
          href={toTelHref(location.emergency_line)}
          className={`${tile} text-accent`}
        >
          <Phone className="size-5" aria-hidden />
          Call
        </a>
        <Link href={whatsappHref} className={`${tile} text-primary`}>
          <MessageCircle className="size-5" aria-hidden />
          WhatsApp
        </Link>
        <Link
          href="/book"
          className={`${tile} bg-primary text-primary-foreground`}
        >
          <CalendarPlus className="size-5" aria-hidden />
          Book
        </Link>
      </nav>
    </div>
  );
}
