# End-to-end tests

Playwright, mobile Chrome only. See the reasoning in `playwright.config.ts`.

```bash
npx playwright install chromium   # once
npm run test:e2e
```

## These need a database

Every page reads content through `lib/db/queries/*`. The specs run against
`next dev`, which loads `.env.local`, so before the first run:

```bash
cp .env.example .env.local        # fill in DATABASE_URL and RATE_LIMIT_SALT
npm run db:push
npm run db:seed
```

`tests/e2e/blog.e2e.ts` asserts structure — headings, roles, URL state, link
targets — rather than copy. The only post seeded is a layout fixture that will
be deleted, so any assertion keyed to its wording would break the day real
editorial content arrives. The one exception is the direct
`/blog/preview-post-layout-fixture` navigation, which exists to exercise every
Markdown block type; when the fixture goes, point those specs at a real post.

## Booking writes to the database

`tests/e2e/booking.e2e.ts` covers the happy path CLAUDE.md's testing floor
requires: deep-link pre-fill, back navigation without state loss, the
`aria-live` step announcement, and the `PMH-YYYY-NNNNNN` reference on
`/book/confirmed`.

The submit spec posts to the real `/api/booking`, so it inserts a `bookings` row
named "Playwright Test Patient" and advances `booking_reference_seq`. That is
the point — a mocked endpoint would test the wizard against a fiction — but it
means the suite belongs against a development database, never production. The
rate limit is 5 submissions per hour per IP, so repeated local runs will
eventually get a 429 rather than a confirmation page.

`booking_reference_seq` lives in `drizzle/0001_constraints_triggers_sequences.sql`
and **`npm run db:push` does not create it** — push only syncs what drizzle-kit
can generate from the schema, and 0001 is hand-written. On a database that was
set up with push rather than migrate, every booking insert fails on
`nextval('booking_reference_seq')`. The same migration carries the `updated_at`
triggers, the NDPR consent CHECK constraints and the HMO trigram indexes, so a
pushed database is missing all of those too.

## The admin workflow needs a signed-in account

`tests/e2e/admin-booking.e2e.ts` signs in through the real login form, opens a
booking from the queue, moves it `new → contacted` with a note, and asserts the
timeline attributes the move to the actor by name. It also needs `AUTH_SECRET`
and `AUTH_URL` in `.env.local`.

The account it signs in as is seeded by `lib/db/seed-e2e-admin.ts`, which the
spec runs as a subprocess in `beforeAll`:

- It is a **fixture, not a credential**. The address is on the reserved `.test`
  TLD, the script asserts that suffix before writing, and it refuses to run when
  `NODE_ENV=production`. The password is a literal in
  `lib/db/e2e-fixture-account.ts` precisely so nobody reuses a real one. Never
  seed it anywhere a real person can reach it.
- It is a subprocess rather than an import because Playwright does not apply the
  tsconfig `@/*` mapping to a test's transitive imports — importing the script
  directly fails on `@/lib/env` inside `lib/db/client.ts`. Running it under
  `tsx` also gets `.env.local` loaded, which the Playwright process itself never
  does.
- It is not wired into `npm run db:seed`, and nothing in the app imports it: a
  hospital's seed command must not create an account with a published password
  as a side effect.

`AUTH_URL` pins the app's post-login redirect to a specific origin, so this spec
only works on the port `AUTH_URL` names. Running the dev server elsewhere needs
both overridden together:

```bash
AUTH_URL=http://localhost:3100 NEXT_PUBLIC_SITE_URL=http://localhost:3100 \
  npx next dev -p 3100
PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test admin-booking
```

That is worth knowing because `webServer.reuseExistingServer` is on outside CI:
if another project's dev server already holds port 3000, Playwright will happily
run the whole suite against it. The sign-in helper asserts on the admin nav and
the dashboard heading rather than on the URL for exactly that reason — a URL
pattern is satisfied by any app answering on the port.

This spec writes a `users` row, a `bookings` row, `booking_status_history` rows
and the `auth.login`, `booking.viewed` and `booking.status_changed` audit
entries. Development database only.
