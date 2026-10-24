# Puppet Script grammar v0.9 delta

This is the delta from [`GRAMMAR-v0.8.md`](./GRAMMAR-v0.8.md). It adds the evidence ledger: every claim a
video script makes, next to its source, so a making-of film can be checked before it is rendered.
Everything not changed here keeps its v0.8 meaning.

_Written 2026-10-24 by Claude Opus 5.5 for Mike Wolf, from the component scouts' top Making-of idea: the
nightly drafts each carry a hand-written EVIDENCE.md, and this puts the same table in VideoMaker._

- Write the metadata version as `"0.9"`. `video-evidence` is a parse error in an earlier version.
- It takes its text like `video-view`, usually `{row.text}` on a screen from data:

  ```puppet
  video-evidence "{row.text}"
  ```

## `video-evidence`: claims and their sources

- Every narrator line and every `CARD` in the script is a claim.
- A source is a Fountain note in its own paragraph after the line or card it backs:

  ```
  NARRATOR
  Mike had a shared album: seventy-five photos.

  [[src: eric-album/originals/INDEX.md]]
  ```

  Several `[[src: ...]]` notes may follow one claim, and a clip or other picture between them does not
  break the link. A scene heading does. `[[not a claim]]` marks a line that needs no source (a feeling, a
  question, the hook). Other notes are left alone.
- It draws a summary ("12 claims: 9 sourced, 1 not a claim, 2 with no source"), then a table of scene,
  who, claim and source, with the claims that have no source marked.
- It reports two mistakes: a source note that follows no line or card, and a note inside a speech, which a
  reading would speak aloud.
- It follows the editor's unsaved text, as `video-view` does.
- No server route and no data of its own: it reads the text the page already has. The component is
  `mountVideoEvidence` in `packages/soma-video/src/evidence.js`, which also exports `evidence(text)` and
  `toMarkdown(text, title)` (the EVIDENCE.md table). An app pinned to a soma-video build from before v0.9
  still loads; its ledger says it needs a newer build.

New word: `video-evidence`.
