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
