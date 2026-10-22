import { and, asc, desc, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { auditLog, users } from "@/lib/db/schema";

/**
 * Reads for the audit log viewer (spec §8 Audit log).
 *
 * Never wrapped in `cachedRead`: this is an authenticated, admin-only read of a
 * security record, and a cached one would show a stale answer to the question
 * "what just happened" (master spec §5).
 *
 * Nothing here writes. The table is append-only — `can()` refuses every write
 * action on `audit_log` for every role — because a log that can be edited stops
 * being evidence.
 *
 * Retention period: `TODO` — set by counsel with the §14 retention periods.
 * Until then nothing prunes this table, so it only grows.
 */

export const AUDIT_PAGE_SIZE = 50;

export interface AuditFilters {
  /** Exact event name, e.g. "booking.viewed". */
  action?: string;
  entityType?: string;
  /** A user id, or `"system"` for entries with no actor. */
  actor?: string;
  /** Inclusive, `YYYY-MM-DD`, against `created_at`. */
  from?: string;
  /** Inclusive, `YYYY-MM-DD`. */
  to?: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  /** Salted SHA-256 of the client IP, or null. Never the address itself. */
  ipAddress: string | null;
  createdAt: Date;
  userId: string | null;
  actorName: string | null;
}

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

function conditions(filters: AuditFilters): SQL | undefined {
  const where: SQL[] = [];

  if (filters.action) where.push(eq(auditLog.action, filters.action));
  if (filters.entityType) where.push(eq(auditLog.entityType, filters.entityType));
  if (filters.actor === "system") where.push(isNull(auditLog.userId));
  else if (filters.actor) where.push(eq(auditLog.userId, filters.actor));
  // Dates are whole days in the viewer's terms: `to` includes that day.
  if (filters.from) where.push(gte(auditLog.createdAt, new Date(`${filters.from}T00:00:00Z`)));
  if (filters.to) where.push(lte(auditLog.createdAt, new Date(`${filters.to}T23:59:59.999Z`)));

  return where.length > 0 ? and(...where) : undefined;
}

/**
 * A page of audit entries, newest first, with the total matching count.
 *
 * `id` breaks ties on `created_at` so an entry cannot appear on two pages when
 * several land in the same millisecond — which they do, since a bulk action
 * writes one row per booking.
 */
export async function listAuditEntries(
  filters: AuditFilters = {},
  page = 1,
  pageSize = AUDIT_PAGE_SIZE,
): Promise<AuditPage> {
  const where = conditions(filters);
  const pageNumber = Math.max(1, Math.floor(page));

  const [entries, counts] = await Promise.all([
    db()
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        metadata: auditLog.metadata,
        ipAddress: auditLog.ipAddress,
        createdAt: auditLog.createdAt,
        userId: auditLog.userId,
        actorName: users.name,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(where)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(pageSize)
      .offset((pageNumber - 1) * pageSize),
    db()
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(where),
  ]);

  return { entries, total: counts[0]?.count ?? 0, page: pageNumber, pageSize };
}

/**
 * The event names and entity types present in the log, for the filter
 * dropdowns.
 *
 * Read from the data rather than from a hardcoded list: the events are written
 * by `adminAction` config across the panel, so a list here would be a second
 * place to forget to update.
 */
export async function listAuditFacets(): Promise<{
  actions: string[];
  entityTypes: string[];
}> {
  const [actions, entityTypes] = await Promise.all([
    db()
      .selectDistinct({ value: auditLog.action })
      .from(auditLog)
      .orderBy(asc(auditLog.action)),
    db()
      .selectDistinct({ value: auditLog.entityType })
      .from(auditLog)
      .orderBy(asc(auditLog.entityType)),
  ]);

  return {
    actions: actions.map((row) => row.value),
    entityTypes: entityTypes.map((row) => row.value),
  };
}

/** Staff who appear as actors in the log, for the actor filter. */
export async function listAuditActors(): Promise<{ id: string; name: string }[]> {
  const rows = await db()
    .selectDistinct({ id: users.id, name: users.name })
    .from(auditLog)
    .innerJoin(users, eq(users.id, auditLog.userId))
    .orderBy(asc(users.name));

  return rows;
}
