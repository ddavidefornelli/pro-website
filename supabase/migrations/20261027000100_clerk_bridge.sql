-- Clerk web bridge. Apply only after the shared backend and soft-delete migrations.
-- Existing Mac/Supabase authentication and planner ownership UUIDs are unchanged.
begin;
create table public.planner_clerk_identities (
  clerk_subject text primary key check (length(clerk_subject) between 1 and 500),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.planner_clerk_identities enable row level security;
revoke all on public.planner_clerk_identities from public, anon, authenticated;
grant select, insert on public.planner_clerk_identities to service_role;

-- Only the server may choose an owner UUID, after verifying a Clerk session and
-- resolving the immutable identity mapping. Never expose this with an anon key.
create function public.planner_call_as(
  p_user_id uuid, p_action text, p_args jsonb default '{}'::jsonb, p_timezone text default 'UTC'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  previous_claims text := current_setting('request.jwt.claims', true);
  result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_user_id is null then
    raise exception using errcode = '42501', message = 'Server authentication required.';
  end if;
  -- auth.uid() in the existing dispatcher sees only this request's mapped user.
  -- Local settings are restored on both success and failure, never session-wide.
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user_id, 'role', 'authenticated', 'is_anonymous', false
  )::text, true);
  begin
    result := public.planner_call(p_action, p_args, p_timezone);
  exception when others then
    perform set_config('request.jwt.claims', coalesce(previous_claims, ''), true);
    raise;
  end;
  perform set_config('request.jwt.claims', coalesce(previous_claims, ''), true);
  return result;
end;
$$;
revoke all on function public.planner_call_as(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.planner_call_as(uuid, text, jsonb, text) to service_role;
commit;
