import type { Dashboard } from "../planner/types";

import { trackedSeconds } from "../planner/task-model.ts";
import { DAY_MS } from "../planner/time.ts";
const dayNumber = (day: string): number =>
  Date.parse(`${day}T00:00:00Z`) / DAY_MS;

/** Live focus work is bounded by today's plan, not the size of the history. */
export function todayFocusSeconds(
  data: Dashboard,
  now = data.serverNow,
): number {
  return data.todayTasks.reduce(
    (sum, task) => sum + trackedSeconds(task, now),
    0,
  );
}

/** Calendar arithmetic uses date keys, not elapsed local hours (which vary across DST). */
export function profileStats(data: Dashboard, now = data.serverNow) {
  const today = dayNumber(data.today);
  const weekday = new Date(today * DAY_MS).getUTCDay();
  const weekStart = today - ((weekday + 6) % 7); // Monday–Sunday, like weekly reviews.
  const monthStart = dayNumber(`${data.today.slice(0, 7)}-01`);
  const counts = new Map<number, number>();
  let totalCompleted = 0;
  let weekCompleted = 0;
  let monthCompleted = 0;
  for (const { day, count } of data.completions) {
    const date = dayNumber(day);
    if (date <= today && count > 0) {
      counts.set(date, (counts.get(date) ?? 0) + count);
      totalCompleted += count;
      if (date >= weekStart) weekCompleted += count;
      if (date >= monthStart) monthCompleted += count;
    }
  }
  // Walk each run once rather than sorting the entire history.
  let bestStreak = 0;
  for (const day of counts.keys()) {
    if (counts.has(day - 1)) continue;
    let streak = 1;
    while (counts.has(day + streak)) streak++;
    bestStreak = Math.max(bestStreak, streak);
  }
  // A streak remains current until an entire day passes without a completion.
  let currentStreak = 0;
  for (let day = counts.has(today) ? today : today - 1; counts.has(day); day--)
    currentStreak++;
  return {
    totalCompleted,
    activeDays: counts.size,
    currentStreak,
    bestStreak,
    todayCompleted: counts.get(today) ?? 0,
    weekCompleted,
    monthCompleted,
    // The dashboard does not contain historical focus totals. Keep this metric explicitly scoped.
    todayFocusSeconds: todayFocusSeconds(data, now),
    todayEstimatedMinutes: data.todayTasks.reduce(
      (sum, task) => sum + task.estimatedMinutes,
      0,
    ),
  };
}
