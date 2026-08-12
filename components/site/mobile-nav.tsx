"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { NAV_ITEMS } from "@/components/site/nav-items";
import { Button } from "@/components/ui/button";

/**
 * Mobile navigation disclosure.
 *
 * Focus is moved into the panel on open, trapped while it is open, and
 * returned to the trigger on close (spec §12). Escape and a backdrop press
 * both close it.
 *
 * The overlay is portalled to `document.body` rather than rendered in place.
 * This component sits inside the sticky `<header>`, which has its own z-index
 * and therefore its own stacking context — a nested `z-50` could not paint
 * above the `z-40` mobile bottom bar, leaving the bar visible and clickable
 * over an open menu. A portal escapes that stacking context entirely.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("a, button")?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>("a[href], button");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon-lg"
        className="lg:hidden"
        aria-expanded={open}
        // Only advertise aria-controls while the panel is mounted; the id does
        // not exist in the DOM when the menu is closed.
        aria-controls={open ? panelId : undefined}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Menu aria-hidden />
      </Button>

      {open
        ? createPortal(
            <div className="fixed inset-0 z-50 lg:hidden">
              <button
                type="button"
                aria-label="Close menu"
                className="absolute inset-0 bg-brand-navy/50"
                onClick={close}
              />
              <div
                ref={panelRef}
                id={panelId}
                className="absolute inset-y-0 right-0 flex w-full max-w-80 flex-col gap-2 bg-background p-6 shadow-lg"
              >
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    aria-label="Close menu"
                    onClick={close}
                  >
                    <X aria-hidden />
                  </Button>
                </div>

                <nav aria-label="Mobile">
                  <ul className="flex flex-col gap-1">
                    {NAV_ITEMS.map((item) => (
                      <li key={item.label}>
                        <Link
                          href={item.href}
                          onClick={close}
                          className="block rounded-md px-3 py-3 text-lg text-primary hover:bg-muted"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                    <li>
                      <Link
                        href="/locations"
                        onClick={close}
                        className="block rounded-md px-3 py-3 text-lg text-primary hover:bg-muted"
                      >
                        Find a Branch
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/for-corporates"
                        onClick={close}
                        className="block rounded-md px-3 py-3 text-lg text-primary hover:bg-muted"
                      >
                        For Corporates
                      </Link>
                    </li>
                  </ul>
                </nav>

                {/* mt-auto anchors the CTA to the bottom of the panel rather
                    than leaving it stranded under the list with ~700px of
                    dead space beneath it. */}
                <Button
                  asChild
                  variant="accent"
                  size="pill"
                  className="mt-auto"
                >
                  <Link href="/book" onClick={close}>
                    Book Appointment
                  </Link>
                </Button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
