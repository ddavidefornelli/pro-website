import { test, expect, dashboard } from "./helpers/browser";

test.use({ signedIn: true });

test("verified account imports guest tasks once and retains the guest copy until confirmation", async ({ page, backend }) => {
  const base = dashboard();
  const requestId = crypto.randomUUID();
  const command = { requestId, action: "create_task", args: { outcome: "Carry my guest task", day: base.today, estimatedMinutes: 30 }, timezone: "UTC", at: base.serverNow, revision: 0 };
  await page.addInitScript(({ base, command }) => {
    if (!localStorage.getItem("guest-sync-seeded")) {
      localStorage.setItem("guest-sync-seeded", "true");
      localStorage.setItem("prune:guest:v1", JSON.stringify({ version: 1, base, commands: [command] }));
    }
  }, { base, command });
  const imports: any[] = [];
  await page.route("**/rest/v1/rpc/planner_import_guest", async (route) => {
    const payload = route.request().postDataJSON().p_payload;
    imports.push(payload);
    if (imports.length === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Unavailable" }) });
      return;
    }
    backend.data.todayTasks = payload.tasks;
    backend.data.revision = 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ imported: true }) });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Retry Save & sync" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("prune:guest:v1"))).not.toBeNull();
  await page.getByRole("button", { name: "Retry Save & sync" }).click();
  await expect(page.getByText("Carry my guest task", { exact: true })).toBeVisible();
  expect(imports).toHaveLength(2);
  expect(imports[0]).toEqual(imports[1]);
  expect(imports[1].tasks[0].id).toBe(requestId);
  expect(await page.evaluate(() => localStorage.getItem("prune:guest:v1"))).toBeNull();
  await page.reload();
  await expect(page.getByText("Carry my guest task", { exact: true })).toBeVisible();
  expect(imports).toHaveLength(2);
});
