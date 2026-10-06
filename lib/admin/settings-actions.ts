"use server";

import { adminAction, done, type ActionResult, type ActionState } from "@/lib/admin/action";
import { CACHE_TAGS } from "@/lib/db/queries/shared";
import { updateSiteSettings } from "@/lib/db/queries/site-settings";
import { siteSettingsSchema } from "@/lib/validation/settings";

/**
 * `/admin/settings` write (Phase 2, decision C2 option B).
 *
 * One action, built on `adminAction`, which does the session, the `can()`
 * check, parsing, the audit row and revalidation in that order. Admin-only
 * follows from the policy entry for `site_settings`, not from anything here.
 *
 * Revalidates `CACHE_TAGS.siteSettings` as well as the admin path: the
 * turnaround renders on `/book`, `/contact/thank-you` and `/book/confirmed`, so
 * a save that only refreshed the admin view would leave the public site
 * showing the old promise for up to `CONTENT_REVALIDATE_SECONDS`.
 *
 * Audit metadata records the values, which is safe and useful here — a
 * turnaround and a switchboard WhatsApp number are published facts about the
 * hospital, not personal data. "Who changed the promise we make to patients,
 * and to what" is exactly the question the audit log exists to answer.
 */

const SETTINGS_PATH = "/admin/settings";

export type SettingsMessage = { message: string };
export type SettingsResult = ActionResult<SettingsMessage>;
export type SettingsState = ActionState<SettingsMessage>;

/** Save the site settings row. */
export const saveSettingsAction = adminAction(
  {
    resource: "site_settings",
    action: "update",
    schema: siteSettingsSchema,
    event: "site_settings.updated",
    tag: CACHE_TAGS.siteSettings,
    path: SETTINGS_PATH,
  },
  async (input, { user }) => {
    const row = await updateSiteSettings(
      {
        responseTimeHours: input.responseTimeHours,
        whatsappNumber: input.whatsappNumber,
      },
      user.id,
    );

    return done(
      { message: "Settings saved." },
      {
        metadata: {
          response_time_hours: row.responseTimeHours,
          whatsapp_number: row.whatsappNumber,
        },
      },
    );
  },
);
