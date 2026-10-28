import type { Dashboard } from "./api";
import { DAY_MS } from "./time.ts";

export type Completion = Dashboard["completions"][number];
export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
export function calendarYear(
  year: number,
  today: string,
  completions: readonly Completion[],
  startMonth = 0,
) {
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year + 1, startMonth, 0));
  const offset = start.getUTCDay();
  const dayCount = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  const weeks = Math.ceil((offset + dayCount) / 7);
  const counts = new Map(completions.map(({ day, count }) => [day, count]));
  const days = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start.getTime() + index * DAY_MS);
    const day = date.toISOString().slice(0, 10);
    return {
      day,
      row: date.getUTCDay(),
      week: Math.floor((offset + index) / 7),
      count: day <= today ? (counts.get(day) ?? 0) : 0,
      future: day > today,
      month: date.getUTCMonth(),
    };
  });
  return { weeks, days, total: days.reduce((sum, day) => sum + day.count, 0) };
}

export type CalendarYear = ReturnType<typeof calendarYear>;
export type CalendarDay = CalendarYear["days"][number];
