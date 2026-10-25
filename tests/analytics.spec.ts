import { test, expect } from "@playwright/test";

test("production analytics loads under CSP and removes auth parameters", async ({ page, request }) => {
  const violations: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as any).__violations ??= [];
      (window as any).__violations.push(event.violatedDirective);
    });
  });
  await page.route("https://www.prune.win/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/_vercel/insights/script.js") {
      await route.fulfill({ contentType: "application/javascript", body: `
        const beforeSend = window.vaq.find(([name]) => name === 'beforeSend')[1];
        window.analyticsEvent = beforeSend({ type: 'pageview', url: location.href });
        fetch('/_vercel/insights/view', { method: 'POST', body: JSON.stringify(window.analyticsEvent) });
      ` });
    } else if (url.pathname === "/_vercel/insights/view") {
      await route.fulfill({ status: 200, body: "{}" });
    } else {
      const response = await request.get(`http://127.0.0.1:4173${url.pathname}`);
      await route.fulfill({ response });
    }
  });
  const view = page.waitForRequest("https://www.prune.win/_vercel/insights/view");
  await page.goto("https://www.prune.win/?token=secret#access_token=secret");
  expect((await view).postDataJSON()).toEqual({ type: "pageview", url: "https://www.prune.win/" });
  violations.push(...await page.evaluate(() => (window as any).__violations ?? []));
  expect(violations).toEqual([]);
});
