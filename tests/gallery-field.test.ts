import { describe, expect, it } from "vitest";

import { galleryField } from "@/lib/admin/resources/fields";
import { resourceInput } from "@/lib/admin/resource-input";
import {
  LOCATION_GALLERY_FIELD,
  locationResource,
} from "@/lib/admin/resources/locations";
import {
  SERVICE_GALLERY_FIELD,
  serviceResource,
  serviceSchema,
} from "@/lib/admin/resources/services";

/**
 * The gallery field: a list of `media` ids whose order is the content.
 *
 * Order is the whole point, so most of this is about order surviving — through
 * the schema, and through `resourceInput`'s `getAll`. The join-table write that
 * turns the index into a stored `order` is covered against a real database in
 * `tests/integration/content-crud.test.ts`.
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("galleryField", () => {
  it("keeps the submitted order", () => {
    expect(galleryField().parse([C, A, B])).toEqual([C, A, B]);
  });

  it("reads an absent field as an empty gallery", () => {
    expect(galleryField().parse(undefined)).toEqual([]);
  });

  it("reads a single value as a one-image gallery", () => {
    // A form with one hidden input submits a string, not an array.
    expect(galleryField().parse(A)).toEqual([A]);
  });

  it("collapses a duplicate onto its first position", () => {
    // Not onto its last: an editor who added the same picture twice expects the
    // first one to stay put rather than the rest to shuffle up.
    expect(galleryField().parse([A, B, A, C])).toEqual([A, B, C]);
  });

  it("drops blank entries", () => {
    expect(galleryField().parse([A, "", "  ", B])).toEqual([A, B]);
  });

  it("rejects anything that is not a uuid", () => {
    const result = galleryField().safeParse([A, "https://cdn.example.test/x.png"]);
    expect(result.success).toBe(false);
  });

  it("refuses more images than the cap", () => {
    const many = Array.from(
      { length: 5 },
      (_, i) => `1111111${i}-1111-4111-8111-111111111111`,
    );
    expect(galleryField(3).safeParse(many).success).toBe(false);
    expect(galleryField(5).safeParse(many).success).toBe(true);
  });

  it("counts the cap after deduping, not before", () => {
    // Three inputs naming two assets is a two-image gallery.
    expect(galleryField(3).safeParse([A, B, A]).success).toBe(true);
  });
});

describe("resourceInput — gallery fields", () => {
  it("reads every hidden input, in document order", () => {
    const formData = new FormData();
    for (const id of [C, A, B]) formData.append(SERVICE_GALLERY_FIELD, id);

    const input = resourceInput(serviceResource, formData);
    expect(input[SERVICE_GALLERY_FIELD]).toEqual([C, A, B]);
  });

  it("reads an untouched gallery as an empty array, never undefined", () => {
    const input = resourceInput(serviceResource, new FormData());
    expect(input[SERVICE_GALLERY_FIELD]).toEqual([]);
  });

  it("does the same for the branch gallery", () => {
    const formData = new FormData();
    formData.append(LOCATION_GALLERY_FIELD, B);
    formData.append(LOCATION_GALLERY_FIELD, A);

    const input = resourceInput(locationResource, formData);
    expect(input[LOCATION_GALLERY_FIELD]).toEqual([B, A]);
  });
});

describe("serviceSchema — gallery", () => {
  /** The rest of the service form, so the gallery is the only variable. */
  const base = {
    name: "Placeholder",
    slug: "placeholder",
    family: "specialist",
    shortDescription: "Placeholder.",
    longDescription: "Placeholder.",
    whatToExpect: "Placeholder.",
    typicalWaitTime: "",
    whoItsFor: [],
    howToAccess: [],
    order: "0",
    published: "on",
    featuredImageId: "",
    featuredImageAlt: "",
  };

  it("accepts a service with no gallery", () => {
    expect(serviceSchema.safeParse(base).success).toBe(true);
  });

  it("carries the arranged order through the whole form schema", () => {
    const parsed = serviceSchema.parse({
      ...base,
      [SERVICE_GALLERY_FIELD]: [B, C, A],
    });
    expect(
      (parsed as unknown as Record<string, unknown>)[SERVICE_GALLERY_FIELD],
    ).toEqual([B, C, A]);
  });
});
