You are on the Brain Trust reviewing a grammar change BEFORE it is built. Reply in plain text, under 900 words. Do not use any tools and do not ask for more files: everything you need is below.

## Context
Puppet Script is a deliberately CLOSED description language. An AI builder writes a Puppet description; a shared runtime (a plain-JS browser renderer plus one Netlify Function API over Netlify Blobs) runs it live as a multi-user app. A word is added only when a real app needs it. Each app has one HOST (an account id in config). Everyone signs in with Supabase; the API verifies the bearer token.
v0.3 (live, reviewed by you last round) added: `requires: host` screens (the server sends non-hosts the description WITHOUT host-only screens, comments, stories and unused data/stub blocks), `read: own` (each person reads rows they added, the host reads all; privacy only tightens across undo/redo), `@date` with `days:`, a `status` field set by the host via `sets status` buttons inside lists on host-only screens, server-checked `@required`, unguessable ids for private rows, and a guest's row must match an action they can see.
GCT round 2 (a simulated playwright, Eric, and Mike rebuilding PlayMaker in the studio) found: every screen is a tab so a scene list plus one screen per scene is two ways in and "busy"; there is no detail screen bound to a row, so the builder hand-wrote one screen per scene; literal "{play}" and "{last_synced}" reached the screen (they were `state` placeholders the renderer never fills); v0.3's host reads every `read: own` row, which breaks Mike's rule for PlayMaker ("each writer's plays are private; nobody else reads them unless shared"); and the round asked for two PlayMaker parts as library components: a read-only play view in Diana's script format, and Stage Read (each character read aloud in its own voice). The shared TTS budget is small (one ElevenLabs Creator plan, about 50,000 characters left this month, shared with PlayMaker).

## Your task
Review the proposed v0.4 delta below (v0.3 is included for reference). Answer three things:
1. SMALLEST DESIGN: is this the smallest closed-language design for these needs? Name any word that could be dropped or merged, or a smaller alternative, and why. Do not add capabilities beyond these (no sharing/roles, no named actions, no notifications).
2. AMBIGUITIES: where would an AI builder or a reader misread this, or two readings are possible? Quote the line.
3. SECURITY AND ABUSE HOLES: how could someone read another writer's private rows (the host included), get a row-bound screen to show a row they may not read, make Stage Read speak text they could not read, or burn the TTS budget? Think about the client being fully attacker-controlled, undo/redo, counts, ids, the token check, caches, and publicRead apps.
End with a ranked list of the changes you would make (most important first), each one line.


=== GRAMMAR v0.3 (current, live) ===
# Puppet Script grammar v0.3 delta

This is the delta from [`GRAMMAR-v0.2.md`](./GRAMMAR-v0.2.md). It adds four
things so an app can serve one person privately: host-only screens, rows each
person reads only for themselves, dates, and approve or decline. Everything
not changed here keeps its v0.2 meaning, including the closed sets of element
kinds and roles. The words it adds are listed at the end, and nothing else is
added.

_Written 2026-10-21 by Claude Opus 5.5 (CCc, bead sp-50d) at Mike Wolf's
request, from the component gaps of GCT round 1. OpenAI Sol, Google Gemini and
xAI Grok reviewed the draft before it was built; their answers and what
changed because of them are in `docs/grammar-v0.3-review.md`._

- The metadata version may be `"0.3"`.
- The **host** is the account named by `hostId` in the runtime's app
  configuration. That setting alone decides who the host is.
- **Inside** means nested inside, by indentation or braces in the
  description. Nothing is inside a screen or dialog because a button opens it.

## 1. Host-only screens: `requires: host`

`requires: host` may appear in a `screen` or `dialog` block.

```puppet
screen "My week" {
  requires: host
  table "Requests" from requests
}
```

- Only the host sees a host-only screen or dialog, and everything inside it.
- The server enforces this. Anyone else receives the description without
  host-only screens and dialogs, without any `story` whose entry is a
  host-only screen, without comments, and without any `data` or `stub` block
  that nothing they receive names. A person who is not the host never
  receives that text. Text that a screen everyone sees contains, such as a
  navbar item, still reaches everyone.
- An action inside a host-only screen or dialog counts only for the host. The
  server accepts a row from anyone else only when it matches an action they
  can see. If a screen everyone sees has an action of the same shape, the
  row is accepted from everyone.
- Something everyone sees may not open a host-only screen or dialog, and a
  host-only screen may not open a dialog that everyone receives. Both are
  parse errors.
- `requires: host` does not go on `app` or on an element. Both are parse
  errors.

## 2. Rows each person reads for themselves: `read: own`

A `data` block may say `read: own`.

```puppet
data requests {
  fields: [who, day, status]
  read: own
}
```

- A signed-in person reads only the rows they added. The host reads every
  row. The author of a row is the account that added it, which the server
  stores apart from the row's fields; a field such as `who` is only text.
- Rows that only the host adds, for example on a host-only screen, are
  therefore private to the host.
- The host reads every row of `read: own` data, including rows other people
  added. Choose the host with that in mind: in an app for writers, the host
  can read every writer's private rows.
- Without `read:`, everyone who can open the app reads every row, as in v0.2.
- Data that is read only inside host-only screens or dialogs must say
  `read: own`. Otherwise it is a parse error, because the server would hand
  its rows to anyone who asked.
- Privacy only tightens. Once an approved version says `read: own` for a
  collection, the server keeps it private, even after undo or redo to a
  version that does not say it.
- `{Name.count}` counts the rows the reader can read.
- The server returns no rows of a collection that the live version does not
  declare, and a person must sign in to read `read: own` rows even when the
  app's rows are otherwise public.

## 3. Dates: `@date`

```puppet
field "Day you'll miss" @date
field "Which Saturday?" @date @required days: [Sat]
```

- A `@date` field is a date picker. Its value is an ISO date, `YYYY-MM-DD`,
  for example `2026-10-24`.
- `days:` limits the field to some days of the week. Its values come from
  `Mon Tue Wed Thu Fri Sat Sun`, either one day (`days: Sat`) or a list
  (`days: [Sat, Sun]`; quoted names such as `["Sat"]` also work). It goes
  only on a `@date` field.
- A `{form.Label}` token names the field with that label on the same screen
  or dialog as its button. If several fields there share a label and one of
  them is `@date`, that is a parse error.
- The server refuses a row when a value from a `@date` field is not a real
  calendar date in that form, or falls on a day that `days:` leaves out.
- From v0.3 the server also refuses an empty value from a `@required` field,
  of any kind. An empty value from a field that is not `@required` is
  accepted.
- Lists and tables show any stored value in `YYYY-MM-DD` form as a date with
  its weekday, in the reader's language, for example `Sat, 24 Oct 2026`. The
  weekday is worked out in UTC, so it never shifts with the reader's time
  zone.

### Choice lists (a v0.1 word, now drawn and checked)

`field "Time" @select items: ["9:00", "9:30"]` is drawn as a choice list
with those items. The server refuses a value that is not one of the items,
and an empty value when the field is `@required`. A `@select` field without
`items:` is still a text box.

## 4. Approve or decline: `status` and `sets status`

`data` (not `stub`) that declares a field named `status` holds requests that
the host approves or declines.

```puppet
data requests {
  fields: [who, day, status]
  read: own
}

screen "My week" {
  requires: host
  table "Requests" from requests {
    button "Confirm" -> sets status "confirmed"
    button "Decline" -> sets status "declined"
  }
}
```

- A new row's `status` is always `pending`. The server sets it. An `adds to`
  may not name `status`; that is a parse error. A row stored before its
  collection had a `status` field reads as `pending`.
- `sets status "confirmed"` and `sets status "declined"` change the status of
  one row. No other value is allowed.
- A `button` inside a `list` or `table` block is drawn on every row and acts
  on that row. `sets status` goes only on such a button, and the list or table
  must read declared data that has a `status` field.
- Only the host sets status. The button must be inside a host-only screen or
  dialog; otherwise it is a parse error. The server refuses anyone else.
- `removes from Name` may also go on a button inside a `list` or `table`
  block, and `Name` must be the data that list or table reads.
- Someone who is not the host may remove a row only through a `removes from`
  action they can see, only a row they added, and only while its status is
  `pending`.

## Server routes this version adds or changes

| Method | Route | Rule |
|---|---|---|
| `GET` | `/current` | A reader who is not the host receives the description without host-only parts |
| `GET` | `/versions` | Host only |
| `GET` | `/data/:name` | Undeclared data is refused; `read: own` returns a person their own rows and the host every row, and needs sign-in |
| `POST` | `/data/:name` | The row must match an action the sender can see; `@date` and `@required` values are checked |
| `PATCH` | `/data/:name/:rowId` | Host only; the body `{ "status": "confirmed" }` or `{ "status": "declined" }` must match a `sets status` action on that data |
| `DELETE` | `/data/:name/:rowId` | Someone who is not the host needs a visible `removes from` action, their own row, and a `pending` status |

Rows of `read: own` data get unguessable ids, and someone else's private row
answers exactly like a row that does not exist.

## The words v0.3 adds

- `requires: host`, on a `screen` or `dialog`
- `read: own`, in a `data` block
- the role `@date` and the field property `days:`
- the field name `status`, with the values `pending`, `confirmed`, `declined`
- the action `sets status "confirmed"` or `sets status "declined"`
- one new meaning for an existing shape: a `button` inside a `list` or
  `table` block acts on each row

No other kinds, roles, actions, or runtime control flow are added by v0.3.


=== PROPOSED GRAMMAR v0.4 DELTA ===
# Puppet Script grammar v0.4 delta

This is the delta from [`GRAMMAR-v0.3.md`](./GRAMMAR-v0.3.md). It adds what
GCT round 2 (Eric Kohner and Mike Wolf rebuilding PlayMaker) found missing:
screens without a tab, a screen that shows the row that opened it, rows that
only their author reads, a parse error for any `{token}` the runtime will not
fill, and two components from PlayMaker: a play shown in Diana's script
format, and Stage Read. Everything not changed here keeps its v0.3 meaning.
The words it adds are listed at the end, and nothing else is added.

_Draft written 2026-10-22 by Claude Opus 5.5 (CCc, bead sp-u4x) for Mike Wolf,
who approved GCT round 3 ("Go ahead"). To be reviewed by OpenAI Sol, Google
Gemini and xAI Grok before it is built._

- The metadata version may be `"0.4"`.

## 1. Screens without a tab: `tab: none`

```puppet
screen "About" {
  tab: none
  text "PlayMaker keeps your play in step with your Google Doc."
}
```

- A screen with `tab: none` has no tab. Something must open it, a button or a
  row; otherwise it is a parse error.
- It shows a Back button that returns to the screen that opened it.
- The first screen is where the app opens, so it may not have `tab: none`.
- The tab bar is drawn only when two or more screens have tabs for this
  reader. An app with one tabbed screen shows no tab bar.

## 2. A screen that shows one row: `screen "Name" from Data`

```puppet
data scenes {
  fields: [act, title, text]
  read: private
}

screen "My play" {
  list "Scenes" from scenes -> opens screen "Scene"
}

screen "Scene" from scenes {
  hero { title: "{row.title}", subtitle: "{row.act}" }
  play-view "{row.text}"
  stage-read "{row.text}"
}
```

- `screen "Scene" from scenes` shows one row of `scenes`: the row that opened
  it. It never has a tab.
- `{row.field}` inside it shows that row's field. The field must be declared
  in the data (or present in the stub).
- It opens only with a row: from the hook of a `list` or `table` of the same
  data, or from a `button` inside such a list or table. Opening it from
  anywhere else is a parse error.
- Buttons on it act on its row: `removes from scenes`, and `sets status` on a
  host-only screen, as in v0.3.
- The row comes from rows the reader was already allowed to read. If the row
  disappears (removed, or a new version), the screen goes back.
- `{row.field}` may not appear in an `adds to`. That is a parse error.

## 3. Rows only their author reads: `read: private`

```puppet
data scenes {
  fields: [act, title, text]
  read: private
}
```

- A signed-in person reads only the rows they added. Nobody else reads them,
  **the host included**: the host reads only the rows the host added. This is
  the rule for apps with many writers, such as PlayMaker.
- Only the author removes a private row. Anyone else, the host included, gets
  the same answer as for a row that does not exist.
- `read: private` data may not have a `status` field, because the host could
  not read the rows it would decide. That is a parse error.
- Privacy only tightens, as in v0.3, in this order: everyone, `read: own`,
  `read: private`.
- There is no way yet to share a private row with someone else. Sharing with a
  named person is the roles-and-invitations component, which is not part of
  v0.4.

## 4. Every `{token}` must be one the runtime fills

In text that people read (labels, `hero` titles and subtitles, `empty:` and
other text properties, and `toast` messages), a token must be one of:

| Token | Filled with | Allowed |
|---|---|---|
| `{me.name}` | the signed-in person's name | anywhere |
| `{Name.count}` | how many rows of `Name` the reader can read | `Name` is declared data |
| `{form.Label}` | what the person typed in the field labelled `Label` | a field with that label is on the same screen or dialog |
| `{row.field}` | a field of the screen's row | inside a `screen ... from Data` |

Any other token is a parse error, for example `{play}`, `{last_synced}`, or a
`state` name (this runtime does not fill `state` placeholders). A token in an
`adds to` that the runtime will not fill is a warning, and it is stored as
typed. This check applies to descriptions whose version is `"0.2"` or later;
a `"0.1"` sketch keeps v0.1's placeholders.

## 5. Two components from PlayMaker

Both live in the component library package `packages/soma-play` and take a
scene's text, usually a `{row.field}` on a screen that shows one row.

The text is PlayMaker's plain script form:

- a line in capitals by itself (`OLDER ERIC`) is a character cue, and the lines
  under it, up to a blank line, are that character's speech;
- `NAME: words` on one line (the name in capitals) is a cue and its speech;
- a line in parentheses inside a speech is a parenthetical; anywhere else it
  is a stage direction, as is any other line outside a speech;
- `## Act 1 Scene 2`, or a line such as `ACT ONE, SCENE TWO`, is a heading.

### `play-view`: a scene in Diana's script format

```puppet
play-view "{row.text}"
```

- Draws the text read-only as script pages in Diana's house format, the one
  PlayMaker uses: Times New Roman 11 pt, cues flush left in capitals, speech
  at the margin, narrative directions in italics two inches in, technical
  cues (lights, sound, blackout) at the margin, US Letter pages with one-inch
  margins.

### `stage-read`: the scene read aloud, a voice per character

```puppet
stage-read "{row.text}"
```

- A Play button reads the scene line by line, each character in its own
  voice, and highlights the line being read. Stop stops it. Stage directions
  are not read aloud.
- Each character keeps the same voice every time.
- The text must be a `{row.field}` of the screen's row. The page sends the
  row's address and a line number, never the words: the server reads that row
  under the read rules and speaks only that line of that field.
- A spend check runs on every line: each person has a daily allowance and the
  app has one too, and the page says when it is used up. A line already spoken
  once is replayed from a cache and costs nothing.

## Server routes this version adds or changes

| Method | Route | Rule |
|---|---|---|
| `GET` | `/data/:name` | `read: private` returns a person only their own rows, the host included |
| `DELETE` | `/data/:name/:rowId` | Only the author removes a private row |
| `POST` | `/stage-read` | Signed-in; body `{ data, rowId, field, line }`; the live version must have a `stage-read` of that field on a screen from that data; the server reads that row under the read rules, checks the spend allowance, and returns the line spoken (audio) |

## The words v0.4 adds

- `tab: none`, in a `screen` block
- `from Data` after a screen's name, and the token `{row.field}`
- `read: private`, in a `data` block
- the element kinds `play-view` and `stage-read`
- one new parse error: a `{token}` the runtime will not fill

No other kinds, roles, actions, or runtime control flow are added by v0.4.
