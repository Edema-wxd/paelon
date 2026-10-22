import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  closePool,
  configureTestDatabase,
  hasDatabase,
  resetDatabase,
  seedBooking,
  seedLocation,
  seedUser,
} from "./setup";

configureTestDatabase();

const describeIfDb = hasDatabase ? describe : describe.skip;

type Queries = typeof import("@/lib/db/queries/bookings");

function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const r = (result as { rows: unknown }).rows;
    return Array.isArray(r) ? (r as T[]) : [];
  }
  return [];
}

describeIfDb("booking workflow", () => {
  let db: typeof import("@/lib/db/client").db;
  let q: Queries;
  let locationId: string;
  let adminId: string;
  let editorId: string;

  beforeAll(async () => {
    ({ db } = await import("@/lib/db/client"));
    q = await import("@/lib/db/queries/bookings");
  });

  beforeEach(async () => {
    await resetDatabase();
    locationId = await seedLocation();
    adminId = await seedUser("admin", { name: "Ada Admin" });
    editorId = await seedUser("editor", { name: "Eddie Editor" });
  });

  afterAll(async () => {
    await closePool();
  });

  async function statusOf(id: string): Promise<string> {
    const result = await db().execute(sql`SELECT status FROM bookings WHERE id = ${id}`);
    return rows<{ status: string }>(result)[0]!.status;
  }

  async function historyOf(id: string) {
    const result = await db().execute(sql`
      SELECT from_status, to_status, changed_by_user_id, note
      FROM booking_status_history WHERE booking_id = ${id}
      ORDER BY changed_at, id
    `);
    return rows<{
      from_status: string | null;
      to_status: string;
      changed_by_user_id: string | null;
      note: string | null;
    }>(result);
  }

  describe("changeStatus transaction", () => {
    it("updates the status and appends one history row", async () => {
      const id = await seedBooking(locationId);

      const result = await q.changeStatus(id, "contacted", editorId, "  Left a voicemail  ");

      expect(result).toEqual({ ok: true, from: "new", to: "contacted", direction: "forward" });
      expect(await statusOf(id)).toBe("contacted");
      const history = await historyOf(id);
      expect(history).toHaveLength(2);
      expect(history[1]).toEqual({
        from_status: "new",
        to_status: "contacted",
        changed_by_user_id: editorId,
        note: "Left a voicemail",
      });
    });

    it("rolls back the status update when the history insert fails", async () => {
      const id = await seedBooking(locationId);

      await db().execute(sql`
        CREATE OR REPLACE FUNCTION test_fail_history() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'history insert blocked by test'; END;
        $$ LANGUAGE plpgsql
      `);
      await db().execute(sql`
        CREATE TRIGGER test_fail_history BEFORE INSERT ON booking_status_history
        FOR EACH ROW EXECUTE FUNCTION test_fail_history()
      `);

      try {
        await expect(q.changeStatus(id, "contacted", editorId)).rejects.toThrow();
      } finally {
        await db().execute(sql`DROP TRIGGER IF EXISTS test_fail_history ON booking_status_history`);
        await db().execute(sql`DROP FUNCTION IF EXISTS test_fail_history()`);
      }

      expect(await statusOf(id)).toBe("new");
      expect(await historyOf(id)).toHaveLength(1);
    });

    it("lets exactly one of two concurrent identical moves win", async () => {
      const id = await seedBooking(locationId);

      // Without the row lock both would read `new` and both would write history.
      const results = await Promise.all([
        q.changeStatus(id, "contacted", editorId),
        q.changeStatus(id, "contacted", adminId),
      ]);

      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: "unchanged" }]);
      expect(await statusOf(id)).toBe("contacted");
      expect(await historyOf(id)).toHaveLength(2);
    });
  });

  describe("changeStatus refusals", () => {
    it.each([
      ["new", "completed", "illegal"],
      ["new", "no_show", "illegal"],
      ["new", "new", "unchanged"],
    ] as const)("%s → %s is %s and writes nothing", async (_from, to, reason) => {
      const id = await seedBooking(locationId);

      expect(await q.changeStatus(id, to, adminId, "note")).toEqual({ ok: false, reason });
      expect(await statusOf(id)).toBe("new");
      expect(await historyOf(id)).toHaveLength(1);
    });

    it("refuses a backward move by an editor, even with a note", async () => {
      const id = await seedBooking(locationId);
      await q.changeStatus(id, "contacted", editorId);

      const result = await q.changeStatus(id, "new", editorId, "Wrong booking");

      expect(result).toEqual({ ok: false, reason: "admin_only" });
      expect(await statusOf(id)).toBe("contacted");
      expect(await historyOf(id)).toHaveLength(2);
    });

    it("refuses a backward move by an admin without a note", async () => {
      const id = await seedBooking(locationId);
      await q.changeStatus(id, "cancelled", editorId);

      expect(await q.changeStatus(id, "new", adminId, "   ")).toEqual({
        ok: false,
        reason: "note_required",
      });
      expect(await statusOf(id)).toBe("cancelled");
      expect(await historyOf(id)).toHaveLength(2);
    });

    it("allows a backward move by an admin with a note", async () => {
      const id = await seedBooking(locationId);
      await q.changeStatus(id, "cancelled", editorId);

      const result = await q.changeStatus(id, "new", adminId, "Cancelled by mistake");

      expect(result).toEqual({ ok: true, from: "cancelled", to: "new", direction: "backward" });
      const history = await historyOf(id);
      expect(history).toHaveLength(3);
      expect(history[2]).toMatchObject({ to_status: "new", note: "Cancelled by mistake" });
    });

    it("refuses a contributor, a deactivated account and an unknown actor", async () => {
      const id = await seedBooking(locationId);
      const contributor = await seedUser("contributor");
      const deactivated = await seedUser("admin", { deleted: true });

      for (const actor of [contributor, deactivated, crypto.randomUUID()]) {
        expect(await q.changeStatus(id, "contacted", actor)).toEqual({
          ok: false,
          reason: "actor_invalid",
        });
      }
      expect(await historyOf(id)).toHaveLength(1);
    });

    it("reports a missing booking", async () => {
      expect(await q.changeStatus(crypto.randomUUID(), "contacted", adminId)).toEqual({
        ok: false,
        reason: "not_found",
      });
    });
  });

  describe("assign", () => {
    it("assigns to editors and admins only, and unassigns with null", async () => {
      const id = await seedBooking(locationId);
      const contributor = await seedUser("contributor");
      const deactivated = await seedUser("editor", { deleted: true });

      expect(await q.assign(id, contributor)).toEqual({ ok: false, reason: "assignee_invalid" });
      expect(await q.assign(id, deactivated)).toEqual({ ok: false, reason: "assignee_invalid" });
      expect(await q.assign(crypto.randomUUID(), editorId)).toEqual({
        ok: false,
        reason: "not_found",
      });

      expect(await q.assign(id, editorId)).toEqual({ ok: true });
      expect((await q.getBookingForAdmin(id))?.assigneeName).toBe("Eddie Editor");

      expect(await q.assign(id, null)).toEqual({ ok: true });
      expect((await q.getBookingForAdmin(id))?.booking.assignedToUserId).toBeNull();
    });

    it("lists only active editors and admins as assignable", async () => {
      await seedUser("contributor");
      await seedUser("admin", { name: "Gone Admin", deleted: true });

      const names = (await q.listAssignableUsers()).map((u) => u.name);
      expect(names).toEqual(["Ada Admin", "Eddie Editor"]);
    });
  });

  describe("updateNotes and getBookingForAdmin", () => {
    it("saves trimmed notes, clears blank ones, and returns the timeline with actors", async () => {
      const id = await seedBooking(locationId);
      await q.changeStatus(id, "contacted", editorId, "Called");

      expect(await q.updateNotes(id, "  Prefers mornings  ")).toBe(true);
      let detail = await q.getBookingForAdmin(id);
      expect(detail?.booking.internalNotes).toBe("Prefers mornings");
      expect(detail?.booking.reasonForVisit).toBe("Persistent headache");
      expect(detail?.locationName).toBe("Victoria Island");
      expect(detail?.history.map((h) => [h.toStatus, h.changedByName])).toEqual([
        ["new", null],
        ["contacted", "Eddie Editor"],
      ]);

      expect(await q.updateNotes(id, "   ")).toBe(true);
      detail = await q.getBookingForAdmin(id);
      expect(detail?.booking.internalNotes).toBeNull();

      expect(await q.updateNotes(crypto.randomUUID(), "x")).toBe(false);
      expect(await q.getBookingForAdmin(crypto.randomUUID())).toBeNull();
    });
  });

  describe("listBookings", () => {
    it("filters, sorts and pages without exposing health data or notes", async () => {
      const otherLocation = await seedLocation("ikeja");
      const a = await seedBooking(locationId, { preferredDate: "2030-01-10", patientName: "A" });
      const b = await seedBooking(locationId, { preferredDate: "2030-01-20", patientName: "B" });
      const c = await seedBooking(otherLocation, { preferredDate: "2030-01-15", patientName: "C" });
      await q.changeStatus(b, "contacted", editorId);
      await q.assign(c, editorId);

      const all = await q.listBookings();
      expect(all.total).toBe(3);
      expect(all.rows.map((r) => r.id)).toEqual([a, c, b]);
      for (const row of all.rows) {
        expect(row).not.toHaveProperty("reasonForVisit");
        expect(row).not.toHaveProperty("internalNotes");
        expect(row).not.toHaveProperty("patientDob");
        expect(row).not.toHaveProperty("patientEmail");
      }

      expect((await q.listBookings({ statuses: ["contacted"] })).rows.map((r) => r.id)).toEqual([b]);
      expect((await q.listBookings({ locationId: otherLocation })).rows.map((r) => r.id)).toEqual([c]);
      expect(
        (await q.listBookings({ preferredFrom: "2030-01-15", preferredTo: "2030-01-20" })).rows.map(
          (r) => r.id,
        ),
      ).toEqual([c, b]);

      const assigned = await q.listBookings({ assignee: editorId });
      expect(assigned.rows.map((r) => [r.id, r.assigneeName])).toEqual([[c, "Eddie Editor"]]);
      expect((await q.listBookings({ assignee: "unassigned" })).total).toBe(2);

      const sorted = await q.listBookings({}, { column: "preferredDate", direction: "desc" });
      expect(sorted.rows.map((r) => r.id)).toEqual([b, c, a]);

      const page2 = await q.listBookings(
        {},
        { column: "preferredDate", direction: "asc" },
        { page: 2, pageSize: 2 },
      );
      expect(page2).toMatchObject({ total: 3, page: 2, pageSize: 2 });
      expect(page2.rows.map((r) => r.id)).toEqual([b]);
    });
  });
});
