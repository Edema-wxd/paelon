"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { track } from "@/lib/analytics/track";
import {
  newsletterSchema,
  type NewsletterInput,
} from "@/lib/validation/newsletter";

export type NewsletterStatus = "idle" | "submitting" | "success" | "error";

/** Field names the server may return errors against, so an unexpected key from
    the API can never be piped into `setError` as an unknown field. */
const FIELD_NAMES = ["email", "consentNdpr"] as const;

type FieldName = (typeof FIELD_NAMES)[number];

function isFieldName(value: string): value is FieldName {
  return (FIELD_NAMES as readonly string[]).includes(value);
}

function emptyValues(): NewsletterInput {
  return {
    email: "",
    // `literal(true)` types the field as `true`, but an unticked box must
    // start as false so consent is never pre-given. The cast is the narrow
    // cost of that guarantee.
    consentNdpr: false as unknown as true,
    website: "",
    // Re-stamped on every reset so a second signup in the same session is
    // timed from when the form became empty again.
    formRenderedAt: Date.now(),
  };
}

/**
 * Form state and submit logic shared by the inline newsletter panel and the
 * homepage popup, so the two can never drift on validation, consent or the
 * `newsletter_signup` event. Validation is the shared Zod schema, run here for
 * UX and again in `/api/newsletter` for truth.
 *
 * @param onSuccess Called after the server accepts the signup.
 */
export function useNewsletterForm(onSuccess?: () => void) {
  const [status, setStatus] = useState<NewsletterStatus>("idle");
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<NewsletterInput>({
    resolver: zodResolver(newsletterSchema),
    defaultValues: emptyValues(),
  });

  const { setError, reset } = form;

  async function submit(values: NewsletterInput) {
    setStatus("submitting");
    setServerError(null);

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        // The envelope is `{ ok: false, error: { message, fields } }` — see
        // lib/api/response.ts.
        const error =
          body && typeof body === "object" && "error" in body
            ? (body.error as {
                message?: string;
                fields?: Record<string, string[]>;
              })
            : null;

        if (error?.fields) {
          for (const [field, messages] of Object.entries(error.fields)) {
            if (isFieldName(field) && messages[0]) {
              setError(field, { type: "server", message: messages[0] });
            }
          }
        }

        setServerError(
          error?.message ??
            "We could not sign you up just now. Please try again.",
        );
        setStatus("error");
        return;
      }

      reset(emptyValues());
      // `newsletter_signup` (spec §9). The double opt-in confirmation is a
      // separate, server-side event and is not tracked here.
      track("newsletter_signup");

      setStatus("success");
      onSuccess?.();
    } catch {
      setServerError("We could not reach the server. Please try again.");
      setStatus("error");
    }
  }

  return { form, status, serverError, submit };
}
