import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { aboutContent, type AboutContentRow } from "@/lib/db/schema";

import { CACHE_TAGS, cachedRead } from "./shared";

/**
 * The `about_content` singleton (migration 0005).
 *
 * Mirrors `site-settings.ts`, for the same reasons: one row, no `order`, no
 * `deleted_at`, so no `publicFilter` and no `ReadOptions`. It does carry
 * `published`, but that governs whether the page is indexed rather than
 * whether the row is readable — the template renders a pending notice either
 * way, so the read is unconditional and the caller decides.
 */

/** The fixed primary key. The row is created by the migration, never by the panel. */
export const ABOUT_CONTENT_ID = 1;

/**
 * Columns as the site reads them, snake_case to match `lib/content.ts`.
 *
 * The audit columns are deliberately absent: who last edited the page is an
 * admin-panel question, not a template's.
 */
export interface AboutRow {
  published: boolean;
  placeholder: boolean;
  intro: string | null;
  founding_story: string | null;
  mission: string | null;
  vision: string | null;
  value_proposition: string | null;
  motto: string | null;
  esg: string | null;
}

/**
 * What a database without the row returns.
 *
 * The migration inserts it, so this is the belt to that braces — a reader on a
 * database restored from before 0005 gets an unwritten page rather than a
 * thrown one. `/about` already handles every field being null, because that is
 * the state it has shipped in since it was built.
 */
const EMPTY: AboutRow = {
  published: false,
  placeholder: false,
  intro: null,
  founding_story: null,
  mission: null,
  vision: null,
  value_proposition: null,
  motto: null,
  esg: null,
};

function toAboutRow(row: AboutContentRow): AboutRow {
  return {
    published: row.published,
    placeholder: row.placeholder,
    intro: row.intro,
    founding_story: row.foundingStory,
    mission: row.mission,
    vision: row.vision,
    value_proposition: row.valueProposition,
    motto: row.motto,
    esg: row.esg,
  };
}

async function selectAbout(): Promise<AboutRow> {
  const [row] = await db()
    .select()
    .from(aboutContent)
    .where(eq(aboutContent.id, ABOUT_CONTENT_ID))
    .limit(1);

  return row ? toAboutRow(row) : EMPTY;
}

const cachedAbout = cachedRead(selectAbout, ["about"], [CACHE_TAGS.about]);

/** The live About copy, cached under `about`. `/admin/about` revalidates the tag. */
export async function getAbout(): Promise<AboutRow> {
  return cachedAbout();
}

/**
 * The row as the admin panel needs it, audit columns included, uncached.
 *
 * An editor who saves and is shown the old copy cannot tell a stale cache from
 * a failed write, and would reasonably save again.
 */
export async function getAboutForAdmin(): Promise<AboutContentRow | null> {
  const [row] = await db()
    .select()
    .from(aboutContent)
    .where(eq(aboutContent.id, ABOUT_CONTENT_ID))
    .limit(1);

  return row ?? null;
}

/** The columns `/admin/about` writes. */
export interface AboutUpdate {
  published: boolean;
  placeholder: boolean;
  intro: string | null;
  motto: string | null;
  /**
   * The five legacy prose columns, optional since migration 0008: the admin
   * form no longer edits them (Page layout does), and an absent key is left
   * untouched by the upsert rather than written as null — they are the
   * template's fallback for a page with no sections.
   */
  foundingStory?: string | null;
  mission?: string | null;
  vision?: string | null;
  valueProposition?: string | null;
  esg?: string | null;
}

/**
 * Write the About row and return it.
 *
 * An upsert rather than an update: the migration seeds the row, but a database
 * restored from a backup taken before 0005 would otherwise have a screen that
 * silently saves nothing.
 */
export async function updateAbout(
  values: AboutUpdate,
  userId: string,
): Promise<AboutContentRow> {
  const [row] = await db()
    .insert(aboutContent)
    .values({ id: ABOUT_CONTENT_ID, ...values, updatedByUserId: userId })
    .onConflictDoUpdate({
      target: aboutContent.id,
      set: { ...values, updatedByUserId: userId },
    })
    .returning();

  // The upsert either inserts or updates, so a missing row is impossible.
  return row as AboutContentRow;
}
