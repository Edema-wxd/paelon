"use client";

import Link from "next/link";

import { FieldError } from "@/components/booking/field";
import {
  SERVICE_FAMILY_LABELS,
  TIME_WINDOW_LABELS,
  type BranchOption,
  type HmoOption,
  type ServiceOption,
  type StepProps,
} from "@/components/booking/types";

/**
 * Step 6 — review and consent (master spec §7).
 *
 * The summary is a `<dl>`, not a table: each row is one label and one value,
 * which is what a description list is for and what a screen reader reads back
 * cleanly. Every row carries an "Edit" link back to the step that owns it, so
 * a wrong answer costs one click rather than five Back presses.
 *
 * Neither consent box is ever pre-ticked (NDPR, CLAUDE.md). The marketing
 * opt-in is separate from the processing consent on purpose — bundling them
 * would make the marketing consent non-specific, and therefore invalid.
 */
export function StepReview({
  draft,
  errors,
  patch,
  branches,
  services,
  hmos,
  onEditStep,
}: StepProps & {
  branches: readonly BranchOption[];
  services: readonly ServiceOption[];
  hmos: readonly HmoOption[];
  onEditStep: (index: number) => void;
}) {
  const branch = branches.find((b) => b.slug === draft.locationSlug);
  const service = services.find((s) => s.slug === draft.serviceSlug);
  const hmo = hmos.find((h) => h.slug === draft.hmoSlug);

  const rows: { step: number; label: string; value: string }[] = [
    { step: 0, label: "Branch", value: branch?.name ?? "—" },
    {
      step: 1,
      label: "Service",
      value: service
        ? service.name
        : draft.serviceFamily
          ? SERVICE_FAMILY_LABELS[draft.serviceFamily]
          : "—",
    },
    {
      step: 2,
      label: "Preferred day",
      value: draft.preferredDate
        ? `${formatIsoDate(draft.preferredDate)}${
            draft.preferredTimeWindow
              ? `, ${TIME_WINDOW_LABELS[draft.preferredTimeWindow].toLowerCase()}`
              : ""
          }`
        : "—",
    },
    { step: 3, label: "Patient", value: draft.patientName || "—" },
    { step: 3, label: "Phone", value: draft.patientPhone || "—" },
    { step: 3, label: "Email", value: draft.patientEmail || "—" },
    {
      step: 4,
      label: "HMO",
      value: hmo
        ? draft.hmoPlan
          ? `${hmo.name} — ${draft.hmoPlan}`
          : hmo.name
        : "Paying privately",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-base font-medium">Check your details</h3>
        <dl className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3"
            >
              <dt className="w-32 shrink-0 text-sm text-muted-foreground">
                {row.label}
              </dt>
              <dd className="min-w-0 flex-1 text-base break-words">
                {row.value}
              </dd>
              <button
                type="button"
                onClick={() => onEditStep(row.step)}
                className="rounded-md text-sm font-medium text-accent underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                Edit
                <span className="sr-only"> {row.label.toLowerCase()}</span>
              </button>
            </div>
          ))}
        </dl>
      </div>

      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <input
            id="booking-consent-ndpr"
            type="checkbox"
            checked={draft.consentNdpr}
            onChange={(event) => patch({ consentNdpr: event.target.checked })}
            aria-invalid={Boolean(errors.consentNdpr)}
            aria-describedby={
              errors.consentNdpr ? "booking-consent-ndpr-error" : undefined
            }
            className="mt-1 size-5 shrink-0 accent-accent"
          />
          <div>
            <label htmlFor="booking-consent-ndpr" className="text-sm">
              I agree that Paelon Memorial Hospital may store these details and
              contact me about this appointment, and I have read the{" "}
              <Link
                href="/privacy"
                className="rounded-md underline underline-offset-4 hover:no-underline"
              >
                privacy policy
              </Link>
              .
            </label>
            {errors.consentNdpr ? (
              <FieldError id="booking-consent-ndpr-error">
                {errors.consentNdpr}
              </FieldError>
            ) : null}
          </div>
        </div>

        <div className="flex items-start gap-3">
          <input
            id="booking-consent-marketing"
            type="checkbox"
            checked={draft.consentMarketing}
            onChange={(event) =>
              patch({ consentMarketing: event.target.checked })
            }
            className="mt-1 size-5 shrink-0 accent-accent"
          />
          <label htmlFor="booking-consent-marketing" className="text-sm">
            Send me occasional health tips and hospital news by email. Optional,
            and you can unsubscribe at any time.
          </label>
        </div>
      </div>
    </div>
  );
}

/**
 * "Tuesday 9 September 2026" from an ISO date, without pulling in a formatter.
 *
 * The string is parsed as UTC and printed in UTC on purpose: it is a calendar
 * date the patient picked, not an instant, and rendering it in the visitor's
 * local zone can shift it by a day for anyone west of Lagos.
 */
function formatIsoDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;

  return date.toLocaleDateString("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
