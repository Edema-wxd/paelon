import type { Role } from "@/lib/auth/policy";
import type { BookingStatus } from "@/lib/db/schema";

/**
 * The booking status transition map (spec §8 Booking workflow, decision C5).
 *
 * ```
 * new ──────→ contacted ──→ confirmed ──→ completed
 *  │              │              │
 *  └→ cancelled   ├→ cancelled   ├→ cancelled
 *                 └→ no_show     └→ no_show
 * ```
 *
 * Pure data and pure functions, so the query layer, the server actions and the
 * detail view's dropdown all answer "is this move allowed" from one place.
 *
 * A backward move is the reverse of a forward edge — `confirmed → contacted`,
 * or `cancelled → contacted` to undo a misclicked cancel. It is `admin` only and
 * needs a note, because it rewrites what the timeline says happened. Nothing
 * else is reachable: `completed → new` is not an undo of any single step.
 */

export const BOOKING_TRANSITIONS: Readonly<
  Record<BookingStatus, readonly BookingStatus[]>
> = {
  new: ["contacted", "cancelled"],
  contacted: ["confirmed", "cancelled", "no_show"],
  confirmed: ["completed", "cancelled", "no_show"],
  completed: [],
  cancelled: [],
  no_show: [],
};

/** Is `from → to` a forward edge? */
export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from].includes(to);
}

/** Is `from → to` the undo of a forward edge? */
export function isBackwardTransition(
  from: BookingStatus,
  to: BookingStatus,
): boolean {
  return canTransition(to, from);
}

export type TransitionRefusal =
  | "unchanged"
  | "illegal"
  | "admin_only"
  | "note_required";

export type TransitionCheck =
  | { ok: true; direction: "forward" | "backward" }
  | { ok: false; reason: TransitionRefusal };

/**
 * May `role` move a booking from `from` to `to`, given this note?
 *
 * Forward moves are open to anyone who may update bookings (the caller checks
 * that with `can()`). Backward moves additionally need `admin` and a non-blank
 * note. The role check comes before the note check, so an editor is told the
 * move is not theirs rather than invited to write a note that will not help.
 */
export function checkTransition(
  from: BookingStatus,
  to: BookingStatus,
  { role, note }: { role: Role; note?: string | null },
): TransitionCheck {
  if (from === to) return { ok: false, reason: "unchanged" };
  if (canTransition(from, to)) return { ok: true, direction: "forward" };
  if (!isBackwardTransition(from, to)) return { ok: false, reason: "illegal" };
  if (role !== "admin") return { ok: false, reason: "admin_only" };
  if (!note || note.trim() === "") return { ok: false, reason: "note_required" };
  return { ok: true, direction: "backward" };
}

/**
 * Statuses `role` could move a booking to from `from`, forward first.
 * Backward moves are listed for `admin` only; they still need a note on submit.
 */
export function nextStatuses(from: BookingStatus, role: Role): BookingStatus[] {
  const forward = [...BOOKING_TRANSITIONS[from]];
  if (role !== "admin") return forward;

  const backward = (Object.keys(BOOKING_TRANSITIONS) as BookingStatus[]).filter(
    (status) => isBackwardTransition(from, status),
  );
  return [...forward, ...backward];
}
