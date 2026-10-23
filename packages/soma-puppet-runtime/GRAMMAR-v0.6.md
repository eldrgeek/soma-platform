# Puppet Script grammar v0.6 delta

This is the delta from [`GRAMMAR-v0.5.md`](./GRAMMAR-v0.5.md). It adds what
VideoMaker needs to run the whole making of a video from the page: a panel that
asks the team on Mike's Mac to work on a script, and a board of the script's
assets. Everything not changed here keeps its v0.5 meaning.

_Written 2026-10-22 by Claude Opus 5.5 (CCc, bead sp-h3i) for Mike Wolf, who
asked: "I'd like to be able to control the entire generation process from
VideoMaker and have it use cc for inference so that we have access to the
Projects", and "Add to VideoMaker the ability to see the assets: images, cards
and so on and listen to parts of the song."_

- Write the metadata version as `"0.6"`. Each element below is a parse error in
  an earlier version.
- Both elements work on one field of a row, on a screen from data:

  ```puppet
  video-jobs "{row.text}"
  video-assets "{row.text}"
  ```

## 1. `video-jobs`: ask the team

- One button per step (time the song, make the pictures, render the video, send
  the assets) and a box to ask the team anything in words. The steps are
  `JOB_STEPS` in `packages/soma-video/src/jobs.js`.
- Each request becomes a job: `POST /api/app/:app/video/:data/:rowId/jobs`
  `{ step, note }`. Checks in order: signed in; a `video-jobs` of this data on
  a screen the reader can see; the row is one the reader may read; the reader
  is the app's host, because a job runs with Claude Code on the host's Mac; the
  step is one of the steps; an ask has words.
- The worker on the Mac (`~/Projects/_estate/videomaker-worker`) reads open
  jobs, runs each one and reports. The panel shows each job's state, its last
  log lines and the team's report, and asks again every 10 seconds while a job
  is open.

## 2. `video-assets`: the script's assets

- For each scene: its song times and a button that plays that part of the
  song, its cards drawn as 16:9 frames, the pictures made for it with the pieces
  each was cut into, and the lines sung under it. Pictures that name no scene
  come last. A picture is placed by its `start` (seconds into the song), else by
  its `section` (a heading without its times).
- `GET /api/app/:app/video/:data/:rowId/assets` lists them and
  `.../assets/:name` returns one file, for a reader of the row (same checks as
  a job, without the host rule).

## 3. The team's routes

- `GET /api/app/:app/video-team/jobs` (open jobs, each with its script's text),
  `POST .../video-team/jobs/:id` `{ status?, log?, report? }`, and
  `PUT|DELETE .../video-team/assets/:data/:rowId/:name` (the file as the body,
  its type in `content-type`, its details as JSON in `x-asset-meta`).
- They answer only to the SOMA Studio team key (`x-studio-team-key`, the
  site's `STUDIO_TEAM_KEY`), never to a signed-in person. A finished job is not
  changed again. An asset has a plain name, a known type, and at most
  4,500,000 bytes.

## 4. Two runtime changes every app gets

- The address names the open screen and row (`?app=…&screen=…&row=…`), so a
  row screen has a link of its own, and Back and Forward work.
- A list that opens a row screen shows each row's first one-line value as a
  title and its other one-line values under it. A value of several lines (a
  script) waits for the row screen.

New words: `video-jobs`, `video-assets`.
