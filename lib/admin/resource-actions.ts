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
import { digestOf, type AuditMetadata } from "@/lib/admin/audit";
import { can } from "@/lib/auth/policy";
import type { AdminUser } from "@/lib/auth/session";
import { awardResource } from "@/lib/admin/resources/awards";
import { doctorResource } from "@/lib/admin/resources/doctors";
import { faqResource } from "@/lib/admin/resources/faqs";
import { hmoResource } from "@/lib/admin/resources/hmos";
import { locationResource } from "@/lib/admin/resources/locations";
import { serviceResource } from "@/lib/admin/resources/services";
import { testimonialResource } from "@/lib/admin/resources/testimonials";
import { resourceInput } from "@/lib/admin/resource-input";
import type { ImageFieldNames } from "@/lib/admin/resources/fields";
import {
  RESOURCE_SERVER,
  type AuditDiffColumn,
  type ResourceRelation,
  type ResourceServerConfig,
} from "@/lib/admin/resources/server";
import type { ResourceConfig } from "@/lib/admin/resource-config";
import {
  createContentWithRelations,
  getContentById,
  getContentOwner,
  isSlugTaken,
  softDeleteContent,
  updateContentWithRelations,
  type RelationWrite,
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

/**
 * Lift the join-table fields out of a validated submission.
 *
 * `locationIds` is a form field but not a column, so it has to leave the
 * values before the insert — Drizzle would reject it, and a silent `delete`
 * scattered through both actions is how one of them ends up forgetting.
 */
function splitRelations(
  input: Record<string, unknown>,
  relations: readonly ResourceRelation[],
): { values: Record<string, unknown>; selected: Map<string, string[]> } {
  const values = { ...input };
  const selected = new Map<string, string[]>();

  for (const relation of relations) {
    const ids = values[relation.field];
    delete values[relation.field];
    selected.set(relation.field, Array.isArray(ids) ? ids.map(String) : []);
  }

  return { values, selected };
}

/**
 * The relation writes for one submission, in the shape the repository takes.
 *
 * The row and its join rows are written in a single transaction
 * (`createContentWithRelations` / `updateContentWithRelations`) rather than one
 * after the other. On a create that is not tidiness: the insert commits the
 * slug, so a relation that failed afterwards would leave a row the editor
 * cannot see and cannot recreate — `isSlugTaken` would answer the retry with
 * "That slug is already in use."
 */
function relationWrites(
  selected: Map<string, string[]>,
  relations: readonly ResourceRelation[],
): RelationWrite[] {
  return relations.map((relation) => ({
    columns: relation.columns,
    ids: selected.get(relation.field) ?? [],
  }));
}

/* -------------------------------------------------------------------------- */
/* Auditing a change, not just the fact of one                                */
/* -------------------------------------------------------------------------- */

/** `consentGiven` → `consent_given`, so audit keys read like the columns. */
function toSnakeCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * One column's contribution to the audit metadata, or nothing when it is
 * unchanged.
 *
 * Only what moved is recorded. An audit row that restates every watched column
 * on every save buries the one edit that mattered — and for `testimonials` the
 * question being asked of this log is "when did consent change, and who
 * changed it", which an unchanged value does not answer.
 */
function auditDiffFor(
  columns: readonly AuditDiffColumn[],
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): AuditMetadata {
  const metadata: AuditMetadata = {};

  for (const { column, mode } of columns) {
    // A column the form did not submit was not part of this edit.
    if (!(column in after)) continue;

    const read = (source: Record<string, unknown> | null): string | boolean | null => {
      if (source === null) return null;
      const value = source[column];
      if (mode === "digest") return digestOf(value);
      if (typeof value === "boolean") return value;
      return value === null || value === undefined ? null : String(value);
    };

    const from = read(before);
    const to = read(after);
    if (before !== null && from === to) continue;

    const key = toSnakeCase(column);
    metadata[`${key}_before`] = from;
    metadata[`${key}_after`] = to;
  }

  return metadata;
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
      input: (formData) => resourceInput(config, formData),
    },
    async (input, { user }) => {
      const parsed = input as Record<string, unknown>;
      const slug = String(parsed.slug);

      if (await isSlugTaken(server.table, slug)) {
        return fail(INVALID_MESSAGE, {
          fields: { slug: ["That slug is already in use."] },
        });
      }

      const relations = server.relations ?? [];
      const { values: withImages, selected } = splitRelations(parsed, relations);
      const { values: raw, alts } = splitImageAlts(withImages, server.images);

      const refused = publishRefusal(user, server, raw);
      if (refused) return refused;

      const missing = await writeAlts(alts, server.images);
      if (missing) {
        return fail(INVALID_MESSAGE, {
          fields: { [missing.field]: [MISSING_IMAGE_MESSAGE] },
        });
      }

      const values = server.toRow ? server.toRow(raw) : raw;
      const row = await createContentWithRelations(
        server.table,
        values,
        user.id,
        relationWrites(selected, relations),
      );

      return done(
        { id: row.id, message: `${config.singular} created.` },
        {
          entityId: row.id,
          metadata: {
            slug,
            published: values.published === true,
            // `before` is null on a create: the row did not exist, which is a
            // different statement from "the value was false".
            ...auditDiffFor(server.auditDiff ?? [], null, values),
          },
        },
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
      input: (formData) => resourceInput(config, formData),
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

      const relations = server.relations ?? [];
      const { values: withImages, selected } = splitRelations(parsed, relations);
      const { values: raw, alts } = splitImageAlts(withImages, server.images);

      const refused = publishRefusal(user, server, raw);
      if (refused) return refused;

      const missing = await writeAlts(alts, server.images);
      if (missing) {
        return fail(INVALID_MESSAGE, {
          fields: { [missing.field]: [MISSING_IMAGE_MESSAGE] },
        });
      }

      // Read before the write, and only for a resource that watches columns.
      // `getContentOwner` above projects two columns and cannot serve this.
      const watched = server.auditDiff ?? [];
      const before = watched.length > 0 ? await getContentById(server.table, id) : null;

      const values = server.toRow ? server.toRow(raw) : raw;
      // One transaction: a row whose update lands but whose branches do not is
      // a half-saved edit reported as saved.
      const row = await updateContentWithRelations(
        server.table,
        id,
        values,
        relationWrites(selected, relations),
      );
      if (!row) return fail(`That ${config.singular.toLowerCase()} no longer exists.`);

      return done(
        { id, message: "Saved." },
        {
          entityId: id,
          metadata: {
            slug,
            published: values.published === true,
            ...auditDiffFor(watched, before, values),
          },
        },
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

export const createServiceAction = buildCreateAction(serviceResource, RESOURCE_SERVER.services);
export const updateServiceAction = buildUpdateAction(serviceResource, RESOURCE_SERVER.services);
export const deleteServiceAction = buildDeleteAction(serviceResource, RESOURCE_SERVER.services);

export const createDoctorAction = buildCreateAction(doctorResource, RESOURCE_SERVER.doctors);
export const updateDoctorAction = buildUpdateAction(doctorResource, RESOURCE_SERVER.doctors);
export const deleteDoctorAction = buildDeleteAction(doctorResource, RESOURCE_SERVER.doctors);

export const createLocationAction = buildCreateAction(locationResource, RESOURCE_SERVER.locations);
export const updateLocationAction = buildUpdateAction(locationResource, RESOURCE_SERVER.locations);
export const deleteLocationAction = buildDeleteAction(locationResource, RESOURCE_SERVER.locations);

export const createTestimonialAction = buildCreateAction(
  testimonialResource,
  RESOURCE_SERVER.testimonials,
);
export const updateTestimonialAction = buildUpdateAction(
  testimonialResource,
  RESOURCE_SERVER.testimonials,
);
export const deleteTestimonialAction = buildDeleteAction(
  testimonialResource,
  RESOURCE_SERVER.testimonials,
);

export const createHmoAction = buildCreateAction(hmoResource, RESOURCE_SERVER.hmos);
export const updateHmoAction = buildUpdateAction(hmoResource, RESOURCE_SERVER.hmos);
export const deleteHmoAction = buildDeleteAction(hmoResource, RESOURCE_SERVER.hmos);
