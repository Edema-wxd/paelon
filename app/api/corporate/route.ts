import type { NextRequest } from "next/server";

import {
  fail,
  internalError,
  ok,
  rateLimited,
  readJson,
} from "@/lib/api/response";
import { createCorporateEnquiry } from "@/lib/db/queries/submissions";
import { sendEmail } from "@/lib/email/send";
import { corporateNotificationEmail } from "@/lib/email/templates/forms";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { RATE_LIMITS, checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { isLikelySpam } from "@/lib/spam";
import { corporateSchema } from "@/lib/validation/corporate";

export const runtime = "nodejs";

const SIZE_LABELS: Record<string, string> = {
  "1_50": "1–50 employees",
  "51_200": "51–200 employees",
  "201_500": "201–500 employees",
  "501_1000": "501–1,000 employees",
  "1000_plus": "1,000+ employees",
};

/** Corporate healthcare enquiry. */
export async function POST(request: NextRequest) {
  const payload = await readJson(request);

  if (payload === null) {
    return fail("BAD_REQUEST", "Request body must be valid JSON.");
  }

  const parsed = corporateSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("VALIDATION_FAILED", "Please check the details you entered.", {
      fields: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    });
  }

  if (isLikelySpam(parsed.data, { form: "corporate" })) {
    return ok({ received: true });
  }

  const limit = await checkRateLimit(
    RATE_LIMITS.corporate,
    clientIpFrom(request.headers),
  );

  if (!limit.allowed) {
    return rateLimited(limit.retryAfterSeconds);
  }

  const input = parsed.data;

  try {
    const enquiry = await createCorporateEnquiry({
      companyName: input.companyName,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      companySize: input.companySize,
      sector: input.sector,
      currentProvider: input.currentProvider ?? null,
      requirements: input.requirements,
      consentNdpr: input.consentNdpr,
      consentTextVersion: serverEnv().CONSENT_TEXT_VERSION,
    });

    logger.info("corporate.received", {
      enquiryId: enquiry.id,
      companySize: input.companySize,
    });

    // TODO(francis): no corporate enquiries inbox has been supplied. Falls back
    // to the VI branch inbox so enquiries are not silently dropped; replace with
    // the real address (master spec §18 open item).
    const inbox = serverEnv().BRANCH_VI_EMAIL;

    if (inbox) {
      void sendEmail(
        corporateNotificationEmail(
          {
            companyName: input.companyName,
            contactName: input.contactName,
            contactEmail: input.contactEmail,
            contactPhone: input.contactPhone,
            companySizeLabel:
              SIZE_LABELS[input.companySize] ?? input.companySize,
            sector: input.sector,
            currentProvider: input.currentProvider ?? null,
            requirements: input.requirements,
          },
          inbox,
        ),
        { template: "corporate-notification" },
      ).catch((error: unknown) => {
        logger.warn("corporate.notification_failed", { error });
      });
    } else {
      logger.warn("corporate.no_inbox_configured", { enquiryId: enquiry.id });
    }

    return ok({ received: true });
  } catch (error) {
    return internalError("corporate.submit_failed", error);
  }
}
