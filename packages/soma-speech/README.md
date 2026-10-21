# @soma/speech

A microphone button that turns speech into text in a text box. One script tag, plain JavaScript, no framework, no build step, no dependencies.

**Try it:** https://soma-speech.netlify.app (no sign-in). **Browser test:** https://soma-speech.netlify.app/test/

First user: the SOMA Studio chat box. PlayMaker and any other SOMA app can add it the same way.

## Add it to any SOMA app in one line

```html
<script src="https://soma-speech.netlify.app/soma-speech.js" data-target="#chat-input" defer></script>
```

A mic button appears next to the `<textarea>` or text `<input>` that matches `data-target`. Several boxes: `data-target="#a, #b"`. Or mark a box instead of naming it: `<textarea data-soma-speech></textarea>`.

For a box your app draws after the page loads (React, Studio's chat), call it from code once the box exists:

```js
const mic = SomaSpeech.attach('#chat-input');            // a selector or an element
const mic = SomaSpeech.attach(el, { lang: 'en-GB', mount: '#chat-actions' });
```

The file is one file with no dependencies, so an app that wants a pinned copy can vendor `src/soma-speech.js` instead of loading it from the demo site.

## What a person sees

| State | What shows |
|---|---|
| Idle | A round mic button. Tooltip: "Start voice typing (Esc stops)". |
| Starting | The button turns red. Bubble: "Starting. If the browser asks, allow the microphone." |
| Listening | Red button with a pulse, a red ring around the box, and a bubble above the button showing the words as they are being recognised. |
| Finishing | Bubble: "Finishing…" while the engine delivers its last words. |
| Error | Amber button and a plain sentence: microphone blocked, no microphone, Dictation off on a Mac, no network, nothing heard. It clears after 8 seconds. |
| Not supported | A dimmed, struck-through mic. Clicking it says why and what to use instead. |

Click the mic to start, click it again or press **Esc** to stop. Listening also stops when the tab is hidden, so the microphone is never left on in a background tab.

## How the words get into the box

- **Interim words are never written into the box.** They show in the bubble only, so pressing Enter in a chat box cannot send half a sentence.
- **Final words go in at the cursor,** replacing any selected text, and the cursor moves to the end of the new words. Text already typed stays. If you move the cursor or type between two phrases, the next phrase goes where the cursor is then.
- **Spacing is fixed for you.** "hello" followed by "world" gives "hello world". Punctuation attaches to the word before it. A box nobody has touched gets the words after its existing text, not in front of it.
- **Words you saw are not lost.** If you stop before the engine finalises the last words, they are inserted anyway.
- **The page keeps working.** When the browser tab has the box focused, the words go in through the browser's own editing path, so Undo (Cmd-Z) removes the dictation. Otherwise the value is set the way React and other frameworks expect, and an `input` event is fired either way.
- **Focus is never moved.** The mic button does not take focus from the box, and dictation does not pull focus into the box if you are working in another field.
- **Screen readers** get `aria-pressed`, a label that changes with the state, and a polite live region for the bubble.

## Options

| Option (code) | Attribute | Default | Meaning |
|---|---|---|---|
| `lang` | `data-lang` | the box's `lang`, then the page's, then the browser's | Language for recognition, such as `en-US`. |
| `mount` | `data-mount` | right after the box | An element or selector to put the button in, such as `#chat-actions`. |
| `engine` | | the browser engine | A function returning an engine (see below). |
| `onChange(info)` | | | Called on every state change with `{ state, interim, code, message }`. |

The box also receives a bubbling `soma-speech-state` event with the same `info` as `detail`, so a page can follow the state without touching the component. Statuses are `idle`, `starting`, `listening`, `stopping` and `error`.

The instance returned by `attach` has `start()`, `stop()`, `toggle()`, `destroy()` and `state`.

## Browser support and privacy

| Browser | Voice typing |
|---|---|
| Chrome, Edge | Works. |
| Safari (Mac, iPhone) | Works once Dictation is on: System Settings, Keyboard, Dictation. |
| Firefox | Not available. The button says so. |

The browser engine sends the audio to the browser maker's speech service (Google for Chrome and Edge, Apple for Safari) while the mic is listening. The page needs `https` (or `localhost`).

## Engines: replacing the browser engine

The engine is an adapter. `attach` takes `engine: () => engine`, where an engine is:

```js
{
  name: 'my-engine',
  supported: true,                 // false shows the "not supported" state
  start({ lang }) {},              // begin capturing; called again after onend
  stop() {},                       // deliver pending text, then call onend
  abort() {},                      // optional: drop everything now
  // SomaSpeech assigns these; the engine calls them:
  onstart() {},
  onresult({ type, text }) {},     // 'interim' replaces the last interim; 'final' commits
  onerror({ code, message }) {},   // not-allowed, service-not-allowed, audio-capture, network, no-speech, aborted
  onend() {}
}
```

`src/soma-speech-fake.js` is a scripted engine used by the tests and the demo's "simulated voice". The plan for a server-side engine is in [DESIGN-v2.md](DESIGN-v2.md): ElevenLabs Scribe v2 Realtime, about $0.39 per hour, using the key the estate already holds. It is designed, not built.

## Tests

```sh
cd packages/soma-speech
npm test                  # 44 tests, Node only, no dependencies
npm run mutation-check    # breaks the source 7 ways and requires the tests to fail each time
```

The Node tests use a fake text box, the scripted engine and a fake `SpeechRecognition` class. They cover the insert rules, the controller (interim, final, stop, restart on silence, errors, read-only boxes, destroy) and the browser engine's event handling.

`npm run mutation-check` copies `src/soma-speech.js` to a temporary file, breaks one line at a time (the insert drops the existing text, the selection is not replaced, the space is missing, interim words are lost on stop, interim words are written into the box, the engine is not restarted after silence, an untouched box is filled from the wrong end) and runs the suite on each broken copy. It first runs the suite on the real source, because a failure only means something if the unbroken source passes. It fails if any broken copy passes, and it checks that the source file did not change. Last run, 2026-10-21: baseline green, 7 of 7 broken copies caught.

**The browser test** (`test/browser-test.html`, served at `/test/`) runs 18 checks in a real browser against the real DOM with the scripted engine: the button, the bubble, interim words staying out of the box, the cursor, focus, Esc, the one-line script-tag install, the `data-soma-speech` marker, the state event, and Undo. Run it in any browser by opening `/test/` on the demo site, or locally with any static server pointed at this folder.

**What no test can show:** that a microphone hears you. Only a person speaking into a supported browser proves that. The demo site exists for that check.

## Files

| File | What |
|---|---|
| `src/soma-speech.js` | The component. |
| `src/soma-speech-fake.js` | The scripted engine, for tests and demos. |
| `test/soma-speech.test.js` | Node tests. |
| `test/browser-test.html` | The in-browser wiring test. |
| `scripts/mutation-check.js` | The mutation check. |
| `scripts/build-site.js` | Gathers the demo site into `public/` (the component itself has no build step). |
| `site/` | The demo page and the vendored feedback chip. |
| `netlify.toml` | Demo site settings. |
| `DESIGN-v2.md` | Plan for a server-side engine. |

## The demo site

`https://soma-speech.netlify.app` is a Netlify site linked to this repository with base directory `packages/soma-speech`. A merge to `master` runs `node scripts/build-site.js` and publishes `public/`. It has no sign-in and is not on the shared SOMA sign-in allow-list. It carries the SOMA feedback chip (`data-site="soma-speech"`). `soma-speech.js` is served with `Access-Control-Allow-Origin: *` and a 5-minute cache, so other apps can load it with one script tag.

## Authorship

Written 2026-10-21 by Claude Sonnet 5.5 (Claude Code) for Mike Wolf, as workstream B of the SOMA Studio start (brief: `SOMA/specs/forge-room-brief.md`). Bead sp-hih.
