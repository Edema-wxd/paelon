"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BookingProgress } from "@/components/booking/booking-progress";
import { StepBranch } from "@/components/booking/steps/step-branch";
import { StepDetails } from "@/components/booking/steps/step-details";
import { StepHmo } from "@/components/booking/steps/step-hmo";
import { StepReview } from "@/components/booking/steps/step-review";
import { StepSchedule } from "@/components/booking/steps/step-schedule";
import { StepService } from "@/components/booking/steps/step-service";
import {
  EMPTY_DRAFT,
  type BookingDraft,
  type BranchOption,
  type DraftErrors,
  type HmoOption,
  type ServiceOption,
} from "@/components/booking/types";
import { Button } from "@/components/ui/button";
import { RESPONSE_TIME_PROMISE } from "@/lib/response-time";
import {
  bookingStep1,
  bookingStep2,
  bookingStep3,
  bookingStep4,
  bookingStep5,
  bookingStep6,
  bookingSubmissionSchema,
} from "@/lib/validation/booking";

/**
 * The six-step booking wizard (master spec §7) — the site's priority
 * conversion path.
 *
 * Design notes that are load-bearing rather than taste:
 *
 *  - **One draft object, owned here.** Steps are presentational and patch it.
 *    Because the state lives above them, stepping back unmounts a step's DOM
 *    but not its answers, which is what "back navigation without state loss"
 *    means in practice.
 *  - **Progressive validation against the same schemas the server uses.**
 *    `bookingStep1..6` gate each Continue; `bookingSubmissionSchema` gates the
 *    submit. Client validation is UX and the route handler is still the truth,
 *    but sharing the schemas means the two cannot drift into disagreeing about
 *    what a valid phone number is.
 *  - **No form library and no state library** (CLAUDE.md). A wizard is a step
 *    index and an object; react-hook-form's value here is per-field
 *    subscriptions, which a six-screen flow does not need.
 *  - **The step heading takes focus on every change**, and the live region
 *    announces it. Otherwise a keyboard or screen-reader user presses Continue
 *    and lands back at the top of the document with no idea the screen moved.
 */

interface StepDefinition {
  label: string;
  heading: string;
  intro?: string;
}

const STEPS: readonly StepDefinition[] = [
  {
    label: "Branch",
    heading: "Choose a branch",
    intro: "Pick where you would like to be seen.",
  },
  { label: "Service", heading: "What do you need?" },
  { label: "Date", heading: "When suits you?" },
  {
    label: "Details",
    heading: "Your details",
    intro: "So we can confirm the appointment with you.",
  },
  { label: "HMO", heading: "Payment and cover" },
  { label: "Review", heading: "Review and confirm" },
];

/**
 * Which step owns which field. Used to send a server-side field error back to
 * the screen that can fix it, rather than showing it on the review step where
 * the input does not exist.
 */
const STEP_FIELDS: readonly (readonly (keyof BookingDraft)[])[] = [
  ["locationSlug"],
  ["serviceFamily", "serviceSlug"],
  ["preferredDate", "preferredTimeWindow"],
  [
    "patientName",
    "patientPhone",
    "patientEmail",
    "patientDob",
    "existingPatient",
    "reasonForVisit",
  ],
  ["hmoSlug", "hmoPlan"],
  ["consentNdpr", "consentMarketing"],
];

type Status = "editing" | "submitting" | "error";

export interface BookingWizardProps {
  branches: readonly BranchOption[];
  services: readonly ServiceOption[];
  hmos: readonly HmoOption[];
  /** Resolved server-side from `?branch=` / `?service=` (master spec §7). */
  prefill?: Partial<BookingDraft>;
}

export function BookingWizard({
  branches,
  services,
  hmos,
  prefill,
}: BookingWizardProps) {
  const router = useRouter();

  const [draft, setDraft] = useState<BookingDraft>(() => ({
    ...EMPTY_DRAFT,
    ...prefill,
  }));

  /**
   * Deep links "skip the pre-filled step and land on the next step directly":
   * start at the first step whose answers are not already valid. Doing it by
   * validation rather than by counting query parameters means a link that
   * pre-fills both branch and service lands on step 3 without special-casing.
   *
   * The steps themselves are not removed — someone who followed a link for the
   * wrong branch must still be able to go back and change it.
   */
  const [step, setStep] = useState(() => firstIncompleteStep({ ...EMPTY_DRAFT, ...prefill }));

  const [errors, setErrors] = useState<DraftErrors>({});
  const [status, setStatus] = useState<Status>("editing");
  const [serverError, setServerError] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasMoved = useRef(false);
  const formRenderedAt = useRef(Date.now());
  const [honeypot, setHoneypot] = useState("");

  // Not on first paint — moving focus on load would fight the browser's own
  // restoration and yank a returning visitor away from where they were.
  useEffect(() => {
    if (!hasMoved.current) return;
    headingRef.current?.focus();
  }, [step]);

  const patch = useCallback((values: Partial<BookingDraft>) => {
    setDraft((current) => ({ ...current, ...values }));
    // Clear only what was just touched: wiping every error would hide problems
    // on fields the user has not returned to yet.
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(values) as (keyof BookingDraft)[]) {
        delete next[key];
      }
      return next;
    });
  }, []);

  /**
   * `keepErrors` exists because the two reasons to change step are opposites.
   * Pressing Back or Edit should clear the slate. Being sent back *by* a
   * validation failure must not — clearing there would land the user on the
   * offending step with no indication of what was wrong with it.
   */
  const goTo = useCallback(
    (index: number, options: { keepErrors?: boolean } = {}) => {
      hasMoved.current = true;
      if (!options.keepErrors) setErrors({});
      setStep(index);
    },
    [],
  );

  /**
   * Built on mount rather than at module load: `bookingStep3` reads the clock
   * to fix its date window, and a tab left open overnight would otherwise keep
   * validating against yesterday.
   */
  const stepSchemas = useMemo(
    () =>
      [
        bookingStep1,
        bookingStep2,
        bookingStep3(),
        bookingStep4,
        bookingStep5,
        bookingStep6,
      ] as const,
    [],
  );

  const isLastStep = step === STEPS.length - 1;

  function onContinue() {
    const schema = stepSchemas[step];
    if (!schema) return;

    const parsed = schema.safeParse(toPayload(draft));

    if (!parsed.success) {
      setErrors(firstMessages(parsed.error.flatten().fieldErrors));
      return;
    }

    goTo(step + 1);
  }

  async function onSubmit() {
    const parsed = bookingSubmissionSchema().safeParse({
      ...toPayload(draft),
      website: honeypot,
      formRenderedAt: formRenderedAt.current,
    });

    if (!parsed.success) {
      const fieldErrors = firstMessages(parsed.error.flatten().fieldErrors);
      setErrors(fieldErrors);
      const owner = stepOwningFirstError(fieldErrors);
      if (owner !== null && owner !== step) goTo(owner, { keepErrors: true });
      return;
    }

    setStatus("submitting");
    setServerError(null);

    try {
      const response = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const error = readApiError(body);

        if (error?.fields) {
          const mapped = firstMessages(error.fields);
          setErrors(mapped);
          const owner = stepOwningFirstError(mapped);
          if (owner !== null && owner !== step) goTo(owner, { keepErrors: true });
        }

        setServerError(
          error?.message ??
            "We could not send your booking just now. Please try again.",
        );
        setStatus("error");
        return;
      }

      const redirectUrl = readRedirectUrl(body);

      // The reference lives on the confirmation page, and a POST followed by a
      // navigation means a refresh there can never resubmit the booking
      // (CLAUDE.md, conversion baseline item 1).
      router.push(redirectUrl ?? "/book/confirmed");
    } catch {
      setServerError(
        "We could not reach the server. Check your connection and try again.",
      );
      setStatus("error");
    }
  }

  const definition = STEPS[step];
  if (!definition) return null;

  const stepProps = { draft, errors, patch };

  return (
    <div className="mx-auto max-w-3xl">
      <BookingProgress labels={STEPS.map((s) => s.label)} current={step} />

      {/* Announces the move without duplicating the heading visually. */}
      <p aria-live="polite" className="sr-only">
        Step {step + 1} of {STEPS.length}: {definition.heading}
      </p>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (isLastStep) {
            void onSubmit();
          } else {
            onContinue();
          }
        }}
        className="mt-8"
      >
        {/* Honeypot: hidden from sighted users and assistive tech alike, and
            never focusable, so only a bot can fill it. The server returns a
            success shape for a filled one rather than telling it it was
            caught. */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="booking-website">Leave this field empty</label>
          <input
            id="booking-website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
          />
        </div>

        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl text-primary outline-none lg:text-3xl"
        >
          {definition.heading}
        </h2>
        {definition.intro ? (
          <p className="mt-2 text-base text-muted-foreground">
            {definition.intro}
          </p>
        ) : null}

        <div className="mt-8">
          {step === 0 ? (
            <StepBranch {...stepProps} branches={branches} />
          ) : null}
          {step === 1 ? (
            <StepService {...stepProps} services={services} />
          ) : null}
          {step === 2 ? <StepSchedule {...stepProps} /> : null}
          {step === 3 ? <StepDetails {...stepProps} /> : null}
          {step === 4 ? <StepHmo {...stepProps} hmos={hmos} /> : null}
          {step === 5 ? (
            <StepReview
              {...stepProps}
              branches={branches}
              services={services}
              hmos={hmos}
              onEditStep={goTo}
            />
          ) : null}
        </div>

        {/* Errors are announced, not just recoloured (spec §12). */}
        <div aria-live="assertive" className="mt-6">
          {status === "error" && serverError ? (
            <p className="rounded-md border border-destructive/40 bg-surface px-4 py-3 text-base text-destructive">
              {serverError}
            </p>
          ) : null}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {step > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="pill"
              onClick={() => goTo(step - 1)}
              disabled={status === "submitting"}
            >
              Back
            </Button>
          ) : null}

          <Button
            type="submit"
            variant="accent"
            size="pill"
            disabled={status === "submitting"}
            className="flex-1 sm:flex-none"
          >
            {isLastStep
              ? status === "submitting"
                ? "Sending…"
                : "Request appointment"
              : "Continue"}
          </Button>
        </div>

        {/* Conversion baseline item 4: the one stated turnaround, beside the
            submit button and repeated verbatim on the thank-you page. */}
        {isLastStep ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {RESPONSE_TIME_PROMISE} This is a request, not a confirmed
            appointment.
          </p>
        ) : null}
      </form>
    </div>
  );
}

/**
 * Draft to payload. Empty strings become `undefined`, because the schemas
 * treat "absent" and "present but blank" very differently — `slug.optional()`
 * accepts the first and rejects the second.
 */
function toPayload(draft: BookingDraft): Record<string, unknown> {
  const optional = (value: string) => (value.trim() === "" ? undefined : value);

  return {
    locationSlug: draft.locationSlug,
    serviceFamily: optional(draft.serviceFamily),
    serviceSlug: optional(draft.serviceSlug),
    preferredDate: draft.preferredDate,
    preferredTimeWindow: optional(draft.preferredTimeWindow),
    patientName: draft.patientName,
    patientPhone: draft.patientPhone,
    patientEmail: draft.patientEmail,
    patientDob: optional(draft.patientDob),
    existingPatient: draft.existingPatient,
    reasonForVisit: optional(draft.reasonForVisit),
    hmoSlug: optional(draft.hmoSlug),
    hmoPlan: optional(draft.hmoPlan),
    consentNdpr: draft.consentNdpr,
    consentMarketing: draft.consentMarketing,
  };
}

/** The first step whose answers do not yet validate. */
function firstIncompleteStep(draft: BookingDraft): number {
  const payload = toPayload(draft);
  const schemas = [bookingStep1, bookingStep2] as const;

  for (const [index, schema] of schemas.entries()) {
    if (!schema.safeParse(payload).success) return index;
  }

  // Everything a deep link can pre-fill is satisfied, so land on the date step.
  return schemas.length;
}

/** One message per field — the first is the actionable one. */
function firstMessages(
  fieldErrors: Record<string, string[] | undefined>,
): DraftErrors {
  const result: DraftErrors = {};

  for (const [field, messages] of Object.entries(fieldErrors)) {
    const message = messages?.[0];
    if (message && isDraftField(field)) result[field] = message;
  }

  return result;
}

function isDraftField(value: string): value is keyof BookingDraft {
  return value in EMPTY_DRAFT;
}

/** The earliest step that owns any errored field, so we can send the user there. */
function stepOwningFirstError(errors: DraftErrors): number | null {
  const errored = Object.keys(errors) as (keyof BookingDraft)[];
  if (errored.length === 0) return null;

  for (const [index, fields] of STEP_FIELDS.entries()) {
    if (errored.some((field) => fields.includes(field))) return index;
  }

  return null;
}

function readApiError(
  body: unknown,
): { message?: string; fields?: Record<string, string[]> } | null {
  if (!body || typeof body !== "object" || !("error" in body)) return null;

  return body.error as { message?: string; fields?: Record<string, string[]> };
}

function readRedirectUrl(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("data" in body)) return null;

  const data = body.data;
  if (!data || typeof data !== "object" || !("redirectUrl" in data)) return null;

  const url = data.redirectUrl;

  // Only ever a same-origin path from our own handler, so anything else is
  // dropped rather than trusted into `router.push`. The `//` check is the point
  // of the guard: `//evil.example` starts with a slash and is a protocol-
  // relative URL to another origin.
  if (typeof url !== "string") return null;

  return url.startsWith("/") && !url.startsWith("//") ? url : null;
}
