import type { CloudTransport } from "./commands.ts";
import { errorCode } from "./errors.ts";
import { CloudError } from "./http-error.ts";
import { LocalQueue, QUEUE_STORAGE_VERSION } from "./local-queue.ts";
import type { Dashboard, Task } from "./types.ts";

const QUEUE_PROTOCOL_VERSION = 1;
const UNSUPPORTED_PROTOCOL =
  "The server does not support this queue version. Apply Supabase migration 20261017000300_local_queue.sql. Your changes remain on this device; no queued writes were sent.";

/** Browser coordination and protocol negotiation, separate from outbox persistence. */
export function createAccountQueue(
  accountKey: string,
  timezone: string,
  request: CloudTransport["execute"],
  onChange: () => void,
) {
  if (!navigator.locks)
    throw new Error(
      "Safe local saving requires HTTPS and a browser with Web Locks support. Update your browser before using prune.",
    );

  let ready: Promise<void> | null = null;
  const storageKey = `pro:planner:v${QUEUE_STORAGE_VERSION}:${accountKey}`;
  const queue = new LocalQueue(
    storageKey,
    localStorage,
    async (name, work) => navigator.locks.request(name, work),
    async (command) => {
      // Never send retryable writes to a server that ignores idempotency keys.
      ready ??= request<{ version: number }>("planner_call", {
        action: "queue_protocol",
        args: {},
        timezone,
      })
        .then((protocol) => {
          if (protocol?.version !== QUEUE_PROTOCOL_VERSION)
            throw new CloudError("configuration", UNSUPPORTED_PROTOCOL);
        })
        .catch((error: unknown) => {
          ready = null;
          // Older dispatchers reject queue_protocol. This is not a rejected write:
          // the outbox must remain retryable, never discardable.
          if (errorCode(error) === "validation")
            throw new CloudError("configuration", UNSUPPORTED_PROTOCOL);
          throw error;
        });
      await ready;
      return request<Task>("planner_call", {
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
      request<Dashboard>("planner_call", {
        action: "dashboard",
        args: { _accountKey: accountKey },
        timezone,
      }),
  );
  queue.onChange = onChange;
  const online = () => void queue.sync();
  const storage = (event: StorageEvent) => {
    if (event.key === storageKey) void queue.refreshFromStorage();
  };
  window.addEventListener("online", online);
  window.addEventListener("storage", storage);
  return {
    queue,
    dispose() {
      window.removeEventListener("online", online);
      window.removeEventListener("storage", storage);
    },
  };
}
