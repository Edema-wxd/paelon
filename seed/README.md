# Seed data

Phase 1 content source. JSON cannot carry comments, so every outstanding gap is
tracked here. Structure mirrors the Drizzle schema in spec §5 so Phase 2 can
switch reads to Postgres without touching components.

Content here was transcribed from the Figma HTML export. Nothing has been
invented — spec §5 and CLAUDE.md both forbid fabricating hospital content. Where
a field is unknown it is `null` and listed below.

## Launch blockers

These must be resolved with Francis before the site goes live.

- **`locations.json` — per-branch phone numbers.** Resolved for Victoria
  Island on 2026-10-24 from paelonmemorial.com: `+234 912 512 0020` general,
  `+234 912 512 0027` emergency. (The Figma export's `+234 1234 5678` was the
  placeholder it looked like.) Ikeja and the Moshood Olugbani clinic still have
  no number of their own — the live site publishes only hospital-wide numbers,
  including `(01) 290 0844` for retainer enquiries and `0909 360 8138`. Confirm
  whether each branch has a direct line, and confirm the emergency hotline is
  answered 24/7 as the site states.
- **`locations.json` — the fourth branch.** Three are now seeded from the live
  site: Victoria Island (1221 Ahmadu Bello Way), Ikeja (9 Ajao Street,
  outpatient 9am–5pm Mon–Fri) and Paelon Memorial Clinic (175b Moshood Olugbani
  Street). `.env.example` implies a Delta branch, which the live site does not
  mention at all. Confirm whether it exists. Coordinates are missing for all
  three, so no map or directions link renders yet.
- **`testimonials.json` — second testimonial.** The export shows the homepage
  testimonial block twice with the same name and identical quote text but
  different photos. Only one is seeded here. Spec §6 calls for two real
  testimonials; the second needs a real name, quote, and consent record.
- **General contact email.** `contact@paelonmemorial.com` is transcribed from
  the Figma export and is rendered on `/contact` (inline in
  `app/(marketing)/contact/page.tsx` — spec §5 `locations` has no email column
  and Phase 1 has no site-settings table). Confirm it reaches a monitored
  inbox; an unread address on the contact page is worse than none.
- **Homepage stats (41+ doctors, 4+ digital labs, 45+ years, 15+ awards).**
  Currently inline in `components/site/about-preview.tsx`. Confirm these are
  current before launch. "45+ years of experience" also sits oddly against the
  "established 2010" line the trust ribbon is specified to carry (spec §6) —
  worth checking which is the founding date and which is cumulative.

## Missing content, non-blocking

- **`doctors.json` — three clinicians, no biographies.** Seeded on 2026-10-24
  from the live site's team section: Dr. Ngozi Onyia (Managing Director and
  Founding Partner), Dr. Micheal Talabi (Chief Medical Officer) and Dr. Paulyn
  Nwaukwa (Head of Medical Services). Names and titles only — the live site
  publishes no bios, qualifications, years of experience or languages, and none
  of that may be drafted. **The other nine people on the live team page are
  non-clinical leadership** (ED-COO, Head of Account, HR Manager, Matron and
  so on). They are deliberately not in `doctors`: that table feeds `/doctors`
  and `Physician` structured data, which would assert that an accountant is a
  physician. If `/about` should list them, they need their own content type —
  ask Francis. A doctor's name, title,
  qualifications, specialties, languages, years of experience and biography are
  claims about a real clinician's credentials — the one kind of content on this
  site where a plausible placeholder would be a genuine harm — so none of it is
  drafted. Needed per doctor: `name`, `slug`, `title`, `qualifications[]`,
  `years_experience`, `specialties[]`, `languages_spoken[]`, `bio` (Markdown,
  80–120 words per spec §5), `in_house`, `visiting`, `location_slugs[]`.
  Headshots are listed under Missing assets.
- **`awards.json` — the file does not exist**, so the awards timeline on
  `/about` renders nothing. An award is a claim that a named body gave this
  hospital something; the homepage's "15+ Winning Awards" figure is a launch
  blocker above for the same reason. Needed per award: `name`, `slug`,
  `awarding_body`, `year`, `description`, and `external_link` where the body
  publishes its own page. The SafeCare 5-star rating the trust ribbon carries
  (spec §6) is presumably the first row.
- **`faqs.json` — six entries, all `general` or `services`.** Seeded on
  2026-10-24 from the live site's FAQ section. The conversion baseline wants an
  accordion on the homepage and on every service and location page, and the
  categories `booking`, `insurance` and `emergencies` have no entries at all —
  so a service or location page still renders no FAQ. Booking, HMO cover and
  what to do in an emergency are the three a patient most needs; ask Francis
  for them rather than writing answers about how this hospital works.
- **The `about_content` row — filled on 2026-10-24** from the live About and
  For Patricia pages: intro, founding story, mission, vision, value
  proposition, motto and the ESG paragraph, seeded from `seed/about.json` and
  editable at `/admin/about`. The live page also carries a long welcome letter
  from the Managing Director, which has no section in spec §6 — ask Francis
  whether the new About page should have one.
- **Statistics on the homepage.** The live site publishes 41+ doctors, 4+
  digital laboratory, 45+ years of experience, 15+ winning awards and 10k+
  satisfied clients — but also "44+ years" on the same page and "seven years of
  existence" in the About copy, against a hospital founded in April 2010. The
  figures are inconsistent at source, so none has been seeded. Confirm each
  one.
- `services.json` — every service has `short_description: null`. The export's
  cards show names only. Copy is needed for the services index and detail
  templates, along with `long_description`, `who_its_for`, `how_to_access`,
  `typical_wait_time`, `what_to_expect`.
- `services.json` — `family` values are a best-guess mapping onto the spec §5
  enum (`family_healthcare | women_and_children | specialist | diagnostics`).
  Paediatrics and Obstetrics are filed under `women_and_children`, Lily
  Fertility under `specialist`, General Practice and Family Health under
  `family_healthcare`. Confirm.
- `hmos.json` — `branch_ids`, `coverage_notes`, and `copay_applies` are unknown.
  `copay_applies` currently defaults to `false`, which is a guess; the HMO
  coverage check template (spec §6) needs the real values.
- `blog-posts.json` — empty. `RecentBlogCard` renders an empty state until a
  post exists.
- `testimonials.json` — `date_given` and consent status unknown. Spec §6 says
  photos are used "where consented"; no consent record was supplied.

## Missing assets

Clinician photographs are the gap with two routes open: either upload them in
`/admin/media` and attach one to each doctor (`/doctors` renders a `media` row
directly, at 444x504 on desktop), or deliver files for the build-time pipeline.
The `/doctors` banner photograph — clinicians in consultation, tinted down
behind the heading in the mock — has no slot yet and currently renders as the
flat brand navy.

None of the images referenced by the export were delivered. Components render
labelled placeholders and swap to `next/image` once the files land in `/public`.

`paelon-logo-2-x-10.png` · `paelon-hero-img-10.png` · `img-0237-1-10.png` ·
`frame-130.png` · `frame-150.png` · `frame-160.png` · `frame-170.png` ·
`frame-180.png` · `axa-mansard-10.png` · `leadway-10.png` · `avon-10.png` ·
`cigna-10.png` · `patient-review2.png` · `patient-review4.png` ·
`vector-10.svg`

Also needed and absent from the export entirely: the SafeCare 5-star badge for
the trust ribbon (spec §6), and a headshot per doctor for the leadership team on
`/about` and the profile at `/doctors/[slug]`. Both templates read the local
`portrait` slot by doctor slug (`assets/portrait/<slug>.png`) and fall back to a
labelled placeholder, so a doctor can be published before their photograph
arrives. The `doctors.headshot` column holds an UploadThing key and is not what
the templates read — see the CRUD image-field gap in CLAUDE.md.

---

## Seed contract (added with the backend)

`npm run db:seed` now loads these files into Postgres, and `npm run seed:report`
lists every unfilled field without writing anything. The loader is idempotent —
it upserts on `slug`, so running it twice leaves row counts unchanged.

Keys stay `snake_case`, mirroring the database columns. Unknown keys are
ignored, so nothing here had to change to make seeding work.

### Relations are expressed as slugs

The loader resolves relation slugs to UUIDs in a second pass. The current files
predate this and use `branch_ids: []` / `branch_id: null`, which the loader
ignores. To attach records to branches, rename them:

| Current key | Loader expects | Files |
|---|---|---|
| `branch_ids` | `location_slugs` | `services.json`, `hmos.json`, `doctors.json` |
| `branch_id` | `location_slug` | `testimonials.json` |
| — | `service_slug` | `testimonials.json` |
| — | `related_slugs` | `services.json`, `blog-posts.json` |
| — | `author_slug` (required) | `blog-posts.json` |

Values are slugs, not UUIDs — e.g. `"location_slugs": ["victoria-island"]`.

### `consent_given` on testimonials

`testimonials.json` now needs `consent_given: true` for a testimonial to appear
on the public site. It defaults to `false`, so the seeded Sarah Adenuga
testimonial will **not** render from the database until consent is recorded.
This is deliberate: spec §6 permits real names and photos "where consented", and
no consent record was supplied. It needs to be confirmed with Francis before
launch, not defaulted to true.

(The homepage currently reads these files directly through `lib/content.ts`, so
this does not change what renders today.)

### `hours` on locations

`locations.json` has no `hours` yet, so branches seed with `{}` — a visible
"not supplied" rather than an invented schedule. Once known, the shape is:

```json
"hours": {
  "mon": { "open": "08:00", "close": "18:00" },
  "sun": { "closed": true }
}
```

All seven day keys are required. A 24-hour branch is
`{ "open": "00:00", "close": "23:59" }` — which branches are 24/7 is still an
open question for Francis.

### `booking_email`

`locations.booking_email` is where branch booking notifications go. Until it is
filled, the backend falls back to the `BRANCH_*_EMAIL` env vars matched by slug.
If neither is set, the booking is still saved but nobody is notified, and the
backend logs `booking.branch_inbox_missing`.

---

## Preview fixtures — delete before launch

Three seed records exist only so templates can be reviewed. None of them says
anything about Paelon, and none may survive to production.

| File | Record | Why it exists |
|---|---|---|
| `authors.json` | `preview-author` | `blog_posts.author_id` is NOT NULL, so a post cannot exist without an author row |
| `blog-posts.json` | `preview-post-layout-fixture` | Exercises every Markdown block the article template renders. Two internal links, both to routes that resolve |
| `testimonials.json` | `preview-testimonial-placeholder` | Gives the homepage a second card so the two-up layout can be judged |

Delete all three together — removing the author alone breaks the seed run.

## Testimonial consent — blocking

`sarah-adenuga` carries `consent_given: false` and therefore **does not render**.

The quote was transcribed from the Figma export. `testimonials.consent_given`
gates public display because a testimonial is a real patient's words, and spec
§6 permits real names only where consented. Nobody has recorded that Sarah
Adenuga agreed to appear on the site, and assuming it is not something a seed
file may do.

Two things are needed from Francis:

1. Confirmation that consent was given, and in what form. Then set
   `consent_given: true` and fill `date_given` with the date it was given.
2. Whether the name may appear in full, or should be shortened — `name_format`
   accepts `full`, `first_only` or `initials`.

Until then the homepage shows one testimonial (the placeholder). Spec §6 asks
for two real ones.
