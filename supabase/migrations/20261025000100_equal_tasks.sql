-- Apply after the shared backend and this website's previous migrations.
-- All tasks may start in any order. Keep legacy priority data/actions compatible
-- with existing Mac clients and already-persisted outbox commands.
begin;
do $$
declare
  definition text;
  priority_guard text := $guard$    if not t.is_priority and not exists(select 1 from public.planner_tasks where user_id = u and planned_for = d and is_priority and status = 'completed') then
      raise exception using errcode = 'PT409', message = 'Complete the most important task first.';
    end if;
$guard$;
begin
  definition := pg_get_functiondef('public.planner_execute(text,jsonb,text)'::regprocedure);
  if position(priority_guard in definition) = 0 then
    raise exception 'Planner executor changed; review the equal-tasks migration before applying.';
  end if;
  -- Only remove the ordering requirement. Ownership, today-only validation,
  -- the single active task rule, receipts and revision checks remain unchanged.
  execute replace(definition, priority_guard, '');
end;
$$;
commit;
