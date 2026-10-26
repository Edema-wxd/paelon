import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `recordUpload` inserts null alt text ("not written yet", migration 0009) and,
 * on a database where 0009 has not been applied, falls back to "" rather than
 * failing the upload. Any other error must still surface.
 */

const calls: Array<string | null> = [];
let failWith: unknown = null;

vi.mock("@/lib/db/client", () => ({
  db: () => ({
    insert: () => ({
      values: (values: { alt: string | null }) => ({
        onConflictDoUpdate: () => ({
          returning: async () => {
            calls.push(values.alt);
            if (values.alt === null && failWith) throw failWith;
            return [{ id: "m1", alt: values.alt }];
          },
        }),
      }),
    }),
  }),
}));

const { recordUpload } = await import("@/lib/db/queries/media");

const input = { key: "k", url: "https://x.ufs.sh/f/k", filename: "a.png", uploadedBy: null };

beforeEach(() => {
  calls.length = 0;
  failWith = null;
});

describe("recordUpload", () => {
  it("stores null alt text once the column allows it", async () => {
    const row = await recordUpload(input);
    expect(calls).toEqual([null]);
    expect(row.alt).toBeNull();
  });

  it("falls back to '' while media.alt is still NOT NULL", async () => {
    failWith = Object.assign(new Error("query failed"), {
      cause: Object.assign(new Error("null value in column \"alt\""), { code: "23502" }),
    });
    const row = await recordUpload(input);
    expect(calls).toEqual([null, ""]);
    expect(row.alt).toBe("");
  });

  it("does not swallow any other database error", async () => {
    failWith = Object.assign(new Error("connection reset"), { code: "08006" });
    await expect(recordUpload(input)).rejects.toThrow("connection reset");
    expect(calls).toEqual([null]);
  });
});
