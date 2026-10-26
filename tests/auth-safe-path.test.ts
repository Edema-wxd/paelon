import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/auth/safe-path";

describe("safeNextPath", () => {
  it.each([
    ["/admin", "/admin"],
    ["/admin/blog?page=2#top", "/admin/blog?page=2#top"],
    ["/admin/../admin/media", "/admin/media"],
  ])("keeps same-origin path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    [undefined],
    [null],
    [""],
    ["admin"],
    ["https://evil.example/admin"],
    ["//evil.example"],
    ["/\\evil.example"],
    ["/\t/evil.example"],
    ["/\n/evil.example"],
    ["javascript:alert(1)"],
  ])("rejects %j", (input) => {
    expect(safeNextPath(input)).toBeNull();
  });
});
