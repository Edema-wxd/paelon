import Link from "next/link";

/**
 * Search box for the blog index (Conversion baseline: a reader who arrives
 * looking for one condition should not have to read a grid to find it).
 *
 * A plain `GET` form, so it is a server component with no JavaScript and no
 * state: submitting navigates to `/blog?q=…`, which makes a result page a
 * shareable link and keeps the index renderable without a client bundle. The
 * same reason the category chips are links rather than buttons.
 *
 * `type="search"` rather than `type="text"`: it gets the platform's clear
 * affordance and the right on-screen keyboard. The label is visible rather
 * than a placeholder — CLAUDE.md forbids placeholder-as-label, and a
 * placeholder disappears the moment anyone starts typing.
 *
 * Hidden inputs carry the filters already applied, so searching inside a
 * category stays inside it instead of silently resetting to everything.
 */
export function BlogSearchForm({
  query,
  category,
  tag,
}: {
  query: string;
  category: string | null;
  tag: string;
}) {
  return (
    <form action="/blog" method="get" role="search" className="mt-10 max-w-xl">
      {category ? <input type="hidden" name="category" value={category} /> : null}
      {tag ? <input type="hidden" name="tag" value={tag} /> : null}

      <label
        htmlFor="blog-search"
        className="block text-sm font-medium text-primary"
      >
        Search health articles
      </label>

      <div className="mt-2 flex gap-3">
        <input
          id="blog-search"
          type="search"
          name="q"
          defaultValue={query}
          autoComplete="off"
          maxLength={120}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-4 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-5 py-2.5 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Search
        </button>
      </div>

      {query.length > 0 ? (
        <p className="mt-3 text-sm">
          <Link
            href={
              category
                ? `/blog?category=${encodeURIComponent(category)}`
                : "/blog"
            }
            className="text-accent underline underline-offset-4 hover:no-underline"
          >
            Clear search
          </Link>
        </p>
      ) : null}
    </form>
  );
}
