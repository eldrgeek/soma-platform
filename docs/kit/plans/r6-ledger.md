# Round 6 revision ledger

| Revision id | Title | Decision | One-line reason |
|---|---|---|---|
| R1 | Contract sync must follow Netlify deploy contexts, survive rollback, and run journeys on the registered alias | Agree | Context-scoped credentials, retained contract hashes, a vendored sync command, and testing the fixed branch alias resolve real deploy-preview, rollback, and tool-availability failures. |
| R2 | The Guide needs a kit mode; its existing hooks would post names and email addresses as concepts | Somewhat agree | Added kit mode, corrected the inventory to 33 Guide-loading pages plus two shared data/config files, and required hash/nonce CSP handling instead of blanket inline-style permission. |
| R3 | Define the Ask interface; today's Guide sends client-assembled context and page text | Somewhat agree | Added the typed, server-grounded interface and adversarial checks, but replaced the incorrect 10-second timeout claim with Netlify's platform execution limit. |
| R4 | Authorize inside the same broker call and transaction that acts | Agree | One transactional broker invocation closes the revocation race for database work and removes an unnecessary authorization round trip. |
| R5 | Say where the broker runs and how it reaches the database | Somewhat agree | Specified hosting, pooling, and the broker role, but isolated the Supabase Auth-admin secret on a separate site because Functions on one Netlify site share environment access. |
| R6 | M3 must remove every shared credential the generator emits, not only two names in the template | Somewhat agree | Removed all verified shared credentials, while allowing required non-secret Netlify build metadata and restricting the release key to the vendored build-time sync script. |
| R7 | Legends publishes its repository root, including server code; fix the publish directory before vendoring kit code into it | Agree | `publish = "."` and the repository layout make the exposure structural, so a public-only output directory and a live forbidden-path gate are required first. |
| R8 | Immutable Guide versions need retained files, a clean tree, and CORS, or SRI pinning fails | Somewhat agree | Added retention, hash, and CORS/SRI requirements, but made the clean-tree check run before the script mutates artifacts and did not rely on the stale claim that two current dist files are untracked. |
| R9 | Make the app-schema isolation a checked post-condition, not a property of good migrations | Agree | Default privileges and an in-transaction catalog audit turn schema-isolation conventions into a rollback-enforced migration gate. |
| R10 | Defend device-code pairing against phishing | Agree | Manual code entry, explicit anti-phishing copy, attempt limits, short expiry, and out-of-band notification materially reduce and expose consent phishing. |
| R11 | Close the other two ticket RPCs and make redemption create the membership | Agree | The current lookup/use RPCs are callable by browser roles and redemption does not create membership, so all three broker-only v2 operations are necessary. |
| R12 | `@soma/meter` is PlayMaker-shaped; give pairwise apps a broker store and per-app tables | Somewhat agree | Added the broker store and per-app tables, but modeled a typed billing subject instead of overloading `app_person_id` to represent both people and the app operator. |
| R13 | Make the human handoff deliver a message, not just display a link | Somewhat agree | Added the contact route and delivery proof, plus a durable idempotent notification queue so a committed contact cannot be lost when external notification fails. |
| R14 | The two-week slice must run C16 and C17, which its own must-not-cut list depends on | Agree | The slice already promises receipts, undo, and broker-outage behavior, so C16, C17, C12b, and C24 must run in that release. |
| R15 | Write receipts for AI reads, not for every read a person makes | Agree | Auditing AI-mediated reads preserves the useful accountability signal without write-amplifying ordinary person-driven UI reads. |
| R16 | Remove the duplicated undo requirement from C4 | Agree | C7 already owns and round-trip tests undo, so removing the duplicate avoids divergent checks and duplicate failures. |

Applied: 9 agree, 7 somewhat, 0 disagree.
