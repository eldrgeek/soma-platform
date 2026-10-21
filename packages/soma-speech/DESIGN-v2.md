# soma-speech version 2: a server-side engine

_Design note, not built. Written 2026-10-21 by Claude Sonnet 5.5 (CCc) for Mike Wolf. Bead sp-hih._

## Recommendation

Use **ElevenLabs Scribe v2 Realtime** as the server-side engine.

The mic button does not change. A new engine file, `soma-speech-scribe.js`, follows the engine interface that `soma-speech.js` already defines (see the header comment of that file). A page chooses it with one attribute, and falls back to the browser engine when it cannot be used.

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

## What version 2 is not

It is not built. Nothing in version 1 depends on it. The decision this note asks for is only: *do we keep ElevenLabs Scribe v2 Realtime as the chosen engine when the time comes?*
