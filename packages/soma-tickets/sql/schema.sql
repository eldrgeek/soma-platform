-- ============================================================================
-- @soma/tickets — reference schema (PlayMaker migrations 0084–0086)
--
-- ALREADY APPLIED in the shared Supabase project (omfwcodoimjmbrhssvfl) for
-- app id 'playmaker'. New SOMA apps reuse the same public.tickets and
-- public.ticket_requests tables — pass a distinct `app` value in RPC calls;
-- do not create per-app ticket tables.
-- ============================================================================

-- Front door tickets — single-use invitation with one approved line (Bead pm-uwq).
-- QR (20 min) or link (7 days). Mint via ticket_create; public resolve via lookup/use.

create table if not exists public.tickets (
  id               uuid primary key default gen_random_uuid(),
  app              text not null,
  token            text not null unique,
  inviter_id       uuid not null references auth.users (id) on delete cascade,
  inviter_name     text not null,
  invitee_name     text not null,
  invitee_email    text,
  quote_line       text not null check (length(quote_line) between 1 and 240),
  channel          text not null check (channel in ('qr', 'link')),
  expires_at       timestamptz not null,
  scene_read_id    uuid,
  used_at          timestamptz,
  used_visitor_id  text,
  created_at       timestamptz not null default now()
);

create index if not exists tickets_app_inviter_created_idx
  on public.tickets (app, inviter_id, created_at);

alter table public.tickets enable row level security;

create policy tickets_inviter_select on public.tickets
  for select
  to authenticated
  using (inviter_id = auth.uid());

revoke all on table public.tickets from anon;
revoke all on table public.tickets from authenticated;
grant select on public.tickets to authenticated;

-- ── ticket_create ─────────────────────────────────────────────────────────
create or replace function public.ticket_create(
  p_app text,
  p_invitee_name text,
  p_quote_line text,
  p_channel text,
  p_invitee_email text default null
)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_app text := nullif(trim(p_app), '');
  v_invitee_name text := nullif(trim(p_invitee_name), '');
  v_quote_line text := nullif(trim(p_quote_line), '');
  v_channel text := nullif(trim(p_channel), '');
  v_email text := nullif(trim(p_invitee_email), '');
  pol public.site_invite_app_policies%rowtype;
  v_today_count int;
  v_token text;
  v_expires timestamptz;
  v_inviter_name text;
begin
  if auth.uid() is null then
    raise exception 'sign in required';
  end if;

  if not exists (select 1 from public.memberships m where m.user_id = auth.uid()) then
    raise exception 'studio membership required';
  end if;

  if v_app is null or length(v_app) > 64 then
    raise exception 'invalid app';
  end if;

  if v_invitee_name is null or length(v_invitee_name) > 200 then
    raise exception 'invalid invitee name';
  end if;

  if v_quote_line is null or length(v_quote_line) > 240 then
    raise exception 'invalid quote line';
  end if;

  if v_channel is null or v_channel not in ('qr', 'link') then
    raise exception 'invalid channel';
  end if;

  if v_email is not null and length(v_email) > 320 then
    raise exception 'invalid invitee email';
  end if;

  select * into pol from public.site_invite_app_policies where app = v_app;

  if found and pol.daily_mint_limit_per_user is not null then
    select count(*)::int into v_today_count
      from public.tickets t
     where t.app = v_app
       and t.inviter_id = auth.uid()
       and t.created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');

    if v_today_count >= pol.daily_mint_limit_per_user then
      raise exception 'daily ticket limit reached';
    end if;
  end if;

  select coalesce(
           nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
           split_part(u.email, '@', 1)
         )
    into v_inviter_name
    from auth.users u
   where u.id = auth.uid();

  if v_inviter_name is null or length(v_inviter_name) < 1 then
    v_inviter_name := 'Member';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');

  if v_channel = 'qr' then
    v_expires := now() + interval '20 minutes';
  else
    v_expires := now() + interval '7 days';
  end if;

  insert into public.tickets (
    app, token, inviter_id, inviter_name, invitee_name, invitee_email,
    quote_line, channel, expires_at
  )
  values (
    v_app, v_token, auth.uid(), v_inviter_name, v_invitee_name, v_email,
    v_quote_line, v_channel, v_expires
  );

  return query select v_token, v_expires;
end $$;

-- ── ticket_lookup ─────────────────────────────────────────────────────────
create or replace function public.ticket_lookup(p_app text, p_token text)
returns table (
  status text,
  invitee_name text,
  inviter_name text,
  quote_line text,
  has_email boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_app text := nullif(trim(p_app), '');
  v_row public.tickets%rowtype;
begin
  if v_app is null or p_token is null or length(p_token) > 128 then
    return query select 'unknown'::text, null::text, null::text, null::text, null::boolean;
    return;
  end if;

  select * into v_row
    from public.tickets t
   where t.app = v_app
     and t.token = p_token;

  if not found then
    return query select 'unknown'::text, null::text, null::text, null::text, null::boolean;
    return;
  end if;

  if v_row.used_at is not null then
    return query
      select 'used'::text,
             v_row.invitee_name,
             v_row.inviter_name,
             v_row.quote_line,
             (v_row.invitee_email is not null and length(trim(v_row.invitee_email)) > 0);
    return;
  end if;

  if v_row.expires_at <= now() then
    return query
      select 'expired'::text,
             v_row.invitee_name,
             v_row.inviter_name,
             v_row.quote_line,
             (v_row.invitee_email is not null and length(trim(v_row.invitee_email)) > 0);
    return;
  end if;

  return query
    select 'open'::text,
           v_row.invitee_name,
           v_row.inviter_name,
           v_row.quote_line,
           (v_row.invitee_email is not null and length(trim(v_row.invitee_email)) > 0);
end $$;

-- ── ticket_use ────────────────────────────────────────────────────────────
create or replace function public.ticket_use(
  p_app text,
  p_token text,
  p_visitor_id text
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_app text := nullif(trim(p_app), '');
  v_visitor text := nullif(trim(p_visitor_id), '');
  v_row public.tickets%rowtype;
begin
  if v_app is null or p_token is null or length(p_token) > 128 or v_visitor is null or length(v_visitor) > 128 then
    return 'unknown';
  end if;

  select * into v_row
    from public.tickets t
   where t.app = v_app
     and t.token = p_token
   for update;

  if not found then
    return 'unknown';
  end if;

  if v_row.used_at is not null then
    if v_row.used_visitor_id = v_visitor and v_row.used_at > now() - interval '24 hours' then
      return 'used';
    end if;
    return 'already_used';
  end if;

  if v_row.expires_at <= now() then
    return 'expired';
  end if;

  update public.tickets
     set used_at = now(),
         used_visitor_id = v_visitor
   where id = v_row.id;

  return 'used';
end $$;

revoke all on function public.ticket_create(text, text, text, text, text) from public;
revoke all on function public.ticket_lookup(text, text) from public;
revoke all on function public.ticket_use(text, text, text) from public;

grant execute on function public.ticket_create(text, text, text, text, text) to authenticated;
grant execute on function public.ticket_lookup(text, text) to anon, authenticated;
grant execute on function public.ticket_use(text, text, text) to anon, authenticated;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Playmaker — 0085_ticket_requests.sql                                      ║
-- ║ Front-door interview ticket requests (service-role writes only).          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create table if not exists public.ticket_requests (
  id          uuid primary key default gen_random_uuid(),
  app         text not null,
  visitor_id  text not null,
  heard_how   text not null,
  told_by     text,
  making      text not null,
  email       text,
  created_at  timestamptz not null default now()
);

create index if not exists ticket_requests_app_created_idx
  on public.ticket_requests (app, created_at);

alter table public.ticket_requests enable row level security;

revoke all on table public.ticket_requests from anon, authenticated;

-- Playmaker — 0086_ticket_create_random_bytes.sql
-- ticket_create (0084) called gen_random_bytes with search_path = public, but
-- pgcrypto lives in the extensions schema on this project, so every mint failed
-- with 42883 ("function gen_random_bytes(integer) does not exist"), which
-- PostgREST reports as 404. Found live on 2026-09-26 while minting the first
-- ticket from the Writers' Room. Same body as 0084 with the schema-qualified
-- call, plus full_name as a second fallback for the inviter's name.

create or replace function public.ticket_create(
  p_app text,
  p_invitee_name text,
  p_quote_line text,
  p_channel text,
  p_invitee_email text default null
)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_app text := nullif(trim(p_app), '');
  v_invitee_name text := nullif(trim(p_invitee_name), '');
  v_quote_line text := nullif(trim(p_quote_line), '');
  v_channel text := nullif(trim(p_channel), '');
  v_email text := nullif(trim(p_invitee_email), '');
  pol public.site_invite_app_policies%rowtype;
  v_today_count int;
  v_token text;
  v_expires timestamptz;
  v_inviter_name text;
begin
  if auth.uid() is null then
    raise exception 'sign in required';
  end if;

  if not exists (select 1 from public.memberships m where m.user_id = auth.uid()) then
    raise exception 'studio membership required';
  end if;

  if v_app is null or length(v_app) > 64 then
    raise exception 'invalid app';
  end if;

  if v_invitee_name is null or length(v_invitee_name) > 200 then
    raise exception 'invalid invitee name';
  end if;

  if v_quote_line is null or length(v_quote_line) > 240 then
    raise exception 'invalid quote line';
  end if;

  if v_channel is null or v_channel not in ('qr', 'link') then
    raise exception 'invalid channel';
  end if;

  if v_email is not null and length(v_email) > 320 then
    raise exception 'invalid invitee email';
  end if;

  select * into pol from public.site_invite_app_policies where app = v_app;

  if found and pol.daily_mint_limit_per_user is not null then
    select count(*)::int into v_today_count
      from public.tickets t
     where t.app = v_app
       and t.inviter_id = auth.uid()
       and t.created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');

    if v_today_count >= pol.daily_mint_limit_per_user then
      raise exception 'daily ticket limit reached';
    end if;
  end if;

  select coalesce(
           nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
           nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
           split_part(u.email, '@', 1)
         )
    into v_inviter_name
    from auth.users u
   where u.id = auth.uid();

  if v_inviter_name is null or length(v_inviter_name) < 1 then
    v_inviter_name := 'Member';
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  if v_channel = 'qr' then
    v_expires := now() + interval '20 minutes';
  else
    v_expires := now() + interval '7 days';
  end if;

  insert into public.tickets (
    app, token, inviter_id, inviter_name, invitee_name, invitee_email,
    quote_line, channel, expires_at
  )
  values (
    v_app, v_token, auth.uid(), v_inviter_name, v_invitee_name, v_email,
    v_quote_line, v_channel, v_expires
  );

  return query select v_token, v_expires;
end $$;

revoke all on function public.ticket_create(text, text, text, text, text) from public;
grant execute on function public.ticket_create(text, text, text, text, text) to authenticated;
