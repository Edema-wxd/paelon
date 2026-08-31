"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  contactSchema,
  type ContactSubmissionInput,
} from "@/lib/validation/contact";

/**
 * What the inputs hold, which is not what the schema hands back: `phone` is
 * typed as present-but-possibly-undefined on the way out and optional on the
 * way in, so the form is generic over the input type and `handleSubmit` gives
 * `onSubmit` the parsed output.
 */
type ContactFormValues = z.input<typeof contactSchema>;

type Status = "idle" | "submitting" | "success" | "error";

/** Branches offered in the "which branch" select. Kept minimal so the server
    page does not serialise whole location records into the client bundle. */
export interface ContactFormBranch {
  slug: string;
  name: string;
}

/** Field names the server may return errors against, so an unexpected key from
    the API can never be piped into `setError` as an unknown field. */
const FIELD_NAMES = [
  "name",
  "email",
  "phone",
  "subject",
  "message",
  "locationSlug",
  "consentNdpr",
] as const;

type FieldName = (typeof FIELD_NAMES)[number];

function isFieldName(value: string): value is FieldName {
  return (FIELD_NAMES as readonly string[]).includes(value);
}

/**
 * General enquiry form (spec §6 `/contact`), posting to `/api/contact`.
 *
 * Client component — it owns form state. Validation is `contactSchema`, run
 * here for UX and again in the route handler for truth, so the two can never
 * drift apart.
 *
 * The Figma export labels every field with a placeholder only. Spec §12
 * forbids placeholder-as-label — the text vanishes the moment someone types,
 * which strands anyone using a screen magnifier or coming back to a
 * half-filled form — so each field carries a visible `<label>` instead.
 */
export function ContactForm({ branches }: { branches: ContactFormBranch[] }) {
  const [status, setStatus] = useState<Status>("idle");
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ContactFormValues, unknown, ContactSubmissionInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      subject: "",
      message: "",
      // `literal(true)` types the field as `true`, but an unticked box must
      // start as false so consent is never pre-given. The cast is the narrow
      // cost of that guarantee.
      consentNdpr: false as unknown as true,
      website: "",
      formRenderedAt: Date.now(),
    },
  });

  async function onSubmit(values: ContactSubmissionInput) {
    setStatus("submitting");
    setServerError(null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const error =
          body && typeof body === "object" && "error" in body
            ? (body.error as {
                message?: string;
                fields?: Record<string, string[]>;
              })
            : null;

        // The server is the authority on validation, so anything it rejects is
        // pinned back onto the offending field rather than shown as one opaque
        // banner the user has to guess their way out of.
        if (error?.fields) {
          for (const [field, messages] of Object.entries(error.fields)) {
            if (isFieldName(field) && messages[0]) {
              setError(field, { type: "server", message: messages[0] });
            }
          }
        }

        setServerError(
          error?.message ??
            "We could not send your message just now. Please try again.",
        );
        setStatus("error");
        return;
      }

      reset({
        name: "",
        email: "",
        phone: "",
        subject: "",
        message: "",
        consentNdpr: false as unknown as true,
        website: "",
        formRenderedAt: Date.now(),
      });
      setStatus("success");
    } catch {
      setServerError("We could not reach the server. Please try again.");
      setStatus("error");
    }
  }

  const fieldClass = "mt-2 bg-surface";
  const labelClass = "text-base font-medium";
  const errorClass = "mt-2 text-sm text-destructive";

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)}>
      {/*
        Honeypot. Hidden from sighted users and from assistive tech, and never
        focusable, so no real person can fill it in — a non-empty value means a
        bot, and the server discards the submission while still returning
        success. Preferred over a CAPTCHA, which costs accessibility and
        performance (spec §12/§13).
      */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="contact-website">Leave this field empty</label>
        <input
          id="contact-website"
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

      <div className="space-y-6">
        <div>
          <label htmlFor="contact-name" className={labelClass}>
            Your name
          </label>
          <Input
            id="contact-name"
            autoComplete="name"
            required
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "contact-name-error" : undefined}
            className={fieldClass}
            {...register("name")}
          />
          {errors.name ? (
            <p id="contact-name-error" className={errorClass}>
              {errors.name.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="contact-email" className={labelClass}>
            Email address
          </label>
          <Input
            id="contact-email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "contact-email-error" : undefined}
            className={fieldClass}
            {...register("email")}
          />
          {errors.email ? (
            <p id="contact-email-error" className={errorClass}>
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="contact-phone" className={labelClass}>
            Phone number{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </label>
          <Input
            id="contact-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={
              errors.phone ? "contact-phone-error" : "contact-phone-hint"
            }
            className={fieldClass}
            {...register("phone")}
          />
          {errors.phone ? (
            <p id="contact-phone-error" className={errorClass}>
              {errors.phone.message}
            </p>
          ) : (
            <p id="contact-phone-hint" className="mt-2 text-sm text-muted-foreground">
              For example 0801 234 5678. An email address is enough if you would
              rather not leave a number.
            </p>
          )}
        </div>

        {/* Only worth asking once there is more than one branch to choose
            between. Today only Victoria Island is seeded (seed/README.md), so
            this renders nothing and the enquiry carries no branch. */}
        {branches.length > 1 ? (
          <div>
            <label htmlFor="contact-branch" className={labelClass}>
              Which branch is this about?{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <select
              id="contact-branch"
              className="mt-2 h-9 w-full rounded-md border border-input bg-surface px-3 text-base shadow-xs md:text-sm"
              aria-invalid={Boolean(errors.locationSlug)}
              aria-describedby={
                errors.locationSlug ? "contact-branch-error" : undefined
              }
              {...register("locationSlug", {
                // An empty select must mean "no branch given", not an empty
                // slug — `slug` has a min length and would reject "".
                setValueAs: (value: string) =>
                  value === "" ? undefined : value,
              })}
            >
              <option value="">No particular branch</option>
              {branches.map((branch) => (
                <option key={branch.slug} value={branch.slug}>
                  {branch.name}
                </option>
              ))}
            </select>
            {errors.locationSlug ? (
              <p id="contact-branch-error" className={errorClass}>
                {errors.locationSlug.message}
              </p>
            ) : null}
          </div>
        ) : null}

        <div>
          <label htmlFor="contact-subject" className={labelClass}>
            Subject
          </label>
          <Input
            id="contact-subject"
            required
            aria-invalid={Boolean(errors.subject)}
            aria-describedby={
              errors.subject ? "contact-subject-error" : undefined
            }
            className={fieldClass}
            {...register("subject")}
          />
          {errors.subject ? (
            <p id="contact-subject-error" className={errorClass}>
              {errors.subject.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="contact-message" className={labelClass}>
            Your message
          </label>
          <Textarea
            id="contact-message"
            rows={5}
            required
            aria-invalid={Boolean(errors.message)}
            aria-describedby={
              errors.message ? "contact-message-error" : "contact-message-hint"
            }
            className={fieldClass}
            {...register("message")}
          />
          {errors.message ? (
            <p id="contact-message-error" className={errorClass}>
              {errors.message.message}
            </p>
          ) : (
            <p
              id="contact-message-hint"
              className="mt-2 text-sm text-muted-foreground"
            >
              Please do not include medical details you would rather not send by
              email. Call us instead if it is urgent.
            </p>
          )}
        </div>

        <div className="flex items-start gap-3">
          <input
            id="contact-consent"
            type="checkbox"
            className="mt-1 size-5 shrink-0 accent-accent"
            aria-invalid={Boolean(errors.consentNdpr)}
            aria-describedby={
              errors.consentNdpr ? "contact-consent-error" : undefined
            }
            {...register("consentNdpr")}
          />
          <div>
            <label htmlFor="contact-consent" className="text-sm">
              I agree that Paelon Memorial Hospital may store these details and
              contact me about this enquiry, and I have read the{" "}
              <Link
                href="/privacy"
                className="rounded-md underline underline-offset-4 hover:no-underline"
              >
                privacy policy
              </Link>
              .
            </label>
            {errors.consentNdpr ? (
              <p id="contact-consent-error" className={errorClass}>
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
          className="w-full"
        >
          {status === "submitting" ? "Sending…" : "Send message"}
        </Button>
      </div>

      {/* Spec §12: form outcomes are announced, not just recoloured. */}
      <div aria-live="polite" className="mt-4">
        {status === "success" ? (
          <p className="rounded-md bg-surface px-4 py-3 text-base">
            Thank you — your message has been sent. We will reply to the email
            address you gave us.
          </p>
        ) : null}
        {status === "error" && serverError ? (
          <p className="rounded-md bg-surface px-4 py-3 text-base text-destructive">
            {serverError}
          </p>
        ) : null}
      </div>
    </form>
  );
}
