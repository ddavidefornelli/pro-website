import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoot, createSignal } from "solid-js";
import { createPlanner } from "../../src/planner/create-planner.ts";
import { PlanningClient } from "../../src/planner/api.ts";
import { createWeeklyReview } from "../../src/reviews/create-weekly-review.ts";
import { POLLING } from "../../src/planner/constants.ts";
import { dashboard, deferred } from "../helpers/queue.mjs";

const settle = () => new Promise((resolve) => setImmediate(resolve));

/** Small lifecycle harness: real Solid browser reactivity, no DOM or hosted services. */
function environment(t) {
  const originals = { window: globalThis.window, document: globalThis.document };
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const timers = new Map();
  const disposers = [];
  let timerId = 0;
  Object.assign(window, {
    setInterval: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearInterval: (id) => timers.delete(id),
    confirm: () => true,
  });
  Object.assign(globalThis, { window, document });
  t.after(() => {
    disposers.reverse().forEach((dispose) => dispose());
    for (const [name, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  });
  return {
    window, document, timers,
    mount(factory) {
      return createRoot((dispose) => { disposers.push(dispose); return { state: factory(), dispose }; });
    },
  };
}

function task(data, overrides = {}) {
  return { id: "task-1", outcome: "A small win", plannedFor: data.today, estimatedMinutes: 30,
    actualSeconds: 0, status: "planned", startedAt: null, completedOn: null,
    createdAt: data.serverNow, isPriority: false, resources: [], ...overrides };
}

function plannerClient(initial = dashboard()) {
  return {
    data: initial, reads: 0, syncs: 0, syncBlocked: false,
    onQueueChange: () => {},
    cachedDashboard() { return structuredClone(this.data); },
    async dashboard() { this.reads++; return structuredClone(this.data); },
    async sync() { this.syncs++; },
  };
}

function overview(overrides = {}) {
  return { settings: { enabled: true }, model: "fixture", available: true,
    week: { start: "2026-10-19", end: "2026-10-25", nextUpdate: "2026-11-01" },
    status: "up_to_date", error: null, reviews: [], ...overrides };
}

test("dashboard reconciliation preserves task identity and memory-only notes", async (t) => {
  const env = environment(t);
  const client = plannerClient();
  client.data.activeTask = task(client.data, { status: "active" });
  client.data.todayTasks = [structuredClone(client.data.activeTask)];
  const { state } = env.mount(() => createPlanner(client));
  await settle();
  const identity = state.data().activeTask;
  state.setNotes("Never persist this scratchpad");
  client.data.activeTask.actualSeconds = 12;
  client.data.revision++;
  client.onQueueChange();
  assert.equal(state.data().activeTask, identity);
  assert.equal(state.data().activeTask.actualSeconds, 12);
  assert.equal(state.notes(), "Never persist this scratchpad");
  client.data.activeTask = task(client.data, { id: "task-2", status: "active" });
  client.data.revision++;
  client.onQueueChange();
  assert.equal(state.notes(), "");
});

test("running timers lock the view, but completing a mutation can select Today", async (t) => {
  const env = environment(t);
  const client = plannerClient();
  client.data.activeTask = task(client.data, { status: "active", startedAt: client.data.serverNow });
  const { state } = env.mount(() => createPlanner(client));
  await settle();
  state.visit("profile");
  assert.equal(state.view(), "focus");
  assert.equal(state.focusLocked(), true);
  assert.equal(await state.mutate(async () => { client.data.activeTask = null; state.visit("today"); }), true);
  assert.equal(state.view(), "today");
  assert.equal(state.busy(), false);
  assert.equal(await state.mutate(async () => { throw new Error("Save failed"); }), false);
  assert.equal(state.error(), "Save failed");
  assert.equal(state.busy(), false);
});

test("planner disposal removes timers, listeners and queue subscriptions", async (t) => {
  const env = environment(t);
  const client = plannerClient();
  const { dispose } = env.mount(() => createPlanner(client));
  await settle();
  assert.deepEqual([...env.timers.values()].map(({ delay }) => delay).sort((a, b) => a - b), [POLLING.clock, POLLING.dashboard]);
  dispose();
  assert.equal(env.timers.size, 0);
  const reads = client.reads;
  env.window.dispatchEvent(new Event("focus"));
  env.document.dispatchEvent(new Event("visibilitychange"));
  client.onQueueChange();
  await settle();
  assert.equal(client.reads, reads);
  assert.equal(client.syncs, 0);
});

test("a late dashboard response cannot update a disposed planner", async (t) => {
  const env = environment(t);
  const pending = deferred();
  const client = { ...plannerClient(), cachedDashboard: () => null, dashboard: () => pending.promise };
  const { state, dispose } = env.mount(() => createPlanner(client));
  dispose();
  pending.resolve(dashboard());
  await settle();
  assert.equal(state.data(), null);
  assert.equal(env.timers.size, 0);
});

test("a preference write cannot be overwritten by an older weekly-review read", async (t) => {
  const env = environment(t);
  const pending = deferred();
  const client = {
    weeklyOverview: () => pending.promise,
    generateIfDue: async () => {},
    setWeeklyAiEnabled: async (enabled) => overview({ settings: { enabled }, status: "disabled" }),
  };
  const { state } = env.mount(() => createWeeklyReview(client, () => true));
  await state.setEnabled(false);
  assert.equal(state.data().settings.enabled, false);
  pending.resolve(overview());
  await settle();
  assert.equal(state.data().settings.enabled, false);
  assert.equal(state.error(), "");
});

test("pending-review polling follows visibility and is disposed with its owner", async (t) => {
  const env = environment(t);
  const [visible, setVisible] = createSignal(true);
  let checks = 0;
  const client = {
    weeklyOverview: async () => overview({ status: "pending" }),
    generateIfDue: async () => { checks++; },
  };
  const { dispose } = env.mount(() => createWeeklyReview(client, visible));
  await settle();
  assert.equal([...env.timers.values()].filter(({ delay }) => delay === POLLING.pendingReview).length, 1);
  setVisible(false);
  assert.equal([...env.timers.values()].filter(({ delay }) => delay === POLLING.pendingReview).length, 0);
  dispose();
  assert.equal(env.timers.size, 0);
  const before = checks;
  env.window.dispatchEvent(new Event("focus"));
  env.document.dispatchEvent(new Event("visibilitychange"));
  setVisible(true);
  await settle();
  assert.equal(checks, before);
});

test("disposing during authentication cannot start an outbox or new subscriptions", async (t) => {
  environment(t);
  const pending = deferred();
  const commands = [];
  let disposals = 0;
  const transport = {
    onAccountChange: () => {},
    execute: async (command) => { commands.push(command); return pending.promise; },
    dispose: async () => { disposals++; },
  };
  const client = new PlanningClient(transport);
  const restoring = client.authStatus();
  await client.dispose();
  pending.resolve({ configured: true, email: "fixture@example.test", accountKey: "fixture:account" });
  await assert.rejects(restoring, /client is closed/);
  await client.dispose();
  assert.equal(disposals, 1);
  assert.deepEqual(commands, ["auth_status"]);
  await assert.rejects(client.dashboard(), /client is closed/);
});

test("late weekly-review reads are ignored after disposal", async (t) => {
  const env = environment(t);
  const pending = deferred();
  const client = { weeklyOverview: () => pending.promise, generateIfDue: async () => {} };
  const { state, dispose } = env.mount(() => createWeeklyReview(client, () => true));
  dispose();
  pending.resolve(overview());
  await settle();
  assert.equal(state.data(), null);
  assert.equal(env.timers.size, 0);
});
