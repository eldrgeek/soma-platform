# @soma/meter

**Usage metering** for SOMA apps: pre-spend cap gate (`gateSpend`), `usage_events` writes (`recordUsage`), and helpers (`usageSummary`, `hasActiveEntitlement`). Pure cap math (`decideSpend`, `CapError`) and pricing (`costUsd`, `PRICING`) are exported for tests and estimates.

Extracted from PlayMaker (`netlify/functions/lib/metering.ts`, `pricing.ts`). PlayMaker will adopt this package in a follow-up bead; this repo ships the engine only.

## Netlify function example

```js
import { createMeter, createSupabaseRestStore, costUsd } from '@soma/meter';

const store = createSupabaseRestStore({
  url: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});
const meter = createMeter({ store, app: 'playmaker', log: console });

export async function handler(event) {
  const user = await requireUser(event);
  const estimated = costUsd('tts_chars', text.length);
  const ctx = await meter.gateSpend(user, { capabilityId: 'stage-read', estimatedUsd: estimated });
  const audio = await synthesize(text);
  await meter.recordUsage(ctx, { capabilityId: 'stage-read', kind: 'tts_chars', provider: 'elevenlabs', amount: text.length });
  return { statusCode: 200, body: audio };
}
```

## Exports

| Export | Role |
|--------|------|
| `createMeter({ store, app?, log? })` | `{ gateSpend, gateSpendForUserId, recordUsage, usageSummary, hasActiveEntitlement }` |
| `createSupabaseRestStore({ url, serviceKey, fetch?, ensureEntitlementRpc? })` | PostgREST store (no env reads) |
| `decideSpend(input)` | Pure cap decision |
| `CapError` | 402-style cap payload (`status`, `payload`) |
| `billingUserId(user)` | OBO principal rule (`actingFor ?? id`) |
| `costUsd(kind, amount, model?)` | Dollar cost at write time |
| `estimateTtsUsd(chars)` | Pre-spend TTS estimate |
| `estimateConvaiUsd(maxDurationSeconds)` | Pre-spend Convai worst-case estimate |
| `estimateLlmUsd(inputChars, maxOutputTokens, model?)` | Pre-spend LLM worst-case estimate |
| `estimateWebSearchUsd(maxUses)` | Pre-spend web_search estimate |
| `PRICING` | Rate table (same numbers as PlayMaker `pricing.ts`) |
| `USAGE_KINDS` | All supported `kind` values |

Inject `store` with `{ resolveStudioId, resolveEntitlement, monthToDateBillable, insertUsageEvent }`. Optional `studioUsageMtd` on the store powers full `usageSummary` rollups.

Reference SQL (already live in the shared project for `playmaker`) lives in [`sql/schema.sql`](sql/schema.sql).

## Tests

```bash
cd packages/soma-meter && npm test
```
