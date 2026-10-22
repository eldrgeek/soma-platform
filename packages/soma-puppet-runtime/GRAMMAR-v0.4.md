# Puppet Script grammar v0.4 delta

This is the delta from [`GRAMMAR-v0.3.md`](./GRAMMAR-v0.3.md). It adds what
GCT round 2 (Eric Kohner and Mike Wolf rebuilding PlayMaker) found missing: a
screen that shows the row that opened it, dialogs that are actually drawn,
rows that only their author reads, a parse error for any `{token}` the
runtime will not fill, and two components from PlayMaker: a scene in Diana's
script format, and Stage Read. Everything not changed here keeps its v0.3
meaning. The words it adds are listed at the end, and nothing else is added.

_Written 2026-10-22 by Claude Opus 5.5 (CCc, bead sp-u4x) for Mike Wolf, who
approved GCT round 3 ("Go ahead"). OpenAI Sol, Google Gemini and xAI Grok
reviewed the draft before it was built; what changed because of them is in
`docs/grammar-v0.4-review.md`._

- Write the metadata version as `"0.4"`. The token check in section 4 applies
  to version `"0.4"` and later.
- **Inside** still means nested inside, by indentation or braces. Nothing is
  inside a screen because a button opens it.

## 1. A screen that shows one row: `screen "Name" from Data`

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

- `screen "Scene" from scenes` shows one row of `scenes`, the row that opened
  it. It has no tab, and it shows a Back button that returns to the screen the
  row was chosen on.
- It opens only with a row of the same data: from the hook of a `list` or
  `table` of that data (the whole row is clickable), or from a `button` inside
  such a list or table. Opening it from anywhere else is a parse error, and so
  is a screen from data that nothing opens.
- It is never where the app opens: it may not be the first screen. After a
  page reload the app opens on its first screen.
- `{row.field}` inside it shows a field of its row. The field must be declared
  in the data. A dialog is not inside the screen that opens it, so
  `{row.field}` in a dialog is a parse error, and so is `{row.field}` in an
  `adds to`.
- `removes from scenes` and `sets status` (on a host-only screen, as in v0.3)
  on a button of this screen act on its row. Other actions do not use the row.
- A `list` or `table` that opens a row screen shows each long value cut to its
  first line, at most 80 characters, because the row screen shows it whole.
- The row shown is one the server returned to this reader under the read
  rules. When the reader's rows are fetched again and the row is gone, the
  screen goes back.
- A host-only screen may open only host-only screens and dialogs. Something
  everyone sees may not open a host-only screen (as in v0.3). Both are parse
  errors, so a row screen opened from the host's screen is host-only too.

## 2. Dialogs are drawn

A `dialog` is the way to show something that is not a tab and not a row: a
panel over the current screen, opened by `opens dialog "Name"`, with a close
button (✕). `closes self` closes it. A dialog may hold any element a screen
holds, and it keeps v0.3's rules (`requires: host` on a dialog makes it
host-only). The tab bar is drawn only when the reader has two or more screens
with tabs.

## 3. Rows only their author reads: `read: private`

```puppet
data scenes {
  fields: [act, title, text]
  read: private
}
```

- Each signed-in person, **the host included**, reads only the rows they added.
  The author is the account that added the row, stored by the server apart
  from the row's fields. Counts count only those rows. Someone who is not
  signed in reads none, even in a `publicRead` app.
- This is the rule for apps with many writers, such as PlayMaker. `read: own`
  (v0.3) still means the host reads every row, which approval lists need.
- A private row is removed only by its author, through a `removes from` they
  can see. Anyone else, the host included, gets the same answer as for a row
  that does not exist.
- `read: private` data may not have a `status` field, because the host could
  not read the rows it would decide. That is a parse error.
- Privacy only tightens: everyone, then `read: own`, then `read: private`. The
  runtime remembers the strictest rule ever approved for each collection name
  in the app, and keeps it through undo, redo, removing the `data` block, and
  declaring the name again. A renamed collection starts empty; its old rows
  stay under the old name.
- There is no way yet to share a private row with someone else. Sharing with a
  named person is the roles-and-invitations component, which is not part of
  v0.4.

## 4. Every `{token}` must be one the runtime fills

In version `"0.4"` and later, every token in the description must be one of:

| Token | Filled with | Allowed |
|---|---|---|
| `{me.name}` | the signed-in person's name (empty when nobody is signed in) | anywhere |
| `{Name.count}` | how many rows of `Name` the reader can read | `Name` is declared data |
| `{form.Label}` | what the person typed in the field labelled `Label` | a field with that label is on the same screen or dialog |
| `{row.field}` | a field of the screen's row | text inside a `screen ... from Data`; not in an `adds to` |

Any other token is a parse error, in text and in `adds to` alike: for example
`{play}`, `{last_synced}`, or a `state` name, because this runtime does not
fill `state` placeholders. A field's own label is shown as written, so it may
not hold a token. Words stored in a row are shown as they are; a `{...}`
inside them is never filled. In versions `"0.2"` and `"0.3"` the same tokens
are warnings, so descriptions already live keep working.

## 5. Two components from PlayMaker

Both are in the component library package `packages/soma-play`. Both read a
scene in PlayMaker's plain script form. Each line is read in this order:

1. A blank line ends a speech.
2. `## Act 1 Scene 2`, or a line in capitals that starts with `ACT` or
   `SCENE`, is a heading.
3. A technical cue (lights, music, sound, fade, blackout, "End of", `Time:`,
   `Place:`) is a stage direction at the margin, and it ends a speech when it
   is in capitals or in parentheses.
4. A line in capitals by itself, of at most six words, is a character cue;
   the lines under it, up to a blank line, are that character's speech.
5. `NAME: words` on one line, the name in capitals, is a cue and its speech.
6. Inside a speech, a line in parentheses is a parenthetical, and any other
   line is more of the speech.
7. Any other line is a stage direction.

The spoken lines are the speeches that have words, numbered from 0 in order.
Headings, directions and parentheticals are not spoken.

### `play-view`: a scene in Diana's script format

```puppet
play-view "{row.text}"
```

- Draws the scene read-only as script pages in Diana's house format, the one
  PlayMaker uses: Times New Roman 11 pt, the cue flush left in capitals with
  the speech under it, parentheticals in italics, narrative directions in
  italics two inches in, technical cues at the margin, US Letter pages with
  one-inch margins. A screen narrower than a page shows the pages scaled down.

### `stage-read`: the scene read aloud, a voice per character

```puppet
stage-read "{row.text}"
```

- Its text is exactly one `{row.field}` on a screen from data; anything else
  is a parse error.
- It draws a "Hear this scene" button. The scene is read line by line, each
  character in its own voice, and Stop stops it. When a `play-view` of the
  same `{row.field}` is on the screen, the line being read is highlighted
  there.
- Voices come from a fixed set of five. Each character's voice follows from
  its name, and two characters in the same scene never share a voice unless
  the scene has more than five. Choosing voices is the later voice-picker
  component.
- The page sends the row's id and a line number, never the words. On every
  line the server checks, in this order: the reader is signed in; the live
  version has this `stage-read` on a screen the reader can see; the reader may
  read the row (a row they may not read answers exactly like a missing row);
  the line exists; and the spend allowance. Only then does it speak.
- The spend allowance is counted in characters and reserved before the voice
  service is called: a limit per line, per person per day and for the app per
  day, plus a limit on lines per person per day. A line its author's scene has
  already had spoken is replayed from the cache and uses no characters. When
  an allowance is used up, the page says so.

## Server routes this version adds or changes

| Method | Route | Rule |
|---|---|---|
| `GET` | `/data/:name` | `read: private` returns the caller, the host included, only the rows they added; sign-in needed |
| `DELETE` | `/data/:name/:rowId` | A private row: only its author, through a visible `removes from` |
| `POST` | `/stage-read` | Body `{ data, rowId, field, line }`; the checks of section 5 in order; answers with the line's audio |

## The words v0.4 adds

- `from Data` after a screen's name, and the token `{row.field}`
- `read: private`, in a `data` block
- the element kinds `play-view` and `stage-read`
- one new parse error: a `{token}` the runtime will not fill
- one existing word now drawn: `dialog`

No other kinds, roles, actions, or runtime control flow are added by v0.4.
