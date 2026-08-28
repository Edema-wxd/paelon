import { createHash } from "node:crypto";

import { and, eq, gt, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { rateLimitHits } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Postgres-backed fixed-window rate limiting (backend spec §12).
 *
 * Not in-memory: serverless instances share no state, so an in-memory counter
 * limits one lambda rather than one client. Not Vercel KV or Redis either —
 * the first is Vercel-lock (master spec §2) and the second is an unapproved
 * dependency. One extra round trip on a low-volume form endpoint is the right
 * price.
 *
 * IP addresses are personal data under NDPR, so only a salted SHA-256 is
 * stored, never the address, and rows are pruned after 24 hours.
 */

export interface RateLimitRule {
  /** Namespace, e.g. "booking". Keeps separate endpoints on separate budgets. */
  name: string;
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export const RATE_LIMITS = {
  booking: { name: "booking", limit: 5, windowSeconds: 3600 },
  contact: { name: "contact", limit: 5, windowSeconds: 3600 },
  corporate: { name: "corporate", limit: 5, windowSeconds: 3600 },
  newsletter: { name: "newsletter", limit: 5, windowSeconds: 3600 },
  newsletterToken: { name: "newsletter_token", limit: 10, windowSeconds: 3600 },
  hmoSearch: { name: "hmo_search", limit: 30, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  /** Requests remaining in the current window. */
  remaining: number;
  /** Seconds until the window resets. Feeds the `Retry-After` header. */
  retryAfterSeconds: number;
}

/** Rows older than this are pruned. Retention is a compliance limit, not a tidiness one. */
const RETENTION_HOURS = 24;

/** Roughly 1 request in 50 also prunes, so cleanup needs no scheduler. */
const CLEANUP_PROBABILITY = 0.02;

/**
 * Hash a client identifier with the configured salt.
 *
 * Exported for the DSAR runbook and for tests. The salt means a leaked table
 * cannot be reversed into a set of visitor IPs by rainbow table.
 */
export function hashIdentifier(identifier: string): string {
  const salt = serverEnv().RATE_LIMIT_SALT;
  return createHash("sha256").update(`${salt}:${identifier}`).digest("hex");
}

/**
 * Extract the client IP from proxy headers.
 *
 * `x-forwarded-for` is client-settable unless a trusted proxy overwrites it.
 * Behind Vercel it is trustworthy; this assumption must be re-verified after
 * the self-hosting move (backend spec §12), and is why rate limiting is one
 * layer of defence rather than the only one.
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() ?? "unknown";
}

/**
 * Record a hit and report whether the caller is within its budget.
 *
 * Fails **open**: if the database is unreachable, a patient trying to book an
 * appointment is not turned away because the spam defence is down. The failure
 * is logged at warn so it is visible.
 */
export async function checkRateLimit(
  rule: RateLimitRule,
  identifier: string,
): Promise<RateLimitResult> {
  const key = `${rule.name}:${hashIdentifier(identifier)}`;
  const windowStart = sql`now() - make_interval(secs => ${rule.windowSeconds})`;

  try {
    await db().insert(rateLimitHits).values({ key });

    const rows = await db()
      .select({ count: sql<number>`count(*)::int` })
      .from(rateLimitHits)
      .where(and(eq(rateLimitHits.key, key), gt(rateLimitHits.hitAt, windowStart)));

    const used = rows[0]?.count ?? 0;

    void maybeCleanup();

    return {
      allowed: used <= rule.limit,
      remaining: Math.max(0, rule.limit - used),
      retryAfterSeconds: rule.windowSeconds,
    };
  } catch (error) {
    logger.warn("rate_limit.unavailable", { rule: rule.name, error });
    return {
      allowed: true,
      remaining: rule.limit,
      retryAfterSeconds: rule.windowSeconds,
    };
  }
}

/**
 * Opportunistic pruning. Runs on a small fraction of requests rather than on a
 * schedule, so there is no cron dependency and no Vercel-only primitive.
 */
async function maybeCleanup(): Promise<void> {
  if (Math.random() > CLEANUP_PROBABILITY) return;

  try {
    await db()
      .delete(rateLimitHits)
      .where(
        lt(
          rateLimitHits.hitAt,
          sql`now() - make_interval(hours => ${RETENTION_HOURS})`,
        ),
      );
  } catch (error) {
    logger.warn("rate_limit.cleanup_failed", { error });
  }
}
