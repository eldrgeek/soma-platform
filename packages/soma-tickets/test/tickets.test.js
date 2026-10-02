import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createTickets } from '../src/index.js';

const APP = 'playmaker';

/** @type {Record<string, { data: unknown; error: unknown }>} */
let rpcResults;
/** @type {{ fn: string; args: Record<string, unknown> }[]} */
let rpcCalls;

function createFakeSupabase() {
  rpcCalls = [];
  return {
    rpc(fn, args) {
      rpcCalls.push({ fn, args });
      const hit = rpcResults[fn] ?? { data: null, error: null };
      return Promise.resolve(hit);
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

test('createTickets requires supabase.rpc and app', () => {
  assert.throws(() => createTickets({ supabase: null, app: APP }), /supabase/);
  assert.throws(() => createTickets({ supabase: {}, app: APP }), /supabase/);
  assert.throws(() => createTickets({ supabase: { rpc() {} }, app: '' }), /app id/);
});

test('create calls ticket_create with injected app and maps the row', async () => {
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

test('use passes app, token, and visitor id', async () => {
  rpcResults.ticket_use = { data: 'used', error: null };
  await tickets.use('tok', 'visitor-1');
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
