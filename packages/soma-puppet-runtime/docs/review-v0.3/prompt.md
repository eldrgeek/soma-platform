You are on the Brain Trust reviewing a grammar change BEFORE it is built. Reply in plain text, under 900 words.

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
