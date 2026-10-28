import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createPlannerHandler, GatewayError } from '../server/planner-handler.ts';
import { resolveClerkIdentity } from '../server/clerk-identity.ts';
import { clerkOrigin } from '../src/planner/clerk-config.ts';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const identity = { userId: owner, email: 'owner@example.com' };
const user = { id: 'user_clerk', externalId: null, primaryEmailAddressId: 'email_1', emailAddresses: [{ id: 'email_1', emailAddress: identity.email, verification: { status: 'verified' } }] };
const request = (body, headers = {}) => new Request('https://www.prune.win/api/planner', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://www.prune.win', Authorization: 'Bearer fixture', ...headers }, body: JSON.stringify(body) });
const deps = (overrides = {}) => ({ allowedOrigins: new Set(['https://www.prune.win']), authenticate: async () => identity, planner: async (account, action, args) => ({ account, action, args }), review: async () => new Response('{}'), ...overrides });

test('gateway never chooses an owner from caller-supplied planner arguments', async () => {
  const result = await createPlannerHandler(deps())(request({ command: 'planner_call', args: { action: 'dashboard', timezone: 'UTC', args: { user_id: other } } }));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).account.userId, owner);
});
test('gateway rejects anonymous access, foreign origins, invalid commands, and oversized bodies', async () => {
  const denied = createPlannerHandler(deps({ authenticate: async () => { throw new GatewayError(401, 'unauthorized', 'Sign in.'); } }));
  assert.equal((await denied(request({ command: 'auth_status', args: {} }))).status, 401);
  const handler = createPlannerHandler(deps());
  assert.equal((await handler(request({ command: 'auth_status', args: {} }, { Origin: 'https://evil.test' }))).status, 403);
  assert.equal((await handler(request({ command: 'admin', args: {} }))).status, 400);
  assert.equal((await handler(request({ command: 'auth_status', userId: other, args: {} }))).status, 400);
  assert.equal((await handler(request({ command: 'auth_status', args: { huge: 'x'.repeat(70_000) } }))).status, 413);
});
test('gateway sanitizes unexpected database/credential diagnostics', async () => {
  const result = await createPlannerHandler(deps({ authenticate: async () => { throw new Error('sk_test_sensitive_diagnostic'); } }))(request({ command: 'auth_status', args: {} }));
  assert.equal(result.status, 503);
  assert.ok(!(await result.text()).includes('sk_test_sensitive'));
});
test('imported users retain UUIDs; no email-only automatic linking or unverified email provisioning', async () => {
  const calls = [];
  const store = { lookup: async () => null, existing: async id => { calls.push(id); return { email: identity.email }; }, create: async () => { throw new Error('must not create'); }, link: async (...args) => { calls.push(args); } };
  assert.deepEqual(await resolveClerkIdentity('instance', { ...user, externalId: owner }, store), identity);
  assert.deepEqual(calls, [owner, ['instance:user_clerk', owner]]);
  await assert.rejects(resolveClerkIdentity('instance', user, store), error => error.code === 'identity_migration_required');
  await assert.rejects(resolveClerkIdentity('instance', { ...user, emailAddresses: [] }, store), error => error.code === 'email_unverified');
  await assert.rejects(resolveClerkIdentity('instance', { ...user, externalId: 'not-a-uuid' }, store), error => error.code === 'identity_conflict');
});
test('mapped users cannot be reassigned by changing external ID; new users link only created UUID', async () => {
  const store = { lookup: async () => owner, existing: async () => null, create: async () => other, link: async () => {} };
  await assert.rejects(resolveClerkIdentity('instance', { ...user, externalId: other }, store), error => error.code === 'identity_conflict');
  const links = [];
  assert.deepEqual(await resolveClerkIdentity('instance', user, { ...store, lookup: async () => null, link: async (...args) => links.push(args) }), { ...identity, userId: other });
  assert.deepEqual(links, [['instance:user_clerk', other]]);
});
test('only public Clerk keys produce an exact HTTPS origin', () => {
  const key = 'pk_test_' + Buffer.from('fixture.clerk.accounts.dev$').toString('base64');
  assert.equal(clerkOrigin(key), 'https://fixture.clerk.accounts.dev');
  for (const key of ['sk_test_secret', 'pk_test_' + Buffer.from('evil.test/path$').toString('base64')]) assert.throws(() => clerkOrigin(key));
});

test('actual SQL bridge is service-only, scopes each dispatch, and restores claims on error', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
      create function public.planner_call(p_action text, p_args jsonb, p_timezone text) returns jsonb language plpgsql security definer as $$ begin
        if p_action = 'fail' then raise exception using errcode = 'PT400', message = 'rejected'; end if;
        return jsonb_build_object('userId', auth.uid(), 'role', auth.role());
      end $$;
      insert into auth.users values ('${owner}'), ('${other}');
    `);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261027000100_clerk_bridge.sql', import.meta.url), 'utf8'));
    const privileges = await db.query(`select has_function_privilege('anon', 'public.planner_call_as(uuid,text,jsonb,text)', 'EXECUTE') as anon, has_function_privilege('authenticated', 'public.planner_call_as(uuid,text,jsonb,text)', 'EXECUTE') as authenticated, has_function_privilege('service_role', 'public.planner_call_as(uuid,text,jsonb,text)', 'EXECUTE') as service`);
    assert.deepEqual(privileges.rows[0], { anon: false, authenticated: false, service: true });
    await assert.rejects(db.query(`select public.planner_call_as('${owner}', 'dashboard')`), error => error.code === '42501');
    await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
    for (const id of [owner, other, owner]) {
      const result = await db.query(`select public.planner_call_as('${id}', 'dashboard') as result`);
      assert.deepEqual(result.rows[0].result, { userId: id, role: 'authenticated' });
    }
    await assert.rejects(db.query(`select public.planner_call_as('${owner}', 'fail')`), error => error.code === 'PT400');
    const restored = await db.query('select auth.jwt() as claims');
    assert.deepEqual(restored.rows[0].claims, { role: 'service_role' });
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from public.planner_clerk_identities'), error => error.code === '42501');
    await assert.rejects(db.query(`select public.planner_call_as('${other}', 'dashboard')`), error => error.code === '42501');
  } finally { await db.close(); }
});
