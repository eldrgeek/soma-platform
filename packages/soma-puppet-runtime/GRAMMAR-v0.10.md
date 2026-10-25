# Puppet Script grammar v0.10 delta

This is the delta from [`GRAMMAR-v0.9.md`](./GRAMMAR-v0.9.md). It adds two
more parts of PlayMaker, wrapped as components in `packages/soma-play`: a play
brought in from a Google Doc, with the Doc holding the pen, and the play
printed to PDF in Diana's format. It also says what `play-view` is:
PlayMaker's script editor in its read-only profile. Everything not changed
here keeps its v0.9 meaning.

_Written 2026-10-24 by Claude Opus 5.5 (CCc, bead sp-l0w) for Mike Wolf, who
approved GCT round 5: "wrap the Google Doc import and PDF print parts, present
the script view as the editor's read-only view". OpenAI Sol, Google Gemini and
xAI Grok reviewed the draft before it was built; what changed because of them
is in `docs/grammar-v0.10-review.md`._

- Write the metadata version as `"0.10"`. A version is two whole numbers with
  a dot between them (a third, such as `"0.10.1"`, is ignored), and versions
  compare number by number: `"0.10"` comes after `"0.9"`. Any other version is
  held to every rule. `doc-import` and `play-print` are parse errors in a
  version before `"0.10"`.
- Both parts are PlayMaker's own code, bundled unchanged from PlayMaker's
  source into `packages/soma-play/src/playmaker/`, each file naming the
  PlayMaker commit it was built from. They are not a rewrite.

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
  `into`. That data must say `read: private`, and its fields must be exactly
  `[title, text]` or `[title, text, act]`. Anything else is a parse error. So
  an imported play is always its writer's alone: nobody else reads it, the
  host included.
- It draws "Bring in from Google Doc". Pressing it asks the writer to sign in
  to Google and choose a Doc (PlayMaker's Google sign-in and Picker: Google
  gives this page access to that one Doc, for an hour, kept in the page's
  memory only). The page reads the Doc and turns it into script text with
  PlayMaker's own converter, the one PlayMaker uses for its own Doc import.
- The script is split into one row per scene, in the Doc's order: a new scene
  starts at each scene heading (a line such as `ACT ONE, SCENE TWO`, or a
  heading line `##` as PlayMaker writes it). The heading's words become
  `title`, and the scene's lines, heading included, become `text`. An act
  heading goes into `act` when `act` is declared. Lines before the first
  heading (a title page, a cast list) are not brought in; the PDF still lists
  the cast, because PlayMaker's PDF writer finds the characters who speak.
- **The Doc holds the pen.** A writer has one Doc per data: each pull replaces
  every row that writer brought in from a Doc into that data, in one write,
  even when the new Doc is a different one. Rows the writer added in the app
  stay. A row brought in from a Doc is never edited or removed in the app, by
  anyone, its writer included: change it in the Doc and pull again. The app
  never writes to the Doc.
- After a pull it shows "Last updated" with the time and the Doc's name, and
  a "Pull again" button. Pull again reads the same Doc; when the hour's Google
  access has run out, it asks the writer to sign in to Google again.
- The page converts the Doc and sends the scenes. The server stores what the
  writer sends, like any row the writer adds: it never sees the Doc and never
  calls Google, so it cannot confirm the words came from the Doc. The pen is a
  rule about the writer's own rows, not proof of where they came from. Scene
  text is stored and drawn as plain text.
- The site needs PlayMaker's public Google settings (`GOOGLE_DRIVE_CLIENT_ID`,
  `GOOGLE_API_KEY`), and Google must list the site's address for that client.
  Without them the button says Google Doc import is not set up on this site.

## 2. `play-print`: a PDF in Diana's format

```puppet
screen "Scene" from scenes {
  play-view "{row.text}"
  play-print "{row.text}"
}

screen "My play" {
  play-print from scenes
}
```

- It draws "Print (PDF)". Pressing it makes a PDF with PlayMaker's own PDF
  writer, in Diana's format: a title page with the app's title, the cast (the
  characters who speak), then US Letter script pages numbered from the first
  script page. The PDF opens in a new tab, where the browser prints it or
  saves it; when the browser blocks the tab, it is downloaded instead.
- `play-print "{row.text}"` prints one scene. Its text is exactly one
  `{row.field}` on a screen from data; anything else is a parse error.
- `play-print from Name` prints the whole play: every row of `Name` the
  reader can read, in the order the rows were stored (a Doc's scenes stay in
  the Doc's order), one after another. `Name` must be declared data with a
  `text` field. It may go on any screen.
- It prints only rows the page has already been given under the data's read
  rule. It has no server route and no allowance.

## 3. `play-view` is the editor's read-only profile

- `play-view` is PlayMaker's script editor in its read-only profile: the same
  Diana display rules as PlayMaker's editor, with editing turned off. The page
  says so in a quiet line above the pages: "PlayMaker editor · read-only".
- The editing profile is not wrapped yet. In an app where the Google Doc holds
  the pen (`doc-import`), the writer edits in the Doc, so the read-only profile
  is the editor's whole job in the app.
- Nothing about `play-view` changes in the grammar.

## Server routes this version adds or changes

| Method | Route | Rule |
|---|---|---|
| `POST` | `/doc-import` | Body exactly `{ data, doc: { id, name }, scenes: [{ title, text, act? }] }`. Checks in order: signed in; a `doc-import into` this data on a screen the reader can see; the Doc id is 10 to 128 letters, digits, `-` or `_` (a shape check only); the name at most 300 characters; 1 to 300 scenes; each title at most 300, each `act` at most 100, each text at most 40,000 characters, and all text together at most 500,000; then, in one write, the reader's rows from a Doc in this data are replaced |
| `GET` | `/doc-import/:data` | Signed in; a `doc-import into` this data on a screen the reader can see; answers only the reader's own last pull (Doc id and name, time, number of scenes), or `null` |
| `PUT` | `/data/:name/:rowId` | Refused for a row brought in from a Doc, its author included |
| `DELETE` | `/data/:name/:rowId` | Refused for a row brought in from a Doc, its author included |

## The words v0.10 adds

- the element kind `doc-import`, with `into Name`
- the element kind `play-print`, with exactly one `{row.field}` or `from Name`

No other kinds, roles, actions, or runtime control flow are added by v0.10.
