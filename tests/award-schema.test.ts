import { describe, expect, it } from "vitest";

import { awardSchema } from "@/lib/admin/resources/awards";

const base = {
  name: "Example award",
  awardingBody: "Example body",
  year: "2024",
  externalLink: "",
  slug: "example-award",
  order: "0",
  published: "",
};

function descriptionErrors(description: string) {
  const result = awardSchema.safeParse({ ...base, description });
  return result.success ? [] : result.error.issues.filter((i) => i.path[0] === "description").map((i) => i.message);
}

describe("award description", () => {
  it("accepts emphasis, links and lists", () => {
    expect(descriptionErrors("Recognises **patient safety** work. See [the list](https://example.org).")).toEqual([]);
    expect(descriptionErrors("Given for:\n\n- infection control\n- staff training")).toEqual([]);
  });

  it("refuses headings, which would sit under the award's own h3", () => {
    expect(descriptionErrors("## Why we won\n\nFor safety.")).toEqual([
      "Headings are not used here — use bold for emphasis instead.",
    ]);
    expect(descriptionErrors("### Detail")).toHaveLength(1);
  });

  it("still requires a description", () => {
    expect(descriptionErrors("   ")).toEqual(["Enter a description."]);
  });
});
