import { createSignal } from "solid-js";

export type HintId =
  "start" | "pause" | "progress" | "shortcuts" | `evening:${string}`;

const hintKey = (accountKey: string, id: HintId) =>
  `prune:hint:v1:${accountKey}:${id}`;
const visitsKey = (accountKey: string) => `prune:visits:v1:${accountKey}`;

/** One-time, just-in-time teaching remembered per account on this device. */
export function createHints(accountKey: string) {
  const [dismissed, setDismissed] = createSignal(new Set<HintId>());
  let visits = 0;
  try {
    visits = Number(localStorage.getItem(visitsKey(accountKey)) ?? 0) + 1;
    localStorage.setItem(visitsKey(accountKey), String(visits));
  } catch {
    /* Hints remain usable without persistence. */
  }

  function seen(id: HintId): boolean {
    if (dismissed().has(id)) return true;
    try {
      return localStorage.getItem(hintKey(accountKey, id)) !== null;
    } catch {
      return false;
    }
  }

  function dismiss(id: HintId): void {
    if (seen(id)) return;
    setDismissed((current) => new Set(current).add(id));
    try {
      localStorage.setItem(hintKey(accountKey, id), "done");
    } catch {
      /* Dismissal still lasts for this page. */
    }
  }

  return { seen, dismiss, visits: () => visits };
}

export type Hints = ReturnType<typeof createHints>;
