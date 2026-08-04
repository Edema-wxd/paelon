"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  newsletterSchema,
  type NewsletterInput,
} from "@/lib/validation/newsletter";

type Status = "idle" | "submitting" | "success" | "error";

/**
 * Newsletter signup ("Join the Paelon Community").
 *
 * Client component — it owns form state. Validation is the shared Zod schema,
 * run here for UX and again in the route handler for truth.
 *
 * The NDPR consent checkbox is not in the Figma export. It is not optional:
 * spec §14 requires explicit, never-pre-checked consent on every form that
 * collects personal data, and an email address qualifies.
 */
export function NewsletterSignup() {
  const [status, setStatus] = useState<Status>("idle");
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewsletterInput>({
    resolver: zodResolver(newsletterSchema),
    defaultValues: { email: "", consent_ndpr: false as unknown as true },
  });

  async function onSubmit(values: NewsletterInput) {
    setStatus("submitting");
    setServerError(null);

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message =
          body &&
          typeof body === "object" &&
          "message" in body &&
          typeof body.message === "string"
            ? body.message
            : "We could not sign you up just now. Please try again.";
        setServerError(message);
        setStatus("error");
        return;
      }

      reset();
      setStatus("success");
    } catch {
      setServerError("We could not reach the server. Please try again.");
      setStatus("error");
    }
  }

  return (
    <section
      aria-labelledby="newsletter-heading"
      className="bg-background py-16 lg:py-24"
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
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex-1">
                <label htmlFor="newsletter-email" className="sr-only">
                  Your email address
                </label>
                <Input
                  id="newsletter-email"
                  type="email"
                  autoComplete="email"
                  placeholder="Your email address"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={
                    errors.email ? "newsletter-email-error" : undefined
                  }
                  className="h-15 rounded-full border-primary-foreground/50 bg-primary/70 px-6 text-sm text-primary-foreground placeholder:text-primary-foreground/80"
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

              <Button
                type="submit"
                variant="accent"
                size="pill"
                disabled={status === "submitting"}
                className="w-full sm:w-50"
              >
                {status === "submitting" ? "Subscribing…" : "Subscribe Now"}
              </Button>
            </div>

            <div className="mt-6 flex items-start gap-3">
              <input
                id="newsletter-consent"
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-accent"
                aria-invalid={Boolean(errors.consent_ndpr)}
                aria-describedby={
                  errors.consent_ndpr ? "newsletter-consent-error" : undefined
                }
                {...register("consent_ndpr")}
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
                {errors.consent_ndpr ? (
                  <p id="newsletter-consent-error" className="mt-1 text-sm">
                    {errors.consent_ndpr.message}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Spec §12: form outcomes are announced, not just recoloured. */}
            <div aria-live="polite" className="mt-4 text-sm">
              {status === "success" ? (
                <p>
                  Thank you — please check your inbox to confirm your
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
