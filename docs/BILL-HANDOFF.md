# Bill / Legends / SOMA-Guide — Handoff

*Last updated 2026-06-18. The state of the Bill voice/text assistant, the Legends change-management pipeline, and everything wired up across repos. Companion: `SOMA-IDENTITY-STATES.md` (identity model).*

## What this system is

A site assistant ("Bill") embedded on the Legends of Basketball membership site, plus a change-management pipeline. Bill can give tours, answer questions, operate on-page controls, take bug/feature reports, and recognize returning users. Reports flow into a unified queue; admins approve and review work; a daemon dispatches dev workers and tracks completion. Bill talks by **text** or **voice** (ElevenLabs Conversational AI), with specialist personas that hand off in their own voices.

## Repos & topology

| Repo (local) | Role | Deploy |
|---|---|---|
| `~/Projects/legends-membership-site` | The static site + admin Change Log + Bill config + tour audio + Netlify functions | Auto-deploys to **production** on push to `master` (Netlify) |
| `~/Projects/soma-platform` | The shared SOMA-Guide engine (`packages/soma-guide/soma-guide.{js,css}`) + docs | **Manual** deploy of `dist/` to `soma-guide.netlify.app` |
| `~/Projects/claude-email-daemon` | `daemon.py` — email→queue, vet, dispatch, completion | Runs locally on Mike's Mac; restart to pick up changes |
| `~/Projects/bill-talk` | ElevenLabs TTS proxy (`el-proxy`) + holds `ELEVENLABS_API_KEY` in its Netlify env | Netlify |

- **CDN engine URL:** `https://soma-guide.netlify.app/soma-guide.js` (+ `.css`). All Legends pages load it via `<script type="module">`. **Current version: `2026-0617j`.**
- **Supabase project:** `omfwcodoimjmbrhssvfl`. Tables: `change_requests` (the unified queue), `bill_transcripts` (conversation recording).

### ⚠️ Deploy gotchas (read before deploying)

1. **`git push` to soma-platform does NOT update the CDN.** The soma-guide Netlify site is not repo-linked (verified 2026-07-03: `build_settings.repo_url: None`), and `dist/` is a hand-maintained mirror with no build step. To ship an engine change:
   ```
   # edit packages/soma-guide/soma-guide.js, bump SOMA_GUIDE_VERSION
   scripts/deploy-guide.sh   # syncs package → dist, deploys (site id pinned), verifies CDN
   git add -A && git commit --no-verify -m "..." && git push   # history only; push ships nothing
   ```
   The script resolves the `netlify` CLI from PATH or `~/.nvm/versions/node/*/bin` and fails loudly if the CDN doesn't serve the new version within ~2 min.
2. **CDN `Cache-Control: max-age=300`.** After deploy, hard-refresh (Cmd-Shift-R) to bypass the 5-min JS cache. Bumping `SOMA_GUIDE_VERSION` only invalidates stale sessionStorage state, not the JS cache.
3. **Legends working tree drifts onto branch `preview/review-work-page-and-history`.** Always check `git rev-parse --abbrev-ref HEAD`; push with `git push origin HEAD:master` and re-`checkout master` if needed.
4. **Stale `.git/HEAD.lock` / `index.lock`** appear (timed-out sandbox git). `rm -f .git/HEAD.lock .git/index.lock` before committing if commits silently no-op.
5. **Tour audio** (`legends-membership-site/audio/tour/*.mp3`) is prerendered; after editing any walkthrough `narration`, run `node scripts/gen-tour-audio.mjs` and commit the new clips.

## The personas (ElevenLabs agents)

| Persona | Role | Agent ID | Voice |
|---|---|---|---|
| **Bill** | Main guide | `agent_2401ks53q6t8e2drt1h7va3f2c52` | `nPczCjzI2devNBz1zQrb` |
| **Dana · Member Services** | Intake (takes bug/feature reports) | `agent_7601kvbcdj4mecwagv960x87fwhc` | Alice `Xb7hH8MSUJpSbSDYk0k2` |
| **Quinn · Review** | Reviews completed work | `agent_7501kvb3j188eyq90ssgfe827qw0` | Sarah `EXAVITQu4vr4xnSDxMaL` |

- Each persona is a **separate agent** because ElevenLabs has `voice_id` override **disabled** on Bill — you can't swap voices on one agent, so distinct voices = distinct agents.
- Personas are declared in `legends-guide-config.js` under `personas: { intake, review }` with `voiceAgentId`. The engine's `_handoffTo(key)` switches name/avatar and (in voice) reconnects to that agent.
- Edit agents via the ElevenLabs API: key = `cd ~/Projects/bill-talk && netlify env:get ELEVENLABS_API_KEY` (never printed). `GET/PATCH https://api.elevenlabs.io/v1/convai/agents/<id>`; tools via `POST /v1/convai/tools`. **PATCH the prompt with a minimal `{conversation_config:{agent:{prompt:{prompt, tool_ids}}}}` merge** — sending the whole prompt object 400s.

## Client tools (voice agent → engine)

Registered in `startSession({clientTools})` in the engine (`_buildClientTools`); declared on agents by tool id. The engine handlers do the real work.

| Tool | ElevenLabs tool id | What it does |
|---|---|---|
| `start_tour` | `tool_2601kvb1sgvfeavb4ct1a08cc9tt` | Launches the on-page walkthrough |
| `operate_site` | `tool_7801kvb1t20reg89w6ymryg0yzwd` | Runs a matched on-page action (add member, etc.) |
| `submit_request` | `tool_7901kvb1t25cfz0sg3nvr74dkesf` | Files a bug/change into `change_requests` |
| `report_bug` | `tool_3801kvbcdhv5esg9tsaesvemgkp4` | Hands off to Dana (Bill calls this; Bill keeps `submit_request` as fallback) |
| `set_identity` | `tool_3501kvbhp4jjf9hrhj37267kpmr9` | Persist name (+optional email) — shared with text flow |
| `end_session` | `tool_2401kvbhp4qaf46tz2m2hgs6t0fz` | "I'm done" → stop voice + close widget |
| `whoami` | `tool_0401kvbvskx7f3wt8pksvphvav7t` | Describe what's known about the user |
| `reset_identity` | `tool_3201kvbvsm3qfjdv9ftgeg34kc4z` | "Reset the cookies / forget me" |

Bill has: request_site_work (legacy webhook), search, ask_dewey, fetch_url, start_tour, operate_site, report_bug, set_identity, end_session, whoami, reset_identity (12). Dana has: submit_request, end_session. Quinn has: operate_site, submit_request, start_tour, end_session.

## Identity (see `SOMA-IDENTITY-STATES.md`)

States: present → named → identified → registered → logged-in. Resolution per tab: SomaAuth session → sessionStorage (tab override) → localStorage (sticky device default). Engine methods: `_resolveIdentity`, `_applyName`, `_applyEmail`, `_resetIdentity`, `_describeIdentity`, `_identityVars`, `_syncAccount`; text capture: `_maybeStartCapture` / `_handleIdentityReply` / `_handleIdentityMeta`. **Text and voice use the same persistence** (set_identity → `_applyName`/`_applyEmail`). First contact: "I'm Bill. Have we met before?" → name → role intro → invite email/login; `name_declined` after two real refusals; metaknowledge ("what do you know about me / reset the cookies"). Cost rates tunable via `cfg.costRates` (defaults: TTS $0.22/1k chars, convai $0.10/min, inference $0.01/call).

## Change Log / queue / daemon

- **`change_requests`** (Supabase) is the one queue; two front doors: Bill intake (`/.netlify/functions/submit-intake`) and email (daemon mirrors auto-dispatched emails in). `admin-changelog.html` renders it: **Approve** (kick off), **Review work** (`crReview` → inline `#preview-frame` + Quinn handoff), **Accept** (sign off), **Revert change** (`crRevert` files a tracked git-revert request), **Cancel**. Active tasks show running-time health (stale ⚠ at 30 min).
- **`daemon.py`**: polls `change_requests`; `_second_opinion` (Opus via `claude -p`) vets reversibility/risk; owner→auto-approve, member+risky→awaiting-approval w/ deep-linked email; build-firing dispatches `approved` rows via cc-dispatch (records commit SHA on completion → enables one-click Revert); flips to `awaiting-review` + notifies. Restart: `launchctl kickstart -k gui/$(id -u)/com.mikewolf.claude-email-daemon`. Config: `config.yaml` + secrets in gitignored `.env` (Supabase URL + service key). **Tests stub `Popen` and the live daemon never dispatches `source='test'` rows (env-gated).**
- **Recording:** every turn (incl. voice since 0617a, and `cost`/`identity_set`/`handoff`/`review_start` events) POSTs to `log-bill` → `bill_transcripts`. Query the latest sessions to diagnose ("where things went wrong").

## Secrets (locations, not values)

- ElevenLabs API key: `ELEVENLABS_API_KEY` in **bill-talk** Netlify env (`netlify env:get`).
- Supabase service key: `~/Projects/claude-email-daemon/.env` (chmod 600).
- Supabase Management API token: macOS keychain, service `Supabase CLI` account `supabase` (`security find-generic-password -s "Supabase CLI" -a supabase -w`).

## Done this session

Build-firing in daemon; email→queue unification; Change Log Revert-as-request + Accept-on-review + active-task health + the `crReview` page-format fix (relative/null pages no longer dead-end); voice-to-tools bridge (start_tour/operate_site/submit_request); voice-turn recording; **Quinn** reviewer (own voice) for "Review work"; tour cue-stripping fix (was reading `[[arrow…]]` aloud + always falling back to live TTS) + prerendered audio now matches; running **cost meter**; **Dana** intake handoff (Bill→Dana, own voice) with Bill fallback; identity-aware **intro-once** greeting; **end_session** done→close; and the full **identity state machine** with text/voice capture parity + metaknowledge.

## Pending / open decisions

1. **Interactive live tour** — replace the scripted/prerendered tour with an agent-driven one (barge-in, mid-tour questions, opens pages/dropdowns/highlights live). **Blocked on a fork:** a live voice session dies on full-page navigation (multi-page site) → needs either an **iframe-panel tour** (voice survives on parent) or a **single-page** tour. Decide before building. Cost is measurable via the meter once built. Also needs a `navigate` client tool (also fixes Quinn's "take me to the page" gap).
2. **Robust Dana handoff** — current handoff is a client-side teardown/restart that races the orb/auto-reconnect (a fresh Bill sometimes comes up instead of Dana). De-risked by Bill's fallback. Proper fix = ElevenLabs **native agent-to-agent transfer** (one session). Needs live voice test.
3. **Per-tab login isolation** — the cookie-layer identity is done, but true per-tab *login* (Greg in one tab, Mira in another) requires SomaAuth/Supabase to persist its session **per-tab** (it defaults to shared localStorage). That's an auth-layer change to scope separately. Default today: login is browser-wide.
4. **File/screenshot upload** to Bill (esp. for bug reports) — deferred, not started.
