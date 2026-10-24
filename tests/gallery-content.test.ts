import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the public gallery getters hand a template.
 *
 * `/services/[slug]` and `/locations/[slug]` render these rows through
 * `components/site/image-gallery.tsx`, which has no fallback for an image it
 * cannot size — so the rule that unsized rows never reach it is enforced here
 * and asserted here. The join-table write that produces the order is covered
 * against a real database in `tests/integration/content-crud.test.ts`.
 */

const mocks = vi.hoisted(() => ({
  listServiceGallery: vi.fn(),
  listLocationGallery: vi.fn(),
}));

vi.mock("@/lib/db/queries/media", () => ({
  getMediaByIds: vi.fn(),
  listServiceGallery: mocks.listServiceGallery,
  listLocationGallery: mocks.listLocationGallery,
}));
vi.mock("next/headers", () => ({
  draftMode: async () => ({ isEnabled: false }),
}));

const content = await import("@/lib/content");

const SERVICE_ID = "3f6c1d20-9b4e-4c8a-9f21-5d7e8a0b1c23";

function row(overrides: Record<string, unknown> = {}) {
  return {
    url: "https://example.ufs.sh/f/one.webp",
    alt: "The paediatric waiting room, with low seating and a play corner",
    width: 1600,
    height: 1200,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getServiceGallery", () => {
  it("keeps the repository's order", async () => {
    mocks.listServiceGallery.mockResolvedValue([
      row({ url: "https://example.ufs.sh/f/first.webp" }),
      row({ url: "https://example.ufs.sh/f/second.webp" }),
      row({ url: "https://example.ufs.sh/f/third.webp" }),
    ]);

    const gallery = await content.getServiceGallery(SERVICE_ID);

    expect(gallery.map((image) => image.url)).toEqual([
      "https://example.ufs.sh/f/first.webp",
      "https://example.ufs.sh/f/second.webp",
      "https://example.ufs.sh/f/third.webp",
    ]);
  });

  it("drops a row with no intrinsic dimensions", async () => {
    mocks.listServiceGallery.mockResolvedValue([
      row({ url: "https://example.ufs.sh/f/sized.webp" }),
      row({ url: "https://example.ufs.sh/f/no-width.webp", width: null }),
      row({ url: "https://example.ufs.sh/f/no-height.webp", height: null }),
    ]);

    const gallery = await content.getServiceGallery(SERVICE_ID);

    // An unsized image cannot have space reserved for it, and a grid that
    // reflows when the bytes arrive breaks the CLS budget (spec §13).
    expect(gallery.map((image) => image.url)).toEqual([
      "https://example.ufs.sh/f/sized.webp",
    ]);
  });

  it("passes empty alt text through as the decorative marker it is", async () => {
    mocks.listServiceGallery.mockResolvedValue([row({ alt: "" })]);

    const [image] = await content.getServiceGallery(SERVICE_ID);

    // Never substituted, never inferred from the service name: alt text is an
    // editorial fact (CLAUDE.md baseline 10).
    expect(image?.alt).toBe("");
  });

  it("is empty when the service has no gallery", async () => {
    mocks.listServiceGallery.mockResolvedValue([]);
    await expect(content.getServiceGallery(SERVICE_ID)).resolves.toEqual([]);
  });
});

describe("getLocationGallery", () => {
  it("applies the same rules", async () => {
    mocks.listLocationGallery.mockResolvedValue([
      row({ url: "https://example.ufs.sh/f/branch.webp" }),
      row({ url: "https://example.ufs.sh/f/unsized.webp", width: null }),
    ]);

    const gallery = await content.getLocationGallery(SERVICE_ID);

    expect(gallery).toEqual([
      {
        url: "https://example.ufs.sh/f/branch.webp",
        alt: "The paediatric waiting room, with low seating and a play corner",
        width: 1600,
        height: 1200,
      },
    ]);
  });
});
