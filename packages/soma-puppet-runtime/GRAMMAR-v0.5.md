# Puppet Script grammar v0.5 delta

This is the delta from [`GRAMMAR-v0.4.md`](./GRAMMAR-v0.4.md). It adds what
VideoMaker, the SOMA Studio app for video scripts, needs: a video script drawn
as a two-column AV script, its narration read aloud with a voice per narrator,
and an editor that changes a row's text. Everything not changed here keeps its
v0.4 meaning. The words it adds are listed at the end.

_Written 2026-10-22 by Claude Opus 5.5 (CCc, bead sp-go2) for Mike Wolf, who
asked for VideoMaker: "a new app, built using Soma Studio, with components from
PM made into SS components if they are not already present."_

- Write the metadata version as `"0.5"`. Each element below is a parse error in
  an earlier version.
- The two video components are in the component library package
  [`packages/soma-video`](../soma-video/README.md). The editor is drawn by the
  runtime itself.

## 1. `video-view`: a video script as an AV script

```puppet
video-view "{row.text}"
```

- Reads its text as a script in the SOMA script format (Fountain, the format
  the soma-cut renderer reads; skill `soma-script-format`), plus one block
  VideoMaker adds, `CAST`, which names each narrator's voice:

  ```
  CAST
  CLAUDE: Chris
  SUNO: Charlie
  ```

- Draws the script read-only in two columns, picture on the left and sound on
  the right, one row per moment. A CARD, CLIP or other performer is drawn in the
  row of the narration line after it, because that is the line it plays under.
  MUSIC and SFX cues are drawn as sound.
- Each scene shows its number, heading and estimated length. The top shows the
  title, each narrator with their voice, the estimated length of the film, and
  "Before you render": narrators with no CAST voice, CAST voices not on the
  roster, scenes with nothing to look at, and CLIP blocks with no source.
- Like `play-view`, its text may be any text with tokens; it is usually
  `{row.text}` on a screen from data.

## 2. `video-read`: the narration read aloud

```puppet
video-read "{row.text}"
```

- Its text is exactly one `{row.field}` on a screen from data; anything else is
  a parse error.
- It draws a "Hear the narration" button. Each narrator line is read in order,
  in the narrator's CAST voice. CARD, CLIP and the other performers are silent,
  and so are parentheticals. When a `video-view` of the same `{row.field}` is on
  the screen, the row being read is highlighted there.
- It reads the saved text, which is what the server has.
- It is Stage Read (v0.4 section 5) with a video script's lines and voices: the
  same server checks in the same order, at `POST /video-read`. Its allowance is
  counted apart from Stage Read's and is twice as large: 600 characters per
  line, 6,000 per person per day, 16,000 for the app per day, 400 lines per
  person per day.
- Voices come from a roster of thirteen ElevenLabs premade voices: Chris,
  Charlie, Callum, Matilda, Eric, Liam, Laura, Lily, Jessica, George, Rachel,
  Adam and Elli. A narrator with no CAST voice gets a voice no other narrator in
  the script has, while any are left.

## 3. `script-editor`: change a row's text

```puppet
script-editor "{row.text}"
```

- Its text is exactly one `{row.field}` on a screen from data, and the field may
  not be `status`; anything else is a parse error.
- It draws the field in a text box with a Save button. Typing redraws every
  `video-view` of the same field at once, before saving. The unsaved text
  survives a redraw of the page, and a refused save keeps it and says why.
- Save sends `PUT /data/:name/:rowId` with `{ "field", "value" }`. The server
  checks, in order: the reader is signed in; the body is exactly a text field
  name and a text value; the value is at most 40,000 characters (a new row's
  field stays at most 10,000); the live version has a `script-editor` of this
  field on a screen from this data that the reader can see; and the reader is
  the row's author.
- Only the row's author edits it, in every kind of data. Anyone else is refused;
  for `read: own` and `read: private` data the answer is the same as for a row
  that does not exist, as everywhere else. The host does not edit other
  people's rows.

## Server routes this version adds

| Method | Route | Rule |
|---|---|---|
| `PUT` | `/data/:name/:rowId` | Body `{ field, value }`; section 3's checks in order |
| `POST` | `/video-read` | Body `{ data, rowId, field, line }`; Stage Read's checks for a `video-read` |

## The words v0.5 adds

- the element kinds `video-view`, `video-read` and `script-editor`
- the script block `CAST`, read by `video-view` and `video-read`, not by Puppet

No other kinds, roles, actions, or runtime control flow are added by v0.5.
