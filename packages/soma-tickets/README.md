# @soma/tickets

Front-door **single-use invitation tickets** for SOMA apps: a member mints a token (QR or link), a visitor looks it up and redeems it once. Backed by shared Supabase RPCs `ticket_create`, `ticket_lookup`, and `ticket_use` on `public.tickets` (app-scoped via an `app` column).

Extracted from PlayMaker (`src/lib/tickets.ts`). PlayMaker will adopt this package in a follow-up bead; this repo ships the engine only.

## Use in an app

```js
import { createClient } from '@supabase/supabase-js';
import { createTickets } from '@soma/tickets';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const tickets = createTickets({ supabase, app: 'my-app' });

const { token, expiresAt } = await tickets.create({
  inviteeName: 'Alex',
  quoteLine: 'Come see what we built.',
  channel: 'link',
});
const info = await tickets.lookup(token);
const result = await tickets.use(token, visitorId);
```

Reference SQL (already live in the shared project for `playmaker`) lives in [`sql/schema.sql`](sql/schema.sql).

## Tests

```bash
cd packages/soma-tickets && npm test
```
