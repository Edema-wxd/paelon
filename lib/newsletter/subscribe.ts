import {
  confirmByTokenHash,
  unsubscribeByTokenHash,
  upsertSubscriber,
} from "@/lib/db/queries/newsletter";
import { sendEmail } from "@/lib/email/send";
import { newsletterConfirmEmail } from "@/lib/email/templates/forms";
import { clientEnv, serverEnv } from "@/lib/env";
import { logger, redactEmail } from "@/lib/logger";
import type { NewsletterInput } from "@/lib/validation/newsletter";

import { confirmExpiry, generateToken, hashToken } from "./tokens";

/**
 * Newsletter subscription (backend spec §8).
 *
 * The critical property: **the caller's response must be identical whether or
 * not the address is already subscribed.** Anything else turns this endpoint
 * into an oracle for testing whether a given person is on the hospital's
 * mailing list. That is why this function returns nothing distinguishing — the
 * branch is entirely internal.
 */
export async function subscribeToNewsletter(
  input: NewsletterInput,
): Promise<void> {
  const confirmToken = generateToken();
  const unsubscribeToken = generateToken();

  const { alreadyConfirmed } = await upsertSubscriber({
    email: input.email,
    name: input.name ?? null,
    consentNdpr: input.consentNdpr,
    consentTextVersion: serverEnv().CONSENT_TEXT_VERSION,
    confirmTokenHash: hashToken(confirmToken),
    confirmExpiresAt: confirmExpiry(),
    unsubscribeTokenHash: hashToken(unsubscribeToken),
  });

  if (alreadyConfirmed) {
    // No second confirmation email: re-confirming an active subscriber is both
    // pointless and a way to have the endpoint mail someone repeatedly.
    logger.info("newsletter.already_confirmed", {
      email: redactEmail(input.email),
    });
    return;
  }

  const confirmUrl = new URL(
    `/newsletter/confirm?token=${encodeURIComponent(confirmToken)}`,
    clientEnv.NEXT_PUBLIC_SITE_URL,
  ).toString();

  await sendEmail(
    newsletterConfirmEmail({
      email: input.email,
      name: input.name ?? null,
      confirmUrl,
    }),
    { template: "newsletter-confirm" },
  );

  logger.info("newsletter.confirmation_sent", {
    email: redactEmail(input.email),
  });
}

/** Confirm a subscription from a raw token. */
export async function confirmSubscription(
  token: string,
): Promise<{ confirmed: boolean }> {
  const result = await confirmByTokenHash(hashToken(token));
  logger.info("newsletter.confirm_attempted", { confirmed: result.confirmed });
  return result;
}

/** Unsubscribe from a raw token. Idempotent. */
export async function unsubscribe(token: string): Promise<{ found: boolean }> {
  const result = await unsubscribeByTokenHash(hashToken(token));
  logger.info("newsletter.unsubscribe_attempted", { found: result.found });
  return result;
}
