import { logger } from "@/lib/logger";

import { emailDestination } from "./email";
import { instaHmsDestination } from "./insta-hms";
import { logDestination } from "./log";
import {
  DESTINATION_TIMEOUT_MS,
  withTimeout,
  type BookingDestination,
  type BookingDispatch,
  type DestinationResult,
} from "./types";
import { whatsappDestination } from "./whatsapp";

/**
 * Destination registry and dispatcher (master spec §7).
 *
 * Registration order is not execution order — everything runs concurrently.
 */
const ALL_DESTINATIONS: BookingDestination[] = [
  logDestination,
  emailDestination,
  whatsappDestination,
  instaHmsDestination,
];

/** Destinations currently switched on. `enabled` may be a getter, so read it per call. */
export function enabledDestinations(): BookingDestination[] {
  return ALL_DESTINATIONS.filter((d) => d.enabled);
}

export interface DispatchOutcome {
  name: string;
  result: DestinationResult;
}

/**
 * Fire every enabled destination.
 *
 * **A failed destination never fails the booking** (master spec §7). This runs
 * after the transaction has committed: the database write is the source of
 * truth, delivery is best-effort. `Promise.allSettled` plus a per-destination
 * timeout means one hung or throwing provider cannot take down the others or
 * hold the response open.
 *
 * Never throws. The return value is for logging, not for control flow.
 */
export async function dispatchToDestinations(
  dispatch: BookingDispatch,
): Promise<DispatchOutcome[]> {
  const destinations = enabledDestinations();

  const settled = await Promise.allSettled(
    destinations.map((destination) =>
      withTimeout(
        Promise.resolve(destination.send(dispatch)),
        DESTINATION_TIMEOUT_MS,
        `destination:${destination.name}`,
      ),
    ),
  );

  return settled.map((outcome, index) => {
    // `destinations` and `settled` are the same length and order.
    const name = destinations[index]?.name ?? "unknown";

    if (outcome.status === "fulfilled") {
      if (!outcome.value.success && !outcome.value.skipped) {
        logger.warn("booking.destination_failed", {
          destination: name,
          reference: dispatch.booking.reference,
          error: outcome.value.error,
        });
      }
      return { name, result: outcome.value };
    }

    logger.warn("booking.destination_threw", {
      destination: name,
      reference: dispatch.booking.reference,
      error: outcome.reason,
    });

    return {
      name,
      result: {
        success: false,
        error:
          outcome.reason instanceof Error
            ? outcome.reason.message
            : "destination_threw",
      },
    };
  });
}

export type { BookingDestination, BookingDispatch, DestinationResult };
