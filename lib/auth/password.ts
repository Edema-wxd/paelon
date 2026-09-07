import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing for admin accounts.
 *
 * argon2id, as `users.password_hash` in lib/db/schema.ts has always said it
 * would be. `@node-rs/argon2` is the Rust binding: it ships prebuilt binaries,
 * so there is no node-gyp step to break a Docker build or a CI runner, which
 * matters because self-hosting is the post-launch target.
 *
 * These are deliberately slow. Never call them anywhere but a login or a
 * password change — an argon2 verify inside a page render would be a trivial
 * denial-of-service against the whole site.
 *
 * The parameters below are OWASP's current argon2id minimum. They are recorded
 * in the hash string itself, so raising them later does not invalidate existing
 * passwords: an old hash still verifies against its own parameters, and
 * `needsRehash` tells the login path when to quietly upgrade one.
 */

/** OWASP argon2id baseline: 19 MiB, 2 passes, 1 lane. */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hash a plaintext password. The salt is generated internally and encoded into
 * the returned string, so nothing else needs storing.
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/**
 * Check a password against a stored hash.
 *
 * Returns `false` rather than throwing on a malformed or truncated hash — a
 * corrupt row should fail the login, not crash the login route and hand the
 * caller a stack trace. argon2 is constant-time for a given hash, so this does
 * not leak how much of the password was right.
 */
export async function verifyPassword(
  hashed: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(hashed, password, OPTIONS);
  } catch {
    return false;
  }
}

/**
 * True when `hashed` was produced with weaker parameters than the current
 * baseline and should be replaced on next successful login.
 *
 * Parsed out of the PHC string rather than re-hashing, which would double the
 * cost of every login.
 */
export function needsRehash(hashed: string): boolean {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(hashed);
  if (!match) return true;

  const [, memory, time, lanes] = match;
  return (
    Number(memory) < OPTIONS.memoryCost ||
    Number(time) < OPTIONS.timeCost ||
    Number(lanes) < OPTIONS.parallelism
  );
}
