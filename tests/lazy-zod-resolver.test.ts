import { zodResolver } from "@hookform/resolvers/zod";
import type { ResolverOptions } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { lazyZodResolver } from "@/lib/forms/lazy-zod-resolver";
import { newsletterSchema, type NewsletterInput } from "@/lib/validation/newsletter";

const options = { fields: {}, shouldUseNativeValidation: false } as ResolverOptions<NewsletterInput>;
const bad = { email: "nope", consentNdpr: false as unknown as true };
const good = { email: " Ada@Example.com ", consentNdpr: true as const };

describe("lazyZodResolver", () => {
  it("validates with the loaded schema, errors and transforms included", async () => {
    const { resolver } = lazyZodResolver(async () => zodResolver(newsletterSchema));

    const failed = await resolver(bad, undefined, options);
    expect(failed.errors.email?.message).toBe("Enter a valid email address.");
    expect(failed.errors.consentNdpr?.message).toBe("Please confirm you agree to the privacy policy.");

    const passed = await resolver(good, undefined, options);
    expect(passed.errors).toEqual({});
    expect(passed.values).toMatchObject({ email: "ada@example.com" });
  });

  it("downloads once, however often it validates or preloads", async () => {
    const load = vi.fn(async () => zodResolver(newsletterSchema));
    const { resolver, preload } = lazyZodResolver(load);

    preload();
    await resolver(good, undefined, options);
    await resolver(bad, undefined, options);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("falls back to the server when the chunk cannot load, then retries", async () => {
    const real = zodResolver(newsletterSchema);
    const load = vi
      .fn<() => Promise<typeof real>>()
      .mockRejectedValueOnce(new Error("ChunkLoadError"))
      .mockResolvedValue(real);
    const { resolver } = lazyZodResolver(load);

    // No client validation, but the values still go through to the server.
    const fallback = await resolver(bad, undefined, options);
    expect(fallback.errors).toEqual({});
    expect(fallback.values).toEqual(bad);

    // The failure was not cached: the next attempt loads and validates.
    const retried = await resolver(bad, undefined, options);
    expect(retried.errors.email).toBeDefined();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
