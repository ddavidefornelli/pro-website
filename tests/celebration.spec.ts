import { test, expect, synced, type Backend } from "./helpers/browser";

function seedFinalTask(backend: Backend): void {
  backend.data.todayTasks = ["First outcome", "Second outcome", "Final outcome"].map((outcome, i) => ({
    id: `celebration-task-${i}`,
    outcome,
    isPriority: i === 0,
    plannedFor: backend.data.today,
    estimatedMinutes: 30,
    actualSeconds: i < 2 ? 1800 : 0,
    status: i < 2 ? "completed" : "planned",
    startedAt: null,
    completedOn: i < 2 ? backend.data.today : null,
    createdAt: backend.data.serverNow,
    resources: [],
  }));
  backend.data.completions = [{ day: backend.data.today, count: 2 }];
}

for (const width of [390, 1440]) {
  test.describe(`day-completion celebration at ${width}px`, () => {
    test.use({ signedIn: true, viewport: { width, height: 900 } });

    test("finishing the last task gets one full-screen moment without blocking navigation or replaying on reload", async ({ page, backend }, info) => {
      seedFinalTask(backend);
      await page.goto("/");
      await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
      await expect(page.locator(".completion-moment, .diamond-rain")).toHaveCount(0);
      await page.getByRole("button", { name: "Start focus", exact: true }).click();
      await synced(page);
      await expect(page.locator(".completion-moment, .diamond-rain")).toHaveCount(0);
      await page.getByRole("button", { name: "Complete task", exact: true }).click();
      await synced(page);
      const moment = page.locator(".completion-moment");
      await expect(moment).toHaveAttribute("role", "status");
      await expect(moment).toHaveText("today you won.");
      await expect(moment.getByRole("heading", { name: "today you won." })).toBeInViewport();
      await expect(page.locator("canvas.diamond-rain")).toBeVisible();
      await expect(page.locator("canvas.diamond-illumination")).toHaveCount(1);
      expect(await moment.evaluate(node => getComputedStyle(node).pointerEvents)).toBe("none");
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `test-results/${info.project.name}-${width}-completion.png` });
      await page.getByRole("navigation").getByRole("button", { name: "Tomorrow", exact: true }).click();
      await expect(page.getByRole("main", { name: "Tomorrow", exact: true })).toBeVisible();
      await expect(moment).toHaveCount(1);
      await expect(moment).toHaveCount(0, { timeout: 7000 });
      await expect(page.locator("canvas.diamond-rain, canvas.diamond-illumination")).toHaveCount(0, { timeout: 5000 });
      await page.reload();
      await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
      await expect(page.locator(".completion-moment, .diamond-rain, .diamond-illumination")).toHaveCount(0);
    });

    test("reduced-motion users get an accessible static completion acknowledgement without falling diamonds", async ({ page, backend }) => {
      seedFinalTask(backend);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      await page.getByRole("button", { name: "Start focus", exact: true }).click();
      await synced(page);
      await page.getByRole("button", { name: "Complete task", exact: true }).click();
      await synced(page);
      const moment = page.locator(".completion-moment");
      await expect(moment).toHaveAttribute("aria-atomic", "true");
      await expect(moment).toHaveText("today you won.");
      expect(await moment.evaluate(node => getComputedStyle(node).animationName)).toBe("none");
      await expect(page.locator("canvas.diamond-rain, canvas.diamond-illumination")).toHaveCount(0);
      await expect(moment).toHaveCount(0, { timeout: 6000 });
    });
  });
}
