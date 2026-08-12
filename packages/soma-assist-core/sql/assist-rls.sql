-- Assist stack RLS — canonical policy record for the shared Supabase project
-- (omfwcodoimjmbrhssvfl). Tables: assist_heartbeats, assist_feedback,
-- assist_build_requests.
--
-- These tables were created ad hoc in the dashboard SQL editor (2026-07-10,
-- WP3 of the adrian-yeshie-upgrade program) with no SQL committed anywhere in
-- the estate. This file backfills the canonical record AND applies the
-- SCC-III C3 authorization fix (2026-08-12): the original policies granted
-- SELECT and UPDATE `to authenticated using (true)`, which — with open signup
-- enabled — meant anyone on the internet could read all fleet telemetry and
-- feedback, and rewrite any build request or feedback row.
--
-- Per SOMA/standards/SOMA-AUTH.md §Authorization:
--   * `authenticated` is an authentication fact, never an authorization tier.
--   * Reads are for the fleet console (packages/assist-fleet/), an internal
--     ops surface — gated on profiles.role = 'admin' via the SECURITY DEFINER
--     helper public.current_user_role().
--   * Writes never used table policies at all: intake goes through the
--     SECURITY DEFINER RPCs assist_record_heartbeat / assist_submit_feedback
--     (owner postgres, which has BYPASSRLS). The open UPDATE policies were
--     unused by every legitimate client and are dropped without replacement.
--
-- Idempotent; safe to re-run. Applied live 2026-08-12 via the Management API.

-- Drop the SCC-III C3 open policies (and the originals being replaced).
drop policy if exists assist_build_requests_auth_update on public.assist_build_requests;
drop policy if exists assist_feedback_auth_update      on public.assist_feedback;
drop policy if exists assist_build_requests_auth_select on public.assist_build_requests;
drop policy if exists assist_feedback_auth_select      on public.assist_feedback;
drop policy if exists assist_heartbeats_auth_select    on public.assist_heartbeats;

-- Fleet-console reads: admins only.
drop policy if exists assist_build_requests_admin_select on public.assist_build_requests;
create policy assist_build_requests_admin_select
  on public.assist_build_requests
  for select to authenticated
  using (public.current_user_role() = 'admin');

drop policy if exists assist_feedback_admin_select on public.assist_feedback;
create policy assist_feedback_admin_select
  on public.assist_feedback
  for select to authenticated
  using (public.current_user_role() = 'admin');

drop policy if exists assist_heartbeats_admin_select on public.assist_heartbeats;
create policy assist_heartbeats_admin_select
  on public.assist_heartbeats
  for select to authenticated
  using (public.current_user_role() = 'admin');

-- Pre-existing intake policies, retained as-is (NOT created by this file;
-- recorded here so the full live policy set is in-repo). Feedback/build-request
-- INSERT is open to anon by design — it is the public feedback-intake path —
-- but constrained by with_check (app/route allowlist, length and count bounds),
-- so it is not a bare `using (true)` grant:
--
--   assist_feedback_anon_insert       INSERT to anon, authenticated
--     with check (char_length(description) between 1 and 8000
--                 and route in ('yeshie','soma-guide','common')
--                 and app   in ('yeshie','soma-guide','common'))
--   assist_build_requests_anon_insert INSERT to anon, authenticated
--     with check (app in ('yeshie','soma-guide','common')
--                 and item_count between 0 and 100)
--
-- assist_heartbeats has NO insert policy: heartbeats arrive only via the
-- SECURITY DEFINER RPC assist_record_heartbeat.
