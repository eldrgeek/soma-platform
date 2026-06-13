# F7 — Margins: Over-the-shoulder Feedback (Wave 2 / W5)

**Owner:** W5 · **Status:** stub · **Spec:** playmaker-v0.1-spec.md §F7

## What goes here

A "Margins" feedback module that lets Eric arm a unit of work (line, speech, beat, scene), pick a feedback lens (Fit / Voice / Economy / Stage / Emotion), and receive short in-character reactions from Izzy and/or ChatGPT as margin notes.

## Mount point in the Writing Room

The Margins UI should be wired to the Working Document editor (`#script-panel`). The spec describes:

1. **Arm a unit:** Eric selects text in `#script-editor` and taps "Watch this" (or toggles "follow my cursor"). Auto-disarms when he moves on.
2. **Lens chips:** Quick chips in the `#action-bar` or a Margins side panel: Fit / Voice / Economy / Stage / Emotion + one-word custom.
3. **Character selector:** ChatGPT, Izzy, or both.
4. **Reactions:** Rendered as margin notes next to the armed unit — colored dot + ≤12 words, expandable. In-character and terse.
5. **Intensity dial:** Whisper (default) / Notes / Director. Hush silences instantly.

## Interface contract (W5 must honor)

```js
// Mount the Margins module onto the Working Document editor.
// @param {HTMLTextAreaElement} editorEl - The #script-editor element
// @param {object} options
// @param {Map} options.registry - Character registry from buildRegistry()
// @param {string[]} options.activeCharacterIds - Which characters are watching
// @param {'whisper'|'notes'|'director'} [options.intensity='whisper']
// @param {Function} options.onReaction - Called with { characterId, lens, text } for each reaction
export function mountMargins(editorEl, options) { /* W5 implements */ }

// Unmount and clean up the Margins module.
export function unmountMargins() { /* W5 implements */ }
```

## Implementation notes for W5

- Reactions fire on **pause** (debounced ~1.5s or on unit-complete), **never per-keystroke**.
- Route reactions through `sendToCharacter(char, { messages: [{role:'user', content: prompt}] })` using the Playmaker selector — this keeps the backend routing consistent.
- The `margins-reactor` capability in the character schema is the flag for characters that support this feature. Add it to Izzy's character.json when F7 is ready; ChatGPT's ui-bridge can stub it as well.
- Reactions must **never edit the text** — they are read-only annotations.
- For the F7 clickable prototype: build the UI affordance with placeholder reactions first, then wire soma-infer.

## Open question (for Mike + Eric)

React to the prototype before wiring inference — anything to add/cut from the lenses, or the two-character framing? (Spec §Open Q3)
