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

> **Ratified.** The admin code built during Phase 1 (`app/(admin)/`, `components/admin/`, `lib/auth/`, `app/api/auth/`) is the Phase 2 base; open questions about it are tracked in `docs/phase-2-decisions.md`.

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
- **Body images are `media` references, never URLs.** `![alt](media:<uuid> "caption")`, block-level only, resolved by `getBodyImages()` and rendered as a `<figure>` with `next/image`. The id carries the alt text and the intrinsic dimensions a URL has nowhere to put, and a figure with no dimensions degrades to its alt text rather than shifting the layout. An image written inside a sentence stays literal text and is refused at publish. Supported block syntax is `##`–`####`, lists, quotes, pipe tables and figures; code blocks, inline code, strikethrough and rules are deliberately absent.
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
3. **FAQ section** — homepage, every service page, every location page. Content from seed, `FAQPage` JSON-LD, native `<details>` accordion (no state library). Answers must exist as real text in the HTML, not injected on expand.
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

Assets and decisions not yet in the spec. Flag these rather than inventing around them:

- Brand colour hex codes (§4 is a placeholder block) and light/dark surface treatments
- Neo Tech `.woff2` files + license
- Seed content drafted from Figma
- WhatsApp Business API provider
- Insta HMS API docs
- Old WordPress URL list for 301 redirects
- Stated response-time promise (how many working hours before a reply)
- Branch email inboxes, NDPR DPO contact
- Privacy Policy / Terms draft for legal review
- **Testimonial consent.** `sarah-adenuga` is the only real quote seeded and carries `consent_given: false`, so it does not render. Confirm consent was given, in what form, and whether the name may appear in full (`name_format`: `full` · `first_only` · `initials`). Until then the homepage shows one placeholder where §6 wants two real ones
- **Phase 2 row B5** in `docs/phase-2-decisions.md`: delete on `services`, `doctors`, `locations` and `hmos` was made `admin`-only on 2026-09-28, which narrows ratified decision B2 option C. It was built to a request, not derived from the spec — §8 says an `editor` has CRUD on content. Confirm or revert. (There is no "super-admin" role; `admin` is the top role in `user_role`, per B1.)
- **Phase 2 row D4** in `docs/phase-2-decisions.md`: a change to `testimonials.consent_given` writes the before and after value to `audit_log`; a change to `quote` writes a SHA-256 of each side rather than the words, because a patient's quote is personal data and the audit log is not a second store of it. Confirm the wording is never needed verbatim for a consent dispute — if it is, the answer is a versioned quote history, not a looser audit log
- **Phase 2 rows B1 and B3** in `docs/phase-2-decisions.md` were taken as defaults, not rulings. B1: UI role labels match the enum, since no request for other names is on record. B3: assumes "media personnel" is a real Paelon role; if not, contributors revert to own-rows-only on every content type (§8 Roles). Confirm both before building role UI or the contributor policy

## Live gaps — true as of 2026-09-15

Not blocked on anyone. Fix when the area is next touched.

- **`npm run db:push` and `npm run db:seed` do not load `.env.local`, so both fail on a missing `DATABASE_URL`.** `drizzle.config.ts` claims drizzle-kit reads the file itself; drizzle-kit only auto-loads `.env`, and `lib/db/seed.ts` runs under bare `tsx`. `upload` is the only script wired with `--env-file`. Until the scripts are fixed — a `package.json`/config change, so ask first — run them as `node --env-file=.env.local ./node_modules/.bin/drizzle-kit push` and `node --env-file=.env.local ./node_modules/.bin/tsx lib/db/seed.ts`. The dev Neon database was pushed and seeded that way on 2026-09-08 (25 tables); `next build` prerenders all 36 routes against it.

  **`drizzle-kit push` also needs a TTY and cannot be scripted.** It stops to ask whether `awards.logo` → `awards.logo_id` is a rename (it is not — `text` URL to `uuid` media id), and with piped output it aborts on "Interactive prompts require a TTY terminal". Migration `drizzle/0002_media_and_award_images.sql` was therefore applied statement by statement with a throwaway copy of `apply-0001.tmp.mts`, on 2026-09-29 with Francis's approval: `media` created, `awards.logo`/`certificate_image` dropped (0 rows, nothing to backfill) and the two uuid FK columns added. 26 tables now. It is still not registered in `drizzle/meta/_journal.json`, so that one interactive `drizzle-kit generate` run is still outstanding.

  **Migration `drizzle/0004_blog_authoring.sql` is applied to dev but not journaled either.** It was applied with `npm run db:apply` on 2026-10-19 with Francis's approval (28 tables): every content image column moved onto `media.id`, `media` gained `width`/`height`, the two gallery arrays became join tables, and `blog_posts` gained a generated `search_vector` with a GIN index. `drizzle-kit generate` still hangs at the same rename prompt, so no `0004_snapshot.json` exists and the journal entry is deliberately absent — adding one without the snapshot would make the next `generate` re-emit all of 0004.

  **Migration `drizzle/0005_about_content.sql` is applied to dev but not journaled either.** Applied with `npm run db:apply` on 2026-10-22 with Francis's approval (29 tables): the About page's prose moved out of `content/about.json` into an `about_content` singleton, edited at `/admin/about`. Legal pages stayed as files — decision C3.

  **Production and Preview have the same drift.** Their databases predate 0002 as well, so the first deploy that renders `/about` will fail on `column "logo_id" does not exist` exactly as the local build did — and now 0004 and 0005 on top of it, so `/blog`, `/about` and every content read would fail too. Only Francis has Vercel access.
- **The Vercel project has no environment variables set**, which is what broke the 2026-09-07 deploy: `serverEnv()` parses the whole schema at once, and `/_not-found` renders `Header`/`Footer`, which read the DB through `lib/content.ts`, so the prerender throws on `DATABASE_URL` and `RATE_LIMIT_SALT` together. Production and Preview each need `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `RATE_LIMIT_SALT`, `NEXT_PUBLIC_SITE_URL` and `CONSENT_TEXT_VERSION`, plus `AUTH_SECRET` and `AUTH_URL` for the admin panel. `NEXT_PUBLIC_SITE_URL` is the dangerous one — it defaults to `http://localhost:3000`, so a build without it succeeds and ships a sitemap and canonicals pointing at localhost. Only Francis has Vercel access.
- **3 of the 17 templates in §6 are unbuilt.** Done: `/`, `/about`, `/services`, `/services/[slug]`, `/locations`, `/locations/[slug]`, `/doctors`, `/doctors/[slug]`, `/blog` + `/blog/[slug]`, `/book`, `/book/confirmed`, `/contact`, `/contact/thank-you`, `/privacy` + `/terms`, 404 (plus a 500, which §6 does not count). Outstanding: `/for-corporates`, `/hmo-check`, `/newsletter/confirmed`, plus `/corporate/thank-you` from baseline item 1, which goes with `/for-corporates`. `/doctors/[slug]` was added to §6 on 2026-09-28 — §11, the sitemap and §8's delete policy all already assumed it. That ruling also said there would be no index; Francis reversed it on 2026-10-22 and `/doctors` is now the Figma "Our Specialists" page, which the sitemap had never stopped listing and the header's "Our Specialists" item now points at.
- **`/about`, `/doctors` and `/doctors/[slug]` render almost nothing, because three content sources are empty.** The `about_content` row ships with every field null, and neither `seed/doctors.json` nor `seed/awards.json` exists — so the About page is a heading and a pending notice, the specialists index is a banner and a pending notice, and no doctor slug resolves. Every template is complete and each section appears the moment its content lands. The About copy is now written in `/admin/about` rather than a file (migration 0005, decision D5), so it needs no deploy; the doctors and awards still need seed files or rows. See `content/README.md` and `seed/README.md`; the copy is founding-story, mission, vision, ESG and clinician-credential content, none of which may be drafted.
- **Three `preview-*` seed records are layout fixtures** — one author, one blog post, one testimonial. They say nothing about Paelon and must be deleted together before launch; removing the author alone breaks the seed run. See `seed/README.md`.
- **`UPLOADTHING_UPLOADS_ENABLED` is dead config** — declared in `lib/env.ts` and `.env.example`, read by nothing since the upload route moved to a session check. Removal is part of row A8 in `docs/phase-2-decisions.md`.
- **Galleries are editable but unrendered.** `/admin/services` and `/admin/locations` have an ordered gallery field (pick from the library, reorder, remove); no marketing template renders a gallery yet, so the rows are stored and invisible. There is no blog-post gallery — a post's images are its hero plus inline body figures.
- **One upload serves every page that needs it.** The `media` table is the single store and content rows reference it by id, so the same asset can be a post's hero, a figure in another post's body, and a member of several galleries at once. The picker searches and pages the whole library server-side (`searchMediaRows`), which is what makes that reachable — it previously showed only the 60 newest rows, so an older image could not be found and got uploaded again.
- **`/blog` is now a dynamic route.** Reading `searchParams` for `?q=` and `?tag=` opted it out of static rendering, so the index is server-rendered per request instead of ISR-cached for an hour. Splitting search onto its own route (and tags onto `/blog/tag/[tag]`) would restore it; that is a §6 change and was not taken.
- **`connect-src` in `middleware.ts` has no UploadThing origin**, so a browser-side uploader will be blocked by CSP once the policy is enforced. `img-src` already allows the CDN.

---

Spec gaps worth resolving when they come up: `/hmo-check` and `/newsletter/confirmed` are specified as templates in §6 but missing from the §3 directory tree; the "every content type has `slug`/`published`/`order`" preamble in §5 does not sensibly apply to `bookings`, `contact_submissions`, `corporate_enquiries`, or `newsletter_subscribers`.
