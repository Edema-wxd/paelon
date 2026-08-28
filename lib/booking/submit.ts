import { getHmoBySlug } from "@/lib/db/queries/hmos";
import { resolveLocationForBooking } from "@/lib/db/queries/locations";
import { getServiceBySlug } from "@/lib/db/queries/services";
import { createBooking } from "@/lib/db/queries/bookings";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { BookingSubmission } from "@/lib/validation/booking";

import { dispatchToDestinations } from "./destinations";

/**
 * Booking orchestration (backend spec §9).
 *
 * Order matters and is not arbitrary:
 *   validate (caller) -> rate limit (caller) -> resolve slugs -> insert in a
 *   transaction -> commit -> dispatch destinations.
 *
 * Destinations run strictly *after* commit because the database write is the
 * source of truth (master spec §7). A booking that is saved but not emailed is
 * a recoverable operational problem; a booking that was emailed but not saved
 * is data loss.
 */

export type SubmitOutcome =
  | { ok: true; reference: string; redirectUrl: string }
  | { ok: false; reason: "unknown_location" | "unknown_service" | "unknown_hmo" };

export async function submitBooking(
  input: BookingSubmission,
): Promise<SubmitOutcome> {
  const startedAt = Date.now();

  const location = await resolveLocationForBooking(input.locationSlug);
  if (!location) return { ok: false, reason: "unknown_location" };

  // A service slug that does not resolve is a client bug or a tampered payload,
  // not something to silently drop — the patient chose a specific service.
  const service = input.serviceSlug
    ? await getServiceBySlug(input.serviceSlug)
    : null;
  if (input.serviceSlug && !service) {
    return { ok: false, reason: "unknown_service" };
  }

  const hmo = input.hmoSlug ? await getHmoBySlug(input.hmoSlug) : null;
  if (input.hmoSlug && !hmo) {
    return { ok: false, reason: "unknown_hmo" };
  }

  // Phone and email are already normalised by the Zod schema: the phone is
  // E.164 and the email is lowercased, so nothing further is needed here.
  const booking = await createBooking({
    locationId: location.id,
    serviceFamily: input.serviceFamily,
    serviceId: service?.id ?? null,
    preferredDate: input.preferredDate,
    preferredTimeWindow: input.preferredTimeWindow,
    patientName: input.patientName,
    patientPhone: input.patientPhone,
    patientEmail: input.patientEmail,
    patientDob: input.patientDob ?? null,
    existingPatient: input.existingPatient,
    reasonForVisit: input.reasonForVisit ?? null,
    hmoId: hmo?.id ?? null,
    hmoPlan: input.hmoPlan ?? null,
    consentNdpr: input.consentNdpr,
    consentTextVersion: serverEnv().CONSENT_TEXT_VERSION,
    consentMarketing: input.consentMarketing,
    status: "new",
    source: "website",
  });

  // Past this point the booking is committed and safe. Nothing below may throw
  // in a way that turns a saved booking into an error for the patient.
  const outcomes = await dispatchToDestinations({
    booking,
    locationName: location.name,
    locationSlug: location.slug,
    locationBookingEmail: location.bookingEmail,
    locationPhone: location.phone,
    serviceName: service?.name ?? null,
    hmoName: hmo?.name ?? null,
  });

  logger.info("booking.created", {
    reference: booking.reference,
    locationSlug: location.slug,
    serviceFamily: booking.serviceFamily,
    durationMs: Date.now() - startedAt,
    destinations: outcomes.map((o) => ({
      name: o.name,
      success: o.result.success,
    })),
  });

  return {
    ok: true,
    reference: booking.reference,
    redirectUrl: `/book/confirmed?ref=${encodeURIComponent(booking.reference)}`,
  };
}

/**
 * Resolve `/book?service=` and `/book?branch=` deep links (master spec §7).
 *
 * An unknown or unpublished slug is ignored rather than 404'd: a stale link
 * from an old campaign should drop the visitor into a working booking flow at
 * step 1, not a dead end.
 */
export async function resolveBookingPrefill(params: {
  service?: string | null;
  branch?: string | null;
}): Promise<{
  locationSlug?: string;
  serviceSlug?: string;
  serviceFamily?: string;
}> {
  const prefill: {
    locationSlug?: string;
    serviceSlug?: string;
    serviceFamily?: string;
  } = {};

  if (params.branch) {
    const location = await resolveLocationForBooking(params.branch);
    if (location) prefill.locationSlug = location.slug;
  }

  if (params.service) {
    const service = await getServiceBySlug(params.service);
    if (service) {
      prefill.serviceSlug = service.slug;
      prefill.serviceFamily = service.family;
    }
  }

  return prefill;
}
