import { BrowserCloud } from "./browser.ts";
import { LocalQueue, QUEUE_STORAGE_VERSION } from "./local-queue.ts";

import type { AuthStatus, Dashboard, Task, WeeklyOverview } from "./types";
import { WEEKLY_AI_VERSION } from "./constants.ts";

// Keep the public type surface compatible with the in-progress auth transport.
export type {
  AuthStatus,
  Dashboard,
  Task,
  WeeklyOverview,
  WeeklyReview,
  ReviewStop,
} from "./types";

interface CloudTransport {
  onAccountChange: () => void;
  execute<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  dispose(): Promise<void>;
}

/** Shared planner/outbox behavior, independent of rendering and transport details. */
export class PlanningClient {
  private readonly cloud: CloudTransport;
  private disposed = false;
  constructor(cloud: CloudTransport = new BrowserCloud()) {
    this.cloud = cloud;
    this.cloud.onAccountChange = () => {
      void this.queue?.stop();
      window.location.reload();
    };
  }
  private readonly timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  private queue: LocalQueue | null = null;
  private accountKey: string | null = null;
  private queueReady: Promise<void> | null = null;
  private readonly cleanups: (() => void)[] = [];

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.onQueueChange = () => {};
    this.cloud.onAccountChange = () => {};
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    await Promise.all([this.queue?.stop(), this.cloud.dispose()]);
  }
  onQueueChange: () => void = () => {};
  get pendingCount(): number {
    return this.queue?.pendingCount ?? 0;
  }
  get syncBlocked(): boolean {
    return this.queue?.blocked ?? false;
  }
  cachedDashboard(): Dashboard | null {
    return this.queue?.snapshot() ?? null;
  }
  sync(): Promise<void> {
    return this.queue?.sync() ?? Promise.resolve();
  }
  discardPending(): Promise<void> {
    return this.queue?.discardPending() ?? Promise.resolve();
  }

  private prepareQueue(accountKey: string): void {
    if (this.queue) {
      if (accountKey !== this.accountKey)
        throw new Error(
          "The account changed. Reload before accessing planner data.",
        );
      return;
    }
    if (!navigator.locks)
      throw new Error(
        "Safe local saving requires HTTPS and a browser with Web Locks support. Update your browser before using prune.",
      );
    this.accountKey = accountKey;
    const storageKey = `pro:planner:v${QUEUE_STORAGE_VERSION}:${accountKey}`;
    this.queue = new LocalQueue(
      storageKey,
      localStorage,
      async (name, work) => await navigator.locks.request(name, work),
      async (command) => {
        // Never send retryable writes to an old server that ignores idempotency keys.
        if (!this.queueReady)
          this.queueReady = this.request<{ version: number }>("planner_call", {
            action: "queue_protocol",
            args: {},
            timezone: this.timezone,
          })
            .then((protocol) => {
              if (protocol?.version !== 1)
                throw {
                  code: "configuration",
                  message:
                    "The server does not support this queue version. Apply Supabase migration 20261017000300_local_queue.sql. Your changes remain on this device; no queued writes were sent.",
                };
            })
            .catch((error: unknown) => {
              this.queueReady = null;
              if (
                typeof error === "object" &&
                error !== null &&
                "code" in error &&
                error.code === "validation"
              ) {
                // Older planner dispatchers reject queue_protocol. Keep this
                // retryable: no mutation has been sent and the outbox must not block.
                throw {
                  code: "configuration",
                  message:
                    "The server does not support queued sync. Apply Supabase migration 20261017000300_local_queue.sql. Your changes remain on this device; no queued writes were sent.",
                };
              }
              // Transport errors are already sanitized. Preserve network/auth/server
              // failures rather than incorrectly diagnosing a missing migration.
              throw error;
            });
        await this.queueReady;
        return this.request<Task>("planner_call", {
          action: command.action,
          timezone: command.timezone,
          args: {
            ...command.args,
            _requestId: command.requestId,
            _at: command.at,
            _revision: command.revision,
            _accountKey: accountKey,
          },
        });
      },
      () =>
        this.request<Dashboard>("planner_call", {
          action: "dashboard",
          args: { _accountKey: accountKey },
          timezone: this.timezone,
        }),
    );
    this.queue.onChange = () => this.onQueueChange();
    const online = () => {
      void this.sync();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === storageKey) void this.queue?.refreshFromStorage();
    };
    window.addEventListener("online", online);
    window.addEventListener("storage", storage);
    this.cleanups.push(() => {
      window.removeEventListener("online", online);
      window.removeEventListener("storage", storage);
    });
  }

  private async request<T>(
    command: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    if (this.disposed) throw new Error("The planner client is closed.");
    try {
      const result = await this.cloud.execute<T>(command, args);
      if (this.disposed) throw new Error("The planner client is closed.");
      return result;
    } catch (error) {
      if (this.disposed) throw error;
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "account_deleted"
      ) {
        await this.cloud.execute("sign_out");
        window.location.reload();
      }
      if (
        this.accountKey &&
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        ["unauthorized", "account_changed"].includes(String(error.code))
      ) {
        // Invalid credentials or another window's account switch must clear old UI state.
        window.location.reload();
      }
      throw error;
    }
  }
  private call<T>(
    action: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    if (this.disposed)
      return Promise.reject(new Error("The planner client is closed."));
    if (
      !["dashboard", "weekly_overview", "set_weekly_ai_enabled"].includes(
        action,
      )
    ) {
      if (!this.queue)
        return Promise.reject(
          new Error("Sign in and load your planner before making changes."),
        );
      return this.queue.enqueue(action, args, this.timezone) as Promise<T>;
    }
    return this.request("planner_call", {
      action,
      args: {
        ...args,
        ...(this.accountKey ? { _accountKey: this.accountKey } : {}),
      },
      timezone: this.timezone,
    });
  }
  private async loadAccount(status: AuthStatus): Promise<AuthStatus> {
    if (status.accountKey) {
      // Identity has already been verified with Auth. A planner-only network
      // outage may use that account's existing cache, never another identity's.
      this.prepareQueue(status.accountKey);
      let account: { isDeleted: boolean };
      try {
        account = await this.request("planner_call", {
          action: "account_status",
          args: { _accountKey: status.accountKey },
          timezone: this.timezone,
        });
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "network" &&
          this.cachedDashboard()
        )
          return status;
        throw error;
      }
      if (account.isDeleted) {
        await this.queue?.stop();
        await this.request("sign_out");
        throw new Error(
          "This account has been marked for deletion and can no longer be used.",
        );
      }
    }
    return status;
  }
  async authStatus(): Promise<AuthStatus> {
    return this.loadAccount(await this.request<AuthStatus>("auth_status"));
  }
  async sendCode(email: string): Promise<void> {
    await this.request("send_code", { email });
  }
  async verifyCode(email: string, code: string): Promise<AuthStatus> {
    return this.loadAccount(
      await this.request<AuthStatus>("verify_code", { email, code }),
    );
  }
  async signOut(): Promise<void> {
    await this.queue?.stop();
    try {
      await this.request("sign_out");
    } catch (error) {
      if (!this.disposed) this.queue?.resume();
      throw error;
    }
  }
  async deleteAccount(): Promise<void> {
    // Deletion is an online account operation, never an optimistic queued write.
    await this.queue?.stop();
    try {
      const result = await this.request<{ isDeleted: boolean }>(
        "planner_call",
        {
          action: "delete_account",
          args: { _accountKey: this.accountKey },
          timezone: this.timezone,
        },
      );
      if (result?.isDeleted !== true)
        throw new Error(
          "Account deletion was not confirmed. Please try again.",
        );
    } catch (error) {
      if (!this.disposed) this.queue?.resume();
      throw error;
    }
    // Do not resume the outbox if local sign-out fails after confirmed deletion.
    await this.request("sign_out");
  }
  private generatingReview = false;
  async generateIfDue(): Promise<void> {
    if (this.generatingReview) return;
    this.generatingReview = true;
    try {
      const overview = await this.weeklyOverview();
      if (
        overview.settings.enabled &&
        overview.available &&
        ["pending", "failed"].includes(overview.status)
      ) {
        await this.retryWeeklyReview();
      }
    } finally {
      this.generatingReview = false;
    }
  }
  async dashboard(): Promise<Dashboard> {
    if (this.disposed) throw new Error("The planner client is closed.");
    if (!this.queue) return this.call("dashboard");
    let cached = this.queue.snapshot();
    if (!cached) {
      await this.queue.sync();
      cached = this.queue.snapshot();
    } else void this.queue.sync();
    if (!cached) throw new Error(this.queue.status);
    return cached;
  }

  weeklyOverview(): Promise<WeeklyOverview> {
    return this.call("weekly_overview");
  }

  setWeeklyAiEnabled(enabled: boolean): Promise<WeeklyOverview> {
    return this.call("set_weekly_ai_enabled", {
      enabled,
      consentVersion: WEEKLY_AI_VERSION,
    });
  }

  retryWeeklyReview(): Promise<void> {
    return this.request("generate_weekly_review", { timezone: this.timezone });
  }

  create(
    outcome: string,
    day: string,
    estimatedMinutes: number,
  ): Promise<Task> {
    return this.call("create_task", { outcome, day, estimatedMinutes });
  }

  rename(id: string, outcome: string): Promise<Task> {
    return this.call("rename_task", { id, outcome });
  }

  changeEstimate(id: string, minutes: number): Promise<Task> {
    return this.call("change_estimate", { id, minutes });
  }

  start(id: string): Promise<Task> {
    return this.call("start_task", { id });
  }

  stopTimer(id: string): Promise<Task> {
    return this.call("stop_timer", { id });
  }

  savePauseReason(id: string, reason: string): Promise<void> {
    return this.call("save_pause_reason", { id, reason });
  }

  resume(id: string): Promise<Task> {
    return this.call("resume_task", { id });
  }

  complete(id: string): Promise<Task> {
    return this.call("complete_task", { id });
  }
}
