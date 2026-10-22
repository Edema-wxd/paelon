/**
 * The fixture staff account `tests/e2e/admin-booking.e2e.ts` signs in as.
 *
 * Deliberately a module with **no imports at all**. Playwright transforms the
 * spec that reads these constants and does not apply the tsconfig `@/*` mapping
 * to a test's transitive imports, so anything reachable from here would fail to
 * resolve under `npm run test:e2e`. The seeding that uses them runs in a
 * separate `tsx` process — see `lib/db/seed-e2e-admin.ts`.
 *
 * **The password below is not a credential.** It is a literal in the repository
 * precisely so that nobody is tempted to reuse a real one for the E2E, and it
 * unlocks nothing but a fixture row on a development database. The address is on
 * the reserved `.test` TLD, which cannot resolve anywhere; the seeding script
 * asserts that suffix before it writes, so this path can never overwrite a real
 * member of staff's account. Never seed it where a real person can reach it.
 */
export const E2E_ADMIN = {
  name: "Playwright Test Admin",
  email: "e2e-admin@paelon.test",
  password: "playwright-e2e-admin-not-a-real-password",
  role: "admin",
} as const;

/** Patient name on the fixture booking, so a stray row is obvious in the queue. */
export const E2E_BOOKING_PATIENT = "Playwright Admin Fixture";
