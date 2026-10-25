import { test, expect, synced, type Backend } from "./helpers/browser";
import type { Page } from "@playwright/test";

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

async function finishDay(page: Page, backend: Backend): Promise<void> {
  seedFinalTask(backend);
  await page.goto("/");
  await expect(page.locator(".crown-celebration")).toHaveCount(0);
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  await synced(page);
  await expect(page.locator(".crown-celebration")).toHaveCount(0);
  await page.getByRole("button", { name: "Complete task", exact: true }).click();
  await synced(page);
}

for (const width of [390, 1440]) {
  test.describe(`day-completion celebration at ${width}px`, () => {
    test.use({ signedIn: true, viewport: { width, height: 900 } });

    test("finishing the last task spins a real 3D crown without blocking navigation or replaying on reload", async ({ page, backend }, info) => {
      await finishDay(page, backend);
      const layer = page.locator(".crown-celebration");
      const canvas = page.locator("canvas.crown-canvas");
      await expect(layer).toHaveAttribute("data-renderer", "webgl");
      await expect(canvas).toBeVisible();
      await expect(layer).toHaveAttribute("aria-hidden", "true");
      await expect(page.locator(".completion-moment, .diamond-rain, .diamond-illumination")).toHaveCount(0);
      expect(await canvas.evaluate(node => getComputedStyle(node).pointerEvents)).toBe("none");
      await page.waitForTimeout(1200);
      const first = await canvas.screenshot();
      await page.waitForTimeout(400);
      expect((await canvas.screenshot()).equals(first), "Crown pixels change as the model rotates").toBe(false);
      await page.screenshot({ path: `test-results/${info.project.name}-${width}-crown-completion.png` });
      await page.getByRole("navigation").getByRole("button", { name: "Tomorrow", exact: true }).click();
      await expect(page.getByRole("main", { name: "Tomorrow", exact: true })).toBeVisible();
      await expect(layer).toHaveCount(0, { timeout: 11000 });
      await page.reload();
      await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
      await expect(page.locator(".crown-celebration, .diamond-rain")).toHaveCount(0);
    });

    test("reduced-motion users get no crown animation or completion overlay", async ({ page, backend }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await finishDay(page, backend);
      await expect(page.locator(".completion-moment, .crown-celebration, .diamond-rain")).toHaveCount(0);
    });
  });
}

test.describe("crown resilience", () => {
  test.use({ signedIn: true, viewport: { width: 1440, height: 900 } });

  test("the local model and studio comply with production CSP without exceptions", async ({ page, backend }) => {
    const violations: string[] = [];
    await page.exposeFunction("__reportCrownCsp", (directive: string) => violations.push(directive));
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", event => {
        void (globalThis as typeof globalThis & { __reportCrownCsp: (directive: string) => Promise<void> }).__reportCrownCsp(event.effectiveDirective);
      });
    });
    await finishDay(page, backend);
    await expect(page.locator(".crown-celebration")).toHaveAttribute("data-renderer", "webgl");
    await page.waitForTimeout(500);
    await page.getByRole("navigation").getByRole("button", { name: "Tomorrow", exact: true }).click();
    await expect(page.getByRole("main", { name: "Tomorrow", exact: true })).toBeVisible();
    // Keep screenshots out of this check: Playwright injects a WebKit sync stylesheet.
    expect(violations).toEqual([]);
  });

  test("WebGL-unavailable browsers show a local still render and remain usable", async ({ page, backend }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
        value(this: HTMLCanvasElement, type: string, options?: CanvasRenderingContext2DSettings) {
          if (type.startsWith("webgl")) return null;
          return original.call(this, type as "2d", options);
        },
      });
    });
    await finishDay(page, backend);
    await expect(page.locator(".crown-celebration")).toHaveAttribute("data-renderer", "fallback");
    const poster = page.locator("img.crown-fallback");
    await expect(poster).toBeVisible();
    await expect.poll(() => poster.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(page.locator("canvas.crown-canvas")).toHaveCount(0);
    await page.getByRole("navigation").getByRole("button", { name: "Tomorrow", exact: true }).click();
    await expect(page.getByRole("main", { name: "Tomorrow", exact: true })).toBeVisible();
    await expect(page.locator(".crown-celebration")).toHaveCount(0, { timeout: 11000 });
  });

  test("changing reduced-motion preference releases the running celebration", async ({ page, backend }) => {
    await finishDay(page, backend);
    await expect(page.locator("canvas.crown-canvas")).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".crown-celebration")).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(page.locator(".crown-celebration")).toHaveCount(0);
  });

  test("the crown resizes without restarting, then cleans up on page hide", async ({ page, backend }) => {
    await finishDay(page, backend);
    const canvas = page.locator("canvas.crown-canvas");
    await expect(canvas).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".crown-celebration")).toHaveCount(1);
    await expect.poll(() => canvas.evaluate(node => node.getBoundingClientRect().width)).toBeLessThan(390);
    await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.width)).toBeLessThan(700);
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await expect(page.locator(".crown-celebration")).toHaveCount(0);
  });

  test("a lost graphics context switches to the still crown rather than breaking the app", async ({ page, backend }) => {
    await finishDay(page, backend);
    const canvas = page.locator("canvas.crown-canvas");
    await expect(canvas).toBeVisible();
    await canvas.evaluate(node => node.dispatchEvent(new Event("webglcontextlost", { cancelable: true })));
    await expect(page.locator(".crown-celebration")).toHaveAttribute("data-renderer", "fallback");
    await expect(page.locator("img.crown-fallback")).toBeVisible();
    await expect(page.locator("canvas.crown-canvas")).toHaveCount(0);
    await page.getByRole("navigation").getByRole("button", { name: "Tomorrow", exact: true }).click();
    await expect(page.getByRole("main", { name: "Tomorrow", exact: true })).toBeVisible();
  });
});
