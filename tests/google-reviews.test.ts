import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ serverEnv: () => ({}) }));

const { toGoogleReviews, getGoogleReviews } = await import("@/lib/google-reviews");

/**
 * What reaches the homepage from Google. Shown only as Google's, attributed and
 * unedited — so the filter is the whole of the editorial decision, and it must
 * not let through anything unattributed or below five stars.
 */
describe("toGoogleReviews", () => {
  const review = (over: Record<string, unknown> = {}) => ({
    rating: 5,
    text: { text: "Translated." },
    originalText: { text: "As written." },
    relativePublishTimeDescription: "2 months ago",
    publishTime: "2026-08-20T10:00:00Z",
    authorAttribution: { displayName: "A. Reviewer", uri: "https://www.google.com/maps/contrib/1" },
    ...over,
  });

  it("keeps five-star reviews in the author's own words, with attribution", () => {
    const result = toGoogleReviews({
      rating: 4.6,
      userRatingCount: 212,
      googleMapsUri: "https://maps.google.com/?cid=1",
      reviews: [review()],
    });
    expect(result).toEqual({
      rating: 4.6,
      count: 212,
      mapsUrl: "https://maps.google.com/?cid=1",
      reviews: [
        {
          author: "A. Reviewer",
          authorUrl: "https://www.google.com/maps/contrib/1",
          text: "As written.",
          when: "2 months ago",
          publishTime: "2026-08-20T10:00:00Z",
        },
      ],
    });
  });

  it("drops anything under five stars, without text, or without an author", () => {
    const result = toGoogleReviews({
      reviews: [
        review({ rating: 4 }),
        review({ text: undefined, originalText: { text: "  " } }),
        review({ authorAttribution: { displayName: "" } }),
        review({ authorAttribution: undefined }),
      ],
    });
    expect(result.reviews).toEqual([]);
  });

  it("falls back to Google's text when there is no original", () => {
    const result = toGoogleReviews({ reviews: [review({ originalText: undefined })] });
    expect(result.reviews[0]?.text).toBe("Translated.");
  });
});

describe("getGoogleReviews", () => {
  it("makes no request when the key or place id is missing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await getGoogleReviews()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
