import { expect, test } from "@playwright/test";

/**
 * Every dynamic route answers a real 404 for a slug that does not exist.
 *
 * This guards a regression that is invisible in the browser: the page *looked*
 * right while the response carried HTTP 200, because a `loading.tsx` above a
 * dynamic segment makes Next flush the shell — and the status — before the page
 * runs and calls `notFound()`. Search engines index a soft 404 as a real page,
 * and old WordPress links land on these routes until the redirect list arrives.
 *
 * Asserting the status alone is what catches it; the body was never the broken
 * half. One case per dynamic segment, because the boundary that breaks them is
 * shared and a single route would not have shown which ones were affected.
 */
const dynamicRoutes = [
  "/blog/no-such-post",
  "/services/no-such-service",
  "/doctors/no-such-doctor",
  "/locations/no-such-branch",
];

test.describe("unknown slugs", () => {
  for (const path of dynamicRoutes) {
    test(`${path} answers 404, not 200`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    });
  }

  test("a URL matching no route at all is also a 404", async ({ page }) => {
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
  });

  test("the 404 body is the branded page, with chrome and no error text", async ({
    page,
  }) => {
    await page.goto("/blog/no-such-post");

    // The skip link and header come from `app/not-found.tsx` assembling the
    // chrome itself — see the note there about route groups.
    await expect(page.getByRole("link", { name: /skip to content/i })).toBeAttached();
    await expect(page.locator("main#main")).toBeVisible();

    // A phone number for urgent care, per the conversion baseline.
    await expect(page.getByRole("link", { name: /\+234/ }).first()).toBeAttached();

    await expect(page.locator("body")).not.toContainText(/at .*\.tsx|stack trace/i);
    await expect(page).toHaveTitle(/page not found/i);
  });
});
