import assert from 'node:assert/strict';
import test from 'node:test';

import { access, createStudioApi, resolveStudios, supabaseBroadcast, topics } from '../src/api.js';
import { StudioStore } from '../src/store.js';
import studiosConfig from '../studios.js';
import { FakeBlobStore } from './fake-blobs.js';

const TEAM_KEY = 'team-key-for-tests-0123456789';
const PEOPLE = {
  mike: { id: 'u-mike', name: 'Mike Wolf', email: 'MW@mike-wolf.com' },
  eric: { id: 'u-eric', name: 'Eric', email: 'eric@example.com' },
  stranger: { id: 'u-x', name: 'Stranger', email: 'x@example.com' },
};
const STUDIOS = resolveStudios({
  room: {
    title: 'Test room',
    appId: 'sunday-supper',
    hosts: ['mw@mike-wolf.com'],
    members: ['eric@example.com'],
    team: { brief: 'SOMA/specs/forge-room-brief.md' },
  },
}, {});

function setup({ blobs = new FakeBlobStore(), clock } = {}) {
  const pings = [];
  let tick = Date.parse('2026-10-21T12:00:00.000Z');
  const handler = createStudioApi({
    studios: STUDIOS,
    blobs,
    teamKey: TEAM_KEY,
    verifyIdentity: async (request) => {
      const who = request.headers.get('x-test-user');
      if (!who || !PEOPLE[who]) throw Object.assign(new Error('A Supabase access token is required'), { status: 401 });
      return PEOPLE[who];
    },
    broadcast: async (messages) => {
      pings.push(...messages);
    },
    now: clock ?? (() => new Date((tick += 1000))),
  });
  const call = async (method, path, { user, body, team } = {}) => {
    const headers = {};
    if (user) headers['x-test-user'] = user;
    if (team) headers['x-studio-team-key'] = team === true ? TEAM_KEY : team;
    if (body) headers['content-type'] = 'application/json';
    const response = await handler(new Request(`https://soma-forge.netlify.app/api/studio${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }));
    return { status: response.status, body: await response.json() };
  };
  return { call, pings, blobs };
}

test('only members get in; the email match ignores case', async () => {
  const { call } = setup();
  assert.equal((await call('GET', '/room/feed')).status, 401);
  const outsider = await call('GET', '/room/feed', { user: 'stranger' });
  assert.equal(outsider.status, 403);
  assert.match(outsider.body.error, /not a member/);
  assert.equal((await call('POST', '/room/messages', { user: 'stranger', body: { text: 'hi' } })).status, 403);
  const mike = await call('GET', '/room/feed', { user: 'mike' });
  assert.equal(mike.status, 200);
  assert.equal(mike.body.me.isHost, true);
  const eric = await call('GET', '/room/feed', { user: 'eric' });
  assert.equal(eric.body.me.isHost, false);
  assert.equal((await call('GET', '/nowhere/feed', { user: 'mike' })).status, 404);
  const list = await call('GET', '', { user: 'eric' });
  assert.deepEqual(list.body.studios.map((studio) => studio.id), ['room']);
  assert.deepEqual((await call('GET', '', { user: 'stranger' })).body.studios, []);
});

test('everyone in the studio sees the same chat, and a post pings the page and the team', async () => {
  const { call, pings } = setup();
  const sent = await call('POST', '/room/messages', { user: 'mike', body: { text: 'Hello team' } });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.message.seq, 1);
  assert.equal(sent.body.message.author.kind, 'human');
  assert.equal(sent.body.message.author.email, 'MW@mike-wolf.com');
  await call('POST', '/room/messages', { user: 'eric', body: { text: 'Hi from Eric' } });

  const feed = await call('GET', '/room/feed', { user: 'eric' });
  assert.deepEqual(feed.body.messages.map((message) => message.text), ['Hello team', 'Hi from Eric']);
  assert.equal(feed.body.msgSeq, 2);
  assert.equal(feed.body.topic, topics(TEAM_KEY, 'room').studio);
  assert.ok(feed.body.state, 'first load carries the state');

  // Fetching again with the cursor and version returns nothing new and no state.
  const again = await call('GET', `/room/feed?after=2&version=${feed.body.version}`, { user: 'mike' });
  assert.deepEqual(again.body.messages, []);
  assert.equal(again.body.state, undefined);

  const names = topics(TEAM_KEY, 'room');
  assert.ok(pings.some((ping) => ping.topic === names.studio));
  assert.equal(pings.filter((ping) => ping.topic === names.team).length, 2);
  assert.notEqual(names.studio, topics('another-key', 'room').studio, 'topic names depend on the key');
});

test('"3: yes" in the chat answers question 3 and moves it to the agreements', async () => {
  const { call } = setup();
  await call('POST', '/room/messages', { user: 'mike', body: { text: 'Build me a studio' } });
  const inbox = await call('GET', '/team/inbox', { team: true });
  assert.equal(inbox.body.studios[0].pending.length, 1);
  await call('POST', '/room/team', {
    team: true,
    body: {
      op: 'reply',
      replyTo: 1,
      upTo: 1,
      text: 'Two questions first.',
      questions: [{ text: 'Is the app pane on the right?' }, { text: 'Is sign-in SOMA Auth?' }, { text: 'Who is the first host?' }],
    },
  });
  // Eric is a member but not a decider, so his "N:" line does not answer.
  const aside = await call('POST', '/room/messages', { user: 'eric', body: { text: '3: Eric' } });
  assert.deepEqual(aside.body.message.answers, []);
  const answer = await call('POST', '/room/messages', { user: 'mike', body: { text: '3: Mike\nand thanks' } });
  assert.deepEqual(answer.body.message.answers, [3]);
  const { body } = await call('GET', '/room/feed', { user: 'mike' });
  const q3 = body.state.questions.find((question) => question.n === 3);
  assert.equal(q3.status, 'answered');
  const agreement = body.state.agreements.find((item) => item.fromQuestion === 3);
  assert.equal(agreement.text, 'Who is the first host? — Mike');
  assert.equal(agreement.from, answer.body.message.seq);
  assert.deepEqual(
    body.state.questions.filter((question) => question.status === 'open').map((question) => question.n),
    [1, 2],
  );
});

test('the team needs its key; it marks itself working, then replies with agreements', async () => {
  const { call } = setup();
  assert.equal((await call('GET', '/team/inbox')).status, 401);
  assert.equal((await call('GET', '/team/inbox', { team: 'wrong-key-wrong-key-wrong-key' })).status, 401);
  assert.equal((await call('POST', '/room/team', { team: 'nope', body: { op: 'working', upTo: 1 } })).status, 401);
  assert.equal((await call('POST', '/room/team', { user: 'mike', body: { op: 'working', upTo: 1 } })).status, 401);

  await call('POST', '/room/messages', { user: 'mike', body: { text: 'Call it SOMA Studio' } });
  const working = await call('POST', '/room/team', { team: true, body: { op: 'working', upTo: 1 } });
  assert.equal(working.body.team.status, 'working');
  assert.equal(working.body.team.pickupMs, 1000);

  const reply = await call('POST', '/room/team', {
    team: true,
    body: {
      op: 'reply',
      replyTo: 1,
      upTo: 1,
      text: 'Agreed: SOMA Studio.',
      agreements: [{ text: 'The product is called SOMA Studio.', from: 1 }],
      model: 'opus',
    },
  });
  assert.equal(reply.body.message.author.kind, 'team');
  assert.equal(reply.body.message.replyTo, 1);
  assert.deepEqual(reply.body.message.made.agreements, [1]);
  assert.equal(reply.body.message.meta.answerMs, 1000);
  assert.equal(reply.body.message.meta.model, 'opus');

  const inbox = await call('GET', '/team/inbox', { team: true });
  const room = inbox.body.studios[0];
  assert.equal(room.pending.length, 0, 'answered messages are not pending again');
  assert.equal(room.state.teamCursor, 1);
  assert.equal(room.state.agreements[0].from, 1);
  assert.equal(room.team.brief, 'SOMA/specs/forge-room-brief.md');
  assert.equal(inbox.body.teamTopic, topics(TEAM_KEY, '').team);
});

test('the team inbox lists only people\'s messages as pending, with the session\'s recent chat', async () => {
  const { call } = setup();
  await call('POST', '/room/messages', { user: 'mike', body: { text: 'one' } });
  await call('POST', '/room/team', { team: true, body: { op: 'reply', replyTo: 1, upTo: 1, text: 'answer one' } });
  await call('POST', '/room/messages', { user: 'eric', body: { text: 'two' } });
  await call('POST', '/room/messages', { user: 'mike', body: { text: 'three' } });
  const { body } = await call('GET', '/team/inbox', { team: true });
  const room = body.studios[0];
  assert.deepEqual(room.pending.map((message) => message.text), ['two', 'three']);
  assert.deepEqual(room.recent.map((message) => message.seq), [1, 2, 3, 4]);
});

test('only a host corrects or removes an agreement, drops a question or starts a session', async () => {
  const { call } = setup();
  await call('POST', '/room/messages', { user: 'mike', body: { text: 'go' } });
  await call('POST', '/room/team', {
    team: true,
    body: { op: 'reply', replyTo: 1, upTo: 1, text: 'ok', agreements: [{ text: 'First draft' }], questions: [{ text: 'Why?' }] },
  });
  assert.equal((await call('PATCH', '/room/agreements/1', { user: 'eric', body: { text: 'Mine' } })).status, 403);
  assert.equal((await call('DELETE', '/room/agreements/1', { user: 'eric' })).status, 403);
  assert.equal((await call('DELETE', '/room/questions/1', { user: 'eric' })).status, 403);
  assert.equal((await call('POST', '/room/sessions', { user: 'eric' })).status, 403);

  const fixed = await call('PATCH', '/room/agreements/1', { user: 'mike', body: { text: 'Corrected draft' } });
  assert.equal(fixed.body.agreement.text, 'Corrected draft');
  assert.equal(fixed.body.agreement.history[0].text, 'First draft');
  assert.equal((await call('DELETE', '/room/agreements/1', { user: 'mike' })).body.agreement.status, 'removed');
  assert.equal((await call('DELETE', '/room/agreements/1', { user: 'mike' })).status, 404);
  assert.equal((await call('DELETE', '/room/questions/1', { user: 'mike' })).body.question.status, 'dropped');
  const session = await call('POST', '/room/sessions', { user: 'mike' });
  assert.equal(session.body.session.n, 2);
  const next = await call('POST', '/room/messages', { user: 'eric', body: { text: 'new sitting' } });
  assert.equal(next.body.message.session, 2);
});

test('a team agreement stands only on a decider\'s own message', async () => {
  const { call } = setup();
  await call('POST', '/room/messages', { user: 'mike', body: { text: 'We ship Friday' } });
  await call('POST', '/room/messages', { user: 'eric', body: { text: 'I would like blue' } });
  const reply = await call('POST', '/room/team', {
    team: true,
    body: {
      op: 'reply',
      replyTo: 2,
      upTo: 2,
      text: 'Noted both.',
      agreements: [
        { text: 'We ship on Friday.', from: 1 },
        { text: 'The page is blue.', from: 2 },
        { text: 'A made-up decision.', from: 3 },
      ],
    },
  });
  assert.deepEqual(reply.body.result.agreements, [1]);
  assert.equal(reply.body.result.toConfirm.length, 2);
  const { body } = await call('GET', '/room/feed', { user: 'mike' });
  assert.deepEqual(body.state.agreements.map((item) => [item.text, item.from]), [['We ship on Friday.', 1]]);
  const confirm = body.state.questions.filter((item) => item.text.startsWith('Do we agree: '));
  assert.deepEqual(confirm.map((item) => item.text), ['Do we agree: The page is blue.', 'Do we agree: A made-up decision.']);
  // Mike settles one by number, and that makes the agreement, linked to his message.
  const yes = await call('POST', '/room/messages', { user: 'mike', body: { text: `${confirm[0].n}: yes` } });
  const after = await call('GET', '/room/feed', { user: 'mike' });
  const made = after.body.state.agreements.find((item) => item.fromQuestion === confirm[0].n);
  assert.equal(made.from, yes.body.message.seq);
  assert.equal(after.body.me.isDecider, true);
  assert.equal((await call('GET', '/room/feed', { user: 'eric' })).body.me.isDecider, false);
});

test('a member who changes the app bumps the app version for everyone', async () => {
  const { call } = setup();
  const changed = await call('POST', '/room/app-changed', { user: 'eric', body: { versionId: 'v7' } });
  assert.equal(changed.body.app.version, 1);
  assert.equal(changed.body.app.versionId, 'v7');
  const { body } = await call('GET', '/room/feed', { user: 'mike' });
  assert.equal(body.state.app.version, 1);
});

test('posts at the same moment get distinct numbers and none is lost', async () => {
  const { call } = setup();
  const texts = Array.from({ length: 12 }, (_, i) => `message ${i}`);
  const results = await Promise.all(texts.map((text, i) =>
    call('POST', '/room/messages', { user: i % 2 ? 'mike' : 'eric', body: { text } })));
  const seqs = results.map((result) => result.body.message.seq).sort((a, b) => a - b);
  assert.deepEqual(seqs, Array.from({ length: 12 }, (_, i) => i + 1));
  const { body } = await call('GET', '/room/feed', { user: 'mike' });
  assert.deepEqual(body.messages.map((message) => message.text).sort(), [...texts].sort());
});

test('two separate function instances writing at once still lose nothing', async () => {
  const blobs = new FakeBlobStore();
  const one = setup({ blobs });
  const two = setup({ blobs });
  await Promise.all([
    one.call('POST', '/room/messages', { user: 'mike', body: { text: 'from one' } }),
    two.call('POST', '/room/messages', { user: 'eric', body: { text: 'from two' } }),
    one.call('POST', '/room/messages', { user: 'mike', body: { text: 'from one again' } }),
  ]);
  const { body } = await one.call('GET', '/room/feed', { user: 'mike' });
  assert.equal(body.msgSeq, 3);
  assert.deepEqual(body.messages.map((message) => message.seq), [1, 2, 3]);
});

test('a message read straight after it was written is there (strong reads)', async () => {
  const { call } = setup();
  for (let i = 1; i <= 3; i += 1) {
    await call('POST', '/room/messages', { user: 'mike', body: { text: `m${i}` } });
    const { body } = await call('GET', `/room/feed?after=${i - 1}`, { user: 'eric' });
    assert.deepEqual(body.messages.map((message) => message.text), [`m${i}`]);
  }
});

test('the feed pages across message blocks and the first load shows the newest 150', async () => {
  const blobs = new FakeBlobStore();
  const store = new StudioStore(blobs);
  const author = { kind: 'human', id: 'u-mike', name: 'Mike' };
  for (let i = 1; i <= 230; i += 1) {
    await store.post('room', { author, text: `n${i}` }, new Date(Date.UTC(2026, 9, 21, 12, 0, i)).toISOString());
  }
  const { call } = setup({ blobs });
  const first = await call('GET', '/room/feed', { user: 'mike' });
  assert.equal(first.body.messages.length, 150);
  assert.equal(first.body.messages[0].seq, 81);
  assert.equal(first.body.earliest, 81);
  assert.equal(first.body.messages.at(-1).seq, 230);
  const tail = await call('GET', '/room/feed?after=195', { user: 'mike' });
  assert.deepEqual(tail.body.messages.map((message) => message.seq), Array.from({ length: 35 }, (_, i) => 196 + i));
});

test('bad input is refused with a reason', async () => {
  const { call } = setup();
  assert.equal((await call('POST', '/room/messages', { user: 'mike', body: { text: '   ' } })).status, 400);
  assert.equal((await call('PATCH', '/room/agreements/x', { user: 'mike', body: { text: 'a' } })).status, 400);
  assert.equal((await call('POST', '/room/team', { team: true, body: { op: 'dance' } })).status, 400);
  const badJson = await createStudioApi({
    studios: STUDIOS,
    blobs: new FakeBlobStore(),
    teamKey: TEAM_KEY,
    verifyIdentity: async () => PEOPLE.mike,
  })(new Request('https://x/api/studio/room/messages', { method: 'POST', body: 'not json' }));
  assert.equal(badJson.status, 400);
});

test('a failed realtime ping never fails the request', async () => {
  const handler = createStudioApi({
    studios: STUDIOS,
    blobs: new FakeBlobStore(),
    teamKey: TEAM_KEY,
    verifyIdentity: async () => PEOPLE.mike,
    broadcast: async () => {
      throw new Error('realtime is down');
    },
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const response = await handler(new Request('https://x/api/studio/room/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'still sent' }),
    }));
    assert.equal(response.status, 201);
  } finally {
    console.warn = warn;
  }
});

test('supabaseBroadcast posts the pings to Supabase Realtime with the public key', async () => {
  const calls = [];
  const send = supabaseBroadcast({
    url: 'https://abc.supabase.co/',
    key: 'sb_publishable_x',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(null, { status: 202 });
    },
  });
  await send([{ topic: 't', event: 'changed', payload: {} }]);
  assert.equal(calls[0].url, 'https://abc.supabase.co/realtime/v1/api/broadcast');
  assert.equal(calls[0].init.headers.apikey, 'sb_publishable_x');
  assert.deepEqual(JSON.parse(calls[0].init.body).messages[0].topic, 't');
  const failing = supabaseBroadcast({ url: 'https://abc.supabase.co', key: 'k', fetchImpl: async () => new Response(null, { status: 500 }) });
  await assert.rejects(failing([]), /broadcast 500/);
});

test('dev identities count only under netlify dev', () => {
  const config = { s: { title: 'S', hosts: ['a@b.c'], devHosts: ['rosa'], devMembers: ['theo'] } };
  const live = resolveStudios(config, {});
  assert.equal(access(live.s, { id: 'rosa', name: 'Rosa' }).isMember, false);
  const dev = resolveStudios(config, { NETLIFY_DEV: 'true' });
  assert.equal(access(dev.s, { id: 'rosa', name: 'Rosa' }).isHost, true);
  assert.equal(access(dev.s, { id: 'theo', name: 'Theo' }).isHost, false);
  assert.equal(access(dev.s, { id: 'theo', name: 'Theo' }).isMember, true);
  assert.equal(access(dev.s, { id: 'rosa', name: 'Rosa' }).isDecider, true, 'hosts decide by default');
  assert.equal(access(dev.s, { id: 'theo', name: 'Theo' }).isDecider, false);
  const named = resolveStudios({ s: { title: 'S', hosts: ['a@b.c'], members: ['e@f.g'], deciders: ['E@f.g'] } }, {});
  assert.equal(access(named.s, { id: 'x', email: 'e@f.g' }).isDecider, true);
  assert.equal(access(named.s, { id: 'y', email: 'a@b.c' }).isDecider, false);
  const outsider = resolveStudios({ s: { title: 'S', hosts: [], deciders: ['z@z.z'] } }, {});
  assert.equal(access(outsider.s, { id: 'z', email: 'z@z.z' }).isDecider, false, 'a decider must also be a member');
});

test('the shipped studios are well formed and Mike hosts each one', () => {
  const studios = resolveStudios(studiosConfig, {});
  // Mike, 2026-10-21: three studios, one per project.
  assert.deepEqual(Object.keys(studios).sort(), ['coaching-age-of-ai', 'soma-studio', 'sunday-supper']);
  assert.equal(studios['sunday-supper'].appId, 'sunday-supper');
  assert.equal(studios['soma-studio'].appId, 'soma-studio');
  for (const studio of Object.values(studios)) {
    assert.ok(studio.title);
    assert.ok(studio.hosts.includes('mw.personalmail@gmail.com'));
    assert.equal(access(studio, { id: 'rosa', name: 'Rosa' }).isMember, false, 'dev ids are not members on the live site');
    assert.ok(!studio.team?.brief || !studio.team.brief.startsWith('/'), 'briefs are paths under ~/Projects');
  }
});
