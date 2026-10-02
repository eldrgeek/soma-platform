# @soma/tickets

Front-door **single-use invitation tickets** for SOMA apps: a member mints a token (QR or link), a visitor looks it up and redeems it once. Backed by shared Supabase RPCs `ticket_create`, `ticket_lookup`, and `ticket_use` on `public.tickets` (app-scoped via an `app` column).

Extracted from PlayMaker (`src/lib/tickets.ts`). PlayMaker will adopt this package in a follow-up bead; this repo ships the engine only.

## Exports

| Export | Role |
|--------|------|
| `createTickets({ supabase, app })` | Factory returning `{ create, lookup, use, listMine }` |
| `ticketUrl(origin, token)` | Build `/?t=` invite URL (no `window`) |
| `ticketListStatus(row, nowMs?)` | `open` / `used` / `expired` for a member’s ticket row |
| `ticketRpcErrorMessage(error)` | User-facing copy for known mint RPC failures, or `null` |

JSDoc on `src/index.js` defines `TicketChannel`, lookup/use result types, and `MyTicketRow`.

## Use in an app

```js
import { createClient } from '@supabase/supabase-js';
import { createTickets, ticketUrl } from '@soma/tickets';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const tickets = createTickets({ supabase, app: 'my-app' });

const { token } = await tickets.create({
  quoteLine: 'Come see what we built.',
  channel: 'link',
});
const link = ticketUrl(window.location.origin, token);
const info = await tickets.lookup(token);
const result = await tickets.use(token, visitorId, undefined, guestName);
const mine = await tickets.listMine();
```

Reference SQL (already live in the shared project for `playmaker`) lives in [`sql/schema.sql`](sql/schema.sql).

## Tests

```bash
cd packages/soma-tickets && npm test
```
