import { describe, expect, it } from "vitest";

import {
  BOOKING_TRANSITIONS,
  canTransition,
  checkTransition,
  isBackwardTransition,
  nextStatuses,
} from "@/lib/booking/status";
import { bookingStatusEnum, type BookingStatus } from "@/lib/db/schema";

/**
 * Every ordered pair of the six statuses, against a table written out by hand
 * from spec §8 and decision C5 — not derived from the map under test.
 */

const STATUSES = bookingStatusEnum.enumValues;

const FORWARD = new Set([
  "new>contacted",
  "new>cancelled",
  "contacted>confirmed",
  "contacted>cancelled",
  "contacted>no_show",
  "confirmed>completed",
  "confirmed>cancelled",
  "confirmed>no_show",
]);

const BACKWARD = new Set([
  "contacted>new",
  "cancelled>new",
  "confirmed>contacted",
  "cancelled>contacted",
  "no_show>contacted",
  "completed>confirmed",
  "cancelled>confirmed",
  "no_show>confirmed",
]);

const PAIRS: [BookingStatus, BookingStatus][] = STATUSES.flatMap((from) =>
  STATUSES.map((to) => [from, to] as [BookingStatus, BookingStatus]),
);

const key = (from: BookingStatus, to: BookingStatus) => `${from}>${to}`;

describe("booking status transitions", () => {
  it("covers all 36 pairs", () => {
    expect(PAIRS).toHaveLength(36);
  });

  it.each(PAIRS)("%s → %s", (from, to) => {
    const k = key(from, to);
    const forward = FORWARD.has(k);
    const backward = BACKWARD.has(k);

    expect(canTransition(from, to)).toBe(forward);
    expect(isBackwardTransition(from, to)).toBe(backward);

    const editor = checkTransition(from, to, { role: "editor", note: "because" });
    const adminNoNote = checkTransition(from, to, { role: "admin" });
    const adminBlankNote = checkTransition(from, to, { role: "admin", note: "   " });
    const adminNote = checkTransition(from, to, { role: "admin", note: "because" });

    if (from === to) {
      for (const check of [editor, adminNoNote, adminBlankNote, adminNote]) {
        expect(check).toEqual({ ok: false, reason: "unchanged" });
      }
    } else if (forward) {
      for (const check of [editor, adminNoNote, adminBlankNote, adminNote]) {
        expect(check).toEqual({ ok: true, direction: "forward" });
      }
    } else if (backward) {
      expect(editor).toEqual({ ok: false, reason: "admin_only" });
      expect(checkTransition(from, to, { role: "editor" })).toEqual({
        ok: false,
        reason: "admin_only",
      });
      expect(adminNoNote).toEqual({ ok: false, reason: "note_required" });
      expect(adminBlankNote).toEqual({ ok: false, reason: "note_required" });
      expect(adminNote).toEqual({ ok: true, direction: "backward" });
    } else {
      for (const check of [editor, adminNoNote, adminBlankNote, adminNote]) {
        expect(check).toEqual({ ok: false, reason: "illegal" });
      }
    }
  });

  it("gives terminal statuses no forward edges", () => {
    for (const status of ["completed", "cancelled", "no_show"] as const) {
      expect(BOOKING_TRANSITIONS[status]).toEqual([]);
    }
  });

  it("lists backward moves for admins only", () => {
    expect(nextStatuses("confirmed", "editor")).toEqual(["completed", "cancelled", "no_show"]);
    expect(nextStatuses("confirmed", "admin")).toEqual([
      "completed",
      "cancelled",
      "no_show",
      "contacted",
    ]);
    expect(nextStatuses("cancelled", "editor")).toEqual([]);
    expect(nextStatuses("cancelled", "admin")).toEqual(["new", "contacted", "confirmed"]);
  });
});
