import { createHash } from "node:crypto";

import { and, eq, gt, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
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
  /** Failed admin sign-ins, per IP (spec §14 Auth). Checked in `authorize()`. */
  login: { name: "login", limit: 5, windowSeconds: 900 },
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

/** Attempts to place one hit before giving up. See `recordHit()`. */
const HIT_INSERT_ATTEMPTS = 5;

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
    await recordHit(key);

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
 * Insert one hit, working around the `(key, hit_at)` primary key.
 *
 * Two concurrent hits on the same key can land on the same microsecond, and the
 * collision would otherwise surface as a database error — which `checkRateLimit`
 * fails open on, letting a parallel burst through the limit it exists to hold.
 * Each retry nudges the timestamp forward by a microsecond, which is far below
 * any window this table measures.
 */
async function recordHit(key: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await db()
        .insert(rateLimitHits)
        .values({
          key,
          hitAt: sql`clock_timestamp() + make_interval(secs => ${attempt * 0.000001})`,
        });
      return;
    } catch (error) {
      if (attempt >= HIT_INSERT_ATTEMPTS - 1 || !isUniqueViolation(error)) throw error;
    }
  }
}

/** A recorded attempt that can be handed back. See `reserveRateLimitSlot()`. */
export interface RateLimitReservation extends RateLimitResult {
  /**
   * Give the attempt back, so it does not count against the budget. Safe to
   * call on a refused reservation, where it does nothing.
   */
  release(): Promise<void>;
}

/**
 * Record an attempt, then report whether it was within budget.
 *
 * For limits that count failures rather than requests: reserve before doing
 * the work, and `release()` when the work turns out to have succeeded. The
 * login limit works this way, so staff sharing one public IP are not locked
 * out by each other's successful sign-ins.
 *
 * Recording first and releasing after — rather than checking first and
 * recording on the failure path — is what makes a burst safe. Twenty parallel
 * guesses that each read the counter before any of them writes would all see
 * room; here the twenty writes are what they read.
 *
 * `release()` deletes the exact row this reservation inserted, by `ctid`
 * because the table has no surrogate key, and fails soft: an un-released hit
 * costs one attempt, which beats a successful sign-in ending in an error.
 */
export async function reserveRateLimitSlot(
  rule: RateLimitRule,
  identifier: string,
): Promise<RateLimitReservation> {
  const result = await checkRateLimit(rule, identifier);
  const key = `${rule.name}:${hashIdentifier(identifier)}`;

  return {
    ...result,
    release: async () => {
      // A refused reservation has nothing to give back: releasing then would
      // refund a hit the limit had already counted against someone else.
      if (!result.allowed) return;
      try {
        await db().execute(sql`
          DELETE FROM rate_limit_hits
          WHERE ctid IN (
            SELECT ctid FROM rate_limit_hits
            WHERE key = ${key}
            ORDER BY hit_at DESC
            LIMIT 1
          )
        `);
      } catch (error) {
        logger.warn("rate_limit.release_failed", { rule: rule.name, error });
      }
    },
  };
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
