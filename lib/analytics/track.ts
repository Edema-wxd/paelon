"use client";

import type {
  AnalyticsEvent,
  AnalyticsEventProps,
  AnalyticsValue,
} from "@/lib/analytics/events";

/**
 * Client-side event tracking (master spec §9).
 *
 * The vocabulary lives in `./events.ts`; this file is only the call into
 * Umami's global. Kept deliberately small — every byte here is in the initial
 * bundle of any page with a form on it.
 */

interface UmamiApi {
  track: (event: string, props?: Record<string, AnalyticsValue>) => void;
}

declare global {
  interface Window {
    /** Injected by Umami's tracker script. Absent until it has loaded. */
    umami?: UmamiApi;
  }
}

/**
 * `track("booking_started")` with no second argument; `track(
 * "booking_step_completed", { step: 3 })` with one. The tuple type makes the
 * wrong shape a type error rather than a silently ignored property.
 */
type TrackArgs<E extends AnalyticsEvent> = AnalyticsEventProps[E] extends undefined
  ? [event: E]
  : [event: E, props: AnalyticsEventProps[E]];

/**
 * Record one §9 event.
 *
 * Silent and safe when Umami is not there, which is the normal state in
 * development, in tests and in any environment where
 * `NEXT_PUBLIC_UMAMI_SCRIPT_URL` is unset — the script component renders
 * nothing, so `window.umami` is undefined. It is also the state during the
 * moments before an `afterInteractive` script has loaded, and when an ad
 * blocker has eaten it.
 *
 * Nothing here may throw. Every call site is inside a booking or enquiry
 * submission, and a hospital booking must not fail because a stats call did.
 * That is also why there is no logging on the failure path: analytics going
 * quiet is not something a patient can act on, and `console.log` is banned in
 * shipped code (CLAUDE.md).
 */
export function track<E extends AnalyticsEvent>(...args: TrackArgs<E>): void {
  if (typeof window === "undefined") return;

  const api = window.umami;
  if (!api) return;

  const [event, props] = args as [E, AnalyticsEventProps[E] | undefined];

  try {
    if (props === undefined) {
      api.track(event);
    } else {
      api.track(event, props);
    }
  } catch {
    // Analytics is best-effort. A broken stats call never surfaces to a patient.
  }
}
