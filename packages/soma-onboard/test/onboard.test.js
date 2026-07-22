import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { defineOnboardConfig, tables } from '../src/config.js';
import { createOnboardHandlers } from '../src/handlers.js';
import { createMemoryStore } from '../src/store/memory.js';
import { createRecordingSender } from '../src/senders/resend.js';
import { resetAbuseGuards } from '../src/abuse.js';
import { uniqueCode } from '../src/codes.js';
import { parseInviteUrl } from '../src/invite-link.js';

const CONFIG = {
  appId: 'test-connect',
  tablePrefix: 'tc',
  brandName: 'Test Connect',
  origin: 'https://test-connect.netlify.app',
  hostName: 'Sam Alvarez',
  purposeOneLiner: 'A network you can only enter through someone who knows you.',
  roles: ['player', 'family', 'other'],
};

let store;
let sender;
let api;
let cfg;

beforeEach(() => {
  resetAbuseGuards();
  store = createMemoryStore();
  sender = createRecordingSender();
  cfg = defineOnboardConfig(CONFIG);
  api = createOnboardHandlers(cfg, { store, sender });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const body = (res) => JSON.parse(res.body);

function req(method, { headers = {}, query = null, json = null } = {}) {
  return {
    httpMethod: method,
    headers: { 'x-forwarded-for': '203.0.113.7', ...headers },
    queryStringParameters: query,
    body: json ? JSON.stringify(json) : null,
  };
}

async function seedInviter(overrides = {}) {
  const code = await uniqueCode(store, cfg.codeLength);
  const member = await store.createMember({
    code,
    name: 'Sam Alvarez',
    email: 'greg@example.com',
    phone: '+1 702 555 0100',
    role: 'player',
    status: 'active',
    consent_at: new Date().toISOString(),
    ...overrides,
  });
  const session = await store.createSession(member.id);
  return { member, token: session.token, auth: { authorization: `Bearer ${session.token}` } };
}

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

test('config rejects a table prefix that would be unsafe in SQL', () => {
  assert.throws(() => defineOnboardConfig({ ...CONFIG, tablePrefix: 'vc; drop table' }), /tablePrefix/);
  assert.throws(() => defineOnboardConfig({ ...CONFIG, tablePrefix: 'VC' }), /tablePrefix/);
  assert.throws(() => defineOnboardConfig({ ...CONFIG, origin: 'not-a-url' }), /origin/);
  assert.throws(() => defineOnboardConfig({ appId: 'x' }), /missing required field/);
});

test('table names are derived from the prefix, never hardcoded', () => {
  assert.deepEqual(tables(defineOnboardConfig(CONFIG)), {
    members: 'tc_members',
    sessions: 'tc_sessions',
    connections: 'tc_connections',
    invites: 'tc_invites',
  });
  assert.equal(tables(defineOnboardConfig({ ...CONFIG, tablePrefix: 'r1x1' })).members, 'r1x1_members');
});

// ---------------------------------------------------------------------------
// prepare-invite
// ---------------------------------------------------------------------------

test('prepare-invite returns one tagged URL per enabled channel', async () => {
  const inviter = await seedInviter();

  const res = await api['prepare-invite'](
    req('POST', {
      headers: inviter.auth,
      json: { name: 'Dana Okonkwo', rel: 'wife', email: 'vic@example.com', phone: '+17025550111' },
    })
  );
  assert.equal(res.statusCode, 201);
  const out = body(res);

  assert.equal(out.invitee_name, 'Dana Okonkwo');
  assert.equal(out.relationship, 'wife');
  assert.equal(out.one_click_ready, true, 'email + phone on file means one-click is possible');
  assert.ok(out.claim_code, 'a claimable member should have been pre-created');

  const ids = out.channels.map((c) => c.id);
  assert.deepEqual(ids, cfg.channels, 'every configured channel gets a target');

  for (const target of out.channels) {
    const parsed = parseInviteUrl(target.url);
    assert.equal(parsed.channel, target.id, `${target.id} link must be tagged ch=${target.id}`);
    assert.equal(parsed.inviterCode, inviter.member.code);

    if (target.public) {
      // See stripForPublic(): a claim code in a public post is a one-tap
      // identity handover to whoever reads it first.
      assert.equal(parsed.claimCode, undefined, `${target.id} must not carry a claim code`);
      assert.equal(parsed.relationship, undefined, `${target.id} must not carry the relationship`);
      assert.equal(parsed.inviteeName, undefined, `${target.id} must not carry the invitee name`);
    } else {
      assert.equal(parsed.claimCode, out.claim_code);
      assert.equal(parsed.relationship, 'wife');
    }
  }
});

test('a public invite link is bare — no claim, no name, no relationship, no /join', async () => {
  const inviter = await seedInviter();
  const out = body(
    await api['prepare-invite'](
      req('POST', {
        headers: inviter.auth,
        json: { name: 'Dana Okonkwo', rel: 'wife', email: 'vic@example.com', phone: '+17025550111' },
      })
    )
  );

  const x = out.channels.find((c) => c.id === 'x');
  const url = new URL(x.url);
  assert.equal(url.pathname, `/j/${inviter.member.code}`, 'public links go to the plain invite page');
  assert.deepEqual([...url.searchParams.keys()], ['ch']);

  // And the claim code must genuinely be unusable from that link.
  assert.ok(out.claim_code, 'precondition: a claim code exists');
  assert.ok(!x.url.includes(out.claim_code));
  assert.ok(!`${x.subject} ${x.body}`.includes(out.claim_code));
});

test('prepare-invite composes real, openable hrefs for each channel', async () => {
  const inviter = await seedInviter();
  const res = await api['prepare-invite'](
    req('POST', {
      headers: inviter.auth,
      json: { name: 'Marcus Bell', rel: 'teammate', email: 'marcus@example.com', phone: '702-555-0123' },
    })
  );
  const targets = Object.fromEntries(body(res).channels.map((c) => [c.id, c]));

  assert.match(targets.email.href, /^mailto:marcus%40example\.com\?/);
  assert.match(targets.email.href, /subject=Sam\+Alvarez\+invited\+you\+to\+Test\+Connect/);
  assert.match(targets.sms.href, /^sms:7025550123\?&body=/);
  assert.match(targets.whatsapp.href, /^https:\/\/wa\.me\/7025550123\?text=/);
  assert.match(targets.telegram.href, /^https:\/\/t\.me\/share\/url\?/);
  assert.match(targets.x.href, /^https:\/\/twitter\.com\/intent\/tweet\?/);
  assert.match(targets.linkedin.href, /linkedin\.com\/sharing\/share-offsite/);
  assert.match(targets.facebook.href, /facebook\.com\/sharer/);

  assert.equal(targets.qr.kind, 'render');
  assert.equal(targets.copy.kind, 'clipboard');
  assert.equal(targets.native.kind, 'native');
});

test('public channels never leak the invitee name or the relationship', async () => {
  const inviter = await seedInviter();
  const res = await api['prepare-invite'](
    req('POST', { headers: inviter.auth, json: { name: 'Dana Okonkwo', rel: 'wife' } })
  );

  for (const target of body(res).channels) {
    if (!target.public) continue;
    const haystack = `${target.subject} ${target.body} ${target.href || ''}`;
    assert.ok(
      !/Dana/i.test(haystack),
      `${target.id} must not name the invitee — it is visible to strangers`
    );
    assert.ok(!/\bwife\b/i.test(haystack), `${target.id} must not broadcast the relationship`);
  }
});

test('private channels do address the invitee by name', async () => {
  const inviter = await seedInviter();
  const res = await api['prepare-invite'](
    req('POST', { headers: inviter.auth, json: { name: 'Dana Okonkwo', rel: 'wife' } })
  );
  const email = body(res).channels.find((c) => c.id === 'email');
  assert.match(email.body, /^Dana —/m);
  assert.match(email.body, /invited you to join Test Connect as a wife\./);
});

test('prepare-invite without contact details skips the claim member', async () => {
  const inviter = await seedInviter();
  const out = body(
    await api['prepare-invite'](req('POST', { headers: inviter.auth, json: { name: 'Sam Rivers' } }))
  );
  assert.equal(out.claim_code, null);
  assert.equal(out.one_click_ready, false);
  assert.equal(parseInviteUrl(out.url).inviteeName, 'Sam Rivers');
});

test('prepare-invite rejects bad input and unauthenticated callers', async () => {
  const inviter = await seedInviter();
  assert.equal((await api['prepare-invite'](req('POST', { json: { name: 'X' } }))).statusCode, 401);
  assert.equal(
    (await api['prepare-invite'](req('POST', { headers: inviter.auth, json: { name: 'A' } }))).statusCode,
    400
  );
  assert.equal(
    (await api['prepare-invite'](
      req('POST', { headers: inviter.auth, json: { name: 'Real Person', rel: '<script>' } })
    )).statusCode,
    400
  );
  assert.equal(
    (await api['prepare-invite'](
      req('POST', { headers: inviter.auth, json: { name: 'Real Person', role: 'admin' } })
    )).statusCode,
    400
  );
});

// ---------------------------------------------------------------------------
// invite-info
// ---------------------------------------------------------------------------

test('invite-info tells an invitee who invited them, without leaking contact details', async () => {
  const inviter = await seedInviter();
  const prepared = body(
    await api['prepare-invite'](
      req('POST', {
        headers: inviter.auth,
        json: { name: 'Dana Okonkwo', rel: 'wife', email: 'vic@example.com', phone: '+17025550111' },
      })
    )
  );

  const res = await api['invite-info'](
    req('GET', { query: { code: inviter.member.code, claim: prepared.claim_code, rel: 'wife' } })
  );
  const out = body(res);

  assert.equal(out.inviter_name, 'Sam Alvarez');
  assert.equal(out.brand_name, 'Test Connect');
  assert.equal(out.claim_member.name, 'Dana Okonkwo');
  assert.equal(out.claim_member.one_click, true);
  assert.equal(out.relationship, 'wife');
  assert.ok(!JSON.stringify(out).includes('greg@example.com'), 'inviter email must not be exposed');
  assert.ok(!JSON.stringify(out).includes('vic@example.com'), 'invitee email must not be echoed back');
});

test('invite-info 404s for unknown and deactivated inviters', async () => {
  assert.equal((await api['invite-info'](req('GET', { query: { code: 'NOPE1234' } }))).statusCode, 404);
  const gone = await seedInviter({ status: 'deactivated', email: 'x@example.com' });
  assert.equal(
    (await api['invite-info'](req('GET', { query: { code: gone.member.code } }))).statusCode,
    404
  );
});

// ---------------------------------------------------------------------------
// joining
// ---------------------------------------------------------------------------

test('one-click join activates the pre-created member and signs them in', async () => {
  const inviter = await seedInviter();
  const prepared = body(
    await api['prepare-invite'](
      req('POST', {
        headers: inviter.auth,
        json: { name: 'Dana Okonkwo', rel: 'wife', email: 'vic@example.com', phone: '+17025550111' },
      })
    )
  );

  const res = await api['one-click-join'](
    req('POST', { json: { claim: prepared.claim_code, rel: 'wife', consent: true } })
  );
  assert.equal(res.statusCode, 201);
  const out = body(res);

  assert.ok(out.token, 'joining returns a session token — no password, no email round-trip');
  assert.equal(out.member.status, 'active');
  assert.equal(out.connected_to.name, 'Sam Alvarez');

  const session = await store.getSession(out.token);
  assert.equal(session.member.name, 'Dana Okonkwo');

  const edge = await store.findConnection(inviter.member.id, out.member.id);
  assert.equal(edge.kind, 'wife', 'the placeholder edge upgrades to the real relationship');
});

test('one-click join requires consent and refuses without contact on file', async () => {
  const inviter = await seedInviter();
  const prepared = body(
    await api['prepare-invite'](
      req('POST', { headers: inviter.auth, json: { name: 'Half Contact', email: 'half@example.com' } })
    )
  );

  assert.equal(
    (await api['one-click-join'](req('POST', { json: { claim: prepared.claim_code } }))).statusCode,
    400,
    'consent is required'
  );
  const res = await api['one-click-join'](
    req('POST', { json: { claim: prepared.claim_code, consent: true } })
  );
  assert.equal(res.statusCode, 400);
  assert.match(body(res).error, /email and phone/);
});

test('re-opening an already-claimed invite signs you in instead of erroring', async () => {
  const inviter = await seedInviter();
  const prepared = body(
    await api['prepare-invite'](
      req('POST', {
        headers: inviter.auth,
        json: { name: 'Dana Okonkwo', email: 'vic@example.com', phone: '+17025550111' },
      })
    )
  );
  await api['one-click-join'](req('POST', { json: { claim: prepared.claim_code, consent: true } }));

  const again = await api['one-click-join'](
    req('POST', { json: { claim: prepared.claim_code, consent: true } })
  );
  assert.equal(again.statusCode, 200);
  assert.equal(body(again).already_joined, true);
  assert.ok(body(again).token);
});

test('full join upgrades the pre-created member rather than duplicating the person', async () => {
  const inviter = await seedInviter();
  const prepared = body(
    await api['prepare-invite'](
      req('POST', { headers: inviter.auth, json: { name: 'Sam Rivers', email: 'sam@example.com' } })
    )
  );

  const before = (await store.listMembers()).length;
  const res = await api.join(
    req('POST', {
      json: {
        code_of_inviter: inviter.member.code,
        claim: prepared.claim_code,
        name: 'Samuel Rivers',
        email: 'sam@example.com',
        phone: '+17025550144',
        rel: 'friend',
        consent: true,
      },
    })
  );
  assert.equal(res.statusCode, 201);
  assert.equal(
    (await store.listMembers()).length,
    before,
    'claiming must not create a second row for the same human'
  );
  assert.equal(body(res).member.name, 'Samuel Rivers');
  assert.equal(body(res).member.status, 'active');
});

test('full join from a cold link creates a new member', async () => {
  const inviter = await seedInviter();
  const res = await api.join(
    req('POST', {
      json: {
        code_of_inviter: inviter.member.code,
        name: 'Cold Prospect',
        email: 'cold@example.com',
        rel: 'friend',
        consent: true,
      },
    })
  );
  assert.equal(res.statusCode, 201);
  const edge = await store.findConnection(inviter.member.id, body(res).member.id);
  assert.equal(edge.kind, 'friend');
});

test('join responses never carry contact details', async () => {
  const inviter = await seedInviter();
  const res = await api.join(
    req('POST', {
      json: {
        code_of_inviter: inviter.member.code,
        name: 'Cold Prospect',
        email: 'cold@example.com',
        phone: '+17025550199',
        consent: true,
      },
    })
  );
  const payload = JSON.stringify(body(res).member);
  assert.ok(!payload.includes('cold@example.com'));
  assert.ok(!payload.includes('7025550199'));
});

// ---------------------------------------------------------------------------
// channel attribution
// ---------------------------------------------------------------------------

test('channel attribution follows an invite from send to open to join', async () => {
  const inviter = await seedInviter();
  const prepared = body(
    await api['prepare-invite'](
      req('POST', {
        headers: inviter.auth,
        json: { name: 'Dana Okonkwo', email: 'vic@example.com', phone: '+17025550111' },
      })
    )
  );

  // She opens the link that was texted to her.
  await api['invite-info'](
    req('GET', { query: { code: inviter.member.code, claim: prepared.claim_code, invite: prepared.invite_id, ch: 'sms' } })
  );
  await api['one-click-join'](req('POST', { json: { claim: prepared.claim_code, consent: true } }));

  const stats = await store.channelStats();
  assert.deepEqual(stats, { sms: { sent: 1, opened: 1, joined: 1 } });

  const view = body(await api.invitees(req('GET', { headers: inviter.auth })));
  assert.equal(view.invites[0].channel, 'sms');
  assert.ok(view.invites[0].opened_at);
  assert.ok(view.invites[0].joined_at);
  assert.equal(view.invitees[0].name, 'Dana Okonkwo');
});

test('an unopened invite counts as sent but not opened', async () => {
  const inviter = await seedInviter();
  await api['prepare-invite'](req('POST', { headers: inviter.auth, json: { name: 'Never Opened' } }));
  assert.deepEqual(await store.channelStats(), { untagged: { sent: 1, opened: 0, joined: 0 } });
});

test('the open beacon never fails the request', async () => {
  const res = await api['invite-open'](req('POST', { json: { invite_id: 'does-not-exist', channel: 'x' } }));
  assert.equal(res.statusCode, 200);
});

// ---------------------------------------------------------------------------
// server-side sending
// ---------------------------------------------------------------------------

test('invite-send emails the invite and replies to the human inviter', async () => {
  const inviter = await seedInviter();
  const prepared = body(
    await api['prepare-invite'](
      req('POST', { headers: inviter.auth, json: { name: 'Remote Cousin', email: 'cousin@example.com' } })
    )
  );

  const res = await api['invite-send'](
    req('POST', {
      headers: inviter.auth,
      json: { invite_id: prepared.invite_id, to: 'cousin@example.com', note: 'Been too long!' },
    })
  );
  assert.equal(res.statusCode, 200);
  assert.equal(sender.sent.length, 1);

  const mail = sender.sent[0];
  assert.equal(mail.to, 'cousin@example.com');
  assert.equal(mail.subject, 'Sam Alvarez invited you to Test Connect');
  assert.equal(mail.replyTo, 'greg@example.com', 'replies go to the person, not a no-reply void');
  assert.match(mail.text, /Been too long!/);
  assert.equal(parseInviteUrl(body(res).url).channel, 'email');
});

test('invite-send refuses to send another member’s invite', async () => {
  const alice = await seedInviter({ name: 'Alice', email: 'alice@example.com' });
  const mallory = await seedInviter({ name: 'Mallory', email: 'mallory@example.com' });
  const prepared = body(
    await api['prepare-invite'](req('POST', { headers: alice.auth, json: { name: 'Target', email: 't@example.com' } }))
  );

  const res = await api['invite-send'](
    req('POST', { headers: mallory.auth, json: { invite_id: prepared.invite_id, to: 'attacker@example.com' } })
  );
  assert.equal(res.statusCode, 403);
  assert.equal(sender.sent.length, 0);
});

test('invite-send fails loudly for unimplemented channels and missing senders', async () => {
  const inviter = await seedInviter();
  const prepared = body(
    await api['prepare-invite'](req('POST', { headers: inviter.auth, json: { name: 'Someone', email: 's@example.com' } }))
  );

  const sms = await api['invite-send'](
    req('POST', { headers: inviter.auth, json: { invite_id: prepared.invite_id, to: 's@example.com', channel: 'sms' } })
  );
  assert.equal(sms.statusCode, 400);
  assert.match(body(sms).error, /only implemented for email/);

  const noSender = createOnboardHandlers(cfg, { store, sender: null });
  const res = await noSender['invite-send'](
    req('POST', { headers: inviter.auth, json: { invite_id: prepared.invite_id, to: 's@example.com' } })
  );
  assert.equal(res.statusCode, 400);
  assert.match(body(res).error, /No email sender is configured/);
});

// ---------------------------------------------------------------------------
// hardening
// ---------------------------------------------------------------------------

test('invite links cannot be pointed at another origin by a spoofed Host header', async () => {
  const inviter = await seedInviter();

  // `evil.netlify.app` is the one that matters: anyone can register a Netlify
  // site, so trusting *.netlify.app wholesale would be no protection at all.
  for (const host of ['evil.example.com', 'evil.netlify.app', 'test-connect.netlify.app.evil.com']) {
    const res = await api['prepare-invite'](
      req('POST', { headers: { ...inviter.auth, host }, json: { name: 'Victim Person' } })
    );
    assert.equal(
      new URL(body(res).url).origin,
      cfg.origin,
      `Host: ${host} must not redirect the invite link`
    );
  }
});

test('preview deploys are still allowed to mint their own links', async () => {
  const inviter = await seedInviter();
  const res = await api['prepare-invite'](
    req('POST', {
      headers: { ...inviter.auth, host: 'deploy-preview-12--test-connect.netlify.app' },
      json: { name: 'Preview Person' },
    })
  );
  assert.equal(new URL(body(res).url).host, 'deploy-preview-12--test-connect.netlify.app');
});

test('prepare-invite is rate limited per source', async () => {
  const inviter = await seedInviter();
  let limited = 0;
  for (let i = 0; i < 30; i++) {
    const res = await api['prepare-invite'](
      req('POST', { headers: inviter.auth, json: { name: `Person ${i}` } })
    );
    if (res.statusCode === 429) limited++;
  }
  assert.ok(limited > 0, 'a burst of invites from one IP must eventually be throttled');
});

test('every handler rejects the wrong HTTP method', async () => {
  const names = Object.keys(api).filter((k) => k !== '_internal');
  for (const name of names) {
    const wrong = ['invite-info', 'invitees', 'session'].includes(name) ? 'DELETE' : 'GET';
    const res = await api[name](req(wrong));
    assert.equal(res.statusCode, 405, `${name} should reject ${wrong}`);
  }
});
