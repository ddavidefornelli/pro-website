-- Daily allowance for AI task suggestions derived from yesterday's plan.
-- Server-only: the task-suggestions Edge Function calls it with the service role.
begin;
create table public.planner_suggestion_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  attempts integer not null default 0,
  primary key (user_id, day)
);
alter table public.planner_suggestion_usage enable row level security;
revoke all on public.planner_suggestion_usage from public, anon, authenticated;
grant all on public.planner_suggestion_usage to service_role;

create function public.planner_reserve_suggestion(p_user_id uuid, p_day date)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  used integer;
begin
  -- Usage rows are only a counter; keep a week for abuse review, nothing more.
  delete from public.planner_suggestion_usage
    where user_id = p_user_id and day < p_day - 7;
  insert into public.planner_suggestion_usage as u (user_id, day, attempts)
    values (p_user_id, p_day, 1)
    on conflict (user_id, day) do update set attempts = u.attempts + 1
    where u.attempts < 5
    returning attempts into used;
  return used is not null;
end;
$$;
revoke all on function public.planner_reserve_suggestion(uuid, date) from public, anon, authenticated;
grant execute on function public.planner_reserve_suggestion(uuid, date) to service_role;
commit;
