# `@soma/video`

The video parts of VideoMaker, the SOMA Studio app for writing and producing
videos. VideoMaker is to PlayMaker what a video script is to a play script, so
these are PlayMaker's parts made for video, as SOMA component library
components. Plain browser modules, no framework, no build step.

- **`video-view`**: a video script drawn read-only as a two-column AV script,
  picture on the left and sound on the right, with each scene's estimated length,
  the cast and their voices, and the checks to fix before rendering. It is to a
  video script what soma-play's `play-view` (Diana's format) is to a play.
- **`video-read`**: the narration read aloud, each narrator in their own voice,
  with the row being read highlighted in the view. It is soma-play's Stage Read,
  reused: the same player and the same server checks, given a video script's
  lines and voices.

The third v0.5 element, `script-editor` (change a row's text), is drawn by the
Puppet runtime itself. See `packages/soma-puppet-runtime/GRAMMAR-v0.5.md`.

## The script

The SOMA script format: Fountain, as the soma-cut renderer reads it
(`~/Projects/soma-cut/SCRIPT-FORMAT.md`, skill `soma-script-format`). A title
page, `SETTINGS`, scenes headed `.HEADING`, narrators as character cues, and the
performers `CARD`, `CLIP`, `GIF`, `RECUT`, `CREDITS`, `CHROME`, `MUSIC`, `SFX`.

VideoMaker adds one block, `CAST`, because a script in an app is one row of
text and must carry its own voices:

```
CAST
CLAUDE: Chris
SUNO: Charlie
```

soma-cut reads voices from a `<film>.cast.json` sidecar instead. That is the one
deviation from the standard, and `vm-export` resolves it: it writes the script
without `CAST` and the sidecar beside it.

A music video is clocked by its song, not by narration. Two pieces of
Fountain carry that:

```
.VERSE 1 0:14-0:48

CARD reveal
# War

~War is the angry expression of…
~The absence of reason, the absence of Love
```

- A line that starts with `~` is a sung lyric (Fountain's lyric syntax). It is
  drawn in the sound column beside the picture before it, one line each, and a
  reading never speaks it.
- Song times in a heading (`0:14-0:48`, `0:14 to 0:48`, or with an en dash)
  are that scene's length, in place of the estimate from words and footage.

The renderer for such a script is the `kinetic-lyric-video` skill, not
soma-cut. The first one is The Compassionate Heart
(`~/Projects/compassionate-heart-video/script.fountain`).

## Files

| File | What it is |
|---|---|
| `src/film.js` | The script read the way soma-cut reads it: `parseFilm`, `filmInfo`, `spokenLines`, `filmVoices`, `songTimes`, `estimate`, `checks`, `toSomaCut`, `VOICES`. Shared by the page and the server. |
| `src/video-view.js` | `mountVideoView(container, text)` returns `{ blocks, highlight(blockIndex), update(text), destroy() }`. |
| `src/video-read.js` | `mountVideoRead(container, { text, speak, onActive, mountStageRead })`; the page passes soma-play's player. |
| `server/video-read.js` | `createVideoReader({ apiKey, store, fetch })`: soma-play's `createStageReader` with `readFilm`, its own allowance (`VIDEO_LIMITS`) and keys under `video/`. |
| `bin/vm-export.mjs` | A saved script to `<name>.fountain` + `<name>.cast.json` for soma-cut, from a text file or from the runtime's stored app (`--app-json`). |

## Render a script

```sh
node bin/vm-export.mjs --app-json app.json --title "<title>" out/ --name film
node ~/Projects/soma-cut/tools/render-script.mjs out/film.fountain --out film.mp4
```

`app.json` is the runtime's stored app, Netlify Blobs store
`soma-puppet-runtime`, key `apps/videomaker.json` on the soma-forge site.

## Where it came from

Written 2026-10-22 by Claude Opus 5.5 (CCc) for Mike Wolf, bead sp-go2. Reused
from soma-play (ported from PlayMaker on the same day): the Stage Read player
and server, generalized with `lines`, `label`, `readScript` and `prefix`
options. New here: the Fountain reader, the AV layout, CAST, the voice roster
(PlayMaker's five plus the Song Studio making-of voices), the estimate and the
checks.

```sh
node --test
```
