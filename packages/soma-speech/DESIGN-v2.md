# soma-speech version 2: a server-side engine

_Design note. Written 2026-10-21 by Claude Sonnet 5.5 (CCc) for Mike Wolf, bead sp-hih. Built the same day at Mike's request (bead sp-zu0): see "What was built" at the end, which records where the build differs from this plan._

## Recommendation

Use **ElevenLabs Scribe v2 Realtime** as the server-side engine.

The mic button does not change. The engine follows the engine interface that `soma-speech.js` already defines (see the header comment of that file). A page offers it with one attribute, a person chooses it from a menu beside the mic, and the mic falls back to the browser engine when it cannot be used.

## Why this service

1. **The estate already holds the key.** `ELEVENLABS_API_KEY` is in `playmaker/.env` and `soma-zoom-presence/.env`. On 2026-10-21 that key minted a realtime Scribe token (HTTP 200) on the Creator plan, so no new account, key or vendor review is needed. The estate holds no Deepgram key.
2. **The browser never sees the key.** The browser asks our server for a single-use token. The token expires after 15 minutes. The browser then opens a WebSocket straight to ElevenLabs and streams microphone audio there. Our server never carries the audio.
3. **The messages match the engine interface.** ElevenLabs sends `partial_transcript` while a person is speaking and `committed_transcript` when a segment is finished. Those map directly to our `interim` and `final` results.
4. **It works in every browser that has a microphone,** including Firefox, where the built-in engine does not exist.
5. **It is the same vendor as the estate's voices,** so there is one bill and one dashboard to watch.

## What it costs

| Service | Streaming price | Latency claim | Key held? | Source |
|---|---|---|---|---|
| **ElevenLabs Scribe v2 Realtime** | **$0.39 per hour** of audio ($0.0065 per minute) | about 150 ms | Yes, tested | [ElevenLabs pricing page](https://elevenlabs.io/pricing/api), read 2026-10-21 |
| OpenAI gpt-realtime-whisper | $0.017 per minute ($1.02 per hour) | not stated | Yes (`~/.hermes/.env`), not tested | [OpenAI model page](https://developers.openai.com/api/docs/models/gpt-realtime-whisper), via search result |
| Deepgram Nova-3 streaming | $0.0077 per minute ($0.46 per hour); $0.0048 promotional | under 300 ms | No | secondary sources, not checked against Deepgram's own page |

Three working examples at the recommended price:

- One person dictating 30 minutes a day, 22 days a month: 11 hours, about **$4.30 a month**.
- Mike dictating 2 hours a day, 22 days a month: 44 hours, about **$17 a month**.
- A studio room with four people who each dictate 1 hour a day, 22 days a month: 88 hours, about **$34 a month**.

Billing counts audio minutes while the socket is open. The mic button only opens the socket while it is listening, so silence between sessions costs nothing. Keyterm prompting (teaching it words such as "SOMA", "PlayMaker", "Accord") adds $0.08 per hour.

The browser engine costs nothing, so version 2 spends money only where the browser engine cannot serve: Firefox, a wrong-word problem that keyterms fix, or a room where the audio is not in a browser tab.

## Latency

ElevenLabs states about 150 ms for the model. That is a vendor figure and it excludes the network. Expect roughly 200 to 400 ms from a spoken word to its first interim appearance, which is the same range a person perceives as "live". The browser engine is comparable. Version 2 is not chosen to be faster.

Measure before relying on it: record a 60-second timing run from Mike's Mac and from a phone, and write the numbers into this note.

## How it would be built

```
page                              our server                     ElevenLabs
 |  click mic                        |                              |
 |-- POST /api/speech-token -------->|  check SOMA sign-in          |
 |                                   |  check spend gate (meter)    |
 |                                   |-- POST single-use-token ---->|
 |<-- { token } (15 min) ------------|<-- token --------------------|
 |-- WebSocket (token) --------------------------------------------->|
 |-- input_audio_chunk (16 kHz) ---------------------------------->  |
 |<-- partial_transcript  => { type: 'interim' } ------------------  |
 |<-- committed_transcript => { type: 'final' } -------------------  |
```

1. **Engine file.** `soma-speech-scribe.js` exports `createScribeEngine({ tokenUrl })`. `start()` fetches a token, calls `getUserMedia`, runs an AudioWorklet that turns microphone audio into 16 kHz PCM, and sends it as `input_audio_chunk` messages. `stop()` sends a commit, waits for the last `committed_transcript`, then closes the socket. Errors are mapped to the same codes the controller already knows (`not-allowed`, `audio-capture`, `network`).
2. **Token endpoint.** A small Netlify Function in the consuming app (or one shared function in `soma-platform`). It checks the caller's SOMA sign-in, applies the spend gate from `@soma/meter`, and then calls `POST /v1/single-use-token/realtime_scribe` with the key from the site's environment. The key stays on the server.
3. **Choosing it.** `data-engine="scribe" data-token-url="/api/speech-token"` on the script tag, or `engine: 'auto'` in code. `auto` uses Scribe when the person is signed in and the token call works, and quietly uses the browser engine otherwise. The `supported` flag, the "not supported" state and every message in version 1 stay as they are.
4. **No change to the core.** `soma-speech.js` is not edited. If the new engine needs a core change, the version 1 interface was wrong and gets fixed first.

## SOMA Rooms

When the voice room (LiveKit on the VPS) arrives, speech comes from each person's audio track, not from a page microphone. The same engine interface fits: a server-side engine reads the track, calls the same transcription service, and posts finals into the studio chat as that person's message. This is the case where a server engine is needed whatever happens to the browser engine.

## Risks and open questions

- **Plan limits.** The Creator plan has a limit on simultaneous realtime sessions that this note has not checked. A room of four may need a higher plan.
- **Privacy.** Audio leaves the browser for ElevenLabs. The browser engine already sends it to Google (Chrome, Edge) or Apple (Safari). The page must say which one applies. A customer who needs no retention needs an enterprise agreement; version 2 does not promise that.
- **Token abuse.** A signed-in user can mint tokens. The spend gate and a per-person rate limit on the endpoint are required, not optional.
- **Accuracy on SOMA words.** Not measured. Test with the keyterm list on three real recordings before claiming it beats the browser engine.
- **Pricing can change.** The figures above were read on 2026-10-21.

## What was measured (2026-10-21, synthetic voice)

Mike asked whether the mic could punctuate and tell a new sentence from a continuation. The browser engine cannot: it returns the words, cut at pauses. Scribe was tested with ElevenLabs text-to-speech audio sent through the real WebSocket (a clean voice, not Mike's, so accuracy on real speech is unmeasured). What each commit setting did with a pause in the middle of a sentence:

| Said | Cut at each 1-second pause | Cut after 3 seconds of silence, or on stop |
|---|---|---|
| "I think we should" [1.6 s] "start with the chat page and then the sidebar" | "I think we should." then "Start with the chat page…" (a wrong full stop) | "I think we should start with the chat page and then the sidebar." |
| "The chat page is done. Now" [1.6 s] "we should add the sidebar" | "…Now…" then "We should add the sidebar." | "The chat page is done. Now, we should add the sidebar." |
| "The chat page is done" [1.6 s] "and then we should add the sidebar. Is that right? I think so" | not tested | "The chat page is done. And then we should add the sidebar. Is that right? I think so." |

With no pause problem (four spoken sentences in a row) it returned "Okay, so here is what I want. The chat should let people talk, and the AIs should answer. Is that clear? Also, add a sidebar for the open questions." Sending the earlier text as `previous_text` context did not change the second half of a split sentence in the one trial run, so it is not used.

So Scribe decides sentence ends from meaning, as long as it is not forced to cut at short pauses. The build cuts after 3 seconds of silence (or when the person stops), and `commit: 'manual'` cuts only on stop.

## What was built, and where it differs from the plan

- **One file, not two.** The engine is in `src/soma-speech.js`, not a separate `soma-speech-scribe.js`: apps vendor one file, and the extra 10 KB is small.
- **A person's choice, not a page setting** (Mike, 2026-10-21: "a SOMA Designer (person) gets to choose"). A small menu beside the mic offers Standard and Punctuated; the choice is remembered in the browser. The page decides only whether Punctuated is offered.
- **The microphone opens at the click,** in parallel with the token request, so the first words are not lost and Safari still counts the audio as started by the person.
- **Automatic fallback with a spoken-out reason.** Not signed in, over the daily limit, offline or the service down: the mic starts Standard and says why.
- **A mic left open stops itself** after 30 seconds without words, because the service bills per audio minute.
- **The token handler is a library, not one shared function.** `server/speech-token.js` has the authorisation, per-person and shared daily limits, and the call to ElevenLabs. Each app wires it to its own sign-in (`supabaseAuthorize` for SOMA sign-in). The demo site wires it to a shared code, because the demo has no sign-in and an open endpoint would let anyone run up the bill.
- **Keyterm prompting is not included.** It costs $0.08 more per hour and was not tested.
- **Not done:** the Studio chat box does not offer Punctuated yet. That needs a token function on the soma-forge site and two lines in the Studio page (see the README).
- **Not measured:** accuracy on Mike's voice, and the Creator plan's limit on simultaneous sessions.
