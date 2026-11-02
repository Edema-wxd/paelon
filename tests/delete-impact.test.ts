import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  hrefLinksTo,
  linkTargetFor,
  markdownLinksTo,
  nameList,
  refusalMessage,
} from "@/lib/admin/delete-impact";
import type { AdminUser } from "@/lib/auth/session";

/**
 * The pre-delete check: which links count as pointing at a row, how a refusal
 * reads, and that the delete action refuses on a blocker rather than trusting
 * the disabled button. The queries themselves are thin reads; what they feed
 * is decided here.
 */

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  writeAuditEntry: vi.fn(),
  getContentOwner: vi.fn(),
  softDeleteContent: vi.fn(),
  getDeleteImpact: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/db/queries/users", () => ({ writeAuditEntry: mocks.writeAuditEntry }));
vi.mock("@/lib/db/queries/media", () => ({ setMediaAlt: vi.fn() }));
vi.mock("@/lib/db/queries/content-crud", () => ({
  isSlugTaken: vi.fn(),
  getContentOwner: mocks.getContentOwner,
  getContentById: vi.fn(),
  createContentWithRelations: vi.fn(),
  updateContentWithRelations: vi.fn(),
  softDeleteContent: mocks.softDeleteContent,
}));
vi.mock("@/lib/admin/delete-checks", () => ({ getDeleteImpact: mocks.getDeleteImpact }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const actions = await import("@/lib/admin/resource-actions");

const ROW_ID = "9c1f2a3b-4d5e-4f60-8a71-b2c3d4e5f607";

function admin(): AdminUser {
  return { id: "actor-1", name: "Staff", email: "staff@example.test", role: "admin", roleLabel: "admin" };
}

function idForm(): FormData {
  const data = new FormData();
  data.append("id", ROW_ID);
  return data;
}

describe("linkTargetFor", () => {
  it("names the public page and the booking deep link for a service", () => {
    expect(linkTargetFor("services", "cardiology")).toEqual({
      paths: ["/services/cardiology"],
      book: { param: "service", slug: "cardiology" },
    });
  });

  it("uses the branch parameter for a location", () => {
    expect(linkTargetFor("locations", "victoria-island")?.book).toEqual({
      param: "branch",
      slug: "victoria-island",
    });
  });

  it("has no target for a type without a page of its own", () => {
    for (const resource of ["hmos", "testimonials", "awards", "faqs", "authors"]) {
      expect(linkTargetFor(resource, "x")).toBeNull();
    }
  });
});

describe("hrefLinksTo", () => {
  const service = linkTargetFor("services", "cardiology")!;

  it("matches the page with a fragment, query or trailing slash", () => {
    expect(hrefLinksTo("/services/cardiology", service)).toBe(true);
    expect(hrefLinksTo("/services/cardiology/#fees", service)).toBe(true);
    expect(hrefLinksTo("/services/cardiology?utm=x", service)).toBe(true);
  });

  it("does not match a slug that merely starts the same", () => {
    expect(hrefLinksTo("/services/cardiology-clinic", service)).toBe(false);
  });

  it("matches a booking deep link on its own parameter only", () => {
    expect(hrefLinksTo("/book?service=cardiology", service)).toBe(true);
    expect(hrefLinksTo("/book?branch=cardiology", service)).toBe(false);
    expect(hrefLinksTo("/book?service=cardiology-clinic", service)).toBe(false);
    expect(hrefLinksTo("/book", service)).toBe(false);
  });

  it("ignores external and protocol-relative links", () => {
    expect(hrefLinksTo("https://example.test/services/cardiology", service)).toBe(false);
    expect(hrefLinksTo("//example.test/services/cardiology", service)).toBe(false);
  });
});

describe("markdownLinksTo", () => {
  const post = linkTargetFor("blog", "heart-health")!;

  it("finds a link inside a sentence", () => {
    expect(markdownLinksTo("Read our [guide to heart health](/blog/heart-health) first.", post)).toBe(true);
  });

  it("does not count the slug mentioned in prose", () => {
    expect(markdownLinksTo("The heart-health post is at /blog/heart-health.", post)).toBe(false);
  });
});

describe("nameList", () => {
  it("joins two names with and", () => {
    expect(nameList(["A", "B"])).toBe("“A” and “B”");
  });

  it("counts the rest past the limit", () => {
    expect(nameList(["A", "B", "C", "D", "E"])).toBe("“A”, “B”, “C” and 2 more");
  });
});

describe("refusalMessage", () => {
  it("allows a delete with effects but no blockers", () => {
    expect(
      refusalMessage("Service", { blockers: [], effects: [{ title: "x", detail: "y" }] }),
    ).toBeNull();
  });

  it("names every blocker, keeping an acronym in capitals", () => {
    const message = refusalMessage("FAQ", {
      blockers: [
        { title: "a", detail: "First reason." },
        { title: "b", detail: "Second reason." },
      ],
      effects: [],
    });
    expect(message).toBe("This FAQ can’t be deleted yet. First reason. Second reason.");
  });
});

describe("the delete action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue(admin());
    mocks.getContentOwner.mockResolvedValue({ createdByUserId: "actor-1" });
    mocks.softDeleteContent.mockResolvedValue(true);
  });

  it("refuses while a blocker stands, and deletes nothing", async () => {
    mocks.getDeleteImpact.mockResolvedValue({
      blockers: [{ title: "Last branch", detail: "It is the only published branch." }],
      effects: [],
    });

    const result = await actions.deleteLocationAction(null, idForm());

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("only published branch");
    expect(mocks.getDeleteImpact).toHaveBeenCalledWith("locations", ROW_ID);
    expect(mocks.softDeleteContent).not.toHaveBeenCalled();
  });

  it("deletes when there are only effects", async () => {
    mocks.getDeleteImpact.mockResolvedValue({
      blockers: [],
      effects: [{ title: "Homepage", detail: "The next post takes its place." }],
    });

    const result = await actions.deleteBlogPostAction(null, idForm());

    expect(result.ok).toBe(true);
    expect(mocks.softDeleteContent).toHaveBeenCalledTimes(1);
  });
});
