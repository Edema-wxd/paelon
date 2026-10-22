"use server";

import { z } from "zod";

import {
  adminAction,
  done,
  fail,
  type ActionResult,
  type ActionState,
} from "@/lib/admin/action";
import {
  assign,
  changeStatus,
  updateNotes,
  type ChangeStatusRefusal,
} from "@/lib/db/queries/bookings";
import { bookingStatusEnum, type BookingStatus } from "@/lib/db/schema";

/**
 * Booking workflow actions (spec §8 Booking workflow), built on `adminAction`,
 * which does the session, `can(..., "update", "bookings")`, parsing, the audit
 * row and revalidation. Editors and admins pass; contributors never do.
 *
 * The transition rules live in `lib/booking/status.ts` and are enforced inside
 * `changeStatus`'s transaction — these actions only translate its answer.
 *
 * Audit metadata is ids and enum values. Never the note, the internal notes or
 * `reason_for_visit`: a status note is free text a member of staff typed about
 * a patient, which makes it patient data.
 */

const BOOKINGS_PATH = "/admin/bookings";
const MAX_BULK = 100;

export type BookingMessage = { message: string };
export type BookingResult = ActionResult<BookingMessage>;
export type BookingState = ActionState<BookingMessage>;

export interface BulkSkip {
  bookingId: string;
  reason: ChangeStatusRefusal | "assignee_invalid";
}
export interface BulkOutcome {
  changed: number;
  skipped: BulkSkip[];
}
export type BulkResult = ActionResult<BulkOutcome, BulkSkip[]>;
export type BulkState = ActionState<BulkOutcome, BulkSkip[]>;

const REFUSAL_MESSAGES: Record<ChangeStatusRefusal | "assignee_invalid", string> = {
  not_found: "That booking no longer exists.",
  actor_invalid: "You do not have permission to do that.",
  unchanged: "The booking already has that status.",
  illegal: "A booking cannot move to that status from its current one.",
  admin_only: "Only an admin can move a booking back to an earlier status.",
  note_required: "Add a note explaining why the booking is moving back.",
  assignee_invalid: "Bookings can only be assigned to an active editor or admin.",
};

const bookingId = z.uuid("That booking no longer exists.");

const statusSchema = z.object({
  bookingId,
  to: z.enum(bookingStatusEnum.enumValues, "Choose a status."),
  note: z.string().trim().max(2000, "Keep the note under 2,000 characters.").optional(),
});

const assignSchema = z.object({
  bookingId,
  userId: z
    .union([z.literal(""), z.uuid("Choose a member of staff.")])
    .transform((value) => (value === "" ? null : value)),
});

const notesSchema = z.object({
  bookingId,
  notes: z.string().max(5000, "Keep internal notes under 5,000 characters."),
});

const bulkSchema = z.object({
  bookingIds: z
    .array(bookingId)
    .min(1, "Select at least one booking.")
    .max(MAX_BULK, `Select at most ${MAX_BULK} bookings at a time.`)
    .transform((ids) => [...new Set(ids)]),
});

/** Bulk forms submit one `bookingIds` entry per checked row. */
function bulkInput(formData: FormData): unknown {
  return { bookingIds: formData.getAll("bookingIds") };
}

/** Move one booking to a new status. Backward moves need `admin` and a note. */
export const changeStatusAction = adminAction(
  {
    resource: "bookings",
    action: "update",
    schema: statusSchema,
    event: "booking.status_changed",
    path: BOOKINGS_PATH,
  },
  async ({ bookingId: id, to, note }, { user }) => {
    const result = await changeStatus(id, to, user.id, note);
    if (!result.ok) {
      const error = REFUSAL_MESSAGES[result.reason];
      return result.reason === "note_required"
        ? fail(error, { fields: { note: [error] } })
        : fail(error);
    }

    return done(
      { message: "Status updated." },
      {
        entityId: id,
        metadata: { from: result.from, to: result.to, direction: result.direction },
      },
    );
  },
);

/** Assign a booking to an editor or admin, or unassign it with an empty `userId`. */
export const assignAction = adminAction(
  {
    resource: "bookings",
    action: "update",
    schema: assignSchema,
    event: "booking.assigned",
    path: BOOKINGS_PATH,
  },
  async ({ bookingId: id, userId }) => {
    const result = await assign(id, userId);
    if (!result.ok) return fail(REFUSAL_MESSAGES[result.reason]);

    return done(
      { message: userId ? "Booking assigned." : "Booking unassigned." },
      { entityId: id, metadata: { assignee_id: userId } },
    );
  },
);

/** Replace a booking's internal notes. */
export const updateNotesAction = adminAction(
  {
    resource: "bookings",
    action: "update",
    schema: notesSchema,
    event: "booking.notes_updated",
    path: BOOKINGS_PATH,
  },
  async ({ bookingId: id, notes }) => {
    const found = await updateNotes(id, notes);
    if (!found) return fail(REFUSAL_MESSAGES.not_found);

    return done(
      { message: "Notes saved." },
      { entityId: id, metadata: { cleared: notes.trim() === "" } },
    );
  },
);

/**
 * The shared bulk loop. Each booking is handled on its own — its own
 * transaction, its own history row — one after another, so a refusal on one
 * row skips that row rather than failing the rest.
 */
async function eachBooking(
  ids: string[],
  apply: (id: string) => Promise<{ ok: true } | { ok: false; reason: BulkSkip["reason"] }>,
): Promise<BulkOutcome> {
  const outcome: BulkOutcome = { changed: 0, skipped: [] };
  for (const id of ids) {
    const result = await apply(id);
    if (result.ok) outcome.changed += 1;
    else outcome.skipped.push({ bookingId: id, reason: result.reason });
  }
  return outcome;
}

function bulkStatusAction(to: BookingStatus) {
  return adminAction<typeof bulkSchema, BulkOutcome, BulkSkip[]>(
    {
      resource: "bookings",
      action: "update",
      schema: bulkSchema,
      event: "booking.bulk_status_changed",
      path: BOOKINGS_PATH,
      input: bulkInput,
    },
    async ({ bookingIds }, { user }) => {
      const outcome = await eachBooking(bookingIds, (id) =>
        changeStatus(id, to, user.id),
      );
      if (outcome.changed === 0) {
        return fail("None of the selected bookings could be updated.", {
          details: outcome.skipped,
        });
      }

      return done(outcome, {
        metadata: {
          to,
          requested: bookingIds.length,
          changed: outcome.changed,
          skipped: outcome.skipped.length,
          booking_ids: bookingIds,
        },
      });
    },
  );
}

/** Bulk: mark selected bookings contacted. Rows that cannot move are skipped. */
export const bulkMarkContactedAction = bulkStatusAction("contacted");

/** Bulk: mark selected bookings cancelled. Rows that cannot move are skipped. */
export const bulkMarkCancelledAction = bulkStatusAction("cancelled");

/** Bulk: assign selected bookings to the signed-in user. */
export const bulkAssignToMeAction = adminAction<typeof bulkSchema, BulkOutcome, BulkSkip[]>(
  {
    resource: "bookings",
    action: "update",
    schema: bulkSchema,
    event: "booking.bulk_assigned",
    path: BOOKINGS_PATH,
    input: bulkInput,
  },
  async ({ bookingIds }, { user }) => {
    const outcome = await eachBooking(bookingIds, (id) => assign(id, user.id));
    if (outcome.changed === 0) {
      return fail("None of the selected bookings could be assigned.", {
        details: outcome.skipped,
      });
    }

    return done(outcome, {
      metadata: {
        assignee_id: user.id,
        requested: bookingIds.length,
        changed: outcome.changed,
        skipped: outcome.skipped.length,
        booking_ids: bookingIds,
      },
    });
  },
);
