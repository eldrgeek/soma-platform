# Brain Trust review of Puppet Script v0.10

_Run 2026-10-24 by Claude Opus 5.5 (CCc, bead sp-l0w) for Mike Wolf, before
the runtime and the two components were built. Reviewers: OpenAI Sol
(`codex exec -m gpt-5.6-sol`), Google Gemini (`agy`, "Gemini 4 Argon
(High)") and xAI Grok (`grok -m grok-4.7`), each on the first try. The
prompt and full answers are in [`review-v0.10/`](./review-v0.10/)._

## What they were asked

The draft delta, with v0.5 (the script editor, for the pen rule), and the
facts about the PlayMaker code being reused: Doc import runs in the browser
with the writer's own Google token (Google sign-in, `drive.file`, the
Picker, no server), and the PDF is pdf-lib in the browser. Three questions:
the smallest closed design; where a Builder would misread it; and the holes,
given that the client sends the converted scenes.

## What they changed

| # | Draft | Change | Who raised it |
|---|---|---|---|
| 1 | "The Doc holds the pen", as if the server enforced where the words came from | Said plainly: the server stores the scenes the page converted, never calls Google, and cannot confirm the words came from the Doc. The pen is a rule about the writer's own rows. | All three (Sol first) |
| 2 | Replace "the rows from that Doc" | One Doc per writer per data: each pull replaces every Doc row of that writer in that data, in one write, keyed by the server-set author and a server-set flag, never by the Doc id. This closes the overwrite of another writer who names the same Doc id, and storage stuffing by minting Doc ids. | All three |
| 3 | `read: private` "advised" for a writers' app | Required: `doc-import into` data must say `read: private`, and its fields must be exactly `[title, text]` or `[title, text, act]` (parse errors). | Gemini, Grok (Sol: state it prominently) |
| 4 | 300 scenes of 40,000 characters (12 million per pull) | Also 500,000 characters in all, the Doc id 10 to 128 of `[A-Za-z0-9_-]` (a shape check only), the name 300, `act` 100; the body's keys exactly, an empty pull refused. | All three |
| 5 | The pen on `script-editor` saves only | Every change in the app: a Doc row is never edited or removed, by anyone, its writer included. Someone else still gets the answer for a missing row. | Sol, Grok |
| 6 | `GET /doc-import/:data` with no checks listed | Signed in, a `doc-import` the reader can see, and only the reader's own record. | Gemini, Grok |
| 7 | Pulls again when the writer comes back to the page | Dropped; "Pull again" only. | Grok (Gemini: unclear) |
| 8 | `play-print` with any text, and `title:` | `title:` dropped (Sol, Gemini). The one-scene form kept (Gemini, Grok) but as exactly one `{row.field}` (Grok); Sol would drop it. | Split; majority kept it |
| 9 | "in the order the list shows them" | The order the rows were stored; a Doc's scenes keep the Doc's order; it prints only rows the page was given under the read rule. | All three |
| 10 | "Versions compare by their parts" | Two whole numbers, compared number by number; anything else is held to every rule. The parser and the catalog both compared versions as decimals, so "0.10" would have read as 0.1 and dropped every v0.4 to v0.9 check; both are fixed and tested. | All three |
| 11 | The cast "dropped" with the title page | Said that PlayMaker's PDF writer lists the characters who speak, so the PDF has a cast without the Doc's front matter. | Gemini, Grok |
| 12 | Nothing said about writing back | "The app never writes to the Doc." | Grok |

## Raised and answered without a change

- **Send the Google token to the server so it can check the Doc** (Sol, as an
  option). Not done: it would move PlayMaker's browser-only design to the
  server and put a writer's Google token on it. Grok argued the same way.
- **Keep the Doc's front matter on the pull record** (Grok). Not needed: the
  PDF's cast comes from the speeches, and the title page uses the app's title.
- **Refuse `play-print from` in `publicRead` apps** (Sol). Not done: it prints
  only what the reader may read under the data's rule, and Doc data is always
  `read: private`.

## One step only Mike can take

Google lists the exact web addresses allowed to use PlayMaker's Google client.
Probed on 2026-10-24 (the authorize endpoint, as PlayMaker's
`docs/GOOGLE-DOCS-SETUP.md` describes): `playmaker-mw.netlify.app` goes to
Google sign-in; `soma-forge.netlify.app` gets `redirect_uri_mismatch`. Until
`https://soma-forge.netlify.app` is added to the Playmaker Web client's
Authorized JavaScript origins (Google Cloud project `testingthecloud-152005`),
"Bring in from Google Doc" on soma-forge shows Google's refusal in plain words.
PlayMaker's public API key is not limited by web address (probed the same day).
