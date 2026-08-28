import { sql } from "drizzle-orm";

import { closePool, db, dbTx } from "@/lib/db/client";

/**
 * Integration test harness.
 *
 * Requires `TEST_DATABASE_URL` pointing at a database the Neon driver can
 * reach — a Neon dev branch is the intended target (backend spec §20). The
 * suite skips itself rather than failing when one is not configured, so
 * `npm test` stays runnable with no infrastructure.
 *
 * Run with:
 *   TEST_DATABASE_URL=postgres://... npm run test:integration
 */

export const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);

/**
 * Point the app's env at the test database.
 *
 * Called before any module reads `serverEnv()`, which memoises on first access.
 */
export function configureTestDatabase(): void {
  if (!hasDatabase) return;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.RATE_LIMIT_SALT ??= "integration-test-salt-0123456789";
  process.env.RESEND_ENABLED = "false";
  process.env.CONSENT_TEXT_VERSION = "test-v1";
}

/** Tables cleared between tests, children before parents. */
const MUTABLE_TABLES = [
  "booking_status_history",
  "bookings",
  "contact_submissions",
  "corporate_enquiries",
  "newsletter_subscribers",
  "rate_limit_hits",
  "service_locations",
  "service_related",
  "doctor_locations",
  "hmo_locations",
  "blog_post_related",
  "testimonials",
  "blog_posts",
  "authors",
  "services",
  "doctors",
  "hmos",
  "awards",
  "faqs",
  "locations",
];

/** Truncate everything. CASCADE handles any FK order this list gets wrong. */
export async function resetDatabase(): Promise<void> {
  await db().execute(
    sql.raw(
      `TRUNCATE TABLE ${MUTABLE_TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
    ),
  );
}

/** A published branch, which almost every test needs. */
export async function seedLocation(slug = "victoria-island"): Promise<string> {
  const rows = await dbTx().execute(sql`
    INSERT INTO locations (name, slug, address_line_1, city, state, phone,
                           emergency_line, hours, published, booking_email)
    VALUES ('Victoria Island', ${slug}, '1 Admiralty Way', 'Lagos', 'Lagos',
            '+2341234567', '+2341234568', '{}'::jsonb, true, 'vi@example.test')
    RETURNING id
  `);

  const list = Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows;
  const first = list[0] as { id: string } | undefined;
  if (!first) throw new Error("Failed to seed location");
  return first.id;
}

export { closePool };
