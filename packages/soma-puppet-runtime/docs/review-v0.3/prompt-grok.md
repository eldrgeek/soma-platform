You are on the Brain Trust reviewing a grammar change BEFORE it is built. Reply in plain text, under 900 words. Do not use any tools and do not ask for more files: everything you need is below, including GRAMMAR v0.1 (the base language) at the end.

## Context
Puppet Script is a deliberately CLOSED description language. An AI builder writes a Puppet description; a shared runtime (browser renderer + one Netlify Function API over Netlify Blobs) runs it live as a multi-user app. The language grows only by "graduation": a word is added only when a real app needs it. Every app has one HOST (an account id in the runtime's app config). Everyone else signs in with Supabase; the API verifies the bearer token and knows the caller's account id. Today (v0.2):
- GET /api/app/:id/current returns the whole description source to any signed-in reader; GET /versions returns every version's source to any signed-in reader.
- GET /data/:name returns every stored row to any signed-in reader (any name, declared or not).
- POST /data/:name accepts a row only if it matches an `adds to` action in the live description exactly ({me.name} must equal the verified name, {form.X} is client text, literals must match).
- DELETE /data/:name/:rowId: row author or host.
- Only the host proposes/approves/undoes versions. An app config may set publicRead: true, so reads need no sign-in.
A simulated customer (a piano teacher) built a lesson-change app; it failed on: the teacher's private week view (no host-only screens), students seeing only their own requests, real dates (with a Saturday-only rule), and pending/confirmed/declined approval by the teacher. The same capabilities are needed next for PlayMaker (private per-writer data).

## Your task
Review the proposed v0.3 delta below (with v0.2 and the examples for reference). Answer three things:
1. SMALLEST DESIGN: is this the smallest closed-language design that covers the four needs? Name any word that could be dropped or merged, or a smaller alternative, and say why. Do not propose new capabilities beyond the four (no slot capacity, no notifications, no per-role systems).
2. AMBIGUITIES: where would an AI builder or a reader misread this text, or where two readings are possible? Quote the line.
3. SECURITY HOLES: how could a non-host read host-only data or another person's rows, or set a status, given the server rules described? Think about: the description source itself, version history, undo/redo to versions that declare data differently, counts, stubs, actions on hidden elements, row ids, publicRead apps, and the client being fully attacker-controlled.
End with a ranked list of the changes you would make (most important first), each one line.


=== GRAMMAR v0.2 (current) ===
# Puppet Script grammar v0.2 delta

This is the minimal runtime-data delta from
[`GRAMMAR-v0.1.md`](./GRAMMAR-v0.1.md). Everything not changed here keeps its
v0.1 meaning, including the closed sets of element kinds, roles, and actions.

- The metadata version may be `"0.2"`.
- `data Name { fields: [field, ...] }` declares a persisted collection. `stub`
  remains available for non-persisted sketches.
- `list` and `table` may use either a declared `data` or `stub` name after
  `from`.
- `adds to Name { field: "value", ... }` appends to declared data. Values may
  interpolate `{me.name}` or `{form.Field label}`.
- `removes from Name` removes the row to which the triggering element is
  bound.
- `requires: signin` may appear in an `app` or `screen`.
- Element labels may interpolate `{me.name}` and `{Name.count}`. A
  `{Name.count}` token must name declared data.

No other kinds, roles, actions, or runtime control flow are added by v0.2.


=== PROPOSED GRAMMAR v0.3 DELTA ===
# Puppet Script grammar v0.3 delta

This is the delta from [`GRAMMAR-v0.2.md`](./GRAMMAR-v0.2.md). It adds four
things so an app can serve one person privately: host-only screens, rows a
person reads only for themselves, dates, and approve or decline. Everything
not changed here keeps its v0.2 meaning, including the closed sets of element
kinds and roles. The words added are listed at the end; nothing else is added.

_Written 2026-10-21 by Claude Opus 5.5 (CCc, bead sp-50d) at Mike Wolf's
request, from the component gaps of GCT round 1. Reviewed before building by
OpenAI Sol, Google Gemini and xAI Grok: `docs/grammar-v0.3-review.md`._

- The metadata version may be `"0.3"`.
- The **host** is the account that hosts the app: the one that approves its
  versions (`hostId` in the runtime's app configuration).

## 1. Host-only screens and elements: `requires: host`

`requires: host` may appear in a `screen` or `dialog` block, or inline on an
element.

```puppet
screen "My week" {
  requires: host
  table "Requests" from requests
}

button "Clear the notes" requires: host -> removes from notes
```

- Only the host sees a host-only screen, dialog or element, and everything
  inside it.
- The server enforces this. Anyone else receives the description with every
  host-only screen, dialog and element taken out, and with every `stub` that
  only host-only parts read taken out. A person who is not the host never
  receives that text.
- An action on a host-only element counts only for the host. The server
  refuses a row from anyone else that only a host-only button could send.
- `requires:` on an element takes only `host`. On a `screen` or `dialog` it
  takes `signin` or `host`. On `app` it takes only `signin`.
- An element that everyone sees may not open a host-only screen or dialog.
  That is a parse error.

## 2. Who reads a collection: `read: host` and `read: own`

A `data` block may say who reads its rows.

```puppet
data notes {
  fields: [text]
  read: host
}

data requests {
  fields: [who, day, status]
  read: own
}
```

- Without `read:`, everyone who can open the app reads every row, as in v0.2.
- `read: host` means only the host reads the rows. The server returns them to
  no one else. Others may still add rows when an action lets them, so a
  collection can be an inbox that only the host reads.
- `read: own` means a signed-in person reads only the rows they added, and the
  host reads all of them. A row's author is the signed-in account that added
  it.
- A `list`, `table` or `{Name.count}` that everyone sees may not read
  `read: host` data. That is a parse error. Put it on a host-only screen or
  element.
- `{Name.count}` counts the rows the reader is allowed to read.
- The server returns no rows of a collection that the live version does not
  declare.

## 3. Dates: `@date`

```puppet
field "Day you'll miss" @date
field "Which Saturday?" @date days: [Sat]
```

- A `@date` field is a date picker. Its value is an ISO date, `YYYY-MM-DD`,
  for example `2026-10-25`.
- `days:` limits the field to some days of the week. Its values are taken from
  `Mon Tue Wed Thu Fri Sat Sun`. It is allowed only on a `@date` field.
- The server refuses a row when a value that came from a `@date` field is not
  a real calendar date in that form, or falls on a day that `days:` excludes.
  An empty value is accepted.
- Lists and tables show a stored ISO date with its weekday, for example
  `Sat 25 Oct 2026`.

## 4. Approve or decline: `status` and `sets status`

A collection that declares a field named `status` is an approval collection.

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
  may not name `status`; that is a parse error.
- `sets status "pending"`, `sets status "confirmed"` and
  `sets status "declined"` change the status of one row. No other value is
  allowed.
- A `button` or `link` inside a `list` or `table` block appears on every row
  and acts on that row. `sets status` goes only there, and the list or table
  must read declared data that has a `status` field.
- Only the host sets status. The button must be host-only: `requires: host` on
  it, on an element around it, or on its screen or dialog. Otherwise it is a
  parse error. The server refuses anyone else.
- `removes from Name` may also go on a button inside a `list` or `table`
  block. It removes that row.

## Server routes this version adds or changes

| Method | Route | Rule |
|---|---|---|
| `GET` | `/current` | A reader who is not the host receives the description with host-only parts taken out |
| `GET` | `/versions` | Host only |
| `GET` | `/data/:name` | `read: host` returns rows only to the host; `read: own` returns a person their own rows and the host all rows; undeclared data is refused |
| `PATCH` | `/data/:name/:rowId` | Host only; body `{ "status": "pending" \| "confirmed" \| "declined" }` must match a `sets status` action on that data |

## The words v0.3 adds

- `requires: host`
- `read: host` and `read: own`
- the role `@date` and the field property `days:`
- the field name `status`, with the values `pending`, `confirmed`, `declined`
- the action `sets status "<value>"`
- one new meaning for an existing shape: a button or link inside a `list` or
  `table` block acts on each row

No other kinds, roles, actions, or runtime control flow are added by v0.3.


=== EXAMPLE sunday-supper.puppet (v0.2, live) ===
puppet "Sunday Supper" version "0.2"

app "Sunday Supper" {
  promise: "Neighbors say yes in one tap and know who is bringing what."
  requires: signin
}

data seats {
  fields: [name]
}

data dishes {
  fields: [who, dish]
}

screen "Next supper" {
  hero { title: "Sunday, Nov 2 · 6 pm", subtitle: "At Rosa's. Bring a dish if you can." }
  text "{seats.count} coming"
  button "Save me a seat" @primary -> adds to seats { name: "{me.name}" }
}

screen "Who's bringing what" {
  list "Dishes" from dishes
  field "Dish"
  button "Add my dish" @primary -> adds to dishes { who: "{me.name}", dish: "{form.Dish}" }
}


=== EXAMPLE sunday-supper-v2.puppet (v0.2, live) ===
puppet "Sunday Supper" version "0.2"

app "Sunday Supper" {
  promise: "Neighbors say yes in one tap and know who is bringing what."
  requires: signin
}

data seats {
  fields: [name]
}

data dishes {
  fields: [who, dish, cant_eat]
}

screen "Next supper" {
  hero { title: "Sunday, Nov 2 · 6 pm", subtitle: "At Rosa's. Bring a dish if you can." }
  text "{seats.count} coming"
  button "Save me a seat" @primary -> adds to seats { name: "{me.name}" }
}

screen "Who's bringing what" {
  list "Dishes" from dishes
  field "Dish"
  field "Can't eat"
  button "Add my dish" @primary -> adds to dishes { who: "{me.name}", dish: "{form.Dish}", cant_eat: "{form.Can't eat}" }
}


=== DRAFT EXAMPLE sunday-supper-v3.puppet (uses the proposed v0.3) ===
puppet "Sunday Supper" version "0.3"

app "Sunday Supper" {
  promise: "Neighbors say yes in one tap and know who is bringing what."
  requires: signin
}

data seats {
  fields: [name]
}

data dishes {
  fields: [who, dish, cant_eat]
}

data guest_requests {
  fields: [who, guest, sunday, status]
  read: own
}

data host_notes {
  fields: [note]
  read: host
}

screen "Next supper" {
  hero { title: "Sunday, Nov 2 · 6 pm", subtitle: "At Rosa's. Bring a dish if you can." }
  text "{seats.count} coming"
  button "Save me a seat" @primary -> adds to seats { name: "{me.name}" }
}

screen "Who's bringing what" {
  list "Dishes" from dishes
  field "Dish"
  field "Can't eat"
  button "Add my dish" @primary -> adds to dishes { who: "{me.name}", dish: "{form.Dish}", cant_eat: "{form.Can't eat}" }
}

screen "Bring a guest" {
  text "Ask Rosa if you may bring someone. Nothing is settled until she confirms."
  field "Guest's name" @required
  field "Which Sunday?" @date @required days: [Sun]
  button "Ask Rosa" @primary -> adds to guest_requests { who: "{me.name}", guest: "{form.Guest's name}", sunday: "{form.Which Sunday?}" } ; toast "Sent. Rosa will confirm or decline."
  list "My requests" from guest_requests empty: "You have not asked yet."
}

screen "Rosa's list" {
  requires: host
  table "Guest requests" from guest_requests {
    button "Confirm" -> sets status "confirmed"
    button "Decline" -> sets status "declined"
  }
  list "Notes to self" from host_notes {
    button "Remove" -> removes from host_notes
  }
  field "Note"
  button "Save note" -> adds to host_notes { note: "{form.Note}" }
}


=== GRAMMAR v0.1 (base language; v0.2 and v0.3 are deltas on it) ===
# Puppet Script — v0 Grammar (Wave-0 Freeze)

**Status:** Wave-0 freeze artifact — contracts only; no renderer yet  
**Version:** `puppet-script/0.1`  
**Date:** 2026-07-14  
**Authorship:** Mike Wolf direction (MOAD §2.3 / §10 WS E1) · Grok (this freeze pass)  
**Stands under:** `MOTHER-OF-ALL-DEMOS.md` §2 (build method), §2.3 (puppet prototyping), §10 WS **E1**  
**Consumers:** Jared builder (WS E1), factory handoff (WS Fac), capture pipeline (WS Cap), Golden Journey tests  
**File extension:** `.puppet` (or fenced ` ```puppet ` inside stories)  
**MIME / content-type (when needed):** `text/x-puppet-script`

---

## 0. One sentence

**Puppet Script describes a provisional, clickable UI as structure + tropes + intent — never pixels, CSS, or framework code.** A thing is a *button*, it lives *here*, it may have a *color*; Jared fills standard appearance; hooks say what happens when the human presses it.

---

## 1. Family relationship — Puppet Script vs SomaScript

**DECISION (W0 freeze): sibling languages under one family, not one language with two targets.**

| | **Puppet Script** | **SomaScript** (Fountain + soma-cut) |
|---|---|---|
| **Job** | Live, clickable UI sketch | Narrated film / walkthrough |
| **Clock** | User-driven interaction graph | Time + speech (never-truncate law) |
| **Author** | Human prototyper (taste + intent) | Human / videographer |
| **AI expander** | **Jared** → sketch runtime | soma-cut / CHROME / TTS |
| **Unit of meaning** | `screen` + hooks | beat / scene + performers |
| **Evidence bridge** | rrweb session (research · spec · canned demo) | film render; may *replay* rrweb/GIF |

**Family name:** **SOMA Sketch Family** (working). Shared DNA:

1. Compact, detail-stripped human authoring  
2. Bounded **standard tropes** (renderer/theme owns look)  
3. One artifact usable by both AI expander and human factory  
4. No ad-hoc invent-the-markup mid-stream  

**Do not share a parser.** Shared package may later extract *trope catalogs* and *naming conventions* only. Film concerns (narrators, word-lock, RECUT) must not pollute UI grammar; UI state/hooks must not pollute Fountain.

**Cross-link (allowed, optional):** a Puppet screen may declare `demo-clip: <locator>` for WS F narration; a SomaScript `CHROME` beat may target a deployed sketch URL. That is wiring, not language unification.

---

## 2. Design laws (non-negotiable)

1. **Detail-stripped.** No CSS classes, no pixel sizes, no React/HTML, no font names. Optional *semantic* props only (`@primary`, `color: blue`, `tone: warning`).  
2. **Trope-complete defaults.** Unspecified chrome is filled by the standard catalog (§5). Dialog ⇒ ✕ upper-right; app shell ⇒ top nav; etc.  
3. **Executable enough to click.** Every interactive element either has a hook or is `@inert` (explicit non-action for research).  
4. **One file = one sketch product** (one app or one story slice). Multiple `screen` blocks allowed.  
5. **Stub data is first-class.** `from stub` / `stub {…}` — no real backend required for W0–W1.  
6. **Stories map onto screens** via `story` blocks (§7) — not the other way around.

---

## 3. Token & element types

### 3.1 Lexical tokens

```
IDENT       = [A-Za-z_][A-Za-z0-9_-]*
STRING      = "…" | '…'
NUMBER      = [0-9]+ ( '.' [0-9]+ )?
COLOR       = IDENT | '#' hex{3,8}          # semantic name preferred
PLACEHOLDER = '{' IDENT ( '.' IDENT )* '}'  # e.g. {member.first}
ROLE        = '@' IDENT                     # @primary @voice @danger @inert …
COMMENT     = '#' … EOL  |  '//' … EOL
```

Indentation is significant (2 spaces). Lines are statements. `;` chains actions on one hook.

### 3.2 Top-level declarations

| Kind | Form | Meaning |
|---|---|---|
| Meta | `puppet "Title" version "0.1"` | Sketch identity |
| App shell | `app "Name" { … }` | Optional defaults (logo, hosts, theme token) |
| Screen | `screen "Name" { … }` | One navigable surface |
| Dialog | `dialog "Name" { … }` | Modal surface (implicit ✕ unless suppressed) |
| Stub | `stub Name { … }` | Named fake data for lists/fields |
| Story | `story "As a …" { … }` | User-story → screen map |
| Theme hint | `theme: soma-sketch` | Name only; theme owns chrome |
| State | `state "Name" { where: memory }` | Explicit state model and backing location |

### 3.3 Element kinds (inside screen/dialog)

| Kind | Purpose | Minimal form |
|---|---|---|
| `navbar` | Top app navigation | `navbar top { logo: "…", items: […] }` |
| `sidebar` | Side rail / secondary nav | `sidebar left { items: […] }` |
| `toolbar` | Contextual action strip | `toolbar { actions: […] }` |
| `hero` | Page intro band | `hero { title: "…", subtitle: "…" }` |
| `button` | Pressable control | `button "Label" @primary` |
| `link` | Text navigation | `link "Label"` |
| `field` | Input | `field "Label" @text` / `@multiline` / `@select` |
| `card` | Grouped affordance | `card "Title" @voice` |
| `list` | Collection | `list "Title" from stubName` |
| `table` | Tabular collection | `table "Title" from stubName` |
| `text` / `label` | Static copy | `text "…"` |
| `image` | Placeholder image | `image "alt" @hero` |
| `avatar` | Person mark | `avatar {member.name}` |
| `badge` | Count / status chip | `badge "3"` |
| `tabs` | In-page switcher | `tabs { items: […] }` |
| `host-panel` | Named host affordance | `host-panel "Bill" @voice` |
| `composer` | Message / request compose | `composer "Placeholder…"` |
| `toast` | Transient feedback (target of hooks) | usually only via action |
| `xbox` | Explicit close control | `xbox top-right` (default on dialog) |
| `region` | Anonymous layout group | `region main { … }` |
| `spacer` | Flexible empty | `spacer` |

Unknown kinds are **errors** in v0 (no open-ended invent). New kinds require a grammar bump.

### 3.4 Roles (`@…`) — semantic, not CSS

| Role | Intent |
|---|---|
| `@primary` | Main CTA |
| `@secondary` | Secondary action |
| `@danger` | Destructive |
| `@ghost` | Low emphasis |
| `@voice` | Starts / implies voice host |
| `@ai` | AI-facing affordance |
| `@inert` | Visible, not clickable (research probe) |
| `@required` | Field must be non-empty to enable linked primary |
| `@multiline` | Field grows |
| `@select` / `@toggle` / `@text` | Field control type |

---

## 4. Layout & positioning syntax

**Principle:** positions are *regions and edges*, not coordinates.

### 4.1 Regions (screen grid)

```
┌──────────────────────────────────────┐
│ top / navbar                         │
├──────────┬───────────────┬───────────┤
│ left     │ main          │ right     │
│ sidebar  │               │           │
├──────────┴───────────────┴───────────┤
│ bottom / toolbar / footer            │
└──────────────────────────────────────┘
```

### 4.2 Placement forms

```
# Edge / region keywords
@top | @bottom | @left | @right | @main | @center | @overlay

# Element-level placement
button "Save" @primary @bottom-right
navbar top { … }                 # kind + edge sugar
sidebar left { … }
xbox top-right                   # trope edge pair
dialog "Confirm" @modal          # centered overlay (default for dialog)

# Stacking inside a region (document order = visual order top→bottom / start→end)
region main {
  hero { … }
  list "…" from requests
  button "New" @primary
}

# Flow hints (optional, rare)
row { button "A" ; button "B" }  # horizontal group
stack { … }                      # explicit vertical (default)
```

### 4.3 Sizing (only these)

```
size: compact | default | wide | full
# No px/rem/%. Jared maps tokens → theme.
```

### 4.4 Properties (key: value)

Allowed property keys (v0 closed set):

`logo`, `items`, `title`, `subtitle`, `label`, `placeholder`, `value`, `color`, `tone`, `size`, `from`, `empty`, `host`, `hours`, `badge`, `icon` (semantic name only), `bind`, `id`.

```
button "New Request" @primary color: blue
card "Ask Bill" @voice tone: host
text "Draft" color: muted
```

`color` / `tone` are **tokens** (`blue`, `muted`, `host`, `warning`, `success`) — not freeform design systems.

### 3.5 State modeling

State is declared, never inferred. A declaration names the value, says where it lives, and may provide a deterministic initial `value`:

```puppet
state "cart" {
  where: localStorage
  value: []
}

state "draftRequest" {
  where: memory
  value: ""
}
```

v0 locations are `localStorage`, `sessionStorage`, `database`, `memory` (in-page/component), and `url` (route/query params). The location token is intentionally extensible: an unfamiliar location is surfaced by Jared/the validator, not guessed or silently remapped.

Use `bind: StateName` on a field to read and write that state. Use the same binding on `text`, `label`, `badge`, `hero`, `list`, or `table` to read it. Text placeholders such as `{draftRequest}` resolve from the declared state. A renderer may use the real browser store for local/session storage and a deterministic local stand-in for backends unavailable in a sketch.

---

## 5. Standard component tropes

Jared **must** apply these when the script is silent:

| Trope | Default behavior |
|---|---|
| **Dialog** | Modal overlay; dimmed backdrop; **✕ (`xbox`) top-right** → `closes self`; Esc same; focus trap implied |
| **App shell** | If any `screen` has no navbar and `app` declares logo/items → inject `navbar top` |
| **Navbar** | Horizontal top; logo left; items right-of-logo; active item = current screen name match |
| **Sidebar** | Full-height left (or right if `@right`); items stack; selection highlights |
| **Toolbar** | Horizontal strip under navbar or above bottom edge; icon+label actions |
| **Card** | Bordered block; title; optional body; whole card clickable if one hook |
| **List** | Rows from stub; empty state from `empty: "…"`; row click if list has hook |
| **Field** | Label above control; `@required` blocks primary until filled (sketch-level) |
| **Toast** | Bottom (or top) transient; auto-dismiss ~3s in sketch |
| **Host panel** | Named host + voice/text affordance; 24/7 AI vs hours human per app meta |
| **Primary button** | One `@primary` per region preferred; visual dominance from theme |
| **Navigation** | `opens screen "X"` pushes/replaces within sketch SPA; back via browser or explicit `back` |

**Suppression:** `xbox: none` on a dialog is allowed only with a visible alternative close path (button/hook). Silent traps fail validation.

---

## 6. Interaction hooks

### 6.1 Syntax

```
<button-or-element>  ->  <action> ( ';' <action> )*
```

Attach on the same line as the element, or as a nested `on press` / `on submit` / `on select` block:

```
button "Send" @primary -> toast "Sent" ; closes self

button "More" {
  on press -> opens dialog "Options"
}

list "My Requests" from requests {
  on select -> opens screen "Request Detail"
}
```

### 6.2 Events (v0)

| Event | Default for |
|---|---|
| `press` | button, card, link, badge, host-panel, toolbar action |
| `submit` | composer, form-like region |
| `select` | list row, table row, tabs item, nav item |
| `close` | xbox, backdrop (dialog) |
| `change` | field (rarely hooked in sketches) |

Bare `->` on a button implies `on press`.

### 6.3 Actions (v0 closed set)

| Action | Meaning |
|---|---|
| `opens screen "Name"` | Navigate to screen |
| `opens dialog "Name"` | Present modal |
| `closes self` | Close current dialog / dismiss overlay |
| `closes dialog "Name"` | Close named dialog |
| `back` | Prior screen |
| `toast "Message"` | Transient feedback |
| `starts host "Name"` | Open/focus host panel / voice affordance |
| `sets field "Label" = "value"` | Stub mutation |
| `adds to stub Name { … }` | Append stub row |
| `goto story "…"` | Jump to story entry screen (test harness) |
| `no-op` | Explicit do-nothing (prefer `@inert`) |

Chaining is sequential in sketch time (instant). No timers/loops in v0.

### 6.4 Targets & ids

```
button "New" @primary id: btn-new -> opens dialog "Composer"
```

`id` is optional stable handle for rrweb annotations and factory mapping.

---

## 7. User story → screen mapping

Stories are **acceptance intent**, not UI chrome.

```
story "As a member, I want to raise a request and see it move" {
  entry: screen "Membership Home"
  path:
    - press "New Request"          # match by visible label
    - submit "Send to Bill"
    - see toast "Bill has your request"
    - see screen "Membership Home"
  done: |
    Member can open composer, send, and land back with confirmation.
}
```

| Clause | Role |
|---|---|
| `entry` | First screen for this story |
| `path` | Ordered interaction expectations (sketch test / Golden-adjacent) |
| `done` | Human-readable done criteria |
| `covers screens:` | Optional explicit set |

**Mapping rule:** every `press`/`submit` label in `path` must resolve to exactly one interactive element on the current screen after prior steps. Jared (or the harness) validates this at load.

**Pipeline position (MOAD §2.2):**

```
User stories  →  Puppet Script (this file)  →  Jared sketch  →  user test + rrweb  →  factory
```

One `.puppet` file may contain many `story` blocks for one product slice.

---

## 8. Formal-ish grammar (EBNF-ish)

```
sketch       ::= meta? app? ( stub | screen | dialog | story | theme_decl )*
meta         ::= 'puppet' STRING ( 'version' STRING )?
app          ::= 'app' STRING '{' app_prop* '}'
theme_decl   ::= 'theme' ':' IDENT

stub         ::= 'stub' IDENT '{' stub_row* '}'
stub_row     ::= '{' field_pair ( ',' field_pair )* '}'
field_pair   ::= IDENT ':' ( STRING | NUMBER | PLACEHOLDER )

screen       ::= 'screen' STRING '{' screen_body '}'
dialog       ::= 'dialog' STRING '{' dialog_body '}'
screen_body  ::= ( placement_elem | region_block | hook_line )*
dialog_body  ::= screen_body   # plus implicit xbox unless xbox: none

region_block ::= ( 'region' | 'row' | 'stack' ) IDENT? '{' screen_body '}'
placement_elem ::= elem_kind ( STRING | props | ROLE | position )* hook_suffix? elem_block?

elem_kind    ::= 'navbar' | 'sidebar' | 'toolbar' | 'hero' | 'button' | 'link'
               | 'field' | 'card' | 'list' | 'table' | 'text' | 'label' | 'image'
               | 'avatar' | 'badge' | 'tabs' | 'host-panel' | 'composer'
               | 'xbox' | 'spacer' | 'image'

position     ::= '@top' | '@bottom' | '@left' | '@right' | '@main'
               | '@center' | '@overlay' | '@top-right' | '@bottom-right' | …
props        ::= ( IDENT ':' value )+
value        ::= STRING | NUMBER | IDENT | PLACEHOLDER | list_lit
list_lit     ::= '[' ( STRING ( ',' STRING )* )? ']'

hook_suffix  ::= '->' action ( ';' action )*
elem_block   ::= '{' ( 'on' event '->' action ( ';' action )* | props )* '}'
event        ::= 'press' | 'submit' | 'select' | 'close' | 'change'
action       ::= 'opens' ( 'screen' | 'dialog' ) STRING
               | 'closes' ( 'self' | 'dialog' STRING )
               | 'back' | 'toast' STRING | 'starts' 'host' STRING
               | 'sets' 'field' STRING '=' STRING
               | 'adds' 'to' 'stub' IDENT '{' field_pair* '}'
               | 'goto' 'story' STRING
               | 'no-op'

story        ::= 'story' STRING '{' story_body '}'
story_body   ::= 'entry' ':' 'screen' STRING
                 ( 'path' ':' path_step+ )?
                 ( 'done' ':' ( STRING | '|' text_block ) )?
                 ( 'covers' 'screens' ':' list_lit )?
path_step    ::= '-' ( 'press' | 'submit' | 'select' | 'see' ) rest_of_line
```

**Validation (load-time):**

1. All `opens screen/dialog` targets exist.  
2. Story `path` labels resolve.  
3. ≤1 `@primary` per region (warning if more).  
4. Dialog has close path.  
5. No unknown kinds/actions/roles.  
6. `version` present for freeze consumers (`0.1`).

---

## 9. Worked example A — Membership request (MOAD §2.3)

```puppet
puppet "Legends Membership — Request slice" version "0.1"
theme: soma-sketch

app "Legends" {
  logo: "Legends"
  human-host: "Greg"
  ai-host: "Bill"
}

stub requests {
  { id: "r1", title: "Court-side seat help", status: "In progress" }
  { id: "r2", title: "Intro to alumni group", status: "Waiting" }
  { id: "r3", title: "Billing question", status: "In progress" }
}

screen "Membership Home" {
  navbar top {
    logo: "Legends"
    items: ["Home", "Benefits", "My Requests", "Ask Bill"]
  }
  hero {
    title: "Welcome back, {member.first}"
    subtitle: "3 requests in progress"
  }
  button "New Request" @primary color: blue
    -> opens screen "Request Composer"
  card "Ask Bill" @voice
    -> starts host "Bill"
  list "My Requests" from requests
    -> opens screen "Request Detail"
}

screen "Request Composer" {
  # dialog-like page; xbox still offered as trope for "cancel"
  xbox top-right -> closes self
  field "What do you need?" @multiline @required
  button "Send to Bill" @primary
    -> toast "Bill has your request" ; adds to stub requests { title: "{field}", status: "New" } ; back
}

screen "Request Detail" {
  navbar top { logo: "Legends", items: ["Home", "Benefits", "My Requests", "Ask Bill"] }
  text "Request detail (stub)"
  badge "{status}"
  button "Back" @ghost -> back
}

story "As a member, I want to raise a request and see it move" {
  entry: screen "Membership Home"
  path:
    - press "New Request"
    - submit "Send to Bill"
    - see toast "Bill has your request"
  done: |
    Composer sends to Bill with toast confirmation; list can show a new stub row next iteration.
}
```

---

## 10. Worked example B — Dual-door auth (sketch for §3.2)

```puppet
puppet "SOMA Auth — dual door" version "0.1"
theme: soma-sketch

screen "Sign in" {
  hero {
    title: "Welcome to Legends"
    subtitle: "How are you joining?"
  }
  region main {
    card "I'm a human" @primary
      -> opens screen "Human Auth"
    card "I'm an AI" @ai
      -> opens screen "AI Door"
  }
}

screen "Human Auth" {
  xbox top-right -> opens screen "Sign in"
  button "Continue with Google" @primary -> opens screen "App Home"
  button "Magic link" @secondary -> toast "Check your email (stub)"
  button "Email & password" @ghost -> opens dialog "Password Form"
}

dialog "Password Form" {
  field "Email" @text @required
  field "Password" @text @required
  button "Sign in" @primary -> closes self ; opens screen "App Home"
}

screen "AI Door" {
  xbox top-right -> opens screen "Sign in"
  card "Sign in as myself (AI identity)"
    -> opens screen "AI Self Auth"
  card "Join as representative (OBO)"
    -> opens screen "OBO Pair"
}

screen "AI Self Auth" {
  text "AI presents its own credentials (stub)"
  button "Authenticate" @primary @ai -> opens screen "App Home"
}

screen "OBO Pair" {
  text "Human authenticates first, then issues a pairing token (stub)"
  button "I am the human — continue" @primary -> opens dialog "Pairing Token"
  button "I have a token" @secondary -> opens dialog "Enter Token"
}

dialog "Pairing Token" {
  text "Show this token to your AI. Both remain visible in-session."
  badge "PAIR-7F3K"
  button "Done" @primary -> closes self ; opens screen "App Home"
}

dialog "Enter Token" {
  field "Pairing token" @text @required
  button "Join with human" @primary @ai
    -> toast "Joined with human — OBO active" ; closes self ; opens screen "App Home"
}

screen "App Home" {
  navbar top { logo: "Legends", items: ["Home", "Ask Bill"] }
  text "You're in. Host can greet you by protocol."
  host-panel "Bill" @voice -> starts host "Bill"
}

story "As an AI representative, I want to join under a human's authority" {
  entry: screen "Sign in"
  path:
    - press "I'm an AI"
    - press "Join as representative (OBO)"
    - press "I have a token"
    - submit "Join with human"
    - see toast "Joined with human — OBO active"
    - see screen "App Home"
  done: |
    OBO path reaches App Home with visible confirmation; pairs with Golden Journey pair→OBO step.
}
```

---

## 11. Out of scope for v0 (explicit non-goals)

- Real data binding / auth / network  
- Custom components or free CSS  
- Animation timelines (that is SomaScript / film)  
- Conditional logic beyond stub + `@required` enablement  
- Multi-file imports (single sketch file only)  
- Pixel-perfect layout or responsive breakpoints (theme may soft-adapt)  

---

## 12. Handoff contracts

| Consumer | Uses this file as |
|---|---|
| **Jared (E1)** | Source → clickable sketch runtime |
| **Factory (Fac)** | Build spec: screens, labels, flows, tropes |
| **Capture (Cap)** | Label/id map for rrweb annotation |
| **E2 pipeline** | Story `path` = automated sketch walk smoke |
| **Seam harness** | Version pin `puppet-script/0.1`; unknown-kind fail |

**Bump rule:** additive optional props = `0.1.x`; new kinds/actions or hook semantics = `0.2` + W0-style freeze note.

---

## 13. Freeze checklist (W0)

- [x] Named language + version  
- [x] Token / element types  
- [x] Layout / positioning (regions, not pixels)  
- [x] Standard tropes (nav, sidebar, toolbar, dialog+✕, …)  
- [x] Interaction hooks (events + closed action set)  
- [x] User story → screen mapping  
- [x] Formal-ish grammar  
- [x] Two worked examples  
- [x] Puppet Script ↔ SomaScript = **siblings under SOMA Sketch Family** (no shared parser)

---

*Wave-0 freeze · Puppet Script v0.1 · 2026-07-14 · SOMA redesign program (MOAD §10 E1)*
