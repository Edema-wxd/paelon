import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { siteSettings, type SiteSettingsRow } from "@/lib/db/schema";

import { CACHE_TAGS, cachedRead } from "./shared";

/**
 * The `site_settings` singleton (Phase 2, decision C2 option B).
 *
 * No `publicFilter` and no `ReadOptions`: there is one row, it has no
 * `published` column and no `deleted_at`, and there is nothing to preview — a
 * setting is either live or it is not. That also means no draft-mode branch,
 * which is why this file is shorter than every other repository here.
 */

/** The fixed primary key. The row is created by the migration, never by the panel. */
export const SITE_SETTINGS_ID = 1;

/**
 * Defaults for a database whose `site_settings` row is missing.
 *
 * The migration inserts it, so this is the belt to that braces: a reader on a
 * database that predates 0003 gets "nothing confirmed" rather than a thrown
 * page, and every caller already handles null by falling back to its own
 * documented placeholder. Failing soft is right for a settings read — the
 * alternative is the whole marketing site 500ing over a missing turnaround.
 */
const EMPTY: SiteSettings = {
  response_time_hours: null,
  whatsapp_number: null,
};

/**
 * Settings as the site reads them. snake_case to match the shapes in
 * `lib/content.ts`; the audit columns are deliberately absent, because who last
 * changed a setting is an admin-panel question, not a template's.
 */
export interface SiteSettings {
  response_time_hours: number | null;
  whatsapp_number: string | null;
}

function toSiteSettings(row: SiteSettingsRow): SiteSettings {
  return {
    response_time_hours: row.responseTimeHours,
    whatsapp_number: row.whatsappNumber,
  };
}

async function selectSiteSettings(): Promise<SiteSettings> {
  const [row] = await db()
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.id, SITE_SETTINGS_ID))
    .limit(1);

  return row ? toSiteSettings(row) : EMPTY;
}

const cachedSiteSettings = cachedRead(
  selectSiteSettings,
  ["site-settings"],
  [CACHE_TAGS.siteSettings],
);

/**
 * The live settings, cached under `site-settings`.
 *
 * Cached because this is read on nearly every marketing page — every form
 * surface needs the turnaround — and an uncached read would add a round trip to
 * each one. `/admin/settings` revalidates the tag on write, so an edit is live
 * immediately rather than within `CONTENT_REVALIDATE_SECONDS`.
 */
export async function getSiteSettings(): Promise<SiteSettings> {
  return cachedSiteSettings();
}

/**
 * The row as the admin panel needs it, audit columns included, uncached.
 *
 * `/admin/settings` must never render a cached read: an operator who saves a
 * value and sees the old one has no way to tell a stale cache from a failed
 * write, and would reasonably try again.
 */
export async function getSiteSettingsForAdmin(): Promise<SiteSettingsRow | null> {
  const [row] = await db()
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.id, SITE_SETTINGS_ID))
    .limit(1);

  return row ?? null;
}

/**
 * Write the settings row and return it.
 *
 * An upsert rather than an update: the migration seeds the row, but a database
 * restored from a backup taken before 0003 would otherwise have a settings
 * screen that silently saves nothing.
 */
export async function updateSiteSettings(
  values: { responseTimeHours: number | null; whatsappNumber: string | null },
  userId: string,
): Promise<SiteSettingsRow> {
  const [row] = await db()
    .insert(siteSettings)
    .values({ id: SITE_SETTINGS_ID, ...values, updatedByUserId: userId })
    .onConflictDoUpdate({
      target: siteSettings.id,
      set: { ...values, updatedByUserId: userId },
    })
    .returning();

  // The upsert either inserts or updates, so a missing row is impossible.
  return row as SiteSettingsRow;
}
