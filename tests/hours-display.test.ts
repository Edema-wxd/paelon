import { describe, expect, it } from "vitest";

import {
  DAY_LABELS,
  describeDay,
  formatTime,
  hasPublishedHours,
  todayInLagos,
  toOpeningHoursSpecification,
} from "@/lib/locations/hours-display";
import type { Hours } from "@/lib/validation/hours";

const fullWeek: Hours = {
  mon: { open: "08:00", close: "18:00" },
  tue: { open: "08:00", close: "18:00" },
  wed: { open: "08:00", close: "18:00" },
  thu: { open: "08:00", close: "18:00" },
  fri: { open: "08:00", close: "18:00" },
  sat: { open: "09:00", close: "14:00" },
  sun: { closed: true },
};

describe("hasPublishedHours", () => {
  it("accepts a schedule with all seven days", () => {
    expect(hasPublishedHours(fullWeek)).toBe(true);
  });

  it("rejects the empty object a branch seeds with", () => {
    expect(hasPublishedHours({})).toBe(false);
  });

  it("rejects an absent schedule", () => {
    expect(hasPublishedHours(undefined)).toBe(false);
  });

  it("rejects a partial week, so a half-filled row never renders as fact", () => {
    const partial = { mon: { open: "08:00", close: "18:00" } };
    // Deliberately malformed input: the point of the guard is to catch a row
    // that was half-filled in the CMS.
    expect(hasPublishedHours(partial as unknown as Hours)).toBe(false);
  });
});

describe("formatTime", () => {
  it.each([
    ["00:00", "12:00 am"],
    ["08:00", "8:00 am"],
    ["11:30", "11:30 am"],
    ["12:00", "12:00 pm"],
    ["12:45", "12:45 pm"],
    ["18:00", "6:00 pm"],
    ["23:59", "11:59 pm"],
  ])("renders %s as %s", (input, expected) => {
    expect(formatTime(input)).toBe(expected);
  });
});

describe("describeDay", () => {
  it("names a closed day", () => {
    expect(describeDay({ closed: true })).toBe("Closed");
  });

  it("collapses a full-span day rather than printing 12:00 am to 11:59 pm", () => {
    expect(describeDay({ open: "00:00", close: "23:59" })).toBe(
      "Open 24 hours",
    );
  });

  it("renders an ordinary day as a range", () => {
    expect(describeDay({ open: "08:00", close: "18:00" })).toBe(
      "8:00 am to 6:00 pm",
    );
  });
});

describe("todayInLagos", () => {
  it("resolves a known instant to the Lagos weekday", () => {
    // 2026-08-31T00:30Z is Monday in both UTC and Lagos (UTC+1).
    expect(todayInLagos(new Date("2026-08-31T00:30:00Z"))).toBe("mon");
  });

  it("uses Lagos time, not UTC, across the day boundary", () => {
    // 23:30 UTC on Monday is already 00:30 Tuesday in Lagos.
    expect(todayInLagos(new Date("2026-08-31T23:30:00Z"))).toBe("tue");
  });

  it("returns a key that DAY_LABELS can render", () => {
    expect(DAY_LABELS[todayInLagos()]).toBeTypeOf("string");
  });
});

describe("toOpeningHoursSpecification", () => {
  it("emits one entry per open day and omits closed days", () => {
    const spec = toOpeningHoursSpecification(fullWeek);

    expect(spec).toHaveLength(6);
    expect(spec.map((s) => s.dayOfWeek)).not.toContain("Sunday");
    expect(spec[0]).toEqual({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "Monday",
      opens: "08:00",
      closes: "18:00",
    });
  });

  it("returns nothing when the schedule is unconfirmed, so the property is dropped", () => {
    expect(toOpeningHoursSpecification({})).toEqual([]);
    expect(toOpeningHoursSpecification(undefined)).toEqual([]);
  });
});
