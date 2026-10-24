import { test, expect, AUTH_KEY, session } from "./helpers/browser";
import { PRIVACY_ACKNOWLEDGEMENT_KEY } from "../src/planner/privacy-state";

test("home is signup, with an unchecked notice and a top-right Mac install button", async ({ page, backend }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("prune — Your day. Three priorities.");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Make room for what matters.");
  await expect(page.getByRole("textbox", { name: "Email address" })).toBeVisible();
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Send code" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Install for Mac" })).toHaveAttribute("download", "prune.dmg");
  expect(backend.requests).toEqual([]);
  expect(await page.locator("script[src*='googletagmanager'],script[src*='goatcounter'],script[src*='vercel-scripts']").count()).toBe(0);
});

test("email-code sign-in handles invalid codes then restores the session without another email", async ({ page, backend }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email address" }).fill("user@example.com");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  expect(backend.requests).toHaveLength(0);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  const code = page.getByLabel("Email code", { exact: true });
  await expect(code).toHaveAttribute("autocomplete", "one-time-code");
  await code.fill("00000000");
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Check your email and code");
  await expect(page.getByRole("alert")).not.toContainText("private upstream error");
  await code.fill("12345678");
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  const requests = backend.requests.filter((request) => request.path === "/auth/v1/verify");
  expect(requests).toHaveLength(2);
  expect(requests[1].body).toMatchObject({ email: "user@example.com", token: "12345678", type: "email" });
  await expect(page.getByRole("main", { name: "Today", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  expect(backend.requests.filter((request) => request.path === "/auth/v1/otp")).toHaveLength(1);
  const saved = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  expect(saved).not.toContain("12345678"); // One-time codes are not persisted.
  const plannerRequests = backend.requests.filter((request) => request.path.includes("/rpc/") || request.path.includes("/functions/"));
  expect(JSON.stringify(plannerRequests.map((request) => request.body))).not.toContain("12345678");
});

test("privacy storage failure sends no account request and does not claim signup succeeded", async ({ page, backend }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "prune:privacy:acknowledgement") throw new DOMException("Storage denied", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email address" }).fill("user@example.com");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("alert")).toContainText("No sign-in request was sent");
  expect(backend.requests).toHaveLength(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Make room for what matters.");
});

test("an outdated notice gates even a saved session, and the full policy is available before sign-in", async ({ page, backend }) => {
  await page.addInitScript(({ authKey, savedSession, privacyKey }) => {
    localStorage.setItem(authKey, JSON.stringify(savedSession));
    localStorage.setItem(privacyKey, JSON.stringify({ version: "privacy-old", acknowledgedAt: new Date().toISOString() }));
  }, { authKey: AUTH_KEY, savedSession: session(), privacyKey: PRIVACY_ACKNOWLEDGEMENT_KEY });
  await page.goto("/");
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await page.getByRole("button", { name: "Privacy Policy", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toContainText("browser's localStorage");
  await expect(page.getByRole("dialog")).toContainText("not macOS Keychain");
  await page.getByRole("button", { name: "Close privacy policy" }).click();
  expect(backend.requests).toHaveLength(0);
});

test("failed sign-in stays on the email form without exposing upstream errors", async ({ page, backend }) => {
  backend.failSignIn = true;
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email address" }).fill("user@example.com");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("alert")).toContainText(/unavailable|Could not reach/);
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send code" })).toBeEnabled();
});

test("downloads for Mac without navigating away from the app", async ({ page }) => {
  await page.goto("/");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Install for Mac" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("prune.dmg");
  expect(await download.failure()).toBeNull();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Make room for what matters.");
});

test("the existing direct download page still works without account services", async ({ page, backend }) => {
  const downloadPromise = page.waitForEvent("download");
  await page.goto("/download");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("prune.dmg");
  expect(await download.failure()).toBeNull();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("THANK YOU FOR INSTALLING");
  expect(backend.requests).toHaveLength(0);
});

test("signup fits narrow phones and scrolls naturally in short landscape windows", async ({ page }) => {
  await page.goto("/");
  for (const viewport of [
    { width: 280, height: 568 }, { width: 320, height: 568 }, { width: 375, height: 667 },
    { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 568, height: 320 },
    { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, `No horizontal overflow at ${viewport.width}×${viewport.height}`).toBeLessThanOrEqual(viewport.width);
    await expect(page.getByRole("link", { name: "Install for Mac" })).toBeInViewport({ ratio: 1 });
    const box = (await page.getByRole("link", { name: "Install for Mac" }).boundingBox())!;
    expect(box.x + box.width).toBeGreaterThan(viewport.width / 2);
    await page.getByRole("button", { name: "Send code" }).evaluate((button) => button.scrollIntoView({ block: "center" }));
    await expect(page.getByRole("button", { name: "Send code" })).toBeInViewport({ ratio: 1 });
    expect(await page.getByRole("textbox", { name: "Email address" }).evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
});
