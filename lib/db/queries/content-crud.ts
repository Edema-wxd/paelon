import { and, asc, count, desc, eq, isNull, ne, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import { db, dbTx } from "@/lib/db/client";

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

/* -------------------------------------------------------------------------- */
/* Join tables                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A join table as the CRUD kit edits it: two uuid columns, no payload.
 *
 * `serviceLocations`, `serviceRelated`, `doctorLocations` and `hmoLocations`
 * are all this shape. The columns are passed twice — once as a `PgColumn` for
 * the `where`, once as the property name for the `values` — because Drizzle's
 * query builder and its insert builder do not take the same thing, and a
 * generic helper cannot derive one from the other.
 *
 * `otherTable` is the table `otherColumn` points at. It is here because both
 * reading and writing a relation have to know which of the joined rows are
 * soft-deleted — see `syncRelationIn`.
 */
export interface RelationColumns {
  table: PgTable;
  ownColumn: PgColumn;
  otherColumn: PgColumn;
  ownKey: string;
  otherKey: string;
  otherTable: ContentTable;
  /**
   * The join row's sequence column, for a relation whose order is a decision.
   *
   * Galleries have one: `service_gallery_images.order` is the sequence an
   * editor arranged, and neither table has a column that records it. Set it and
   * the submitted order is written and read back; leave it off and membership
   * is a set, which is what `blog_post_related` and `hmo_locations` are.
   */
  orderColumn?: PgColumn;
  /** The join row's order property name, when `orderColumn` is set. */
  orderKey?: string;
}

/**
 * A Drizzle transaction handle from the pooled client.
 *
 * Derived rather than imported: the concrete type is a deeply parameterised
 * `PgTransaction`, and naming it here would tie this module to the driver.
 */
type Tx = Parameters<Parameters<ReturnType<typeof dbTx>["transaction"]>[0]>[0];

/** `id NOT IN (soft-deleted rows of the table `otherColumn` points at)`. */
function liveTargets(relation: RelationColumns): SQL {
  return sql`${relation.otherColumn} in (select ${relation.otherTable.id} from ${relation.otherTable} where ${relation.otherTable.deletedAt} is null)`;
}

/**
 * The ids currently joined to `ownId`, excluding any whose row is soft-deleted.
 *
 * The join rows to deleted targets survive — see `syncRelationIn` — but a
 * picker cannot offer a row that is not in its options, so returning them would
 * put the `<select>` in a state it cannot render.
 */
export async function listRelationIds(
  relation: RelationColumns,
  ownId: string,
): Promise<string[]> {
  const query = db()
    .select({ id: relation.otherColumn })
    .from(relation.table)
    .where(and(eq(relation.ownColumn, ownId), liveTargets(relation)));

  // An ordered relation has to come back in its order, or the gallery field
  // would render the editor's sequence shuffled and saving the form would then
  // persist the shuffle.
  const rows = relation.orderColumn
    ? await query.orderBy(asc(relation.orderColumn))
    : await query;

  return rows.map((row) => String(row.id));
}

/**
 * Make the join rows for `ownId` exactly `ids`, within a transaction.
 *
 * Delete-then-insert rather than a diff: the table has no payload and no
 * surrogate key, so a row that survives a diff is indistinguishable from one
 * that was removed and re-added.
 *
 * ## Why the delete is not `where own = :id`
 *
 * Joins to a **soft-deleted** row are left alone. The picker cannot show them
 * and the submission therefore cannot contain them, so a blanket delete would
 * quietly drop the memberships of every deleted row the first time anyone saved
 * the form for an unrelated reason — and an undelete would bring the row back
 * with its relationships gone. That is the behaviour `lib/auth/policy.ts` leans
 * on when it says restoring a deleted branch restores what pointed at it.
 *
 * `onConflictDoNothing` covers a submission that names the same id twice; the
 * schema already dedupes, and the primary key is the backstop.
 */
async function syncRelationIn(
  tx: Tx,
  relation: RelationColumns,
  ownId: string,
  ids: readonly string[],
): Promise<void> {
  const unique = [...new Set(ids)].filter((id) => id !== ownId);

  await tx
    .delete(relation.table)
    .where(and(eq(relation.ownColumn, ownId), liveTargets(relation)));

  if (unique.length === 0) return;

  // The index in the submitted list *is* the order, for a relation that has
  // one. `Set` preserves insertion order, so this is the sequence the editor
  // arranged, with duplicates collapsed onto their first appearance.
  const orderKey = relation.orderKey;

  await tx
    .insert(relation.table)
    .values(
      unique.map((id, index) => ({
        [relation.ownKey]: ownId,
        [relation.otherKey]: id,
        ...(orderKey === undefined ? {} : { [orderKey]: index }),
      })),
    )
    .onConflictDoNothing();
}

/** `syncRelationIn` in a transaction of its own. For callers with no row write. */
export async function syncRelation(
  relation: RelationColumns,
  ownId: string,
  ids: readonly string[],
): Promise<void> {
  await dbTx().transaction((tx) => syncRelationIn(tx, relation, ownId, ids));
}

/** One relation's selection, as the admin actions hand it over. */
export interface RelationWrite {
  columns: RelationColumns;
  ids: readonly string[];
}

/**
 * Insert a content row and its join rows together.
 *
 * One transaction, on the pooled client, because the two halves are one edit: a
 * service written without its branches is a row the editor cannot see the
 * problem with, and — since the slug is now taken — cannot create again either.
 * `createContent`'s HTTP fast path is kept for the types that have no
 * relations, which is most of them.
 */
export async function createContentWithRelations<R extends ContentRow>(
  table: ContentTable,
  values: Record<string, unknown>,
  createdByUserId: string,
  relations: readonly RelationWrite[],
): Promise<R> {
  if (relations.length === 0) {
    return createContent<R>(table, values, createdByUserId);
  }

  return dbTx().transaction(async (tx) => {
    const rows = await tx
      .insert(table)
      .values({ ...values, createdByUserId })
      .returning();
    const row = rows[0] as R;

    for (const relation of relations) {
      await syncRelationIn(tx, relation.columns, row.id, relation.ids);
    }

    return row;
  });
}

/**
 * Update a content row and its join rows together. `null` when the row is
 * missing or already soft-deleted, with the relations left untouched.
 */
export async function updateContentWithRelations<R extends ContentRow>(
  table: ContentTable,
  id: string,
  values: Record<string, unknown>,
  relations: readonly RelationWrite[],
): Promise<R | null> {
  if (relations.length === 0) {
    return updateContent<R>(table, id, values);
  }

  return dbTx().transaction(async (tx) => {
    const rows = await tx
      .update(table)
      .set(values)
      .where(and(eq(table.id, id), isNull(table.deletedAt)))
      .returning();

    const row = (rows[0] as R | undefined) ?? null;
    if (!row) return null;

    for (const relation of relations) {
      await syncRelationIn(tx, relation.columns, id, relation.ids);
    }

    return row;
  });
}

/** One option for a multi-select: the row's id and the label an editor reads. */
export interface ContentOption {
  id: string;
  label: string;
  published: boolean;
}

/**
 * Every row of a content table, as picker options.
 *
 * Drafts are included and marked. A service is routinely attached to a branch
 * that is still being written, and a picker that hid drafts would silently drop
 * the join the next time anyone saved the row. Soft-deleted rows are excluded,
 * and `syncRelationIn` is what stops their joins being dropped along with them.
 */
export async function listContentOptions(
  table: ContentTable,
  labelColumn: PgColumn,
): Promise<ContentOption[]> {
  const rows = await db()
    .select({ id: table.id, label: labelColumn, published: table.published })
    .from(table)
    .where(isNull(table.deletedAt))
    .orderBy(asc(table.order), asc(labelColumn));

  return rows.map((row) => ({
    id: String(row.id),
    label: String(row.label),
    published: row.published === true,
  }));
}
