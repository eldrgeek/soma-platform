You are on the Brain Trust reviewing a grammar change BEFORE it is built. Reply in plain text, under 800 words. Do not use any tools and do not ask for more files: everything you need is below.

## Context
Puppet Script is a deliberately CLOSED description language for SOMA Studio apps: an AI Builder writes a description; a shared runtime (plain-JS renderer + one Netlify Function API over Netlify Blobs, Supabase sign-in) runs it. Words are added only when a real app needs them. You reviewed v0.3 and v0.4 earlier (host-only screens, read: own, read: private where even the host reads only their own rows, row screens `screen "X" from data` with {row.field}, play-view in Diana's script format, stage-read with server-checked reads and a spend allowance). v0.5 added script-editor (PUT a row's field, only by its author). v0.6-v0.9 added VideoMaker parts.
GCT rehearsals (a simulated playwright, Eric, and Mike building PlayMaker in the studio) keep naming two blockers: no Google Doc import (Eric writes in a Google Doc and refused copy-paste; Mike wants PlayMaker's copy as the internal truth with the Doc holding the pen), and no PDF in Diana's format to hand to people. The judge also marked "wrap PlayMaker's existing editor, not a rewrite" only partly met because the studio presented play-view as a replacement. Mike approved: wrap PlayMaker's Doc import and PDF print, reusing PlayMaker's code, and present the script view as the editor's read-only view.
Facts about PlayMaker's code being reused (bundled unchanged with esbuild): Doc import runs in the BROWSER with the user's own Google token (Google Identity Services, drive.file scope, Google Picker, token in memory for an hour, no refresh token, no server), Drive files.export as text/html, then importGoogleDocHtml (DOMParser-based) to Fountain. PDF: fountainToStagePlay + stagePlayDocumentToPdf (pdf-lib, pure JS, runs in the browser).

## Your task
Review the proposed v0.10 delta below. Answer:
1. SMALLEST DESIGN: smallest closed design for these needs? Drop/merge any word or form? (Do not add sharing, roles, two-way sync, or editing.)
2. AMBIGUITIES: where would a Builder or reader misread it? Quote the line.
3. SECURITY AND ABUSE HOLES: the client is attacker-controlled and sends the converted scenes. Think about: writing rows into someone else's data, replacing other people's rows, the Doc id, sizes, read rules on imported rows, the pen rule, the whole-play print and read rules, the version comparison change, and publicRead apps.
End with a ranked list of changes (most important first), one line each.


=== PROPOSED GRAMMAR v0.10 DELTA ===
# Puppet Script grammar v0.10 delta

This is the delta from [`GRAMMAR-v0.9.md`](./GRAMMAR-v0.9.md). It adds two
more parts of PlayMaker, wrapped as components in `packages/soma-play`: a play
brought in from a Google Doc, with the Doc holding the pen, and the play
printed to PDF in Diana's format. It also says what `play-view` is: PlayMaker's
script editor in its read-only profile. Everything not changed here keeps its
v0.9 meaning.

_Draft written 2026-10-24 by Claude Opus 5.5 (CCc) for Mike Wolf, who
approved GCT round 5: "wrap the Google Doc import and PDF print parts, present
the script view as the editor's read-only view". To be reviewed by OpenAI
Sol, Google Gemini and xAI Grok before it is built._

- Write the metadata version as `"0.10"`. Versions compare by their parts:
  `"0.10"` comes after `"0.9"`. `doc-import` and `play-print` are parse errors
  in an earlier version.
- Both parts are PlayMaker's own code, bundled unchanged from PlayMaker's
  source (`packages/soma-play/vendor/`, with the PlayMaker commit each was
  built from), not a rewrite.

## 1. `doc-import`: bring a play in from a Google Doc

```puppet
data scenes {
  fields: [title, text]
  read: private
}

screen "My play" {
  doc-import into scenes
  list "Scenes" from scenes -> opens screen "Scene"
}
```

- It goes on a screen that is not from data, and names declared data after
  `into`. That data must have the fields `title` and `text`, may have `act`,
  and may not have `status`. Anything else is a parse error.
- It draws "Bring in from Google Doc". Pressing it asks the reader to sign in
  to Google and choose a Doc (PlayMaker's Google sign-in and Picker; Google
  gives the page access to that one Doc, for an hour, kept in memory only).
  The page reads the Doc and turns it into script text with PlayMaker's own
  converter, the one PlayMaker uses for its own Doc import.
- The script is split into one row per scene, at each scene heading. The
  heading's words become `title` and the scene's lines, heading included,
  become `text`; an act heading goes into `act` when it is declared. Lines
  before the first heading (a title page, a cast list) are not brought in.
- **The Doc holds the pen.** Each pull replaces every row this reader brought
  in from that Doc; rows they typed in the app stay. A row brought in from a
  Doc is not edited in the app: a `script-editor` save of it is refused, and
  the page says to change it in the Doc. Removing it is allowed, and the next
  pull brings it back.
- After a pull it shows "Last updated" with the time and the Doc's name, and
  "Pull again". While Google access is still held, it pulls again when the
  reader comes back to the page, as PlayMaker does.
- Rows are the reader's own: their author is the reader, and the data's read
  rule applies as to any row. A writers' app uses `read: private`.
- The site needs PlayMaker's public Google settings (`GOOGLE_DRIVE_CLIENT_ID`,
  `GOOGLE_API_KEY`), and Google must list the site's address for that client.
  Without them the button says Google Doc import is not set up on this site.

## 2. `play-print`: the play as a PDF in Diana's format

```puppet
screen "Scene" from scenes {
  play-view "{row.text}"
  play-print "{row.text}" title: "{row.title}"
}

screen "My play" {
  play-print from scenes
}
```

- It draws "Print (PDF)". Pressing it makes a PDF with PlayMaker's own PDF
  writer, in Diana's format: a title page, the cast, then US Letter script
  pages numbered from the first scene. The PDF opens in a new tab, where the
  browser prints it or saves it.
- With text in quotes it prints that text, usually one scene's `{row.text}`.
  With `from Name` it prints every row of `Name` the reader can read, in the
  order the list shows them, one after another: the whole play. `Name` must
  be declared data with a `text` field.
- `title:` names the PDF's title page; without it the title is the app's.
- It runs only in the page and prints only text the page already has, so it
  has no server route and no allowance.

## 3. `play-view` is the editor's read-only profile

- `play-view` is PlayMaker's script editor in its read-only profile: the same
  Diana display rules as PlayMaker's editor, with editing turned off. The page
  says so in a quiet line above the pages ("PlayMaker editor · read-only").
- The editing profile is not wrapped yet. In an app where the Google Doc holds
  the pen (`doc-import`), the writer edits in the Doc, and the read-only
  profile is the editor's whole job in the app.
- Nothing about `play-view` changes in the grammar; this is how it is named
  and drawn.

## Server routes this version adds or changes

| Method | Route | Rule |
|---|---|---|
| `POST` | `/doc-import` | Body `{ data, doc: { id, name }, scenes: [{ title, text, act? }] }`. Checks in order: signed in; a `doc-import into` this data on a screen the reader can see; the Doc's id is a Google id; 1 to 300 scenes, each title at most 300 and each text at most 40,000 characters; then the reader's rows from that Doc are replaced |
| `GET` | `/doc-import/:data` | The reader's last pull of this data: the Doc's id and name, when, and how many scenes |
| `PUT` | `/data/:name/:rowId` | Also refused for a row brought in from a Doc |

## The words v0.10 adds

- the element kind `doc-import`, with `into Name`
- the element kind `play-print`, with text in quotes or `from Name`, and `title:`

No other kinds, roles, actions, or runtime control flow are added by v0.10.


=== GRAMMAR v0.5 (script-editor, for the pen rule) ===
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
