# Puppet Script grammar v0.7 delta

This is the delta from [`GRAMMAR-v0.6.md`](./GRAMMAR-v0.6.md). It adds VideoMaker's storyboards: a video's
plan as scene cards that the host and the artists the host names can change, and the cuts rendered from
them. Everything not changed here keeps its v0.6 meaning.

_Written 2026-10-23 by Claude Opus 5.5 (CCc) for Mike Wolf, who asked: "turn the Eric Album into a
storyboard that we can change, and this is the way that we do the videos in the future. The Storyboard lets
us add prompts to redo scenes, and a way to add new scenes, and maybe play the music that goes with each
image", and "Yes, inside videomaker. Yes Eric or another Artist can change"._

- Write the metadata version as `"0.7"`. `video-storyboards` is a parse error in an earlier version.
- It takes no text and goes on a screen that is not from data, because a storyboard is not a row:

  ```puppet
  screen "Storyboards" {
    video-storyboards
  }
  ```

## 1. `video-storyboards`: the storyboards the reader may open

- A list of the storyboards the reader may open, and the open one (`&board=<id>` in the address, so a board
  has a link of its own to send an artist). The component is `mountStoryboards` in
  `packages/soma-video/src/video-storyboard.js`; the model is `packages/soma-video/src/storyboard.js`.
- Each scene card: its picture (one 9:16 / 16:9 switch for the board), the lyric line and its time range
  with a button that plays that stretch of the song, the status keep / redo / new, a redo note with
  "Redo this scene", the prompt and reference photos, "Add scene after", ↑ ↓ and drag to reorder,
  "Remove", and the earlier pictures with "Use this one".
- The cuts: each a named list of scenes (or every scene, in board order) plus the stretches of the song it
  uses, with "up to date", "needs a new render: e03, e07 changed" or "not rendered yet", and Render.

## 2. Who may do what

| Who | How the site knows | May |
|---|---|---|
| The board's owner, and the app's host | signed-in id | everything, including the artists list and deleting the board |
| An artist | the email they sign in with is on the board's artists list | see the board, its pictures and song; change cards and cuts; ask for redos, new scenes and renders |
| Anyone else | | nothing; a board answers as if it did not exist |
| The team on the Mac | the SOMA Studio team key | seed a board, send its files, report new pictures, renders and the song |

- Only the host starts a board (from the page, or the team seeds one, owned by the host).
- A job asked by anyone but the host starts **held**: it would run with Claude Code's full reach on the
  host's Mac, so the host lets it run or declines it on the board. The worker never sees a held job, and
  the team routes refuse to update one.
- People's changes and the team's are ops (`applyOps`), checked by the same code in the page, the server and
  the seed. Only the owner sets the artists; only the team sends pictures, renders and the song.

## 3. Routes

People (signed in; a `video-storyboards` on a screen the reader can see; then the reader's role):

- `GET /api/app/:app/video-boards` the boards the reader may open; `POST` `{ title, project }` (host) starts one.
- `GET|PATCH|DELETE .../video-boards/:id`; PATCH takes `{ ops: [...] }` and returns the board with `added`
  (new scene ids).
- `GET .../video-boards/:id/files/:name` a picture, the song or a render.
- `GET|POST .../video-boards/:id/jobs` `{ step: redo|add|render, scene? | cut?, note? }`;
  `POST .../jobs/:jobId` `{ release: true|false }` (host).

The team (`x-studio-team-key`):

- `GET .../video-team/jobs?boards=1` also returns storyboard jobs, each with its `board` and the `brief`
  the worker hands Claude Code. Without `?boards=1` (a worker from before v0.7) they are left queued.
- `PUT .../video-team/boards/:id` a whole board (the seed; its owner is always the host), `GET` it,
  `POST` `{ ops }` (pictures, rendered, song), and `PUT .../video-team/boards/:id/files/:name` a file
  (same names, types and 4,500,000-byte limit as an asset).

Storage: the `soma-video-studio` Blobs store, `boards/<app>/<id>.json` and `boardfiles/<app>/<id>/<name>`.

New word: `video-storyboards`.
