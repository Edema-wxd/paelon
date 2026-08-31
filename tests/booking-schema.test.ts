import { describe, expect, it } from "vitest";

import {
  bookingStep1,
  bookingStep2,
  bookingStep3,
  bookingStep4,
  bookingStep5,
  bookingStep6,
  bookingSubmissionSchema,
} from "@/lib/validation/booking";

/** Fixed clock so date assertions do not drift with the calendar. */
const NOW = new Date("2026-03-01T10:00:00Z");

const validPayload = {
  locationSlug: "victoria-island",
  serviceFamily: "women_and_children",
  serviceSlug: "paediatrics",
  preferredDate: "2026-03-05",
  preferredTimeWindow: "morning",
  patientName: "Ada Obi",
  patientPhone: "0801 234 5678",
  patientEmail: "Ada@Example.com",
  patientDob: "1990-04-11",
  existingPatient: false,
  reasonForVisit: "Routine check",
  hmoSlug: "axa-mansard",
  hmoPlan: "Silver",
  consentNdpr: true,
  consentMarketing: false,
} as const;

/** `validPayload` without one key, for "what happens when this is absent" cases. */
function omit(key: keyof typeof validPayload): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...validPayload };
  delete copy[key];
  return copy;
}

describe("booking step schemas", () => {
  it("step 1 accepts a branch slug and rejects a non-slug", () => {
    expect(bookingStep1.safeParse({ locationSlug: "ikeja" }).success).toBe(true);
    expect(bookingStep1.safeParse({ locationSlug: "Ikeja Branch" }).success).toBe(
      false,
    );
    expect(bookingStep1.safeParse({}).success).toBe(false);
  });

  it("step 2 requires a known service family and allows an absent service", () => {
    expect(bookingStep2.safeParse({ serviceFamily: "diagnostics" }).success).toBe(
      true,
    );
    expect(bookingStep2.safeParse({ serviceFamily: "dentistry" }).success).toBe(
      false,
    );
  });

  it("step 3 requires a valid window and an in-range date", () => {
    const schema = bookingStep3(NOW);
    expect(
      schema.safeParse({
        preferredDate: "2026-03-05",
        preferredTimeWindow: "evening",
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        preferredDate: "2026-03-05",
        preferredTimeWindow: "midnight",
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        preferredDate: "2026-02-01",
        preferredTimeWindow: "morning",
      }).success,
    ).toBe(false);
  });

  it("step 4 normalises phone and email", () => {
    const parsed = bookingStep4.parse({
      patientName: "Ada Obi",
      patientPhone: "0801 234 5678",
      patientEmail: "  Ada@Example.COM ",
    });
    expect(parsed.patientPhone).toBe("+2348012345678");
    expect(parsed.patientEmail).toBe("ada@example.com");
    expect(parsed.existingPatient).toBe(false);
  });

  it("step 4 rejects a short name and a bad phone", () => {
    expect(
      bookingStep4.safeParse({
        patientName: "A",
        patientPhone: "0801 234 5678",
        patientEmail: "a@b.com",
      }).success,
    ).toBe(false);
    expect(
      bookingStep4.safeParse({
        patientName: "Ada Obi",
        patientPhone: "12345",
        patientEmail: "a@b.com",
      }).success,
    ).toBe(false);
  });

  it("step 5 treats no HMO as valid — paying privately is first-class", () => {
    expect(bookingStep5.safeParse({}).success).toBe(true);
  });

  it("step 6 requires NDPR consent and defaults marketing to false", () => {
    expect(bookingStep6.parse({ consentNdpr: true }).consentMarketing).toBe(false);
    expect(bookingStep6.safeParse({ consentNdpr: false }).success).toBe(false);
  });
});

describe("bookingSubmissionSchema", () => {
  const schema = bookingSubmissionSchema(NOW);

  it("accepts a complete valid payload and normalises it", () => {
    const result = schema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.patientPhone).toBe("+2348012345678");
      expect(result.data.patientEmail).toBe("ada@example.com");
    }
  });

  it("accepts a minimal payload — no service, no HMO, no DOB, no reason", () => {
    const result = schema.safeParse({
      locationSlug: "victoria-island",
      serviceFamily: "family_healthcare",
      preferredDate: "2026-03-02",
      preferredTimeWindow: "afternoon",
      patientName: "Ada Obi",
      patientPhone: "08012345678",
      patientEmail: "ada@example.com",
      consentNdpr: true,
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ["consentNdpr", { consentNdpr: false }],
    ["patientEmail", { patientEmail: "nope" }],
    ["patientPhone", { patientPhone: "+1 415 555 0100" }],
    ["patientName", { patientName: "" }],
    ["preferredDate", { preferredDate: "2026-01-01" }],
    ["preferredTimeWindow", { preferredTimeWindow: "noon" }],
    ["serviceFamily", { serviceFamily: "cardiology" }],
    ["locationSlug", { locationSlug: "Victoria Island" }],
  ])("rejects a payload with a bad %s", (_field, override) => {
    expect(schema.safeParse({ ...validPayload, ...override }).success).toBe(false);
  });

  it("rejects an HMO plan supplied without an HMO", () => {
    const result = schema.safeParse({ ...omit("hmoSlug"), hmoPlan: "Silver" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "hmoSlug")).toBe(true);
    }
  });

  it("rejects a missing required field outright", () => {
    expect(schema.safeParse(omit("patientEmail")).success).toBe(false);
  });

  it("carries the honeypot fields through without rejecting an empty one", () => {
    const result = schema.safeParse({
      ...validPayload,
      website: "",
      formRenderedAt: 1_770_000_000_000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a filled honeypot at the schema level too", () => {
    expect(
      schema.safeParse({ ...validPayload, website: "http://spam.example" })
        .success,
    ).toBe(false);
  });
});
