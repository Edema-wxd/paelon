/**
 * The one stated turnaround, worded in one place (CLAUDE.md "Conversion &
 * trust baseline" item 4).
 *
 * Every form's submit button, every thank-you page and every confirmation
 * email renders these. Re-wording the promise per surface is how a hospital
 * ends up with three different answers to "when will you call me", so the copy
 * is centralised rather than repeated.
 *
 * ## Why these are functions now
 *
 * The number comes from `site_settings.response_time_hours` (decision C2
 * option B), so that Paelon can change it without a deploy. The *wording* does
 * not: these helpers take the hours and return the sentence, which keeps the
 * single-source-of-truth guarantee that item 4 actually asks for. Storing the
 * sentence itself would hand an operator four text boxes and four chances to
 * disagree with each other.
 *
 * This module stays pure and database-free on purpose. `components/booking/
 * booking-wizard.tsx` is a client component and renders the promise, so a
 * value import of `lib/content.ts` here would drag the Neon driver toward the
 * browser bundle. Server components read the setting and pass the string down.
 */

/**
 * The turnaround used when `site_settings.response_time_hours` is null.
 *
 * TODO(seed): 4 hours is transcribed from master spec §7, not from a commitment
 * Francis has confirmed the front desk can keep. It is still on the "Blocked on
 * Francis" list. Confirm the number — and whether it differs for bookings and
 * general enquiries — before launch.
 *
 * A constant rather than rendering nothing: baseline item 4 requires a stated
 * turnaround beside every submit button, and a form that promises nothing is a
 * worse failure than one repeating the placeholder the whole site already
 * shows. Setting the real number in `/admin/settings` retires this.
 */
export const DEFAULT_RESPONSE_TIME_HOURS = 4;

/** True when the turnaround came from settings rather than the placeholder. */
export function responseTimeIsConfirmed(hours: number | null): boolean {
  return hours !== null;
}

/**
 * Mid-sentence form: "…we will call you within 4 business hours".
 *
 * Pass `site_settings.response_time_hours`; null falls back to
 * `DEFAULT_RESPONSE_TIME_HOURS`.
 */
export function responseTime(hours: number | null): string {
  const value = hours ?? DEFAULT_RESPONSE_TIME_HOURS;
  return `${value} business ${value === 1 ? "hour" : "hours"}`;
}

/** Sentence-final form used beside submit buttons and on thank-you pages. */
export function responseTimePromise(hours: number | null): string {
  return `We will contact you within ${responseTime(hours)} during clinic hours.`;
}
