-- Apply after the shared backend migrations and automatic_weekly_reviews.sql.
-- No purge job: the operator deletes Auth users manually after 30 days.
begin;
alter table public.planner_accounts
  add column "isDeleted" boolean not null default false,
  add column deleted_at timestamptz;
create index planner_accounts_deleted_at on public.planner_accounts (deleted_at)
  where "isDeleted";

-- Keep the queue implementation private so callers cannot bypass the guard.
alter function public.planner_call(text, jsonb, text) rename to planner_call_active;
revoke all on function public.planner_call_active(text, jsonb, text) from public, anon, authenticated;

create function public.planner_call(p_action text, p_args jsonb default '{}'::jsonb, p_timezone text default 'UTC') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  a public.planner_accounts%rowtype;
begin
  if u is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception using errcode = 'PT401', message = 'Sign in with your email to use prune.';
  end if;
  insert into public.planner_accounts(user_id) values (u) on conflict do nothing;
  -- Serialize deletion with all planner writes, including other devices.
  select * into a from public.planner_accounts where user_id = u for update;
  if p_action = 'account_status' then
    return jsonb_build_object('isDeleted', a."isDeleted");
  end if;
  if p_action = 'delete_account' then
    -- Idempotent: a retry must never restart the 30-day retention period.
    if not a."isDeleted" then
      update public.planner_accounts set "isDeleted" = true, deleted_at = now(),
        ai_enabled = false, ai_revision = ai_revision + 1 where user_id = u;
    end if;
    return jsonb_build_object('isDeleted', true);
  end if;
  if a."isDeleted" then
    raise exception using errcode = 'PT403', message = 'This account has been marked for deletion.';
  end if;
  return public.planner_call_active(p_action, p_args, p_timezone);
end;
$$;
revoke all on function public.planner_call(text, jsonb, text) from public, anon;
grant execute on function public.planner_call(text, jsonb, text) to authenticated;

-- Direct table reads must not bypass the RPC guard. Restrictive policies combine
-- with the existing owner policies; the account row itself remains inspectable.
create policy active_account on public.planner_tasks as restrictive for select to authenticated
  using (exists (select 1 from public.planner_accounts a where a.user_id = (select auth.uid()) and not a."isDeleted"));
create policy active_account on public.planner_resources as restrictive for select to authenticated
  using (exists (select 1 from public.planner_accounts a where a.user_id = (select auth.uid()) and not a."isDeleted"));
create policy active_account on public.planner_stops as restrictive for select to authenticated
  using (exists (select 1 from public.planner_accounts a where a.user_id = (select auth.uid()) and not a."isDeleted"));
create policy active_account on public.planner_reviews as restrictive for select to authenticated
  using (exists (select 1 from public.planner_accounts a where a.user_id = (select auth.uid()) and not a."isDeleted"));
commit;
