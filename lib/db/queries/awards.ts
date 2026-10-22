import { asc, desc } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { awards, type Award } from "@/lib/db/schema";

import {
  CACHE_TAGS,
  cachedRead,
  visibleFilter,
  type ReadOptions,
} from "./shared";

function selectAwards(options: ReadOptions): Promise<Award[]> {
  return db()
    .select()
    .from(awards)
    .where(visibleFilter(awards, options))
    .orderBy(asc(awards.order), desc(awards.year));
}

const cachedAwards = cachedRead(
  async (): Promise<Award[]> => selectAwards({}),
  ["awards", "published"],
  [CACHE_TAGS.awards],
);

/**
 * Published awards, most recent year first within display order. Draft mode
 * adds unpublished ones, which is how `/about` previews an award being drafted.
 */
export async function getAwards(options: ReadOptions = {}): Promise<Award[]> {
  return options.draft ? selectAwards(options) : cachedAwards();
}
