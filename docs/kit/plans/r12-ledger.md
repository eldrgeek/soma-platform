# Round 12 revision ledger

| Revision id | Title | Decision | Level | One-line reason |
|---|---|---|---|---|
| R1 | Close cross-app capture through PostgreSQL's temporary schema | Agree | architecture | PostgreSQL resolves unlisted `pg_temp` first and the broker uses a transaction pool, so explicit ordering, schema qualification, and the adversarial probe close a real cross-app trust-boundary gap. |
| R2 | Make the migration runner unable to leave the app's role | Somewhat agree | architecture | The escape is real, but temporarily enabling login on the durable owner lets it change its own password; the plan instead uses a disposable privilege-empty login that can only `SET ROLE` to the no-login owner. |
| R3 | A grant never discloses a person to an app they have not accepted | Agree | architecture | Requiring usable membership and current consent keeps wildcard grants and device approval from bypassing first-visit disclosure, invitation admission, or per-app forget. |
| R4 | Bind a legacy app's consent to the account that is signed in there | Somewhat agree | architecture | The account-binding check is necessary, but the broker—not the app start Function—validates the Supabase token so the app gains no additional identity credential or validation boundary. |
| R5 | New PlayMaker AI partners need an Auth user after M11 | Agree | architecture | PlayMaker currently creates each `is_ai` participant through the Auth Admin API, so a broker queue and outbound-only worker are required after the HTTP sites lose that secret. |
| R6 | Refuse broker calls from Netlify deploy permalinks | Agree | architecture | Registered-host enforcement prevents an otherwise valid installation credential in an honest stale deploy from serving bearer calls on its permanent deploy URL. |
| R7 | Carry a pending invitation on the broker transaction, not in the URL | Agree | architecture | The existing flow had no storage behind its opaque handle; binding the keyed ticket hash to the authorization transaction completes the server-side chain without putting authority in the URL. |
| R8 | Cut guest admission from v2 tickets | Agree | product | V1 defines no guest principal for grants, receipts, limits, or erasure, so signed-in-only v2 admission is the honest product boundary while PlayMaker keeps its legacy guest path. |
| R9 | Security notices cannot be muted, and host notices cannot be flooded | Agree | product | Pairing alerts must survive app mute and caps, while anonymous contact mail needs its own quota and digest behavior to protect the host and provider allowance. |
| R10 | Name the key behind every keyed hash | Somewhat agree | architecture | A named key is required, but the plan uses a token-hash master with domain-separated purpose keys and bounded current/previous rotation instead of one undifferentiated HMAC key. |
| R11 | Give PlayMaker's runtime role named table grants, never `authenticated` | Agree | architecture | PlayMaker's policies omit role clauses and already key on `auth.uid()`, so named table grants preserve them without importing the shared schema's broad legacy role grants. |
| R12 | Let C10 allow the legacy apps' own sign-in session | Somewhat agree | detail | The exception is necessary, and code shows Legends also stores tab-coordination values, so C10 now permits only the manifest-declared auth session and adapter keys rather than the session token alone. |
| R13 | M11's secret scan must not exempt the broker | Agree | detail | The broker is HTTP-addressable and must not hold the Auth Admin secret; only the outbound-only scheduled worker site is a valid site exception. |
| R14 | Fix the example manifest so it passes its own checks | Agree | detail | The exact app namespace and per-app forget route remove two self-contradictions from the normative example. |
| R15 | Give C12b the provider key names it checks | Agree | architecture | Declaring `secret_env` makes the provider-secret allowlist executable and keeps credential admission tied to an approved data flow. |
| R16 | One browser identity client, one server identity client | Agree | architecture | Assigning browser identity to `@soma/signin` and Function/broker integration to `@soma/identity` removes an ambiguous duplicate component boundary. |
| R17 | The interim key split belongs to `kit-steward` | Agree | detail | The seat holding `key:supabase-management` must create the keys, and the already-landed Legends publish fix should not be described as pending work. |

Applied: 13 agree, 4 somewhat, 0 disagree.
