# Round 10 revision ledger

| revision id | title | decision | one-line reason |
|---|---|---|---|
| R1 | Legacy-global apps cannot do what M8, M9 and M11 promise | Somewhat agree | The code confirms PlayMaker depends on Supabase sessions and `auth.uid()`; I applied the broker compatibility path and also scoped C12a and its legacy exception to acknowledge the forgeable claims trade-off. |
| R2 | Browser sessions need no refresh credential; an AI partner needs exactly one | Somewhat agree | One online browser session and one refresh family per AI fix the model, but the 30-second replay window now uses a reproducible keyed successor so it does not require stored plaintext. |
| R3 | Golden Journey steps 6 and 8 have nothing to find in a new app | Somewhat agree | The registry and fixture state are required, but I kept the namespace rule in the body and moved M3 fixture seeding to Appendix A. |
| R4 | The C12b canary test breaks the staging run it is part of | Agree | A separate no-broker build tests secret leakage without replacing the credentials needed by the live staging journey. |
| R5 | Nothing can execute an irreversible action after its cool-off | Agree | A post-cool-off person request is the missing execution trigger, and related approval and conformance text now matches it. |
| R6 | Mail to invitees and anonymous visitors has no delivery path; cut it | Somewhat agree | I removed server-side mail and central stranger addresses while preserving client-side `mailto:`, SMS, QR, copy, and share-sheet delivery. |
| R7 | Name the actions the kit itself contributes | Somewhat agree | Reserving and compiling kit actions closes the contract gap, but `soma.contact.reply` is consequential because a delivered reply cannot honestly be undone. |
| R8 | `register` mints credentials for one environment, not both | Agree | Registration is environment-specific, so credentials must come from and be written only for that environment's broker and deploy context. |
| R9 | Remove the v0 leftover `identity.mode` from the canonical example | Agree | The current v0 schema uses `identity_project`, while v1 defines `identity.subject`; the undefined example field had no valid v1 meaning. |

Applied: 4 agree, 5 somewhat, 0 disagree.
