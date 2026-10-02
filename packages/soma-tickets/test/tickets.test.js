import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  createTickets,
  ticketListStatus,
  ticketRpcErrorMessage,
  ticketUrl,
} from '../src/index.js';

const APP = 'playmaker';

/** @type {Record<string, { data: unknown; error: unknown }>} */
let rpcResults;
/** @type {{ fn: string; args: Record<string, unknown> }[]} */
let rpcCalls;
/** @type {{ table: string; select: string; order: unknown; limit: number } | null} */
let fromCapture;
/** @type {{ data: unknown; error: unknown }} */
let fromResult;

function createFakeSupabase() {
  rpcCalls = [];
  fromCapture = null;
  fromResult = { data: [], error: null };
  return {
    rpc(fn, args) {
      rpcCalls.push({ fn, args });
      const hit = rpcResults[fn] ?? { data: null, error: null };
      return Promise.resolve(hit);
    },
    from(table) {
      const chain = {
        select(cols) {
          fromCapture = { table, select: cols, order: null, limit: 0 };
          return chain;
        },
        order(col, opts) {
          if (fromCapture) fromCapture.order = { col, ...opts };
          return chain;
        },
        limit(n) {
          if (fromCapture) fromCapture.limit = n;
          return Promise.resolve(fromResult);
        },
      };
      return chain;
    },
  };
}

let supabase;
let tickets;

beforeEach(() => {
  rpcResults = {};
  supabase = createFakeSupabase();
  tickets = createTickets({ supabase, app: APP });
});

test('createTickets requires supabase.rpc, from, and app', () => {
  assert.throws(() => createTickets({ supabase: null, app: APP }), /supabase/);
  assert.throws(() => createTickets({ supabase: {}, app: APP }), /supabase/);
  assert.throws(
    () => createTickets({ supabase: { rpc() {} }, app: APP }),
    /from\(\)/,
  );
  assert.throws(() => createTickets({ supabase: { rpc() {}, from() {} }, app: '' }), /app id/);
});

test('create calls ticket_create with personal invitee name', async () => {
  rpcResults.ticket_create = {
    data: [{ token: 'abc123', expires_at: '2026-09-26T00:00:00.000Z' }],
    error: null,
  };
  const out = await tickets.create({
    inviteeName: 'Alex',
    quoteLine: 'Eric asked me to send you this.',
    channel: 'qr',
  });
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, 'ticket_create');
  assert.deepEqual(rpcCalls[0].args, {
    p_app: APP,
    p_invitee_name: 'Alex',
    p_quote_line: 'Eric asked me to send you this.',
    p_channel: 'qr',
    p_invitee_email: null,
  });
  assert.deepEqual(out, { token: 'abc123', expiresAt: '2026-09-26T00:00:00.000Z' });
});

test('create sends null invitee name for shared ticket', async () => {
  rpcResults.ticket_create = {
    data: { token: 'shared', expires_at: '2026-09-26T00:00:00.000Z' },
    error: null,
  };
  await tickets.create({
    quoteLine: 'Anyone with the link.',
    channel: 'link',
  });
  assert.equal(rpcCalls[0].args.p_invitee_name, null);

  rpcCalls.length = 0;
  await tickets.create({
    inviteeName: '   ',
    quoteLine: 'Anyone with the link.',
    channel: 'link',
  });
  assert.equal(rpcCalls[0].args.p_invitee_name, null);
});

test('create passes optional invitee email and per-call app override', async () => {
  rpcResults.ticket_create = {
    data: { token: 't1', expires_at: '2026-01-01T00:00:00.000Z' },
    error: null,
  };
  await tickets.create({
    app: 'other-app',
    inviteeName: 'Sam',
    quoteLine: 'Hi',
    channel: 'link',
    inviteeEmail: 'sam@example.com',
  });
  assert.equal(rpcCalls[0].args.p_app, 'other-app');
  assert.equal(rpcCalls[0].args.p_invitee_email, 'sam@example.com');
  assert.equal(rpcCalls[0].args.p_channel, 'link');
});

test('create throws on rpc error', async () => {
  const err = { message: 'studio membership required' };
  rpcResults.ticket_create = { data: null, error: err };
  await assert.rejects(() => tickets.create({
    inviteeName: 'A',
    quoteLine: 'Q',
    channel: 'qr',
  }), (e) => e === err);
});

test('create throws when rpc returns no token row', async () => {
  rpcResults.ticket_create = { data: [{}], error: null };
  await assert.rejects(
    () => tickets.create({ inviteeName: 'A', quoteLine: 'Q', channel: 'qr' }),
    /ticket_create returned no row/,
  );
});

test('lookup maps open status and fields', async () => {
  rpcResults.ticket_lookup = {
    data: [{
      status: 'open',
      invitee_name: 'Alex',
      inviter_name: 'Mike',
      quote_line: 'One line.',
      has_email: true,
    }],
    error: null,
  };
  const out = await tickets.lookup('tok');
  assert.deepEqual(rpcCalls[0].args, { p_app: APP, p_token: 'tok' });
  assert.deepEqual(out, {
    status: 'open',
    inviteeName: 'Alex',
    inviterName: 'Mike',
    quoteLine: 'One line.',
    hasEmail: true,
  });
});

test('lookup maps used, expired, and unknown statuses', async () => {
  for (const status of ['used', 'expired', 'unknown']) {
    rpcResults.ticket_lookup = {
      data: [{ status, invitee_name: 'N', inviter_name: 'I', quote_line: 'Q', has_email: false }],
      error: null,
    };
    const out = await tickets.lookup('x');
    assert.equal(out.status, status);
  }
});

test('lookup returns unknown when row has no status', async () => {
  rpcResults.ticket_lookup = { data: [{ invitee_name: 'x' }], error: null };
  const out = await tickets.lookup('tok');
  assert.deepEqual(out, {
    status: 'unknown',
    inviteeName: null,
    inviterName: null,
    quoteLine: null,
    hasEmail: null,
  });
});

test('lookup maps has_email null to hasEmail null', async () => {
  rpcResults.ticket_lookup = {
    data: [{ status: 'open', invitee_name: 'A', inviter_name: 'B', quote_line: 'C', has_email: null }],
    error: null,
  };
  const out = await tickets.lookup('t');
  assert.equal(out.hasEmail, null);
});

test('lookup accepts app override on second argument', async () => {
  rpcResults.ticket_lookup = {
    data: [{ status: 'open', invitee_name: 'A', inviter_name: 'B', quote_line: 'C', has_email: false }],
    error: null,
  };
  await tickets.lookup('tok', 'custom-app');
  assert.equal(rpcCalls[0].args.p_app, 'custom-app');
});

test('lookup throws on rpc error', async () => {
  const err = { message: 'boom' };
  rpcResults.ticket_lookup = { data: null, error: err };
  await assert.rejects(() => tickets.lookup('t'), (e) => e === err);
});

test('use returns used, already_used, expired, unknown from rpc string', async () => {
  for (const result of ['used', 'already_used', 'expired', 'unknown']) {
    rpcResults.ticket_use = { data: result, error: null };
    const out = await tickets.use('tok', 'visitor-1');
    assert.equal(out, result);
  }
});

test('use passes app, token, and visitor id without visitor name', async () => {
  rpcResults.ticket_use = { data: 'used', error: null };
  await tickets.use('tok', 'visitor-1');
  assert.deepEqual(rpcCalls[0].args, {
    p_app: APP,
    p_token: 'tok',
    p_visitor_id: 'visitor-1',
  });
  assert.equal(rpcCalls[0].args.p_visitor_name, undefined);
});

test('use sends p_visitor_name only when trimmed name is non-empty', async () => {
  rpcResults.ticket_use = { data: 'used', error: null };
  await tickets.use('tok', 'visitor-1', APP, '  Pat  ');
  assert.deepEqual(rpcCalls[0].args, {
    p_app: APP,
    p_token: 'tok',
    p_visitor_id: 'visitor-1',
    p_visitor_name: 'Pat',
  });

  rpcCalls.length = 0;
  await tickets.use('tok', 'visitor-1', APP, '   ');
  assert.deepEqual(rpcCalls[0].args, {
    p_app: APP,
    p_token: 'tok',
    p_visitor_id: 'visitor-1',
  });
});

test('use accepts app override as third argument', async () => {
  rpcResults.ticket_use = { data: 'used', error: null };
  await tickets.use('tok', 'v', 'alt-app');
  assert.equal(rpcCalls[0].args.p_app, 'alt-app');
});

test('use coerces non-string rpc data and maps garbage to unknown', async () => {
  rpcResults.ticket_use = { data: null, error: null };
  assert.equal(await tickets.use('t', 'v'), 'unknown');

  rpcResults.ticket_use = { data: 'not-a-status', error: null };
  assert.equal(await tickets.use('t', 'v'), 'unknown');
});

test('use throws on rpc error', async () => {
  const err = { message: 'fail' };
  rpcResults.ticket_use = { data: null, error: err };
  await assert.rejects(() => tickets.use('t', 'v'), (e) => e === err);
});

test('listMine queries tickets table and maps rows', async () => {
  fromResult = {
    data: [{
      id: 'uuid-1',
      invitee_name: 'Alex',
      channel: 'qr',
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2026-01-02T00:00:00.000Z',
      used_at: null,
    }],
    error: null,
  };
  const rows = await tickets.listMine(10);
  assert.deepEqual(fromCapture, {
    table: 'tickets',
    select: 'id, invitee_name, channel, created_at, expires_at, used_at',
    order: { col: 'created_at', ascending: false },
    limit: 10,
  });
  assert.deepEqual(rows, [{
    id: 'uuid-1',
    inviteeName: 'Alex',
    channel: 'qr',
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-02T00:00:00.000Z',
    usedAt: null,
  }]);
});

test('listMine defaults limit to 20 and throws on query error', async () => {
  await tickets.listMine();
  assert.equal(fromCapture?.limit, 20);

  fromResult = { data: null, error: { message: 'denied' } };
  await assert.rejects(() => tickets.listMine(), (e) => e.message === 'denied');
});

test('ticketUrl builds origin query link', () => {
  assert.equal(
    ticketUrl('https://play.example.com', 'a/b c'),
    'https://play.example.com/?t=a%2Fb%20c',
  );
});

test('ticketListStatus derives open, used, expired', () => {
  const now = Date.parse('2026-06-01T12:00:00.000Z');
  assert.equal(
    ticketListStatus({ usedAt: '2026-05-01T00:00:00.000Z', expiresAt: '2026-12-01T00:00:00.000Z' }, now),
    'used',
  );
  assert.equal(
    ticketListStatus({ usedAt: null, expiresAt: '2026-05-01T00:00:00.000Z' }, now),
    'expired',
  );
  assert.equal(
    ticketListStatus({ usedAt: null, expiresAt: '2026-12-01T00:00:00.000Z' }, now),
    'open',
  );
});

test('ticketRpcErrorMessage maps known rpc errors', () => {
  assert.equal(
    ticketRpcErrorMessage({ message: 'daily ticket limit reached for user' }),
    'Daily ticket limit reached for today.',
  );
  assert.equal(
    ticketRpcErrorMessage({ message: 'studio membership required' }),
    'Studio membership required.',
  );
  assert.equal(ticketRpcErrorMessage({ message: 'other' }), null);
  assert.equal(ticketRpcErrorMessage('studio membership required'), 'Studio membership required.');
});
