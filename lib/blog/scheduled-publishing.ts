import { createHash, timingSafeEqual } from "node:crypto";

import { todayInLagos } from "@/lib/validation/primitives";

/**
 * The decisions behind `/api/jobs/publish-scheduled`, kept free of the
 * database so they can be tested: which posts are due, and whether a caller
 * holds the job secret.
 */

/** Shorter secrets are treated as unset: a guessable one is worse than none. */
export const MIN_JOB_SECRET_LENGTH = 16;

/**
 * The calendar date a stored publication date falls on, in Lagos.
 *
 * `published_at` holds the chosen day at midnight UTC (`toTimestamp`), which
 * is 01:00 the same day in Lagos, so this returns the day the editor picked.
 */
export function lagosDateOf(instant: Date): string {
  return todayInLagos(instant);
}

/**
 * The scheduled posts due to go live today, oldest date first.
 *
 * Today *or earlier* (Francis, 2026-11-02): a run missed through an outage
 * publishes the post at the next run instead of leaving it stranded. Only
 * posts explicitly marked scheduled ever reach this, so a draft that merely
 * carries an old date is never published by it.
 */
export function duePosts<T extends { publishedAt: Date | null }>(
  rows: readonly T[],
  today: string,
): (T & { publishedAt: Date })[] {
  return rows
    .filter((row): row is T & { publishedAt: Date } => row.publishedAt !== null)
    .filter((row) => lagosDateOf(row.publishedAt) <= today)
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
}

/** The token from an `Authorization: Bearer <token>` header, if there is one. */
export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(\S+)\s*$/i);
  return match?.[1] ?? null;
}

/** The configured secrets long enough to accept. */
export function usableSecrets(...candidates: (string | undefined)[]): string[] {
  return candidates.filter(
    (secret): secret is string =>
      typeof secret === "string" && secret.length >= MIN_JOB_SECRET_LENGTH,
  );
}

/**
 * Whether `given` matches one of `secrets`, compared in constant time so the
 * response time does not leak how much of a guess was right. Both sides are
 * hashed first, which gives `timingSafeEqual` the equal lengths it requires
 * without leaking the secret's length either.
 */
export function secretMatches(given: string | null, secrets: readonly string[]): boolean {
  if (given === null) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const candidate = digest(given);
  return secrets
    .map((secret) => timingSafeEqual(candidate, digest(secret)))
    .some(Boolean);
}
