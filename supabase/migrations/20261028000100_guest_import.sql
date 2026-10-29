-- Atomic, idempotent guest-to-account transfer. Apply after all prior migrations.
begin;
create table public.planner_guest_imports (
  user_id uuid not null references auth.users(id) on delete cascade,
  import_id uuid not null,
  payload jsonb not null,
  primary key (user_id, import_id)
);
alter table public.planner_guest_imports enable row level security;
revoke all on public.planner_guest_imports from public, anon, authenticated;
grant all on public.planner_guest_imports to service_role;

create function public.planner_import_guest(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  v_import_id uuid;
  prior jsonb;
  item jsonb;
  task_day date;
  free_slot smallint;
  n bigint := extract(epoch from now())::bigint;
begin
  if u is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception using errcode = 'PT401', message = 'Sign in before saving guest tasks.';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 1048576
    or jsonb_typeof(p_payload->'tasks') is distinct from 'array'
    or jsonb_typeof(p_payload->'stops') is distinct from 'array' then
    raise exception using errcode = 'PT400', message = 'Invalid guest import.';
  end if;
  v_import_id := (p_payload->>'importId')::uuid;
  if v_import_id is null or jsonb_array_length(p_payload->'tasks') > 1000
    or jsonb_array_length(p_payload->'stops') > 5000 then
    raise exception using errcode = 'PT400', message = 'Guest import is too large or missing its identity.';
  end if;
  insert into public.planner_accounts(user_id) values (u) on conflict do nothing;
  perform 1 from public.planner_accounts where user_id = u for update;
  if exists (select 1 from public.planner_accounts where user_id = u and "isDeleted") then
    raise exception using errcode = 'PT403', message = 'This account has been deleted.';
  end if;
  select payload into prior from public.planner_guest_imports g
    where g.user_id = u and g.import_id = v_import_id;
  if found then
    if prior <> p_payload then
      raise exception using errcode = 'PT409', message = 'Guest import identity was reused.';
    end if;
    return jsonb_build_object('imported', true);
  end if;
  for item in select value from jsonb_array_elements(p_payload->'tasks') loop
    task_day := (item->>'plannedFor')::date;
    select s into free_slot from generate_series(1, 3) s
      where not exists (select 1 from public.planner_tasks t where t.user_id = u and t.planned_for = task_day and t.slot = s)
      order by s limit 1;
    if free_slot is null then
      raise exception using errcode = 'PT409', message = 'Your account already has tasks on a guest planning day. Guest tasks remain on this device; no tasks were imported.';
    end if;
    if (item->>'createdAt')::bigint > n + 120 or (item->>'startedAt')::bigint > n + 120
      or (item->>'actualSeconds')::bigint > 315360000
      or (item->>'createdAt')::bigint < 0 then
      raise exception using errcode = 'PT400', message = 'Invalid guest task time.';
    end if;
    if item->>'status' = 'active' and exists (select 1 from public.planner_tasks where user_id = u and status = 'active') then
      raise exception using errcode = 'PT409', message = 'Finish the active account task before saving guest tasks. Guest tasks remain on this device.';
    end if;
    insert into public.planner_tasks(id, user_id, outcome, planned_for, slot, estimated_minutes,
      actual_seconds, status, started_at, completed_on, created_at, is_priority)
    values ((item->>'id')::uuid, u, item->>'outcome', task_day, free_slot,
      (item->>'estimatedMinutes')::integer, (item->>'actualSeconds')::bigint, item->>'status',
      (item->>'startedAt')::bigint, (item->>'completedOn')::date, (item->>'createdAt')::bigint, false);
  end loop;
  for item in select value from jsonb_array_elements(p_payload->'stops') loop
    if not exists (select 1 from jsonb_array_elements(p_payload->'tasks') t where t->>'id' = item->>'taskId') then
      raise exception using errcode = 'PT400', message = 'Invalid guest stop task.';
    end if;
    insert into public.planner_stops(user_id, task_id, reason, stopped_at, stopped_on)
      values (u, (item->>'taskId')::uuid, item->>'reason', (item->>'at')::bigint, (item->>'day')::date);
  end loop;
  update public.planner_accounts set revision = revision + 1, last_event_at = greatest(last_event_at, n) where user_id = u;
  insert into public.planner_guest_imports(user_id, import_id, payload) values (u, v_import_id, p_payload);
  return jsonb_build_object('imported', true);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or unique_violation or datetime_field_overflow then
  raise exception using errcode = 'PT400', message = 'Invalid or conflicting guest data. Guest tasks remain on this device; no tasks were imported.';
end;
$$;
revoke all on function public.planner_import_guest(jsonb) from public, anon;
grant execute on function public.planner_import_guest(jsonb) to authenticated;
commit;
