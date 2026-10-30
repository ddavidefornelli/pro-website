import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alignDashboardDate,
  dashboardTasks,
} from "../src/planner/dashboard.ts";
import { applyCommand, project } from "../src/planner/task-projection.ts";
import { nextDay } from "../src/planner/time.ts";
import { dashboard } from "./helpers/queue.mjs";

function command(data, action, args = {}) {
  return {
    requestId: "task-1",
    action,
    args,
    timezone: "UTC",
    at: data.serverNow,
    revision: data.revision ?? 0,
  };
}
function create(data, overrides = {}) {
  return applyCommand(
    data,
    command(data, "create_task", {
      outcome: "One small task",
      day: data.today,
      estimatedMinutes: 30,
      ...overrides,
    }),
  );
}

test("projection clones its input, and dashboard tasks include the active task only once", () => {
  const base = dashboard();
  const next = project(
    base,
    command(base, "create_task", {
      outcome: "  A task  ",
      day: base.today,
      estimatedMinutes: 15,
    }),
  );
  assert.equal(base.todayTasks.length, 0);
  assert.equal(next.todayTasks[0].outcome, "A task");
  next.activeTask = structuredClone(next.todayTasks[0]);
  assert.equal(dashboardTasks(next).length, 1);
});

test("date alignment preserves an older active task and promotes tomorrow's plan", () => {
  const data = dashboard();
  const active = create(data);
  applyCommand(data, command(data, "start_task", { id: active.id }));
  const nextId = "task-2";
  applyCommand(data, {
    ...command(data, "create_task", {
      outcome: "Tomorrow's task",
      day: data.tomorrow,
      estimatedMinutes: 15,
    }),
    requestId: nextId,
  });
  const tomorrow = data.tomorrow;
  alignDashboardDate(data, Date.parse(`${tomorrow}T12:00:00Z`) / 1000, "UTC");
  assert.equal(data.today, tomorrow);
  assert.deepEqual(
    data.todayTasks.map(({ id }) => id),
    [nextId],
  );
  assert.equal(data.activeTask.id, active.id);
  assert.deepEqual(
    dashboardTasks(data).map(({ id }) => id),
    [nextId, active.id],
  );
});

test("legacy priority, resource and pause commands still replay without losing Mac metadata", () => {
  const data = dashboard();
  const task = create(data);
  task.resources.push({
    id: "file",
    kind: "file",
    label: "Mac file",
    target: "/Users/example/private.txt",
  });
  const apply = (action, args = {}) =>
    applyCommand(data, command(data, action, { id: task.id, ...args }));
  apply("prioritize_task");
  const link = command(data, "add_task_link", {
    id: task.id,
    label: "Reference",
    target: "https://example.com",
  });
  link.requestId = "link";
  applyCommand(data, link);
  apply("remove_task_resource", { resourceId: "link" });
  apply("start_task");
  applyCommand(data, {
    ...command(data, "pause_task", { id: task.id }),
    at: data.serverNow + 60,
  });
  assert.equal(task.actualSeconds, 60);
  assert.equal(task.startedAt, null);
  assert.equal(task.isPriority, true);
  assert.deepEqual(
    task.resources.map(({ id }) => id),
    ["file"],
  );
});

test("completing an older active task returns its final timing even outside the day lists", () => {
  const data = dashboard();
  const task = create(data);
  applyCommand(data, command(data, "start_task", { id: task.id }));
  const completed = applyCommand(data, {
    ...command(data, "complete_task", { id: task.id }),
    at: data.serverNow + 86_400,
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.actualSeconds, 86_400);
  assert.equal(completed.completedOn, data.today);
  assert.equal(data.todayTasks.length, 0);
  assert.equal(data.activeTask, null);
  assert.equal(data.completions[0].count, 1);
});

test("unknown saved commands fail instead of incrementing the dashboard revision", () => {
  const data = dashboard();
  const task = create(data);
  const revision = data.revision;
  assert.throws(
    () => applyCommand(data, command(data, "unknown_action", { id: task.id })),
    /Unsupported saved/,
  );
  assert.equal(data.revision, revision);
});

for (const [day, expected] of [
  ["2024-02-28", "2024-02-29"],
  ["2024-02-29", "2024-03-01"],
  ["2026-03-08", "2026-03-09"],
  ["2026-11-01", "2026-11-02"],
  ["2026-12-31", "2027-01-01"],
])
  test(`date keys advance across calendar boundaries: ${day}`, () => {
    assert.equal(nextDay(day), expected);
  });
