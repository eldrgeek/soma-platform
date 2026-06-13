# F2 — Voice-Clone Workflow (Wave 2 / W3)

**Owner:** W3 · **Status:** stub · **Spec:** playmaker-v0.1-spec.md §F2

## What goes here

A guided in-browser workflow that walks Izzy's voice donor (Eric's friend, also named Izzy) through consent, recording, and ElevenLabs PVC creation. When complete, it updates `characters/izzy/character.json` with the real `voiceAgentId`.

## Mount point

This workflow should be accessible at a path like `/voice-clone` in soma-playwriting, or as a panel inside the Writing Room gated behind an admin/friend invite link.

## Interface contract (W3 must honor)

```js
// Entry point for the voice-clone workflow.
// Called when the voice donor opens the consent + recording flow.
// @param {string} characterId - e.g. 'izzy'
// @param {object} options
// @param {string} options.donorName - Display name of the voice donor
// @param {Function} options.onComplete - Called with { voiceId, agentId } on success
export function startVoiceCloneWorkflow(characterId, options) { /* W3 implements */ }
```

## Steps (per spec)

1. **Consent/legal** — display voice-likeness release (scope, usage, revocation, storage). Capture consent before any audio is accepted.
2. **Recording** — ElevenLabs-recommended script/coverage. Record in-browser or upload existing audio. Quality-check (length, noise floor).
3. **Clone + wire** — create ElevenLabs voice via API, store `voice_id`. Optionally create a conversational agent and store `voiceAgentId`. Write both to `characters/izzy/character.json`.

## After completion

- Update `characters/izzy/character.json`: set `voiceAgentId` to the real ElevenLabs agent ID and `persona.voice_id` to the clone voice ID.
- The Writing Room will automatically use the voice agent for Izzy's replies once `voiceAgentId` is non-null.

## Open question (for Mike)

Do you have consent/release language for voice-likeness cloning, or should a draft be generated for your lawyer to vet? (Spec §Open Q1)
