import type { Resource } from "@/lib/auth/policy";
import type { ContentTable } from "@/lib/db/queries/content-crud";
import { CACHE_TAGS } from "@/lib/db/queries/shared";
import { awards, faqs } from "@/lib/db/schema";

import { AWARD_CERTIFICATE, AWARD_LOGO } from "./awards";
import type { ResourceName } from "./index";
import type { ImageFieldNames } from "./fields";

/**
 * The server half of the resource registry: which table a resource writes to,
 * which permission guards it, and which cache tag its writes revalidate.
 *
 * Split from `index.ts` so the client bundle never sees a Drizzle table: this
 * module imports `lib/db/schema.ts`, and a client component that imported it
 * would pull the Neon driver into the browser bundle. The `server-only`
 * package would make that a build error rather than a review comment, but it
 * is not installed — adding a dependency needs Francis. Until then the rule is
 * the split itself: client code imports `./index`, server code imports this.
 *
 * ## The cache tags are the point
 *
 * Every write goes through `adminAction` with the tag from
 * `lib/db/queries/shared.ts`, so saving an FAQ updates the homepage and every
 * service page inside a request — no redeploy, no waiting out the hour-long
 * fallback window in `CONTENT_REVALIDATE_SECONDS`. A resource added here
 * without its tag looks like it works and silently serves stale content for an
 * hour, so the type makes the tag mandatory.
 */

export interface ResourceServerConfig {
  table: ContentTable;
  /** The `can()` resource. Matches the table name in every case so far. */
  permission: Resource;
  /**
   * Tags revalidated after any write. `CACHE_TAGS.*` — never a string literal,
   * which is the whole reason that object exists.
   */
  tags: readonly string[];
  /** Image fields, so the action knows which alt text to write to `media`. */
  images: readonly ImageFieldNames[];
}

export const RESOURCE_SERVER: Record<ResourceName, ResourceServerConfig> = {
  faqs: {
    table: faqs as unknown as ContentTable,
    permission: "faqs",
    tags: [CACHE_TAGS.faqs],
    images: [],
  },
  awards: {
    table: awards as unknown as ContentTable,
    permission: "awards",
    tags: [CACHE_TAGS.awards],
    images: [AWARD_LOGO, AWARD_CERTIFICATE],
  },
};
