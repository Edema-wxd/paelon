import { serverEnv } from "@/lib/env";
import { logger, redactEmail } from "@/lib/logger";

/**
 * Single entry point for outbound email (backend spec §10).
 *
 * Everything that sends mail goes through here so the feature flag, the
 * redaction rules, and the timeout live in exactly one place.
 */

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  /** Plain-text alternative. Required, not optional — see the note in templates/. */
  text: string;
  replyTo?: string;
}

export interface SendResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
}

/** A hung provider must not hold a booking request open. */
const SEND_TIMEOUT_MS = 5000;

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Send one message.
 *
 * With `RESEND_ENABLED=false` this logs and returns `success: true`. That is
 * deliberate: master spec §10 requires the site to work end-to-end with Resend
 * off, and a *disabled* provider is not a failure. Only a configured provider
 * that errors is.
 */
export async function sendEmail(
  message: EmailMessage,
  context: { template: string },
): Promise<SendResult> {
  const env = serverEnv();
  const recipients = Array.isArray(message.to) ? message.to : [message.to];
  const redacted = recipients.map(redactEmail);

  if (!env.RESEND_ENABLED) {
    logger.info("email.skipped", {
      template: context.template,
      to: redacted,
      reason: "resend_disabled",
    });
    return { success: true, skipped: true };
  }

  // superRefine in lib/env.ts guarantees these when the flag is on.
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    logger.error("email.misconfigured", { template: context.template });
    return { success: false, error: "email_not_configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // The provider's body may echo the recipient address, so it is not logged.
      logger.warn("email.send_failed", {
        template: context.template,
        to: redacted,
        status: response.status,
      });
      return { success: false, error: `provider_status_${response.status}` };
    }

    logger.info("email.sent", { template: context.template, to: redacted });
    return { success: true };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    logger.warn("email.send_failed", {
      template: context.template,
      to: redacted,
      error: aborted ? "timeout" : error,
    });
    return { success: false, error: aborted ? "timeout" : "send_failed" };
  } finally {
    clearTimeout(timeout);
  }
}
