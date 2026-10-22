import { hashPassword } from "@/lib/auth/password";
import { closePool, db } from "@/lib/db/client";
import { createBooking } from "@/lib/db/queries/bookings";
import { publicFilter } from "@/lib/db/queries/shared";
import { locations, users } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";

import { E2E_ADMIN, E2E_BOOKING_PATIENT } from "./e2e-fixture-account";

/**
 * Test-only seeding for `tests/e2e/admin-booking.e2e.ts`.
 *
 * The admin E2E signs in through the real login form, so something has to put an
 * account it knows the password for into the database. That is this script, and
 * the guards are the whole reason it is allowed to exist:
 *
 *  1. **It refuses to run in production.** `NODE_ENV === "production"` exits
 *     non-zero before any write.
 *  2. **It can only ever touch one address.** `E2E_ADMIN.email` is on the
 *     reserved `.test` TLD and the suffix is asserted below, so this can never
 *     be pointed at a colleague's account.
 *  3. **The password is not a credential** — see `./e2e-fixture-account.ts`.
 *
 * A standalone script rather than a module the spec imports, because Playwright
 * does not apply the tsconfig `@/*` mapping to a test's transitive imports.
 * Run it the way CLAUDE.md's live-gaps note prescribes for `tsx` scripts:
 *
 *     node --env-file=.env.local ./node_modules/.bin/tsx lib/db/seed-e2e-admin.ts
 *
 * It prints one JSON line on stdout — `{ "userId", "bookingReference" }`, with a
 * null reference when no branch is published — which is what the spec reads.
 *
 * Deliberately not wired into `npm run db:seed` and imported by nothing in the
 * app: a hospital's seed command must not create an account with a published
 * password as a side effect.
 */

/** Upsert the fixture admin. */
async function seedAdmin(): Promise<string> {
  if (!E2E_ADMIN.email.endsWith("@paelon.test")) {
    throw new Error("The E2E admin email must stay on the reserved .test TLD.");
  }

  /*
   * The hash is reset on every run, and the lockout counters with it: a
   * half-finished earlier run must not leave behind an account the spec can no
   * longer sign into, and five failed attempts must not lock out the next run.
   */
  const fields = {
    name: E2E_ADMIN.name,
    passwordHash: await hashPassword(E2E_ADMIN.password),
    role: E2E_ADMIN.role,
    deletedAt: null,
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: new Date(),
  };

  const rows = await db()
    .insert(users)
    .values({ email: E2E_ADMIN.email, ...fields })
    .onConflictDoUpdate({ target: users.email, set: fields })
    .returning({ id: users.id });

  const row = rows[0];
  if (!row) throw new Error("Failed to seed the E2E admin");
  return row.id;
}

/**
 * A fresh `new` booking for the spec to work through, written by the real
 * `createBooking` so it arrives with the initial history row a website
 * submission would have. Returns null when no branch is published, which the
 * spec treats as a skip rather than a failure.
 */
async function seedBooking(): Promise<string | null> {
  // Not `getPublishedLocations()`: that one is wrapped in `unstable_cache`,
  // which needs a Next request context and throws under bare `tsx`. Same
  // `publicFilter`, so it still cannot pick an unpublished branch.
  const branches = await db()
    .select({ id: locations.id })
    .from(locations)
    .where(publicFilter(locations))
    .limit(1);

  const location = branches[0];
  if (!location) return null;

  const booking = await createBooking({
    locationId: location.id,
    serviceFamily: "family_healthcare",
    preferredDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
    preferredTimeWindow: "morning",
    patientName: E2E_BOOKING_PATIENT,
    patientPhone: "+2348012345678",
    patientEmail: "playwright-admin@example.test",
    reasonForVisit: "Fixture booking for the admin workflow E2E.",
    consentNdpr: true,
    consentTextVersion: serverEnv().CONSENT_TEXT_VERSION,
  });

  return booking.reference;
}

async function main(): Promise<void> {
  if (serverEnv().NODE_ENV === "production") {
    throw new Error(
      "seed-e2e-admin is test-only and refuses to run against production.",
    );
  }

  const userId = await seedAdmin();
  const bookingReference = await seedBooking();

  process.stdout.write(`${JSON.stringify({ userId, bookingReference })}\n`);
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        level: "error",
        event: "db.seed_e2e_admin.failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    await closePool();
    process.exit(1);
  });
