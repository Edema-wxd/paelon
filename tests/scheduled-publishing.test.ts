import { describe, expect, it } from "vitest";

import { toTimestamp } from "@/lib/admin/resources/fields";
import {
  MIN_JOB_SECRET_LENGTH,
  bearerToken,
  duePosts,
  lagosDateOf,
  secretMatches,
  usableSecrets,
} from "@/lib/blog/scheduled-publishing";

const post = (slug: string, date: string | null) => ({
  slug,
  publishedAt: date === null ? null : toTimestamp(date),
});

describe("lagosDateOf", () => {
  it("returns the day the editor picked, for a stored publication date", () => {
    expect(lagosDateOf(toTimestamp("2026-11-05")!)).toBe("2026-11-05");
  });

  it("reads 07:00 UTC as the same Lagos day the job runs on", () => {
    expect(lagosDateOf(new Date("2026-11-05T07:00:00Z"))).toBe("2026-11-05");
    expect(lagosDateOf(new Date("2026-11-05T23:30:00Z"))).toBe("2026-11-06");
  });
});

describe("duePosts", () => {
  const rows = [
    post("later", "2026-11-09"),
    post("today", "2026-11-05"),
    post("missed", "2026-11-03"),
    post("undated", null),
  ];

  it("takes today and earlier, oldest first, and leaves future and undated posts", () => {
    expect(duePosts(rows, "2026-11-05").map((row) => row.slug)).toEqual(["missed", "today"]);
  });

  it("finds nothing before the first date", () => {
    expect(duePosts(rows, "2026-11-01")).toEqual([]);
  });
});

describe("job authentication", () => {
  const secret = "s".repeat(MIN_JOB_SECRET_LENGTH + 8);

  it("reads a Bearer token and nothing else", () => {
    expect(bearerToken(`Bearer ${secret}`)).toBe(secret);
    expect(bearerToken(`bearer ${secret}`)).toBe(secret);
    expect(bearerToken(secret)).toBeNull();
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  it("ignores missing and too-short secrets", () => {
    expect(usableSecrets(undefined, "short", secret)).toEqual([secret]);
    expect(usableSecrets(undefined, "")).toEqual([]);
  });

  it("matches either configured secret, and nothing else", () => {
    const other = "o".repeat(40);
    expect(secretMatches(secret, [secret])).toBe(true);
    expect(secretMatches(other, [secret, other])).toBe(true);
    expect(secretMatches(`${secret}x`, [secret])).toBe(false);
    expect(secretMatches("", [secret])).toBe(false);
    expect(secretMatches(null, [secret])).toBe(false);
    expect(secretMatches(secret, [])).toBe(false);
  });
});
