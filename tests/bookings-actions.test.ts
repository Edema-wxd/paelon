import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminUser } from "@/lib/auth/session";

/**
 * The booking workflow actions with the session, the booking queries, the audit
 * writer and the cache mocked. The transition rules themselves are covered by
 * `booking-status.test.ts` and the integration suite; this checks the wiring —
 * who is refused, that bulk work is per row, and what reaches the audit log.
 */

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  writeAuditEntry: vi.fn(),
  changeStatus: vi.fn(),
  assign: vi.fn(),
  updateNotes: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/db/queries/users", () => ({ writeAuditEntry: mocks.writeAuditEntry }));
vi.mock("@/lib/db/queries/bookings", () => ({
  changeStatus: mocks.changeStatus,
  assign: mocks.assign,
  updateNotes: mocks.updateNotes,
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const actions = await import("@/lib/admin/bookings-actions");
const { DENIED_MESSAGE } = await import("@/lib/admin/action");

const A = "7f1c1c52-8a1e-4a8e-9d3b-2f6f5f0c9a11";
const B = "0b6c7d1e-3f4a-4b5c-8d6e-7f8091a2b3c4";
const C = "1a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d";

function user(role: AdminUser["role"]): AdminUser {
  return { id: "actor-1", name: "Staff", email: "staff@example.test", role, roleLabel: role };
}

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [k, v] of entries) data.append(k, v);
  return data;
}

function auditMetadata(): Record<string, unknown> {
  const call = mocks.writeAuditEntry.mock.calls[0]?.[0] as { metadata: Record<string, unknown> };
  return call.metadata;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("booking actions", () => {
  it("refuses a contributor before touching a booking", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("contributor"));

    const result = await actions.bulkMarkContactedAction(
      null,
      form([["bookingIds", A]]),
    );

    expect(result).toEqual({ ok: false, error: DENIED_MESSAGE, fields: {} });
    expect(mocks.changeStatus).not.toHaveBeenCalled();
    expect(mocks.writeAuditEntry).not.toHaveBeenCalled();
  });

  it("keeps the note out of the audit row", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("admin"));
    mocks.changeStatus.mockResolvedValue({
      ok: true,
      from: "confirmed",
      to: "contacted",
      direction: "backward",
    });

    const result = await actions.changeStatusAction(
      null,
      form([
        ["bookingId", A],
        ["to", "contacted"],
        ["note", "Patient said their chest pain has gone"],
      ]),
    );

    expect(result.ok).toBe(true);
    expect(mocks.changeStatus).toHaveBeenCalledWith(
      A,
      "contacted",
      "actor-1",
      "Patient said their chest pain has gone",
    );
    const metadata = auditMetadata();
    expect(metadata).toEqual({ from: "confirmed", to: "contacted", direction: "backward" });
    expect(JSON.stringify(mocks.writeAuditEntry.mock.calls)).not.toContain("chest pain");
  });

  it("reports a missing note against the note field and writes no audit row", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("admin"));
    mocks.changeStatus.mockResolvedValue({ ok: false, reason: "note_required" });

    const result = await actions.changeStatusAction(
      null,
      form([["bookingId", A], ["to", "contacted"]]),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields.note).toHaveLength(1);
    expect(mocks.writeAuditEntry).not.toHaveBeenCalled();
  });

  it("transitions each booking individually and reports skips", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor"));
    mocks.changeStatus
      .mockResolvedValueOnce({ ok: true, from: "new", to: "cancelled", direction: "forward" })
      .mockResolvedValueOnce({ ok: false, reason: "illegal" })
      .mockResolvedValueOnce({ ok: true, from: "contacted", to: "cancelled", direction: "forward" });

    const result = await actions.bulkMarkCancelledAction(
      null,
      form([["bookingIds", A], ["bookingIds", B], ["bookingIds", C], ["bookingIds", A]]),
    );

    expect(mocks.changeStatus).toHaveBeenCalledTimes(3);
    expect(mocks.changeStatus.mock.calls.map((c) => c[0])).toEqual([A, B, C]);
    for (const call of mocks.changeStatus.mock.calls) {
      expect(call[1]).toBe("cancelled");
      expect(call[2]).toBe("actor-1");
    }
    expect(result).toEqual({
      ok: true,
      data: { changed: 2, skipped: [{ bookingId: B, reason: "illegal" }] },
    });
    expect(auditMetadata()).toEqual({
      to: "cancelled",
      requested: 3,
      changed: 2,
      skipped: 1,
      booking_ids: [A, B, C],
    });
  });

  it("fails a bulk action when no booking changed", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor"));
    mocks.changeStatus.mockResolvedValue({ ok: false, reason: "illegal" });

    const result = await actions.bulkMarkContactedAction(null, form([["bookingIds", A]]));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details).toEqual([{ bookingId: A, reason: "illegal" }]);
    expect(mocks.writeAuditEntry).not.toHaveBeenCalled();
  });

  it("assigns each selected booking to the signed-in user", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor"));
    mocks.assign.mockResolvedValue({ ok: true });

    const result = await actions.bulkAssignToMeAction(
      null,
      form([["bookingIds", A], ["bookingIds", B]]),
    );

    expect(result).toEqual({ ok: true, data: { changed: 2, skipped: [] } });
    expect(mocks.assign.mock.calls).toEqual([[A, "actor-1"], [B, "actor-1"]]);
  });

  it("rejects an empty bulk selection", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor"));

    const result = await actions.bulkAssignToMeAction(null, form([]));

    expect(result.ok).toBe(false);
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it("unassigns with an empty userId and keeps notes text out of the audit row", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor"));
    mocks.assign.mockResolvedValue({ ok: true });
    mocks.updateNotes.mockResolvedValue(true);

    await actions.assignAction(null, form([["bookingId", A], ["userId", ""]]));
    expect(mocks.assign).toHaveBeenCalledWith(A, null);

    mocks.writeAuditEntry.mockClear();
    await actions.updateNotesAction(
      null,
      form([["bookingId", A], ["notes", "Called twice, no answer"]]),
    );
    expect(auditMetadata()).toEqual({ cleared: false });
    expect(JSON.stringify(mocks.writeAuditEntry.mock.calls)).not.toContain("no answer");
  });
});
