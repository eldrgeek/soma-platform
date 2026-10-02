-- ============================================================================
-- @soma/meter — reference schema (PlayMaker migrations 0001, 0003, 0023, 0072)
--
-- ALREADY APPLIED in the shared Supabase project (omfwcodoimjmbrhssvfl) for
-- app id 'playmaker'. New SOMA apps reuse the same public.entitlements,
-- public.usage_events, and studio_usage_mtd view — caps and metering are
-- studio-scoped, not per-app tables.
-- ============================================================================

-- ── entitlements (0001 + 0023 partial unique index) ─────────────────────────

create table if not exists public.entitlements (
  id                     uuid primary key default gen_random_uuid(),
  studio_id              uuid not null references public.studios (id) on delete cascade,
  subscriber_id          uuid references auth.users (id),
  scope                  text not null check (scope in ('tenant', 'subscriber')),
  billing_mode           text not null check (billing_mode in ('platform_subscription', 'platform_metered', 'byok')),
  plan_id                text,
  monthly_cap_usd        numeric not null default 0,
  included_allowance_usd numeric not null default 0,
  stripe_subscription_id text,
  status                 text not null default 'active'
    check (status in ('active', 'past_due', 'canceled', 'byok_unverified')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create unique index if not exists entitlements_one_tenant_default
  on public.entitlements (studio_id)
  where scope = 'tenant' and subscriber_id is null;

alter table public.entitlements enable row level security;

create policy ent_read on public.entitlements
  for select
  using (public.is_member(studio_id));

-- ── usage_events (0001 + 0023/0072 kind check) ──────────────────────────────

create table if not exists public.usage_events (
  id             uuid primary key default gen_random_uuid(),
  studio_id      uuid not null references public.studios (id) on delete cascade,
  subscriber_id  uuid references auth.users (id),
  capability_id  text not null default 'stage-read',
  kind           text not null,
  provider       text,
  amount         bigint not null,
  cost_usd       numeric not null default 0,
  billable_usd   numeric not null default 0,
  entitlement_id uuid references public.entitlements (id),
  billing_mode   text check (billing_mode in ('platform_subscription', 'platform_metered', 'byok')),
  ref            text,
  created_at     timestamptz not null default now(),
  constraint usage_events_kind_check check (
    kind in (
      'tts_chars',
      'llm_input_tokens',
      'llm_output_tokens',
      'images',
      'convai_minutes',
      'web_searches'
    )
  )
);

create index if not exists usage_events_studio_ts_idx
  on public.usage_events (studio_id, created_at);

alter table public.usage_events enable row level security;

create policy usage_read on public.usage_events
  for select
  using (public.is_member(studio_id));

-- ── studio_usage_mtd view (0001) ────────────────────────────────────────────

drop view if exists public.studio_usage_mtd cascade;
create view public.studio_usage_mtd with (security_invoker = true) as
  select
    studio_id,
    sum(case when kind = 'tts_chars' then amount else 0 end) as tts_chars,
    sum(case when kind like 'llm_%_tokens' then amount else 0 end) as llm_tokens,
    sum(cost_usd) as cost_usd,
    sum(billable_usd) as billable_usd
  from public.usage_events
  where created_at >= date_trunc('month', now())
  group by studio_id;

-- ── pm_ensure_default_entitlement (0023) — service-role RPC ─────────────────

create or replace function public.pm_ensure_default_entitlement(p_studio uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_studio is null then
    raise exception 'pm_ensure_default_entitlement: studio id is null';
  end if;

  insert into public.entitlements
    (studio_id, subscriber_id, scope, billing_mode, plan_id,
     monthly_cap_usd, included_allowance_usd, status)
  values
    (p_studio, null, 'tenant', 'platform_subscription', 'free', 5, 5, 'active')
  on conflict (studio_id) where scope = 'tenant' and subscriber_id is null
  do nothing;

  select id into v_id
  from public.entitlements
  where studio_id = p_studio and scope = 'tenant' and subscriber_id is null
  limit 1;

  return v_id;
end;
$$;

revoke all on function public.pm_ensure_default_entitlement(uuid) from public;
revoke all on function public.pm_ensure_default_entitlement(uuid) from anon;
revoke all on function public.pm_ensure_default_entitlement(uuid) from authenticated;
grant execute on function public.pm_ensure_default_entitlement(uuid) to service_role;
