import { describe, expect, it } from "vitest";

import { contactSchema } from "@/lib/validation/contact";
import { corporateSchema } from "@/lib/validation/corporate";
import {
  newsletterSchema,
  newsletterTokenSchema,
} from "@/lib/validation/newsletter";
import { hoursSchema, isTwentyFourHours } from "@/lib/validation/hours";

describe("contactSchema", () => {
  const valid = {
    name: "Ada Obi",
    email: "ada@example.com",
    subject: "Question about paediatrics",
    message: "I would like to know your opening hours this weekend.",
    consentNdpr: true,
  };

  it("accepts a valid submission without a phone", () => {
    expect(contactSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts and normalises an optional phone", () => {
    const parsed = contactSchema.parse({ ...valid, phone: "0801 234 5678" });
    expect(parsed.phone).toBe("+2348012345678");
  });

  it("treats an empty phone string as absent", () => {
    expect(contactSchema.parse({ ...valid, phone: "" }).phone).toBeUndefined();
  });

  it.each([
    ["missing consent", { consentNdpr: false }],
    ["bad email", { email: "nope" }],
    ["short subject", { subject: "hi" }],
    ["short message", { message: "too short" }],
    ["short name", { name: "A" }],
    ["invalid phone", { phone: "12345" }],
    ["overlong message", { message: "x".repeat(4001) }],
    ["bad location slug", { locationSlug: "Victoria Island" }],
  ])("rejects %s", (_case, override) => {
    expect(contactSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});

describe("corporateSchema", () => {
  const valid = {
    companyName: "Acme Nigeria Ltd",
    contactName: "Ada Obi",
    contactEmail: "ada@acme.example",
    contactPhone: "08012345678",
    companySize: "51_200",
    sector: "Manufacturing",
    requirements: "We need annual health checks for 120 staff across Lagos.",
    consentNdpr: true,
  };

  it("accepts a valid enquiry", () => {
    const result = corporateSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contactPhone).toBe("+2348012345678");
    }
  });

  it.each([
    ["missing consent", { consentNdpr: false }],
    ["unknown company size", { companySize: "2_10" }],
    ["missing phone", { contactPhone: "" }],
    ["short requirements", { requirements: "help" }],
    ["short company name", { companyName: "A" }],
    ["bad email", { contactEmail: "acme.example" }],
  ])("rejects %s", (_case, override) => {
    expect(corporateSchema.safeParse({ ...valid, ...override }).success).toBe(
      false,
    );
  });

  it("accepts an absent current provider", () => {
    expect(corporateSchema.parse(valid).currentProvider).toBeUndefined();
  });
});

describe("newsletterSchema", () => {
  it("accepts email plus consent and lowercases the address", () => {
    const parsed = newsletterSchema.parse({
      email: "Ada@Example.COM",
      consentNdpr: true,
    });
    expect(parsed.email).toBe("ada@example.com");
  });

  it("accepts an optional name", () => {
    expect(
      newsletterSchema.parse({
        email: "ada@example.com",
        name: "Ada",
        consentNdpr: true,
      }).name,
    ).toBe("Ada");
  });

  it.each([
    ["missing consent", { email: "ada@example.com" }],
    ["false consent", { email: "ada@example.com", consentNdpr: false }],
    ["bad email", { email: "nope", consentNdpr: true }],
    ["empty email", { email: "", consentNdpr: true }],
    ["overlong name", { email: "a@b.com", consentNdpr: true, name: "x".repeat(101) }],
    ["filled honeypot", { email: "a@b.com", consentNdpr: true, website: "spam" }],
  ])("rejects %s", (_case, payload) => {
    expect(newsletterSchema.safeParse(payload).success).toBe(false);
  });
});

describe("newsletterTokenSchema", () => {
  const token = "a".repeat(43);

  it("accepts a base64url token of plausible length", () => {
    expect(newsletterTokenSchema.safeParse({ token }).success).toBe(true);
  });

  it.each([
    ["too short", "abc"],
    ["too long", "a".repeat(129)],
    ["illegal characters", `${"a".repeat(40)}!@#`],
    ["empty", ""],
  ])("rejects a token that is %s", (_case, value) => {
    expect(newsletterTokenSchema.safeParse({ token: value }).success).toBe(false);
  });
});

describe("hoursSchema", () => {
  const openWeek = {
    mon: { open: "08:00", close: "18:00" },
    tue: { open: "08:00", close: "18:00" },
    wed: { open: "08:00", close: "18:00" },
    thu: { open: "08:00", close: "18:00" },
    fri: { open: "08:00", close: "18:00" },
    sat: { open: "09:00", close: "14:00" },
    sun: { closed: true },
  };

  it("accepts a normal week with one closed day", () => {
    expect(hoursSchema.safeParse(openWeek).success).toBe(true);
  });

  it("accepts a 24-hour branch", () => {
    const allDay = { open: "00:00", close: "23:59" };
    const week = { ...openWeek, mon: allDay };
    expect(hoursSchema.safeParse(week).success).toBe(true);
    expect(isTwentyFourHours(allDay)).toBe(true);
    expect(isTwentyFourHours({ open: "08:00", close: "18:00" })).toBe(false);
    expect(isTwentyFourHours({ closed: true })).toBe(false);
  });

  it.each([
    ["a missing day", { ...openWeek, sun: undefined }],
    ["a 12-hour clock time", { ...openWeek, mon: { open: "8:00am", close: "6pm" } }],
    ["an out-of-range hour", { ...openWeek, mon: { open: "25:00", close: "26:00" } }],
    ["close before open", { ...openWeek, mon: { open: "18:00", close: "08:00" } }],
    ["open equal to close", { ...openWeek, mon: { open: "09:00", close: "09:00" } }],
    ["a day with neither hours nor closed", { ...openWeek, mon: {} }],
  ])("rejects %s", (_case, week) => {
    expect(hoursSchema.safeParse(week).success).toBe(false);
  });
});
