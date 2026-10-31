import { test, expect } from "@playwright/test";

test("production guests report anonymous usage totals under CSP", async ({ page, request }) => {
  const violations: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("prune:cookies:v1", JSON.stringify({ choice: "rejected", at: Date.now() }));
    localStorage.setItem("prune:onboarding:v1:guest", "done");
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as any).__violations ??= [];
      (window as any).__violations.push(event.violatedDirective);
    });
  });
  await page.route("https://www.prune.win/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/_vercel/")) {
      await route.fulfill({ status: 204 });
      return;
    }
    const response = await request.get(`http://127.0.0.1:4173${url.pathname}`);
    await route.fulfill({ response });
  });
  const headers = { "Access-Control-Allow-Origin": "https://www.prune.win", "Access-Control-Allow-Headers": "apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  await page.route("https://web-fixture.supabase.co/**", async (route) => {
    await route.fulfill({ status: route.request().method() === "OPTIONS" ? 204 : 200, headers, contentType: "application/json", body: "null" });
  });
  const usage = page.waitForRequest((sent) => sent.method() === "POST" && sent.url() === "https://web-fixture.supabase.co/rest/v1/rpc/guest_record_usage");
  await page.goto("https://www.prune.win/");
  const outcome = page.getByRole("textbox", { name: "Outcome", exact: true });
  await outcome.fill("Private guest plan 45m");
  await outcome.press("Enter");
  await expect(page.getByText("Private guest plan", { exact: true })).toBeVisible();
  const sent = await usage;
  expect(sent.postDataJSON()).toEqual({ p_metrics: { new_guests: 1, active_guests: 1, tasks_created: 1 } });
  expect(sent.headers().apikey).toBe("sb_publishable_fixture");
  expect(sent.headers().authorization).toBeUndefined();
  violations.push(...(await page.evaluate(() => (window as any).__violations ?? [])));
  expect(violations).toEqual([]);
});
