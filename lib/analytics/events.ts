/**
 * The analytics event vocabulary (master spec §9).
 *
 * §9 lists seven custom events and one property between them. This module is
 * the closed registry of both, and the type system is the enforcement: there is
 * no `track("whatever")` escape hatch, and no way to attach a name, an email
 * address, a phone number or free text to an event.
 *
 * That last part is the reason the registry is typed rather than documented.
 * §9's "Do NOT track PII" is not a guideline we can keep by remembering it at
 * each call site — a booking form has the patient's name in a variable one line
 * above the `track()` call. So the only property values the map admits are
 * numbers and booleans drawn from literal unions, `NoFreeTextInProps` asserts
 * that at compile time, and a future event that wants `{ patientEmail: string }`
 * fails `npm run typecheck` instead of shipping.
 *
 * Importable from server components: this file holds types and one pure
 * attribute helper, and never touches `window`. `track()` lives in
 * `./track.ts`, which is client-only.
 */

/** The seven events of §9. Adding an eighth is a spec change, not a code change. */
export type AnalyticsEvent =
  | "booking_started"
  | "booking_step_completed"
  | "booking_submitted"
  | "contact_form_submitted"
  | "newsletter_signup"
  | "hmo_lookup_performed"
  | "emergency_line_clicked";

/**
 * The six booking steps of §7, 1-indexed as a person would count them — the
 * wizard's own `step` state is 0-indexed and is converted at the call site.
 */
export type BookingStep = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Properties per event. `undefined` means the event carries none, and `track()`
 * then refuses a second argument entirely.
 */
export interface AnalyticsEventProps {
  booking_started: undefined;
  booking_step_completed: { step: BookingStep };
  booking_submitted: undefined;
  contact_form_submitted: undefined;
  newsletter_signup: undefined;
  hmo_lookup_performed: undefined;
  emergency_line_clicked: undefined;
}

/**
 * The only property values that may leave the browser. Strings are excluded
 * deliberately — a string is where a patient's name ends up.
 */
export type AnalyticsValue = number | boolean;

type IsSafe<T> = T extends undefined
  ? true
  : T extends Record<string, AnalyticsValue>
    ? true
    : false;

type Assert<T extends true> = T;

/**
 * Compile-time guard for the rule above. If a property is ever typed as a
 * string — or as anything but a literal number or boolean — this alias stops
 * resolving to `true` and the build fails here, at the registry, rather than
 * leaking PII into the analytics stream.
 *
 * Exported only so it is not an unused local. It has no runtime existence.
 */
export type NoFreeTextInProps = Assert<
  IsSafe<AnalyticsEventProps[AnalyticsEvent]>
>;

/**
 * Declarative tracking for a server-rendered element.
 *
 * Umami's script reads `data-umami-event` off a clicked element, so a link can
 * be tracked without the component becoming a client component. That matters
 * for the emergency line: it sits in the header, the footer and the sticky
 * mobile bar, all server components, and converting three of those to client
 * components to attach an `onClick` would put them in the initial bundle for
 * the sake of one event (§13's JS budget).
 *
 * Only used for events with no properties — Umami's `data-umami-event-*`
 * property attributes are stringly typed, which is exactly what this module
 * exists to prevent.
 */
export function trackOnClick<E extends AnalyticsEvent>(
  event: AnalyticsEventProps[E] extends undefined ? E : never,
): { "data-umami-event": E } {
  return { "data-umami-event": event as E };
}
