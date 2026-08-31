import type { NextRequest } from "next/server";

import {
  fail,
  internalError,
  ok,
  rateLimited,
  readJson,
} from "@/lib/api/response";
import { unsubscribe } from "@/lib/newsletter/subscribe";
import { RATE_LIMITS, checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { newsletterTokenSchema } from "@/lib/validation/newsletter";

export const runtime = "nodejs";

/**
 * Unsubscribe.
 *
 * Also POST-from-a-page rather than GET-confirms, for the same prefetch reason
 * as confirmation — though the asymmetry matters: an accidental unsubscribe is
 * far less harmful than an accidental subscribe, so the page should make
 * unsubscribing a single obvious click and never obstruct it.
 *
 * Always reports success. An unrecognised token means the person is not on the
 * list, which is the outcome they wanted; saying so would leak which tokens
 * are live.
 */
export async function POST(request: NextRequest) {
  const payload = await readJson(request);

  if (payload === null) {
    return fail("BAD_REQUEST", "Request body must be valid JSON.");
  }

  const parsed = newsletterTokenSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("VALIDATION_FAILED", "This unsubscribe link is not valid.");
  }

  const limit = await checkRateLimit(
    RATE_LIMITS.newsletterToken,
    clientIpFrom(request.headers),
  );

  if (!limit.allowed) {
    return rateLimited(limit.retryAfterSeconds);
  }

  try {
    await unsubscribe(parsed.data.token);
    return ok({ unsubscribed: true });
  } catch (error) {
    return internalError("newsletter.unsubscribe_failed", error);
  }
}
