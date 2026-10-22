# Content files

Page copy that has no rows in it. Everything here is read at build time, parsed
once by a Zod schema, and changed by PR — not through the admin panel.

| File | Renders on | Loader | Schema |
|---|---|---|---|
| `about.json` | `/about` | `lib/about.ts` | `lib/validation/about.ts` |
| `legal/privacy.json` | `/privacy` | `lib/legal.ts` | `lib/validation/legal.ts` |
| `legal/terms.json` | `/terms` | `lib/legal.ts` | `lib/validation/legal.ts` |

See `legal/README.md` for the two legal documents, which have their own rules
about counsel review and `CONSENT_TEXT_VERSION`.

## `about.json`

Spec §6 asks the About page for a founding story, a mission, a vision, a value
proposition, a motto and an ESG block. Six singleton fields — an `about` table
would hold exactly one row, and editing it would need its own admin screen, so
this follows the legal pages into `content/` instead. If it ever becomes a
table, `lib/about.ts` is the only file that changes.

The rest of the page comes from Postgres and is edited in the panel: the
leadership team is the `doctors` table (`/admin/doctors`, each card linking to
`/doctors/[slug]`) and the timeline is the `awards` table (`/admin/awards`).

### Status

**Every field is `null`, and `published` is `false`.** Nothing on this page has
been written. The founding story is about Patricia and Dr. Ngozi Onyia — real
people — and the mission, vision and ESG lines are claims the hospital makes
about itself. CLAUDE.md forbids drafting any of it, and a hospital is the wrong
place to soften that: an invented certification claim is a real-world harm, not
a placeholder.

While `published` is `false` the route is served `noindex, follow` — `follow`
so the doctor profiles linked from the page are still discovered.

### Fields

| Field | Format | Renders as |
|---|---|---|
| `intro` | Markdown | Lede under the `h1`, and the meta description |
| `founding_story` | Markdown | "Our story" |
| `mission` | Markdown | "Our mission" |
| `vision` | Markdown | "Our vision" |
| `value_proposition` | Markdown | "What we offer" |
| `motto` | Plain text, one line, ≤200 chars | Pull quote |
| `esg` | Markdown | "Sustainability and certification" |

A `null` field takes its heading with it — a heading with nothing under it reads
as a page that failed to load, and it breaks the sequential heading hierarchy
§12 requires. Whitespace-only counts as `null`.

Markdown goes through `lib/markdown.ts` and `components/site/article-body.tsx`,
the same renderer the blog uses: headings start at `h2`, and an unsafe `href`
degrades to text. No HTML, no MDX.

### Filling one in

1. Replace the `null`s with the real copy. Internal links as
   `[descriptive text](/path)`, pointing at routes that exist.
2. Leave `placeholder: true` if the wording is a draft nobody at Paelon has
   confirmed yet. It blocks publishing on its own, because placeholder prose is
   non-empty and would otherwise satisfy every other check.
3. Set `published: true` once `intro`, `founding_story`, `mission`, `vision` and
   `value_proposition` are all real. The schema refuses to publish without them
   and names the ones still missing. `motto` and `esg` stay optional — the
   hospital may have neither, and a flag defaulting either way would be
   asserting something.
4. `npm run typecheck && npm run test` — `tests/about-schema.test.ts` covers the
   guards, and a malformed file fails the build rather than rendering.
