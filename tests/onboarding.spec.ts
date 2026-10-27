import { test, expect, openPlanner, synced } from "./helpers/browser";

test.use({ signedIn: true, firstVisit: true });

for (const width of [1100, 390]) {
  test(`guides a first task into focus at ${width}px`, async ({ page, backend }) => {
    await page.setViewportSize({ width, height: 844 });
    await openPlanner(page);
    const dialog = page.getByRole("dialog", { name: "Start with one small win." });
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await dialog.getByLabel("Task outcome").fill("Write a first draft");
    await dialog.getByRole("button", { name: "Next: set a time estimate" }).click();
    const estimate = page.getByRole("dialog", { name: "Make a little space for it." });
    await estimate.getByRole("slider").press("ArrowUp");
    await estimate.getByRole("button", { name: "Back", exact: true }).click();
    await expect(dialog.getByLabel("Task outcome")).toHaveValue("Write a first draft");
    await dialog.getByRole("button", { name: "Next: set a time estimate" }).click();
    await expect(estimate.getByRole("slider")).toHaveAttribute("aria-valuenow", "35");
    await estimate.getByRole("button", { name: "Create my first task" }).click();
    await expect(page.getByRole("heading", { name: "Your task is here" })).toBeVisible();
    await synced(page);
    expect(backend.data.todayTasks).toHaveLength(1);
    expect(backend.data.todayTasks[0]!.estimatedMinutes).toBe(35);
    expect(backend.data.activeTask).toBeNull();
    await expect(page.getByRole("button", { name: "Start focusing", exact: true })).toHaveCount(0);
    for (let step = 0; step < 4; step++) {
      await page.locator(".tour-popup").getByRole("button", { name: "Next", exact: true }).click();
    }
    await page.getByRole("button", { name: "Start focusing", exact: true }).click();
    await expect(page.locator("#focus-timer")).toBeVisible();
    await expect(page.locator(".first-task-dialog")).toHaveCount(0);
    await page.reload();
    await expect(page.locator("#focus-timer")).toBeVisible();
    await expect(page.locator(".first-task-dialog")).toHaveCount(0);
  });
}

test("skip is remembered without creating a task", async ({ page, backend }) => {
  await openPlanner(page);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.reload();
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(page.locator(".first-task-dialog")).toHaveCount(0);
  expect(backend.data.todayTasks).toHaveLength(0);
});

test("existing task history does not trigger onboarding", async ({ page, backend }) => {
  backend.data.completions = [{ day: backend.data.today, count: 1 }];
  await openPlanner(page);
  await expect(page.locator(".first-task-dialog")).toHaveCount(0);
});
