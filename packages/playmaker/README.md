# @soma-platform/playmaker

**Playmaker** is Eric Kohner's AI-assisted writing platform. This package is the engine — character model, selector, and backend routing — that lives in `soma-platform` alongside `soma-guide`, `soma-assistant`, and `auto-mapper`.

The first host app is `soma-playwriting/assistant.html` (the Writing Room, `?room=eric`).

## Character model

A Playmaker **character** is a named AI partner with:

| Field | Purpose |
|---|---|
| `characterId` | Stable kebab-case key (e.g. `"izzy"`, `"chatgpt"`) |
| `displayName` | Shown in the selector chip and message labels |
| `avatar` | Single emoji for the character |
| `backend` | `"soma-infer"` or `"ui-bridge"` (see below) |
| `backendConfig` | Backend-specific config (inferUrl, relayTarget, etc.) |
| `voiceAgentId` | ElevenLabs conversational agent ID (null = pending F2) |
| `persona` | `{ name, voice_id, greeting, personaDoc, knowledgeDoc, systemPromptSummary }` |
| `capabilities` | Array of capability flags |

This shape extends the soma-assistant manifest model: `persona.name`, `persona.voice_id`, `persona.personaDoc`, and `persona.knowledgeDoc` map directly onto `manifest.persona` fields. A character can be promoted to a full soma-assistant manifest without restructuring.

Full schema: `schema/character.schema.json`

## Characters

### Izzy (`characters/izzy/`)

- **Backend:** `soma-infer` → VPS `/infer/chat` (same path as Bill + Ariadne)
- **Persona:** Dramaturge, life coach, research assistant on *Witness Projection*. NYC street edge, no-bullshit, totally believes in Eric. Persona and knowledge migrated from `SOMA/services/izzy-chat` + `SOMA/eric/witness-projection-archive`.
- **Voice:** `voice_id` is a placeholder. Real voice = friend Izzy's ElevenLabs clone (F2, Wave 2). `voiceAgentId` is null until F2 completes.
- **Product name:** "Izzy Assistant" (the standalone product) is retired in Playmaker-surfaced UI. Izzy is now a *character* inside Playmaker.

### ChatGPT (`characters/chatgpt/`)

- **Backend:** `ui-bridge` → Yeshie hardened relay (F4, built by W2)
- **Status:** Stub. `backendConfig.relayTarget` is null; `sendToCharacter('chatgpt', ...)` returns a graceful "bridge not yet connected" placeholder until W2 lands.
- **Why ui-bridge:** Eric has years of conversation history and a trained relationship with his ChatGPT. Preserving that means routing through ChatGPT's actual UI (no API), not a separate Claude instance.

## Backends

| Backend | Implementation | Status |
|---|---|---|
| `soma-infer` | `src/backends/soma-infer.js` | Live |
| `ui-bridge` | `src/backends/ui-bridge.js` | Stub (W2 fills) |

## API

```js
import { buildRegistry, sendToCharacter, getSelectorOptions } from '@soma-platform/playmaker';
import izzyDef from './characters/izzy/character.json' assert { type: 'json' };
import chatgptDef from './characters/chatgpt/character.json' assert { type: 'json' };

const registry = buildRegistry([izzyDef, chatgptDef]);

// Get selector options for the Writing Room UI
const opts = getSelectorOptions(registry);
// [{ characterId: 'izzy', displayName: 'Izzy', avatar: '🎭', available: true },
//  { characterId: 'chatgpt', displayName: 'ChatGPT', avatar: '🤖', available: false }]

// Send a message to a character
const char = registry.get('izzy');
const result = await sendToCharacter(char, {
  messages: [{ role: 'user', content: 'What is the two-Eric device?' }],
  workingDocument: '...current draft...',
  deepMode: false,
  projectHint: "Eric Kohner's Writing Room on Playmaker.",
});
// { reply: '...', model: '...', source: 'soma-infer' }
```

## Tests

```sh
npm test
```

Uses `node --test` (no external test runner). All tests are synchronous except the ui-bridge stub test.

## Wave-2 mount points

| Feature | Stub location | Owner |
|---|---|---|
| F2 — Voice-clone workflow | `wave2-stubs/voice-clone/` | W3 |
| F3 — History import | `wave2-stubs/history-import/` | W3 |
| F5 — Google Doc sideload | `wave2-stubs/google-doc-sideload/` | W4 |
| F7 — Margins feedback | `wave2-stubs/margins/` | W5 |

Each stub has a README with the interface contract and integration notes.

## TODO (redirect gated on parity)

```
TODO (F1 parity gate): Redirect izzy-assistant.netlify.app → Playmaker
once Playmaker reaches feature parity with the standalone Izzy Assistant.
Do NOT change DNS/Netlify config until:
  1. Izzy's voice clone (F2) is complete
  2. Session history is preserved or migrated
  3. Eric has confirmed Playmaker as his primary interface
The VPS izzy-chat endpoint continues serving until then.
```
