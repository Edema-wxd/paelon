import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Role } from "@/lib/auth/policy";
import { generateReference } from "@/lib/booking/reference";
import { checkTransition, type TransitionRefusal } from "@/lib/booking/status";
import { db, dbTx } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import {
  bookingStatusHistory,
  bookings,
  locations,
  services,
  users,
  type Booking,
  type BookingStatus,
  type NewBooking,
} from "@/lib/db/schema";

/**
 * Insert a booking and its initial status-history row, atomically.
 *
 * The transaction is the point: a booking without its `NULL -> new` history row
 * would leave a hole in the Phase 2 timeline that no backfill can honestly
 * reconstruct. Both rows land, or neither does.
 *
 * The reference is drawn from a sequence, so a collision is essentially
 * impossible — but `reference` is UNIQUE and the insert retries once anyway,
 * because the cost of the retry is nil and the cost of a 500 on a booking is not.
 */
export async function createBooking(
  input: Omit<NewBooking, "reference">,
): Promise<Booking> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await insertBookingWithHistory(input);
    } catch (error) {
      if (attempt === 0 && isUniqueViolation(error)) continue;
      throw error;
    }
  }

  // Unreachable: the loop either returns or throws.
  throw new Error("createBooking exhausted its retries");
}

async function insertBookingWithHistory(
  input: Omit<NewBooking, "reference">,
): Promise<Booking> {
  const client = dbTx();

  return client.transaction(async (tx) => {
    const reference = await generateReference(tx);

    const inserted = await tx
      .insert(bookings)
      .values({ ...input, reference })
      .returning();

    const booking = inserted[0];
    if (!booking) {
      throw new Error("Booking insert returned no row");
    }

    await tx.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      fromStatus: null,
      toStatus: booking.status,
      note: "Created via website booking form",
    });

    return booking;
  });
}

/**
 * Look up a booking by reference.
 *
 * Never cached — booking data is personal data and mutable (master spec §5).
 */
export async function getBookingByReference(
  reference: string,
): Promise<Booking | null> {
  const rows = await db()
    .select()
    .from(bookings)
    .where(eq(bookings.reference, reference))
    .limit(1);

  return rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Admin workflow (spec §8 Booking workflow)                                  */
/* -------------------------------------------------------------------------- */

/*
 * `reason_for_visit` is health data. It is read by `getBookingForAdmin` and
 * nothing else in this file: never in a list projection, never in a result
 * that feeds a log line or an audit row. Every admin read names its columns
 * for that reason — a `select()` would carry it along silently.
 *
 * None of these reads is cached (spec §5).
 */

/** Roles a booking may be assigned to (spec §8). */
const ASSIGNABLE_ROLES = ["editor", "admin"] as const satisfies readonly Role[];

export const BOOKING_PAGE_SIZE_DEFAULT = 25;
export const BOOKING_PAGE_SIZE_MAX = 100;

export interface BookingListFilters {
  statuses?: BookingStatus[];
  locationId?: string;
  /** Inclusive, `YYYY-MM-DD`. */
  preferredFrom?: string;
  /** Inclusive, `YYYY-MM-DD`. */
  preferredTo?: string;
  /** A user id, or `"unassigned"`. */
  assignee?: string;
}

export type BookingSortColumn = "preferredDate" | "createdAt" | "status" | "reference";

export interface BookingListSort {
  column: BookingSortColumn;
  direction: "asc" | "desc";
}

export interface BookingListPage {
  page: number;
  pageSize?: number;
}

/** One row of the bookings table. No `reasonForVisit`, notes or DOB. */
export interface BookingListRow {
  id: string;
  reference: string;
  status: BookingStatus;
  preferredDate: string;
  preferredTimeWindow: Booking["preferredTimeWindow"];
  serviceFamily: Booking["serviceFamily"];
  patientName: string | null;
  patientPhone: string | null;
  source: Booking["source"];
  createdAt: Date;
  locationId: string;
  locationName: string;
  assignedToUserId: string | null;
  assigneeName: string | null;
}

export interface BookingList {
  rows: BookingListRow[];
  total: number;
  page: number;
  pageSize: number;
}

const SORT_COLUMNS = {
  preferredDate: bookings.preferredDate,
  createdAt: bookings.createdAt,
  status: bookings.status,
  reference: bookings.reference,
} as const;

/**
 * Conditions in `bookings_admin_filter_idx` column order — status, location,
 * preferred date — so the composite index serves the common filters. Assignee
 * is not in that index and is applied as a residual predicate; booking volume
 * does not justify another index yet.
 */
function listConditions(filters: BookingListFilters): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters.statuses && filters.statuses.length > 0) {
    conditions.push(inArray(bookings.status, filters.statuses));
  }
  if (filters.locationId) {
    conditions.push(eq(bookings.locationId, filters.locationId));
  }
  if (filters.preferredFrom) {
    conditions.push(gte(bookings.preferredDate, filters.preferredFrom));
  }
  if (filters.preferredTo) {
    conditions.push(lte(bookings.preferredDate, filters.preferredTo));
  }
  if (filters.assignee === "unassigned") {
    conditions.push(isNull(bookings.assignedToUserId));
  } else if (filters.assignee) {
    conditions.push(eq(bookings.assignedToUserId, filters.assignee));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * A filtered, sorted page of bookings for `/admin/bookings`, with the total
 * matching count. `id` breaks sort ties so a row never shows on two pages.
 */
export async function listBookings(
  filters: BookingListFilters = {},
  sort: BookingListSort = { column: "preferredDate", direction: "asc" },
  page: BookingListPage = { page: 1 },
): Promise<BookingList> {
  const pageNumber = Math.max(1, Math.floor(page.page));
  const pageSize = Math.min(
    BOOKING_PAGE_SIZE_MAX,
    Math.max(1, Math.floor(page.pageSize ?? BOOKING_PAGE_SIZE_DEFAULT)),
  );
  const where = listConditions(filters);
  const order = sort.direction === "desc" ? desc : asc;
  const assignee = alias(users, "assignee");

  const [rows, counts] = await Promise.all([
    db()
      .select({
        id: bookings.id,
        reference: bookings.reference,
        status: bookings.status,
        preferredDate: bookings.preferredDate,
        preferredTimeWindow: bookings.preferredTimeWindow,
        serviceFamily: bookings.serviceFamily,
        patientName: bookings.patientName,
        patientPhone: bookings.patientPhone,
        source: bookings.source,
        createdAt: bookings.createdAt,
        locationId: bookings.locationId,
        locationName: locations.name,
        assignedToUserId: bookings.assignedToUserId,
        assigneeName: assignee.name,
      })
      .from(bookings)
      .innerJoin(locations, eq(locations.id, bookings.locationId))
      .leftJoin(assignee, eq(assignee.id, bookings.assignedToUserId))
      .where(where)
      .orderBy(order(SORT_COLUMNS[sort.column]), order(bookings.id))
      .limit(pageSize)
      .offset((pageNumber - 1) * pageSize),
    db()
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(where),
  ]);

  return { rows, total: counts[0]?.count ?? 0, page: pageNumber, pageSize };
}

export interface BookingHistoryEntry {
  id: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  changedAt: Date;
  changedByUserId: string | null;
  changedByName: string | null;
  note: string | null;
}

export interface AdminBookingDetail {
  booking: Booking;
  locationName: string;
  serviceName: string | null;
  assigneeName: string | null;
  history: BookingHistoryEntry[];
}

/**
 * One booking with its timeline, for the detail view.
 *
 * Includes `reasonForVisit`: only `editor` and `admin` can read bookings at all
 * (`can()`), which is exactly who §8 lets see it. The caller renders it and
 * nothing else — it must not be passed to a logger or into audit metadata. The
 * "detail opened" audit row belongs to the page, not to this read.
 */
export async function getBookingForAdmin(
  id: string,
): Promise<AdminBookingDetail | null> {
  const assignee = alias(users, "assignee");

  const found = await db()
    .select({
      booking: bookings,
      locationName: locations.name,
      serviceName: services.name,
      assigneeName: assignee.name,
    })
    .from(bookings)
    .innerJoin(locations, eq(locations.id, bookings.locationId))
    .leftJoin(services, eq(services.id, bookings.serviceId))
    .leftJoin(assignee, eq(assignee.id, bookings.assignedToUserId))
    .where(eq(bookings.id, id))
    .limit(1);

  const row = found[0];
  if (!row) return null;

  const history = await db()
    .select({
      id: bookingStatusHistory.id,
      fromStatus: bookingStatusHistory.fromStatus,
      toStatus: bookingStatusHistory.toStatus,
      changedAt: bookingStatusHistory.changedAt,
      changedByUserId: bookingStatusHistory.changedByUserId,
      changedByName: users.name,
      note: bookingStatusHistory.note,
    })
    .from(bookingStatusHistory)
    .leftJoin(users, eq(users.id, bookingStatusHistory.changedByUserId))
    .where(eq(bookingStatusHistory.bookingId, id))
    .orderBy(asc(bookingStatusHistory.changedAt), asc(bookingStatusHistory.id));

  return { ...row, history };
}

/**
 * Active `editor` and `admin` accounts, for the assignment dropdown.
 *
 * Its own query rather than the staff list (§8, B2): editors assign bookings but
 * may not see staff emails or lock state.
 */
export async function listAssignableUsers(): Promise<{ id: string; name: string }[]> {
  return db()
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(inArray(users.role, ASSIGNABLE_ROLES), isNull(users.deletedAt)))
    .orderBy(asc(users.name));
}

export type ChangeStatusRefusal = "not_found" | "actor_invalid" | TransitionRefusal;

export type ChangeStatusResult =
  | { ok: true; from: BookingStatus; to: BookingStatus; direction: "forward" | "backward" }
  | { ok: false; reason: ChangeStatusRefusal };

/**
 * Move a booking to `to`, recording the move in `booking_status_history`.
 *
 * One transaction: the status update and its history row land together or not
 * at all. Inside it:
 *
 * - the actor's role is read from `users`, not the session, so a demotion or
 *   deactivation applies now rather than at the next 5-minute session re-read;
 * - the booking row is locked `FOR UPDATE`, so two staff moving the same booking
 *   at once cannot both pass the transition check against the same old status.
 *
 * A refused move returns its reason and writes nothing. A database failure
 * throws and rolls back.
 */
export async function changeStatus(
  id: string,
  to: BookingStatus,
  actorId: string,
  note?: string | null,
): Promise<ChangeStatusResult> {
  const trimmedNote = note?.trim() || null;

  return dbTx().transaction(async (tx) => {
    const actors = await tx
      .select({ role: users.role })
      .from(users)
      .where(and(eq(users.id, actorId), isNull(users.deletedAt)))
      .limit(1);
    const actor = actors[0];
    if (!actor || !(ASSIGNABLE_ROLES as readonly Role[]).includes(actor.role)) {
      return { ok: false, reason: "actor_invalid" };
    }

    const current = await tx
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, id))
      .for("update");
    const from = current[0]?.status;
    if (!from) return { ok: false, reason: "not_found" };

    const check = checkTransition(from, to, { role: actor.role, note: trimmedNote });
    if (!check.ok) return check;

    await tx.update(bookings).set({ status: to }).where(eq(bookings.id, id));
    await tx.insert(bookingStatusHistory).values({
      bookingId: id,
      fromStatus: from,
      toStatus: to,
      changedByUserId: actorId,
      note: trimmedNote,
    });

    return { ok: true, from, to, direction: check.direction };
  });
}

export type AssignResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "assignee_invalid" };

/**
 * Assign a booking to an active `editor` or `admin`, or unassign with `null`.
 *
 * The assignee check sits inside the UPDATE (`WHERE EXISTS`), so an account
 * demoted or deactivated between the check and the write cannot be assigned.
 */
export async function assign(
  id: string,
  userId: string | null,
): Promise<AssignResult> {
  const eligible =
    userId === null
      ? undefined
      : sql`EXISTS (
          SELECT 1 FROM ${users}
          WHERE ${users.id} = ${userId}
            AND ${inArray(users.role, ASSIGNABLE_ROLES)}
            AND ${users.deletedAt} IS NULL
        )`;

  const updated = await db()
    .update(bookings)
    .set({ assignedToUserId: userId })
    .where(and(eq(bookings.id, id), eligible))
    .returning({ id: bookings.id });

  if (updated.length > 0) return { ok: true };
  return (await bookingExists(id))
    ? { ok: false, reason: "assignee_invalid" }
    : { ok: false, reason: "not_found" };
}

/**
 * Replace a booking's internal notes. Plain text; blank clears them.
 * Returns `false` when the booking does not exist.
 */
export async function updateNotes(id: string, text: string): Promise<boolean> {
  const notes = text.trim() || null;
  const updated = await db()
    .update(bookings)
    .set({ internalNotes: notes })
    .where(eq(bookings.id, id))
    .returning({ id: bookings.id });
  return updated.length > 0;
}

async function bookingExists(id: string): Promise<boolean> {
  const rows = await db()
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.id, id))
    .limit(1);
  return rows.length > 0;
}
