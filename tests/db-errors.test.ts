import { describe, expect, it } from "vitest";

import { isUniqueViolation, postgresErrorCode } from "@/lib/db/errors";

/**
 * drizzle-orm throws its own `Error` ("Failed query: …") with the driver error
 * on `cause`, so the SQLSTATE is one or more levels down. Matching on the
 * message text, or reading `.code` off the thrown object, finds nothing.
 */

/** What drizzle 0.45 throws for a duplicate key. */
function drizzleWrapped(code: string): Error {
  const driverError = Object.assign(new Error('duplicate key value violates unique constraint "users_email_key"'), {
    code,
    severity: "ERROR",
  });
  return Object.assign(new Error('Failed query: insert into "users" ...'), {
    cause: driverError,
  });
}

describe("postgresErrorCode", () => {
  it("finds the code on a bare driver error", () => {
    expect(postgresErrorCode(Object.assign(new Error("nope"), { code: "23505" }))).toBe("23505");
  });

  it("finds the code through drizzle's wrapper", () => {
    expect(postgresErrorCode(drizzleWrapped("23505"))).toBe("23505");
  });

  it("finds the code through nested wrappers", () => {
    const nested = Object.assign(new Error("outer"), { cause: drizzleWrapped("23503") });
    expect(postgresErrorCode(nested)).toBe("23503");
  });

  it("returns null for anything that is not a database error", () => {
    expect(postgresErrorCode(new Error("plain"))).toBeNull();
    expect(postgresErrorCode("23505")).toBeNull();
    expect(postgresErrorCode(null)).toBeNull();
    expect(postgresErrorCode(undefined)).toBeNull();
  });

  it("gives up on a cyclic cause chain instead of hanging", () => {
    const a: { cause?: unknown } = {};
    const b = { cause: a };
    a.cause = b;
    expect(postgresErrorCode(a)).toBeNull();
  });
});

describe("isUniqueViolation", () => {
  it("is true only for 23505, wrapped or not", () => {
    expect(isUniqueViolation(drizzleWrapped("23505"))).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error("x"), { code: "23505" }))).toBe(true);
    expect(isUniqueViolation(drizzleWrapped("23503"))).toBe(false);
    // The old check: the wrapper's message mentions neither word.
    expect(isUniqueViolation(new Error("duplicate key value"))).toBe(false);
  });
});
