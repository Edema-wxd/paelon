import { expect, test } from "@playwright/test";

/**
 * Blog index and article template (spec §6).
 *
 * These assert structure and accessibility contracts, not copy: the only post
 * in the database is a layout fixture that will be deleted, so anything keyed
 * to its wording would fail the moment real editorial content lands. What is
 * asserted here is what must hold for *any* post.
 */

test.describe("blog index", () => {
  test("lists posts and links each one by its title", async ({ page }) => {
    await page.goto("/blog");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Health articles",
    );

    const posts = page.getByRole("article");
    await expect(posts.first()).toBeVisible();

    // The heading is the link, so the accessible name is the article title —
    // never a bare "Read more" (spec §11).
    const firstLink = posts.first().getByRole("link").first();
    await expect(firstLink).toHaveAttribute("href", /^\/blog\/[a-z0-9-]+$/);
    await expect(firstLink).not.toHaveText(/^(read more|click here)$/i);
  });

  test("category filter is URL state and survives a reload", async ({ page }) => {
    await page.goto("/blog");

    const filter = page.getByRole("navigation", {
      name: "Filter articles by category",
    });
    const category = filter.getByRole("link").nth(1);
    const label = (await category.textContent())?.trim();
    await category.click();

    await expect(page).toHaveURL(/\?category=/);

    // aria-current, not colour alone, is what marks the active filter (§12).
    await page.reload();
    await expect(
      filter.getByRole("link", { name: label ?? "" }),
    ).toHaveAttribute("aria-current", "true");
  });

  test("an empty category says so instead of rendering a blank page", async ({
    page,
  }) => {
    await page.goto("/blog?category=corporate_wellness");
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /see all articles/i })).toBeVisible();
  });

  test("an unknown category falls back to everything rather than 404ing", async ({
    page,
  }) => {
    await page.goto("/blog?category=not-a-category");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("article").first()).toBeVisible();
  });
});

test.describe("blog article", () => {
  test("renders the post reached from the index", async ({ page }) => {
    await page.goto("/blog");
    // Level 2 on the index: the cards sit directly under the page `h1`, so
    // anything deeper would skip a level. `/blog/[slug]`'s "Read next" grid is
    // level 3, because there the cards sit under an `h2`.
    const title = await page
      .getByRole("article")
      .first()
      .getByRole("heading", { level: 2 })
      .textContent();

    await page.getByRole("link", { name: title ?? "" }).first().click();

    await expect(page).toHaveURL(/\/blog\/[a-z0-9-]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      (title ?? "").trim(),
    );
  });

  test("has exactly one h1 and no skipped heading levels", async ({ page }) => {
    await page.goto("/blog");
    await page.getByRole("article").first().getByRole("link").first().click();

    /*
     * Wait for the article before measuring. Without this the heading sweep
     * below races the navigation and sometimes runs against the *index* DOM
     * instead — which is how this spec used to fail while reporting a skipped
     * level on a page it was not looking at.
     */
    await expect(page).toHaveURL(/\/blog\/[a-z0-9-]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    const levels = await page
      .locator("h1, h2, h3, h4, h5, h6")
      .evaluateAll((nodes) => nodes.map((n) => Number(n.tagName[1])));

    for (const [index, level] of levels.entries()) {
      const previous = levels[index - 1];
      if (previous !== undefined) {
        expect(level - previous).toBeLessThanOrEqual(1);
      }
    }
  });

  test("body markdown becomes real elements, not literal markers", async ({
    page,
  }) => {
    await page.goto("/blog/preview-post-layout-fixture");

    const article = page.getByRole("article");
    await expect(article.locator("ul li").first()).toBeVisible();
    await expect(article.locator("ol li").first()).toBeVisible();
    await expect(article.locator("blockquote")).toBeVisible();
    await expect(article.locator("strong").first()).toBeVisible();

    // If the parser ever regresses to passing text through, this catches it.
    await expect(article).not.toContainText("**");
  });

  test("body links are internal routes that resolve", async ({ page, request }) => {
    await page.goto("/blog/preview-post-layout-fixture");

    // This route streams behind a loading state, and `goto` resolves before the
    // body arrives. Without waiting, the sweep below runs against the fallback
    // and reports zero links — a failure about nothing.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const hrefs = await page
      .getByRole("article")
      .locator("p a[href^='/'], li a[href^='/']")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href") ?? ""));

    // CLAUDE.md requires at least two contextual internal links per post, and
    // a link to a route that does not exist is a build failure, not a TODO.
    expect(hrefs.length).toBeGreaterThanOrEqual(2);

    for (const href of hrefs) {
      const response = await request.get(href);
      expect(response.status(), `${href} should resolve`).toBeLessThan(400);
    }
  });

  test("breadcrumb trail is visible and matches the JSON-LD", async ({ page }) => {
    await page.goto("/blog/preview-post-layout-fixture");

    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeVisible();

    const scripts = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    const types = scripts.map((raw) => JSON.parse(raw)["@type"]);

    expect(types).toContain("BreadcrumbList");
    expect(types).toContain("Article");
  });

  test("share links carry a descriptive accessible name", async ({ page }) => {
    await page.goto("/blog/preview-post-layout-fixture");

    const share = page.getByRole("link", { name: /share .* on whatsapp/i });
    await expect(share).toHaveAttribute("target", "_blank");
    await expect(share).toHaveAttribute("rel", /noopener/);
  });

  test("an unknown slug is a 404, not a 500", async ({ page }) => {
    const response = await page.goto("/blog/no-such-post");
    expect(response?.status()).toBe(404);
  });
});
