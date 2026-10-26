import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Images placed by reference (body figures, page blocks) never pass the image
 * field's alt rule, so this is the only thing between an undescribed upload and
 * a live page. `null` is "not written"; `""` is a decision and must pass.
 */

const mocks = vi.hoisted(() => ({ getMediaByIds: vi.fn() }));
vi.mock("@/lib/db/queries/media", () => ({ getMediaByIds: mocks.getMediaByIds }));

const { undescribedMedia, undescribedMessage } = await import("@/lib/admin/undescribed-media");

function rows(entries: Array<[string, string | null, string | null]>) {
  return new Map(entries.map(([id, alt, filename]) => [id, { id, alt, filename }]));
}

beforeEach(() => vi.clearAllMocks());

describe("undescribedMedia", () => {
  it("does not touch the database for no images", async () => {
    expect(await undescribedMedia([])).toEqual([]);
    expect(mocks.getMediaByIds).not.toHaveBeenCalled();
  });

  it("names images whose alt text is null, and only those", async () => {
    mocks.getMediaByIds.mockResolvedValue(
      rows([
        ["a", null, "ward.jpg"],
        ["b", "", "divider.png"],
        ["c", "The maternity ward", "ward-2.jpg"],
        ["d", null, null],
      ]),
    );
    expect(await undescribedMedia(["a", "b", "c", "d"])).toEqual(["ward.jpg", "an untitled image"]);
  });
});

describe("undescribedMessage", () => {
  it("reads for one image and for several", () => {
    expect(undescribedMessage(["ward.jpg"])).toMatch(/“ward\.jpg” in the Media library first, or mark it decorative/);
    expect(undescribedMessage(["a.jpg", "b.jpg"])).toMatch(/mark them decorative/);
  });
});
