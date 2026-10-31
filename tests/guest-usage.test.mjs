import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { GuestStore } from '../src/planner/guest.ts';
import { guestUsage } from '../src/planner/guest-usage.ts';

const timezone = 'UTC';
function store() {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    locks: { request: async (_name, work) => work() },
  } });
  const reports = [];
  return { guest: new GuestStore(storage, (usage) => reports.push(usage)), storage, reports };
}
const command = (action, at) => ({ requestId: crypto.randomUUID(), action, args: {}, timezone, at, revision: 0 });

test('guest actions report daily totals without task content', async () => {
  const { guest, reports } = store();
  const day = guest.dashboard().today;
  const task = await guest.mutate('create_task', { outcome: 'Private title', day, estimatedMinutes: 30 }, timezone);
  await guest.mutate('create_task', { outcome: 'Another', day, estimatedMinutes: 15 }, timezone);
  await guest.mutate('rename_task', { id: task.id, outcome: 'Renamed' }, timezone);
  await guest.mutate('start_task', { id: task.id }, timezone);
  await guest.mutate('complete_task', { id: task.id }, timezone);
  assert.deepEqual(reports, [
    { new_guests: 1, active_guests: 1, tasks_created: 1 },
    { tasks_created: 1 },
    {},
    { tasks_started: 1 },
    { tasks_completed: 1 },
  ]);
  assert.doesNotMatch(JSON.stringify(reports), /Private|Another|Renamed/);
});

test('a later day counts the device as active and returning once', () => {
  const yesterday = command('create_task', Date.parse('2026-10-30T12:00:00Z') / 1000);
  const today = command('create_task', Date.parse('2026-10-31T09:00:00Z') / 1000);
  const task = { actualSeconds: 0 };
  assert.deepEqual(guestUsage([yesterday], today, task), { active_guests: 1, returning_guests: 1, tasks_created: 1 });
  assert.deepEqual(guestUsage([yesterday, today], { ...today, action: 'start_task' }, task), { tasks_started: 1 });
});

test('completion reports focus minutes, capped at one day and omitted when zero', () => {
  const at = Date.parse('2026-10-31T09:00:00Z') / 1000;
  const previous = [command('create_task', at)];
  const complete = command('complete_task', at);
  assert.deepEqual(guestUsage(previous, complete, { actualSeconds: 1530 }), { tasks_completed: 1, focus_minutes: 26 });
  assert.deepEqual(guestUsage(previous, complete, { actualSeconds: 10 ** 7 }), { tasks_completed: 1, focus_minutes: 1440 });
  assert.deepEqual(guestUsage(previous, complete, { actualSeconds: 20 }), { tasks_completed: 1 });
});

test('nothing is reported when the guest save fails', async () => {
  const { guest, storage, reports } = store();
  storage.setItem = () => { throw new Error('quota'); };
  await assert.rejects(guest.mutate('create_task', {
    outcome: 'Task', day: guest.dashboard().today, estimatedMinutes: 30,
  }, timezone), /quota/);
  assert.deepEqual(reports, []);
});

async function database() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(readFileSync(new URL('../supabase/migrations/20261031000100_guest_usage.sql', import.meta.url), 'utf8'));
  return db;
}
const record = (db, metrics) => db.exec(`set role anon; select public.guest_record_usage('${JSON.stringify(metrics)}'::jsonb); reset role;`);
const totals = async (db) => Object.fromEntries((await db.query('select metric, total::int as total from public.guest_usage_daily')).rows.map((row) => [row.metric, row.total]));

test('anon adds to daily totals only through the bounded function', async () => {
  const db = await database();
  try {
    await record(db, { new_guests: 1, active_guests: 1, tasks_created: 1 });
    await record(db, { tasks_created: 1, tasks_started: 0 });
    await record(db, { tasks_completed: 1, focus_minutes: 1440 });
    assert.deepEqual(await totals(db), { new_guests: 1, active_guests: 1, tasks_created: 2, tasks_completed: 1, focus_minutes: 1440 });
    for (const metrics of [{ tasks_created: 2 }, { focus_minutes: 1441 }, { tasks_created: -1 }, { tasks_created: 1.5 }, { tasks_created: '1' }, { outcome: 1 }, []]) {
      await db.exec('reset role');
      await assert.rejects(record(db, metrics), /Invalid guest usage/, JSON.stringify(metrics));
    }
    await db.exec('reset role');
    assert.equal((await totals(db)).tasks_created, 2);
    await db.exec('set role anon');
    await assert.rejects(db.exec(`insert into public.guest_usage_daily values (current_date, 'tasks_created', 100)`), /permission denied/);
    await assert.rejects(db.query('select * from public.guest_usage_daily'), /permission denied/);
    await db.exec('reset role; set role authenticated');
    await assert.rejects(db.exec(`select public.guest_record_usage('{"tasks_created":1}')`), /permission denied/);
  } finally { await db.close(); }
});
