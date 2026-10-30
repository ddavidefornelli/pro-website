import { test, expect, openSignIn, showSignIn } from "./helpers/browser";
import { PRIVACY_ACKNOWLEDGEMENT_KEY, PRIVACY_POLICY_VERSION } from "../src/planner/privacy-state";

test("one terms checkbox covers the combined document and is remembered on this browser", async ({ page, backend }) => {
  await openSignIn(page);
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await expect(page.getByText("Free to use. Automatic weekly reviews", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Terms & Privacy", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Terms of use", exact: true })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Privacy Policy", exact: true })).toBeAttached();
  await expect(dialog).toContainText("There are no subscription fees or in-app purchases.");
  await expect(dialog).toContainText("Nothing in these terms excludes liability");
  await page.getByRole("button", { name: "Close privacy policy" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("user@example.com");
  await page.getByRole("button", { name: "Email me a sign-in code", exact: true }).click();
  expect(backend.requests).toHaveLength(0);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Email me a sign-in code", exact: true }).click();
  await expect(page.getByLabel("Email code", { exact: true })).toBeVisible();
  const record = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), PRIVACY_ACKNOWLEDGEMENT_KEY);
  expect(record.version).toBe(PRIVACY_POLICY_VERSION);
  await page.reload();
  await showSignIn(page);
  await expect(page.getByRole("textbox", { name: "Email address" })).toBeVisible();
  await expect(page.getByRole("checkbox")).toBeHidden();
  expect(backend.requests.filter((request) => request.path === "/auth/v1/otp")).toHaveLength(1);
});
