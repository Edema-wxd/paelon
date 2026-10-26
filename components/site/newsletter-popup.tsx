"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";

import { useNewsletterForm } from "@/components/site/use-newsletter-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SNOOZE_KEY = "paelon:newsletter-popup";
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

/** Browser storage is a convenience here, never a dependency: it throws in
    private windows and with site data blocked, and the popup then simply shows
    once per page load. */
function isSnoozed(): boolean {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY);
    return raw !== null && Date.now() - Number(raw) < SNOOZE_MS;
  } catch {
    return false;
  }
}

function snooze() {
  try {
    window.localStorage.setItem(SNOOZE_KEY, String(Date.now()));
  } catch {
    // Nothing to do — see isSnoozed.
  }
}

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
 * A native `<dialog>` opened with `showModal()`, so focus is trapped, Escape
 * closes it, the page behind is inert and focus returns to where it was —
 * without a library. Dismissing, or subscribing, snoozes it for 30 days.
 * Shares its form logic with the inline panel (`useNewsletterForm`), so the
 * NDPR consent box is never pre-ticked here either.
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
  const dialogRef = useRef<HTMLDialogElement>(null);

  const { form, status, serverError, submit } = useNewsletterForm(snooze);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const dialog = dialogRef.current;
    if (!sentinel || !dialog || isSnoozed()) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        if (!dialog.open) dialog.showModal();
      },
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const close = useCallback(() => dialogRef.current?.close(), []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
      <dialog
        ref={dialogRef}
        aria-labelledby="newsletter-popup-heading"
        onClose={snooze}
        // A click on the backdrop lands on the dialog element itself, never on
        // its content, which is wrapped in a padded child.
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl bg-background p-0 text-foreground backdrop:bg-primary/60"
      >
        <div className="relative px-6 py-10 sm:px-10">
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-full text-primary outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <X className="size-5" aria-hidden />
          </button>

          <h2 id="newsletter-popup-heading" className="pr-8 text-2xl text-primary">
            {heading}
          </h2>
          <p className="mt-3 text-base">{body}</p>

          {status === "success" ? (
            <div aria-live="polite" className="mt-6">
              <p className="text-base">
                Thank you. Please check your inbox to confirm your subscription.
              </p>
              <Button
                type="button"
                variant="outline"
                size="pill"
                onClick={close}
                className="mt-6 w-full"
              >
                Close
              </Button>
            </div>
          ) : (
            <form noValidate onSubmit={handleSubmit(submit)} className="mt-6">
              {/* Honeypot — see newsletter-signup.tsx. */}
              <div className="hidden" aria-hidden="true">
                <label htmlFor="newsletter-popup-website">
                  Leave this field empty
                </label>
                <input
                  id="newsletter-popup-website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  {...register("website")}
                />
              </div>
              <input
                type="hidden"
                {...register("formRenderedAt", { valueAsNumber: true })}
              />

              <label htmlFor="newsletter-popup-email" className="block pb-2 text-sm">
                Your email address
              </label>
              <Input
                id="newsletter-popup-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="name@example.com"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={
                  errors.email ? "newsletter-popup-email-error" : undefined
                }
                className="h-14 rounded-full px-6 text-base"
                {...register("email")}
              />
              {errors.email ? (
                <p
                  id="newsletter-popup-email-error"
                  className="mt-2 px-2 text-sm text-destructive"
                >
                  {errors.email.message}
                </p>
              ) : null}

              <div className="mt-4 flex items-start gap-3">
                <input
                  id="newsletter-popup-consent"
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0 accent-accent"
                  aria-invalid={Boolean(errors.consentNdpr)}
                  aria-describedby={
                    errors.consentNdpr
                      ? "newsletter-popup-consent-error"
                      : undefined
                  }
                  {...register("consentNdpr")}
                />
                <div>
                  <label htmlFor="newsletter-popup-consent" className="text-sm">
                    I agree that Paelon Memorial Hospital may email me updates,
                    and I have read the{" "}
                    <Link
                      href="/privacy"
                      className="underline underline-offset-4 hover:no-underline"
                    >
                      privacy policy
                    </Link>
                    .
                  </label>
                  {errors.consentNdpr ? (
                    <p
                      id="newsletter-popup-consent-error"
                      className="mt-1 text-sm text-destructive"
                    >
                      {errors.consentNdpr.message}
                    </p>
                  ) : null}
                </div>
              </div>

              <Button
                type="submit"
                variant="accent"
                size="pill"
                disabled={status === "submitting"}
                className="mt-6 w-full"
              >
                {status === "submitting" ? "Subscribing…" : "Subscribe Now"}
              </Button>

              <div aria-live="polite" className="mt-3 text-sm text-destructive">
                {status === "error" && serverError ? <p>{serverError}</p> : null}
              </div>

              <button
                type="button"
                onClick={close}
                className="mt-2 w-full rounded-md py-3 text-sm text-primary underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                No thanks
              </button>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
