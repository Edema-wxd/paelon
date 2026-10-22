/**
 * Recognising Postgres errors through Drizzle's wrapper.
 *
 * drizzle-orm wraps a driver error in its own `Error` whose message is only
 * `Failed query: insert into "users" …`. The Postgres fields — `code` above all
 * — are on the wrapped error, reachable through `cause`. So neither matching on
 * the message text nor reading `error.code` off the thing that was thrown is
 * reliable: both quietly stop working, and a handler that meant to turn a
 * duplicate into a field error shows a 500 page instead.
 *
 * These helpers walk the `cause` chain and match on SQLSTATE, which is stable.
 */

/** SQLSTATE codes worth naming. */
export const PG_ERROR_CODES = {
  uniqueViolation: "23505",
  foreignKeyViolation: "23503",
  checkViolation: "23514",
  notNullViolation: "23502",
} as const;

/** How far to follow `cause` before giving up. Guards a cyclic chain. */
const MAX_CAUSE_DEPTH = 5;

/**
 * The SQLSTATE of a database error, wrapped or not, or `null` when it is not a
 * database error.
 */
export function postgresErrorCode(error: unknown): string | null {
  let current = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== "object" || current === null) return null;

    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && code !== "") return code;

    if (!("cause" in current)) return null;
    current = (current as { cause?: unknown }).cause;
  }

  return null;
}

/** True for a unique-index violation (SQLSTATE 23505). */
export function isUniqueViolation(error: unknown): boolean {
  return postgresErrorCode(error) === PG_ERROR_CODES.uniqueViolation;
}
