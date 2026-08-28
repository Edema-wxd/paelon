import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, hasDatabase, resetDatabase, configureTestDatabase } from "./setup";

configureTestDatabase();

const describeIfDb = hasDatabase ? describe : describe.skip;

describeIfDb("rate limiter", () => {
  let checkRateLimit: typeof import("@/lib/rate-limit").checkRateLimit;

  beforeAll(async () => {
    ({ checkRateLimit } = await import("@/lib/rate-limit"));
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closePool();
  });

  const rule = { name: "test_booking", limit: 5, windowSeconds: 3600 };

  it("allows five requests in the window and rejects the sixth", async () => {
    const ip = "203.0.113.10";

    for (let i = 1; i <= 5; i += 1) {
      const result = await checkRateLimit(rule, ip);
      expect(result.allowed, `request ${i} should be allowed`).toBe(true);
    }

    const sixth = await checkRateLimit(rule, ip);
    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfterSeconds).toBe(3600);
  });

  it("keeps separate budgets per client", async () => {
    for (let i = 0; i < 5; i += 1) await checkRateLimit(rule, "203.0.113.10");

    // A different client must be unaffected by the first one's spending.
    const other = await checkRateLimit(rule, "203.0.113.11");
    expect(other.allowed).toBe(true);
  });

  it("keeps separate budgets per rule", async () => {
    for (let i = 0; i < 5; i += 1) await checkRateLimit(rule, "203.0.113.10");

    const otherRule = { name: "test_contact", limit: 5, windowSeconds: 3600 };
    const result = await checkRateLimit(otherRule, "203.0.113.10");
    expect(result.allowed).toBe(true);
  });

  it("never stores a raw IP address", async () => {
    const { db } = await import("@/lib/db/client");
    await checkRateLimit(rule, "203.0.113.10");

    const stored = await db().execute(sql`SELECT key FROM rate_limit_hits`);
    const list = Array.isArray(stored) ? stored : (stored as { rows: unknown[] }).rows;
    const keys = list.map((r) => (r as { key: string }).key);

    expect(keys.length).toBeGreaterThan(0);
    // An IP is personal data; only a salted digest may be persisted.
    expect(keys.every((k) => !k.includes("203.0.113.10"))).toBe(true);
    expect(keys[0]).toMatch(/^test_booking:[0-9a-f]{64}$/);
  });
});

describeIfDb("newsletter", () => {
  let subscribeToNewsletter: typeof import("@/lib/newsletter/subscribe").subscribeToNewsletter;
  let db: typeof import("@/lib/db/client").db;

  beforeAll(async () => {
    ({ subscribeToNewsletter } = await import("@/lib/newsletter/subscribe"));
    ({ db } = await import("@/lib/db/client"));
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closePool();
  });

  const input = {
    email: "ada@example.test",
    consentNdpr: true as const,
  };

  it("creates one row for a new address", async () => {
    await subscribeToNewsletter(input);

    const result = await db().execute(
      sql`SELECT count(*)::int AS n FROM newsletter_subscribers`,
    );
    expect(count(result)).toBe(1);
  });

  it("does not duplicate or throw when the same address subscribes twice", async () => {
    await subscribeToNewsletter(input);
    // Identical externally-visible behaviour is the whole point: the endpoint
    // must not become a subscriber-list oracle.
    await expect(subscribeToNewsletter(input)).resolves.toBeUndefined();

    const result = await db().execute(
      sql`SELECT count(*)::int AS n FROM newsletter_subscribers`,
    );
    expect(count(result)).toBe(1);
  });

  it("stores tokens hashed, never in the clear", async () => {
    await subscribeToNewsletter(input);

    const result = await db().execute(
      sql`SELECT confirm_token_hash, unsubscribe_token_hash FROM newsletter_subscribers`,
    );
    const list = Array.isArray(result) ? result : (result as { rows: unknown[] }).rows;
    const row = list[0] as {
      confirm_token_hash: string;
      unsubscribe_token_hash: string;
    };

    expect(row.confirm_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.unsubscribe_token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("confirms exactly once, then rejects a replayed token", async () => {
    const { confirmSubscription } = await import("@/lib/newsletter/subscribe");
    const { generateToken, hashToken, confirmExpiry } = await import(
      "@/lib/newsletter/tokens"
    );
    const { upsertSubscriber } = await import("@/lib/db/queries/newsletter");

    const token = generateToken();
    await upsertSubscriber({
      email: "replay@example.test",
      name: null,
      consentNdpr: true,
      consentTextVersion: "test-v1",
      confirmTokenHash: hashToken(token),
      confirmExpiresAt: confirmExpiry(),
      unsubscribeTokenHash: hashToken(generateToken()),
    });

    await expect(confirmSubscription(token)).resolves.toEqual({ confirmed: true });
    // Single-use: an email client prefetching the link then a real click must
    // not produce two confirmations.
    await expect(confirmSubscription(token)).resolves.toEqual({ confirmed: false });
  });
});

function count(result: unknown): number {
  const list = Array.isArray(result) ? result : (result as { rows: unknown[] }).rows;
  return (list[0] as { n: number }).n;
}
