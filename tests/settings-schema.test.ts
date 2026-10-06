import { describe, expect, it } from "vitest";

import {
  RESPONSE_TIME_MAX_HOURS,
  siteSettingsSchema,
} from "@/lib/validation/settings";
import {
  DEFAULT_RESPONSE_TIME_HOURS,
  responseTime,
  responseTimeIsConfirmed,
  responseTimePromise,
} from "@/lib/response-time";

/**
 * `/admin/settings` boundary (decision C2 option B).
 *
 * The interesting cases are all about the difference between "cleared" and
 * "invalid". An empty field is how an operator says a value is not confirmed
 * yet, and the site is specified to fall back to its documented placeholder in
 * that state — so a schema that rejected "" would make the unconfirmed state
 * unreachable through the only UI that can set it.
 */

/** The form sends strings for every field, so the tests do too. */
function parse(responseTimeHours: string, whatsappNumber: string) {
  return siteSettingsSchema.safeParse({ responseTimeHours, whatsappNumber });
}

describe("siteSettingsSchema — accepts", () => {
  it("a whole number of hours and a national-form phone number", () => {
    const result = parse("4", "0801 234 5678");

    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({
      responseTimeHours: 4,
      whatsappNumber: "+2348012345678",
    });
  });

  it("both fields empty, as 'not confirmed yet'", () => {
    const result = parse("", "");

    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({
      responseTimeHours: null,
      whatsappNumber: null,
    });
  });

  it("one field set and the other cleared", () => {
    const result = parse("6", "");

    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({
      responseTimeHours: 6,
      whatsappNumber: null,
    });
  });

  it("whitespace as empty rather than as a value", () => {
    const result = parse("   ", "  ");

    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({
      responseTimeHours: null,
      whatsappNumber: null,
    });
  });

  it("the boundary hours, 1 and the maximum", () => {
    expect(parse("1", "").success).toBe(true);
    expect(parse(String(RESPONSE_TIME_MAX_HOURS), "").success).toBe(true);
  });

  it("E.164 and country-code phone forms, normalising all of them alike", () => {
    for (const input of ["+2348012345678", "2348012345678", "08012345678"]) {
      const result = parse("4", input);
      expect(result.success && result.data.whatsappNumber).toBe("+2348012345678");
    }
  });
});

describe("siteSettingsSchema — rejects", () => {
  /** The field name a failure is reported against, for the form to render. */
  function fieldsOf(result: ReturnType<typeof parse>): string[] {
    if (result.success) return [];
    return result.error.issues.map((issue) => String(issue.path[0]));
  }

  it("zero hours, which the database CHECK also refuses", () => {
    const result = parse("0", "");
    expect(result.success).toBe(false);
    expect(fieldsOf(result)).toContain("responseTimeHours");
  });

  it("a negative number", () => {
    expect(parse("-4", "").success).toBe(false);
  });

  it("a fractional number, rather than silently truncating it", () => {
    expect(parse("4.5", "").success).toBe(false);
  });

  it("hours above the typo guard", () => {
    expect(parse(String(RESPONSE_TIME_MAX_HOURS + 1), "").success).toBe(false);
    expect(parse("400", "").success).toBe(false);
  });

  it("text in the hours field", () => {
    expect(parse("four", "").success).toBe(false);
    expect(parse("4 hours", "").success).toBe(false);
  });

  it("a phone number that is not a valid Nigerian one", () => {
    const result = parse("4", "12345");
    expect(result.success).toBe(false);
    expect(fieldsOf(result)).toContain("whatsappNumber");
  });

  it("a missing field, rather than treating it as cleared", () => {
    // An absent key is a broken form, not an operator clearing a value. The
    // difference matters: treating it as a clear would let a partial submission
    // silently wipe a confirmed setting.
    expect(siteSettingsSchema.safeParse({ responseTimeHours: "4" }).success).toBe(
      false,
    );
  });
});

describe("response-time wording", () => {
  it("falls back to the documented placeholder when nothing is confirmed", () => {
    expect(responseTime(null)).toBe(`${DEFAULT_RESPONSE_TIME_HOURS} business hours`);
    expect(responseTimeIsConfirmed(null)).toBe(false);
  });

  it("uses the confirmed number once it is set", () => {
    expect(responseTime(6)).toBe("6 business hours");
    expect(responseTimeIsConfirmed(6)).toBe(true);
  });

  it("singularises one hour", () => {
    expect(responseTime(1)).toBe("1 business hour");
  });

  it("words the promise once, so no surface can disagree with another", () => {
    expect(responseTimePromise(6)).toBe(
      "We will contact you within 6 business hours during clinic hours.",
    );
  });
});
