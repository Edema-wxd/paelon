"use server";

import { z } from "zod";

import {
  adminAction,
  done,
  fail,
  INVALID_MESSAGE,
  type ActionFailure,
  type ActionResult,
  type ActionState,
} from "@/lib/admin/action";
import { can } from "@/lib/auth/policy";
import type { AdminUser } from "@/lib/auth/session";
import { awardResource } from "@/lib/admin/resources/awards";
import { faqResource } from "@/lib/admin/resources/faqs";
import type { ImageFieldNames } from "@/lib/admin/resources/fields";
import { RESOURCE_SERVER, type ResourceServerConfig } from "@/lib/admin/resources/server";
import type { ResourceConfig } from "@/lib/admin/resource-config";
import {
  createContent,
  getContentOwner,
  isSlugTaken,
  softDeleteContent,
  updateContent,
} from "@/lib/db/queries/content-crud";
import { setMediaAlt } from "@/lib/db/queries/media";

/**
 * Create, update and delete for every resource the CRUD kit drives.
 *
 * Each resource gets its own three actions rather than one action switching on
 * a submitted resource name. That is not ceremony: `adminAction` takes the
 * `can()` resource and the cache tags as *configuration*, so a single action
 * would have to read both out of the form body — which is attacker-controlled.
 * The permission a request is checked against must be fixed by the code, never
 * by the request.
 *
 * What is shared is the handler body, built once by the factories below.
 *
 * ## Slug uniqueness
 *
 * Checked here and reported as a field error on `slug`, because "That slug is
 * already in use" next to the slug box is the only version of this message an
 * editor can act on. `isSlugTaken`'s comment covers the race window this
 * leaves on `awards` and `faqs`, which have no unique index yet.
 */

export type ResourceSaved = { id: string; message: string };
export type ResourceResult = ActionResult<ResourceSaved>;
export type ResourceState = ActionState<ResourceSaved>;

/**
 * Split a validated submission into the content row's columns and the alt text
 * destined for `media` rows.
 *
 * The form submits `logoId`, `logoAlt` and `logoDecorative` together; the
 * content table has only `logoId`. The alt text belongs to the file, not to the
 * award — a second award using the same logo must not need it typed again.
 */
function splitImageAlts(
  input: Record<string, unknown>,
  images: readonly ImageFieldNames[],
): { values: Record<string, unknown>; alts: Array<{ mediaId: string; alt: string }> } {
  const values = { ...input };
  const alts: Array<{ mediaId: string; alt: string }> = [];

  for (const names of images) {
    const mediaId = values[names.id];
    const alt = String(values[names.alt] ?? "");
    delete values[names.alt];
    delete values[names.decorative];

    // Only when an image is actually set. `""` is a real value here — it is
    // how a decorative image is marked, and the schema has already refused a
    // blank that was not deliberate.
    if (typeof mediaId === "string" && mediaId !== "") {
      alts.push({ mediaId, alt });
    }
  }

  return { values, alts };
}

/**
 * Write each image's alt text onto its media row.
 *
 * A missing media row is reported as a field error rather than thrown: the
 * editor may have had the form open while someone deleted the file from the
 * library, which is a thing that happens rather than a bug.
 */
async function writeAlts(
  alts: Array<{ mediaId: string; alt: string }>,
  images: readonly ImageFieldNames[],
): Promise<{ field: string } | null> {
  for (const [index, entry] of alts.entries()) {
    const row = await setMediaAlt(entry.mediaId, entry.alt);
    if (!row) return { field: images[index]?.id ?? "image" };
  }
  return null;
}

const MISSING_IMAGE_MESSAGE =
  "That image is no longer in the media library. Choose another.";

/**
 * Publishing is its own permission (spec §8 Roles: a contributor's work needs
 * an editor or admin to publish it), and `adminAction` has already checked
 * `create` or `update` — not `publish`.
 *
 * So the flag is refused here rather than silently downgraded to a draft: an
 * editor who ticks the box, sees "Saved" and finds the row still unpublished
 * learns nothing. The form does not render the toggle for a role that lacks
 * the permission; this is the check that actually enforces it.
 */
function publishRefusal(
  user: AdminUser,
  server: ResourceServerConfig,
  values: Record<string, unknown>,
): ActionFailure | null {
  if (values.published !== true) return null;
  if (can(user.role, "publish", server.permission)) return null;

  return fail(INVALID_MESSAGE, {
    fields: {
      published: ["Publishing needs an editor or an admin. Save it as a draft."],
    },
  });
}

function buildCreateAction<R, S extends z.ZodType>(
  config: ResourceConfig<R, S>,
  server: ResourceServerConfig,
) {
  return adminAction(
    {
      resource: server.permission,
      action: "create",
      schema: config.schema,
      event: `${config.name}.created`,
      tag: server.tags,
      path: `/admin/${config.name}`,
    },
    async (input, { user }) => {
      const parsed = input as Record<string, unknown>;
      const slug = String(parsed.slug);

      if (await isSlugTaken(server.table, slug)) {
        return fail(INVALID_MESSAGE, {
          fields: { slug: ["That slug is already in use."] },
        });
      }

      const { values, alts } = splitImageAlts(parsed, server.images);

      const refused = publishRefusal(user, server, values);
      if (refused) return refused;

      const missing = await writeAlts(alts, server.images);
      if (missing) {
        return fail(INVALID_MESSAGE, {
          fields: { [missing.field]: [MISSING_IMAGE_MESSAGE] },
        });
      }

      const row = await createContent(server.table, values, user.id);

      return done(
        { id: row.id, message: `${config.singular} created.` },
        { entityId: row.id, metadata: { slug, published: values.published === true } },
      );
    },
  );
}

function buildUpdateAction<R, S extends z.ZodType>(
  config: ResourceConfig<R, S>,
  server: ResourceServerConfig,
) {
  // The id travels with the submission, so it is validated with it. An
  // intersection rather than a wrapper object keeps the field errors flat,
  // which is how the form indexes them.
  const schema = z.intersection(
    config.schema,
    z.object({ id: z.uuid("That item no longer exists.") }),
  );

  return adminAction(
    {
      resource: server.permission,
      action: "update",
      schema,
      event: `${config.name}.updated`,
      tag: server.tags,
      path: `/admin/${config.name}`,
      // Loaded so `canOnRow` can apply the contributor's own-rows-only rule.
      row: (input) => getContentOwner(server.table, (input as { id: string }).id),
    },
    async (input, { user }) => {
      const parsed = { ...(input as Record<string, unknown>) };
      const id = String(parsed.id);
      delete parsed.id;
      const slug = String(parsed.slug);

      if (await isSlugTaken(server.table, slug, id)) {
        return fail(INVALID_MESSAGE, {
          fields: { slug: ["That slug is already in use."] },
        });
      }

      const { values, alts } = splitImageAlts(parsed, server.images);

      const refused = publishRefusal(user, server, values);
      if (refused) return refused;

      const missing = await writeAlts(alts, server.images);
      if (missing) {
        return fail(INVALID_MESSAGE, {
          fields: { [missing.field]: [MISSING_IMAGE_MESSAGE] },
        });
      }

      const row = await updateContent(server.table, id, values);
      if (!row) return fail(`That ${config.singular.toLowerCase()} no longer exists.`);

      return done(
        { id, message: "Saved." },
        { entityId: id, metadata: { slug, published: values.published === true } },
      );
    },
  );
}

function buildDeleteAction<R, S extends z.ZodType>(
  config: ResourceConfig<R, S>,
  server: ResourceServerConfig,
) {
  return adminAction(
    {
      resource: server.permission,
      action: "delete",
      schema: z.object({ id: z.uuid("That item no longer exists.") }),
      event: `${config.name}.deleted`,
      tag: server.tags,
      path: `/admin/${config.name}`,
      row: (input) => getContentOwner(server.table, input.id),
    },
    async ({ id }) => {
      // Soft, always (spec §8: "All content deletes are soft deletes").
      const deleted = await softDeleteContent(server.table, id);
      if (!deleted) return fail(`That ${config.singular.toLowerCase()} no longer exists.`);

      return done(
        { id, message: `${config.singular} deleted.` },
        { entityId: id, metadata: {} },
      );
    },
  );
}

/* -------------------------------------------------------------------------- */
/* The actions themselves, one trio per resource                              */
/* -------------------------------------------------------------------------- */

export const createFaqAction = buildCreateAction(faqResource, RESOURCE_SERVER.faqs);
export const updateFaqAction = buildUpdateAction(faqResource, RESOURCE_SERVER.faqs);
export const deleteFaqAction = buildDeleteAction(faqResource, RESOURCE_SERVER.faqs);

export const createAwardAction = buildCreateAction(awardResource, RESOURCE_SERVER.awards);
export const updateAwardAction = buildUpdateAction(awardResource, RESOURCE_SERVER.awards);
export const deleteAwardAction = buildDeleteAction(awardResource, RESOURCE_SERVER.awards);
