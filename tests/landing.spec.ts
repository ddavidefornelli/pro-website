import { expect, test } from "@playwright/test";

test("immediately identifies the product and its benefits", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");

  await expect(page).toHaveTitle("prune — Daily planner & focus timer for Mac");
  await expect(page.getByRole("link", { name: "prune home" })).toHaveText("prune");
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "prune");
  await expect(page.getByText("Daily planner + focus timer for Mac", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Plan 3 tasks. Finish what matters.",
  );
  await expect(page.locator(".hero-description")).toContainText(
    "Weekly AI reviews help you cut distractions.",
  );
  await expect(page.locator(".product-facts dt")).toHaveText([
    "Daily tasks", "Focus timer", "Weekly review",
  ]);
  await expect(page.locator(".product-facts dd")).toHaveText(["3", "1", "AI"]);
  await expect(page.getByRole("link", { name: "Contact" })).toHaveAttribute(
    "href",
    "mailto:fornelli.dv@gmail.com",
  );
  expect(errors).toEqual([]);
});

test("initializes Web Analytics in development mode", async ({ page }) => {
  await page.route("https://va.vercel-scripts.com/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" }),
  );
  await page.goto("/");

  await expect(page.locator('script[src="https://va.vercel-scripts.com/v1/script.debug.js"]')).toHaveCount(1);
  expect(await page.evaluate(() => window.vam)).toBe("development");
});

test("downloads the Mac installer", async ({ page }) => {
  await page.goto("/");

  const install = page.getByRole("link", { name: "Install for Mac" });
  await expect(install).toHaveAttribute("href", "/download");
  await expect(install).toHaveAccessibleDescription("Download for macOS.");

  const downloadPromise = page.waitForEvent("download");
  await install.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("prune.dmg");
  expect(await download.failure()).toBeNull();
  await expect(page).toHaveURL(/\/download$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("THANK YOU FOR INSTALLING");
});

test("direct download page starts the installer and only shows a centered thank you", async ({ page }) => {
  const downloadPromise = page.waitForEvent("download");
  await page.goto("/download");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("prune.dmg");
  expect(await download.failure()).toBeNull();
  expect(await page.locator("body").innerText()).toBe("THANK YOU FOR INSTALLING");
  await expect(page.getByRole("link")).toHaveCount(0);
  await expect(page.locator("header")).toHaveCount(0);
  const center = await page.locator("h1").boundingBox();
  const viewport = page.viewportSize()!;
  expect(center!.x + center!.width / 2).toBeCloseTo(viewport.width / 2, 0);
  expect(center!.y + center!.height / 2).toBeCloseTo(viewport.height / 2, 0);
});

test("stays vertical and fully visible without scrolling at every screen size", async ({ page }) => {
  await page.goto("/");

  for (const viewport of [
    { width: 280, height: 568 },
    { width: 320, height: 568 },
    { width: 320, height: 760 },
    { width: 375, height: 480 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 480, height: 320 },
    { width: 568, height: 320 },
    { width: 667, height: 375 },
    { width: 844, height: 390 },
    { width: 915, height: 412 },
    { width: 640, height: 480 },
    { width: 768, height: 1024 },
    { width: 820, height: 1180 },
    { width: 1024, height: 768 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);

    for (const selector of [
      ".site-header", ".hero", "h1", ".hero-description",
      ".install-area", ".product-facts",
    ]) {
      await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
    }

    const layout = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      const hero = document.querySelector(".hero")!.getBoundingClientRect();
      const facts = document.querySelector(".product-facts")!.getBoundingClientRect();
      const elements = [document.documentElement, document.body, document.getElementById("root")!];
      return {
        direction: getComputedStyle(main).flexDirection,
        heroBottom: hero.bottom,
        factsTop: facts.top,
        heroCenter: hero.left + hero.width / 2,
        factsCenter: facts.left + facts.width / 2,
        overflow: elements.some((element) =>
          element.scrollWidth > window.innerWidth || element.scrollHeight > window.innerHeight,
        ),
      };
    });
    expect(layout.direction).toBe("column");
    expect(layout.factsTop).toBeGreaterThanOrEqual(layout.heroBottom);
    expect(layout.heroCenter).toBeCloseTo(viewport.width / 2, 1);
    expect(layout.factsCenter).toBeCloseTo(viewport.width / 2, 1);
    expect(layout.overflow, `No overflow at ${viewport.width}×${viewport.height}`).toBe(false);
  }
});

test("does not scroll with wheel, keyboard, or programmatic navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.mouse.wheel(0, 1000);
  await page.keyboard.press("PageDown");
  await page.keyboard.press("End");
  await page.evaluate(() => window.scrollTo(1000, 1000));

  expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual({
    x: 0,
    y: 0,
  });
});
