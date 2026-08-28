import { logger } from "@/lib/logger";

import type {
  BookingDestination,
  BookingDispatch,
  DestinationResult,
} from "./types";

/**
 * Always-on observability destination.
 *
 * **Redacts by construction.** This logs only the operational facts needed to
 * trace a booking through the system — reference, branch, service family,
 * status, timestamps. It never logs `patient_name`, `patient_phone`,
 * `patient_email`, `patient_dob`, or `reason_for_visit`.
 *
 * The rule is the same one master spec §14 applies to env vars and §16 applies
 * to `console.log`, extended to patient data: logs are the least access-
 * controlled surface in the system, so personal data does not go in them.
 *
 * The fields are listed explicitly rather than spread from the booking, so that
 * adding a column to `bookings` can never silently start logging it.
 */
export const logDestination: BookingDestination = {
  name: "log",
  enabled: true,

  async send(dispatch: BookingDispatch): Promise<DestinationResult> {
    const { booking } = dispatch;

    logger.info("booking.received", {
      reference: booking.reference,
      locationId: booking.locationId,
      locationSlug: dispatch.locationSlug,
      serviceFamily: booking.serviceFamily,
      serviceId: booking.serviceId,
      preferredDate: booking.preferredDate,
      preferredTimeWindow: booking.preferredTimeWindow,
      existingPatient: booking.existingPatient,
      hasHmo: booking.hmoId !== null,
      consentMarketing: booking.consentMarketing,
      status: booking.status,
      source: booking.source,
      createdAt: booking.createdAt.toISOString(),
    });

    return { success: true };
  },
};
