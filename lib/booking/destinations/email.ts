import { sendEmail } from "@/lib/email/send";
import {
  bookingBranchEmail,
  bookingPatientEmail,
  type BookingEmailData,
} from "@/lib/email/templates/booking";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

import type {
  BookingDestination,
  BookingDispatch,
  DestinationResult,
} from "./types";

/**
 * Email destination: one confirmation to the patient, one notification to the
 * branch inbox.
 *
 * Always "enabled" — `sendEmail` decides what actually happens based on
 * `RESEND_ENABLED`, and reports a skipped send as success. Gating the whole
 * destination on the flag instead would mean the disabled path never gets
 * exercised in development, which is how a Resend-off deployment breaks
 * silently in production.
 */
export const emailDestination: BookingDestination = {
  name: "email",
  enabled: true,

  async send(dispatch: BookingDispatch): Promise<DestinationResult> {
    const data = toEmailData(dispatch);
    const branchInbox = resolveBranchInbox(dispatch);

    const results = await Promise.allSettled([
      sendEmail(bookingPatientEmail(data, dispatch.locationPhone), {
        template: "booking-patient",
      }),
      branchInbox
        ? sendEmail(bookingBranchEmail(data, branchInbox), {
            template: "booking-branch",
          })
        : Promise.resolve({ success: false, error: "no_branch_inbox" }),
    ]);

    if (!branchInbox) {
      // Worth surfacing: the branch has no route for its bookings, so nobody is
      // being told. The booking itself is safe in the database.
      logger.warn("booking.branch_inbox_missing", {
        reference: dispatch.booking.reference,
        locationSlug: dispatch.locationSlug,
      });
    }

    const failures = results.filter(
      (r) => r.status === "rejected" || !r.value.success,
    );

    if (failures.length === results.length) {
      return { success: false, error: "all_sends_failed" };
    }

    return { success: true, ...(failures.length > 0 ? { error: "partial" } : {}) };
  },
};

/**
 * Resolve the branch inbox.
 *
 * `locations.booking_email` is authoritative so a branch added through the
 * Phase 2 CMS needs no redeploy. The `BRANCH_*_EMAIL` env vars are a Phase 1
 * fallback, matched by slug, for branches seeded before the column is filled.
 */
function resolveBranchInbox(dispatch: BookingDispatch): string | null {
  if (dispatch.locationBookingEmail) return dispatch.locationBookingEmail;

  const env = serverEnv();
  const bySlug: Record<string, string | undefined> = {
    "victoria-island": env.BRANCH_VI_EMAIL,
    ikeja: env.BRANCH_IKEJA_EMAIL,
    moshood: env.BRANCH_MOSHOOD_EMAIL,
    delta: env.BRANCH_DELTA_EMAIL,
  };

  return bySlug[dispatch.locationSlug] ?? null;
}

const FAMILY_LABELS: Record<string, string> = {
  family_healthcare: "Family Healthcare",
  women_and_children: "Women and Children",
  specialist: "Specialist",
  diagnostics: "Diagnostics",
};

const WINDOW_LABELS: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

/**
 * Map a stored booking to template data.
 *
 * `reason_for_visit` is deliberately absent — see the note in
 * lib/email/templates/booking.ts.
 */
function toEmailData(dispatch: BookingDispatch): BookingEmailData {
  const { booking } = dispatch;

  return {
    reference: booking.reference,
    locationName: dispatch.locationName,
    serviceName: dispatch.serviceName,
    serviceFamilyLabel:
      FAMILY_LABELS[booking.serviceFamily] ?? booking.serviceFamily,
    preferredDate: booking.preferredDate,
    preferredTimeWindowLabel:
      WINDOW_LABELS[booking.preferredTimeWindow] ?? booking.preferredTimeWindow,
    patientName: booking.patientName ?? "",
    patientPhone: booking.patientPhone ?? "",
    patientEmail: booking.patientEmail ?? "",
    existingPatient: booking.existingPatient,
    hmoName: dispatch.hmoName,
    hmoPlan: booking.hmoPlan,
  };
}
