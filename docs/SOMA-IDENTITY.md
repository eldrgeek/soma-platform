# SOMA Identity & Profile — spec

How Bill (and any SOMA-Guide affordance) knows *who it's talking to* and *what they
already know*, so it can be loud for newcomers and quiet for veterans — across every
SOMA app, not just one site.

## Principle

Two tiers, layered. Never depend on third-party / tracking cookies (Safari blocks
them, Chrome is killing them, storage partitioning isolates them). Identity that
must survive belongs to the **account**, not a cookie.

| Tier | Scope | Storage | Answers |
|------|-------|---------|---------|
| 1. Recognition | this browser, this site | `localStorage` (already in use) | Has this browser been here? Which walkthroughs has it seen? Chip-decay state. |
| 2. Profile | this person, all SOMA apps | account-keyed row in shared store | Who are they? Which SOMA apps have they used? What has Bill shown them? Role, prefs, Bill-familiarity. |

Anonymous visitors get Tier 1 only. Once a user authenticates (SOMA sites already
run Supabase auth via `soma-auth.js`), Tier 2 unlocks and is identical on every SOMA
domain because it's keyed to their user id, not the browser.

## Tier 2 schema (Supabase)

```sql
create table if not exists public.soma_profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  display_name   text,
  role           text,                       -- e.g. 'admin' | 'member'
  apps_used      jsonb not null default '[]'::jsonb,   -- ['legends','izzy', ...]
  guide_seen     jsonb not null default '{}'::jsonb,   -- { '<app>': ['walkthroughId', ...] }
  bill_familiarity int not null default 0,             -- 0 new → grows with engagement
  prefs          jsonb not null default '{}'::jsonb,   -- voice on/off, tts muted, etc.
  updated_at     timestamptz not null default now()
);
alter table public.soma_profiles enable row level security;
create policy "own profile read"   on public.soma_profiles for select using (auth.uid() = user_id);
create policy "own profile upsert" on public.soma_profiles for insert with check (auth.uid() = user_id);
create policy "own profile update" on public.soma_profiles for update using (auth.uid() = user_id);
```

Lives in the shared SOMA Supabase project so every app reads the same row. (If apps
use separate Supabase projects, the profile instead lives behind a small endpoint on
the VPS keyed by the verified user id — same shape, one indirection.)

## Engine seam (no Supabase code in soma-guide.js)

The engine stays backend-agnostic. The per-site config supplies a provider; the
engine consumes a plain profile object and reports recognition signals:

```js
// per-site config (e.g. legends-guide-config.js)
window.SomaGuideConfig = {
  // ...
  identity: {
    appId: 'legends',
    // return null when anonymous; else the profile row (the site already has the session)
    getProfile: async () => SomaAuth.session
        ? await fetchSomaProfile(SomaAuth.session)   // site-owned, talks to Supabase/VPS
        : null,
    // engine calls this to record progress; site persists it
    recordSeen: async (walkthroughId) => { /* upsert guide_seen[appId] += id */ }
  }
};
```

Engine behavior driven by the result:
- `getProfile() === null` (anonymous) → Tier 1 only: localStorage recognition, loud
  first-run affordances (greeting, prominent mic, full chips).
- profile present + `bill_familiarity` high or this app in `apps_used` → quiet shell:
  skip greeting, fewer chips, mic already small.
- chips/walkthroughs already in `guide_seen[appId]` → drop them from suggestions
  (cross-device decay, not just per-browser).
- on walkthrough completion / feedback / message, engine calls `recordSeen` /
  bumps familiarity; site persists.

## Cross-domain linking (the only place an iframe helps)

Not for identity transport — for *linking* an anonymous browser to an account at
login, so Tier-1 localStorage history merges into the Tier-2 profile. A one-time
postMessage handshake on login is enough; no persistent third-party cookie.

## Build order

1. Create `soma_profiles` (SQL above) in the shared project. ← Mike runs this.
2. Add the `identity` seam to the engine (consume profile, gate first-run affordances
   on it, call `recordSeen`). Backward-compatible: no `identity` config = today's
   localStorage-only behavior.
3. Wire `getProfile`/`recordSeen` in the Legends config against Supabase.
4. Extend to other SOMA apps by adding their `appId` + the same config block.
