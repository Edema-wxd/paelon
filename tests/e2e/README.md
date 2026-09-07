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

## Still missing

CLAUDE.md's testing floor requires one E2E for the **booking happy path**. It is
not written because `/book` does not exist yet. It is the first spec to add when
the booking flow lands, and should cover: deep link pre-fill, back navigation
without state loss, the `aria-live` step announcement, and the
`PMH-YYYY-NNNNNN` reference on `/book/confirmed`.
