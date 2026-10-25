import test from "node:test";
import assert from "node:assert/strict";
import { calendarYear } from "../src/planner/activity-calendar-model.ts";

test("calendar includes leap day and positions Sunday-first weeks", () => {
  const calendar = calendarYear(2024, "2024-12-31", []);
  assert.equal(calendar.days.length, 366);
  assert.equal(calendar.days[0].day, "2024-01-01");
  assert.equal(calendar.days[0].row, 1);
  assert.equal(calendar.days[0].week, 0);
  assert.equal(calendar.days[6].row, 0);
  assert.equal(calendar.days[6].week, 1);
  assert.equal(calendar.days.at(-1).day, "2024-12-31");
  assert.equal(calendar.weeks, 53);
});

test("rolling year crosses December and ignores future/out-of-range completions", () => {
  const calendar = calendarYear(2023, "2023-11-15", [
    { day: "2023-10-31", count: 10 },
    { day: "2023-11-01", count: 2 },
    { day: "2023-11-15", count: 1 },
    { day: "2023-11-16", count: 4 },
    { day: "2024-11-01", count: 10 },
  ], 10);
  assert.equal(calendar.days[0].day, "2023-11-01");
  assert.equal(calendar.days.at(-1).day, "2024-10-31");
  assert.equal(calendar.days.length, 366);
  assert.equal(calendar.total, 3);
  assert.equal(calendar.days.find((day) => day.day === "2023-11-15").future, false);
  assert.equal(calendar.days.find((day) => day.day === "2023-11-16").count, 0);
  assert.equal(calendar.days.find((day) => day.day === "2023-11-16").future, true);
});

test("ordinary year has 365 days with zero completion defaults", () => {
  const calendar = calendarYear(2025, "2025-01-01", []);
  assert.equal(calendar.days.length, 365);
  assert.equal(calendar.total, 0);
  assert.equal(calendar.days.filter((day) => !day.future).length, 1);
  assert.ok(calendar.days.every((day) => day.count === 0));
});
