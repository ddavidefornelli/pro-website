-- Apply after the shared planner migrations from ../pro/supabase/migrations.
-- Weekly reviews are an automatic service feature for newly provisioned accounts.
-- Preserve every existing preference: in particular, never re-enable an opt-out.
-- The shared backend currently uses legacy consent_* names as protocol/version
-- gates. These defaults are NOT a record of affirmative consent. Do not use them
-- as evidence of consent; review the lawful basis before production rollout.
begin;
alter table public.planner_accounts
  alter column ai_enabled set default true,
  alter column consent_version set default 'weekly-ai-v1';
commit;
