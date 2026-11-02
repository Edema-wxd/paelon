import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The job route's guard. The publishing itself needs a database and is mocked:
 * what matters here is that nothing runs without the secret.
 */

const env: { JOBS_SECRET?: string; CRON_SECRET?: string } = {};
const publishScheduledPosts = vi.fn();

vi.mock("@/lib/env", () => ({ serverEnv: () => env }));
vi.mock("@/lib/blog/publish-scheduled", () => ({ publishScheduledPosts }));

const { GET, POST } = await import("@/app/api/jobs/publish-scheduled/route");

const SECRET = "job-secret-0123456789abcdef";
const call = (handler: typeof GET, authorization?: string) =>
  handler(
    new NextRequest("http://localhost/api/jobs/publish-scheduled", {
      headers: authorization ? { authorization } : {},
    }),
  );

beforeEach(() => {
  delete env.JOBS_SECRET;
  delete env.CRON_SECRET;
  publishScheduledPosts.mockReset();
  publishScheduledPosts.mockResolvedValue({ today: "2026-11-05", published: [], held: [] });
});

describe("/api/jobs/publish-scheduled", () => {
  it("refuses to run when no secret is configured", async () => {
    const response = await call(GET, `Bearer ${SECRET}`);
    expect(response.status).toBe(503);
    expect(publishScheduledPosts).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong token", async () => {
    env.JOBS_SECRET = SECRET;
    expect((await call(GET)).status).toBe(401);
    expect((await call(GET, "Bearer wrong-secret-0123456789")).status).toBe(401);
    expect(publishScheduledPosts).not.toHaveBeenCalled();
  });

  it("runs for JOBS_SECRET over POST, as system cron calls it", async () => {
    env.JOBS_SECRET = SECRET;
    const response = await call(POST, `Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(publishScheduledPosts).toHaveBeenCalledOnce();
  });

  it("runs for CRON_SECRET over GET, as Vercel Cron calls it", async () => {
    env.CRON_SECRET = SECRET;
    const response = await call(GET, `Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, data: { today: "2026-11-05" } });
  });

  it("reports a failure without leaking it", async () => {
    env.JOBS_SECRET = SECRET;
    publishScheduledPosts.mockRejectedValue(new Error("connection refused at 10.0.0.1"));
    const response = await call(POST, `Bearer ${SECRET}`);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("10.0.0.1");
  });
});
