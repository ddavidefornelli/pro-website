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

    test("finishing the last task rains diamonds without a text overlay, blocking navigation, or replaying on reload", async ({ page, backend }, info) => {
      seedFinalTask(backend);
      await page.goto("/");
      await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
      await expect(page.locator(".completion-moment, .diamond-rain")).toHaveCount(0);
      await page.getByRole("button", { name: "Start focus", exact: true }).click();
      await synced(page);
      await expect(page.locator(".completion-moment, .diamond-rain")).toHaveCount(0);
      await page.getByRole("button", { name: "Complete task", exact: true }).click();
      await synced(page);
      await expect(page.locator(".completion-moment")).toHaveCount(0);
      await expect(page.locator("canvas.diamond-rain")).toBeVisible();
      await expect(page.locator("canvas.diamond-illumination")).toHaveCount(1);
      expect(await page.locator("canvas.diamond-rain").evaluate(node => getComputedStyle(node).pointerEvents)).toBe("none");
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `test-results/${info.project.name}-${width}-completion.png` });
      await page.getByRole("navigation").getByRole("button", { name: "Tomorrow", exact: true }).click();
      await expect(page.getByRole("main", { name: "Tomorrow", exact: true })).toBeVisible();
      await expect(page.locator("canvas.diamond-rain, canvas.diamond-illumination")).toHaveCount(0, { timeout: 12000 });
      await page.reload();
      await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
      await expect(page.locator(".completion-moment, .diamond-rain, .diamond-illumination")).toHaveCount(0);
    });

    test("reduced-motion users get no completion overlay or falling diamonds", async ({ page, backend }) => {
      seedFinalTask(backend);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      await page.getByRole("button", { name: "Start focus", exact: true }).click();
      await synced(page);
      await page.getByRole("button", { name: "Complete task", exact: true }).click();
      await synced(page);
      await expect(page.locator(".completion-moment, canvas.diamond-rain, canvas.diamond-illumination")).toHaveCount(0);
    });
  });
}
