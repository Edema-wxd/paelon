import { getWhatsAppProvider } from "@/lib/whatsapp";
import { logger, redactPhone } from "@/lib/logger";

import type {
  BookingDestination,
  BookingDispatch,
  DestinationResult,
} from "./types";

/**
 * WhatsApp confirmation to the patient.
 *
 * Stub: the provider is an outstanding decision (master spec §18). The
 * abstraction exists so swapping in a provider is one file, and the destination
 * reports `not_configured` rather than throwing.
 *
 * Timing risk worth restating: WhatsApp Business API outbound messages need
 * pre-approved templates, and approval takes days. If confirmations are wanted
 * at launch, provider selection and template submission cannot wait for week
 * three.
 */
export const whatsappDestination: BookingDestination = {
  name: "whatsapp",

  get enabled(): boolean {
    return getWhatsAppProvider().name !== "noop";
  },

  async send(dispatch: BookingDispatch): Promise<DestinationResult> {
    const provider = getWhatsAppProvider();
    const phone = dispatch.booking.patientPhone;

    if (provider.name === "noop" || !phone) {
      logger.debug("booking.whatsapp_skipped", {
        reference: dispatch.booking.reference,
        reason: provider.name === "noop" ? "not_configured" : "no_phone",
      });
      return { success: false, skipped: true, error: "not_configured" };
    }

    const result = await provider.sendTemplate(phone, "booking_confirmation", {
      reference: dispatch.booking.reference,
      branch: dispatch.locationName,
      date: dispatch.booking.preferredDate,
    });

    logger.info("booking.whatsapp_dispatched", {
      reference: dispatch.booking.reference,
      to: redactPhone(phone),
      success: result.success,
    });

    return result;
  },
};
