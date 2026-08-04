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
- **Homepage stats (41+ doctors, 4+ digital labs, 45+ years, 15+ awards).**
  Currently inline in `components/site/about-preview.tsx`. Confirm these are
  current before launch. "45+ years of experience" also sits oddly against the
  "established 2010" line the trust ribbon is specified to carry (spec §6) —
  worth checking which is the founding date and which is cumulative.

## Missing content, non-blocking

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

None of the images referenced by the export were delivered. Components render
labelled placeholders and swap to `next/image` once the files land in `/public`.

`paelon-logo-2-x-10.png` · `paelon-hero-img-10.png` · `img-0237-1-10.png` ·
`frame-130.png` · `frame-150.png` · `frame-160.png` · `frame-170.png` ·
`frame-180.png` · `axa-mansard-10.png` · `leadway-10.png` · `avon-10.png` ·
`cigna-10.png` · `patient-review2.png` · `patient-review4.png` ·
`vector-10.svg`

Also needed and absent from the export entirely: the SafeCare 5-star badge for
the trust ribbon (spec §6).
