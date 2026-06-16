# SOMA Affordances — drop-in templates

Two proven SOMA affordances, packaged to add to a **new** SOMA site:

1. **Change Log** — an admin-gated review/approval page. Requests + change
   history land in a queue that defaults to **Awaiting Approval**. Each item can
   be **Accepted** (sign-off) or sent back with a **refinement note**. Titles
   open an **inline iframe preview** of the affected page. Breaking changes carry
   a `branch`, turning Accept into **Accept & publish**, which composes an
   approval email to a build agent.
2. **Bill** — the SOMA conversational guide. Tells (answers from a knowledge
   pack), shows (animated walkthroughs), and does (an `actions` registry with a
   reversible→execute / high-risk→approval safety gate). Feedback and a decision
   trace are recorded server-side via two Netlify Functions.

Everything site-specific is a `{{DOUBLE_BRACE}}` placeholder. The shared
soma-guide **engine** (`soma-guide.js`) is NOT copied here — you load it from the
SOMA CDN; this package is only the per-site config + backend + the change-log page.

## What's in this package

```
templates/soma-affordances/
├── README.md                          (this file)
├── INTEGRATION-CHECKLIST.md           copy/paste checklist
├── sql/
│   └── schema.sql                     all 5 tables + RLS, idempotent
├── changelog/
│   └── admin-changelog.template.html  the review/approval page
├── functions/
│   ├── submit-feedback.js             Bill feedback sink (service-role insert)
│   └── log-bill.js                    Bill decision-trace sink (service-role insert)
└── bill/
    ├── soma-guide-config.template.js  per-site Bill config + actions registry
    └── knowledge.template.js          knowledge-pack stub
```

## Prerequisites

- **A Supabase project.** You need its project ref (URL slug), the anon (public)
  key, and the service-role (secret) key.
- **Netlify** (or any host that runs the same Functions signature) for the two
  serverless endpoints. Set the env vars below.
- **SOMA Auth** already wired on the host site: `window.SOMA_AUTH_CONFIG =
  { url, anonKey }` (e.g. `js/soma-auth-config.js`) and `SomaAuth` with
  `init`, `onAuthStateChange`, `getRole`, `signOut` (e.g. `js/soma-auth.js`).
  The change-log page and Bill identity both rely on this.
- A site stylesheet exposing the CSS variables the change-log page uses:
  `--navy`, `--gold`, `--white`, `--border`, `--text-dark`, `--text-medium`,
  `--text-light` (and optionally `--gold-pale`).

### Netlify environment variables

| Variable | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | both functions | `https://{{SUPABASE_PROJECT_REF}}.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | both functions | **secret**; bypasses RLS; never ship to client |
| `OWNER_EMAIL` | submit-feedback | optional; this person's feedback auto-approves |
| `ASSISTANT_ID` | submit-feedback | optional default assistant id, e.g. `acme-bill` |

---

## Add the Change Log in N steps

1. **Create the database tables.** Open the Supabase SQL editor and run
   `sql/schema.sql` (it's idempotent). Replace `{{ADMIN_EMAIL_1}}` /
   `{{ADMIN_EMAIL_2}}` first. This creates `changelog_requests` and
   `changelog_notes` (plus the Bill tables — harmless if you do Bill later).
2. **Copy the page.** Put `changelog/admin-changelog.template.html` into your
   site as `admin-changelog.html` (or wherever your admin pages live).
3. **Replace the placeholders** in that file (see the table below). At minimum:
   `{{SITE_NAME}}`, `{{ADMIN_EMAIL_1}}`, `{{ACCEPT_STORAGE_KEY}}`,
   `{{LOGIN_PATH}}`, `{{PUBLISH_AGENT_EMAIL}}`, `{{SUPABASE_PROJECT_REF}}`.
4. **Confirm the auth + style includes** resolve on your site (the page expects
   `/js/soma-auth-config.js`, `/js/soma-auth.js`, the Supabase UMD bundle, and a
   stylesheet with the CSS variables above). Adjust the `<link>`/`<script>` srcs.
5. **Seed the history (optional).** Replace the single `CHANGELOG` example with
   your real entries, or leave it and let everything flow through the
   Supabase-backed "Submitted Requests" path going forward.
6. **Sign in as an admin and verify:** the page should show the review queue
   defaulting to Awaiting Approval, let you submit a request, add a refinement
   note, and Accept an item. If you see the "set up tables" note, step 1 didn't
   take.

## Add Bill in N steps

1. **Create the database tables** (same `sql/schema.sql` — covers `bill_feedback`,
   `bill_transcripts`, and `soma_profiles`). Skip if you already ran it.
2. **Deploy the two Functions.** Copy `functions/submit-feedback.js` and
   `functions/log-bill.js` into your Netlify functions directory and set the env
   vars in the table above. Verify both respond (a GET returns 405; that's fine).
3. **Add the knowledge pack.** Copy `bill/knowledge.template.js` to your site as
   e.g. `js/knowledge.js`, fill in `window.SiteKnowledge` with real content, and
   replace its placeholders.
4. **Add the Bill config.** Copy `bill/soma-guide-config.template.js` to e.g.
   `js/soma-guide-config.js` and replace its placeholders. Define your `siteMap`,
   at least one walkthrough, and tailor `scopeGuard` to your domain.
5. **Build the `actions` registry** (the "Do" rung). Start from the two worked
   examples. Remember the gate: **reversible actions get `steps` and run after one
   confirm; high-risk actions get `risk: 'high'` and are routed to approval, never
   executed in the browser.** When unsure, mark it high.
6. **Wire the includes on each page, in order:** Supabase UMD →
   `soma-auth-config.js` → `soma-auth.js` → `knowledge.js` →
   `soma-guide-config.js` → the engine `soma-guide.js` (module script, last).
7. **Verify:** open Bill, ask an in-scope question (Tell), trigger a walkthrough
   (Show), and try a reversible action then a high-risk one (Do). Confirm rows
   appear in `bill_transcripts` and that feedback lands in `bill_feedback`.

---

## All placeholders

Replace every one of these across the copied files.

### Shared
| Placeholder | Meaning |
|---|---|
| `{{SITE_NAME}}` | Human site name, e.g. "Acme Membership" |
| `{{SUPABASE_PROJECT_REF}}` | Supabase project ref (URL slug) |
| `{{ADMIN_EMAIL_1}}` | First admin email (allow-listed) |
| `{{ADMIN_EMAIL_2}}` | Second admin email (add/remove in the lists) |

### `sql/schema.sql`
| Placeholder | Meaning |
|---|---|
| `{{ASSISTANT_ID}}` | Default `assistant_id` for `bill_feedback`, e.g. `acme-bill` |
| `{{APP_ID}}` | Example app key in a comment for `soma_profiles` |

### `changelog/admin-changelog.template.html`
| Placeholder | Meaning |
|---|---|
| `{{ADMIN_CONTACT_EMAIL}}` | Email shown on the access-denied screen |
| `{{ACCEPT_STORAGE_KEY}}` | localStorage key for per-browser static accepts, e.g. `acme_changelog_accepted` |
| `{{PUBLISH_AGENT_EMAIL}}` | Build-agent inbox for publish-approval emails, e.g. `claude@acme.com` |
| `{{LOGIN_PATH}}` | Sign-in page path, e.g. `/login.html` |
| `{{ADMIN_HOME_PATH}}` | Admin landing page for the back link, e.g. `/admin.html` |

### `functions/*.js`
| Placeholder | Meaning |
|---|---|
| `{{OWNER_EMAIL}}` | Reviewer whose feedback auto-approves (or set `OWNER_EMAIL` env; leave unreplaced to disable) |
| `{{ASSISTANT_ID}}` | Default assistant id (or set `ASSISTANT_ID` env) |

### `bill/soma-guide-config.template.js`
| Placeholder | Meaning |
|---|---|
| `{{ASSISTANT_ID}}` | Stable id for this Bill, e.g. `acme-bill` |
| `{{APP_ID}}` | Short app key for identity/guide_seen, e.g. `acme` |
| `{{PERSONA_NAME}}` | Guide display name, e.g. `Bill` |
| `{{PERSONA_AVATAR}}` | Emoji/avatar, e.g. `🏀` |
| `{{INFERENCE_URL}}` | Answer endpoint (LLM proxy); remove the line to disable Ask |
| `{{VOICE_AGENT_ID}}` | ElevenLabs agent id; remove the line to disable voice |
| `{{TTS_PROXY_URL}}` | TTS proxy for narration; remove the line to disable |

### `bill/knowledge.template.js`
| Placeholder | Meaning |
|---|---|
| `{{PERSONA_NAME}}` | Guide display name |
| `{{SITE_URL}}` | Public site URL |

---

## Notes & caveats

- **The change-log page writes from the browser with the anon key.** That's safe
  ONLY because the page is admin-gated by SOMA Auth; the RLS in `schema.sql` for
  the two changelog tables is permissive to match. If you expose the page
  unauthenticated, tighten those policies to the admin-email pattern used for the
  Bill tables.
- **Bill feedback/telemetry never write from the browser.** They go through the
  service-role Functions, so the service-role key must live only in Netlify env.
- **The engine isn't in this package.** Load `soma-guide.js` from the SOMA CDN so
  every site gets capability upgrades without a re-copy. See `docs/SOMA-DELIVERY.md`
  for the embedded vs vendored vs iframe trade-offs, and `docs/SOMA-IDENTITY.md`
  for the identity tiers.
