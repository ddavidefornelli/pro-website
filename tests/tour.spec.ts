import { test, expect, openPlanner, synced } from "./helpers/browser";

test.use({ signedIn: true, firstVisit: true });

for (const width of [1100, 390]) {
  test(`task creation leads to anchored tour, not focus, at ${width}px`, async ({ page, backend }) => {
    await page.setViewportSize({ width, height: 844 });
    await openPlanner(page);
    await expect(page.getByRole("button", { name: "Take a quick tour" })).toHaveCount(0);
    await page.getByLabel("Task outcome").fill("Write a first draft");
    await page.getByRole("button", { name: "Next: set a time estimate" }).click();
    await page.getByRole("button", { name: "Create my first task" }).click();
    const tour = page.locator(".planner-tour-dialog");
    const popup = page.locator(".tour-popup");
    await expect(popup).toBeVisible();
    await synced(page);
    await expect.poll(() => backend.data.todayTasks.length).toBe(1);
    for (const [index, view] of ["today", "today", "tomorrow", "habits", "today"].entries()) {
      await expect(page.locator("#app")).toHaveAttribute("data-view", view);
      await expect(popup).toBeInViewport({ ratio: 1 });
      await expect(page.locator(".tour-highlight")).toBeInViewport({ ratio: 1 });
      await expect(tour).not.toContainText("Profile");
      expect(backend.data.activeTask).toBeNull();
      expect(backend.requests.filter((request) => request.body.p_action === "start_task")).toHaveLength(0);
      if (index === 1) {
        await popup.getByRole("button", { name: "Back", exact: true }).click();
        await expect(popup.getByRole("heading")).toHaveText("Your task is here");
        await popup.getByRole("button", { name: "Next", exact: true }).click();
      }
      if (index < 4) {
        await expect(popup.getByRole("button", { name: "Start focusing" })).toHaveCount(0);
        await popup.getByRole("button", { name: "Next", exact: true }).click();
      }
    }
    await popup.getByRole("button", { name: "Not now" }).click();
    await expect(tour).toHaveCount(0);
    await expect(page.locator("#app")).toHaveAttribute("data-view", "today");
    expect(backend.data.activeTask).toBeNull();
    await page.getByRole("navigation").getByRole("button", { name: "Overview" }).click();
    await expect(page.locator("#app")).toHaveAttribute("data-view", "habits");
    await expect(page.getByRole("button", { name: "Take a quick tour" })).toHaveCount(0);
  });
}
