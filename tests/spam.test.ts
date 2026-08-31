import { describe, expect, it, vi } from "vitest";

import { MIN_SUBMIT_SECONDS, isLikelySpam } from "@/lib/spam";

/** Silence the logger's stdout writes; these tests assert on the return value. */
function quiet() {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
}

describe("isLikelySpam", () => {
  const NOW = 1_770_000_000_000;
  const form = { form: "booking" };

  it("passes a normal submission", () => {
    expect(
      isLikelySpam({ website: "", formRenderedAt: NOW - 30_000 }, form, NOW),
    ).toBe(false);
  });

  it("passes a submission with no signals at all", () => {
    expect(isLikelySpam({}, form, NOW)).toBe(false);
  });

  it("catches a filled honeypot", () => {
    quiet();
    expect(isLikelySpam({ website: "http://spam.example" }, form, NOW)).toBe(true);
  });

  it("treats a whitespace-only honeypot as empty", () => {
    expect(isLikelySpam({ website: "   " }, form, NOW)).toBe(false);
  });

  it("catches a submission faster than a human could read the form", () => {
    quiet();
    expect(isLikelySpam({ formRenderedAt: NOW - 500 }, form, NOW)).toBe(true);
  });

  it(`allows a submission at exactly ${MIN_SUBMIT_SECONDS}s`, () => {
    expect(
      isLikelySpam({ formRenderedAt: NOW - MIN_SUBMIT_SECONDS * 1000 }, form, NOW),
    ).toBe(false);
  });

  it("ignores a stamp from the future rather than treating it as spam", () => {
    // A forged or clock-skewed stamp should not block a real person.
    expect(isLikelySpam({ formRenderedAt: NOW + 60_000 }, form, NOW)).toBe(false);
  });

  it("ignores a stamp from a tab left open overnight", () => {
    expect(
      isLikelySpam({ formRenderedAt: NOW - 36 * 3600 * 1000 }, form, NOW),
    ).toBe(false);
  });
});
