import { afterEach, describe, expect, it, vi } from "vitest";

import { trackOnClick, type AnalyticsEvent } from "@/lib/analytics/events";
import { track } from "@/lib/analytics/track";

/**
 * The §9 event vocabulary and the safety properties of `track()`.
 *
 * The type-level guarantees (no event outside the seven, no string property)
 * are enforced by `npm run typecheck` and cannot be asserted at runtime — a
 * test that calls `track("made_up")` would not compile. What is testable is the
 * behaviour a booking depends on: `track()` never throws and never blocks,
 * whatever state Umami is in.
 */

/** The seven events of spec §9, in the order the spec lists them. */
const EVENTS: readonly AnalyticsEvent[] = [
  "booking_started",
  "booking_step_completed",
  "booking_submitted",
  "contact_form_submitted",
  "newsletter_signup",
  "hmo_lookup_performed",
  "emergency_line_clicked",
];

function stubUmami(track: (event: string, props?: unknown) => void) {
  vi.stubGlobal("window", { umami: { track } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("track", () => {
  it("does nothing when there is no window", () => {
    // The node test environment has none, which is also every server render.
    expect(() => track("booking_started")).not.toThrow();
  });

  it("does nothing when Umami has not loaded", () => {
    vi.stubGlobal("window", {});
    expect(() => track("booking_started")).not.toThrow();
  });

  it("forwards an event with no properties as a single argument", () => {
    const spy = vi.fn();
    stubUmami(spy);

    track("emergency_line_clicked");

    expect(spy).toHaveBeenCalledExactlyOnceWith("emergency_line_clicked");
  });

  it("forwards the booking step as a property", () => {
    const spy = vi.fn();
    stubUmami(spy);

    track("booking_step_completed", { step: 4 });

    expect(spy).toHaveBeenCalledExactlyOnceWith("booking_step_completed", {
      step: 4,
    });
  });

  it("swallows a throwing tracker rather than failing the submission", () => {
    stubUmami(() => {
      throw new Error("blocked by extension");
    });

    expect(() => track("booking_submitted")).not.toThrow();
  });
});

describe("trackOnClick", () => {
  it("emits the attribute Umami reads off a clicked element", () => {
    expect(trackOnClick("emergency_line_clicked")).toEqual({
      "data-umami-event": "emergency_line_clicked",
    });
  });

  it("covers every property-less event in the §9 list", () => {
    for (const event of EVENTS) {
      if (event === "booking_step_completed") continue;
      expect(
        trackOnClick(event as Exclude<AnalyticsEvent, "booking_step_completed">),
      ).toEqual({ "data-umami-event": event });
    }
  });
});
