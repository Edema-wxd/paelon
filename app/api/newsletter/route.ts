import type { NextRequest } from "next/server";

import {
  fail,
  internalError,
  ok,
  rateLimited,
  readJson,
} from "@/lib/api/response";
import { subscribeToNewsletter } from "@/lib/newsletter/subscribe";
import { RATE_LIMITS, checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { isLikelySpam } from "@/lib/spam";
import { newsletterSchema } from "@/lib/validation/newsletter";

export const runtime = "nodejs";

/**
 * Newsletter signup, starting double opt-in.
 *
 * Every non-validation path returns the **same** body and status. A different
 * response for an address already on the list would make this endpoint a
 * subscriber-list oracle: anyone could test whether a given person subscribes
 * to a hospital's mailing list. Even the internal-error path is deliberately
 * indistinguishable in shape.
 */
export async function POST(request: NextRequest) {
  const payload = await readJson(request);

  if (payload === null) {
    return fail("BAD_REQUEST", "Request body must be valid JSON.");
  }

  const parsed = newsletterSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("VALIDATION_FAILED", "Please check the details you entered.", {
      fields: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    });
  }

  if (isLikelySpam(parsed.data, { form: "newsletter" })) {
    return accepted();
  }

  const limit = await checkRateLimit(
    RATE_LIMITS.newsletter,
    clientIpFrom(request.headers),
  );

  if (!limit.allowed) {
    return rateLimited(limit.retryAfterSeconds);
  }

  try {
    await subscribeToNewsletter(parsed.data);
    return accepted();
  } catch (error) {
    return internalError("newsletter.subscribe_failed", error);
  }
}

/**
 * The one success response. Worded so it is truthful for a new address, an
 * unconfirmed repeat, and an already-confirmed subscriber alike.
 */
function accepted() {
  return ok({
    message:
      "Thank you. If this address is not already subscribed, we have sent a confirmation email — please click the link in it to finish signing up.",
  });
}
