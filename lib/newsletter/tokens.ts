import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Newsletter confirm/unsubscribe tokens.
 *
 * Tokens are stored **hashed**, never in the clear: a database leak must not
 * hand an attacker working confirmation and unsubscribe links for every
 * subscriber. Lookup is by hash, so comparison is constant-time with respect to
 * the raw token by construction.
 */

/** 32 bytes ≈ 256 bits, base64url-encoded to 43 characters. */
const TOKEN_BYTES = 32;

/** Confirmation links expire; unsubscribe links do not. */
export const CONFIRM_TOKEN_TTL_HOURS = 48;

/** A fresh, URL-safe token. */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** SHA-256 of a token, hex-encoded. This is what goes in the database. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time comparison of two hex digests.
 *
 * Lookups go by hash so this is rarely needed, but where two digests are
 * compared directly it must not short-circuit on the first differing byte.
 */
export function digestsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Expiry timestamp for a freshly issued confirmation token. */
export function confirmExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + CONFIRM_TOKEN_TTL_HOURS * 3600 * 1000);
}
