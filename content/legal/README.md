# Legal documents

Terms of Service and the Privacy Policy. Spec §6 puts these under `content/`
rather than in the database: they are not CMS content, they have no table in
`lib/db/schema.ts`, and they are absent from spec §8's admin CRUD list.

## Status

`terms.json` is a **skeleton**. Every `body` is empty and `published` is
`false`. The headings are a structure for Paelon's legal counsel to fill in;
they make no claims about the hospital. Spec §18 lists the Terms and Privacy
drafts as outstanding, and Phase 1 does not invent them.

`privacy.json` does not exist yet. `/privacy` is linked from the footer and
listed in `app/sitemap.ts`, so it currently 404s. The template that renders
`/terms` is document-agnostic, so adding it is a JSON file plus a page.

## Filling one in

1. Put counsel's text in `body`, one string per paragraph. Keep `id` values as
   they are — section anchors get quoted in correspondence, so they must stay
   stable even when a heading is reworded.
2. Set `effective_date` to an ISO date (`YYYY-MM-DD`).
3. Set `published` to `true`.

`lib/validation/legal.ts` refuses to publish a document that still has an empty
section or no effective date, so step 3 cannot be taken out of order. Until
`published` is true the page renders a pending notice and is served `noindex`.

## When the CMS arrives (Phase 2)

Reads go through `getLegalDocument()` in `lib/legal.ts`, which is already async.
Repointing it at a `legal_pages` table changes that one function; the template
and the page do not change. Making these documents admin-editable also needs a
schema migration and an `/admin/legal` surface that spec §8 does not currently
list — both are Francis's call, not a Phase 1 task.
