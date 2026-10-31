-- Anonymous daily totals of guest (signed-out) planner use. Rows hold only a
-- UTC day, a metric name and a running total: no device or account
-- identifiers, task content or request metadata. Apply after all prior migrations.
begin;
create table public.guest_usage_daily (
  day date not null,
  metric text not null check (metric in ('new_guests', 'active_guests', 'returning_guests',
    'tasks_created', 'tasks_started', 'tasks_completed', 'focus_minutes')),
  total bigint not null default 0 check (total >= 0),
  primary key (day, metric)
);
alter table public.guest_usage_daily enable row level security;
revoke all on public.guest_usage_daily from public, anon, authenticated;
grant all on public.guest_usage_daily to service_role;

-- Called by signed-out browsers with the public key, so it is the only anon
-- entry point. Each call adds at most one guest/task, or one task's focus time.
create function public.guest_record_usage(p_metrics jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  item record;
  today date := (now() at time zone 'utc')::date;
begin
  if p_metrics is null or jsonb_typeof(p_metrics) <> 'object' then
    raise exception using errcode = 'PT400', message = 'Invalid guest usage.';
  end if;
  for item in select key, value from jsonb_each(p_metrics) loop
    if item.key not in ('new_guests', 'active_guests', 'returning_guests',
        'tasks_created', 'tasks_started', 'tasks_completed', 'focus_minutes')
      or jsonb_typeof(item.value) <> 'number' or item.value::text !~ '^[0-9]{1,4}$' then
      raise exception using errcode = 'PT400', message = 'Invalid guest usage.';
    end if;
    -- Cast only after the format check above; OR does not short-circuit in SQL.
    if item.value::text::integer > (case when item.key = 'focus_minutes' then 1440 else 1 end) then
      raise exception using errcode = 'PT400', message = 'Invalid guest usage.';
    end if;
  end loop;
  insert into public.guest_usage_daily as u (day, metric, total)
    select today, key, value::text::bigint from jsonb_each(p_metrics) where value::text::bigint > 0
    on conflict (day, metric) do update set total = u.total + excluded.total;
end;
$$;
revoke all on function public.guest_record_usage(jsonb) from public, anon, authenticated;
grant execute on function public.guest_record_usage(jsonb) to anon;
commit;
