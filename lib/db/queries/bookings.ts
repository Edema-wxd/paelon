import { eq } from "drizzle-orm";

import { db, dbTx } from "@/lib/db/client";
import {
  bookingStatusHistory,
  bookings,
  type Booking,
  type NewBooking,
} from "@/lib/db/schema";
import { generateReference } from "@/lib/booking/reference";

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

/**
 * Insert a booking and its initial status-history row, atomically.
 *
 * The transaction is the point: a booking without its `NULL -> new` history row
 * would leave a hole in the Phase 2 timeline that no backfill can honestly
 * reconstruct. Both rows land, or neither does.
 *
 * The reference is drawn from a sequence, so a collision is essentially
 * impossible — but `reference` is UNIQUE and the insert retries once anyway,
 * because the cost of the retry is nil and the cost of a 500 on a booking is not.
 */
export async function createBooking(
  input: Omit<NewBooking, "reference">,
): Promise<Booking> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await insertBookingWithHistory(input);
    } catch (error) {
      if (attempt === 0 && isUniqueViolation(error)) continue;
      throw error;
    }
  }

  // Unreachable: the loop either returns or throws.
  throw new Error("createBooking exhausted its retries");
}

async function insertBookingWithHistory(
  input: Omit<NewBooking, "reference">,
): Promise<Booking> {
  const client = dbTx();

  return client.transaction(async (tx) => {
    const reference = await generateReference(tx);

    const inserted = await tx
      .insert(bookings)
      .values({ ...input, reference })
      .returning();

    const booking = inserted[0];
    if (!booking) {
      throw new Error("Booking insert returned no row");
    }

    await tx.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      fromStatus: null,
      toStatus: booking.status,
      note: "Created via website booking form",
    });

    return booking;
  });
}

/**
 * Look up a booking by reference.
 *
 * Never cached — booking data is personal data and mutable (master spec §5).
 */
export async function getBookingByReference(
  reference: string,
): Promise<Booking | null> {
  const rows = await db()
    .select()
    .from(bookings)
    .where(eq(bookings.reference, reference))
    .limit(1);

  return rows[0] ?? null;
}
