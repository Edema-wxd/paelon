/**
 * The one stated turnaround, in one place (CLAUDE.md "Conversion & trust
 * baseline" item 4).
 *
 * Every form's submit button, every thank-you page and every confirmation
 * email reads these constants. Re-wording the promise per surface is how a
 * hospital ends up with three different answers to "when will you call me",
 * so the copy is centralised rather than repeated.
 *
 * TODO(seed): "4 business hours" is transcribed from master spec §7, not from
 * a commitment Francis has confirmed the front desk can keep. It is still on
 * the "Blocked on Francis" list. Confirm the number — and whether it differs
 * for bookings and general enquiries — before launch.
 */

/** Mid-sentence form: "…we will call you within 4 business hours". */
export const RESPONSE_TIME = "4 business hours";

/** Sentence-final form used beside submit buttons and on thank-you pages. */
export const RESPONSE_TIME_PROMISE =
  "We will contact you within 4 business hours during clinic hours.";
