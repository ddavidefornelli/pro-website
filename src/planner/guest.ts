import { applyCommand, project, type QueuedAction } from "./local-queue.ts";
import { DAY_MS, localDay } from "./time.ts";
import type { Dashboard, Task } from "./types.ts";

export const GUEST_KEY = "prune:guest:v1";
export const GUEST_ACCOUNT = {
  configured: true,
  email: "Guest · this device only",
  accountKey: "guest",
};
export interface GuestImport {
  importId: string;
  tasks: Task[];
  stops: { taskId: string; reason: string; at: number; day: string }[];
}
interface GuestState {
  version: 1;
  base: Dashboard;
  commands: QueuedAction[];
  transfer?: { accountKey: string; importId: string };
}
export function emptyGuestDashboard(
  now = Math.floor(Date.now() / 1000),
): Dashboard {
  const today = localDay(now, Intl.DateTimeFormat().resolvedOptions().timeZone);
  return {
    today,
    tomorrow: new Date(Date.parse(`${today}T00:00:00Z`) + DAY_MS)
      .toISOString()
      .slice(0, 10),
    todayTasks: [],
    tomorrowTasks: [],
    activeTask: null,
    canPlanTomorrow: true,
    completions: [],
    serverNow: now,
    revision: 0,
  };
}

/** The original command journal is retained until every server receipt is confirmed. */
export class GuestStore {
  private readonly storage: Storage;
  constructor(storage: Storage = localStorage) {
    this.storage = storage;
  }
  private load(): GuestState {
    const raw = this.storage.getItem(GUEST_KEY);
    if (!raw) return { version: 1, base: emptyGuestDashboard(), commands: [] };
    const state = JSON.parse(raw) as GuestState;
    if (state.version !== 1 || !state.base || !Array.isArray(state.commands))
      throw new Error(
        "Guest data could not be read. Do not clear browser storage.",
      );
    return state;
  }
  private save(state: GuestState): void {
    this.storage.setItem(GUEST_KEY, JSON.stringify(state));
  }
  private async lock<T>(work: () => Promise<T>): Promise<T> {
    if (!navigator.locks)
      throw new Error(
        "Safe local saving requires HTTPS and a browser with Web Locks support.",
      );
    return await navigator.locks.request(GUEST_KEY, work);
  }
  hasTasks(): boolean {
    return this.load().commands.length > 0;
  }
  dashboard(): Dashboard {
    const state = this.load();
    let data = state.base;
    for (const command of state.commands) data = project(data, command);
    const fresh = emptyGuestDashboard();
    const tasks = [...data.todayTasks, ...data.tomorrowTasks];
    return {
      ...data,
      today: fresh.today,
      tomorrow: fresh.tomorrow,
      todayTasks: tasks.filter((task) => task.plannedFor === fresh.today),
      tomorrowTasks: tasks.filter((task) => task.plannedFor === fresh.tomorrow),
      serverNow: fresh.serverNow,
    };
  }
  async mutate(
    action: string,
    args: Record<string, unknown>,
    timezone: string,
  ): Promise<Task> {
    return this.lock(async () => {
      const state = this.load();
      if (state.transfer)
        throw new Error(
          "Guest tasks are being saved to an account. Finish Save & sync before making more changes.",
        );
      const data = this.dashboard();
      if (action === "create_task") {
        if (
          !String(args.outcome).trim() ||
          String(args.outcome).trim().length > 500
        )
          throw new Error("Enter a task of 1–500 characters.");
        if (![data.today, data.tomorrow].includes(String(args.day)))
          throw new Error("Choose today or tomorrow.");
        const tasks =
          args.day === data.today ? data.todayTasks : data.tomorrowTasks;
        if (tasks.length >= 3)
          throw new Error("Focus on just 3 tasks per day.");
      }
      const selected = [
        ...data.todayTasks,
        ...data.tomorrowTasks,
        ...(data.activeTask ? [data.activeTask] : []),
      ].find((task) => task.id === args.id);
      if (
        ["start_task", "resume_task"].includes(action) &&
        data.activeTask &&
        data.activeTask.id !== args.id
      )
        throw new Error("Finish the active task before starting another.");
      if (selected?.status === "completed" && action !== "save_pause_reason")
        throw new Error("This task is already complete.");
      if (action === "start_task" && selected?.plannedFor !== data.today)
        throw new Error("Only today's tasks can be started.");
      if (["create_task", "change_estimate"].includes(action)) {
        const minutes = Number(
          action === "create_task" ? args.estimatedMinutes : args.minutes,
        );
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60)
          throw new Error("Choose an estimate between 1 and 60 minutes.");
      }
      const command: QueuedAction = {
        requestId: crypto.randomUUID(),
        action,
        args,
        timezone,
        at: Math.floor(Date.now() / 1000),
        revision: state.commands.length,
      };
      const next = project(data, command);
      const id = action === "create_task" ? command.requestId : args.id;
      const task = [
        ...next.todayTasks,
        ...next.tomorrowTasks,
        ...(next.activeTask ? [next.activeTask] : []),
      ].find((item) => item.id === id);
      // A completed task from an older day can leave the visible dashboard.
      const previous = data.activeTask;
      state.commands.push(command);
      this.save(state); // Never report success before durable storage succeeds.
      return task ?? { ...previous!, status: "completed", startedAt: null };
    });
  }
  async transfer(
    accountKey: string,
    send: (payload: GuestImport) => Promise<{ imported: boolean }>,
  ): Promise<void> {
    await this.lock(async () => {
      const state = this.load();
      if (!state.commands.length) return;
      if (state.transfer && state.transfer.accountKey !== accountKey)
        throw new Error(
          "These guest tasks are already being saved to a different account. Sign in to that account to finish.",
        );
      state.transfer ??= { accountKey, importId: crypto.randomUUID() };
      this.save(state);
      const tasks = new Map<string, Task>();
      const stops: GuestImport["stops"] = [];
      const data = structuredClone(state.base);
      for (const command of state.commands) {
        // Keep the full task history outside the dashboard's two-day window.
        data.todayTasks = [...tasks.values()];
        data.tomorrowTasks = [];
        const selected = tasks.get(String(command.args.id));
        if (selected) data.activeTask = selected;
        const task = applyCommand(data, command);
        tasks.set(task.id, structuredClone(task));
        if (command.action === "save_pause_reason")
          stops.push({
            taskId: task.id,
            reason: String(command.args.reason),
            at: command.at,
            day: localDay(command.at, command.timezone),
          });
      }
      const result = await send({
        importId: state.transfer.importId,
        tasks: [...tasks.values()],
        stops,
      });
      if (result?.imported !== true)
        throw new Error(
          "Task transfer was not confirmed. Your guest tasks are still on this device. Retry Save & sync.",
        );
      this.storage.removeItem(GUEST_KEY);
    });
  }
}
