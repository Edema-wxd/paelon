import type { Booking } from "@/lib/db/schema";

/**
 * Booking destination strategy (master spec §7).
 *
 * Destinations are swappable and best-effort. The database write is the source
 * of truth; delivery is not. A failing destination must never fail a booking.
 */
export interface BookingDestination {
  name: string;
  enabled: boolean;
  send(booking: BookingDispatch): Promise<DestinationResult>;
}

export interface DestinationResult {
  success: boolean;
  error?: string;
  skipped?: boolean;
}

/**
 * What a destination receives: the stored booking plus the resolved names it
 * would otherwise have to re-query. Resolving once in the orchestrator keeps
 * destinations free of database access.
 */
export interface BookingDispatch {
  booking: Booking;
  locationName: string;
  locationSlug: string;
  locationBookingEmail: string | null;
  locationPhone: string;
  serviceName: string | null;
  hmoName: string | null;
}

/** Thrown by stubs that exist to define an interface, not to do work. */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented`);
    this.name = "NotImplementedError";
  }
}

/**
 * Cap how long a destination may take.
 *
 * A hanging third party must not hold the request open behind it — the booking
 * is already committed by the time destinations run, so the only thing waiting
 * is the patient's confirmation screen.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const DESTINATION_TIMEOUT_MS = 5000;
