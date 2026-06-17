# Bill / SOMA — Identity State Model

*Draft for review. How Bill recognizes who he's talking to, what he says, what's unlocked, and where it's stored.*

## The idea in one line

Identity is a **progressive ladder** the anonymous visitor climbs (present → named → identified → registered → logged in). A visitor who arrives already **logged in** skips the whole ladder — Bill just greets them. Underneath, four **facets** combine to produce a state.

## Four underlying facets

| Facet | Values | Stored | Verified? |
|---|---|---|---|
| **name** | none · declined · `<name>` | localStorage (device) | n/a |
| **identity (email)** | none · `<claimed email>` · linked SOMA id | localStorage | **No** — claimed, not proven |
| **account** | none · exists | derived (does a SomaAuth account match the email?) | — |
| **session (login)** | none · logged-in as `<account>` | **sessionStorage** (this tab) + SomaAuth | **Yes** |

The trust boundary: **only an authenticated session unlocks member content.** A typed email is a soft signal for personalization and follow-up, never a key.

## The states

| State | How reached | What Bill knows | What Bill says | What's unlocked |
|---|---|---|---|---|
| **present** | On the site, no name yet (cookie may exist, but no name) | A device id only | *"I'm Bill. Have we met before?"* (honest — could be a new device for someone he knows) | General info, site tour, ask questions, anonymous bug/feature reports |
| **named** | Gave a name — or assigned `unnamed user` after declining twice | A display name | *"Hi, Greg."* + his role on the team | Above + personalized greeting; recognized next visit on this device |
| **identified** | Gave an email (claimed, unverified) → attempt to link a SOMA identity | Name + claimed email | Invites identifying/registering; can tie their reports to them | Above + cross-session recognition; **reports linked to them so Greg can follow up**; knowledge of how SOMA assistants work. **No member data.** |
| **registered** | A real SomaAuth account exists for that email | An account exists | *"Looks like you have an account — want to log in?"* | Above + can prompt to authenticate. Still no member data until logged in. |
| **logged in** | Active SomaAuth session **in this tab** | Verified account, name, email, role | *"Hi, Greg."* — skips the whole ladder | Full member access per site auth; role-gated actions (admin for Greg/Mike) |

## The opening flow (anonymous path)

1. **No name on file →** *"I'm Bill. Have we met before?"*
2. **"No" (or just a question) →** ask for a name, *or* a name to call them by.
3. **Won't give one →** after ~2 turns, assign **`unnamed user`** and set a **`name_declined`** flag so Bill doesn't re-ask every visit. (*"I'll just call you 'friend' for now — tell me your name anytime."*)
4. **Got a name →** *"Hi, Name."* + Bill introduces his role, then invites them to **identify** (email → SOMA recognition) or **register** (email+password, magic link, Google, etc.).
5. **"Yes, we've met" / gives email →** jump toward **identified**; if it matches an account, offer login.

`name_declined` is the key addition: it distinguishes *not yet named* from *chose not to* — so Bill asks once, not forever.

## Storage model (the subtle part)

- **localStorage** = the device's **home / default identity**. Shared across tabs, survives restarts. Holds: anon id (the cookie), name, `name_declined`, claimed email / SOMA id, `met`, last-seen. This is "who this browser usually is."
- **sessionStorage** = **this tab's active identity**, when it differs from the home default. Holds the per-tab login session. **Overrides localStorage for that tab only.**
- **SomaAuth session** = the real authentication (Supabase). Source of truth for *logged in*.

### Resolution on each tab load

1. **SomaAuth session active in this tab?** → *logged in*; identity = the account. (Skip the ladder.)
2. **Else sessionStorage has an active identity?** → use it (a tab that logged into a different account, etc.). Overrides localStorage.
3. **Else seed from localStorage** → the home identity (named / identified / registered carry over; **not** auto logged-in).
4. **Else nothing** → *present* → run the "have we met?" opener.

So a **new tab inherits name/identity/registered from localStorage but is never auto-logged-in** — login is per-tab by design.

## Multi-account & the revert rule

When a user **logs into a different account** than the home default (localStorage):

- Bill **asks**: *"Want to make this your default on this browser, or just for this tab?"*
- **"This browser"** → update localStorage to the new account (new home default).
- **"Just this tab"** → localStorage stays as the old home identity; this tab runs as the new account via sessionStorage. **Revertible** — close the tab or ask Bill to switch back.

localStorage is a *sticky primary*; per-tab logins don't silently change it. This is the deliberate, slightly-unconventional choice (vs. "most recent login wins everywhere").

## Bill's metaknowledge (he can talk about all of this)

Bill knows his own identity state and can answer/act on it:

- *"What do you know about me?"* → name, whether identified/registered, whether logged in, which account this browser defaults to.
- *"Am I logged in?" / "Whose browser is this set to?"*
- *"Reset the cookies" / "Forget me"* → clear localStorage (+ sessionStorage) identity → back to *present*.
- *"Switch back to my default"* → drop the per-tab override.
- *"How does SOMA identity work?"* → explain the ladder and storage in plain terms.

## Logout, reset, privacy

- **Logout** drops the session (*logged in* → false) but **keeps** name/email in localStorage — you're still "Greg" on this device, just not authenticated.
- **Reset / forget me** clears the identity facets (configurable: name only, or everything).
- Claimed email is PII held in localStorage with the user's consent (they gave it for recognition/follow-up); it is never treated as authenticated and never gates member data.

## How this connects to existing work

- **Intake:** once Bill knows a (claimed) email, bug/feature reports auto-fill `requester_email` — closing the loop on queue items that currently arrive with no requester.
- **Two identity systems reconciled:** Bill's cookie-ladder is the light layer; SomaAuth accounts are the heavy layer. "identified → registered → logged in" is exactly "email matches/creates a SomaAuth account, then authenticates."
- **Per-app now, cross-site later:** today everything is keyed to the per-origin anon id. The "SOMA identity" link is the future cross-site upgrade (a shared identity that follows the email across SOMA apps) — the model is built so that swap doesn't change Bill's behavior.

## Cross-app login (the SOMA-identity payoff)

The point of a SOMA identity is **reducing friction** — registering and switching accounts is slow. So the north star is: if you're already authenticated with SOMA on another app, you shouldn't have to log in again here.

Rules:

- **Recognize and offer — never silent.** *"You're signed in as Greg on [other SOMA app] — continue as Greg here?"* → one tap. Same consent principle as changing the browser default; protects shared/public devices from surprise logins.
- **Two routes to *logged in*, both verified:** (a) authenticate directly here (SomaAuth), or (b) consented carry-over of an identity that authenticated with SOMA elsewhere.
- **A typed email is never one of them.** Claimed email stays *identified / unverified* and unlocks no member data.
- True cross-app session sharing needs the shared SOMA identity backend → it's the **"cross-site later"** upgrade. Today: per-app recognition; the carry-over is stubbed behind that.

## Resolved decisions

1. **Default-account semantics** — localStorage is a sticky primary; per-tab logins ask before changing it.
2. **"Identified" payoff = friction reduction**, leading to one-tap cross-app login (above). The incentive to hand over an email is "I'll recognize you next time, tie your requests to you, and get you in faster" — not member data, which always requires login.
3. **Logout scope** — keep **both** name and claimed email in localStorage; drop only the session. You stay "Greg" on the device, just not authenticated.
4. **Text/voice parity** — the capture + metaknowledge flow works **identically** typed or spoken (today only voice has `set_identity`; text path is the first build item).
