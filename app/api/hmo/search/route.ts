import type { NextRequest } from "next/server";

import { internalError, ok, rateLimited } from "@/lib/api/response";
import { HMO_SEARCH_LIMIT, searchHmos } from "@/lib/db/queries/hmos";
import { RATE_LIMITS, checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Longest query worth running — beyond this it is not a typeahead. */
const MAX_QUERY_LENGTH = 60;

/**
 * HMO typeahead (master spec §6 `/hmo-check`).
 *
 * Public read. Returns only the fields the typeahead renders — never internal
 * notes, ids, or timestamps — and caps results so a broad query cannot be used
 * to enumerate the table in one request.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("q") ?? "";
  const query = raw.trim().slice(0, MAX_QUERY_LENGTH);

  // An empty query is a normal state for a typeahead that has just mounted, so
  // it returns an empty list rather than an error — and costs no DB round trip.
  if (query.length === 0) {
    return ok({ results: [] });
  }

  const limit = await checkRateLimit(
    RATE_LIMITS.hmoSearch,
    clientIpFrom(request.headers),
  );

  if (!limit.allowed) {
    return rateLimited(limit.retryAfterSeconds);
  }

  try {
    const results = await searchHmos(query, HMO_SEARCH_LIMIT);

    return ok(
      { results },
      {
        headers: {
          // HMO coverage changes rarely. Caching at the edge keeps the
          // typeahead responsive without hammering Postgres per keystroke.
          "Cache-Control": "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    return internalError("hmo.search_failed", error);
  }
}
