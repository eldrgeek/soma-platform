# Revisions, round 2, Gemini 3.1 Pro (High)

### R1: Secure, direct Supabase access for static apps
- **Why:** The plan introduces a broker to replace dangerous service-role keys, but static apps still need to efficiently read their own domain tables. If they only receive opaque "broker tokens," they must proxy all data reads through the broker, defeating Supabase's PostgREST architecture. The broker must instead issue standard, signed Supabase JWTs that respect RLS.
- **Change:**
```diff
@@ -298,3 +298,3 @@
 The broker validates the app credential, binds the request to one `app_id`, validates the person or AI session, and calls narrow database functions.
 
-Static apps receive short-lived app-scoped broker tokens after authorization.
+Static apps receive short-lived Supabase JWTs minted by the broker, containing `app_id` and `app_person_id` claims, permitting direct PostgREST calls to their RLS-protected domain tables.
```

### R2: Principal-scoped idempotency to prevent key collisions
- **Why:** The unique constraint on `action_receipts` is currently `(app_id, action_id, idempotency_key)`. A malicious user could intentionally reuse a guessed idempotency key to deny service to another user trying to execute the same action. Keys must be scoped to the principal making the request.
- **Change:**
```diff
@@ -339,3 +339,3 @@
 
-The receipt table must have a unique constraint on `(app_id, action_id, idempotency_key)`.
+The receipt table must have a unique constraint on `(app_id, action_id, principal_id, idempotency_key)`.
```

### R3: Asynchronous approval flow for outside AIs
- **Why:** The plan correctly requires a "fresh approval token" for consequential actions, but outside AIs interacting via the API lack a screen to display SOMA's confirmation UI. The API must provide a standard mechanism to return an approval URL that the AI can relay to the human.
- **Change:**
```diff
@@ -404,3 +404,3 @@
 | `reversible` | Run and show receipt plus undo when available. | Run only within a live grant and risk ceiling. |
-| `consequential` | Show an effect preview and require confirmation. | Require a fresh approval token bound to the action, version, input hash, principal, and expiry. |
+| `consequential` | Show an effect preview and require confirmation. | Return `403 Forbidden` with an `approval_url`. The AI relays this URL to the human to acquire the token. |
 | `irreversible` | Require explicit final wording and a cool-off step. | Never run from standing authority. Require fresh human approval. |
```

### R4: Permit AI-only writes that are reversible
- **Why:** The plan strictly limits AI-only actions to `risk="observe"`. This prevents AIs from executing helpful background writes (like syncing a calendar or caching a draft) that have no UI equivalent. AI-only writes should be permitted if they are properly bounded to `reversible` risk and generate receipts.
- **Change:**
```diff
@@ -410,3 +410,3 @@
 
-AI-only actions are permitted only when `risk="observe"` and the action exposes machine-useful inspection with no honest visual equivalent.
+AI-only actions are permitted only when the action exposes machine-useful capabilities with no honest visual equivalent, and must be bounded to `observe` or `reversible` risk.
```

### R5: Require explicit SLA for human escalation
- **Why:** "Honest operation" means not letting users assume a human is immediately reading their message if they are not. The host pair capability mandates a human escalation route, but does not require declaring the expected response time, which can lead to broken trust during handoff.
- **Change:**
```diff
@@ -148,3 +148,3 @@
 | Capability | What it does for the person | SOMA principle | What exists today | Target design |
 |---|---|---|---|---|
-| Host pair and human handoff | The person always knows which human and AI host the app and how to reach the human. | Named minds remain accountable. | `SOMA/SOMA-APP-STANDARD.md`; `soma-app-template/src/lib/hostPair.ts`. | Declare both hosts, their roles, and one escalation route in `soma.app.json`. Expose them in the UI and discovery document. |
+| Host pair and human handoff | The person always knows which human and AI host the app and how to reach the human. | Named minds remain accountable. | `SOMA/SOMA-APP-STANDARD.md`; `soma-app-template/src/lib/hostPair.ts`. | Declare both hosts, roles, one escalation route, and an expected response SLA in `soma.app.json`. Expose them in the UI. |

@@ -482,4 +482,5 @@
       "id": "eric",
       "name": "Eric",
       "role": "Human host",
-      "escalation_url": "/contact"
+      "escalation_url": "/contact",
+      "response_sla": "Within 24 hours"
     },
```

### R6: Make manifest hashes verifiable without execution
- **Why:** The plan states that the status endpoint reports the "manifest hash." However, the manifest file is tracked as JSON. Because JSON formatting can change without altering semantics, the hash should explicitly be defined as the SHA-256 of the *canonicalized* JSON (e.g., RFC 8785) so that auto-formatters do not trigger false drift alerts.
- **Change:**
```diff
@@ -588,3 +588,3 @@
 | C19 | Credits name human and AI contributors and record model or substrate when known. |
-| C20 | The live status endpoint reports the tested release SHA, manifest hash, result, and timestamp. |
+| C20 | The live status endpoint reports the tested release SHA, canonicalized manifest hash (RFC 8785), result, and timestamp. |
```
