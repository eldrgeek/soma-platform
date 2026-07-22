# @soma/onboard

Join a new person to a SOMA app by invitation.

The QR method that made **Vegas Connect** and **Revolution 1x1** work — someone who already
belongs stands next to you and you're in, in about eight seconds, with no password — plus the
thing those apps couldn't do: **invite by email, text, or social** when the person isn't in
the room.

---

## Why this exists

Vegas Connect and Revolution 1x1 are the same application twice. Measured on the day this
package was extracted:

| File | Difference between the two apps |
|---|---|
| `lib/handlers.js` | 99 diff-lines out of 1,949 |
| `lib/supabase.js` | 156 diff-lines — **every one of them `vc_` → `r1x1_`** |
| `lib/types.js`, `store.js`, `abuse.js`, `http.js`, `codes.js` | **0** |

Two copies of an onboarding engine whose only real difference was a table prefix and a list of
role labels. A fix to one didn't reach the other. Legends Connect, which wants the same
mechanic, has none of it.

So: one engine, parameterized. Change the constants, not the code.

## What it does that the originals didn't

1. **Every channel, one artifact.** QR, copy link, native share sheet, email, SMS, WhatsApp,
   Signal, Telegram, X, LinkedIn, Facebook. Same invitation underneath, one tagged URL each.
2. **Channel attribution.** Each link carries `?ch=<channel>`; an `_invites` table records
   sent → opened → joined. "Does QR actually beat texting?" becomes a query instead of a
   guess.
3. **Public channels are safe by construction.** A link posted to X is stripped of the
   invitee's name, the relationship, *and the claim code* — see [Public links](#public-links).
4. **No npm needed on the client.** The QR encoder is dependency-free, so Legends Connect
   (plain `<script>` tags, no bundler) can use the same share sheet as the React apps.

## Install

```bash
npm install @soma/onboard
```

## Server

```js
// netlify/functions/_onboard.js
import { createOnboard } from '@soma/onboard';
import { createSupabaseStore } from '@soma/onboard/store/supabase';
import { createResendSender } from '@soma/onboard/senders/resend';

const config = {
  appId: 'vegas-connect',
  tablePrefix: 'vc',                       // → vc_members, vc_sessions, …
  brandName: 'Vegas Connect',
  origin: 'https://vegas-connect.netlify.app',
  hostName: 'Greg Foster',
  virtualHostName: "V'Greg",
  purposeOneLiner: 'A network you can only enter through someone who already knows you.',
  roles: ['player', 'chapter_president', 'family', 'vendor', 'sponsor', 'other'],
};

export const onboard = createOnboard(config, {
  store: createSupabaseStore(config),
  sender: createResendSender({ from: 'Vegas Connect <invites@…>' }),  // optional
});
```

Then one function per route, or one splat function for all of them:

```js
// netlify/functions/onboard.js   (with /api/* → /.netlify/functions/onboard/:splat)
import { onboard } from './_onboard.js';
export const handler = onboard.route;
```

### Routes

| Route | Auth | What it does |
|---|---|---|
| `GET invite-info` | public | Who invited me, into what, and is there a claim waiting |
| `POST prepare-invite` | member | Mint an invite → one composed target per channel |
| `POST invite-send` | member | Server-side email send (optional; needs a sender) |
| `POST invite-open` | public | Attribution beacon — never blocks a join |
| `POST one-click-join` | public | Claim a pre-created contact and get a session |
| `POST join` | public | Full form join |
| `GET invitees` | member | My invitees + per-channel funnel |
| `GET session` | member | whoami |

### Schema

```bash
sed 's/{{PREFIX}}/vc/g' node_modules/@soma/onboard/sql/schema.sql.tmpl > migrations/001_onboard.sql
```

Apply it in **your own** Supabase project. Per SOMA-APP-STANDARD §15b apps stay federated —
`vc_members` and `r1x1_members` are different tables in different projects and that is
deliberate. There is no shared member table and adding one is an explicitly declined design.

RLS is enabled with no anon/authenticated policies: the service role only. Member identity is
the invite code plus an opaque session token, not a Supabase auth user — that is what lets
someone join in eight seconds standing in a hotel lobby.

## Client

```html
<script type="module">
  import '@soma/onboard/client/invite-sheet.js';

  const sheet = document.querySelector('soma-invite-sheet');
  sheet.invite = await (await fetch('/api/prepare-invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'Victoria Foster', rel: 'wife', email, phone }),
  })).json();
</script>

<soma-invite-sheet></soma-invite-sheet>
```

It's a custom element, so React apps render it like any DOM node and vanilla apps drop it in.
Light and dark themes come from `prefers-color-scheme`, overridable with `theme="dark|light"`.
It emits `soma-invite-channel` with what each button actually did — which matters, because
`navigator.share` may not exist, the clipboard API needs a secure context, and `sms:` does
nothing on a desktop.

On the landing page, report the open so attribution has a numerator:

```js
import { readInviteParams, reportInviteOpened } from '@soma/onboard/client';
reportInviteOpened('/api', readInviteParams());
```

## Public links

A `claim` code is a one-tap identity handover: it turns its bearer into a specific pre-created
member whose email and phone the inviter already supplied. Posted to X, that is handed to
whoever reads it first.

So public channels (X, LinkedIn, Facebook) get a **bare** link — inviter code and channel tag,
nothing else. `claim`, `for`, `rel` and `invite` are stripped and the `/join` path is rewritten
to the plain invite page. The composed message drops the invitee's name and the relationship
too; composing a name-free tweet is pointless if the URL underneath says
`?for=Victoria%20Foster&rel=wife`.

This is enforced in `channelTargets()` and asserted by two tests. It is not a style preference.

## Sending: handoff vs. server

**Handoff is the default and usually the right answer.** The message is composed here and
handed to the inviter's own mail client, SMS app, or share sheet. Zero infrastructure, no
deliverability problem, and the invitation provably comes *from the person* — which is the
entire social proof of an invitation.

**Server-side send** (`invite-send`, via Resend) exists for when the inviter isn't holding a
device: bulk invites from an admin page, scheduled nudges. Replies are routed back to the
inviter's own address rather than a no-reply void.

Only email is implemented server-side. `invite-send` with `channel: 'sms'` returns a 400 that
says so and points at the handoff, rather than pretending.

## The QR encoder

`client/qr.js` is a self-contained byte-mode encoder, error-correction level M, versions 1–20
(669 bytes; an invite URL is about 90). No dependency, so a bundler-free site can use it.

Level M matches what Vegas Connect shipped: enough recovery to survive glare and a fingerprint
on a phone screen, low enough to keep the modules large.

A wrong QR matrix renders as a perfectly plausible code that no phone can read, and you find
out standing in front of the person you were inviting. So it is verified rather than trusted:
`test/qr.test.js` asserts byte-identical module matrices against the `qrcode` npm package
across ~95 payload lengths spanning every version from 1 to 20, plus ten realistic invite URLs
including non-ASCII. (The reference is pinned to byte mode with an explicit segment — passing
`{ mode: 'byte' }` to `QRCode.create` is silently ignored by that library.)

## Demo

`demo/index.html` runs the **real** engine — the same `createOnboardHandlers()`,
`channelTargets()` and QR encoder a deployed app uses — against the in-memory store, entirely
in the browser. It walks prepare → receive-by-channel → open → join and shows the attribution
table filling in.

```bash
npx http-server packages/soma-onboard -p 4181 -c-1
# → http://localhost:4181/demo/
```

The engine uses Web Crypto rather than `node:crypto` specifically so this is possible: the
thing being demonstrated is the shipped code, not a mock of it.

## Tests

```bash
npm test
```

27 engine tests + 6 QR tests. The engine suite covers the full lifecycle, both join paths,
duplicate-person prevention, consent, rate limiting, Host-header spoofing, and — the ones
worth reading — PII containment on every public seam and claim-code containment on public
channels.

## Adopting it in an existing app

The three source apps are not yet migrated onto this package; it was extracted from them, and
retrofitting a live app is a separate, deliberate change. Rough order when you do:

1. Add the `_invites` table (additive — nothing else in the schema changes).
2. Replace `netlify/functions/lib/{handlers,store,codes,http,auth,abuse}.js` with a
   `createOnboard()` call. Keep app-specific handlers (network graph, interviews, quests)
   where they are — this package owns onboarding, not the whole app.
3. Swap the bespoke QR canvas for `<soma-invite-sheet>`.
4. Keep the existing table prefix. Codes and sessions already in the wild keep working: the
   alphabet, the code length, and the session-token shape are unchanged from vegas-connect on
   purpose.

---

_Extracted 2026-07-22 by Mike Wolf + Claude Opus 4.8 from `vegas-connect`, `r1x1-app`, and the
onboarding gap in `legends-connect`._
