import { describe, expect, it } from "vitest";

import { inSentence } from "@/lib/admin/resource-config";

describe("inSentence", () => {
  it.each([
    ["Service", "service"],
    ["Blog post", "blog post"],
    ["HMO", "HMO"],
    ["HMOs", "HMOs"],
    ["FAQ", "FAQ"],
    ["FAQs", "FAQs"],
  ])("%s → %s", (noun, expected) => {
    expect(inSentence(noun)).toBe(expected);
  });
});
