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
