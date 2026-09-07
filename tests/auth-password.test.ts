import { describe, expect, it } from "vitest";

import { hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";

describe("hashPassword / verifyPassword", () => {
  it("round-trips a password", async () => {
    const hashed = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hashed, "correct horse battery staple")).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hashed = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hashed, "Correct horse battery staple")).toBe(false);
    expect(await verifyPassword(hashed, "")).toBe(false);
  });

  it("salts — the same password hashes differently every time", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, "same-password")).toBe(true);
    expect(await verifyPassword(b, "same-password")).toBe(true);
  });

  it("returns false rather than throwing on a corrupt hash", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
    expect(await verifyPassword("", "anything")).toBe(false);
    expect(await verifyPassword("$argon2id$v=19$m=19456,t=2,p=1$trunc", "x")).toBe(false);
  });
});

describe("needsRehash", () => {
  it("is false for a hash at the current baseline", async () => {
    expect(needsRehash(await hashPassword("whatever"))).toBe(false);
  });

  it("is true for weaker parameters", () => {
    expect(needsRehash("$argon2id$v=19$m=4096,t=2,p=1$c2FsdA$aGFzaA")).toBe(true);
    expect(needsRehash("$argon2id$v=19$m=19456,t=1,p=1$c2FsdA$aGFzaA")).toBe(true);
  });

  it("is true for anything it cannot parse, including bcrypt", () => {
    expect(needsRehash("$2b$12$abcdefghijklmnopqrstuv")).toBe(true);
    expect(needsRehash("")).toBe(true);
  });
});
