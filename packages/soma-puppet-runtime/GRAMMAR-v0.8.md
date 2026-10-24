# Puppet Script grammar v0.8 delta

This is the delta from [`GRAMMAR-v0.7.md`](./GRAMMAR-v0.7.md). It adds run lines: an actor learning a scene
picks their part, the other parts are read aloud, and the reading stops on each of the actor's own lines.
Everything not changed here keeps its v0.7 meaning.

_Written 2026-10-24 by Claude Opus 5.5 for Mike Wolf, from the component scouts' top theatre idea, after
Mike asked for scouts "to imagine other components we should build and separately and build them"._

- Write the metadata version as `"0.8"`. `line-run` is a parse error in an earlier version.
- It runs one field of a row, on a screen from data, like `stage-read`:

  ```puppet
  screen "Piece" from pieces {
    play-view "{row.text}"
    line-run "{row.text}" hint: initials
  }
  ```

## `line-run`: run lines

- Its text is exactly one `{row.field}` on a screen from data; anything else is a parse error.
- `hint:` is optional: `none` (the default) hides the actor's line entirely, `initials` shows the first
  letter of each word (`T t i a g.`). Any other value is a parse error.
- It draws a choice of part (the characters who speak, in the order they first speak), Run lines, and a
  status line. Each other character's line is read aloud in its Stage Read voice. On each of the chosen
  part's lines the run stops and shows "Your line, NAME", the hint, Show line and Next. Stop ends the run.
- When a `play-view` of the same `{row.field}` is on the screen, the line being run is highlighted there.
- The component is `mountLineRun` in `packages/soma-play/src/line-run.js`. An app pinned to a soma-play
  build from before v0.8 still loads; its `line-run` says it needs a newer build.

## Server

- No new route. A `line-run` of a field offers `POST /api/app/:appId/stage-read` for that field, with Stage
  Read's checks in the same order (signed in; a `stage-read` or `line-run` of this field on a screen the
  reader can see; the reader may read the row; the line exists) and the same allowance.
- A `line-run` never offers `POST .../video-read`.
- The page asks only for the other parts' lines. The actor's own lines are never fetched, though the reader
  may read them anyway: they are the row's own text.

New word: `line-run`.
