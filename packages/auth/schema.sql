-- SOMA Auth — Supabase schema
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Requires: project provisioned, auth.users available (default for all Supabase projects).
-- Does NOT require service_role key — DDL runs as the dashboard user.
--
-- AMENDED 2026-06-10: roles are site-scoped (JSONB map app_id→role),
-- not a single global role column. See soma-auth-design-v1.md DECISIONS section.

-- ─── 1. profiles table ───────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid references auth.users on delete cascade primary key,
  roles        jsonb    not null default '{}'::jsonb,
  default_role text     not null default 'subscriber'
               check (default_role in ('admin', 'subscriber')),
  full_name    text,
  updated_at   timestamptz default now()
);

comment on table public.profiles is
  'One row per auth user. roles JSONB maps app_id → "admin"|"subscriber". '
  'Middleware resolves effective role as roles[app_id] ?? default_role.';

comment on column public.profiles.roles is
  'Site-scoped role map: {"nbrpa-legends":"admin","playwriting-platform":"admin",...}. '
  'Values must be "admin" or "subscriber".';

comment on column public.profiles.default_role is
  'Fallback role for any app_id not present in the roles map. Default: subscriber.';

-- ─── 2. Helper: is this user an admin on any site? ───────────────────────────
create or replace function public.has_any_admin_role(user_roles jsonb)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1 from jsonb_each_text(user_roles) where value = 'admin'
  )
$$;

-- ─── 3. Row Level Security ────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- Each user can read their own profile (needed by middleware role lookup)
create policy "users_read_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Each user can update their own profile (roles changes are admin-only via app layer)
create policy "users_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Users with admin role on any site can read all profiles (for user-management UIs)
create policy "admins_read_all"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and public.has_any_admin_role(p.roles)
    )
  );

-- ─── 4. Auto-create profile on signup ─────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── 5. Seed admin roles ──────────────────────────────────────────────────────
-- Run AFTER admin users have signed in (so their auth.users rows exist).
-- Decision 2026-06-10: mw@mike-wolf.com gets admin on all current app_ids;
-- gfos44@gmail.com gets admin on nbrpa-legends only (Decision Q1/Q5).
--
-- update public.profiles
--   set roles = '{"nbrpa-legends":"admin","playwriting-platform":"admin","proteus":"admin","ariadne":"admin"}'::jsonb
--   where id = (select id from auth.users where email = 'mw@mike-wolf.com');
--
-- update public.profiles
--   set roles = '{"nbrpa-legends":"admin"}'::jsonb
--   where id = (select id from auth.users where email = 'gfos44@gmail.com');
