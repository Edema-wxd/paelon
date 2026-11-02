import { describe, expect, it } from "vitest";

import { saveButtonHint, saveButtonLabel } from "@/lib/admin/save-label";

const base = { singular: "post", canPublish: true };

describe("saveButtonLabel", () => {
  it("saves a new post as a draft until Published is ticked", () => {
    expect(saveButtonLabel({ ...base, isNew: true, publishedNow: false, publishedSaved: false })).toBe("Save draft");
    expect(saveButtonLabel({ ...base, isNew: true, publishedNow: true, publishedSaved: false })).toBe("Publish post");
  });

  it("says when a press publishes, keeps, or takes down an existing post", () => {
    expect(saveButtonLabel({ ...base, isNew: false, publishedNow: false, publishedSaved: false })).toBe("Save draft");
    expect(saveButtonLabel({ ...base, isNew: false, publishedNow: true, publishedSaved: false })).toBe("Publish post");
    expect(saveButtonLabel({ ...base, isNew: false, publishedNow: true, publishedSaved: true })).toBe("Save changes");
    expect(saveButtonLabel({ ...base, isNew: false, publishedNow: false, publishedSaved: true })).toBe("Save and unpublish");
  });

  it("keeps the plain labels for a role that cannot publish", () => {
    const contributor = { ...base, canPublish: false, publishedNow: false, publishedSaved: false };
    expect(saveButtonLabel({ ...contributor, isNew: true })).toBe("Create post");
    expect(saveButtonLabel({ ...contributor, isNew: false })).toBe("Save changes");
  });
});

describe("scheduling labels", () => {
  it("says Schedule when only Schedule is ticked", () => {
    expect(
      saveButtonLabel({ ...base, isNew: true, publishedNow: false, scheduledNow: true, publishedSaved: false }),
    ).toBe("Schedule post");
    expect(
      saveButtonLabel({ ...base, isNew: false, publishedNow: false, scheduledNow: true, publishedSaved: true }),
    ).toBe("Unpublish and schedule");
  });

  it("explains when a scheduled post goes live", () => {
    expect(saveButtonHint({ isNew: false, canPublish: true, publishedNow: false, scheduledNow: true })).toMatch(
      /8am WAT on the publication date/,
    );
  });
});

describe("saveButtonHint", () => {
  it("explains how to preview a draft", () => {
    expect(saveButtonHint({ isNew: true, canPublish: true, publishedNow: false })).toMatch(/Once it is saved, Preview on site/);
    expect(saveButtonHint({ isNew: false, canPublish: true, publishedNow: false })).toMatch(/save first/);
  });

  it("says nothing once the post is going live", () => {
    expect(saveButtonHint({ isNew: false, canPublish: true, publishedNow: true })).toBeNull();
  });
});
