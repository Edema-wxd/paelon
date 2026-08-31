import { describe, expect, it } from "vitest";

import {
  BOOKING_MAX_DAYS_AHEAD,
  addDaysToIsoDate,
  bookingDate,
  dateOfBirth,
  email,
  isoDate,
  marketingConsent,
  ndprConsent,
  nigerianPhone,
  normaliseNigerianPhone,
  personName,
  slug,
  todayInLagos,
} from "@/lib/validation/primitives";

describe("normaliseNigerianPhone", () => {
  it.each([
    ["08012345678", "+2348012345678"],
    ["0801 234 5678", "+2348012345678"],
    ["0801-234-5678", "+2348012345678"],
    ["(0801) 234 5678", "+2348012345678"],
    ["2348012345678", "+2348012345678"],
    ["+2348012345678", "+2348012345678"],
    ["+234 801 234 5678", "+2348012345678"],
    ["8012345678", "+2348012345678"],
    ["09098765432", "+2349098765432"],
    ["07011122233", "+2347011122233"],
  ])("normalises %s to %s", (input, expected) => {
    expect(normaliseNigerianPhone(input)).toBe(expected);
  });

  it.each([
    ["", "empty"],
    ["0801234567", "10 digits with trunk prefix — too short"],
    ["080123456789", "12 digits — too long"],
    ["+1 415 555 0100", "not a Nigerian country code"],
    ["234801234567", "country code but subscriber too short"],
    ["0000000000", "leading zero subscriber"],
    ["not-a-number", "letters"],
    ["0801234567a", "trailing letter"],
    ["+++2348012345678", "malformed plus"],
  ])("rejects %s (%s)", (input) => {
    expect(normaliseNigerianPhone(input)).toBeNull();
  });

  it("parses and normalises through the zod schema", () => {
    expect(nigerianPhone.parse("0801 234 5678")).toBe("+2348012345678");
  });

  it("fails the zod schema with a user-facing message", () => {
    const result = nigerianPhone.safeParse("12345");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/Nigerian phone number/);
    }
  });
});

describe("email", () => {
  it.each([
    ["  Person@Example.COM  ", "person@example.com"],
    ["a.b+tag@sub.example.co.uk", "a.b+tag@sub.example.co.uk"],
  ])("accepts and canonicalises %s", (input, expected) => {
    expect(email.parse(input)).toBe(expected);
  });

  it.each(["", "not-an-email", "no@tld", "@example.com", "a b@example.com"])(
    "rejects %s",
    (input) => {
      expect(email.safeParse(input).success).toBe(false);
    },
  );
});

describe("todayInLagos", () => {
  it("returns the Lagos date, not the UTC date, at 23:30 WAT", () => {
    // 23:30 WAT on 1 March is 22:30 UTC on 1 March — same day.
    expect(todayInLagos(new Date("2026-03-01T22:30:00Z"))).toBe("2026-03-01");
  });

  it("is still the previous day in Lagos just before midnight UTC", () => {
    // 23:30 UTC on 1 March is 00:30 WAT on 2 March — Lagos has rolled over.
    expect(todayInLagos(new Date("2026-03-01T23:30:00Z"))).toBe("2026-03-02");
  });

  it("treats 00:30 UTC as still the same Lagos day it began", () => {
    // 00:30 UTC on 2 March is 01:30 WAT on 2 March.
    expect(todayInLagos(new Date("2026-03-02T00:30:00Z"))).toBe("2026-03-02");
  });
});

describe("addDaysToIsoDate", () => {
  it.each([
    ["2026-03-01", 1, "2026-03-02"],
    ["2026-02-28", 1, "2026-03-01"],
    ["2024-02-28", 1, "2024-02-29"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-03-01", 90, "2026-05-30"],
    ["2026-03-10", 0, "2026-03-10"],
  ])("adds %i days to %s", (date, days, expected) => {
    expect(addDaysToIsoDate(date, days)).toBe(expected);
  });
});

describe("isoDate", () => {
  it.each(["2026-03-01", "2024-02-29"])("accepts %s", (d) => {
    expect(isoDate.safeParse(d).success).toBe(true);
  });

  it.each([
    "2026-13-01",
    "2026-02-30",
    "2023-02-29",
    "01-03-2026",
    "2026-3-1",
    "",
  ])("rejects %s", (d) => {
    expect(isoDate.safeParse(d).success).toBe(false);
  });
});

describe("bookingDate", () => {
  // 23:30 WAT on 1 March 2026 == 22:30 UTC. In Lagos it is still 1 March.
  const lateNightWat = new Date("2026-03-01T22:30:00Z");
  const schema = bookingDate(lateNightWat);

  it("accepts today in Lagos", () => {
    expect(schema.safeParse("2026-03-01").success).toBe(true);
  });

  it("accepts tomorrow submitted at 23:30 WAT", () => {
    // The regression this test exists for: a naive UTC `new Date()` would
    // already read 2026-03-01T22:30Z as "1 March" but a server in a positive
    // offset could mis-round; and at 23:30 UTC the same booking would be
    // compared against 2 March and wrongly rejected.
    expect(schema.safeParse("2026-03-02").success).toBe(true);
  });

  it("rejects yesterday", () => {
    const result = schema.safeParse("2026-02-28");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/from today onwards/);
    }
  });

  it(`accepts exactly ${BOOKING_MAX_DAYS_AHEAD} days ahead`, () => {
    const latest = addDaysToIsoDate("2026-03-01", BOOKING_MAX_DAYS_AHEAD);
    expect(schema.safeParse(latest).success).toBe(true);
  });

  it(`rejects ${BOOKING_MAX_DAYS_AHEAD + 1} days ahead`, () => {
    const tooFar = addDaysToIsoDate("2026-03-01", BOOKING_MAX_DAYS_AHEAD + 1);
    const result = schema.safeParse(tooFar);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/within the next 90 days/);
    }
  });
});

describe("dateOfBirth", () => {
  it("accepts a past date", () => {
    expect(dateOfBirth.safeParse("1985-06-12").success).toBe(true);
  });

  it("rejects a future date", () => {
    expect(dateOfBirth.safeParse("2999-01-01").success).toBe(false);
  });

  it("rejects an implausibly old date", () => {
    expect(dateOfBirth.safeParse("1823-01-01").success).toBe(false);
  });
});

describe("ndprConsent", () => {
  it("accepts true", () => {
    expect(ndprConsent.parse(true)).toBe(true);
  });

  it.each([false, undefined, null, "true", 1])("rejects %s", (v) => {
    expect(ndprConsent.safeParse(v).success).toBe(false);
  });
});

describe("marketingConsent", () => {
  it("accepts both booleans and defaults to false", () => {
    expect(marketingConsent.parse(true)).toBe(true);
    expect(marketingConsent.parse(false)).toBe(false);
    expect(marketingConsent.parse(undefined)).toBe(false);
  });
});

describe("slug", () => {
  it.each(["victoria-island", "paediatrics", "a1-b2"])("accepts %s", (s) => {
    expect(slug.safeParse(s).success).toBe(true);
  });

  it.each(["Victoria-Island", "victoria island", "-leading", "trailing-", "a--b", ""])(
    "rejects %s",
    (s) => {
      expect(slug.safeParse(s).success).toBe(false);
    },
  );
});

describe("personName", () => {
  it("accepts a normal name and trims it", () => {
    expect(personName.parse("  Ada Obi  ")).toBe("Ada Obi");
  });

  it.each(["", "A", "x".repeat(101)])("rejects %s", (n) => {
    expect(personName.safeParse(n).success).toBe(false);
  });
});
