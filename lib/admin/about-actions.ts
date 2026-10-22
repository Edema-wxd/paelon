"use server";

import {
  adminAction,
  done,
  type ActionResult,
  type ActionState,
} from "@/lib/admin/action";
import { updateAbout } from "@/lib/db/queries/about";
import { CACHE_TAGS } from "@/lib/db/queries/shared";
import { aboutFormSchema } from "@/lib/validation/about";

/**
 * `/admin/about` write (migration 0005).
 *
 * One action, built on `adminAction`, which does the session, the `can()`
 * check, parsing, the audit row and revalidation in that order. Who may edit
 * follows from the policy entry for `about_content`, not from anything here.
 *
 * Revalidates `CACHE_TAGS.about` as well as the admin path: the copy renders
 * on `/about`, so a save that only refreshed the admin view would leave the
 * public page showing the old founding story for up to an hour.
 *
 * The audit metadata records which sections were filled and whether the page
 * is live — not the prose itself. The row is the current copy and git is not
 * the record any more, so "who published the About page, and when" is the
 * question worth answering; storing the whole founding story in `audit_log`
 * on every keystroke-sized edit would make the log a second copy of the page.
 */

const ABOUT_PATH = "/admin/about";

export type AboutMessage = { message: string };
export type AboutResult = ActionResult<AboutMessage>;
export type AboutState = ActionState<AboutMessage>;

/** Save the About page's copy. */
export const saveAboutAction = adminAction(
  {
    resource: "about_content",
    action: "update",
    schema: aboutFormSchema,
    event: "about_content.updated",
    tag: CACHE_TAGS.about,
    path: ABOUT_PATH,
  },
  async (input, { user }) => {
    const row = await updateAbout(
      {
        published: input.published,
        placeholder: input.placeholder,
        intro: input.intro,
        foundingStory: input.founding_story,
        mission: input.mission,
        vision: input.vision,
        valueProposition: input.value_proposition,
        motto: input.motto,
        esg: input.esg,
      },
      user.id,
    );

    const written = (
      [
        ["intro", row.intro],
        ["founding_story", row.foundingStory],
        ["mission", row.mission],
        ["vision", row.vision],
        ["value_proposition", row.valueProposition],
        ["motto", row.motto],
        ["esg", row.esg],
      ] as const
    )
      .filter(([, value]) => value !== null)
      .map(([name]) => name);

    return done(
      {
        message: row.published
          ? "Saved. The About page is live."
          : "Saved as a draft. The About page stays unpublished and noindexed.",
      },
      {
        metadata: {
          published: row.published,
          placeholder: row.placeholder,
          sections_written: written,
        },
      },
    );
  },
);
