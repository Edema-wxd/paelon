import Link from "next/link";
import { notFound } from "next/navigation";

import { NotPermitted } from "@/components/admin/not-permitted";
import { ResourceDeleteForm } from "@/components/admin/resource-delete-form";
import { ResourceForm } from "@/components/admin/resource-form";
import type { SelectOption } from "@/components/admin/multi-select-field";
import type { ImageFieldValue } from "@/components/admin/resource-image-field";
import { toDateInput } from "@/lib/admin/resources/fields";
import type { Field, ResourceConfig } from "@/lib/admin/resource-config";
import { RESOURCE_SERVER } from "@/lib/admin/resources/server";
import type { ResourceName } from "@/lib/admin/resources";
import { can, canOnRow } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import {
  getContentById,
  listContentOptions,
  listRelationIds,
  type ContentRow,
} from "@/lib/db/queries/content-crud";
import { getMediaByIds, listMediaRows } from "@/lib/db/queries/media";
import { hasPublishedHours } from "@/lib/locations/hours-display";
import {
  previewDestinationFor,
  previewHref,
  previewPathFor,
  previewUnavailableReason,
} from "@/lib/preview/target";
import { DAYS, type Hours } from "@/lib/validation/hours";

/**
 * The new / edit screen for a content type.
 *
 * One component for both, because they differ only in whether a row was loaded:
 * a separate "new" screen would be the same form with the same fields and the
 * same validation, kept in step by hand.
 *
 * ## Turning a row into form defaults
 *
 * Every control wants a string, and the row holds numbers, booleans, `null`s
 * and foreign keys. That conversion happens here rather than in the client
 * component, so the form never has to know what a `media` row is — it receives
 * the URL and the alt text already resolved.
 *
 * The same applies to the two shapes that are not columns at all:
 *
 *  - **join rows.** `service_locations` and friends are read here into a list
 *    of ids, and the rows they could point at are read into picker options. A
 *    `multiselect` is then an ordinary field with an ordinary default.
 *  - **opening hours.** The jsonb value — or `{}`, for a branch whose schedule
 *    nobody has supplied — is spread back into seven days of controls, and the
 *    "confirmed" tick is set from whether the stored value has any days in it.
 */
export async function ResourceEditorScreen<R extends ContentRow>({
  resource,
  config,
  id,
}: {
  resource: ResourceName;
  config: ResourceConfig<R>;
  /** Absent for `/admin/<resource>/new`. */
  id?: string;
}) {
  const user = await requireAdminUser();
  const server = RESOURCE_SERVER[resource];
  const action = id ? "update" : "create";

  if (!can(user.role, action, server.permission)) {
    return <NotPermitted roleLabel={user.roleLabel} />;
  }

  const row = id ? await getContentById<R>(server.table, id) : null;
  if (id && !row) notFound();

  // The row-level check, which is what actually applies the contributor's
  // own-rows-only rule. The page must refuse here as well as the action, or an
  // editor fills in a form that was never going to save.
  if (row && !canOnRow(user, "update", server.permission, row)) {
    return <NotPermitted roleLabel={user.roleLabel} />;
  }

  const canPublish = can(user.role, "publish", server.permission);
  const canDelete = row !== null && canOnRow(user, "delete", server.permission, row);

  const imageFields = config.fields.filter(
    (field): field is Extract<Field, { type: "image" }> => field.type === "image",
  );

  // One query for every image on the row, rather than one per field.
  const mediaIds = imageFields
    .map((field) => (row ? row[field.name] : null))
    .filter((value): value is string => typeof value === "string");
  const mediaRows = row ? await getMediaByIds(mediaIds) : new Map();

  // One query per relation, and only the ones this resource declares. A
  // resource with no join tables costs nothing here.
  /**
   * The media library, for a form with a `figures` markdown field.
   *
   * Loaded here because the picker is a client component and reading the
   * library needs the database. Only when a field asks for it: every other
   * editor screen would be paying a query for a control it does not render.
   *
   * Capped at the same 60 rows the library screen shows. The picker filters
   * what it is given rather than querying again, which keeps it free of a
   * server round trip per keystroke.
   */
  const wantsFigures = config.fields.some(
    (field) => field.type === "markdown" && field.figures === true,
  );
  const media = wantsFigures
    ? (await listMediaRows()).map((row) => ({
        id: row.id,
        url: row.url,
        alt: row.alt,
        filename: row.filename,
        width: row.width,
        height: row.height,
      }))
    : undefined;

  const relations = server.relations ?? [];
  const options: Record<string, SelectOption[]> = {};
  const selected: Record<string, string[]> = {};

  for (const relation of relations) {
    const [rows, current] = await Promise.all([
      listContentOptions(relation.columns.otherTable, relation.optionsLabel),
      id ? listRelationIds(relation.columns, id) : Promise.resolve<string[]>([]),
    ]);

    // A self-referencing join — `service_related`, `blog_post_related` — must
    // not offer the row itself. The database would take it and the page would
    // list a service as related to itself.
    const offered = rows.filter((option) => option.id !== id);

    // `publishedOptionsOnly` narrows the picker to rows the public site will
    // actually serve — `blog_post_related`, where a draft would be a link to a
    // page that 404s. Rows already joined stay in the list whatever their
    // status, because `syncRelationIn` makes the join exactly what was
    // submitted: an option the picker hides cannot be submitted, so hiding a
    // selected one would quietly delete that relation the next time anyone
    // saved the form for an unrelated reason.
    options[relation.field] = relation.publishedOptionsOnly
      ? offered.filter((option) => option.published || current.includes(option.id))
      : offered;
    selected[relation.field] = current;
  }

  // Foreign-key pickers. One query each, and only for the resource that has
  // them; the chosen id itself is an ordinary column and needs nothing here.
  for (const reference of server.references ?? []) {
    options[reference.field] = await listContentOptions(
      reference.table,
      reference.optionsLabel,
    );
  }

  const defaults: Record<string, unknown> = {};
  const images: Record<string, ImageFieldValue> = {};

  // Set by the `hours` field itself, from the stored value. Skipped by the
  // generic checkbox branch, which would otherwise read a column that is not
  // there and default it to unticked.
  const hoursConfirmedNames = new Set(
    config.fields
      .filter((field): field is Extract<Field, { type: "hours" }> => field.type === "hours")
      .map((field) => field.confirmedName),
  );

  for (const field of config.fields) {
    if (field.type === "multiselect") {
      defaults[field.name] = selected[field.name] ?? [];
      continue;
    }

    if (field.type === "tags") {
      const value = row ? row[field.name] : undefined;
      defaults[field.name] = Array.isArray(value) ? value.map(String) : [];
      continue;
    }

    if (field.type === "hours") {
      const stored = row ? row[field.name] : undefined;
      defaults[field.name] = toHoursDefaults(stored);
      defaults[field.confirmedName] = hasPublishedHours(
        stored as Hours | Record<string, never> | undefined,
      );
      continue;
    }

    if (field.type === "image") {
      const mediaId = typeof row?.[field.name] === "string" ? (row[field.name] as string) : null;
      const media = mediaId ? mediaRows.get(mediaId) : undefined;
      const alt = media?.alt ?? "";

      images[field.name] = {
        mediaId: media ? mediaId : null,
        url: media?.url ?? null,
        alt,
        // Empty alt text on an existing image is a recorded decision that the
        // image is decorative — the schema does not let it be saved otherwise.
        decorative: media !== undefined && alt === "",
      };
      defaults[field.name] = media ? (mediaId as string) : "";
      defaults[field.altName] = alt;
      defaults[`${field.name}Decorative`] = media !== undefined && alt === "";
      continue;
    }

    if (field.type === "checkbox") {
      if (hoursConfirmedNames.has(field.name)) continue;
      defaults[field.name] = row ? row[field.name] === true : false;
      continue;
    }

    if (field.type === "date") {
      // `<input type="date">` takes `YYYY-MM-DD` and silently shows nothing for
      // anything else. A `date` column arrives as that string already, but a
      // `timestamptz` one — `blog_posts.published_at` — arrives as a `Date`,
      // and `String(new Date())` is "Mon Sep 28 2026 …", which the control
      // rejects without saying so. So both go through one converter.
      defaults[field.name] = toDateInput(row ? row[field.name] : undefined);
      continue;
    }

    const value = row ? row[field.name] : undefined;
    defaults[field.name] = value === null || value === undefined ? "" : String(value);
  }

  const heading = row
    ? String(row[config.titleField] ?? config.singular)
    : `New ${config.singular.toLowerCase()}`;

  // Which marketing page this row shows up on, if any. Types whose rows have no
  // page of their own get no button — see `lib/preview/target.ts`.
  const previewPath = row ? previewPathFor(resource, row) : null;
  const previewUnavailable =
    row && !previewPath ? previewUnavailableReason(resource) : null;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Not `components/site/breadcrumbs.tsx`: that one prepends a Home crumb
          pointing at the marketing site and emits `BreadcrumbList` JSON-LD,
          which is meaningless on a `noindex` back-office page. */}
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <li>
            <Link
              href={`/admin/${config.name}`}
              className="text-accent underline underline-offset-4 hover:no-underline"
            >
              {config.plural}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page">{row ? heading : `New ${config.singular.toLowerCase()}`}</li>
        </ol>
      </nav>

      <h1 className="mt-4 text-2xl font-bold text-primary">{heading}</h1>

      {/* Preview is only meaningful for a row that exists: it opens the
          marketing site in draft mode, which reads the saved row, not the form.
          A new, unsaved row has nothing to show. */}
      {row ? (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-sm text-muted-foreground">
            {row.published ? "Published" : "Draft"}
          </p>

          {previewPath ? (
            <>
              <a
                href={previewHref(resource, previewPath)}
                target="_blank"
                rel="noopener"
                aria-describedby="preview-hint"
                className="rounded-sm text-sm font-medium text-accent underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Preview on the site
              </a>
              <p id="preview-hint" className="text-sm text-muted-foreground">
                Opens the last saved version on{" "}
                {previewDestinationFor(resource)}, in a new tab.
              </p>
            </>
          ) : null}

          {previewUnavailable ? (
            <p className="text-sm text-muted-foreground">{previewUnavailable}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8">
        <ResourceForm
          resource={resource}
          {...(id ? { id } : {})}
          defaults={defaults}
          images={images}
          options={options}
          {...(media ? { media } : {})}
          canPublish={canPublish}
        />
      </div>

      {canDelete && id ? (
        <section aria-labelledby="danger-heading" className="mt-12 border-t border-border pt-6">
          <h2 id="danger-heading" className="text-lg font-medium text-primary">
            Delete
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Removes this {config.singular.toLowerCase()} from the site. It is a
            soft delete — the row is kept and can be restored from the database.
          </p>
          <div className="mt-4">
            <ResourceDeleteForm resource={resource} id={id} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

/**
 * The stored schedule, spread back into the controls that produced it.
 *
 * A branch with no confirmed hours stores `{}`, and every day comes back blank
 * and unticked — which is what "nobody has told us yet" should look like in a
 * form. It is deliberately not seven ticked "Closed" boxes: that is a claim,
 * and it is the wrong one.
 */
function toHoursDefaults(
  stored: unknown,
): Record<string, { open: string; close: string; closed: boolean }> {
  const candidate = stored as Hours | Record<string, never> | undefined;
  const hours = hasPublishedHours(candidate) ? candidate : undefined;

  return Object.fromEntries(
    DAYS.map((day) => {
      const value = hours?.[day];
      if (!value) return [day, { open: "", close: "", closed: false }];
      return value.closed
        ? [day, { open: "", close: "", closed: true }]
        : [day, { open: value.open, close: value.close, closed: false }];
    }),
  );
}
