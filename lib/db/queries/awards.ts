import { asc, desc } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { awards, type Award } from "@/lib/db/schema";

import { CACHE_TAGS, cachedRead, publicFilter } from "./shared";

/** Published awards, most recent year first within display order. */
export const getAwards = cachedRead(
  async (): Promise<Award[]> =>
    db()
      .select()
      .from(awards)
      .where(publicFilter(awards))
      .orderBy(asc(awards.order), desc(awards.year)),
  ["awards", "published"],
  [CACHE_TAGS.awards],
);
