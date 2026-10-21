# @soma/speech

A microphone button that turns speech into text in a text box. One script tag, plain JavaScript, no framework, no build step, no dependencies. The person building the app chooses between two voices with one setting: **Standard** (the browser's own speech recognition) and **Punctuated** (ElevenLabs Scribe, which adds punctuation and capital letters). The people who use the app see only a mic.

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
- **The page keeps working.** When the box has focus, the words go in through the browser's own editing path, so Undo (Cmd-Z) removes the dictation. Otherwise the value is set the way React and other frameworks expect, and an `input` event is fired either way.
- **Focus is never moved.** The mic button does not take focus from the box, and dictation does not pull focus into the box if you are working in another field.
- **Screen readers** get `aria-pressed`, a label that changes with the state, and a polite live region for the bubble.

## Two voices: Standard and Punctuated

| | Standard | Punctuated |
|---|---|---|
| Engine | The browser's `SpeechRecognition` | ElevenLabs Scribe v2 Realtime |
| Cost | Free | About $0.39 per hour of audio |
| Punctuation and capitals | None (the words only) | Yes, and it decides where a sentence ends |
| Browsers | Chrome, Edge, Safari | Every browser with a microphone, Firefox included |
| Where audio goes | The browser maker's speech service (Google, Apple) | ElevenLabs |
| Needs | Nothing | A token endpoint on your server (below) |

**The app builder chooses the voice; the people using the app do not.** Standard is the default. To use Punctuated, set `data-voice="punctuated"` and give the address of your token endpoint:

```html
<script src="https://soma-speech.netlify.app/soma-speech.js"
        data-target="#chat-input" data-voice="punctuated"
        data-scribe-token-url="/api/speech-token" defer></script>
```

or `SomaSpeech.attach(el, { voice: 'punctuated', scribe: { tokenUrl: '/api/speech-token' } })`. Nothing about the choice shows to the people using the app: they see the same mic either way. If `voice: 'punctuated'` has no `scribe.tokenUrl`, the builder gets a console warning and the mic uses Standard. The demo page has a switch that shows both.

How Punctuated behaves:

- **It decides sentences from the words, not from pauses.** In a test, "I think we should" (1.8 second pause) "start with the chat page and then the sidebar" came back as one sentence. Cutting at every one-second pause would have put a full stop after "should". The default is to cut after 3 seconds of silence, or when you stop. Set `scribe: { commit: 'manual' }` to cut only when you stop.
- **If it cannot start, the mic uses Standard and says so,** for example "Punctuated voice needs you to be signed in. Using standard voice." The person never faces a dead button because of the service.
- **A mic left on stops itself.** After 30 seconds with no words the session ends; two silent sessions in a row end listening.
- **The first words are not lost.** The microphone opens at the moment of the click, in parallel with the token request, and audio captured while the connection opens is sent as soon as it is ready.
- Scribe options: `getHeaders()` (sign-in headers for the token call), `commit` (`'vad'` or `'manual'`), `silenceSeconds` (default 3), `languageCode` (default: Scribe detects the language), `idleSeconds` (default 30). A page can also set `window.somaSpeechAuthHeader = () => ({ authorization: 'Bearer …' })` once, which works with the script-tag form.

### The token endpoint (server side)

The page never holds the ElevenLabs key. It asks your server for a single-use token (valid 15 minutes) and then talks to ElevenLabs directly. `server/speech-token.js` is the handler: plain Node, no dependencies.

```js
const { createSpeechTokenHandler, supabaseAuthorize } = require('@soma/speech/server/speech-token.js');

const handle = createSpeechTokenHandler({
  apiKey: process.env.ELEVENLABS_API_KEY,
  authorize: supabaseAuthorize({ url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY }),
  store: { incr: async (key) => /* a counter that survives between requests */ },
  limits: { perPerson: 120, global: 400 }       // tokens per day; one token is one dictation session
});
// handle({ method, headers }) -> { status, headers, body }
```

It refuses anyone `authorize` does not accept (401, or 403 from `allow(user)`), counts each token against a daily limit per person and one for everyone (429 beyond them), and only then spends a call on ElevenLabs. It never returns the key. `supabaseAuthorize` checks a SOMA sign-in (the Supabase access token in the `Authorization` header). `demoCodeAuthorize` accepts a shared code instead, for a page with no sign-in.

To add it to an app that already has a SOMA sign-in, such as the Studio's site: put the key in the site's environment (`ELEVENLABS_API_KEY`), add a function like `netlify/functions/speech-token.mjs` here (with `supabaseAuthorize`), and give `attach` the `scribe` option with `getHeaders` returning the person's access token. The Studio does not do this yet.

## Options

| Option (code) | Attribute | Default | Meaning |
|---|---|---|---|
| `lang` | `data-lang` | the box's `lang`, then the page's, then the browser's | Language for Standard voice, such as `en-US`. |
| `mount` | `data-mount` | right after the box | An element or selector to put the button in, such as `#chat-actions`. |
| `voice` | `data-voice` | `standard` | The builder's choice: `'standard'` or `'punctuated'`. |
| `scribe` | `data-scribe-token-url` | none | What Punctuated needs: `{ tokenUrl, getHeaders, … }` (see above). |
| `engine` | | the browser engine | A function returning your own engine (see below), instead of either voice. |
| `onChange(info)` | | | Called on every state change with `{ state, interim, code, message, notice }`. |

The box also receives a bubbling `soma-speech-state` event with the same `info` as `detail`. Statuses are `idle`, `starting`, `listening`, `stopping` and `error`.

The instance returned by `attach` has `start()`, `stop()`, `toggle()`, `destroy()`, `voice` and `state`.

## Browser support and privacy

| Browser | Standard | Punctuated |
|---|---|---|
| Chrome, Edge | Works. | Works. |
| Safari (Mac, iPhone) | Works once Dictation is on: System Settings, Keyboard, Dictation. | Works. |
| Firefox | Not available. The button says so. | Works. |

Standard sends the audio to the browser maker's speech service (Google for Chrome and Edge, Apple for Safari) while the mic is listening. Punctuated sends it to ElevenLabs. The page needs `https` (or `localhost`).

## Engines: the adapter

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
  onend() {},
  onnotice(text) {}                // optional: tell the person something while listening
}
```

The browser engine and the Scribe engine are both written to this interface, and a third (for example the SOMA Rooms voice path) would be too. `src/soma-speech-fake.js` is a scripted engine used by the tests and the demo's "simulated voice". Design notes and the measurements behind the Scribe settings are in [DESIGN-v2.md](DESIGN-v2.md).

## Tests

```sh
cd packages/soma-speech
npm install               # once: only the demo site's function needs a dependency (@netlify/blobs)
npm test                  # 119 tests, Node only
npm run mutation-check    # breaks the source 19 ways and requires the tests to fail each time
```

The Node tests use a fake text box, a scripted engine, a fake `SpeechRecognition` class, a fake WebSocket, a fake token endpoint and a fake microphone. They cover the insert rules, the controller (interim, final, stop, restart on silence, errors, read-only boxes, destroy), the browser engine, the Scribe engine (connecting, queued audio, results, stopping, idle, every failure), the person's choice and fallback, the resampler, and the token handler (who may ask, the daily limits, that the key never leaves the server).

`npm run mutation-check` copies a source file to a temporary file, breaks one line at a time (the insert drops the existing text, interim words are written into the box, audio is dropped while the socket opens, the last words are lost on stop, the per-person limit is off by one, the key is sent back to the page, anyone is let in, and so on) and runs the suite on each broken copy. It first runs the suite on the real source, because a failure only means something if the unbroken source passes. It fails if any broken copy passes, and it checks that the source files did not change. Last run, 2026-10-21: baseline green, 19 of 19 broken copies caught.

**The browser test** (`test/browser-test.html`, served at `/test/`) runs 24 checks in a real browser against the real DOM with the scripted engines: the button, the bubble, interim words staying out of the box, the cursor, focus, Esc, the one-line script-tag install, the `data-soma-speech` marker, the state event, Undo, and the builder's voice setting (Standard by default, no menu ever shown to the person, Punctuated text lands in the box, a refused token falls back to Standard with an explanation, a missing token address warns the builder, `data-voice` works on a marked box). Open `/test/` on the demo site in any browser, or serve this folder with any static server.

**The end-to-end check** (`test/scribe-e2e.html`, served at `/test/scribe/`) plays an 8-second synthetic voice into the real mic button, the real token endpoint and the real Scribe service, and checks the text that lands in the box: punctuated, capitalised, and not cut at a mid-sentence pause. It needs the demo code. The sample (`test/assets/sample-speech.wav`) was made with ElevenLabs text-to-speech.

**What no test can show:** that a microphone hears you, or how accurate Scribe is on your voice. Only a person speaking into a supported browser proves that.

## Files

| File | What |
|---|---|
| `src/soma-speech.js` | The component: the mic button, the browser engine, the Scribe engine, the builder's voice setting. |
| `src/soma-speech-fake.js` | The scripted engine, for tests and demos. |
| `server/speech-token.js` | The token handler, with `supabaseAuthorize` and `demoCodeAuthorize`. |
| `netlify/functions/speech-token.mjs` | The demo site's token endpoint (`/api/speech-token`), gated by a demo code. |
| `test/*.test.js`, `test/helpers.js` | Node tests and their fakes. |
| `test/browser-test.html`, `test/scribe-e2e.html` | The in-browser wiring test and the end-to-end check. |
| `scripts/mutation-check.js` | The mutation check. |
| `scripts/build-site.js` | Gathers the demo site into `public/` (the component itself has no build step). |
| `site/` | The demo page and the vendored feedback chip. |
| `netlify.toml` | Demo site settings. |
| `DESIGN-v2.md` | Why Scribe, what it costs, what was measured, what was built. |

## The demo site

`https://soma-speech.netlify.app` is a Netlify site linked to this repository with base directory `packages/soma-speech`. A merge to `master` runs `node scripts/build-site.js` and publishes `public/`, and bundles the token function. The site has no sign-in and is not on the shared SOMA sign-in allow-list. It carries the SOMA feedback chip (`data-site="soma-speech"`). `soma-speech.js` is served with `Access-Control-Allow-Origin: *` and a 5-minute cache, so other apps can load it with one script tag.

The Punctuated voice on the demo is gated by a demo code, because the demo has no sign-in and an open token endpoint would let anyone run up the ElevenLabs bill. Site environment: `ELEVENLABS_API_KEY`, `SPEECH_DEMO_CODE`. Limits: 150 tokens a day for the code, 300 a day in all. The code is kept at `~/.config/soma-speech/demo-code` on Mike's Mac; to rotate it, set a new `SPEECH_DEMO_CODE` with `_estate/bin/netlify-env-set` and save it there.

## Authorship

Version 1 written 2026-10-21 by Claude Sonnet 5.5 (Claude Code) for Mike Wolf, as workstream B of the SOMA Studio start (brief: `SOMA/specs/forge-room-brief.md`), bead sp-hih. Version 2 (the Punctuated voice) the same day, at Mike's request, bead sp-zu0. Mike then corrected the design: the voice is a setting for the person building the app, not a menu for the people using it (bead sp-spd).
