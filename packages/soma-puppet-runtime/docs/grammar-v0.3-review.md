# Brain Trust review of Puppet Script v0.3

_Run 2026-10-21 by Claude Opus 5.5 (CCc, bead sp-50d) for Mike Wolf, before
any v0.3 code was written. Reviewers: OpenAI Sol (`codex exec -m
gpt-5.6-sol`, answered on the first try, no rate limit this time), Google
Gemini (`agy`, model "Gemini 4 Argon (High)"), and xAI Grok (`grok -m
grok-4.7`). Grok's first run asked for the v0.1 grammar and then hung, so it
was stopped after 15 minutes and asked again with v0.1 included and an
instruction to answer from the text._

The prompt each reviewer received, and their full answers, are in
[`review-v0.3/`](./review-v0.3/): `prompt.md` (Sol and Gemini),
`prompt-grok.md` (the same plus v0.1), `sol.txt`, `gemini.txt`, `grok.txt`,
and `grok-attempt1.txt`.

## What they were asked

The draft delta (the first version of `GRAMMAR-v0.3.md`), v0.2, the two
Sunday Supper examples and a draft v0.3 example went to each reviewer with
three questions: is this the smallest closed design for the four needs; where
will a builder or reader misread it; and how could someone who is not the host
read host-only data, read another person's rows, or set a status.

## The design changes they caused

| # | Draft | Change | Who raised it |
|---|---|---|---|
| 1 | `read: host` and `read: own` | Only `read: own`. Rows that only the host adds are already private under it, so `read: host` covered no need. | Sol, Gemini (Grok would keep it to hide rows a guest wrote earlier; outvoted, because a guest reading back their own row is not a leak) |
| 2 | `requires: host` on screens, dialogs and elements | Screens and dialogs only. Every round-1 host action fits on a host-only screen, and element-level hiding added inheritance and stripping rules. | All three |
| 3 | `sets status "pending"` allowed | Only `"confirmed"` and `"declined"`. New rows already start pending. | All three |
| 4 | A `button` or `link` inside a list acts per row | `button` only. | Sol, Gemini |
| 5 | Privacy follows the live version | Privacy only tightens: once an approved version says `read: own`, undo, redo or a later version cannot make those rows public. This was the largest hole all three found. | All three |
| 6 | Undeclared data: refused (already in draft) | Kept, and tested. | All three |
| 7 | Empty `@date` accepted | An empty value is refused when the field is `@required`; the server now checks `@required` on every field kind. | All three |
| 8 | `{form.Label}` bound by label anywhere | Bound to the field with that label on the same screen or dialog as the button; a shared label with a `@date` field is a parse error. | Sol, Gemini |
| 9 | Only host-only screens and their stubs stripped | Guests also lose comments, stories that start on a host-only screen, and every `data` or `stub` block nothing they receive names. | Gemini (comments, blocks), Grok (stories) |
| 10 | A host-only screen may open any dialog | It may not open a dialog everyone receives (parse error). | Gemini |
| 11 | Guest `DELETE` is "author or host", as in v0.2 | A guest also needs a `removes from` action they can see, and may remove only a `pending` row. | Gemini |
| 12 | Sequential row ids | `read: own` rows get unguessable ids, and someone else's private row answers exactly like a missing one (404). | Sol, Gemini |
| 13 | Ownership not stated | The grammar says the author is the stored account id, never a field such as `who`. | All three |
| 14 | Host reads all rows (implicit) | Stated plainly, with the PlayMaker consequence: the host reads every writer's private rows. | Grok |
| 15 | `removes from Name` in a row button, any `Name` | `Name` must be the data the list reads (parse error otherwise). | Sol, Gemini, Grok |
| 16 | Date display unspecified | Any `YYYY-MM-DD` value is shown with its weekday in the reader's language, worked out in UTC. | Sol, Gemini, Grok |
| 17 | `publicRead` unspecified | A `publicRead` app still strips host-only parts for an anonymous reader, still identifies a reader who sends a token, and needs sign-in for `read: own` rows. | All three |

## Raised and answered without a change

- **Caching two documents at one address** (Sol, Grok). `/current` already
  sends `cache-control: no-store`; a test now checks it.
- **A client sending `status` itself** (Grok). The server matches a row against
  an `adds to` field for field, and an `adds to` may not name `status`, so such
  a body is refused; the stores then set `pending` regardless. Tested.
- **Data block names visible to guests** (Gemini). Blocks nothing public names
  are now removed; a block a public screen names (for example the inbox guests
  write to) stays, because its field names are needed to send a row.
- **Navbar items naming a host-only screen** (Grok). Not stripped: that text
  sits in a screen everyone sees, and the grammar now says so.
- **Making `read: own` mandatory for approval data** (Sol). Not done; it would
  tie two words together. A public approval list is allowed.

## What was built

All of the above is in `src/parser.js` (rules and the guest description),
`src/render.js` (host-only tabs, row buttons, date pickers), `src/store.js` and
`src/blobs-store.js` (author filter, pending status, `setStatus`, one-way
privacy, unguessable ids), and `site/functions/api.mjs` (the server checks).
`test/v03.test.js` and `test/render-v03.test.js` cover each capability, and
`scripts/mutation-check.mjs` loosens each server check on purpose and requires
a failing test for every one.
