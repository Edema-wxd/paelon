import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

import { expect, test, type Page } from "@playwright/test";

import { E2E_ADMIN } from "@/lib/db/e2e-fixture-account";

/**
 * The admin booking workflow, end to end (spec §8).
 *
 * Signs in through the real login form, opens a booking from the queue, moves
 * it `new → contacted` with a note, and asserts the timeline records the move
 * against the actor's name. That last assertion is the point of the spec: a
 * workflow that changes a status without recording who changed it is worse than
 * no workflow, because the audit trail then lies by omission.
 *
 * The account is a fixture created by `lib/db/seed-e2e-admin.ts`, on the
 * reserved `.test` TLD, with a password that is a literal in the repository and
 * unlocks nothing else. Read the guards at the top of that module before
 * changing anything here — and never run this against production.
 *
 * Like the other specs this asserts structure and contracts, not copy. It also
 * writes: a `bookings` row, a `booking_status_history` row, a `users` row and
 * the `booking.viewed` audit entries the detail page records on every open.
 */

/*
 * Well past Playwright's 30s default, which this spec cannot live inside: the
 * `beforeAll` seeding is a cold `tsx` start plus an argon2 hash plus a
 * transactional insert against a remote Neon branch, and each test then signs in
 * (argon2 again) and makes the dev server compile `/admin`, `/admin/bookings`
 * and `/admin/bookings/[id]` on first visit. Under a full parallel suite run
 * that is comfortably more than 30s of machine, and none of it is the behaviour
 * under test.
 */
test.describe.configure({ timeout: 120_000 });

/** The reference of the booking the seeding script created, or null if none. */
let bookingReference: string | null = null;

/**
 * Run the seeding script and read the JSON line it prints.
 *
 * A subprocess rather than an import: Playwright does not apply the tsconfig
 * `@/*` mapping to a test's transitive imports, so importing the script's
 * dependencies here fails on `@/lib/env` inside `lib/db/client.ts`. Running it
 * under `tsx` also gets `.env.local` loaded, which the Playwright process itself
 * never does — `webServer` loads it for `next dev`, not for us.
 */
test.beforeAll(async () => {
  const envFile = ".env.local";
  const { stdout } = await promisify(execFile)(
    "node",
    [
      ...(existsSync(envFile) ? [`--env-file=${envFile}`] : []),
      "./node_modules/.bin/tsx",
      "lib/db/seed-e2e-admin.ts",
    ],
    // argon2 is deliberately slow, and this is a cold `tsx` start plus a
    // transactional insert against a remote Neon branch.
    { timeout: 60_000 },
  );

  const parsed = JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}") as {
    bookingReference?: string | null;
  };
  bookingReference = parsed.bookingReference ?? null;
});

/** Sign in through the form, as a member of staff actually would. */
async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Email address").fill(E2E_ADMIN.email);
  await page.getByLabel("Password").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  /*
   * The dashboard names the signed-in user, and the shell carries the admin nav.
   * Asserting on those rather than on the URL alone: a URL pattern is happy with
   * any app that happens to be answering on this port, which is exactly how a
   * stale dev server from another project turns this spec green while testing
   * nothing. Generous timeouts because argon2 is deliberately slow
   * (lib/auth/password.ts) and the dev server has not compiled `/admin` yet.
   */
  await expect(page.getByRole("navigation", { name: "Admin" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("heading", { level: 1, name: `Signed in as ${E2E_ADMIN.name}` }),
  ).toBeVisible();
}

test.describe("admin booking workflow", () => {
  test("signing in reaches the dashboard, not the login form", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("link", { name: "Bookings" })).toBeVisible();
  });

  test("moving a booking to contacted records the actor in the timeline", async ({
    page,
  }) => {
    test.skip(
      bookingReference === null,
      "No branch is published, so no booking could be seeded.",
    );
    const reference = bookingReference as string;

    await signIn(page);

    /*
     * Sort carried in the URL, deliberately. The queue's default is
     * `preferredDate` *ascending* (DEFAULT_BOOKING_SORT), so on a development
     * database that has accumulated a few hundred bookings a freshly created one
     * sits well past the 25-row first page — which is exactly how this spec used
     * to fail, intermittently, as the row count grew. Newest-first puts it on
     * page 1 no matter how large the table gets.
     */
    await page.goto("/admin/bookings?sort=createdAt&dir=desc");

    /*
     * Found by reference rather than by taking the first row: `booking.e2e.ts`
     * and the other Playwright workers insert bookings in parallel, so "the top
     * row" is a race. Newest-first only has to put it on the page.
     */
    const row = page.getByRole("link", { name: reference });
    // 30s, like the sign-in: with the whole suite running in parallel this is
    // the dev server compiling `/admin/bookings` for the first time, and the
    // default 5s times out the run rather than the query.
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();

    await expect(
      page.getByRole("heading", { level: 1, name: reference }),
    ).toBeVisible({ timeout: 30_000 });

    // `reason_for_visit` is shown here and on no other screen (§8).
    await expect(page.getByText("Reason for visit")).toBeVisible();

    const note = "Rang the patient and agreed a time.";
    const status = page.getByRole("region", { name: "Status" });
    await status.getByLabel("Move to").selectOption("contacted");
    await status.getByLabel(/^Note/).fill(note);
    await status.getByRole("button", { name: "Update status" }).click();

    // The result is announced, not merely rendered — the control that changed
    // the record is nowhere near the timeline that shows it.
    await expect(status.getByText("Status updated.")).toBeVisible({
      timeout: 15_000,
    });

    /*
     * The timeline is the assertion. Two entries now: the website's own
     * "Booking received as New", then this move — attributed to the signed-in
     * admin by name, with the note that explains it.
     */
    const timeline = page.getByRole("region", { name: "Timeline" });
    const entries = timeline.getByRole("listitem");
    await expect(entries).toHaveCount(2);

    const latest = entries.last();
    await expect(latest).toContainText("New → Contacted");
    await expect(latest).toContainText(E2E_ADMIN.name);
    await expect(latest).toContainText(note);

    // And it survives a reload: the move is in the database, not in component
    // state that a refresh would discard.
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Timeline" }).getByRole("listitem").last(),
    ).toContainText(E2E_ADMIN.name);
  });
});
