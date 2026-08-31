import { describe, expect, it, vi } from "vitest";

import { formatReference, generateReference } from "@/lib/booking/reference";

describe("formatReference", () => {
  it.each([
    [1, 2026, "PMH-2026-000001"],
    [123, 2026, "PMH-2026-000123"],
    [999_999, 2026, "PMH-2026-999999"],
    ["42", 2027, "PMH-2027-000042"],
  ])("formats %s in %i as %s", (value, year, expected) => {
    expect(formatReference(value, year)).toBe(expected);
  });

  it("does not truncate once the sequence exceeds six digits", () => {
    // Padding is a minimum, not a maximum — a seven-digit reference is ugly but
    // correct, whereas a truncated one would collide.
    expect(formatReference(1_234_567, 2026)).toBe("PMH-2026-1234567");
  });
});

describe("generateReference", () => {
  it("reads the sequence and formats the result", async () => {
    const client = { execute: vi.fn().mockResolvedValue({ rows: [{ value: "7" }] }) };
    await expect(generateReference(client, 2026)).resolves.toBe("PMH-2026-000007");
    expect(client.execute).toHaveBeenCalledOnce();
  });

  it("handles a driver that returns a bare array", async () => {
    const client = { execute: vi.fn().mockResolvedValue([{ value: 12 }]) };
    await expect(generateReference(client, 2026)).resolves.toBe("PMH-2026-000012");
  });

  it("handles a bigint sequence value", async () => {
    // BigInt(8) rather than 8n: tsconfig targets ES2017, where the literal
    // syntax is unavailable.
    const client = {
      execute: vi.fn().mockResolvedValue({ rows: [{ value: BigInt(8) }] }),
    };
    await expect(generateReference(client, 2026)).resolves.toBe("PMH-2026-000008");
  });

  it("throws rather than inventing a reference when the sequence returns nothing", async () => {
    const client = { execute: vi.fn().mockResolvedValue({ rows: [] }) };
    await expect(generateReference(client, 2026)).rejects.toThrow(/did not return/);
  });
});
