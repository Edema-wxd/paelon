import type { NextRequest } from "next/server";

import { fail, internalError, ok } from "@/lib/api/response";
import { publishScheduledPosts } from "@/lib/blog/publish-scheduled";
import { bearerToken, secretMatches, usableSecrets } from "@/lib/blog/scheduled-publishing";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Publish the scheduled blog posts that are due (spec §14, job endpoints).
 *
 * Called at 08:00 WAT (07:00 UTC) by Vercel Cron — `vercel.json` — and by
 * system cron once self-hosted:
 *
 *   curl -fsS -X POST -H "Authorization: Bearer $JOBS_SECRET" \
 *     https://<host>/api/jobs/publish-scheduled
 *
 * GET as well as POST because Vercel Cron only sends GET. Either way it fails
 * closed: no usable secret configured is a 503, a missing or wrong token a
 * 401, and nothing is read before the token is checked. Idempotent, so a
 * retried or doubled call is harmless — see `publishScheduledPosts`.
 */
async function handle(request: NextRequest) {
  const env = serverEnv();
  const secrets = usableSecrets(env.JOBS_SECRET, env.CRON_SECRET);
  if (secrets.length === 0) {
    logger.error("job.publish_scheduled.unconfigured", {});
    return fail("UNAVAILABLE", "Scheduled jobs are not configured on this deployment.");
  }

  if (!secretMatches(bearerToken(request.headers.get("authorization")), secrets)) {
    return fail("UNAUTHORIZED", "Not authorised.");
  }

  try {
    const result = await publishScheduledPosts();
    logger.info("job.publish_scheduled.complete", {
      today: result.today,
      published: result.published.length,
      held: result.held.length,
    });
    return ok(result);
  } catch (error) {
    return internalError("job.publish_scheduled.failed", error);
  }
}

export const GET = handle;
export const POST = handle;
