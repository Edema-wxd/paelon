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
 * anything a patient typed — so the audit log does not become a second store
 * of personal data with its own NDPR retention problem.
 *
 * ## The one exception: a testimonial's quote (D4, 2026-10-23)
 *
 * `auditDiff` on `testimonials` writes the before and after of `quote`
 * verbatim. Francis ruled that a consent dispute is answered by reading the
 * patient's words and what they were changed to, which a digest cannot do —
 * it can only confirm a sentence somebody already holds.
 *
 * So for those rows the log *does* hold personal data, deliberately, and that
 * has consequences this module cannot enforce on its own:
 *
 *  - those entries fall under the same retention rule as the testimonial row
 *    they describe (§14, E5), not a longer one;
 *  - a DSAR for a patient with a testimonial has to search `audit_log`
 *    metadata as well as `testimonials`;
 *  - `stripPii` does not list `quote`, and must not start to — that would
 *    silently drop the evidence this exception exists to keep.
 *
 * Nothing else may follow it. A new column records its value only when the
 * question the log has to answer cannot be answered without it.
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
