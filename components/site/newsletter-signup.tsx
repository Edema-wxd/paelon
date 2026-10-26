"use client";

import Link from "next/link";

import { useNewsletterForm } from "@/components/site/use-newsletter-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Newsletter signup ("Join the Paelon Community").
 *
 * Client component — it owns form state, via the hook it shares with the
 * homepage popup. The NDPR consent checkbox is not in the Figma export. It is
 * not optional: spec §14 requires explicit, never-pre-checked consent on every
 * form that collects personal data, and an email address qualifies.
 */
export function NewsletterSignup() {
  const { form, status, serverError, submit: onSubmit } = useNewsletterForm();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;


  return (
    <section
      aria-labelledby="newsletter-heading"
      className="bg-surface py-16 lg:py-24"
    >
      <div className="mx-auto max-w-360 px-4 sm:px-6 lg:px-25">
        <div className="rounded-xl bg-primary px-6 py-14 text-primary-foreground lg:px-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="newsletter-heading" className="text-3xl lg:text-4xl">
              Join the Paelon Community
            </h2>
            <p className="mt-6 text-base text-primary-foreground/70">
              Subscribe to receive monthly wellness tips, hospital updates, and
              health alerts straight to your inbox.
            </p>
          </div>

          <form
            noValidate
            onSubmit={handleSubmit(onSubmit)}
            className="mx-auto mt-10 max-w-2xl"
          >
            {/*
              Honeypot. Hidden from sighted users and from assistive tech, and
              never focusable, so no real person can fill it in — a non-empty
              value means a bot, and the server discards the submission while
              still returning success. Preferred over a CAPTCHA, which costs
              accessibility and performance (spec §12/§13).
            */}
            <div className="hidden" aria-hidden="true">
              <label htmlFor="newsletter-website">Leave this field empty</label>
              <input
                id="newsletter-website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                {...register("website")}
              />
            </div>
            <input type="hidden" {...register("formRenderedAt", { valueAsNumber: true })} />

            {/*
              A visible label, not a placeholder standing in for one — CLAUDE.md
              rules placeholder-as-label out, and a placeholder disappears the
              moment the field has content, taking the only labelling with it.

              The label sits above the whole input/button row rather than inside
              the flex item. Putting it above just the input pushed the input
              down and left the button floating half a line proud of it, and any
              fix for that (self-end, a magic top margin) breaks again as soon
              as the error message appears and changes the item's height.
            */}
            <label
              htmlFor="newsletter-email"
              className="block px-6 pb-2 text-sm text-primary-foreground"
            >
              Your email address
            </label>

            {/*
              DOM order is email → consent → submit: the order the form is
              filled in, and the order it tabs in, so the required consent box
              can never be reached after the button that submits it.

              Desktop lifts the button beside the input with explicit grid
              placement rather than flex `order`, matching the approach in
              not-found-content.tsx. Both sit in row 1, so `items-start` aligns
              their tops however tall the email field's error message makes it.
            */}
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              {/* min-w-0 lets the input shrink below its intrinsic width;
                  without it the row overflows the panel on narrow tablets. */}
              <div className="min-w-0 sm:col-start-1 sm:row-start-1">
                <Input
                  id="newsletter-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="name@example.com"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={
                    errors.email ? "newsletter-email-error" : undefined
                  }
                  className="h-15 rounded-full border-primary-foreground/50 bg-primary/70 px-6 text-base text-primary-foreground placeholder:text-primary-foreground/70"
                  {...register("email")}
                />
                {errors.email ? (
                  <p
                    id="newsletter-email-error"
                    className="mt-2 px-6 text-sm text-primary-foreground"
                  >
                    {errors.email.message}
                  </p>
                ) : null}
              </div>

              <div className="flex items-start gap-3 sm:col-span-2 sm:row-start-2">
                <input
                  id="newsletter-consent"
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0 accent-accent"
                  aria-invalid={Boolean(errors.consentNdpr)}
                  aria-describedby={
                    errors.consentNdpr ? "newsletter-consent-error" : undefined
                  }
                  {...register("consentNdpr")}
                />
                <div>
                  <label htmlFor="newsletter-consent" className="text-sm">
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
                    <p id="newsletter-consent-error" className="mt-1 text-sm">
                      {errors.consentNdpr.message}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* min-w, not a fixed w: at 200px "Subscribe Now" already fills
                  the pill to within a few pixels of its 32px padding, so any
                  wider fallback font — or the Neo Tech file when it lands —
                  pushes the label past the edge. Growing is safe; clipping is
                  not. */}
              <Button
                type="submit"
                variant="accent"
                size="pill"
                disabled={status === "submitting"}
                className="w-full sm:col-start-2 sm:row-start-1 sm:w-auto sm:min-w-50"
              >
                {status === "submitting" ? "Subscribing…" : "Subscribe Now"}
              </Button>
            </div>

            {/* Spec §12: form outcomes are announced, not just recoloured. */}
            <div aria-live="polite" className="mt-4 text-sm">
              {status === "success" ? (
                <p>
                  Thank you. Please check your inbox to confirm your
                  subscription.
                </p>
              ) : null}
              {status === "error" && serverError ? <p>{serverError}</p> : null}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
