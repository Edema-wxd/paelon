import type { NextRequest } from "next/server";

import {
  fail,
  internalError,
  ok,
  rateLimited,
  readJson,
} from "@/lib/api/response";
import { submitBooking } from "@/lib/booking/submit";
import { RATE_LIMITS, checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { isLikelySpam } from "@/lib/spam";
import { bookingSubmissionSchema } from "@/lib/validation/booking";

/** Drizzle and the Neon driver need Node, not Edge. */
export const runtime = "nodejs";

/**
 * Booking submission (master spec §7, backend spec §9).
 *
 * Thin by design: parse, validate, rate-limit, call the service, shape the
 * response. All the actual behaviour lives in `lib/booking/submit.ts` so it is
 * testable without a request and portable off Vercel.
 *
 * Order is deliberate — validate before rate-limiting, so a malformed payload
 * does not consume a legitimate user's hourly budget.
 */
export async function POST(request: NextRequest) {
  const payload = await readJson(request);

  if (payload === null) {
    return fail("BAD_REQUEST", "Request body must be valid JSON.");
  }

  const parsed = bookingSubmissionSchema().safeParse(payload);

  if (!parsed.success) {
    return fail("VALIDATION_FAILED", "Please check the details you entered.", {
      fields: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    });
  }

  // A bot gets the same success shape a person would, minus a real reference —
  // telling it that it was caught only teaches it what to change next time.
  if (isLikelySpam(parsed.data, { form: "booking" })) {
    return ok({ reference: null, redirectUrl: "/book/confirmed" });
  }

  const limit = await checkRateLimit(
    RATE_LIMITS.booking,
    clientIpFrom(request.headers),
  );

  if (!limit.allowed) {
    return rateLimited(limit.retryAfterSeconds);
  }

  try {
    const result = await submitBooking(parsed.data);

    if (!result.ok) {
      // The slug came from our own pages, so an unresolvable one means a stale
      // link or a tampered payload rather than user error.
      return fail(
        "VALIDATION_FAILED",
        "Some of your selections are no longer available. Please start again.",
        { fields: { [fieldForReason(result.reason)]: ["No longer available."] } },
      );
    }

    return ok({ reference: result.reference, redirectUrl: result.redirectUrl });
  } catch (error) {
    return internalError("booking.submit_failed", error);
  }
}

function fieldForReason(
  reason: "unknown_location" | "unknown_service" | "unknown_hmo",
): string {
  switch (reason) {
    case "unknown_location":
      return "locationSlug";
    case "unknown_service":
      return "serviceSlug";
    case "unknown_hmo":
      return "hmoSlug";
  }
}
