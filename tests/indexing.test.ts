import { describe, expect, it } from "vitest";

import {
  NOINDEX,
  NOINDEX_NOFOLLOW,
  isPrivatePath,
  noindexHeaderRules,
} from "@/lib/indexing";

describe("isPrivatePath", () => {
  it.each([
    "/admin",
    "/admin/login",
    "/admin/blog/123",
    "/api",
    "/api/health",
    "/api/booking",
    "/book/confirmed",
    "/contact/thank-you",
    "/corporate/thank-you",
    "/newsletter/confirm",
    "/newsletter/confirmed",
  ])("treats %s as private", (path) => {
    expect(isPrivatePath(path)).toBe(true);
  });

  it.each([
    "/",
    "/about",
    "/book",
    "/blog/some-post",
    "/administrator",
    "/apiary",
    "/book/confirmed-ish",
    "/contact",
    "/services/paediatrics",
  ])("treats %s as public", (path) => {
    expect(isPrivatePath(path)).toBe(false);
  });
});

describe("noindexHeaderRules", () => {
  const value = (rules: ReturnType<typeof noindexHeaderRules>, source: string) =>
    rules.find((rule) => rule.source === source)?.headers[0]?.value;

  it("tags RSC payloads by header and by cache-buster", () => {
    const rsc = noindexHeaderRules(false).filter((rule) => rule.has);
    expect(rsc.map((rule) => rule.has)).toEqual([
      [{ type: "header", key: "rsc", value: "1" }],
      [{ type: "query", key: "_rsc" }],
    ]);
    expect(rsc.every((rule) => rule.headers[0]?.value === NOINDEX)).toBe(true);
  });

  it("covers scripts, insurer logos and font files", () => {
    const rules = noindexHeaderRules(false);
    expect(value(rules, "/_next/static/:path*")).toBe(NOINDEX);
    expect(value(rules, "/images/hmo-logo/:path*")).toBe(NOINDEX);
    expect(value(rules, "/fonts/:path*")).toBe(NOINDEX);
    expect(rules.some((rule) => rule.source === "/:path*" && !rule.has)).toBe(false);
  });

  it("ends with a site-wide catch-all under SITE_NOINDEX", () => {
    const rules = noindexHeaderRules(true);
    expect(rules.at(-1)).toEqual({
      source: "/:path*",
      headers: [{ key: "X-Robots-Tag", value: NOINDEX_NOFOLLOW }],
    });
  });
});
