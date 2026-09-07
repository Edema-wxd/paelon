# Backend decisions — Phase 1

Every blocking item in `paelon-backend-technical-spec.md` §23, with the decision
taken and where it lives in code. Master spec §16 warns that migrations are
one-way, so this file exists to make the schema choices reviewable rather than
archaeological.

Four were answered by Francis directly. The rest were taken as the backend
spec's own recommendation — each is either additive (a nullable column that
costs nothing if unwanted, and a second migration against populated tables if
added later) or reversible in application code. **Anything below marked
"assumed" should be confirmed; none of it is a guess about hospital content,
only about implementation shape.**

---

## Answered by Francis

| # | Question | Decision |
|---|---|---|
| 8 | Booking reference sequencing | **Single non-resetting sequence.** `PMH-<year>-<global counter>`. Race-free, no annual migration. `drizzle/0001`, `lib/booking/reference.ts` |
| 10 | Date window contradiction (§7 says 7 days, validation says 90) | **Server accepts 90 days; the 7-day picker is a UX constraint.** Widening the picker later needs no server change. `lib/validation/primitives.ts` |
| 11 | `reason_for_visit` is health data | **Collected and stored, excluded from branch emails and from every log line.** Staff read it on the Phase 2 admin record. `lib/email/templates/booking.ts`, `lib/booking/destinations/log.ts` |
| — | Package installs | **Approved:** `drizzle-orm`, `@neondatabase/serverless` (both already on master spec §2's install-upfront list) plus `drizzle-kit`, `tsx`, `vitest` as devDependencies |

---

## Taken as the spec's recommendation (assumed — please confirm)

| # | Question | Decision and reasoning |
|---|---|---|
| 1 | Join tables vs `uuid[]` | **Join tables.** Postgres arrays cannot carry foreign keys, so `uuid[]` loses referential integrity and makes "which services are at branch X" slow. Deviates from master spec §5's field list. `service_locations`, `service_related`, `doctor_locations`, `hmo_locations`, `blog_post_related` |
| 2 | `testimonials.consent_given` | **Added, default false.** Consent is a compliance fact about a real patient; public reads require it to be true, so an unrecorded consent means the testimonial stays invisible rather than shipping on an assumption |
| 3 | `audit_log` table | **Added** (Phase 2, defined now). A healthcare operator with three staff roles needs to answer "who viewed or changed this booking" during an incident. `booking_status_history` covers transitions only |
| 4 | `created_by_user_id` on content tables | **Added, nullable, unused in Phase 1.** Phase 2's `contributor` role needs per-row ownership; adding it later is a second one-way migration against populated tables |
| 5 | `hmos.aliases` | **Added.** Without it the typeahead misses "AXA" → "AXA Mansard Health". Indexed for trigram search alongside `name` |
| 6 | `consent_text_version` / `consent_given_at` | **Added to all four submission tables.** Which privacy policy wording someone agreed to is impossible to reconstruct after the fact. Sourced from `CONSENT_TEXT_VERSION` |
| 7 | `locations.booking_email` vs env-only routing | **Column, with the `BRANCH_*_EMAIL` env vars as a Phase 1 fallback keyed by slug.** A branch added through the Phase 2 CMS would otherwise need a redeploy. `lib/booking/destinations/email.ts` |
| 9 | Retention approach | **Anonymise in place.** `anonymised_at` added to `bookings`, `contact_submissions`, `corporate_enquiries`; personal columns made nullable so they can actually be nulled. Preserves reporting continuity while removing personal data, which is the real NDPR obligation. The retention *job* is Phase 2/3 — nothing is 12 months old during a 15-day build — but the columns had to be right now |
| 14 | Phone parsing | **Hand-rolled Nigerian normaliser**, no `libphonenumber-js`. Small format space, and a dependency needs approval anyway. `normaliseNigerianPhone`, 20 test cases |
| 15 | Email templates | **Hand-written HTML + plain-text**, no `@react-email/components`. Five transactional messages do not justify a dependency |
| 16 | SMTP fallback | **Dropped.** `nodemailer` is not approved, and a fallback that is never exercised is a liability. The DB write is already the source of truth |
| 17 | Rate limiting | **Postgres-backed fixed window.** No Vercel KV (Vercel-lock), no Redis (unapproved). IPs salted and hashed, 24h retention |
| 21 | Seed strategy | **Option A — seed into the DB, read from the DB.** Read path is identical in both phases; master spec §15's local setup already runs `db:push` then `db:seed` before `dev` |
| 22 | Drizzle driver | **Split: `db()` over HTTP as default, `dbTx()` over the WebSocket pool** for the two transactional paths (booking insert, newsletter confirm) |
| 23 | Newsletter confirm | **GET → confirm page → POST.** Email clients and security scanners prefetch links; confirming on GET would silently confirm subscriptions nobody clicked, defeating double opt-in |
| 25 | Map provider | **No map origin allowlisted.** The CSP in `middleware.ts` deliberately has no map entry — a Google Maps embed sets third-party cookies and would undermine master spec §14's "no cookie banner required" position. Recommend a static map image + "get directions" link |

---

## Deliberately not built

| Item | Why |
|---|---|
| Insta HMS integration | Master spec §7 and §10 both say stub only, docs outstanding. Class exists, `enabled = false`, `send()` throws |
| WhatsApp provider | Undecided (master spec §18). Abstraction built, `NoopProvider` resolved. **Timing risk: Business API templates take days to approve — if launch confirmations are wanted, provider selection cannot wait for week three** |
| Retention job | Decision captured in the schema; the job itself is Phase 2/3 |
| Everything in Phase 2 | Auth, admin routes, server actions, UploadThing, booking workflow, rich text editor. Schema is in place, so Phase 2 is purely additive |
| Admin editing for legal pages | Requested during Phase 1. Needs a `legal_pages` table, an `/admin/legal` surface that master spec §8's CRUD list does not contain, and the auth to protect it — three Phase 2 items. `/terms` ships reading `getLegalDocument()` in `lib/legal.ts`, already async, so Phase 2 repoints one function and neither the template nor the page changes. See `content/legal/README.md` |

---

## Spec corrections worth folding back in

1. **`UMAMI_*` env vars need the `NEXT_PUBLIC_` prefix.** Master spec §14 lists
   `UMAMI_WEBSITE_ID` and `UMAMI_SCRIPT_URL` without it, but they render a
   client-side script tag and cannot work server-only. `.env.example` uses the
   prefixed names.
2. **`db:migrate` was missing from master spec §15's script list.** `db:push` is
   for local iteration only and must never run against production. Added.
3. **New env vars this design needs:** `RATE_LIMIT_SALT` (required — hashing
   IPs), `CONSENT_TEXT_VERSION`, `JOBS_SECRET`, `DPO_EMAIL`,
   `NEXT_PUBLIC_WHATSAPP_NUMBER`. All documented in `.env.example`.
4. **Master spec §5's "every content type has `slug`/`published`/`order`"
   preamble does not apply to the submission tables** (`bookings`,
   `contact_submissions`, `corporate_enquiries`, `newsletter_subscribers`).
   They are not content and carry none of those columns.

---

## Still blocked on Francis

Flagged rather than worked around:

- **Branch list and real booking inboxes.** `.env.example` names VI / Ikeja /
  Moshood / Delta; only Victoria Island is seeded. A booking at a branch with no
  `booking_email` and no env fallback logs `booking.branch_inbox_missing` — the
  booking is safe in the database, but nobody is being told about it.
- **Which branches are 24/7**, for the `hours` jsonb. A branch with no supplied
  hours seeds as `{}`, which is in the column's type so consumers must handle it.
- **Corporate enquiries inbox.** Currently falls back to `BRANCH_VI_EMAIL` with
  a `TODO(francis)` rather than being dropped.
- **DPO contact** for the footer and the DSAR runbook's destination.
- **Old WordPress URL list** for the 301s. `lib/redirects.ts` is scaffolded and
  empty — a guessed redirect is worse than none, because it sends real traffic
  to the wrong page and hides the 404s that would reveal the mistake.
- **Privacy policy wording**, which fixes the first real `CONSENT_TEXT_VERSION`.
- **Terms of Service wording** (master spec §18, same legal review as the
  privacy policy). `content/legal/terms.json` ships as a thirteen-section
  skeleton with every body empty and `published: false`; the page renders a
  pending notice and is served `noindex`. `lib/validation/legal.ts` refuses to
  parse a document that is published while any section is still empty or has no
  effective date, so it cannot go live half-written.
- **`/privacy` has no page at all.** It is linked from the footer on every page
  and listed in `app/sitemap.ts`, so it currently 404s. The template that
  renders `/terms` is document-agnostic — adding it is a JSON file plus a page,
  once the draft exists.
