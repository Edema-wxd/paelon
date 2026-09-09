import { sql } from "drizzle-orm";

/**
 * Booking reference generation (master spec §7, backend spec §9).
 *
 * Format: `PMH-YYYY-NNNNNN`, zero-padded to at least six digits.
 *
 * The number comes from a single non-resetting Postgres sequence (Francis's
 * decision), not from `SELECT COUNT(*)+1` — that is a read-then-write race and
 * produces duplicate references under concurrent submissions, which is exactly
 * when it matters. A sequence is atomic and never hands the same value twice,
 * even across rolled-back transactions.
 *
 * The year in the prefix is the year of issue; the counter is global, so
 * PMH-2027-004513 follows PMH-2026-004512. `reference` also carries a UNIQUE
 * constraint as a backstop, and the caller retries once on conflict.
 */

const REFERENCE_PAD = 6;

/**
 * A reference as `formatReference` writes one.
 *
 * Exported so the confirmation page can tell a real reference from whatever
 * else arrives in `?ref=`. React escapes the value either way; the check is
 * about not showing a visitor a booking reference that was never issued.
 */
const REFERENCE_PATTERN = /^PMH-\d{4}-\d{6,}$/;

export function isBookingReference(value: string): boolean {
  return REFERENCE_PATTERN.test(value);
}

/** Minimal shape needed to draw from the sequence — either db client satisfies it. */
type SequenceReader = {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
};

/**
 * Format a sequence value and a year into a reference string.
 *
 * The value is accepted as a string as well as a number because `nextval`
 * returns bigint, which the driver hands back as a string to avoid precision
 * loss — and padding is a string operation anyway.
 */
export function formatReference(
  sequenceValue: number | bigint | string,
  year: number,
): string {
  return `PMH-${year}-${String(sequenceValue).padStart(REFERENCE_PAD, "0")}`;
}

/**
 * Draw the next reference.
 *
 * `nextval` is transaction-safe and non-blocking; the sequence advances even if
 * the surrounding transaction aborts, which is the correct trade — a gap in the
 * numbering is harmless, a duplicate reference is not.
 */
export async function generateReference(
  client: SequenceReader,
  year: number = new Date().getUTCFullYear(),
): Promise<string> {
  const result = await client.execute(
    sql`SELECT nextval('booking_reference_seq') AS value`,
  );

  const value = extractSequenceValue(result);

  if (value === null) {
    throw new Error("booking_reference_seq did not return a value");
  }

  return formatReference(value, year);
}

/**
 * Pull the scalar out of a driver result.
 *
 * neon-http returns `{ rows: [...] }` while the pool driver returns rows
 * directly depending on version, and `nextval` comes back as a string because
 * bigint does not fit a JS number safely. Normalise all of that here so callers
 * do not have to care which client they were handed.
 */
function extractSequenceValue(result: unknown): string | null {
  const rows = Array.isArray(result)
    ? result
    : result && typeof result === "object" && "rows" in result
      ? (result as { rows: unknown }).rows
      : null;

  if (!Array.isArray(rows) || rows.length === 0) return null;

  const first = rows[0];
  if (!first || typeof first !== "object") return null;

  const value = (first as Record<string, unknown>).value;
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "bigint") return value.toString();

  return null;
}
