import type { NextRequest } from "next/server";

import {
  fail,
  internalError,
  ok,
  rateLimited,
  readJson,
} from "@/lib/api/response";
import { confirmSubscription } from "@/lib/newsletter/subscribe";
import { RATE_LIMITS, checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { newsletterTokenSchema } from "@/lib/validation/newsletter";

export const runtime = "nodejs";

/**
 * Confirm a newsletter subscription.
 *
 * **POST, not GET.** The link in the email points at `/newsletter/confirm`, a
 * page that carries the token and asks for an explicit button press, which
 * POSTs here. Confirming directly on GET is a real failure mode: email clients,
 * link scanners, and corporate security proxies prefetch links, which would
 * silently confirm subscriptions nobody clicked — the opposite of what double
 * opt-in is for.
 */
export async function POST(request: NextRequest) {
  const payload = await readJson(request);

  if (payload === null) {
    return fail("BAD_REQUEST", "Request body must be valid JSON.");
  }

  const parsed = newsletterTokenSchema.safeParse(payload);

  if (!parsed.success) {
    return fail("VALIDATION_FAILED", "This confirmation link is not valid.");
  }

  const limit = await checkRateLimit(
    RATE_LIMITS.newsletterToken,
    clientIpFrom(request.headers),
  );

  if (!limit.allowed) {
    return rateLimited(limit.retryAfterSeconds);
  }

  try {
    const { confirmed } = await confirmSubscription(parsed.data.token);

    if (!confirmed) {
      // Expired, already used, or never valid — all indistinguishable to the
      // caller on purpose, so the endpoint cannot be used to probe tokens.
      return fail(
        "NOT_FOUND",
        "This confirmation link has expired or has already been used. Please sign up again.",
      );
    }

    return ok({ confirmed: true });
  } catch (error) {
    return internalError("newsletter.confirm_failed", error);
  }
}
