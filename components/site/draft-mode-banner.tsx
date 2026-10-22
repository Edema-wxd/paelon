import { draftMode } from "next/headers";

import { PREVIEW_EXIT_ROUTE } from "@/lib/preview/target";

/**
 * "Preview: not published" — on every marketing page while draft mode is on
 * (spec §8 Content editing).
 *
 * Draft mode makes the real site render unpublished rows on their real URLs, so
 * the one thing a reader must never have to guess is whether what they are
 * looking at is live. It says so before the header, in the reading order, rather
 * than as a corner badge.
 *
 * ## Why this does not cost every other page anything
 *
 * A server component reading `draftMode()` is not the same as one reading
 * `cookies()`: during prerendering Next hands it an empty provider and
 * `isEnabled` is `false` with no bail-out, so `next build` still prerenders every
 * marketing route and the §13 budgets are untouched. It renders nothing at all
 * when draft mode is off — no wrapper, no reserved space, so no CLS either.
 *
 * ## Why the exit link is a link
 *
 * A plain `<a>` to a route handler that clears the cookie: no client component,
 * no JavaScript, and it works on the error pages, which must render with JS
 * disabled (CLAUDE.md baseline item 13). The route sends the reader back to the
 * page they were on.
 */
export async function DraftModeBanner() {
  const { isEnabled } = await draftMode();
  if (!isEnabled) return null;

  return (
    <aside
      aria-label="Preview notice"
      className="bg-primary text-primary-foreground"
    >
      <div className="mx-auto flex max-w-360 flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6 lg:px-25">
        <p className="text-sm font-medium">
          <strong className="font-bold">Preview: not published.</strong>{" "}
          <span>
            You are seeing draft content as it would look on the live site.
          </span>
        </p>

        <a
          href={PREVIEW_EXIT_ROUTE}
          className="text-sm font-medium underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          Exit preview and show the published site
        </a>
      </div>
    </aside>
  );
}
