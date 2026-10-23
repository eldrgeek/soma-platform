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

- **`video-jobs`** (v0.6): the "Make it" panel. Each button or request in words becomes a job that the
  VideoMaker worker on Mike's Mac runs with Claude Code (`~/Projects/_estate/videomaker-worker`).
- **`video-assets`** (v0.6): the script's assets, scene by scene: a button that plays that part of the
  song, the cards drawn as frames, the pictures with the pieces they were cut into, and the sung lines.

- **`video-storyboards`** (v0.7): a video's storyboard, the plan its pictures and cuts are made from, as
  scene cards anyone the owner shares it with can change: redo a scene with a note, add a scene after
  another, drag to reorder, play each scene's stretch of the song, and render the cuts (full song, 60 s
  cut, shorts), which say when a change means they need rendering again. See
  `packages/soma-puppet-runtime/GRAMMAR-v0.7.md` and "Storyboards" below.

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
| `src/jobs.js` | `JOB_STEPS`: what the team can be asked to do. Shared by the page and the server. |
| `src/video-jobs.js` | `mountVideoJobs(container, { listJobs, createJob, onDone })`. |
| `src/video-assets.js` | `mountVideoAssets(container, { text, listAssets, fetchAsset, cacheKey })`, `boardScenes`, `placePictures`. |
| `server/studio.js` | `createVideoStudio({ blobs })`: assets and jobs in Netlify Blobs (`soma-video-studio`). |
| `src/storyboard.js` | The storyboard model: `cleanBoard`, `applyOps`, `roleOf`, `cutState`, `jobBrief`, `parseRanges`. Shared by the page, the server and the seed. |
| `src/video-storyboard.js` | `mountStoryboards(container, { api, host, initial, onOpen })`. |
| `server/boards.js` | `createBoardStore({ blobs })`: boards and their files in Netlify Blobs (`soma-video-studio`), changes retried on the etag. |
| `bin/vm-board-seed.mjs` | A storyboard from a song project's album, timings, cuts and renders; `--upload` sends it with the team key. |
| `bin/vm-export.mjs` | A saved script to `<name>.fountain` + `<name>.cast.json` for soma-cut, from a text file or from the runtime's stored app (`--app-json`). |

## Storyboards

A storyboard is how a video is made from now on (Mike, 2026-10-23): one per song or video, seeded from the
project's image album, changed on the page by Mike and the artists he names, and rendered by the team on
his Mac. The model (`src/storyboard.js`) is one JSON document of scenes and cuts; every change is an op
that the page, the server and the seed check with the same code. A scene's old pictures stay in its
history. A cut is stale when, after its last render started, one of its scenes got new pictures, lyric
or times, its own list changed, or (for the full song) the board's order changed.

Seed one from a project on the Mac (writes `storyboard.json`; sends nothing without `--upload`):

```sh
node bin/vm-board-seed.mjs ~/Projects/witness-and-stay-song --id witness-and-stay-eric \
  --title "Witness and Stay (Eric)" --artist <eric's sign-in email>
node bin/vm-board-seed.mjs ~/Projects/witness-and-stay-song --id witness-and-stay-eric \
  --title "Witness and Stay (Eric)" --artist <eric's sign-in email> --upload
```

It reads `eric-album/album.json` (scenes, prompts, reference photos, the 9:16 and 16:9 pictures),
`build/kinetic/timings.json` (each scene starts at its lyric line and runs to the next scene),
`build/kinetic/beats.json` (the song's length), `build/<name>/kinetic.json` (the full-song cut) and
`eric-shorts/*.json` (one 9:16 cut each, its renderer settings kept as the cut's `spec`). A cut whose
render in `out/` is newer than its pictures starts up to date.

Redo, add and render are jobs for the VideoMaker worker (`_estate/videomaker-worker` in projects-meta),
which writes the board to `storyboard.json` in the project, runs Claude Code on the brief from
`jobBrief()`, and sends back what Claude names in `storyboard-out/<jobId>.json`.

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
