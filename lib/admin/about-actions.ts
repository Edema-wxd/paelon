"use server";

import {
  adminAction,
  done,
  fail,
  type ActionResult,
  type ActionState,
} from "@/lib/admin/action";
import { updateAbout } from "@/lib/db/queries/about";
import { getSectionsForEditor } from "@/lib/db/queries/sections";
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
    // Publishing needs something under the intro. The sections live in
    // `content_sections` (Page layout) since migration 0008, so they are
    // checked here, where they can be read.
    if (input.published) {
      const sections = await getSectionsForEditor({ page: "about" });
      if (sections.length === 0) {
        return fail("Add at least one block in Page layout before publishing the About page.", {
          fields: { published: ["Add at least one block in Page layout first."] },
        });
      }
    }

    // Only the fields this form edits. The five legacy prose columns are left
    // exactly as they are — they are the fallback the page uses if it ever has
    // no sections, and writing them here would erase that.
    const row = await updateAbout(
      {
        published: input.published,
        placeholder: input.placeholder,
        intro: input.intro,
        motto: input.motto,
      },
      user.id,
    );

    const written = (
      [
        ["intro", row.intro],
        ["motto", row.motto],
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
