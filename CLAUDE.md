# CLAUDE.md — Paelon Memorial Hospital

Working instructions for Claude Code on this repo.

**Source of truth:** [paelon-website-spec.md](paelon-website-spec.md). This file is the operational summary; the spec wins on any conflict. Read the relevant spec section end-to-end before writing code in a new area.

**Project:** Paelon Memorial Hospital website rebuild · VARYN Studio · Lead: Francis Woods (francis@varyn.ltd)

---

## Phase boundaries — the hardest rule here

| Phase | Scope | Status |
|---|---|---|
| 1 | Public marketing website, booking flow, forms, seed-data content | Complete |
| 2 | CMS, admin panel, auth, booking workflow, analytics dashboard | **Current work** |
| 3 | Bug fixes, snags (30 days post-launch) | Later |

Phase 1 is a **15 working day hard ceiling**. Never build a Phase 2 feature during Phase 1, even when it is one file away from a Phase 1 task. If a task appears to require it, stop and ask Francis.

Phase 2 surfaces that were meant to stay empty in Phase 1: `app/(admin)/`, `components/admin/`, `lib/auth/`, the `users`/`sessions`/`accounts` tables, everything in spec §8.

> **Ratified.** The admin code built during Phase 1 (`app/(admin)/`, `components/admin/`, `lib/auth/`, `app/api/auth/`) is the Phase 2 base. Every row in `docs/phase-2-decisions.md` is now decided — B1, B3, B5 and D4, the last four open ones, were settled on 2026-10-23.

Content is read from **Postgres, not from JSON at runtime**. `/seed/*.json` is the input to `npm run db:seed`; templates read through `lib/content.ts`, which wraps the repositories in `lib/db/queries/*`. The site does not render — `next build` included — without a reachable, migrated, seeded database.

---

## Stack — locked, do not substitute without asking

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind v4 + shadcn/ui · npm · Node 22 LTS · Neon Postgres · Drizzle ORM · Auth.js v5 (Phase 2) · UploadThing · Resend (optional) · Umami · Vercel

Tailwind is **v4, CSS-first**. Theme tokens go in the `@theme` block in `styles/globals.css` — there is no `tailwind.config.ts` and one should not be added.

**Never install:** any UI kit other than shadcn/ui · any state management library · any CSS-in-JS · any date library beyond `date-fns` · any HTTP client (use native `fetch`).

**Ask before installing anything** not on the approved list in spec §2. shadcn components are copied into `components/ui/`, not imported as a package.

Structure the app so it is not Vercel-locked — self-hosting is the post-launch target.

---

## Conventions

- **Files/folders:** kebab-case · **Components:** PascalCase · **Hooks:** `useThing` · **Constants:** UPPER_SNAKE_CASE
- **DB tables:** snake_case plural (`bookings`) · **DB columns:** snake_case (`patient_email`)
- **API routes:** kebab-case
- **Commits and PR titles:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`)
- **Git:** feature branches off `main`, PR-based, squash merges only. Never push directly to `main`.
- **Never commit:** `.env.local`, `node_modules`, `.next`, `.DS_Store`

`tsconfig.json` requires `strict`, `noUncheckedIndexedAccess`, `noImplicitAny`, `noFallthroughCasesInSwitch`. No `any` without a comment explaining why.

Directory layout is specified in §3 of the spec. Follow it exactly.

---

## Always

- Server components by default. Client components only when interactivity requires it.
- `lib/content.ts` is the content read path for every template. It maps DB rows onto the snake_case shapes components render, so a column rename does not ripple into fifteen files. Every getter is async. Client components may import **types** from it and nothing else — a value import drags the Neon driver into the browser bundle.
- Zod at every boundary — form submissions, API inputs. Validate on client (UX) *and* server (truth).
- Handle loading and error states explicitly. No silent failures.
- JSDoc on exported functions with non-obvious behaviour.
- Semantic HTML before `<div>`. Sequential heading hierarchy, no skips.
- `next/image` with proper sizes and priority. `next/font/local` with `display: 'swap'`.
- Lucide React icons only. No mixed icon sets.
- Long text (bio, description, blog body) is Markdown, not MDX (spec §5, §8). It renders through `lib/markdown.ts` into a typed AST and `components/site/article-body.tsx` into React elements — never `dangerouslySetInnerHTML`, and unsafe hrefs degrade to text. The admin editor preview must use the same renderer (D1). No MDX compiler.
- **Body images are `media` references, never URLs.** `![alt](media:<uuid> "caption")`, block-level only, resolved by `getBodyImages()` and rendered as a `<figure>` with `next/image`. The id carries the alt text and the intrinsic dimensions a URL has nowhere to put, and a figure with no dimensions degrades to its alt text rather than shifting the layout. An image written inside a sentence stays literal text and is refused at publish. Supported block syntax is `##`–`####`, lists, quotes, pipe tables and figures; code blocks, inline code, strikethrough and rules are deliberately absent. Figures are allowed in blog bodies and in Text blocks of page sections (below).
- **JSON-LD goes through `serializeJsonLd` (`lib/json-ld.ts`), never a bare `JSON.stringify`.** It carries admin-edited text, and `JSON.stringify` does not escape `<` — a `</script>` in an FAQ answer or a title would inject markup on public pages. Fixed site-wide on 2026-10-26; keep it that way.
- **Service pages and the About page are built from `content_sections` blocks** (migration 0008): Text, Image, Gallery, Call to action, edited in a Page layout editor under each page's form. Text under a template heading of its own renders with `headingOffset={1}` so the outline stays sequential; the admin preview applies the same offset. The legacy prose columns (`services.long_description`, `what_to_expect`, the five About prose columns) are kept untouched as the fallback for a page with no blocks — never write them from a form.
- Check every new or edited template against **Conversion & trust baseline** below before calling it done.
- Update the spec when a decision changes.

## Never

- Never fabricate content about Paelon — services, awards, patient stories, wait times. If a seed field is empty, add a `TODO(seed)` comment and surface it to Francis. This is a hospital; invented medical claims are a real-world harm, not a placeholder.
- Never disable a Lighthouse or accessibility check to make something pass. Fix the cause.
- Never use `console.log` in shipped code. The one carve-out is the `log.ts` booking destination, which writes structured JSON deliberately.
- Never introduce an auto-rotating slider or carousel. The current site's slider is a named anti-pattern for this brand.
- Never commit `.env.local` or any credential. Never log env vars.
- Never add a state library or an out-of-scope item (§17).

---

## Booking flow — the priority path

Six steps, one screen each on mobile, progress indicator always visible, back navigation without state loss. Full spec in §7.

`POST /api/booking` handler order: Zod validate → rate limit (5/hr per IP, 429 if exceeded) → generate `PMH-YYYY-NNNNNN` reference → write to `bookings` with status `new` → dispatch to destinations → return `{ reference, redirectUrl }`.

Destinations live in `lib/booking/destinations/` behind the `BookingDestination` interface, dispatched via `Promise.allSettled`. **A failed destination never fails the booking** — the DB write is the source of truth, delivery is best-effort. Implement `email.ts`, `whatsapp.ts` (stub the provider), `log.ts`. Stub `insta-hms.ts` as interface only; do not implement the API call until docs arrive.

Deep links: `/book?service=<slug>` pre-fills step 2, `/book?branch=<slug>` pre-fills step 1. Both skip the pre-filled step.

The site must work end-to-end with `RESEND_ENABLED=false` — email destinations no-op silently and log.

---

## Non-negotiable quality gates

**Accessibility: WCAG 2.1 AA on every template.** Labels on all inputs (not placeholder-as-label), visible on-brand focus rings, skip-to-content link, focus-trapping modals, 4.5:1 text contrast, colour never the sole state indicator, `aria-live` on booking step changes and form errors, meaningful alt text.

**Performance budgets** (§13, hard limits — if a change would breach one, stop and ask):

Lighthouse mobile Perf ≥ 90 · A11y ≥ 95 · SEO ≥ 95 · Best Practices 100 · LCP < 2.0s · FCP < 1.5s · TBT < 150ms · CLS < 0.05 · initial JS < 150 KB gzipped · homepage < 800 KB · any page < 1.5 MB

**SEO:** unique title + meta description, OG/Twitter tags, and canonical on every page. JSON-LD per §11 (`MedicalOrganization`, `Hospital`, `Physician`, `MedicalProcedure`, `FAQPage`, `Article`, `BreadcrumbList`, `LocalBusiness`). Dynamic sitemap, robots blocking `/admin`, `/api`, `/book/confirmed`. Descriptive link text — never bare "Read more".

**NDPR:** explicit, never pre-checked consent on every form collecting personal data. No cookie banner needed (Umami is cookieless).

---

## Conversion & trust baseline — required on every template it touches

Phase 1 scope, not nice-to-haves. A template is not done until its applicable items below are met, and no change may remove one.

1. **Thank-you page after every enquiry** — contact, corporate, newsletter, booking. A real route (`/contact/thank-you`, `/corporate/thank-you`, `/newsletter/confirmed`, `/book/confirmed`), reached by POST → redirect so a refresh never re-submits. `noindex`, restates what happens next plus the response-time promise, offers one onward link. An inline toast alone is not a thank-you page.
2. **Breadcrumbs** — visible `<nav aria-label="Breadcrumb">` on every page below top level, driven by the same array that emits the `BreadcrumbList` JSON-LD. Use `components/site/breadcrumbs.tsx`, which emits both from one `Crumb[]` and prepends Home itself; never hand-roll per page, never JSON-LD without the visible trail. Used by `/blog/[slug]`, `/services/[slug]`, `/about`, `/doctors` and `/doctors/[slug]`. `/locations/[slug]` hand-rolls both halves; **`/terms` and `/privacy` emit the JSON-LD with no visible trail at all**, which this rule forbids. Move them over when next touched.
3. **FAQ section** — homepage, every service page, every location page. `FAQPage` JSON-LD, native `<details>` accordion (no state library). Answers must exist as real text in the HTML, not injected on expand. Since 2026-10-26 (Francis): a service page shows **only** the FAQs assigned to it in `/admin/faqs` (`faq_services`, migration 0007) and renders no section when none are; the homepage and branch pages show the `general` category. Answers are Markdown rendered through `ArticleBody`, without headings.
4. **Response-time promise** — one stated turnaround, from a single constant in seed/config, shown beside every form's submit button and repeated on the matching thank-you page. Never re-worded per page. `TODO(seed)` until Francis confirms the number — do not invent one.
5. **Sticky mobile CTA** — persistent bottom bar (call + book) across the marketing site on mobile. Respects safe-area insets, never covers a focused input or the footer's final action, contributes nothing to CLS. Hidden inside `/book`.
6. **`robots.txt`** — `app/robots.ts`, blocking `/admin`, `/api`, `/book/confirmed` and every thank-you route, pointing at the sitemap. Never `Disallow: /` — gate preview environments with env-driven `noindex` instead.
7. **Unique title, meta description and social share image per page** — no shared defaults, no duplicated or truncated copies. OG/Twitter image per template with a branded fallback, canonical always absolute. All of it through `lib/seo.ts`, not per-page literals.
8. **Map + directions on every location** — lazy-loaded embedded map (no third-party script in the critical path), plain-text address, and a "Get directions" deep link built from branch coordinates. Landmark directions only where seed supplies them.
9. **Real customer reviews only** — testimonials come from the `testimonials` table, seeded from `/seed/testimonials.json`, with attribution. Never write, extend, or tidy a patient quote. A row is public only when `consent_given` is true: consent is a recorded fact about a real patient, never an assumption, and an unconsented quote stays invisible. No consented rows means the section does not render.
10. **Alt text on every image** — specific and descriptive; decorative images get `alt=""` and `aria-hidden`. A shipped image without alt text is a blocking failure, not a nit.
11. **`LocalBusiness` schema** — per branch, alongside `MedicalOrganization`/`Hospital`: name, full `PostalAddress`, geo, phone, `openingHoursSpecification`, `url`, image. Emitted from branch seed data; never hand-typed, never asserting hours or services the seed does not contain.
12. **Privacy policy page** — `/privacy`, live and linked from the footer and from every consent checkbox. NDPR content: what is collected, why, retention, DPO contact, DSAR route. Draft for legal review, `TODO` where blocked.
13. **Custom 500 alongside the 404** — `app/error.tsx` and `app/global-error.tsx` brand-styled to match `not-found.tsx`. No stack traces or error text to the user, a phone number for urgent care, a retry action. Both must render with JS disabled.
14. **Internal links in every blog post** — each post body carries at least two contextual links to real site routes (a service, a location, `/book`, or a related post), written as `[descriptive text](/path)` in the Markdown body and placed in the sentence they belong to — never a bare "Read more" and never a link block bolted on at the end. `related_slugs` must be populated with slugs that exist and resolve, and the article template renders them. A link to a route that does not exist is a broken build, not a TODO; if the right destination is not built yet, link the nearest real page or leave the sentence unlinked. Do not invent a destination, and do not add a link that makes a claim the target page does not support.

---

## Commands

```bash
npm install
cp .env.example .env.local     # then fill in — DATABASE_URL is required
npm run db:push                # create tables; nothing renders before this
npm run db:seed                # load /seed/*.json, then print the gap report
npm run dev

npm run typecheck              # tsc --noEmit
npm run lint                   # eslint (not `next lint` — deprecated in 15.5)
npm run test                   # vitest, unit
npm run build
```

Also wired: `db:generate` · `db:migrate` · `db:studio` · `seed:report` (content gaps without a DB round trip) · `test:watch` · `test:integration` · `test:e2e` and `test:e2e:ui` (Playwright — needs a seeded DB and a dev server) · `images`, `images:force`, `images:check` (local asset pipeline) · `og` (share card) · `upload` (push one editorial image to UploadThing and print its CDN URL).

Still not wired: `format` (prettier — needs approval).

Run typecheck and tests after every meaningful change. Every env var goes in `.env.example` (§14).

Testing floor for Phase 1: Vitest unit tests for utilities and **every** form submission Zod schema (accept + reject cases), plus one Playwright E2E for the booking happy path. No visual regression testing in Phase 1.

The booking E2E is `tests/e2e/booking.e2e.ts`. It writes a real row to `bookings`, so run it against a development database; `tests/e2e/README.md` lists what it covers.

---

## Autonomy

- **Autonomous:** any read, any read-only command, writes inside `app/`, `components/`, `lib/`, `seed/`.
- **Ask first:** package installs · writes to config files or anywhere outside those four directories · schema changes once Phase 2 begins (migrations are one-way) · any destructive action (deleting files, tables, migrations, history) · anything with more than one reasonable answer.
- **Stop and ask** if a design choice has you stuck for more than 15 minutes.

**Response style:** terse. Show code over explaining it. One paragraph max on a trade-off. Do not narrate what you are about to do — do it.

---

## Blocked on Francis

- **Content decisions from the 2026-10-26 admin review** (PR #7): Sarah Adenuga's testimonial `date_given` is the seed sentinel `1970-01-01`, not a real date, and the field is required, so any save re-stores it as fact — needs the real date, or the column made nullable (a schema change). The homepage claims "15+ Winning Awards" while the `awards` table is empty. Francis said Victoria Island is the only branch, but Ikeja and Moshood Olugbani are published, and the General FAQ "Is the Ikeja branch open 24 hours?" shows on the homepage and every branch page. No FAQs are assigned to services yet, so every service page currently has no FAQ section. The legacy prose columns behind `content_sections` can be cleared once Francis confirms the converted pages.

Assets and decisions not yet in the spec. Flag these rather than inventing around them:

- Brand colour hex codes (§4 is a placeholder block) and light/dark surface treatments
- Neo Tech `.woff2` files + license
- Seed content drafted from Figma
- WhatsApp Business API provider
- Insta HMS API docs
- Old WordPress URL list for 301 redirects
- Stated response-time promise (how many working hours before a reply). Not on the live site either; set it in `/admin/settings` once known
- Branch email inboxes. (**DPO contact resolved** 2026-10-24 from the live privacy policy: privacy@paelonmemorial.com, +234 809 888 8978. Still needs setting as `DPO_EMAIL` per environment — the footer prints a pending notice until it is.)
- Terms of Use draft for legal review. (**Privacy Policy resolved** 2026-10-24: `content/legal/privacy.json` now carries Paelon's own published policy, v3.0 of March 2026, NDPA 2023 compliant, and is `published: true`. Two things still need counsel's eye — the cookies/analytics section, which describes the new site and is not in their March 2026 text, and `CONSENT_TEXT_VERSION`, which is still `2026-01-v1` and should name the policy version each consent refers to.)
- **Testimonial consent.** `sarah-adenuga` is the only real quote seeded and carries `consent_given: false`, so it does not render. Francis said on 2026-10-23 that consent will always be given — but `consent_given` is a recorded fact about a named patient, not a default, so nothing sets it on her row until the form it was given in is confirmed, along with whether the name may appear in full (`name_format`: `full` · `first_only` · `initials`). Until then the homepage shows one placeholder where §6 wants two real ones

## Live gaps — true as of 2026-09-15

Not blocked on anyone. Fix when the area is next touched.

- **`npm run db:push` and `npm run db:seed` do not load `.env.local`, so both fail on a missing `DATABASE_URL`.** `drizzle.config.ts` claims drizzle-kit reads the file itself; drizzle-kit only auto-loads `.env`, and `lib/db/seed.ts` runs under bare `tsx`. `upload` is the only script wired with `--env-file`. Until the scripts are fixed — a `package.json`/config change, so ask first — run them as `node --env-file=.env.local ./node_modules/.bin/drizzle-kit push` and `node --env-file=.env.local ./node_modules/.bin/tsx lib/db/seed.ts`. The dev Neon database was pushed and seeded that way on 2026-09-08 (25 tables); `next build` prerenders all 36 routes against it.

  **`drizzle-kit push` also needs a TTY and cannot be scripted.** It stops to ask whether `awards.logo` → `awards.logo_id` is a rename (it is not — `text` URL to `uuid` media id), and with piped output it aborts on "Interactive prompts require a TTY terminal". Migration `drizzle/0002_media_and_award_images.sql` was therefore applied statement by statement with a throwaway copy of `apply-0001.tmp.mts`, on 2026-09-29 with Francis's approval: `media` created, `awards.logo`/`certificate_image` dropped (0 rows, nothing to backfill) and the two uuid FK columns added. 26 tables now. It is still not registered in `drizzle/meta/_journal.json`. **Francis ruled on 2026-10-23: skip the awards logo.** The interactive `drizzle-kit generate` run is abandoned rather than outstanding — nobody is going to sit at the rename prompt, so 0002, 0004 and 0005 stay applied-but-unjournaled by decision, and `npm run db:apply` against a hand-written SQL file is the migration path for this project. The consequence to live with: `drizzle-kit generate` cannot be trusted to produce a correct next migration, because its snapshots stop at 0001 and it would re-emit everything since. Write the next migration's SQL by hand, as 0004 and 0005 were.

  **Migration `drizzle/0004_blog_authoring.sql` is applied to dev but not journaled either.** It was applied with `npm run db:apply` on 2026-10-19 with Francis's approval (28 tables): every content image column moved onto `media.id`, `media` gained `width`/`height`, the two gallery arrays became join tables, and `blog_posts` gained a generated `search_vector` with a GIN index. `drizzle-kit generate` still hangs at the same rename prompt, so no `0004_snapshot.json` exists and the journal entry is deliberately absent — adding one without the snapshot would make the next `generate` re-emit all of 0004.

  **Migration `drizzle/0005_about_content.sql` is applied to dev but not journaled either.** Applied with `npm run db:apply` on 2026-10-22 with Francis's approval (29 tables): the About page's prose moved out of `content/about.json` into an `about_content` singleton, edited at `/admin/about`. Legal pages stayed as files — decision C3.

  **Migrations `drizzle/0007_faq_services.sql` and `drizzle/0008_content_sections.sql` are applied to the shared database but not journaled either.** Both applied with `npm run db:apply` on 2026-10-26 with Francis's approval. 0007 adds the `faq_services` join table. 0008 adds `content_sections` (page blocks), relaxes `services.long_description` / `what_to_expect` to nullable, and copied the existing service and About prose into Text blocks — verified byte-identical and re-run safe. Production keeps running pre-PR-#7 code until it deploys; that code ignores both tables.

  **The Production drift is gone.** Verified 2026-10-23 against `https://paelon.vercel.app`: `/`, `/about`, `/blog`, `/locations/victoria-island` and `/admin/login` all return 200 and `/about` renders its heading, which it could not do without `awards.logo_id`, so 0002, 0004 and 0005 are all applied there. Preview points at the same database, so it is the same story — see the shared-database note below.
- **`NEXT_PUBLIC_SITE_URL` was set to `http://localhost:3000` on Vercel — fixed, pending a redeploy.** The env vars themselves landed (verified 2026-10-23: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `RATE_LIMIT_SALT`, `CONSENT_TEXT_VERSION`, `AUTH_SECRET`, `AUTH_URL`, `UPLOADTHING_TOKEN`, `RESEND_ENABLED`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_EMERGENCY_LINE`, all on Preview and Production), and the deploy builds and renders — but the value of `NEXT_PUBLIC_SITE_URL` was the localhost default, so `https://paelon.vercel.app` still ships `<link rel="canonical" href="http://localhost:3000/…">`, `og:url` and `og:image` on localhost, and a `robots.txt` pointing its `Sitemap:` at localhost. This is exactly the failure the old gap note predicted; it is a value fix, not a missing var. Set to `https://paelon.vercel.app` on Preview and Production on 2026-10-23, with Francis's approval; it is inlined at build time, so it is wrong on the live deployment until the next one. Change it again when a real domain is attached — the account holds none for Paelon today.
- **`AUTH_URL` was `http://localhost:3000` too**, which `/api/auth/providers` was publishing as the credentials callback, so admin sign-in could not complete in production. Set to `https://paelon.vercel.app` on Production on 2026-10-23 and **removed from Preview** on purpose: every preview deployment has its own hostname, and `trustHost: true` derives the right one per request, which a pinned value cannot. Note `lib/env.ts` still declares `AUTH_SECRET` and `AUTH_URL` as `optionalString` — the "required in production" `superRefine` that A8 accepted was never written, which is why a localhost value passed the build in silence.
- **The Vercel project is linked locally** (`.vercel/`, gitignored), so `vercel env ls` verifies the deployed configuration without a trip through the dashboard. `vercel link` also appended `VERCEL_OIDC_TOKEN` to `.env.local` and a blanket `.env*` to `.gitignore`; the latter was narrowed with `!.env.example` so the committed template stays tracked.
- **Preview and Production share one database.** `DATABASE_URL` and `DATABASE_URL_UNPOOLED` are set on both environments with the same value, so a preview deployment of a branch reads and writes live content — an admin action in a preview is an admin action in production. Give Preview its own Neon branch before anyone uses a preview URL to try the panel.
- **Analytics is Umami Cloud since 2026-10-26** (decision E2 revised from self-hosted). `NEXT_PUBLIC_UMAMI_SCRIPT_URL` and `NEXT_PUBLIC_UMAMI_WEBSITE_ID` are set on Preview and Production and in `.env.local`. The tracker counts only the host of `NEXT_PUBLIC_SITE_URL` (`data-domains`) and renders nothing when that is localhost, so neither previews nor the dev server reach the figures. `middleware.ts` allows Cloud's collector, `gateway.umami.is`, in `connect-src`.
- **Not set on Vercel, and each disables something:** `NEXT_PUBLIC_UMAMI_SHARE_URL` (`/admin/analytics` says the dashboard is not linked), `JOBS_SECRET` (the retention job endpoint cannot be called), `DPO_EMAIL` (NDPR footer contact), `NEXT_PUBLIC_WHATSAPP_NUMBER` and the four `BRANCH_*_EMAIL` inboxes. All of these are blocked-on-Francis content rather than bugs.
- **3 of the 17 templates in §6 are unbuilt.** Done: `/`, `/about`, `/services`, `/services/[slug]`, `/locations`, `/locations/[slug]`, `/doctors`, `/doctors/[slug]`, `/blog` + `/blog/[slug]`, `/book`, `/book/confirmed`, `/contact`, `/contact/thank-you`, `/privacy` + `/terms`, 404 (plus a 500, which §6 does not count). Outstanding: `/for-corporates` and `/hmo-check`, plus `/corporate/thank-you` from baseline item 1, which goes with `/for-corporates`. (`/newsletter/confirmed` was built on 2026-10-26.) `/doctors/[slug]` was added to §6 on 2026-09-28 — §11, the sitemap and §8's delete policy all already assumed it. That ruling also said there would be no index; Francis reversed it on 2026-10-22 and `/doctors` is now the Figma "Our Specialists" page, which the sitemap had never stopped listing and the header's "Our Specialists" item now points at.
- **`/about`, `/doctors` and `/doctors/[slug]` now render real content** (2026-10-24), pulled from paelonmemorial.com: the About prose, three clinicians by name and title, three branches with real addresses and numbers, and six FAQs. What is still missing is what the live site never published — clinician bios, qualifications, headshots, branch coordinates, per-service copy, and `seed/awards.json`. Lines below describe the state before that pass.
- ~~**`/about` and `/doctors/[slug]` render almost nothing, because three content sources are empty.**~~ The `about_content` row ships with every field null, and neither `seed/doctors.json` nor `seed/awards.json` exists — so the About page is a heading and a pending notice, the specialists index is a banner and a pending notice, and no doctor slug resolves. Every template is complete and each section appears the moment its content lands. The About copy is now written in `/admin/about` rather than a file (migration 0005, decision D5), so it needs no deploy; the doctors and awards still need seed files or rows. See `content/README.md` and `seed/README.md`; the copy is founding-story, mission, vision, ESG and clinician-credential content, none of which may be drafted.
- **Three `preview-*` seed records are layout fixtures** — one author, one blog post, one testimonial. They say nothing about Paelon and must be deleted together before launch; removing the author alone breaks the seed run. See `seed/README.md`.
- **One upload serves every page that needs it.** The `media` table is the single store and content rows reference it by id, so the same asset can be a post's hero, a figure in another post's body, and a member of several galleries at once. The picker searches and pages the whole library server-side (`searchMediaRows`), which is what makes that reachable — it previously showed only the 60 newest rows, so an older image could not be found and got uploaded again.
- **`/blog` is now a dynamic route.** Reading `searchParams` for `?q=` and `?tag=` opted it out of static rendering, so the index is server-rendered per request instead of ISR-cached for an hour. Splitting search onto its own route (and tags onto `/blog/tag/[tag]`) would restore it; that is a §6 change and was not taken.

---

Spec gaps worth resolving when they come up: `/hmo-check` and `/newsletter/confirmed` are specified as templates in §6 but missing from the §3 directory tree; the "every content type has `slug`/`published`/`order`" preamble in §5 does not sensibly apply to `bookings`, `contact_submissions`, `corporate_enquiries`, or `newsletter_subscribers`.
