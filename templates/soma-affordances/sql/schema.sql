-- ============================================================================
-- SOMA Affordances — consolidated schema (Change Log + Bill)
-- ----------------------------------------------------------------------------
-- Idempotent. Safe to run repeatedly in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/{{SUPABASE_PROJECT_REF}}/sql/new
--
-- Tables created here:
--   changelog_requests   change-log submissions (new requests / refinements)
--   changelog_notes      refinement notes attached to any change-log item
--   bill_feedback        bug reports / feature requests routed through Bill
--   bill_transcripts     Bill decision-trace telemetry (one row per turn)
--   soma_profiles        cross-app, account-keyed identity profile for Bill
--
-- PLACEHOLDERS to replace before running (also listed in README.md):
--   {{SUPABASE_PROJECT_REF}}   your Supabase project ref (URL slug)
--   {{ADMIN_EMAIL_1}}          first admin email (e.g. you)
--   {{ADMIN_EMAIL_2}}          second admin email (the site owner / reviewer)
--                              Add/remove emails in the admin IN (...) lists below.
--
-- SECURITY MODEL (must understand before changing the policies):
--   * changelog_requests / changelog_notes are written from the BROWSER with the
--     anon key, but the page is already SOMA-auth-gated to admins, so the RLS
--     here is permissive (USING true). If your change-log page is NOT behind
--     admin auth, tighten these to the admin-only pattern used below.
--   * bill_feedback / bill_transcripts are written ONLY by Netlify Functions
--     using the service-role key (which bypasses RLS). Members never write
--     directly. RLS therefore grants NO public access; admin SELECT is added so
--     an admin dashboard can read them with the user's JWT.
--   * soma_profiles is owned by each user (auth.uid() = user_id).
-- ============================================================================


-- ── 1. changelog_requests ──────────────────────────────────────────────────
-- New submissions from admins/reviewers via the change-log page form.
create table if not exists public.changelog_requests (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  details      text not null,
  priority     text not null default 'normal',   -- 'low' | 'normal' | 'high'
  requester    text,                              -- author email
  status       text not null default 'open',      -- 'open' | 'accepted'
  created_at   timestamptz not null default now()
);
alter table public.changelog_requests enable row level security;

-- Permissive because the page is admin-gated (see SECURITY MODEL above).
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public'
      and tablename='changelog_requests' and policyname='changelog_requests read') then
    create policy "changelog_requests read"   on public.changelog_requests for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
      and tablename='changelog_requests' and policyname='changelog_requests insert') then
    create policy "changelog_requests insert" on public.changelog_requests for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
      and tablename='changelog_requests' and policyname='changelog_requests update') then
    create policy "changelog_requests update" on public.changelog_requests for update using (true);
  end if;
end $$;


-- ── 2. changelog_notes ─────────────────────────────────────────────────────
-- Refinement notes/responses attached to any change-log item. request_id is a
-- free-text key: it matches either a static history id (e.g. 'cl-007') or a
-- submitted request's uuid / 'nr-<created_at>' synthetic id.
create table if not exists public.changelog_notes (
  id           uuid primary key default gen_random_uuid(),
  request_id   text not null,
  note         text not null,
  author       text,
  created_at   timestamptz not null default now()
);
alter table public.changelog_notes enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public'
      and tablename='changelog_notes' and policyname='changelog_notes read') then
    create policy "changelog_notes read"   on public.changelog_notes for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
      and tablename='changelog_notes' and policyname='changelog_notes insert') then
    create policy "changelog_notes insert" on public.changelog_notes for insert with check (true);
  end if;
end $$;


-- ── 3. bill_feedback ───────────────────────────────────────────────────────
-- Bug reports / feature requests captured by Bill and written by the
-- submit-feedback Netlify Function (service-role key bypasses RLS).
create table if not exists public.bill_feedback (
  id             uuid primary key default gen_random_uuid(),
  type           text not null check (type in ('bug', 'feature')),
  description    text not null,
  member_name    text,
  member_email   text,
  page_context   text,
  assistant_id   text default '{{ASSISTANT_ID}}',  -- e.g. 'acme-bill'
  source         text default 'bill-widget',
  ip             text,
  user_agent     text,
  status         text default 'new',               -- 'new' | 'reviewed' | 'owner-approved' | ...
  created_at     timestamptz not null default now()
);
alter table public.bill_feedback enable row level security;
-- No public access — inserts happen via the service-role function only.
-- Admin dashboard read (uses the signed-in admin's JWT):
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public'
      and tablename='bill_feedback' and policyname='bill_feedback admin read') then
    create policy "bill_feedback admin read" on public.bill_feedback for select
      using (auth.jwt() ->> 'email' in ('{{ADMIN_EMAIL_1}}', '{{ADMIN_EMAIL_2}}'));
  end if;
end $$;


-- ── 4. bill_transcripts ────────────────────────────────────────────────────
-- One row per Bill turn/decision (matched action, params, chosen rung) written
-- by the log-bill Netlify Function (service-role key bypasses RLS).
create table if not exists public.bill_transcripts (
  id           uuid primary key default gen_random_uuid(),
  session_id   text,
  anon_id      text,
  app          text,
  page         text,
  event        text not null,
  data         jsonb not null default '{}'::jsonb,
  ip           text,
  user_agent   text,
  created_at   timestamptz not null default now()
);
create index if not exists bill_transcripts_session_idx
  on public.bill_transcripts (session_id, created_at);
alter table public.bill_transcripts enable row level security;
-- No public access — inserts via service-role function only. Admin read:
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public'
      and tablename='bill_transcripts' and policyname='bill_transcripts admin read') then
    create policy "bill_transcripts admin read" on public.bill_transcripts for select
      using (auth.jwt() ->> 'email' in ('{{ADMIN_EMAIL_1}}', '{{ADMIN_EMAIL_2}}'));
  end if;
end $$;


-- ── 5. soma_profiles ───────────────────────────────────────────────────────
-- Cross-app, account-keyed identity so Bill can be loud for newcomers and quiet
-- for veterans. Written from the browser via the anon key under the user's own
-- session; RLS scopes every row to its owner. The Bill config upserts with
-- on_conflict=user_id, so user_id must be a primary key (it is, below).
create table if not exists public.soma_profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  display_name     text,
  role             text,                                  -- 'admin' | 'member'
  apps_used        jsonb not null default '[]'::jsonb,    -- ['{{APP_ID}}', ...]
  guide_seen       jsonb not null default '{}'::jsonb,    -- { '<app>': ['walkthroughId', ...] }
  bill_familiarity int  not null default 0,               -- 0 new -> grows with engagement
  prefs            jsonb not null default '{}'::jsonb,     -- voice on/off, tts muted, etc.
  updated_at       timestamptz not null default now()
);
alter table public.soma_profiles enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public'
      and tablename='soma_profiles' and policyname='own profile read') then
    create policy "own profile read"   on public.soma_profiles for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
      and tablename='soma_profiles' and policyname='own profile upsert') then
    create policy "own profile upsert" on public.soma_profiles for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
      and tablename='soma_profiles' and policyname='own profile update') then
    create policy "own profile update" on public.soma_profiles for update using (auth.uid() = user_id);
  end if;
end $$;

-- ============================================================================
-- Done. Verify in: Table Editor -> public schema (5 tables, RLS enabled).
-- ============================================================================
