"use server";

import { z } from "zod";

import { adminAction, done, fail, type ActionResult, type ActionState } from "@/lib/admin/action";
import { getContentById, type ContentTable } from "@/lib/db/queries/content-crud";
import { replaceSections } from "@/lib/db/queries/sections";
import { CACHE_TAGS } from "@/lib/db/queries/shared";
import { services } from "@/lib/db/schema";
import { sectionsSchema } from "@/lib/validation/sections";

/**
 * Save a page's layout — every block, in order, in one write.
 *
 * Built on `adminAction` (session, `can()`, parse, audit, revalidation). The
 * editor validates with the same `sectionsSchema` first and shows errors per
 * block; this parse is the truth, and a payload that fails it is refused
 * whole, never partly saved. The audit row records the block kinds and count,
 * not their text.
 */

export type SectionsMessage = { message: string };
export type SectionsResult = ActionResult<SectionsMessage>;
export type SectionsState = ActionState<SectionsMessage>;

/** The editor posts the layout as one JSON field; a malformed one fails parse. */
const sectionsField = z
  .string()
  .transform((raw, ctx) => {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "The layout could not be read. Reload and try again." });
      return z.NEVER;
    }
  })
  .pipe(sectionsSchema);

function summary(sections: z.output<typeof sectionsSchema>) {
  return { count: sections.length, kinds: sections.map((section) => section.kind) };
}

export const saveServiceSectionsAction = adminAction(
  {
    resource: "services",
    action: "update",
    schema: z.object({ serviceId: z.uuid("That service no longer exists."), sections: sectionsField }),
    event: "services.layout_saved",
    tag: [CACHE_TAGS.services],
  },
  async ({ serviceId, sections }) => {
    const service = await getContentById(services as unknown as ContentTable, serviceId);
    if (!service) return fail("That service no longer exists.");

    await replaceSections({ page: "service", serviceId }, sections);
    return done(
      { message: "Page layout saved. The service page shows it now." },
      { entityId: serviceId, metadata: summary(sections) },
    );
  },
);

export const saveAboutSectionsAction = adminAction(
  {
    resource: "about_content",
    action: "update",
    schema: z.object({ sections: sectionsField }),
    event: "about_content.layout_saved",
    tag: [CACHE_TAGS.about],
    path: "/admin/about",
  },
  async ({ sections }) => {
    await replaceSections({ page: "about" }, sections);
    return done(
      { message: "Page layout saved. The About page shows it now." },
      { metadata: summary(sections) },
    );
  },
);
