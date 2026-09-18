import { describe, expect, it } from "vitest";

import {
  auditHref,
  isFiltered,
  metadataPairs,
  parseAuditQuery,
} from "@/lib/admin/audit-view";

/**
 * The audit view state comes from a URL anyone can type, so these cover what it
 * refuses as much as what it reads.
 */

const ACTOR = "22222222-2222-4222-8222-222222222222";

describe("parseAuditQuery", () => {
  it("is empty for an empty query", () => {
    expect(parseAuditQuery({})).toEqual({ filters: {}, page: 1 });
  });

  it("reads dotted event and entity names", () => {
    const query = parseAuditQuery({ action: "booking.viewed", entity: "bookings" });
    expect(query.filters.action).toBe("booking.viewed");
    expect(query.filters.entityType).toBe("bookings");
  });

  it("refuses an event name that is not a dotted identifier", () => {
    for (const bad of ["Booking.Viewed", "booking viewed", "'; drop table", "a".repeat(65)]) {
      expect(parseAuditQuery({ action: bad }).filters.action, bad).toBeUndefined();
    }
  });

  it("keeps 'system' and real ids as the actor, and nothing else", () => {
    expect(parseAuditQuery({ actor: "system" }).filters.actor).toBe("system");
    expect(parseAuditQuery({ actor: ACTOR }).filters.actor).toBe(ACTOR);
    expect(parseAuditQuery({ actor: "francis" }).filters.actor).toBeUndefined();
  });

  it("accepts real dates and refuses impossible ones", () => {
    expect(parseAuditQuery({ from: "2026-09-01" }).filters.from).toBe("2026-09-01");
    expect(parseAuditQuery({ to: "2026-02-31" }).filters.to).toBeUndefined();
  });

  it("falls back to page 1 below 1 or when not a number", () => {
    expect(parseAuditQuery({ page: "7" }).page).toBe(7);
    expect(parseAuditQuery({ page: "0" }).page).toBe(1);
    expect(parseAuditQuery({ page: "last" }).page).toBe(1);
  });
});

describe("auditHref", () => {
  it("round-trips a filtered view and leaves defaults out", () => {
    const query = parseAuditQuery({
      action: "user.role_changed",
      entity: "users",
      actor: ACTOR,
      from: "2026-09-01",
      to: "2026-09-30",
      page: "3",
    });

    const search = new URLSearchParams(auditHref(query).split("?")[1]);
    expect(Object.fromEntries(search)).toEqual({
      action: "user.role_changed",
      entity: "users",
      actor: ACTOR,
      from: "2026-09-01",
      to: "2026-09-30",
      page: "3",
    });
    expect(auditHref(parseAuditQuery({}))).toBe("/admin/audit");
  });
});

describe("isFiltered", () => {
  it("is true only when a filter survived parsing", () => {
    expect(isFiltered(parseAuditQuery({}))).toBe(false);
    // Dropped by validation, so the view is not filtered.
    expect(isFiltered(parseAuditQuery({ actor: "francis" }))).toBe(false);
    expect(isFiltered(parseAuditQuery({ entity: "bookings" }))).toBe(true);
  });
});

describe("metadataPairs", () => {
  it("renders primitives, arrays and empty metadata", () => {
    expect(metadataPairs({})).toEqual([]);
    expect(
      metadataPairs({ role: "editor", changed: 3, cleared: true, keys: ["a", "b"] }),
    ).toEqual([
      { key: "role", value: "editor" },
      { key: "changed", value: "3" },
      { key: "cleared", value: "true" },
      { key: "keys", value: "a, b" },
    ]);
  });

  it("shows an unexpected shape rather than throwing", () => {
    expect(metadataPairs({ nested: { a: 1 }, missing: null })).toEqual([
      { key: "nested", value: '{"a":1}' },
      { key: "missing", value: "—" },
    ]);
  });
});
