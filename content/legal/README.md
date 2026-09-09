# Legal documents

Terms of Service and the Privacy Policy. Spec §6 puts these under `content/`
rather than in the database: they are not CMS content, they have no table in
`lib/db/schema.ts`, and they are absent from spec §8's admin CRUD list.

## Status

Spec §18 lists both drafts as outstanding. Neither document is in force, and
both pages render a notice saying so and are served `noindex`.

`terms.json` is a **skeleton**: every `body` is empty and `published` is
`false`. The headings are a structure for counsel to fill in; they make no
claims about the hospital.

`privacy.json` is **placeholder prose**, requested so the page could be
reviewed in layout before counsel delivers. It carries `placeholder: true` as
well as `published: false`. The wording is shaped to match what the system
actually does — the four forms, the consent checkbox, the twelve-month booking
retention, cookieless analytics — rather than being invented wholesale, so
counsel has a real starting point. Facts nobody has supplied are marked
`[TO CONFIRM]` inline: registered entity details, the DPO contact, transfer
mechanisms, response windows.

**`placeholder` exists because the empty-section guard cannot catch this
case.** Placeholder text is non-empty, so without the flag a document full of
unreviewed wording would satisfy every other check and publish cleanly.

## Filling one in

1. Put counsel's text in `body`, one string per paragraph. Keep `id` values as
   they are — section anchors get quoted in correspondence, so they must stay
   stable even when a heading is reworded.
2. Set `effective_date` to an ISO date (`YYYY-MM-DD`).
3. Set `placeholder` to `false`, if it was true. This is the step that says a
   lawyer has read the words.
4. Set `published` to `true`.

`lib/validation/legal.ts` refuses to parse a published document that still has
an empty section, is still marked `placeholder`, or has no effective date — so
the last step cannot be taken out of order, and a mistake fails the build rather
than reaching a patient. Until `published` is true the page renders a notice and
is served `noindex`.

## When the CMS arrives (Phase 2)

Reads go through `getLegalDocument()` in `lib/legal.ts`, which is already async.
Repointing it at a `legal_pages` table changes that one function; the template
and the page do not change. Making these documents admin-editable also needs a
schema migration and an `/admin/legal` surface that spec §8 does not currently
list — both are Francis's call, not a Phase 1 task.
