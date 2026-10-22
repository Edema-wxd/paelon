# Seed data

Phase 1 content source. JSON cannot carry comments, so every outstanding gap is
tracked here. Structure mirrors the Drizzle schema in spec §5 so Phase 2 can
switch reads to Postgres without touching components.

Content here was transcribed from the Figma HTML export. Nothing has been
invented — spec §5 and CLAUDE.md both forbid fabricating hospital content. Where
a field is unknown it is `null` and listed below.

## Launch blockers

These must be resolved with Francis before the site goes live.

- **`locations.json` — phone and emergency line.** `+234 1234 5678` is the value
  in the Figma export and is almost certainly a placeholder (sequential digits).
  A wrong emergency number on a hospital site is a real-world safety issue, not
  a cosmetic snag. Confirm the real hotline before launch.
- **`locations.json` — missing branches.** Only Victoria Island appears in the
  export, but `.env.example` implies four branches (VI, Ikeja, Moshood, Delta).
  Addresses, hours, and per-branch phone numbers are needed for all four.
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

- **`doctors.json` — the file does not exist**, so the `doctors` table is empty.
  Three templates depend on it: the leadership team on `/about` renders nothing,
  `/doctors/[slug]` resolves no slug, and `/doctors` — the Figma "Our
  Specialists" page — shows its pending note instead of a card per clinician.
  The mock's three names carry lorem-ipsum bios, so nothing there is
  transcribable. A doctor's name, title,
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
- **`faqs.json` — the file does not exist**, so every FAQ accordion is absent.
  CLAUDE.md's conversion baseline requires one on the homepage and on every
  service and location page, with `FAQPage` JSON-LD — all of which is built and
  renders nothing. Needed per entry: `question`, `answer`, `slug`, and a
  `category` from `general | booking | services | insurance | emergencies`.
- **The `about_content` row — every field is null.** Not a seed file, and no
  longer a file at all (migration 0005): it is written in `/admin/about`. Same
  gap: the founding story, mission, vision, value proposition, motto and ESG
  block for `/about`. See `content/README.md` for the field list and how the
  page behaves until they are filled in.
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
