# Content and assets required — Paelon Memorial Hospital

What we need from Paelon to finish the Phase 1 website. Generated from the live
codebase on **2026-09-07**, not from the brief: every line below is a field a
template already reads, or an asset a component already has a slot for.

Regenerate the raw field-level view any time with `npm run seed:report`.

**Nothing on this list has been invented.** Spec §5 and CLAUDE.md forbid
fabricating hospital content, so where material is missing the site renders a
visible "not confirmed yet" note rather than plausible filler. That is why the
gaps are easy to find — and why they are also visible to anyone reviewing the
staging site.

Most of the *build* is not blocked on this list. What is blocked is **going
live**.

---

## 1. Safety and legal — needed before anything is shown publicly

| # | What | Why it cannot wait |
|---|---|---|
| 1.1 | **Real emergency line** | `+234 1234 5678` is a Figma placeholder currently rendering on the footer, the 404, the 500 and every branch page. A wrong emergency number on a hospital site is a safety issue, not a snag. |
| 1.2 | **Real switchboard number per branch** | Same placeholder, same problem. |
| 1.3 | **Privacy Policy draft** (for legal review) | `/privacy` does not exist but is linked from the footer, both consent checkboxes and the error page — those links 404 today. NDPR consent that points at a missing policy is not valid consent. |
| 1.4 | **Named NDPR Data Protection Officer** — name + email | Required in the footer. Fills `DPO_EMAIL`. |
| 1.5 | **Terms of Use draft** (for legal review) | `/terms` ships as a 13-section skeleton, `published: false`, served `noindex`. It cannot go live half-written — validation refuses it. |
| 1.6 | **Testimonial consent — Sarah Adenuga** | Her quote is seeded but `consent_given: false`, so it does not render. We need: was consent given, in what form, and may the full name appear (`full` / `first_only` / `initials`)? Without this the homepage shows one placeholder where the spec wants two real testimonials. |

---

## 2. Branches — the largest single gap

Only **Victoria Island** is seeded, with address and nothing else. `.env.example`
implies four branches: `victoria-island`, `ikeja`, `moshood`, `delta`.

For **each** branch, in `seed/locations.json`:

| Field | Format | Status |
|---|---|---|
| `name`, `slug` | text | ✅ VI only |
| `address_line_1`, `address_line_2`, `city`, `state` | text | ⚠️ VI only, line 2 empty |
| `phone` | `+234 …` | ❌ placeholder |
| `emergency_line` | `+234 …` | ❌ placeholder |
| `whatsapp` | `+234 …` | ❌ none |
| `hours` | per-day, see below | ❌ **none — branch pages show a pending notice** |
| `latitude`, `longitude` | decimal degrees | ❌ none — directions fall back to an address string, which can resolve to the wrong side of a Lagos street |
| `parking_info` | short text | ❌ none |
| `accessibility_notes` | short text | ❌ none |
| `hero_image`, `gallery_images` | image files | ❌ none |
| `booking_email` | inbox for that branch's bookings | ❌ none |
| services available at this branch | list of service slugs | ❌ none |

**Hours format** — all seven days, every branch. A closed day is `{"closed": true}`;
24-hour is `{"open": "00:00", "close": "23:59"}`:

```json
"hours": {
  "mon": { "open": "08:00", "close": "18:00" },
  "tue": { "open": "08:00", "close": "18:00" },
  "sat": { "open": "09:00", "close": "14:00" },
  "sun": { "closed": true }
}
```

We also need to know **which branches are 24/7**, if any.

---

## 3. Services

Five services are seeded with names, families and card images. Every descriptive
field is empty, so `/services` and `/services/[slug]` can be built but will
render empty states.

Seeded: Paediatrics · Obstetrics and Gynaecology · Lily Fertility Clinic ·
General Practice · Family Health.

Per service, in `seed/services.json`:

| Field | Format | Status |
|---|---|---|
| `short_description` | ≤ 200 chars, used on cards | ❌ **empty on all five** |
| `long_description` | 150–250 words, plain language | ❌ none |
| `who_its_for` | list of short phrases | ❌ none |
| `how_to_access` | list — private, corporate, HMO | ❌ none |
| `typical_wait_time` | text, or omit if unknown | ❌ none |
| `what_to_expect` | text | ❌ none |
| `location_slugs` | which branches offer it | ❌ none |
| `related_slugs` | other service slugs | ❌ none |

**Also needed: the full service list.** Five services is unlikely to be
everything Paelon offers.

⚠️ **And a conflict to settle.** Spec §6 asks for three homepage cards — Family
Healthcare, Women and Children, **Corporate Healthcare**. The Figma export shows
the five services above, none of which is Corporate Healthcare. The
`service_family` enum has no corporate value at all (`family_healthcare`,
`women_and_children`, `specialist`, `diagnostics`). Three sources, three
answers. Which set is right? The homepage renders from seed data, so switching
is a data edit — but adding a corporate family is a schema migration, and those
are one-way.

---

## 4. Content types with no file at all

These have database tables, query layers and validation ready. There is no seed
file, so nothing renders.

### 4.1 `seed/faqs.json` — **blocks three template sections**

Required on the homepage, every service page and every location page. Each entry:

```json
{ "slug": "…", "question": "…", "answer": "…",
  "category": "general | booking | services | insurance | emergencies",
  "order": 1 }
```

Suggested minimum: 5–8 general, plus 3–5 each for booking, insurance and
emergencies.

### 4.2 `seed/awards.json` — blocks the About timeline and the homepage trust ribbon

Per award: `name`, `awarding_body`, `year`, `description`, plus logo and
certificate image where available. **SafeCare 5-star** and **IFC EDGE** are both
referenced in the spec and neither is seeded.

### 4.3 `seed/doctors.json`

Per doctor: `name`, `title`, `qualifications[]`, `years_experience`,
`specialties[]`, `languages_spoken[]`, `bio` (80–120 words), `headshot`,
`in_house` / `visiting`, and which branches.

⚠️ **Scope question, not just content.** Spec §6's fifteen templates include no
doctors page, but §11 requires `Physician` JSON-LD "on each doctor profile" and
`app/sitemap.ts` already lists `/doctors`. Confirm whether doctor profiles are in
Phase 1 before we gather bios.

### 4.4 Blog articles

One post exists and it is a layout fixture that will be deleted. Per article:
title, excerpt (≤ 300 chars), body, hero image, author, category
(`seasonal_alerts` / `family_health` / `women_and_children` /
`corporate_wellness`), publication date.

Also needed: **real author records** — name, role, bio, headshot. Case studies on
`/for-corporates` are drawn from posts tagged `corporate_wellness`, so that page
stays empty until some exist.

---

## 5. HMOs

Four are seeded with names and logos. Everything a patient actually needs to know
is missing — which is most of the point of the coverage checker.

Per HMO: which branches accept it, `coverage_notes`, whether a copay applies,
`plan_notes`. **Also: is four the complete list?**

---

## 6. About page — blocked almost entirely

`/about` cannot be built in any meaningful form without:

- **Founding story** — Patricia, and Dr. Ngozi Onyia.
- **The "For Patricia" standfirst** — the homepage block exists and its copy is
  outstanding. Patricia is a real person; this is not copy we can draft.
- **Mission, Vision, Value Proposition, Motto** — as final wording.
- **Leadership team** — name, role, bio and photo for each.
- **Awards and accreditations** — see 4.2; rendered as a timeline.
- **ESG / IFC EDGE certification** — the claim, the certificate, and what may be
  said about it.
- **Founding year** — "established 2010" comes from the spec, and the About
  section of the Figma export disagrees. Which is right?

---

## 7. For Corporates

- **Retainer programme overview** — what is offered, to whom, how it works.
- **Case studies** — see 4.4.
- **Qualifying criteria** — what disqualifies an enquiry, if anything.

---

## 8. Assets

### Delivered ✅
Hero image · five service card images · four HMO logos · theatre / about-feature
image · logo.

### Outstanding

| Asset | Note |
|---|---|
| **Neo Tech `.woff2` + license** | `public/fonts/` is empty; the site is running on a fallback stack. Affects every page. |
| **Brand colour hex codes** | Current values were extracted from the Figma HTML export and are unconfirmed. |
| **Dark surface treatment** | Spec §4 leaves it undefined. |
| **Proper vector logo** | `assets/logo/main.svg` is a 175×81 raster wrapped in SVG — it will blur on retina and in the share card. |
| **SafeCare 5-star badge artwork** | Homepage trust ribbon. |
| **Branch photography** | Hero + gallery per branch, 4 branches. |
| **Patient photographs** | `assets/portrait/` is empty. **Only with written consent** — see 1.6. |
| **Doctor headshots** | See 4.3. |
| **Blog hero images** | One per article. |
| **IFC EDGE certificate image** | About page. |

---

## 9. Decisions — not content, but blocking the same way

| Item | Blocks |
|---|---|
| **Response-time promise** — how many working hours before a reply | Required beside every form's submit button and on every thank-you page. One number, used everywhere. |
| **WhatsApp Business API provider** | The abstraction is built and no-ops. ⏰ **Timing risk: Business API message templates take days to approve.** If launch-day WhatsApp confirmations are wanted, this cannot wait. |
| **Insta HMS API documentation** | The booking destination is stubbed and disabled until docs arrive. |
| **Old WordPress URL list** | Needed for 301 redirects. Without it, every existing search ranking and inbound link breaks on launch day. Guessing is worse than nothing. |
| **Navigation structure** | The Figma export and spec §6 disagree. Export: Medical Services · Our Specialties · About Us · Contact Us · Emergency. Spec: services dropdown · locations · for patients · for corporates · Book CTA. |
| **"Our Specialties" destination** | Present in the Figma nav and the hero, with no page defined anywhere. Currently points at `/services`. |
| **Homepage service cards** | Three sources disagree on which services appear — see section 3. |
| **Domain access with Paelon IT** | Deployment and DNS. |
| **Booking notification inboxes** | Per branch — see section 2. |

---

## Priority order

If material arrives piecemeal, this is the order that unblocks the most:

1. **Section 1 in full** — emergency and switchboard numbers, DPO, privacy draft,
   testimonial consent. Safety and legal; nothing should be publicly visible
   without it.
2. **Branch data** (section 2) — hours and coordinates especially. Four branch
   pages, the footer, the booking flow and the location schema all read it.
3. **Service descriptions** (section 3) — unblocks two templates and the booking
   flow's service step.
4. **FAQs** (4.1) — required on three separate template types.
5. **Response-time promise and WhatsApp provider** (section 9) — one is a
   one-line answer, the other has an external approval clock on it.
6. **About content** (section 6) — one template, but it is entirely blocked.
7. Everything else.

---

## What is *not* blocked

Worth stating plainly, so this list is not read as "work has stopped".

The booking flow, the thank-you routes, the HMO coverage checker, the services
templates, the corporate enquiry form and the FAQ component can all be built now
against empty or partial data — they will render pending notices where material
is missing, and fill in the moment it arrives. No template needs to be rewritten
when content lands.
