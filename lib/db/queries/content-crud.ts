import { and, asc, count, desc, eq, isNull, ne, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import { db } from "@/lib/db/client";

/**
 * One repository for every content table, because all of them carry the same
 * five columns (`contentColumns` in `lib/db/schema.ts`) and therefore the same
 * list / get / create / update / soft-delete queries.
 *
 * The per-type modules (`lib/db/queries/faqs.ts`, `awards.ts`, …) keep their
 * hand-written **public** reads: those are cached, filtered and ordered for a
 * specific marketing template, and a generic version of them would be worse.
 * This module is the **admin** side, where the query is genuinely identical
 * apart from which table it names.
 *
 * ## Why the admin reads are unfiltered
 *
 * `publicFilter` exists so the marketing site cannot render a draft. The panel
 * is the opposite: its whole job is showing drafts, so it filters on
 * `deleted_at` only. Nothing here is cached — an editor who saves a row and
 * sees the old value assumes the save failed.
 */

/** The shape every content table shares. Structural, so no table is named here. */
export interface ContentTable extends PgTable {
  id: PgColumn;
  published: PgColumn;
  order: PgColumn;
  deletedAt: PgColumn;
  createdAt: PgColumn;
  updatedAt: PgColumn;
  createdByUserId: PgColumn;
  slug: PgColumn;
}

/** A row as the panel reads it: unknown columns, since the table is generic. */
export type ContentRow = Record<string, unknown> & {
  id: string;
  slug: string;
  published: boolean;
  order: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
};

export const CONTENT_PAGE_SIZE_DEFAULT = 25;

export interface ContentListOptions {
  page?: number;
  pageSize?: number;
  /** `published` / `draft`; omitted means both. */
  status?: "published" | "draft";
  /** Case-insensitive substring, matched against the columns the caller names. */
  search?: string;
  searchColumns?: readonly PgColumn[];
  sort?: { column: PgColumn; direction: "asc" | "desc" };
  /** Restrict to rows this user created — the `contributor` list view. */
  createdByUserId?: string;
}

export interface ContentList<R> {
  rows: R[];
  total: number;
  page: number;
}

function listWhere(table: ContentTable, options: ContentListOptions): SQL {
  const clauses: (SQL | undefined)[] = [isNull(table.deletedAt)];

  if (options.status === "published") clauses.push(eq(table.published, true));
  if (options.status === "draft") clauses.push(eq(table.published, false));
  if (options.createdByUserId) {
    clauses.push(eq(table.createdByUserId, options.createdByUserId));
  }

  const term = options.search?.trim();
  const columns = options.searchColumns ?? [];
  if (term && columns.length > 0) {
    // `ilike` with the term as a parameter, escaped for LIKE metacharacters so
    // a `%` an editor types searches for a literal percent sign.
    const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const matches = columns.map((column) => sql`${column} ilike ${pattern}`);
    clauses.push(
      matches.reduce((left, right) => sql`${left} or ${right}`) as SQL,
    );
  }

  return and(...clauses) as SQL;
}

/** One page of rows for an admin list view, plus the unpaginated total. */
export async function listContent<R extends ContentRow>(
  table: ContentTable,
  options: ContentListOptions = {},
): Promise<ContentList<R>> {
  const pageSize = options.pageSize ?? CONTENT_PAGE_SIZE_DEFAULT;
  const page = Math.max(1, options.page ?? 1);
  const where = listWhere(table, options);

  const sort = options.sort ?? { column: table.order, direction: "asc" as const };
  const primary = sort.direction === "asc" ? asc(sort.column) : desc(sort.column);

  const [rows, totals] = await Promise.all([
    db()
      .select()
      .from(table)
      .where(where)
      // `order` is not unique, so a second key is needed or a row can appear on
      // two pages and another on none.
      .orderBy(primary, asc(table.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db().select({ value: count() }).from(table).where(where),
  ]);

  return {
    rows: rows as R[],
    total: totals[0]?.value ?? 0,
    page,
  };
}

/** One row by id, including drafts. `null` when it is missing or soft-deleted. */
export async function getContentById<R extends ContentRow>(
  table: ContentTable,
  id: string,
): Promise<R | null> {
  const rows = await db()
    .select()
    .from(table)
    .where(and(eq(table.id, id), isNull(table.deletedAt)))
    .limit(1);
  return (rows[0] as R | undefined) ?? null;
}

/**
 * The ownership columns `canOnRow()` needs, without reading the whole row.
 *
 * Returns `null` for a missing row, which `adminAction`'s `row` loader turns
 * into `MISSING_MESSAGE`.
 */
export async function getContentOwner(
  table: ContentTable,
  id: string,
): Promise<{ createdByUserId: string | null } | null> {
  const rows = await db()
    .select({ createdByUserId: table.createdByUserId })
    .from(table)
    .where(and(eq(table.id, id), isNull(table.deletedAt)))
    .limit(1);
  // `createdByUserId` is a `PgColumn` on the structural `ContentTable` type, so
  // Drizzle infers `unknown` for the projection. The column is `uuid`.
  return (rows[0] as { createdByUserId: string | null } | undefined) ?? null;
}

/**
 * Is `slug` already taken on this table?
 *
 * `exceptId` excludes the row being edited, so saving a row without changing
 * its slug is not a conflict with itself.
 *
 * Soft-deleted rows *do* count as taken. A soft delete is reversible, and the
 * marketing route for a slug is unique whether or not a row is hidden — two
 * rows racing for `/awards/best-hospital` is the problem this prevents.
 *
 * `awards` and `faqs` have no unique index on `slug` yet, unlike the other
 * content tables, so for those two this check is the only guard and a
 * simultaneous insert of the same slug could still slip through. Adding
 * `awards_slug_key` and `faqs_slug_key` is the fix; it needs a migration.
 */
export async function isSlugTaken(
  table: ContentTable,
  slug: string,
  exceptId?: string,
): Promise<boolean> {
  const rows = await db()
    .select({ id: table.id })
    .from(table)
    .where(
      exceptId
        ? and(eq(table.slug, slug), ne(table.id, exceptId))
        : eq(table.slug, slug),
    )
    .limit(1);
  return rows.length > 0;
}

/** Insert a row. `createdByUserId` is set here so ownership cannot be forgotten. */
export async function createContent<R extends ContentRow>(
  table: ContentTable,
  values: Record<string, unknown>,
  createdByUserId: string,
): Promise<R> {
  const rows = await db()
    .insert(table)
    .values({ ...values, createdByUserId })
    .returning();
  // An insert with no conflict target always returns its row.
  return rows[0] as R;
}

/**
 * Update a row by id. `null` when it is missing or already soft-deleted.
 *
 * `updated_at` is maintained by a Postgres trigger (see the hand-written
 * migration), so it is deliberately not set here.
 */
export async function updateContent<R extends ContentRow>(
  table: ContentTable,
  id: string,
  values: Record<string, unknown>,
): Promise<R | null> {
  const rows = await db()
    .update(table)
    .set(values)
    .where(and(eq(table.id, id), isNull(table.deletedAt)))
    .returning();
  return (rows[0] as R | undefined) ?? null;
}

/**
 * Soft-delete a row: stamp `deleted_at` and unpublish it.
 *
 * Both, not just `deleted_at`. Every public read composes `publicFilter`, which
 * checks both columns, but a row that comes back from the dead should not
 * silently reappear on the live site — restoring it is a decision someone makes
 * on purpose.
 *
 * Returns `false` when the row is missing or was already deleted, so a double
 * submission is reported as "no longer exists" rather than counted twice in the
 * audit log.
 */
export async function softDeleteContent(
  table: ContentTable,
  id: string,
): Promise<boolean> {
  const rows = await db()
    .update(table)
    .set({ deletedAt: new Date(), published: false })
    .where(and(eq(table.id, id), isNull(table.deletedAt)))
    .returning({ id: table.id });
  return rows.length > 0;
}
