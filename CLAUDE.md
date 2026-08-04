# CLAUDE.md — Paelon Memorial Hospital

Working instructions for Claude Code on this repo.

**Source of truth:** [paelon-website-spec.md](paelon-website-spec.md). This file is the operational summary; the spec wins on any conflict. Read the relevant spec section end-to-end before writing code in a new area.

**Project:** Paelon Memorial Hospital website rebuild · VARYN Studio · Lead: Francis Woods (francis@varyn.ltd)

---

## Phase boundaries — the hardest rule here

| Phase | Scope | Status |
|---|---|---|
| 1 | Public marketing website, booking flow, forms, seed-data content | Current work |
| 2 | CMS, admin panel, auth, booking workflow, analytics dashboard | **Do not build** |
| 3 | Bug fixes, snags (30 days post-launch) | Later |

Phase 1 is a **15 working day hard ceiling**. Never build a Phase 2 feature during Phase 1, even when it is one file away from a Phase 1 task. If a task appears to require it, stop and ask Francis.

Phase 2 surfaces that stay empty in Phase 1: `app/(admin)/`, `components/admin/`, `lib/auth/`, the `users`/`sessions`/`accounts` tables, everything in spec §8.

Phase 1 reads content from `/seed/*.json`. There is no CMS dependency for launch — but the Drizzle schema is written for Phase 2 from day one so no migration is needed to switch reads over.

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
- Zod at every boundary — form submissions, API inputs. Validate on client (UX) *and* server (truth).
- Handle loading and error states explicitly. No silent failures.
- JSDoc on exported functions with non-obvious behaviour.
- Semantic HTML before `<div>`. Sequential heading hierarchy, no skips.
- `next/image` with proper sizes and priority. `next/font/local` with `display: 'swap'`.
- Lucide React icons only. No mixed icon sets.
- Update the spec when a decision changes.

## Never

- Never fabricate content about Paelon — services, awards, patient stories, wait times. If a seed field is empty, add a `TODO(seed)` comment and surface it to Francis. This is a hospital; invented medical claims are a real-world harm, not a placeholder.
- Never disable a Lighthouse or accessibility check to make something pass. Fix the cause.
- Never use `console.log` in shipped code. The one carve-out is the `log.ts` booking destination, which writes structured JSON deliberately.
- Never introduce an auto-rotating slider or carousel. The current site's slider is a named anti-pattern for this brand.
- Never commit `.env.local` or any credential. Never log env vars.
- Never add a Phase 2 feature, a state library, or an out-of-scope item (§17).

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

**SEO:** unique title + meta description, OG/Twitter tags, and canonical on every page. JSON-LD per §11 (`MedicalOrganization`, `Hospital`, `Physician`, `MedicalProcedure`, `FAQPage`, `Article`, `BreadcrumbList`). Dynamic sitemap, robots blocking `/admin`, `/api`, `/book/confirmed`. Descriptive link text — never bare "Read more".

**NDPR:** explicit, never pre-checked consent on every form collecting personal data. No cookie banner needed (Umami is cookieless).

---

## Commands

```bash
npm install
cp .env.example .env.local     # then fill in
npm run dev

npm run typecheck              # tsc --noEmit
npm run lint                   # eslint (not `next lint` — deprecated in 15.5)
npm run build
```

Not wired yet — these arrive with their packages, which need approval first (§16): `db:push`, `db:seed`, `db:generate`, `db:studio` (drizzle-kit + tsx), `test` (vitest), `format` (prettier).

Run typecheck and tests after every meaningful change. Every env var goes in `.env.example` (§14).

Testing floor for Phase 1: Vitest unit tests for utilities and **every** form submission Zod schema (accept + reject cases), plus one Playwright E2E for the booking happy path. No visual regression testing in Phase 1.

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
- Branch email inboxes, NDPR DPO contact
- Privacy Policy / Terms draft for legal review

Spec gaps worth resolving when they come up: `/hmo-check` and `/newsletter/confirmed` are specified as templates in §6 but missing from the §3 directory tree; the "every content type has `slug`/`published`/`order`" preamble in §5 does not sensibly apply to `bookings`, `contact_submissions`, `corporate_enquiries`, or `newsletter_subscribers`.
