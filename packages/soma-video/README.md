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
| `src/video-editor.js` | `mountVideoEditor(container, { board, api, host, objectUrl, onBoard, onClose })`: the v4 editor (script, preview, inspector, timeline with waveform); `layoutScenes`, `frameAt`, `captionAt`, `motionAt`, `songPeaks`. |
| `src/board-script.js` | A storyboard as the v4 editor's script and back: `boardToScript`, `readScript`, `scriptToOps`, `opBatches`, `timeText`. |
| `src/notes.js` | An artist's notes as written (email, text, the notes box) read against a board: `parseNotes`, `notesOps`, `notesToRedo`, `redoQueue`. |
| `bin/vm-board-notes.mjs` | Notes that arrived by email or text, on the Mac: shows where each lands; `--send` puts them on the cards and asks for one held batch. |
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

### Notes and fast rerolls (2026-10-23)

Mike asked for "notes from eric and reroll fast". Four ways in, one way out: every note becomes a redo
note on its card, and the redos go to the Mac as **one batch job** (one Claude Code run, one generator
session) instead of one job per card.

- **On a card**: "Reroll" asks for another take of the same prompt in one click; no note needed.
- **The board's "Notes and redos" panel**: paste an email or a text as it came. `parseNotes` finds the card
  each line is about (by id `e05:`, by number `scene 5` / `#5` / `In 5 ...`, or by quoting its lyric), shows
  where each note will land before anything is sent, and treats a note that only says keep ("perfect,
  keep") as keep, not redo. Quoted replies and signatures are dropped. The panel also redoes every card
  marked redo in one batch, lets every held request run (host only), and asks for every out-of-date cut.
- **From the Mac** (notes that came by email or text): `pbpaste | node bin/vm-board-notes.mjs --board <id>
  --by "Eric (email)" -` shows the mapping; add `--send` to apply it.
- **The routes**: `POST video-boards/<id>/notes` `{ text }` (owner, host or artist) and
  `POST video-team/boards/<id>/notes` `{ text, by }` (team key).

The gate is unchanged: a batch asked for by anyone but the host, and **every** batch sent with the team
key, is held until the host presses "Let it run", because it runs with Claude Code's full reach on the Mac.

### The editor (v4, 2026-10-23)

"Script and timeline" on an open storyboard opens it in the editor (`src/video-editor.js`), across the full width
of the screen, with a Full screen button. "← Cards" goes back. Nothing about the board, its routes, its jobs or
the "Let it run" gate changed, and there is no new Puppet word: it is a second view inside `video-storyboards`.

- **Script** (left): the board as Fountain (below). It saves itself a moment after typing stops; a problem names
  its line and nothing saves until it is fixed; gaps and overlaps are named but saved. The playing scene's lines
  are lit, and clicking a line moves the playhead there (a lyric line to its own moment).
- **Preview** (middle): an animatic drawn in the browser (each scene's picture with its motion, the transition
  into it, its lyric as a caption, over the song). **Last render** plays the cut's real video.
- **Scene** (right): motion, transition, prompt, redo note; Redo with note, Reroll, Keep, Add scene after (takes
  the second half of the scene's time); earlier pictures.
- **Timeline** (bottom): pictures with a transition chip on each seam, captions, motion, the song's waveform
  (decoded in the browser from the board's song), notes, and the whole song as a strip above. Click a chip or a
  motion to change it, drag a seam to retime two scenes, drag the ruler or the waveform to scrub. Space plays.
- The timeline is the board in song order. The cut chosen at the top sets the picture's shape, what Render
  renders and which scenes are lit; a short's own shot order and lengths are still set on the cards.

#### The editor's script

Mike asked for a v4 "modeled after Descript or some other editing platform", with "the script is editable text".
The design and a working mockup: https://claude.ai/artifact/KfXhTG7i5WM5izRT1aCRgh. The first piece is the model:
a board written as Fountain that a person types in, read back as the same ops the cards send
(`src/board-script.js`), so the script is a view of the board, never a second copy.

```
Title: Example Song

.INTRO 0:00-0:18.12
SHOT e01 motion: in
~Morning comes in sideways
[[redo: warmer light]]

DISSOLVE TO:

.VERSE 1 0:18.12-0:24
SHOT e02
~Every cup still on the table
```

- A heading is a scene and its stretch of the song; `SHOT <id>` names its card. A heading with no SHOT line (or a
  pasted copy of one) is a new scene; a deleted heading removes the scene.
- Scenes gain two fields that change what a render shows, so either makes the cut out of date:
  **`motion`** (`in out panl panr up down`, the music-video renderer's words) and **`transition`**, how the scene
  comes in (`cut dissolve fade wipe push`, soma-cut's vocabulary, written as `DISSOLVE TO:`, `FADE TO BLACK.` ...).
  Blank means the renderer's choice. A render brief lists the ones set and asks the renderer to name any it cannot do.
- `[[redo: ...]]` is a redo note and marks the scene redo; deleting it puts the scene back to keep. Other lines under
  a heading (a CARD, a narrator) are kept on the scene as `extra`.
- A script with a problem (half-typed times, an unknown motion, words before the first heading) sends nothing, so
  a heading caught mid-edit never deletes a scene.

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
