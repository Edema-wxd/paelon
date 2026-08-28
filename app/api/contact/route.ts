import type { NextRequest } from "next/server";

import {
  fail,
  internalError,
  ok,
  rateLimited,
  readJson,
} from "@/lib/api/response";
import { resolveLocationForBooking } from "@/lib/db/queries/locations";
import { createContactSubmission } from "@/lib/db/queries/submissions";
import { sendEmail } from "@/lib/email/send";
import { contactReceiptEmail } from "@/lib/email/templates/forms";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { RATE_LIMITS, checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { isLikelySpam } from "@/lib/spam";
import { contactSchema } from "@/lib/validation/contact";

export const runtime = "nodejs";

/** Contact form submission. */
export async function POST(request: NextRequest) {
  const payload = await readJson(request);

  if (payload === null) {
    return fail("BAD_REQUEST", "Request body must be valid JSON.");
  }

  const parsed = contactSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("VALIDATION_FAILED", "Please check the details you entered.", {
      fields: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    });
  }

  if (isLikelySpam(parsed.data, { form: "contact" })) {
    return ok({ received: true });
  }

  const limit = await checkRateLimit(
    RATE_LIMITS.contact,
    clientIpFrom(request.headers),
  );

  if (!limit.allowed) {
    return rateLimited(limit.retryAfterSeconds);
  }

  const input = parsed.data;

  try {
    const location = input.locationSlug
      ? await resolveLocationForBooking(input.locationSlug)
      : null;

    const submission = await createContactSubmission({
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      subject: input.subject,
      message: input.message,
      locationId: location?.id ?? null,
      consentNdpr: input.consentNdpr,
      consentTextVersion: serverEnv().CONSENT_TEXT_VERSION,
    });

    logger.info("contact.received", {
      submissionId: submission.id,
      locationSlug: location?.slug ?? null,
    });

    // Best-effort, exactly like booking destinations: the row is the source of
    // truth, so a failed acknowledgement must not fail the submission.
    void sendEmail(
      contactReceiptEmail({
        name: input.name,
        email: input.email,
        subject: input.subject,
      }),
      { template: "contact-receipt" },
    ).catch((error: unknown) => {
      logger.warn("contact.receipt_failed", { error });
    });

    return ok({ received: true });
  } catch (error) {
    return internalError("contact.submit_failed", error);
  }
}
