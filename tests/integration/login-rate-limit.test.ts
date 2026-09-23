import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, configureTestDatabase, hasDatabase, resetDatabase } from "./setup";

configureTestDatabase();

const describeIfDb = hasDatabase ? describe : describe.skip;

const PASSWORD = "correct horse battery staple";

function rowsOf(result: unknown): unknown[] {
  return Array.isArray(result) ? result : (result as { rows: unknown[] }).rows;
}

function fromIp(ip: string): Headers {
  return new Headers({ "x-forwarded-for": ip });
}

describeIfDb("reserveRateLimitSlot", () => {
  let reserveRateLimitSlot: typeof import("@/lib/rate-limit").reserveRateLimitSlot;

  beforeAll(async () => {
    ({ reserveRateLimitSlot } = await import("@/lib/rate-limit"));
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const rule = { name: "test_failures", limit: 3, windowSeconds: 900 };

  it("costs nothing when every attempt is released", async () => {
    for (let i = 0; i < 10; i += 1) {
      const slot = await reserveRateLimitSlot(rule, "203.0.113.20");
      expect(slot.allowed, `attempt ${i + 1} should be allowed`).toBe(true);
      await slot.release();
    }
  });

  it("limits once unreleased attempts reach the limit", async () => {
    for (let i = 0; i < 3; i += 1) {
      expect((await reserveRateLimitSlot(rule, "203.0.113.20")).allowed).toBe(true);
    }
    expect((await reserveRateLimitSlot(rule, "203.0.113.20")).allowed).toBe(false);
  });

  it("releases one attempt, not the whole key", async () => {
    const { db } = await import("@/lib/db/client");
    for (let i = 0; i < 3; i += 1) await reserveRateLimitSlot(rule, "203.0.113.20");
    const slot = await reserveRateLimitSlot(rule, "203.0.113.20");
    await slot.release();

    const hits = rowsOf(await db().execute(sql`SELECT key FROM rate_limit_hits`));
    expect(hits).toHaveLength(3);
  });

  it("holds the limit against parallel reservations", async () => {
    const slots = await Promise.all(
      Array.from({ length: 12 }, () => reserveRateLimitSlot(rule, "203.0.113.22")),
    );
    expect(slots.filter((slot) => slot.allowed)).toHaveLength(3);
  });

  it("keeps separate budgets per client", async () => {
    for (let i = 0; i < 3; i += 1) await reserveRateLimitSlot(rule, "203.0.113.20");
    expect((await reserveRateLimitSlot(rule, "203.0.113.21")).allowed).toBe(true);
  });
});

describeIfDb("admin sign-in rate limit", () => {
  let authorizeCredentials: typeof import("@/lib/auth/authorize").authorizeCredentials;
  let email: string;

  beforeAll(async () => {
    ({ authorizeCredentials } = await import("@/lib/auth/authorize"));
  });

  beforeEach(async () => {
    await resetDatabase();

    const { hashPassword } = await import("@/lib/auth/password");
    const { dbTx } = await import("@/lib/db/client");
    email = `editor-${crypto.randomUUID()}@example.test`;
    await dbTx().execute(sql`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ('Editor', ${email}, ${await hashPassword(PASSWORD)}, 'editor')
    `);
  });

  afterAll(async () => {
    await closePool();
  });

  it("never limits successful sign-ins from a shared IP", async () => {
    // More than the limit of 5, as at the start of a shift on one hospital IP.
    for (let i = 1; i <= 8; i += 1) {
      const user = await authorizeCredentials({ email, password: PASSWORD }, fromIp("198.51.100.1"));
      expect(user, `sign-in ${i} should succeed`).not.toBeNull();
    }
  });

  it("refuses even the right password after 5 failures from one IP", async () => {
    const ip = fromIp("198.51.100.2");
    for (let i = 0; i < 5; i += 1) {
      expect(await authorizeCredentials({ email, password: "wrong password" }, ip)).toBeNull();
    }

    expect(await authorizeCredentials({ email, password: PASSWORD }, ip)).toBeNull();

    // Another IP is unaffected.
    expect(
      await authorizeCredentials({ email, password: PASSWORD }, fromIp("198.51.100.3")),
    ).not.toBeNull();
  });

  it("counts unknown emails and malformed submissions as failures", async () => {
    const ip = fromIp("198.51.100.4");
    for (let i = 0; i < 3; i += 1) {
      await authorizeCredentials({ email: "nobody@example.test", password: "x" }, ip);
    }
    for (let i = 0; i < 2; i += 1) {
      await authorizeCredentials({ email: "not an email", password: "" }, ip);
    }

    expect(await authorizeCredentials({ email, password: PASSWORD }, ip)).toBeNull();
  });

  it("writes no audit row for a rate-limited attempt", async () => {
    const { db } = await import("@/lib/db/client");
    const ip = fromIp("198.51.100.5");
    for (let i = 0; i < 5; i += 1) {
      await authorizeCredentials({ email, password: "wrong password" }, ip);
    }

    const before = rowsOf(await db().execute(sql`SELECT id FROM audit_log`)).length;
    await authorizeCredentials({ email, password: "wrong password" }, ip);
    const after = rowsOf(await db().execute(sql`SELECT id FROM audit_log`)).length;

    expect(after).toBe(before);
  });

  it("holds the IP limit against a burst of parallel guesses", async () => {
    const ip = fromIp("198.51.100.6");
    const { db } = await import("@/lib/db/client");

    // Checking the counter first and recording the failure after the ~50ms
    // password check would let all 20 of these through on a limit of 5.
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        authorizeCredentials({ email, password: "wrong password" }, ip),
      ),
    );
    expect(results.every((r) => r === null)).toBe(true);

    const attempts = rowsOf(
      await db().execute(sql`SELECT id FROM audit_log WHERE action = 'auth.login_failed'`),
    );
    expect(attempts.length).toBeLessThanOrEqual(6);
    expect(await authorizeCredentials({ email, password: PASSWORD }, ip)).toBeNull();
  });

  it("holds the account lockout against a burst of parallel guesses", async () => {
    const { db } = await import("@/lib/db/client");

    // Each request comes from its own IP, so only the per-account lockout of 10
    // can stop them.
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        authorizeCredentials(
          { email, password: "wrong password" },
          fromIp(`203.0.113.${i + 1}`),
        ),
      ),
    );
    expect(results.every((r) => r === null)).toBe(true);

    const locked = rowsOf(
      await db().execute(sql`SELECT locked_until FROM users WHERE email = ${email}`),
    )[0] as { locked_until: string | null };
    expect(locked.locked_until).not.toBeNull();

    // The right password from a fresh IP is refused while the lock stands.
    expect(
      await authorizeCredentials({ email, password: PASSWORD }, fromIp("203.0.113.200")),
    ).toBeNull();
  });

  it("gives a successful sign-in its attempt back on both limits", async () => {
    const { db } = await import("@/lib/db/client");
    const ip = fromIp("198.51.100.7");

    for (let i = 0; i < 3; i += 1) {
      await authorizeCredentials({ email, password: "wrong password" }, ip);
    }
    expect(await authorizeCredentials({ email, password: PASSWORD }, ip)).not.toBeNull();

    const hits = rowsOf(await db().execute(sql`SELECT key FROM rate_limit_hits`));
    expect(hits).toHaveLength(3);

    const account = rowsOf(
      await db().execute(sql`SELECT failed_attempts FROM users WHERE email = ${email}`),
    )[0] as { failed_attempts: number };
    expect(account.failed_attempts).toBe(0);
  });

  it("skips the IP limit when no client IP header arrives, leaving no shared bucket", async () => {
    const { db } = await import("@/lib/db/client");
    const noIp = new Headers();
    for (let i = 0; i < 6; i += 1) {
      expect(await authorizeCredentials({ email, password: "wrong password" }, noIp)).toBeNull();
    }

    // Still under the per-account lockout of 10, so the right password works.
    expect(await authorizeCredentials({ email, password: PASSWORD }, noIp)).not.toBeNull();

    const hits = rowsOf(await db().execute(sql`SELECT key FROM rate_limit_hits`));
    expect(hits).toHaveLength(0);
  });
});
