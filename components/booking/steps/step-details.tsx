"use client";

import { Field, describedBy } from "@/components/booking/field";
import type { StepProps } from "@/components/booking/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * Step 4 — patient details (master spec §7).
 *
 * `reasonForVisit` is health data, the most sensitive NDPR category. Per the
 * decision recorded on `bookingStep4`, it is stored but never emailed to a
 * branch and never logged, and it is labelled here as optional and
 * non-clinical so nobody types a symptom history into it expecting triage.
 */
export function StepDetails({ draft, errors, patch }: StepProps) {
  return (
    <div className="space-y-6">
      <Field
        id="booking-name"
        label="Patient's full name"
        error={errors.patientName}
      >
        <Input
          id="booking-name"
          required
          autoComplete="name"
          value={draft.patientName}
          onChange={(event) => patch({ patientName: event.target.value })}
          aria-invalid={Boolean(errors.patientName)}
          aria-describedby={describedBy("booking-name", {
            error: errors.patientName,
          })}
          className="bg-surface"
        />
      </Field>

      <Field
        id="booking-phone"
        label="Phone number"
        error={errors.patientPhone}
        hint="This is how we confirm your appointment. For example 0801 234 5678."
      >
        <Input
          id="booking-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          value={draft.patientPhone}
          onChange={(event) => patch({ patientPhone: event.target.value })}
          aria-invalid={Boolean(errors.patientPhone)}
          aria-describedby={describedBy("booking-phone", {
            error: errors.patientPhone,
            hint: true,
          })}
          className="bg-surface"
        />
      </Field>

      <Field
        id="booking-email"
        label="Email address"
        error={errors.patientEmail}
        hint="We send your booking reference here."
      >
        <Input
          id="booking-email"
          type="email"
          autoComplete="email"
          required
          value={draft.patientEmail}
          onChange={(event) => patch({ patientEmail: event.target.value })}
          aria-invalid={Boolean(errors.patientEmail)}
          aria-describedby={describedBy("booking-email", {
            error: errors.patientEmail,
            hint: true,
          })}
          className="bg-surface"
        />
      </Field>

      <Field
        id="booking-dob"
        label="Date of birth"
        optional
        error={errors.patientDob}
        hint="Helps us find an existing file and book the right clinic."
      >
        <Input
          id="booking-dob"
          type="date"
          autoComplete="bday"
          value={draft.patientDob}
          onChange={(event) => patch({ patientDob: event.target.value })}
          aria-invalid={Boolean(errors.patientDob)}
          aria-describedby={describedBy("booking-dob", {
            error: errors.patientDob,
            hint: true,
          })}
          className="bg-surface"
        />
      </Field>

      <div className="flex items-start gap-3">
        <input
          id="booking-existing"
          type="checkbox"
          checked={draft.existingPatient}
          onChange={(event) => patch({ existingPatient: event.target.checked })}
          className="mt-1 size-5 shrink-0 accent-accent"
        />
        <label htmlFor="booking-existing" className="text-base">
          I have been treated at Paelon before
        </label>
      </div>

      <Field
        id="booking-reason"
        label="What would you like to be seen about?"
        optional
        error={errors.reasonForVisit}
        hint="A sentence is plenty. Please do not send anything urgent this way — call the hospital instead."
      >
        <Textarea
          id="booking-reason"
          rows={4}
          value={draft.reasonForVisit}
          onChange={(event) => patch({ reasonForVisit: event.target.value })}
          aria-invalid={Boolean(errors.reasonForVisit)}
          aria-describedby={describedBy("booking-reason", {
            error: errors.reasonForVisit,
            hint: true,
          })}
          className="bg-surface"
        />
      </Field>
    </div>
  );
}
