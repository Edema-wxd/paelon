import { createHash } from "node:crypto";

import { headers } from "next/headers";

import type { Resource } from "@/lib/auth/policy";
import { writeAuditEntry } from "@/lib/db/queries/users";
import { logger } from "@/lib/logger";
import { clientIpFrom, hashIdentifier } from "@/lib/rate-limit";

/**
 * The audit trail for admin mutations (spec §8 Audit log).
 *
 * The row is evidence of *what happened*, not a copy of the data it happened
 * to. Metadata carries ids, enum values and counts — never a name, an email or
 * anything a patient typed — so the audit log never becomes a second store of
 * personal data with its own NDPR retention problem.
 *
 * IP addresses are stored only as the same salted SHA-256 the rate limiter
 * uses (`hashIdentifier`), so one DSAR lookup covers both tables.
 */

/** Flat, primitive values only. A nested object is where PII hides unnoticed. */
export type AuditMetadata = Record<
  string,
  string | number | boolean | null | string[]
>;

/**
 * Keys that name personal data, matched case-insensitively against the key with
 * `_` and `-` removed. Fragments match anywhere, so `patient_email` and
 * `passwordHash` hit; short words that occur inside innocent keys match only
 * the whole key.
 */
const PII_KEY_FRAGMENTS = [
  "email",
  "phone",
  "password",
  "address",
  "birth",
  "reasonforvisit",
  "token",
];
const PII_KEYS = new Set(["ip", "name", "fullname", "firstname", "lastname", "dob", "notes", "message"]);

function isPiiKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[_-]/g, "");
  return (
    PII_KEYS.has(normalised) ||
    PII_KEY_FRAGMENTS.some((fragment) => normalised.includes(fragment))
  );
}

/**
 * Drop metadata keys that look like personal data.
 *
 * A backstop, not the policy — callers are expected not to pass PII at all.
 * When it fires it logs the key names (never the values) so the caller gets
 * fixed rather than silently relied upon.
 */
export function stripPii(metadata: AuditMetadata): AuditMetadata {
  const kept: AuditMetadata = {};
  const stripped: string[] = [];

  for (const [key, value] of Object.entries(metadata)) {
    if (isPiiKey(key)) stripped.push(key);
    else kept[key] = value;
  }

  if (stripped.length > 0) {
    logger.warn("audit.metadata_pii_stripped", { keys: stripped });
  }

  return kept;
}

/**
 * A SHA-256 of a text value, for auditing a change to a field whose *content*
 * must not be copied into the audit log.
 *
 * `testimonials.quote` is the case this exists for: a patient's own words are
 * personal data, so the log records that the wording changed and a digest of
 * each side, rather than two copies of the sentence. Any candidate text can
 * still be hashed and compared against what was recorded, which is what an
 * audit of "did someone edit this quote" needs to answer.
 *
 * Unsalted on purpose, so the same check works from a different process a year
 * later. These are not secrets — a quote's plaintext is destined for a public
 * website — so there is nothing here for a salt to protect.
 */
export function digestOf(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

/** The requesting client's IP, or `null` when no proxy header says. */
export async function requestIp(): Promise<string | null> {
  const ip = clientIpFrom(await headers());
  return ip === "unknown" ? null : ip;
}

/**
 * Write one audit row.
 *
 * Fail-soft through `writeAuditEntry`: a failed audit write is logged at error
 * and never fails the mutation it records, which has already happened.
 */
export async function writeAudit(entry: {
  userId: string | null;
  /** Dotted event name, e.g. "user.role_changed". */
  action: string;
  entityType: Resource;
  entityId?: string | null;
  metadata?: AuditMetadata;
  /** Raw client IP. Hashed here; the raw value goes no further. */
  ip?: string | null;
}): Promise<void> {
  await writeAuditEntry({
    userId: entry.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    metadata: stripPii(entry.metadata ?? {}),
    ipAddress: entry.ip ? hashIdentifier(entry.ip) : null,
  });
}
