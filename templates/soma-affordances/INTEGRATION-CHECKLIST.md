# SOMA Affordances — integration checklist

Copy/paste this into a ticket and check off as you go.

## 0. Prerequisites
- [ ] Supabase project created; have project ref, anon key, service-role key
- [ ] Netlify (or equivalent) site connected
- [ ] SOMA Auth wired: `window.SOMA_AUTH_CONFIG = { url, anonKey }`
- [ ] `SomaAuth` available: `init`, `onAuthStateChange`, `getRole`, `signOut`
- [ ] Site stylesheet exposes `--navy --gold --white --border --text-dark --text-medium --text-light`

## 1. Database (both affordances)
- [ ] Replace `{{ADMIN_EMAIL_1}}` / `{{ADMIN_EMAIL_2}}` (and `{{ASSISTANT_ID}}`, `{{APP_ID}}`) in `sql/schema.sql`
- [ ] Run `sql/schema.sql` in the Supabase SQL editor (idempotent)
- [ ] Confirm 5 tables exist with RLS enabled: `changelog_requests`, `changelog_notes`, `bill_feedback`, `bill_transcripts`, `soma_profiles`

## 2. Netlify env vars
- [ ] `SUPABASE_URL = https://<ref>.supabase.co`
- [ ] `SUPABASE_SERVICE_ROLE_KEY = <secret>`
- [ ] `OWNER_EMAIL` (optional — auto-approve reviewer)
- [ ] `ASSISTANT_ID` (optional default)

## 3. Change Log page
- [ ] Copy `changelog/admin-changelog.template.html` → `admin-changelog.html`
- [ ] Replace: `{{SITE_NAME}}` `{{SUPABASE_PROJECT_REF}}` `{{ADMIN_EMAIL_1}}` `{{ADMIN_EMAIL_2}}` `{{ADMIN_CONTACT_EMAIL}}` `{{ACCEPT_STORAGE_KEY}}` `{{PUBLISH_AGENT_EMAIL}}` `{{LOGIN_PATH}}` `{{ADMIN_HOME_PATH}}`
- [ ] Fix the auth/style `<script>` and `<link>` srcs for your site
- [ ] Replace or remove the `CHANGELOG` seed example; swap the placeholder `<nav>`
- [ ] Sign in as admin → review queue loads, defaults to **Awaiting Approval**
- [ ] Submit a test request → appears under Awaiting Approval
- [ ] Add a refinement note → persists (reload to confirm)
- [ ] Accept an item → moves to Accepted; (breaking item shows **Accept & publish**)
- [ ] Title/“On:” link opens the inline iframe preview

## 4. Bill — backend
- [ ] Copy `functions/submit-feedback.js` and `functions/log-bill.js` to the functions dir
- [ ] Replace `{{SUPABASE_PROJECT_REF}}` `{{OWNER_EMAIL}}` `{{ASSISTANT_ID}}` (or rely on env)
- [ ] Deploy; `GET` each function returns 405 (alive); missing service key returns 503

## 5. Bill — knowledge pack
- [ ] Copy `bill/knowledge.template.js` → `js/knowledge.js`
- [ ] Fill `window.SiteKnowledge` with real content (org / site sections / SOMA)
- [ ] Replace `{{SITE_NAME}}` `{{PERSONA_NAME}}` `{{SITE_URL}}`

## 6. Bill — config
- [ ] Copy `bill/soma-guide-config.template.js` → `js/soma-guide-config.js`
- [ ] Replace: `{{SITE_NAME}}` `{{ASSISTANT_ID}}` `{{APP_ID}}` `{{PERSONA_NAME}}` `{{PERSONA_AVATAR}}` `{{INFERENCE_URL}}` `{{VOICE_AGENT_ID}}` `{{TTS_PROXY_URL}}`
- [ ] Define real `siteMap` entries
- [ ] Write at least one `walkthrough` for the Show rung
- [ ] Tailor `scopeGuard.deflect` + `scopeGuard.contextNote` to your domain
- [ ] Build `actions`:
  - [ ] reversible actions have `steps`, NO `risk` → execute after one confirm
  - [ ] high-risk actions have `risk: 'high'`, NO `steps` → routed to approval
  - [ ] when unsure, mark it `high`
- [ ] Remove `identity`, `voiceAgentId`, `ttsProxyUrl`, or `inferenceUrl` lines for any feature you don't want

## 7. Page includes (order matters, on every page Bill should appear)
- [ ] `<script src=".../@supabase/supabase-js@2/.../supabase.js">` (if using identity)
- [ ] `<script src="/js/soma-auth-config.js">`
- [ ] `<script src="/js/soma-auth.js">`
- [ ] `<script src="/js/knowledge.js">`
- [ ] `<script src="/js/soma-guide-config.js">`
- [ ] `<script type="module" src=".../soma-guide.js">`  ← engine, LAST

## 8. End-to-end verify
- [ ] **Tell:** ask an in-scope question → grounded answer; off-topic → deflect
- [ ] **Show:** trigger a walkthrough by keyword → cursor/highlight animates
- [ ] **Do (reversible):** confirm once → steps run on the page
- [ ] **Do (high-risk):** Bill routes to approval, does NOT execute
- [ ] Rows land in `bill_transcripts`; feedback lands in `bill_feedback`
- [ ] Signed-in returning user gets the quiet shell (identity working)
