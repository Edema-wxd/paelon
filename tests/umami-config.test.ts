import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * When the site records visits. The cases that matter are the ones that must
 * not: a half-configured build, and a local one whose visits would otherwise
 * land in Paelon's real figures.
 */

const env = vi.hoisted(() => ({
  clientEnv: {
    NEXT_PUBLIC_UMAMI_SCRIPT_URL: undefined as string | undefined,
    NEXT_PUBLIC_UMAMI_WEBSITE_ID: undefined as string | undefined,
    NEXT_PUBLIC_SITE_URL: "https://paelon.vercel.app",
  },
}));

vi.mock("@/lib/env", () => env);

const { umamiConfig } = await import("@/lib/analytics/umami-config");

const SCRIPT = "https://cloud.umami.is/script.js";
const ID = "ea5479bc-ea67-493d-b03a-3750bb409eea";

beforeEach(() => {
  env.clientEnv.NEXT_PUBLIC_UMAMI_SCRIPT_URL = SCRIPT;
  env.clientEnv.NEXT_PUBLIC_UMAMI_WEBSITE_ID = ID;
  env.clientEnv.NEXT_PUBLIC_SITE_URL = "https://paelon.vercel.app";
});

describe("umamiConfig", () => {
  it("tracks the public site host only", () => {
    expect(umamiConfig()).toEqual({ src: SCRIPT, websiteId: ID, host: "paelon.vercel.app" });
  });

  it("tracks nothing without both variables", () => {
    env.clientEnv.NEXT_PUBLIC_UMAMI_WEBSITE_ID = undefined;
    expect(umamiConfig()).toBeNull();
    env.clientEnv.NEXT_PUBLIC_UMAMI_WEBSITE_ID = ID;
    env.clientEnv.NEXT_PUBLIC_UMAMI_SCRIPT_URL = undefined;
    expect(umamiConfig()).toBeNull();
  });

  it("tracks nothing on a local build", () => {
    for (const url of ["http://localhost:3000", "http://127.0.0.1:3100"]) {
      env.clientEnv.NEXT_PUBLIC_SITE_URL = url;
      expect(umamiConfig()).toBeNull();
    }
  });
});
