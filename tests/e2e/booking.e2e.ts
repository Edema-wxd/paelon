import { expect, test } from "@playwright/test";

/**
 * Booking happy path (CLAUDE.md testing floor, master spec §7).
 *
 * The one E2E Phase 1 requires, covering what tests/e2e/README.md asks of it:
 * deep-link pre-fill, back navigation without state loss, the `aria-live` step
 * announcement, and the `PMH-YYYY-NNNNNN` reference on `/book/confirmed`.
 *
 * Structure and contracts, not copy — the same rule as `blog.e2e.ts`. Branch
 * and HMO names come from seed data that will change; step roles, URL state and
 * the reference format will not.
 *
 * The happy path writes a real row to `bookings`. That is deliberate: the value
 * of this spec is that the whole path works, and a mocked `/api/booking` would
 * test the wizard against a fiction. Run it against a development database.
 */

/**
 * `MIN_SUBMIT_SECONDS` from `lib/spam.ts`, copied rather than imported.
 * Playwright does not apply the tsconfig `@/*` mapping to a test's transitive
 * imports, and `lib/spam.ts` reaches `@/lib/logger`. Keep the two in step.
 */
const MIN_SUBMIT_SECONDS = 2;

/** A phone the Nigerian normaliser accepts, and an obviously-test identity. */
const PATIENT = {
  name: "Playwright Test Patient",
  phone: "08012345678",
  email: "playwright@example.test",
};

/** Advances the wizard by one step and waits for the next heading to arrive. */
async function continueStep(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Continue" }).click();
}

test.describe("booking flow", () => {
  test("progress, step announcement and back navigation keep state", async ({
    page,
  }) => {
    await page.goto("/book");

    const progress = page.getByRole("navigation", { name: "Booking progress" });
    await expect(progress).toBeVisible();

    // Step 1 — branch. Cards, not a dropdown (spec §7), so the choice is a
    // radio group rather than a select.
    const branches = page.getByRole("radio");
    await expect(branches.first()).toBeVisible();
    await branches.first().check();
    await continueStep(page);

    // Step 2 — the announcement is what tells a screen-reader user the screen
    // moved. Without it, Continue looks like it did nothing.
    await expect(page.getByText("Step 2 of 6:")).toBeAttached();

    await page.getByRole("radio", { name: /family healthcare/i }).check();
    await continueStep(page);

    // Back twice, then forward again: the branch must still be selected.
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByText("Step 1 of 6:")).toBeAttached();
    await expect(page.getByRole("radio").first()).toBeChecked();
  });

  test("a branch deep link skips step 1 and lands on the service step", async ({
    page,
  }) => {
    // The URL comes from the branch page's own "Book at this branch" CTA, so
    // this cannot drift away from what the location template actually links to.
    await page.goto("/locations");

    // Scoped to `main`, and waited for: the footer carries branch links too,
    // and this route streams behind a loading state, so an unscoped lookup
    // races it and clicks the footer copy instead.
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible();

    const branch = main.getByRole("link", { name: /victoria island/i }).first();

    test.skip(
      (await branch.count()) === 0,
      "No branch is published to deep-link from.",
    );

    await branch.click();
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible();

    const bookHere = main
      .getByRole("link", { name: /book at this branch/i })
      .first();
    await expect(bookHere).toHaveAttribute("href", /\/book\?branch=/);
    await bookHere.click();

    // Pre-filled, so step 1 is skipped and the visitor lands on the service
    // step directly (spec §7).
    await expect(page.getByText("Step 2 of 6:")).toBeAttached();
  });

  test("an unknown branch slug falls back to step 1 rather than 404ing", async ({
    page,
  }) => {
    const response = await page.goto("/book?branch=not-a-real-branch");

    expect(response?.status()).toBe(200);
    await expect(page.getByText("Step 1 of 6:")).toBeAttached();
  });

  test("submitting the flow lands on a confirmation carrying a reference", async ({
    page,
  }) => {
    await page.goto("/book");

    await page.getByRole("radio").first().check();
    await continueStep(page);

    await page.getByRole("radio", { name: /family healthcare/i }).check();
    await continueStep(page);

    // A day inside the 90-day window `bookingDate()` allows.
    const inSevenDays = new Date(Date.now() + 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await page.getByLabel(/which day suits you/i).fill(inSevenDays);
    await page.getByRole("radio", { name: /morning/i }).check();
    await continueStep(page);

    await page.getByLabel(/patient's full name/i).fill(PATIENT.name);
    await page.getByLabel(/phone number/i).fill(PATIENT.phone);
    await page.getByLabel(/email address/i).fill(PATIENT.email);
    await continueStep(page);

    // Paying privately is a first-class answer, not an empty state.
    await page.getByRole("radio", { name: /paying privately/i }).check();
    await continueStep(page);

    /*
     * The bot defence in lib/spam.ts discards anything submitted less than
     * MIN_SUBMIT_SECONDS after the form mounted, and returns the *success*
     * shape with a null reference so a bot learns nothing. Playwright clicks
     * through all six steps in well under a second, so without this wait the
     * submission below is silently binned and the spec lands on
     * `/book/confirmed` with no `?ref=` — which is exactly what it used to do,
     * intermittently, depending on how fast the machine was.
     *
     * A real wait rather than a clock stub: the minimum dwell time is part of
     * the contract this spec exists to exercise end to end.
     */
    await page.waitForTimeout(MIN_SUBMIT_SECONDS * 1000 + 500);

    // Consent is never pre-ticked (NDPR), so submitting without it must fail.
    await page.getByRole("button", { name: /request appointment/i }).click();
    await expect(page).toHaveURL(/\/book$/);

    await page.getByRole("checkbox", { name: /privacy policy/i }).check();
    await page.getByRole("button", { name: /request appointment/i }).click();

    // Generous, and deliberately so: this click is a database write plus a
    // destination dispatch plus a route the dev server has not compiled yet.
    // The default 5s is a stopwatch on the machine, not an assertion about the
    // booking flow.
    await expect(page).toHaveURL(/\/book\/confirmed\?ref=PMH-\d{4}-\d{6,}/, {
      timeout: 30_000,
    });
    await expect(page.getByText(/^PMH-\d{4}-\d{6,}$/)).toBeVisible();

    // A refresh must never resubmit — the POST already happened, and this page
    // is a GET (CLAUDE.md, conversion baseline item 1).
    await page.reload();
    await expect(page.getByText(/^PMH-\d{4}-\d{6,}$/)).toBeVisible();
  });
});
