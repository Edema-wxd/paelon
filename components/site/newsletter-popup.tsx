"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { isSnoozed } from "@/components/site/newsletter-popup-snooze";

/**
 * The dialog, its form and its copy, downloaded only when the popup is about to
 * open. They used to be in the first load of every page with the popup (spec
 * §13 initial JS budget), and on `/blog` they were what pulled in
 * react-hook-form, though most visits never scroll far enough to see it.
 *
 * `React.lazy` rather than `next/dynamic`: the dialog only ever renders after a
 * client-side state change, so there is nothing for SSR to do, and
 * `next/dynamic`'s loader would add its own runtime to the first load of every
 * page, cancelling out most of the saving.
 */
const NewsletterPopupDialog = lazy(() =>
  import("@/components/site/newsletter-popup-dialog").then((m) => ({
    default: m.NewsletterPopupDialog,
  })),
);

const DEFAULT_COPY = {
  heading: "Join the Paelon Community",
  body: "Monthly wellness tips, hospital updates, and health alerts, straight to your inbox.",
};

/**
 * Newsletter popup, for the homepage and the blog.
 *
 * Opens **once the visitor reaches the end of the page**, not on load: an
 * invisible sentinel placed after the inline signup panel is observed, and the
 * dialog opens when it scrolls into view. Someone who scrolled that far has
 * read the page and passed the inline form, which is a better moment to ask
 * than the first second of a visit — and nothing is shown above the fold, so
 * LCP and CLS are untouched.
 *
 * This component is only the sentinel and the observer. The dialog itself
 * (`newsletter-popup-dialog.tsx`) is fetched when the sentinel comes into
 * view, so it costs the first load nothing. Dismissing, or subscribing,
 * snoozes it for 30 days.
 */
export function NewsletterPopup({
  heading = DEFAULT_COPY.heading,
  body = DEFAULT_COPY.body,
}: {
  /** Overrides the default copy, so each surface can speak to why the visitor
      is there. */
  heading?: string;
  body?: string;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || isSnoozed()) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        setOpen(true);
      },
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
      {open ? (
        // No fallback: nothing is on screen until the dialog itself opens.
        <Suspense fallback={null}>
          <NewsletterPopupDialog heading={heading} body={body} />
        </Suspense>
      ) : null}
    </>
  );
}
