import { blogCategoryEnum } from "@/lib/db/schema";

/**
 * Human labels for `blog_posts.category`.
 *
 * Here rather than in `lib/content.ts` because both sides of the site need
 * them and only one side may import that module. `/admin/blog`'s config is in
 * the client-safe registry — `components/admin/resource-form.tsx` looks it up
 * in the browser — and `lib/content.ts` wraps the repositories, so a value
 * import of it from there would drag the Neon driver into the client bundle
 * (CLAUDE.md). This module imports the enum and nothing else.
 *
 * `lib/content.ts` re-exports it, so the marketing templates keep the import
 * they already had and there is still only one definition.
 */

/** The database's `blog_category` enum, as a type. */
export type BlogCategoryName = (typeof blogCategoryEnum.enumValues)[number];

export const BLOG_CATEGORY_LABELS: Record<BlogCategoryName, string> = {
  seasonal_alerts: "Seasonal alerts",
  family_health: "Family health",
  women_and_children: "Women and children",
  corporate_wellness: "Corporate wellness",
};
