import Link from "next/link";
import { notFound } from "next/navigation";

import { NotPermitted } from "@/components/admin/not-permitted";
import { ResourceDeleteForm } from "@/components/admin/resource-delete-form";
import { ResourceForm } from "@/components/admin/resource-form";
import type { ImageFieldValue } from "@/components/admin/resource-image-field";
import type { Field, ResourceConfig } from "@/lib/admin/resource-config";
import { RESOURCE_SERVER } from "@/lib/admin/resources/server";
import type { ResourceName } from "@/lib/admin/resources";
import { can, canOnRow } from "@/lib/auth/policy";
import { requireAdminUser } from "@/lib/auth/session";
import { getContentById, type ContentRow } from "@/lib/db/queries/content-crud";
import { getMediaByIds } from "@/lib/db/queries/media";

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

  const defaults: Record<string, string | boolean> = {};
  const images: Record<string, ImageFieldValue> = {};

  for (const field of config.fields) {
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
      defaults[field.name] = row ? row[field.name] === true : false;
      continue;
    }

    const value = row ? row[field.name] : undefined;
    defaults[field.name] = value === null || value === undefined ? "" : String(value);
  }

  const heading = row
    ? String(row[config.titleField] ?? config.singular)
    : `New ${config.singular.toLowerCase()}`;

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

      {row ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {row.published ? "Published" : "Draft"}
        </p>
      ) : null}

      <div className="mt-8">
        <ResourceForm
          resource={resource}
          {...(id ? { id } : {})}
          defaults={defaults}
          images={images}
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
