# @soma-platform/soma-assistant

Manifest-driven assistant library for the SOMA platform. Unifies the FAB
guide widget (soma-guide), the persona chat SPA (izzy-chat), and the
ElevenLabs voice agents under one SPINE + CAPABILITIES + CLIENT_BUNDLES model.

**Status: scaffold (branch only — `feat/soma-assistant-lib`).** Everything here
is a typed stub. No live site consumes this package yet. Branch is safe to
explore and extend; merge is a separate decision.

## Architecture

```
manifests/*.config.json ──▶ src/manifest/ (loader → validate → merge)
                                   │  merged config
                                   ▼
src/bundles/  (public-widget | subscriber-chat | voice-first-agent)
                                   │  invoke
                                   ▼
src/capabilities/ (answer-from-content | persona-conversation |
                   guided-site-driving | guide-as-tool | feedback-channel)
                                   │  built on
                                   ▼
src/spine/   (inference | voice | session-supervisor | transcripts | identity-stub)
```

## Migration map

| Current code | Current location | Maps to in this package |
|---|---|---|
| soma-infer `/ask` handler | `SOMA/services/soma-infer/server.js` | `src/spine/inference.js` → `ask()` — client seam only; service stays on VPS |
| soma-infer `/chat` handler | `SOMA/services/soma-infer/server.js` | `src/spine/inference.js` → `chat()` |
| soma-infer DEPTH_KEYWORDS classifier | `SOMA/services/soma-infer/server.js` (line ~60) | Stays server-side; surfaced as `intentClassifier.*` manifest block (app-level only, not subscriber-overridable) |
| `assistants/{name}/persona.md + knowledge.md + config.json` | `SOMA/services/soma-infer/assistants/` | Referenced by `manifests/*.config.json` persona block; resolved server-side — no move needed |
| izzy-chat TTS playback | `SOMA/services/izzy-chat/scripts/` | `src/spine/voice.js` → `SomaVoice.speak()` |
| izzy-chat STT (Web Speech API) | `SOMA/services/izzy-chat/scripts/` | `src/spine/voice.js` → `SomaVoice.listen()` |
| izzy-chat SPA shell (index.html + chat logic) | `SOMA/services/izzy-chat/` | `src/bundles/subscriber-chat.js` → `<soma-full-chat>` web component |
| soma-guide FAB + walkthrough engine | `packages/soma-guide/soma-guide.js` | **Engine NOT moved**; wrapped via `src/capabilities/guided-site-driving.js` + `src/bundles/public-widget.js` |
| soma-guide CSS | `packages/soma-guide/soma-guide.css` | Imported by public-widget bundle (unchanged) |
| Ask-Bill guide config (Legends) | bill-talk.netlify.app config | `manifests/bill.config.json` |
| Bill ElevenLabs agent embed | bill-talk.netlify.app + agent_2401ks53... | `src/bundles/voice-first-agent.js` + bill manifest `voice-first-agent` bundle |
| Izzy assistant config (persona/knowledge/config) | `SOMA/services/soma-infer/assistants/izzy/` | `manifests/izzy.config.json` |
| Ariadne guide-extension persona | `packages/guide-extension/ariadne-config.js` | `manifests/playwriting-platform.config.json` public-widget bundle |
| SOMA auth stub | `packages/auth/index.js` | `src/spine/identity-stub.js` — stable seam; real auth replaces the function body in Phase 4 |
| (net-new) session lifecycle + attribution | — | `src/spine/session-supervisor.js` |
| (net-new) transcript schema v1 + pulse-core routing | — | `src/spine/transcripts.js` |
| (net-new) delegate seam A5 | — | `src/capabilities/guide-as-tool.js` |
| (net-new) manifest merge contract 3c | — | `src/manifest/merge.js` + `schema/assistant-config.schema.json` |

## Manifest merge contract (spec 3c)

Subscribers **can** override: `persona.{name,voice_id,greeting,contextDoc}`,
`clientBundles.<id>.modalities` (disable-only — result = intersection),
`transcripts.defaultOn`.

Subscribers **cannot** override: `tenantPolicy.*`, `guide.*`, `capabilities[]`,
`spine.*`, `intentClassifier.*`.

Resolutions are logged in `_mergeLog`. `transcripts.retentionDays` resolves
to `min(app, subscriber)`. Schema versioning: breaking changes require a new
`$schema` major version; session supervisor rejects version-mismatched manifests.

## Transcript schema v1

Required attribution fields on every write (session supervisor rejects
records missing any of these):
- `capability_id` — `persona-conversation | guide-relay | answer-from-content`
- `auth_scope` — `anonymous | subscriber | tenant-admin`
- `source_provenance` — `user | assistant | guide-relay | system`
- `relay_source` — `guide | null`

See `src/spine/transcripts.js` for full schema and validation. All writes
route through `SessionSupervisor.writeTranscript()`.

## Phased extraction order (from spec roadmap)

1. **Phase 0** (this branch): manifest definition + scaffold — done
2. **Phase 1**: pre-ship checklist — transcript schema v1 → intent classifier → delegate seam harness → auth boundary enforcement (all gated before consult-and-relay on live instances)
3. **Phase 2**: extract soma-voice package
4. **Phase 3**: `<soma-full-chat>` wrapping izzy-chat SPA
5. **Phase 4**: per-subscriber config + SOMA Auth integration
6. **Phase 5**: manifest-driven mount for soma-guide
7. **Phase 6**: take-over-and-return UX
8. **Phase 7**: voice parallel dispatch (production prerequisite)

## Fable 5 design notes

Architecture designed by Claude Fable 5 (2026-06-09). Key decisions:

- `guided-site-driving` transcript `capability_id` maps to `guide-relay` (not
  a separate enum value) — guide invocations are relay events whether they originate
  from the capability or the tool seam.
- `subscriberOverride` JSON Schema uses `not`/`anyOf` to hard-block forbidden
  top-level keys at schema level, not just runtime validate.js — defense in depth.
- `voice.js` includes `parallelDispatch()` API stub now (spec A8) so the voice
  production path has a stable seam without requiring a client rewrite later.
- `src/manifest/loader.js` uses `import.meta.url` for default manifest path so
  the package is portable as an ES module without __dirname hacks.
