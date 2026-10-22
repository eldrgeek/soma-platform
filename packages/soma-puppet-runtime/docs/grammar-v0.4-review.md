# Brain Trust review of Puppet Script v0.4

_Run 2026-10-22 by Claude Opus 5.5 (CCc, bead sp-u4x) for Mike Wolf, before
the v0.4 runtime was built (the `soma-play` parser and player were drafted in
parallel and changed after the review). Reviewers: OpenAI Sol (`codex exec -m
gpt-5.6-sol`; HTTP 429 four times, answered on the fifth try after a 300 s
back-off), Google Gemini (`agy`, "Gemini 4 Argon (High)"), and xAI Grok
(`grok -m grok-4.7`), each on the first try for the last two._

The prompt and the full answers are in [`review-v0.4/`](./review-v0.4/):
`prompt.md`, `sol.txt`, `gemini.txt`, `grok.txt`.

## What they were asked

The draft delta, with v0.3 for reference, and three questions: is this the
smallest closed design for round 2's needs; where will a builder or reader
misread it; and how could someone read another writer's private rows (the host
included), get a row screen to show a row they may not read, make Stage Read
speak text they could not read, or burn the shared voice budget.

## The design changes they caused

| # | Draft | Change | Who raised it |
|---|---|---|---|
| 1 | `tab: none` for screens without a tab | Dropped. A row screen (`screen ... from Data`) never has a tab; anything else opened by a button is a `dialog`, which v0.1 already defined and the runtime now draws. | Gemini, Grok (Sol would keep it for ordinary destinations) |
| 2 | Unfillable token in an `adds to`: a warning | A parse error, in text and in `adds to` alike. | Sol, Grok |
| 3 | The token check from version 0.2 | From version 0.4; 0.2 and 0.3 get warnings, so descriptions already live keep working. | Gemini, Grok |
| 4 | A host-only screen may open a public dialog only | A host-only screen may not open a row screen everyone receives either (it would ship that screen and its data to guests). | Gemini, Grok |
| 5 | Stage Read checks the live version has a stage-read of that field | It also checks the screen is one the reader can see, then the row is one they may read (a row they may not read answers exactly like a missing one), then the line, then the allowance, in that order; and it needs sign-in even for public rows. | All three |
| 6 | Read-then-write spend counters | Characters are reserved atomically (etag writes, retried) before the voice service is called, and given back if the call fails; a lines-per-person limit counts cached replays too; a per-line limit. | All three |
| 7 | A global audio cache ("costs nothing") | The cache is per person, so a cache hit cannot reveal what another writer's scene says. | Gemini, Sol, Grok |
| 8 | Stage Read's text: "a `{row.field}`" | Exactly one `{row.field}` on a row screen, nothing else; a parse error otherwise. | Grok |
| 9 | Script reading rules listed loosely | One numbered reading order (blank line, heading, technical cue, cue, `NAME:` line, parenthetical, direction), shared by the page and the server, and spoken lines numbered from 0. | Gemini, Sol, Grok |
| 10 | `stage-read` beside `play-view` (unclear link) | Kept as two kinds (Sol: different authorization, cost and failure); `stage-read` draws only its button, and highlights the `play-view` of the same `{row.field}` on the screen. | Gemini asked; Sol decided |
| 11 | Private delete "only the author" | Only the author, through a `removes from` they can see, the host included. | Gemini, Grok |
| 12 | Privacy latch "as in v0.3" | The strictest rule ever approved for each collection name is kept through undo, redo, removing the block and declaring the name again; a renamed collection starts empty. | Sol, Grok |
| 13 | `{row.field}` "inside a screen from data" | Not in a dialog (a dialog is not inside the screen that opens it), not in an `adds to`. | Grok |
| 14 | First screen, Back, reload unclear | A row screen may not be first; Back returns to the screen the row was chosen on; after a reload the app opens on its first screen; a vanished row sends the screen back. | Sol, Grok |
| 15 | `{me.name}` for an anonymous reader | Empty. | Sol |
| 16 | Stored words containing `{...}` | Never filled: interpolation is one pass. | Gemini, Grok |

## Raised and answered without a change

- **Merging `read: private` into `read: own`** (Sol, as an option). Not done:
  live approval apps need the host to read `read: own` rows (Grok and Gemini
  agreed).
- **Unguessable ids for every row** (Gemini). Rows of `read: own` and
  `read: private` data already get unguessable ids, and every probe of a row
  the caller may not read answers exactly like a missing row, so a guessable
  id of a public row reveals nothing new.
- **Using the real ElevenLabs remainder as the balance** (Grok). Not done: the
  daily limits (3,000 characters per person, 8,000 per app, 600 per line,
  400 lines per person) are sized to the shared Creator plan's remainder
  (about 50,000 characters until 2026-10-25), and the cache keeps replays free.
- **`play-view` as a format of `text`** (Grok). Kept as its own kind, so a
  component can be added or replaced without changing what `text` means.

## What the mutation check found afterwards

The first run of the mutation check (62 mutants) caught 59. The survivors
taught three things: the refund on a failed voice call was untested (the
test's limit had slack), so the test was tightened; one guest-description rule
was redundant (the list that opens a row screen already names its data), so it
was removed; and Stage Read's own sign-in line repeats the rule that every
POST verifies the caller first, so a test now proves an anonymous Stage Read
of public rows gets 401, and that mutant was dropped. The second run caught
all 61.
