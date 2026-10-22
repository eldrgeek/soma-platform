# `@soma/play`

Two parts of PlayMaker, wrapped as SOMA component library components for any
SOMA Studio app. Plain browser modules, no framework, no build step.

- **`play-view`**: one scene drawn read-only in Diana's script format, the
  house format PlayMaker uses (Times New Roman 11 pt, cues flush left in
  capitals with the speech under them, narrative directions in italics two
  inches in, technical cues at the margin, US Letter pages).
- **`stage-read`**: the scene read aloud, each character in its own voice,
  with the line being read highlighted in the play view.

In a Puppet description (v0.4) they are the elements `play-view "{row.text}"`
and `stage-read "{row.text}"` on a screen that shows one row; see
`packages/soma-puppet-runtime/GRAMMAR-v0.4.md`. The Puppet runtime serves
copies of `src/` at `/vendor/soma-play/` (a test checks they match).

## Files

| File | What it is |
|---|---|
| `src/script.js` | The scene's plain script text, read the way PlayMaker reads it: `parseScript`, `spokenLines`, `isTechnicalCue`, `castVoices`, `VOICES`. Shared by the page and the server, so the line the page highlights is the line the server speaks. |
| `src/play-view.js` | `mountPlayView(container, text)` returns `{ blocks, highlight(blockIndex), destroy() }`. |
| `src/stage-read.js` | `mountStageRead(container, { text, speak(line), onActive(blockIndex) })`. `speak` names a line by number and resolves to a `Response` with its audio. |
| `server/stage-read.js` | `createStageReader({ apiKey, store, limits })` returns `speak({ who, scope, text, line })`. The caller passes text it has already allowed this reader to read. |

## The text

Read in this order, line by line: a blank line ends a speech; `## Act 1
Scene 2` or a capitals line starting `ACT` or `SCENE` is a heading; a
technical cue is a direction at the margin (and ends a speech when it is in
capitals or parentheses); a capitals line of at most six words is a cue, and
the lines under it are the speech; `NAME: words` is a cue and its speech;
inside a speech a line in parentheses is a parenthetical; anything else is a
direction. The spoken lines are the speeches with words, numbered from 0.

## Stage Read's spend check

The ElevenLabs key stays in the server. On every line, after the runtime's
read checks, the server: counts the line against the person's lines today
(cached or not); replays it free from that person's cache if this voice has
said these words for them before; otherwise reserves the line's characters
from the person's allowance and the app's allowance for today (atomic, before
the call), calls ElevenLabs (`eleven_turbo_v2_5`), and gives the characters
back if the call fails. The Puppet runtime's limits: 600 characters per line,
3,000 per person per day, 8,000 per app per day, 400 lines per person per
day.

Voices are five ElevenLabs premade voices, PlayMaker's roster. Each character
starts from the voice its name hashes to; a scene never doubles a voice
unless it has more than five characters. Choosing voices is the later
voice-picker component.

## Where it came from

Ported on 2026-10-22 from PlayMaker (eldrgeek/playmaker master):
`src/lib/dianaLayout.ts` (the technical-cue rule), `src/features/scenes/
dianaDraft3.css` and `src/lib/houseStyle.ts` (the Diana format),
`src/lib/voices.ts` (the voice roster), `src/lib/stageRead.ts` (fetch ahead,
play in order, spotlight), `netlify/functions/lib/tts.ts` (the ElevenLabs
call). Not ported yet: PlayMaker's calibrated paginator (pages here break when
a page overflows), its acts-and-scenes outline, and editing.

Written by Claude Opus 5.5 (CCc) for Mike Wolf, bead sp-u4x, for GCT round 3.

```sh
node --test
```
