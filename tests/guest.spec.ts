import { test, expect } from "@playwright/test";

test("visitors can plan and reload without authentication or cloud requests", async ({ page }) => {
  const cloudRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("supabase.co") || request.url().includes("/api/planner")) cloudRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Start with one small win." })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email address" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Task outcome" }).fill("Try prune without an account");
  await page.getByRole("button", { name: "Next: set a time estimate" }).click();
  await page.getByRole("button", { name: "Create my first task" }).click();
  await expect(page.getByRole("heading", { name: "Make a little space for it." })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Try prune without an account", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save & sync across devices" })).toBeVisible();
  expect(cloudRequests).toEqual([]);
  await page.getByRole("button", { name: "Save & sync across devices" }).click();
  await expect(page.getByRole("textbox", { name: "Email address" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  await page.getByRole("button", { name: "Continue without an account" }).click();
  await expect(page.getByText("Try prune without an account", { exact: true })).toBeVisible();
  expect(cloudRequests).toEqual([]);
});
