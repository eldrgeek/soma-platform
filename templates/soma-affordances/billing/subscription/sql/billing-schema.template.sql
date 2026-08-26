-- ============================================================================
-- SOMA Billing (Stripe) — subscription mode, B0-B2 slice
-- ----------------------------------------------------------------------------
-- Idempotent. Safe to run repeatedly in the Supabase SQL editor.
--
-- Implements the minimal implementable slice of SOMA-STD-billing.md
-- (~/Projects/playmaker/SOMA-STD-billing.md), phases B0-B2 ONLY:
--   B0  manifest + meter-event shape (simplified here to one `status` column
--       per subscriber, not the full append-only `meter` event stream)
--   B1  entitlement resolution (simplified: one status column, no
--       tenant/subscriber precedence, no pre-call spend gate)
--   B2  hosted Checkout + webhook-driven entitlement.status
-- NOT implemented (out of scope for this pass — see SETUP.md "Billing"):
--   B3 BYOK, B4 metered inference, the pre-call spend gate (§4).
--
-- Tables created here:
--   subscriptions   one row per Stripe subscription; `status` is the
--                   entitlement.status this app checks to gate access
--   stripe_events   webhook idempotency ledger (§8: "make handlers
--                   idempotent") — one row per processed Stripe event.id;
--                   the primary key is what makes a Stripe retry a no-op
--
-- SECURITY MODEL:
--   * Both tables are written ONLY by the soma-billing-webhook Netlify
--     Function, using the service-role key (bypasses RLS). Nothing ever
--     writes here from the browser.
--   * subscriptions: the owning user can read their own row; admins
--     (ADMIN_EMAIL_1/2) can read all rows for support/reconciliation.
--   * stripe_events: zero policies, by construction — RLS enabled + no
--     policy denies every role except service-role. No client ever reads it.
--
-- PLACEHOLDERS to replace before running:
--   {{ADMIN_EMAIL_1}}   first admin email
--   {{ADMIN_EMAIL_2}}   second admin email
-- ============================================================================


-- ── subscriptions ──────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid references auth.users(id) on delete set null,
  customer_email           text,
  stripe_customer_id       text,
  stripe_subscription_id   text unique,
  plan_id                  text not null default 'unknown',  -- matches billing.plans[].id in soma-app.json
  status                   text not null default 'incomplete',
    -- 'active' | 'past_due' | 'canceled' | 'incomplete' — the simplified
    -- entitlement.status this app checks; set only by soma-billing-webhook.ts
    -- (see its mapStatus() for the Stripe-status -> this-status mapping).
  current_period_end       timestamptz,
  updated_at               timestamptz not null default now()
);
alter table public.subscriptions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public'
      and tablename='subscriptions' and policyname='own subscription read') then
    create policy "own subscription read" on public.subscriptions for select
      using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
      and tablename='subscriptions' and policyname='subscriptions admin read') then
    create policy "subscriptions admin read" on public.subscriptions for select
      using (auth.jwt() ->> 'email' in ('{{ADMIN_EMAIL_1}}', '{{ADMIN_EMAIL_2}}'));
  end if;
end $$;
-- No insert/update/delete policies for anon/authenticated — writes happen
-- only via the service-role webhook function, which bypasses RLS entirely.


-- ── stripe_events ──────────────────────────────────────────────────────────
-- Idempotency ledger. soma-billing-webhook.ts inserts event.id here BEFORE
-- any side effect; a primary-key conflict means "already processed, stop."
create table if not exists public.stripe_events (
  id            text primary key,   -- Stripe event.id, e.g. 'evt_...'
  type          text not null,
  received_at   timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
-- Deliberately zero policies: RLS-enabled + no policy = deny-all for every
-- non-service-role. This table is a write-only idempotency ledger.

-- ============================================================================
-- Done. Verify in: Table Editor -> public schema (subscriptions, stripe_events, RLS enabled).
-- ============================================================================
