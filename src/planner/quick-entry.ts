import { ESTIMATE } from "./constants.ts";
import type { Task } from "./types.ts";
import { trackedSeconds } from "./task-model.ts";

const TRAILING_DURATION =
  /\s+(?:(\d{1,2})\s*h(?:rs?|ours?)?)?\s*(?:(\d{1,3})\s*m(?:ins?|inutes?)?)?\s*$/i;

/** Todoist-style quick entry: "Write the brief 45m" → outcome + estimate. */
export function parseQuickEntry(text: string): {
  outcome: string;
  minutes: number | null;
} {
  const match = TRAILING_DURATION.exec(text);
  if (!match || (match[1] === undefined && match[2] === undefined))
    return { outcome: text, minutes: null };
  const outcome = text.slice(0, match.index).trim();
  if (!outcome) return { outcome: text, minutes: null };
  const total = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
  const rounded = Math.round(total / ESTIMATE.step) * ESTIMATE.step;
  return {
    outcome,
    minutes: Math.max(ESTIMATE.min, Math.min(ESTIMATE.max, rounded)),
  };
}

/** Sunsama-style day load: what's left, what's done, and when it would end. */
export function summarizeDay(tasks: readonly Task[], now: number) {
  let remainingSeconds = 0;
  let focusedSeconds = 0;
  let completed = 0;
  for (const task of tasks) {
    const tracked = trackedSeconds(task, now);
    focusedSeconds += tracked;
    if (task.status === "completed") completed += 1;
    else remainingSeconds += Math.max(0, task.estimatedMinutes * 60 - tracked);
  }
  return {
    completed,
    remainingSeconds,
    focusedSeconds,
    finishAt: remainingSeconds > 0 ? now + remainingSeconds : null,
  };
}

export function formatMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (!hours) return `${minutes} min`;
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

export function formatClock(seconds: number): string {
  return new Date(seconds * 1000).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDayHeading(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function greeting(seconds: number): string {
  const hour = new Date(seconds * 1000).getHours();
  return hour < 5
    ? "Working late"
    : hour < 12
      ? "Good morning"
      : hour < 18
        ? "Good afternoon"
        : "Good evening";
}
