# Content files

Page copy that has no rows in it. Everything here is read at build time, parsed
once by a Zod schema, and changed by PR — not through the admin panel.

| File | Renders on | Loader | Schema |
|---|---|---|---|
| `legal/privacy.json` | `/privacy` | `lib/legal.ts` | `lib/validation/legal.ts` |
| `legal/terms.json` | `/terms` | `lib/legal.ts` | `lib/validation/legal.ts` |

See `legal/README.md` for the two legal documents, which have their own rules
about counsel review and `CONSENT_TEXT_VERSION`. Decision C3 keeps them here
on purpose: each recorded consent points at a wording version, and a page
edited in place breaks the link between that version and the words the person
agreed to.

`about.json` used to sit beside them. It moved into Postgres on 2026-10-22
(migration 0005, decision D5) and is now written in `/admin/about` — see the
section below for what the fields are and how the page behaves while they are
empty.

## The About page (`about_content`, not a file)

Spec §6 asks the About page for a founding story, a mission, a vision, a value
proposition, a motto and an ESG block. Six singleton fields, which lived here
as `about.json` until the one-row-table objection stopped mattering: Paelon
wanted to write the founding story without a deploy. They are now the
`about_content` row, written in `/admin/about`, read through `lib/about.ts` —
which is the only file that changed, because its getter was always async.

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

### Filling it in

Everything below happens in `/admin/about`, as an editor or an admin.

1. Write the sections. Internal links as `[descriptive text](/path)`, pointing
   at routes that exist. The editor's preview is the renderer the public page
   runs.
2. Leave **"this copy is a draft nobody at Paelon has confirmed"** ticked while
   the wording is provisional. It blocks publishing on its own, because draft
   prose is non-empty and would otherwise satisfy every other check.
3. Tick **"publish the About page"** once the intro, founding story, mission,
   vision and value proposition are all real. The save is refused without them
   and names the ones still missing. The motto and the ESG block stay optional
   — the hospital may have neither, and a flag defaulting either way would be
   asserting something.
4. The save revalidates `/about` immediately; there is no deploy and no wait.

The guards live in `lib/validation/about.ts` and run on the server whatever the
form does. `tests/about-schema.test.ts` covers both sides.
