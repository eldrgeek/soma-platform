-- SOMA Auth — Supabase schema
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Requires: project provisioned, auth.users available (default for all Supabase projects).
-- Does NOT require service_role key — DDL runs as the dashboard user.

-- ─── 1. profiles table ───────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  role        text    not null default 'member'
                      check (role in ('admin', 'member')),
  full_name   text,
  updated_at  timestamptz default now()
);

comment on table public.profiles is
  'One row per auth user. role drives access control across all SOMA apps.';

-- ─── 2. Row Level Security ────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- Each user can read their own profile (needed by getRole())
create policy "users_read_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Each user can update their own profile (except role — enforced by app layer)
create policy "users_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admins can read all profiles (for user-management UIs)
create policy "admins_read_all"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ─── 3. Auto-create profile on signup ─────────────────────────────────────────
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

-- ─── 4. Seed admin roles ──────────────────────────────────────────────────────
-- Run AFTER your first admin users have signed in (so their auth.users rows exist).
-- Replace emails as needed.
--
-- update public.profiles
--   set role = 'admin'
--   where id in (
--     select id from auth.users
--     where email in ('mw@mike-wolf.com', 'gfos44@gmail.com')
--   );
