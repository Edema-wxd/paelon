import { afterEach, describe, expect, it, vi } from "vitest";

import { logger, redactEmail, redactPhone } from "@/lib/logger";

describe("redactEmail", () => {
  it.each([
    ["francis@varyn.ltd", "f***@varyn.ltd"],
    ["a@b.com", "a***@b.com"],
    ["ada.obi+tag@sub.example.co.uk", "a***@sub.example.co.uk"],
  ])("masks %s to %s", (input, expected) => {
    expect(redactEmail(input)).toBe(expected);
  });

  it.each([null, undefined, ""])("returns empty for %s", (v) => {
    expect(redactEmail(v)).toBe("");
  });

  it("does not leak a local part when the address is malformed", () => {
    expect(redactEmail("@example.com")).toBe("***");
    expect(redactEmail("no-at-sign")).toBe("***");
  });
});

describe("redactPhone", () => {
  it("keeps only the last four digits", () => {
    expect(redactPhone("+2348012345678")).toBe("***5678");
    expect(redactPhone("0801 234 5678")).toBe("***5678");
  });

  it.each([null, undefined, ""])("returns empty for %s", (v) => {
    expect(redactPhone(v)).toBe("");
  });

  it("refuses to echo a number too short to mask", () => {
    expect(redactPhone("123")).toBe("***");
  });
});

describe("logger", () => {
  afterEach(() => vi.restoreAllMocks());

  function captureStdout() {
    const lines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
    return lines;
  }

  it("writes one JSON line with level, event and timestamp", () => {
    const lines = captureStdout();
    logger.info("booking.created", { reference: "PMH-2026-000123" });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? "{}");
    expect(parsed.level).toBe("info");
    expect(parsed.event).toBe("booking.created");
    expect(parsed.reference).toBe("PMH-2026-000123");
    expect(typeof parsed.ts).toBe("string");
  });

  it("sends warn and error to stderr, not stdout", () => {
    const out = captureStdout();
    const err: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      err.push(String(chunk));
      return true;
    });

    logger.error("booking.failed", { error: new Error("boom") });

    expect(out).toHaveLength(0);
    expect(err).toHaveLength(1);
    const parsed = JSON.parse(err[0] ?? "{}");
    expect(parsed.errorName).toBe("Error");
    expect(parsed.errorMessage).toBe("boom");
  });

  it("unwraps a non-Error thrown value rather than logging {}", () => {
    const err: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      err.push(String(chunk));
      return true;
    });

    logger.warn("destination.failed", { error: "timeout" });
    expect(JSON.parse(err[0] ?? "{}").errorMessage).toBe("timeout");
  });
});
