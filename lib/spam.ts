import { logger } from "@/lib/logger";

/**
 * Layered bot defence for public forms (backend spec §12).
 *
 * No CAPTCHA in Phase 1: it is an accessibility burden and a performance cost
 * (master spec §12/§13), and these two checks stop the overwhelming majority
 * of automated form spam at zero cost to a real user.
 *
 * A caught submission is *silently discarded* and the caller returns the normal
 * success response. Telling a bot it was detected only teaches it what to
 * change; a human who somehow trips it is not shown a confusing error either.
 */

/** A form completed faster than this was almost certainly not read. */
export const MIN_SUBMIT_SECONDS = 2;

/** Beyond this the stamp is stale or forged; treat it as absent, not as spam. */
const MAX_SUBMIT_SECONDS = 60 * 60 * 24;

export interface SpamSignals {
  /** Honeypot input. A human never sees it, so any value means a bot. */
  website?: string | undefined;
  /** Epoch ms written when the form mounted. */
  formRenderedAt?: number | undefined;
}

/**
 * True when the submission looks automated.
 *
 * `now` is injectable so the timing check is testable without sleeping.
 */
export function isLikelySpam(
  signals: SpamSignals,
  context: { form: string },
  now: number = Date.now(),
): boolean {
  if (signals.website !== undefined && signals.website.trim() !== "") {
    logger.info("spam.honeypot_filled", { form: context.form });
    return true;
  }

  const renderedAt = signals.formRenderedAt;

  if (renderedAt !== undefined) {
    const elapsedSeconds = (now - renderedAt) / 1000;

    // A stamp from the future, or one implausibly old, means a forged or stale
    // field rather than a fast bot. Ignoring it is safer than rejecting a real
    // person whose tab sat open overnight.
    if (elapsedSeconds < 0 || elapsedSeconds > MAX_SUBMIT_SECONDS) {
      return false;
    }

    if (elapsedSeconds < MIN_SUBMIT_SECONDS) {
      logger.info("spam.too_fast", {
        form: context.form,
        elapsedSeconds: Math.round(elapsedSeconds * 100) / 100,
      });
      return true;
    }
  }

  return false;
}
