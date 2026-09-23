import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { AdminUser } from "@/lib/auth/session";

/**
 * `adminAction` with the session, the database, the cache and the request
 * headers mocked. What is under test is the order of checks and what each
 * path is allowed to touch — a refused or invalid call must not reach the
 * handler, the audit log or the cache.
 */

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  writeAuditEntry: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  findMediaReferences: vi.fn(),
  deleteMedia: vi.fn(),
}));

vi.mock("@/lib/db/queries/media-references", () => ({
  findMediaReferences: mocks.findMediaReferences,
}));

vi.mock("@/lib/uploadthing/api", () => ({
  deleteMedia: mocks.deleteMedia,
}));

vi.mock("@/lib/auth/session", () => ({
  requireAdminUser: mocks.requireAdminUser,
}));

vi.mock("@/lib/db/queries/users", () => ({
  writeAuditEntry: mocks.writeAuditEntry,
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }),
}));

const { adminAction, done, fail, DENIED_MESSAGE, INVALID_MESSAGE, MISSING_MESSAGE } =
  await import("@/lib/admin/action");
const { writeAudit } = await import("@/lib/admin/audit");
const { hashIdentifier } = await import("@/lib/rate-limit");
const { deleteMediaAction } = await import("@/lib/uploadthing/actions");

const POST_ID = "7f1c1c52-8a1e-4a8e-9d3b-2f6f5f0c9a11";

function user(role: AdminUser["role"], id = "user-1"): AdminUser {
  return { id, name: "Test", email: "test@example.com", role, roleLabel: role };
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const schema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1, "Enter a title."),
});

function buildAction(options: {
  owner?: string | null;
  handlerResult?: "done" | "fail";
} = {}) {
  const handler = vi.fn(async (input: z.output<typeof schema>) =>
    options.handlerResult === "fail"
      ? fail("That post is locked.")
      : done(
          { message: `Saved ${input.title}.` },
          { entityId: input.id, metadata: { published: false } },
        ),
  );
  const row = vi.fn(async () =>
    options.owner === null ? null : { createdByUserId: options.owner ?? "user-1" },
  );
  const parse = vi.spyOn(schema, "safeParse");

  const action = adminAction(
    {
      resource: "blog_posts",
      action: "update",
      schema,
      event: "blog_post.updated",
      tag: (input) => ["blog-posts", `blog-post:${input.id}`],
      path: "/admin/blog",
      row,
    },
    handler,
  );

  return { action, handler, row, parse };
}

function expectNoSideEffects() {
  expect(mocks.writeAuditEntry).not.toHaveBeenCalled();
  expect(mocks.revalidateTag).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("adminAction — denied", () => {
  it("refuses a role without the permission before parsing anything", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("contributor"));
    const handler = vi.fn();
    const parse = vi.spyOn(schema, "safeParse");
    const action = adminAction(
      { resource: "services", action: "update", schema },
      handler,
    );

    const result = await action(null, form({ id: "not-a-uuid" }));

    expect(result).toEqual({ ok: false, error: DENIED_MESSAGE, fields: {} });
    expect(parse).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expectNoSideEffects();
  });

  it("refuses an ownership-scoped grant before parsing when there is no row loader", async () => {
    // A contributor may update *their own* blog posts. With no `row` loader the
    // wrapper cannot know whose post this is, so it must refuse up front rather
    // than validate first and refuse later.
    mocks.requireAdminUser.mockResolvedValue(user("contributor"));
    const handler = vi.fn();
    const parse = vi.spyOn(schema, "safeParse");
    const action = adminAction(
      { resource: "blog_posts", action: "update", schema },
      handler,
    );

    const result = await action(null, form({}));

    expect(result).toEqual({ ok: false, error: DENIED_MESSAGE, fields: {} });
    expect(parse).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expectNoSideEffects();
  });

  it("still lets a contributor create without a row loader", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("contributor"));
    const action = adminAction(
      { resource: "blog_posts", action: "create", schema },
      async (input) => done(null, { entityId: input.id }),
    );

    const result = await action(null, form({ id: POST_ID, title: "Hello" }));

    expect(result).toEqual({ ok: true, data: null });
  });

  it("refuses a contributor on a row someone else owns", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("contributor"));
    const { action, handler, row } = buildAction({ owner: "someone-else" });

    const result = await action(null, form({ id: POST_ID, title: "Hello" }));

    expect(result).toEqual({ ok: false, error: DENIED_MESSAGE, fields: {} });
    expect(row).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
    expectNoSideEffects();
  });

  it("reports a missing row without running the handler", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor"));
    const { action, handler } = buildAction({ owner: null });

    const result = await action(null, form({ id: POST_ID, title: "Hello" }));

    expect(result).toEqual({ ok: false, error: MISSING_MESSAGE, fields: {} });
    expect(handler).not.toHaveBeenCalled();
    expectNoSideEffects();
  });

  it("never names a role in the refusal", () => {
    expect(DENIED_MESSAGE).not.toMatch(/admin|editor|contributor/i);
  });

  it("lets a signed-out redirect propagate", async () => {
    const redirect = new Error("NEXT_REDIRECT");
    mocks.requireAdminUser.mockRejectedValue(redirect);
    const { action, handler } = buildAction();

    await expect(action(null, form({ id: POST_ID, title: "Hello" }))).rejects.toBe(redirect);
    expect(handler).not.toHaveBeenCalled();
    expectNoSideEffects();
  });
});

describe("adminAction — invalid", () => {
  it("returns field errors and does not load the row or run the handler", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor"));
    const { action, handler, row } = buildAction();

    const result = await action(null, form({ id: "nope", title: "   " }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(INVALID_MESSAGE);
    expect(result.fields.title).toEqual(["Enter a title."]);
    expect(result.fields.id?.length).toBeGreaterThan(0);
    expect(row).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expectNoSideEffects();
  });
});

describe("adminAction — handler refusal", () => {
  it("returns the handler's failure without auditing or revalidating", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor"));
    const { action, handler } = buildAction({ handlerResult: "fail" });

    const result = await action(null, form({ id: POST_ID, title: "Hello" }));

    expect(result).toEqual({ ok: false, error: "That post is locked.", fields: {} });
    expect(handler).toHaveBeenCalledOnce();
    expectNoSideEffects();
  });
});

describe("adminAction — success", () => {
  it("runs the handler, writes one audit row with a hashed IP, then revalidates", async () => {
    const actor = user("contributor", "user-1");
    mocks.requireAdminUser.mockResolvedValue(actor);
    const { action, handler } = buildAction({ owner: "user-1" });

    const result = await action(null, form({ id: POST_ID, title: "  Hello  " }));

    expect(result).toEqual({ ok: true, data: { message: "Saved Hello." } });
    expect(handler).toHaveBeenCalledWith({ id: POST_ID, title: "Hello" }, { user: actor });

    expect(mocks.writeAuditEntry).toHaveBeenCalledOnce();
    expect(mocks.writeAuditEntry).toHaveBeenCalledWith({
      userId: "user-1",
      action: "blog_post.updated",
      entityType: "blog_posts",
      entityId: POST_ID,
      metadata: { published: false },
      ipAddress: hashIdentifier("203.0.113.9"),
    });
    const stored = mocks.writeAuditEntry.mock.calls[0]?.[0] as { ipAddress: string };
    expect(stored.ipAddress).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.ipAddress).not.toContain("203.0.113.9");

    expect(mocks.revalidateTag).toHaveBeenCalledWith("blog-posts");
    expect(mocks.revalidateTag).toHaveBeenCalledWith(`blog-post:${POST_ID}`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/blog");
  });

  it("defaults the audit event to resource.action", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("admin"));
    const action = adminAction(
      { resource: "faqs", action: "create", schema: z.object({ q: z.string() }) },
      async () => done(null),
    );

    const result = await action(null, form({ q: "Where?" }));

    expect(result).toEqual({ ok: true, data: null });
    expect(mocks.writeAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: "faqs.create", entityId: null, metadata: {} }),
    );
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("deleteMediaAction", () => {
  it("refuses a contributor before validating the key count", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("contributor"));

    // Zero keys would be a field error for anyone allowed to delete.
    const result = await deleteMediaAction(null, form({}));

    expect(result).toEqual({ ok: false, error: DENIED_MESSAGE, fields: {} });
    expect(mocks.findMediaReferences).not.toHaveBeenCalled();
    expect(mocks.deleteMedia).not.toHaveBeenCalled();
    expectNoSideEffects();
  });

  it("gives an editor the key-count field error", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor"));

    const result = await deleteMediaAction(null, form({}));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields.keys?.length).toBeGreaterThan(0);
    expect(mocks.deleteMedia).not.toHaveBeenCalled();
  });
});

describe("writeAudit", () => {
  it("strips personal data from metadata and never stores the raw IP", async () => {
    await writeAudit({
      userId: "user-1",
      action: "user.created",
      entityType: "users",
      entityId: POST_ID,
      metadata: {
        role: "editor",
        email: "someone@example.com",
        patient_phone: "+2348000000000",
        passwordHash: "x",
        name: "Someone",
        ip: "203.0.113.9",
        count: 2,
      },
      ip: "203.0.113.9",
    });

    expect(mocks.writeAuditEntry).toHaveBeenCalledWith({
      userId: "user-1",
      action: "user.created",
      entityType: "users",
      entityId: POST_ID,
      metadata: { role: "editor", count: 2 },
      ipAddress: hashIdentifier("203.0.113.9"),
    });
  });

  it("stores no IP when none is known", async () => {
    await writeAudit({ userId: null, action: "x.y", entityType: "media" });

    expect(mocks.writeAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: null, metadata: {} }),
    );
  });
});
