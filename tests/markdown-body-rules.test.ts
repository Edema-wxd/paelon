import { describe, expect, it } from "vitest";
import { z } from "zod";

import { checkboxField, markdownBodyRules } from "@/lib/admin/resources/fields";

describe("markdownBodyRules", () => {
  const schema = z
    .object({ body: z.string(), published: checkboxField })
    .check(markdownBodyRules(["body"]));
  const errors = (body: string, published: boolean) => {
    // An unticked checkbox is absent from a real submission, not "".
    const result = schema.safeParse(published ? { body, published: "on" } : { body });
    return result.success ? [] : result.error.issues.map((issue) => issue.message);
  };

  it("accepts a figure on its own line and sequential headings", () => {
    const body = "## Intro\n\nText.\n\n![A ward](media:0b3c7c64-6d0d-4a52-9f43-0c1a6bd1e2f1 \"\")\n\n### More";
    expect(errors(body, true)).toEqual([]);
  });

  it("refuses an image inside a sentence when publishing", () => {
    const body = "Look ![a ward](media:0b3c7c64-6d0d-4a52-9f43-0c1a6bd1e2f1) here.";
    expect(errors(body, true)[0]).toMatch(/line of its own/);
  });

  it("refuses a skipped heading level when publishing", () => {
    expect(errors("## Top\n\n#### Too deep", true)[0]).toMatch(/cannot skip a step/);
  });

  it("leaves drafts alone", () => {
    expect(errors("## Top\n\n#### Too deep", false)).toEqual([]);
  });
});
