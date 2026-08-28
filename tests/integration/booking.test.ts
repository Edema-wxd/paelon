import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  closePool,
  hasDatabase,
  resetDatabase,
  seedLocation,
  configureTestDatabase,
} from "./setup";

configureTestDatabase();

const describeIfDb = hasDatabase ? describe : describe.skip;

describeIfDb("booking submission", () => {
  let db: typeof import("@/lib/db/client").db;
  let submitBooking: typeof import("@/lib/booking/submit").submitBooking;

  beforeAll(async () => {
    ({ db } = await import("@/lib/db/client"));
    ({ submitBooking } = await import("@/lib/booking/submit"));
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedLocation();
  });

  afterAll(async () => {
    await closePool();
  });

  function payload(overrides: Record<string, unknown> = {}) {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    return {
      locationSlug: "victoria-island",
      serviceFamily: "family_healthcare" as const,
      preferredDate: tomorrow,
      preferredTimeWindow: "morning" as const,
      patientName: "Ada Obi",
      patientPhone: "+2348012345678",
      patientEmail: "ada@example.test",
      existingPatient: false,
      consentNdpr: true as const,
      consentMarketing: false,
      ...overrides,
    };
  }

  it("writes the booking and its initial status-history row atomically", async () => {
    const result = await submitBooking(payload());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reference).toMatch(/^PMH-\d{4}-\d{6}$/);

    const bookings = await db().execute(
      sql`SELECT id, reference, status FROM bookings WHERE reference = ${result.reference}`,
    );
    const bookingRows = rows(bookings);
    expect(bookingRows).toHaveLength(1);

    const history = await db().execute(
      sql`SELECT from_status, to_status FROM booking_status_history
          WHERE booking_id = ${(bookingRows[0] as { id: string }).id}`,
    );
    const historyRows = rows(history);

    // The point of the transaction: a booking without its history row would
    // leave a hole in the Phase 2 timeline that no backfill can reconstruct.
    expect(historyRows).toHaveLength(1);
    expect((historyRows[0] as { from_status: string | null }).from_status).toBeNull();
    expect((historyRows[0] as { to_status: string }).to_status).toBe("new");
  });

  it("issues sequential, unique references under concurrent submissions", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => submitBooking(payload())),
    );

    const references = results
      .filter((r): r is Extract<typeof r, { ok: true }> => r.ok)
      .map((r) => r.reference);

    expect(references).toHaveLength(10);
    // A COUNT(*)+1 reference generator fails exactly here.
    expect(new Set(references).size).toBe(10);
  });

  it("still succeeds when a destination fails", async () => {
    // The guarantee is about a *destination* failing, not the dispatcher.
    // whatsapp is unconfigured in tests, so it reports failure on every run;
    // insta-hms is disabled and would throw if it were ever dispatched. A
    // booking that returns ok here is the guarantee holding.
    const result = await submitBooking(payload());

    expect(result.ok).toBe(true);

    const count = await db().execute(sql`SELECT count(*)::int AS n FROM bookings`);
    expect((rows(count)[0] as { n: number }).n).toBe(1);
  });

  it("rejects an unknown branch slug without writing anything", async () => {
    const result = await submitBooking(payload({ locationSlug: "no-such-branch" }));

    expect(result).toEqual({ ok: false, reason: "unknown_location" });

    const count = await db().execute(sql`SELECT count(*)::int AS n FROM bookings`);
    expect((rows(count)[0] as { n: number }).n).toBe(0);
  });

  it("refuses a non-consenting booking at the database level", async () => {
    const locationId = await seedLocation("ikeja");

    // Zod blocks this at the boundary; the CHECK constraint is the backstop for
    // any path that bypasses Zod, including manual SQL.
    await expect(
      db().execute(sql`
        INSERT INTO bookings (reference, location_id, service_family, preferred_date,
                              preferred_time_window, consent_ndpr, consent_text_version)
        VALUES ('PMH-2026-999999', ${locationId}, 'family_healthcare', '2026-12-01',
                'morning', false, 'test-v1')
      `),
    ).rejects.toThrow();
  });
});

/** Normalise a driver result to a row array. */
function rows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result) {
    const r = (result as { rows: unknown }).rows;
    return Array.isArray(r) ? r : [];
  }
  return [];
}
