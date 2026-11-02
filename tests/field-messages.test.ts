import { describe, expect, it } from "vitest";

import {
  readableMessages,
  unreadableMessage,
  unsavedSummary,
} from "@/lib/admin/field-messages";

describe("readableMessages", () => {
  it("replaces Zod's defaults, with or without the detail", () => {
    expect(readableMessages("Body", ["Invalid input"])).toEqual([unreadableMessage("Body")]);
    expect(
      readableMessages("Body", ["Invalid input: expected string, received undefined"]),
    ).toEqual([unreadableMessage("Body")]);
  });

  it("keeps the schema's own sentences untouched", () => {
    const rule = "Give the post a publication date. Without one it stays off /blog even when published.";
    expect(readableMessages("Publication date", [rule])).toEqual([rule]);
  });

  it("does not repeat the same message", () => {
    expect(readableMessages("Body", ["Invalid input", "Invalid input"])).toHaveLength(1);
  });
});

describe("unsavedSummary", () => {
  it("names one field", () => {
    expect(unsavedSummary(["Body"])).toBe("Not saved. Fix this field first: Body.");
  });

  it("names several, once each", () => {
    expect(unsavedSummary(["Body", "Category", "Body", "Author"])).toBe(
      "Not saved. Fix these fields first: Body, Category and Author.",
    );
  });

  it("falls back when no label is known", () => {
    expect(unsavedSummary([])).toBe("Not saved. Check the highlighted fields.");
  });
});
