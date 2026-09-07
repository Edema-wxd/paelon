import { describe, expect, it } from "vitest";

import { preferredSourceUrl } from "@/lib/seo";

describe("preferredSourceUrl", () => {
  it("builds the Google source-preferences deeplink from the host", () => {
    expect(preferredSourceUrl("https://www.paelonhospital.com")).toBe(
      "https://www.google.com/preferences/source?q=www.paelonhospital.com",
    );
  });

  it("ignores path, port and query on the site URL", () => {
    expect(preferredSourceUrl("https://paelon.com:443/blog?x=1")).toBe(
      "https://www.google.com/preferences/source?q=paelon.com",
    );
  });

  it("returns null for hosts Google's tool cannot resolve", () => {
    expect(preferredSourceUrl("http://localhost:3000")).toBeNull();
    expect(preferredSourceUrl("http://127.0.0.1:3000")).toBeNull();
    expect(preferredSourceUrl("not a url")).toBeNull();
  });
});
