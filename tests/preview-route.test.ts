import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminUser } from "@/lib/auth/session";

/**
 * `/api/preview` with the session mocked.
 *
 * The two guarantees under test are the ones that make draft mode safe to expose
 * at all: nobody without a session and the right permission can turn it on, and
 * the redirect target can only ever be a page on this site. Both are asserted
 * against `draftMode().enable` — not just the status code — because a response
 * that looks like a refusal while the cookie was already set would pass a
 * status-only test.
 *
 * The resource registry is mocked rather than imported: the real one reaches
 * Drizzle tables through `resources/server.ts`, and none of that is what these
 * tests are about.
 */

const mocks = vi.hoisted(() => ({
  getAdminUser: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  isEnabled: false,
}));

vi.mock("@/lib/auth/session", () => ({
  getAdminUser: mocks.getAdminUser,
}));

vi.mock("next/headers", () => ({
  draftMode: async () => ({
    isEnabled: mocks.isEnabled,
    enable: mocks.enable,
    disable: mocks.disable,
  }),
}));

vi.mock("@/lib/admin/resources", () => ({
  isResourceName: (value: string) =>
    ["services", "doctors", "locations", "hmos"].includes(value),
}));

vi.mock("@/lib/admin/resources/server", () => ({
  RESOURCE_SERVER: {
    services: { permission: "services" },
    doctors: { permission: "doctors" },
    locations: { permission: "locations" },
    hmos: { permission: "hmos" },
  },
}));

const { NextRequest } = await import("next/server");
const { GET } = await import("@/app/api/preview/route");
const { GET: EXIT } = await import("@/app/api/preview/exit/route");
const {
  previewDestinationFor,
  previewHref,
  previewPathFor,
  previewUnavailableReason,
  safePreviewPath,
} = await import("@/lib/preview/target");

const ORIGIN = "http://localhost:3000";

function user(role: AdminUser["role"]): AdminUser {
  return {
    id: "user-1",
    name: "Test",
    email: "test@example.com",
    role,
    roleLabel: role,
  };
}

function previewRequest(query: string): InstanceType<typeof NextRequest> {
  return new NextRequest(`${ORIGIN}/api/preview${query}`);
}

beforeEach(() => {
  mocks.getAdminUser.mockReset();
  mocks.enable.mockReset();
  mocks.disable.mockReset();
  mocks.isEnabled = false;
});

describe("GET /api/preview", () => {
  it("does not enable draft mode for an anonymous request", async () => {
    mocks.getAdminUser.mockResolvedValue(null);

    const response = await GET(
      previewRequest("?resource=services&path=%2Fservices%2Fpaediatrics"),
    );

    expect(mocks.enable).not.toHaveBeenCalled();
    expect(response.status).toBe(307);

    const location = new URL(response.headers.get("location") ?? "", ORIGIN);
    expect(location.pathname).toBe("/admin/login");
    expect(location.searchParams.get("next")).toBe(
      "/api/preview?resource=services&path=%2Fservices%2Fpaediatrics",
    );
  });

  it("refuses a role without read on the resource", async () => {
    mocks.getAdminUser.mockResolvedValue(user("contributor"));

    const response = await GET(
      previewRequest("?resource=services&path=%2Fservices%2Fpaediatrics"),
    );

    expect(response.status).toBe(403);
    expect(mocks.enable).not.toHaveBeenCalled();
  });

  it("refuses an unknown resource", async () => {
    mocks.getAdminUser.mockResolvedValue(user("admin"));

    const response = await GET(previewRequest("?resource=payroll&path=%2F"));

    expect(response.status).toBe(400);
    expect(mocks.enable).not.toHaveBeenCalled();
  });

  it.each([
    ["an absolute URL to another host", "https://evil.example/phish"],
    ["a protocol-relative URL", "//evil.example/phish"],
    ["a backslash-prefixed URL", "/\\evil.example/phish"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a path that escapes to another host", "/../\\/evil.example"],
    ["an admin path", "/admin/services"],
    ["an API path", "/api/booking"],
    ["an empty target", ""],
  ])("refuses %s as a redirect target", async (_label, path) => {
    mocks.getAdminUser.mockResolvedValue(user("admin"));

    const response = await GET(
      previewRequest(`?resource=services&path=${encodeURIComponent(path)}`),
    );

    expect(mocks.enable).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
  });

  it("enables draft mode and redirects to a same-origin path", async () => {
    mocks.getAdminUser.mockResolvedValue(user("editor"));

    const response = await GET(
      previewRequest("?resource=services&path=%2Fservices%2Fpaediatrics"),
    );

    expect(mocks.enable).toHaveBeenCalledOnce();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/services/paediatrics`,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("keeps the query string of the previewed page", async () => {
    mocks.getAdminUser.mockResolvedValue(user("admin"));

    const response = await GET(
      previewRequest(
        `?resource=locations&path=${encodeURIComponent("/locations/victoria-island?view=map")}`,
      ),
    );

    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/locations/victoria-island?view=map`,
    );
  });
});

describe("GET /api/preview/exit", () => {
  it("disables draft mode and returns to the page it was called from", async () => {
    const request = new NextRequest(`${ORIGIN}/api/preview/exit`, {
      headers: { referer: `${ORIGIN}/services/paediatrics` },
    });

    const response = await EXIT(request);

    expect(mocks.disable).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/services/paediatrics`,
    );
  });

  it("ignores a cross-origin referrer and lands on the homepage", async () => {
    const request = new NextRequest(`${ORIGIN}/api/preview/exit`, {
      headers: { referer: "https://evil.example/phish" },
    });

    const response = await EXIT(request);

    expect(mocks.disable).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBe(`${ORIGIN}/`);
  });

  it("needs no session — leaving a preview is never privileged", async () => {
    mocks.getAdminUser.mockResolvedValue(null);

    const response = await EXIT(new NextRequest(`${ORIGIN}/api/preview/exit`));

    expect(mocks.disable).toHaveBeenCalledOnce();
    expect(response.status).toBe(307);
  });
});

describe("safePreviewPath", () => {
  it("normalises a relative path and keeps query and fragment", () => {
    expect(safePreviewPath("/blog/malaria?utm=x#body")).toBe(
      "/blog/malaria?utm=x#body",
    );
  });

  it("resolves traversal without climbing off the site", () => {
    expect(safePreviewPath("/services/../locations")).toBe("/locations");
  });

  it("refuses a path that normalises into a protocol-relative URL", () => {
    // `////evil.example` after normalisation: same-origin against a dummy
    // base, another host once resolved against the site.
    expect(safePreviewPath("/../\\/evil.example")).toBeNull();
    expect(safePreviewPath("/..//evil.example")).toBeNull();
  });

  it("refuses a path longer than the limit", () => {
    expect(safePreviewPath(`/${"a".repeat(512)}`)).toBeNull();
  });

  it("refuses control characters that could split a header", () => {
    expect(safePreviewPath("/services\r\nLocation: https://evil.example")).toBeNull();
  });
});

describe("preview targets", () => {
  it("previews a doctor on their own profile", () => {
    expect(previewPathFor("doctors", { slug: "ngozi-onyia" })).toBe(
      "/doctors/ngozi-onyia",
    );
    expect(previewDestinationFor("doctors")).toBe("the doctor's profile");
    expect(previewUnavailableReason("doctors")).toBeNull();
  });

  it("previews a service and a branch on their detail routes", () => {
    expect(previewPathFor("services", { slug: "paediatrics" })).toBe(
      "/services/paediatrics",
    );
    expect(previewPathFor("locations", { slug: "victoria-island" })).toBe(
      "/locations/victoria-island",
    );
  });

  it("previews types without a route of their own on the page that shows them", () => {
    expect(previewPathFor("hmos", { slug: "axa-mansard" })).toBe("/");
    expect(previewPathFor("awards", { slug: "safecare-5-star" })).toBe("/about");
  });

  it("gives no target, and a reason, for a type that appears on many pages", () => {
    expect(previewPathFor("faqs", { slug: "how-do-i-book" })).toBeNull();
    expect(previewUnavailableReason("faqs")).toMatch(/homepage/);
    expect(previewPathFor("testimonials", { slug: "sarah-adenuga" })).toBeNull();
    expect(previewUnavailableReason("testimonials")).toMatch(/homepage/);
  });

  it("gives no target for a row with no usable slug", () => {
    // A row mid-creation, or one whose slug column is somehow blank. The button
    // is hidden rather than pointing at `/doctors/`.
    expect(previewPathFor("doctors", {})).toBeNull();
    expect(previewPathFor("doctors", { slug: "   " })).toBeNull();
  });

  it("encodes the slug into the preview href", () => {
    expect(previewHref("doctors", "/doctors/a-b")).toBe(
      "/api/preview?resource=doctors&path=%2Fdoctors%2Fa-b",
    );
  });
});
