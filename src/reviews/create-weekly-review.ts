import { createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import type { PlanningClient } from "../planner/api";
import { POLLING } from "../planner/constants.ts";
import type { WeeklyOverview } from "../planner/types";

/** AI requests never lock tasks or timers; preference writes invalidate older reads. */
export function createWeeklyReview(
  client: PlanningClient,
  visible: () => boolean,
) {
  const [data, setData] = createSignal<WeeklyOverview | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");
  let loading = false;
  let version = 0;
  let disposed = false;

  function apply(next: WeeklyOverview): void {
    setData((previous) =>
      JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
    );
  }

  async function refresh(): Promise<void> {
    if (loading || saving() || disposed) return;
    loading = true;
    const startedVersion = version;
    try {
      const next = await client.weeklyOverview();
      if (disposed || startedVersion !== version) return;
      apply(next);
      setError("");
    } catch {
      if (!disposed && startedVersion === version)
        setError(
          "Could not load your weekly review. Tasks and timers still work normally.",
        );
    } finally {
      loading = false;
    }
  }

  async function checkDue(): Promise<void> {
    if (disposed) return;
    await client.generateIfDue().catch(() => {
      /* Server quotas enforce backoff. */
    });
    if (!disposed && visible()) await refresh();
  }

  async function setEnabled(enabled: boolean): Promise<void> {
    if (saving() || disposed) return;
    version++;
    setSaving(true);
    setError("");
    try {
      const next = await client.setWeeklyAiEnabled(enabled);
      if (!disposed) apply(next);
    } catch {
      if (!disposed) setError("Could not save AI settings. Please try again.");
    } finally {
      if (!disposed) setSaving(false);
    }
    if (enabled && !error() && !disposed && data()?.settings.enabled)
      await checkDue();
  }

  createEffect(
    on(visible, (isVisible) => {
      if (isVisible) void refresh();
    }),
  );
  createEffect(() => {
    const pending =
      data()?.status === "pending" || data()?.status === "running";
    if (!visible() || !pending) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, POLLING.pendingReview);
    onCleanup(() => window.clearInterval(timer));
  });
  onMount(() => {
    const wake = () => {
      if (document.visibilityState !== "hidden") void checkDue();
    };
    const timer = window.setInterval(() => {
      void checkDue();
    }, POLLING.weeklyReview);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    void checkDue();
    onCleanup(() => {
      disposed = true;
      version++;
      window.clearInterval(timer);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    });
  });

  return { data, saving, error, refresh, setEnabled };
}

export type WeeklyReviewState = ReturnType<typeof createWeeklyReview>;
