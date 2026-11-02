import { inSentence } from "@/lib/admin/resource-config";
import { internalLinks, normalisePath } from "@/lib/blog/internal-links";

/**
 * What deleting a content row would break, and what it would merely change.
 *
 * The pure half of the pre-delete check: the shapes, the link matching and the
 * refusal wording. The half that reads rows is `lib/admin/delete-checks.ts`.
 * Split so the matching rules are unit-testable without a database, and so the
 * delete form (a client component) can import the types.
 *
 * ## Blockers and effects
 *
 * A delete is soft and reversible in the database, but a public URL 404s the
 * moment it lands. So every finding is one of two kinds:
 *
 *  - **blocker** — something live would break: a published page links to the
 *    row and would send readers to a 404, a published post would fail its own
 *    publish check on its next save, or the booking form would lose its last
 *    branch. The delete is refused until it is fixed.
 *  - **effect** — something quietly drops out and comes back on a restore: a
 *    branch page lists one service fewer, a byline stops linking to a doctor's
 *    profile. Shown before the delete, never a reason to refuse it.
 */

/** A row the editor can open to fix or check a finding. */
export interface ImpactItem {
  label: string;
  /** The admin editor for that row. */
  href: string;
}

export interface DeleteIssue {
  title: string;
  detail: string;
  items?: readonly ImpactItem[];
}

export interface DeleteImpact {
  blockers: readonly DeleteIssue[];
  effects: readonly DeleteIssue[];
}

export const NO_IMPACT: DeleteImpact = { blockers: [], effects: [] };

/** The public URLs a row owns, and the booking deep link that names it. */
export interface LinkTarget {
  paths: readonly string[];
  /** `/book?service=<slug>` or `/book?branch=<slug>` pre-fills a step (§7). */
  book?: { param: "service" | "branch"; slug: string };
}

/**
 * The URLs a link would have to name to point at this row, or `null` for a type
 * with no public page of its own (HMOs, testimonials, awards, FAQs, authors).
 */
export function linkTargetFor(resource: string, slug: string): LinkTarget | null {
  if (!slug) return null;
  switch (resource) {
    case "services":
      return { paths: [`/services/${slug}`], book: { param: "service", slug } };
    case "locations":
      return { paths: [`/locations/${slug}`], book: { param: "branch", slug } };
    case "doctors":
      return { paths: [`/doctors/${slug}`] };
    case "blog":
      return { paths: [`/blog/${slug}`] };
    default:
      return null;
  }
}

/**
 * Does `href` point at `target`?
 *
 * Exact on the route, as `normalisePath` reads it: `/services/cardiology#fees`
 * matches `cardiology`, `/services/cardiology-clinic` does not. A booking link
 * matches on its query parameter, because `/book` itself survives the delete
 * and only the pre-fill is lost.
 */
export function hrefLinksTo(href: string, target: LinkTarget): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  const path = normalisePath(href);
  if (target.paths.includes(path)) return true;

  if (target.book && path === "/book") {
    const query = href.split("#")[0]?.split("?")[1];
    if (!query) return false;
    return new URLSearchParams(query).get(target.book.param) === target.book.slug;
  }
  return false;
}

/**
 * Does a Markdown body link to `target`? Read through the same parser the site
 * renders with, so a slug mentioned in prose, or a link degraded to text for an
 * unsafe href, is not mistaken for a link.
 */
export function markdownLinksTo(source: string, target: LinkTarget): boolean {
  return internalLinks(source).some((link) => hrefLinksTo(link.href, target));
}

/** "“A”, “B” and 3 more" — named, so the editor knows where to look. */
export function nameList(labels: readonly string[], max = 3): string {
  const named = labels.slice(0, max).map((label) => `“${label}”`);
  const more = labels.length - named.length;
  if (more > 0) return `${named.join(", ")} and ${more} more`;
  if (named.length <= 1) return named.join("");
  return `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

/** `1 post` / `3 posts`. */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * The message a refused delete returns: every blocker, so an editor who fixes
 * one is not then told about the next.
 */
export function refusalMessage(singular: string, impact: DeleteImpact): string | null {
  if (impact.blockers.length === 0) return null;
  const reasons = impact.blockers.map((issue) => issue.detail).join(" ");
  return `This ${inSentence(singular)} can’t be deleted yet. ${reasons}`;
}
