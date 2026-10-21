'use strict';
// Tests for the Punctuated voice: the Scribe engine, the person's choice between
// engines, and the resampler. No network and no microphone: a fake WebSocket, a
// fake fetch for the token, and a fake audio source stand in. Every expected
// value is a literal. SOMA_SPEECH_SRC lets scripts/mutation-check.js run these
// tests against a deliberately broken copy of the source.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const S = require(process.env.SOMA_SPEECH_SRC || path.join(__dirname, '..', 'src', 'soma-speech.js'));
const F = require(path.join(__dirname, '..', 'src', 'soma-speech-fake.js'));
const { FakeBox, fakeTimers } = require('./helpers.js');

// ---------------------------------------------------------------- fakes

function makeWebSocket() {
  class FakeWS {
    constructor(url) { this.url = url; this.sent = []; this.closed = false; FakeWS.all.push(this); }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.closed = true; }
    open() { if (this.onopen) this.onopen(); }
    say(msg) { if (this.onmessage) this.onmessage({ data: JSON.stringify(msg) }); }
    drop() { if (this.onclose) this.onclose(); }
    fail() { if (this.onerror) this.onerror(); }
  }
  FakeWS.all = [];
  return FakeWS;
}

function makeFetch(response) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (response.reject) throw new Error(response.reject);
    return { ok: response.status >= 200 && response.status < 300, status: response.status, json: async () => response.body };
  };
  fn.calls = calls;
  return fn;
}

// A microphone stand-in. open() is what the engine calls; the test pushes chunks.
function makeAudio(opts) {
  opts = opts || {};
  const a = {
    onChunk: null, stops: 0, opened: 0,
    open(onChunk) {
      a.opened += 1;
      a.onChunk = onChunk;
      if (opts.reject) return Promise.reject(opts.reject);
      return Promise.resolve({
        stop() {
          a.stops += 1;
          if (opts.lastWords && a.onChunk) a.onChunk(opts.lastWords);   // the final partial chunk
        }
      });
    },
    chunk(samples) { a.onChunk(Int16Array.from(samples)); }
  };
  return a;
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

// An engine with every dependency faked, and a log of what it reported.
function scribeRig(over) {
  over = over || {};
  const WebSocket = makeWebSocket();
  const fetch = over.fetch || makeFetch({ status: 200, body: { token: 'tok 1/2' } });
  const audio = over.audio || makeAudio();
  const timers = fakeTimers();
  const engine = S.createScribeEngine(Object.assign({
    tokenUrl: 'https://example.test/api/speech-token',
    getHeaders: () => ({ authorization: 'Bearer abc' }),
    WebSocket, fetch, openAudio: audio.open, timers
  }, over.opts || {}));
  const events = [];
  engine.onstart = () => events.push(['start']);
  engine.onresult = (r) => events.push([r.type, r.text]);
  engine.onerror = (e) => events.push(['error', e.code, e.message]);
  engine.onend = () => events.push(['end']);
  return { engine, WebSocket, fetch, audio, timers, events };
}

// start, let the token arrive, open the socket, and say the session began
async function running(r) {
  r.engine.start({ lang: 'en-US' });
  await tick();
  const ws = r.WebSocket.all[0];
  ws.open();
  ws.say({ message_type: 'session_started', session_id: 's1' });
  return ws;
}

// Buffers share a pool, so copy the bytes out before viewing them as 16-bit samples.
const decode = (b64) => Array.from(new Int16Array(Uint8Array.from(Buffer.from(b64, 'base64')).buffer));
const sentSamples = (msg) => decode(msg.audio_base_64);

// ---------------------------------------------------------------- the Scribe engine: connecting

test('scribe: start asks the token endpoint with the sign-in headers, then opens the socket with that token', async () => {
  const r = scribeRig();
  r.engine.start({ lang: 'en-US' });
  await tick();
  assert.equal(r.fetch.calls.length, 1);
  assert.equal(r.fetch.calls[0].url, 'https://example.test/api/speech-token');
  assert.equal(r.fetch.calls[0].init.method, 'POST');
  assert.equal(r.fetch.calls[0].init.headers.authorization, 'Bearer abc');
  assert.equal(r.WebSocket.all.length, 1);
  assert.equal(
    r.WebSocket.all[0].url,
    'wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=pcm_16000' +
      '&commit_strategy=vad&vad_silence_threshold_secs=3&token=tok%201%2F2'
  );
});

test('scribe: manual commit and a language code change the socket address', async () => {
  const r = scribeRig({ opts: { commit: 'manual', languageCode: 'es' } });
  r.engine.start({});
  await tick();
  assert.equal(
    r.WebSocket.all[0].url,
    'wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=pcm_16000' +
      '&commit_strategy=manual&language_code=es&token=tok%201%2F2'
  );
});

test('scribe: the microphone opens at once, in parallel with the token request', async () => {
  const r = scribeRig();
  r.engine.start({});
  assert.equal(r.audio.opened, 1);          // before any await: still inside the click
});

test('scribe: audio captured while the socket opens is sent first, in order, as base64 16-bit samples', async () => {
  const r = scribeRig();
  r.engine.start({});
  await tick();
  r.audio.chunk([1, -2, 300]);
  r.audio.chunk([4, 5]);
  const ws = r.WebSocket.all[0];
  assert.equal(ws.sent.length, 0);          // nothing leaves before the socket is open
  ws.open();
  assert.equal(ws.sent.length, 2);
  assert.deepEqual(sentSamples(ws.sent[0]), [1, -2, 300]);
  assert.deepEqual(sentSamples(ws.sent[1]), [4, 5]);
  assert.equal(ws.sent[0].message_type, 'input_audio_chunk');
  assert.equal(ws.sent[0].sample_rate, 16000);
  assert.equal(ws.sent[0].commit, undefined);
  r.audio.chunk([6]);
  assert.deepEqual(sentSamples(ws.sent[2]), [6]);
});

test('scribe: starting twice opens one socket', async () => {
  const r = scribeRig();
  r.engine.start({});
  r.engine.start({});
  await tick();
  assert.equal(r.WebSocket.all.length, 1);
  assert.equal(r.fetch.calls.length, 1);
});

// ---------------------------------------------------------------- the Scribe engine: results

test('scribe: session_started reports start; partials are interim; commits are final then clear the interim', async () => {
  const r = scribeRig();
  const ws = await running(r);
  ws.say({ message_type: 'partial_transcript', text: 'okay so here' });
  ws.say({ message_type: 'committed_transcript', text: 'Okay, so here is what I want.' });
  assert.deepEqual(r.events, [
    ['start'],
    ['interim', 'okay so here'],
    ['final', 'Okay, so here is what I want.'],
    ['interim', '']
  ]);
});

test('scribe: an empty commit is ignored', async () => {
  const r = scribeRig();
  const ws = await running(r);
  ws.say({ message_type: 'committed_transcript', text: '' });
  assert.deepEqual(r.events, [['start']]);
});

test('scribe: warnings and throttled commits are not failures', async () => {
  const r = scribeRig();
  const ws = await running(r);
  ws.say({ message_type: 'warning', warning: 'slow down' });
  ws.say({ message_type: 'commit_throttled', error: 'too often' });
  ws.say({ message_type: 'insufficient_audio_activity', error: 'quiet' });
  assert.deepEqual(r.events, [['start']]);
});

// ---------------------------------------------------------------- the Scribe engine: stopping

test('scribe: stop sends the last words, then a commit, waits for the text, closes, and ends', async () => {
  const r = scribeRig({ audio: makeAudio({ lastWords: Int16Array.from([9, 9]) }) });
  const ws = await running(r);
  ws.sent.length = 0;
  r.engine.stop();
  assert.equal(r.audio.stops, 1);
  assert.equal(ws.sent.length, 2);
  assert.deepEqual(sentSamples(ws.sent[0]), [9, 9]);           // the tail of the audio goes first
  assert.equal(ws.sent[1].commit, true);
  assert.equal(ws.sent[1].audio_base_64, '');
  assert.deepEqual(r.events, [['start']]);                      // not ended yet: the text is still coming
  ws.say({ message_type: 'committed_transcript', text: 'Last words.' });
  assert.deepEqual(r.events.slice(1), [['final', 'Last words.'], ['interim', ''], ['end']]);
  assert.equal(ws.closed, true);
});

test('scribe: stop ends even when the server never answers the commit', async () => {
  const r = scribeRig();
  const ws = await running(r);
  r.engine.stop();
  assert.ok(r.timers.delays().includes(2500));
  r.timers.fireAll();
  assert.deepEqual(r.events, [['start'], ['end']]);
  assert.equal(ws.closed, true);
});

test('scribe: a commit the server cannot make (nothing was said) still ends the stop', async () => {
  const r = scribeRig();
  const ws = await running(r);
  r.engine.stop();
  ws.say({ message_type: 'insufficient_audio_activity', error: 'nothing to commit' });
  assert.deepEqual(r.events, [['start'], ['end']]);
});

test('scribe: stop before the socket opened ends at once and closes the microphone', async () => {
  const r = scribeRig();
  r.engine.start({});
  await tick();
  r.engine.stop();
  assert.deepEqual(r.events, [['end']]);
  assert.equal(r.audio.stops, 1);
});

test('scribe: abort reports aborted, ends, closes the socket and the microphone', async () => {
  const r = scribeRig();
  const ws = await running(r);
  r.engine.abort();
  assert.deepEqual(r.events.slice(1), [['error', 'aborted', undefined], ['end']]);
  assert.equal(ws.closed, true);
  assert.equal(r.audio.stops, 1);
});

test('scribe: after silence the engine stops itself, so a left-open mic does not run up the bill', async () => {
  const r = scribeRig();
  const ws = await running(r);
  assert.deepEqual(r.timers.delays(), [30000]);
  r.timers.fireAll();                                           // 30 s of nothing
  assert.equal(ws.sent[ws.sent.length - 1].commit, true);
  ws.say({ message_type: 'committed_transcript', text: '' });
  assert.deepEqual(r.events, [['start'], ['end']]);
});

test('scribe: speech restarts the silence timer', async () => {
  const r = scribeRig();
  const ws = await running(r);
  ws.say({ message_type: 'partial_transcript', text: 'still here' });
  assert.deepEqual(r.timers.delays(), [30000]);                 // one timer, rearmed, not two
});

// ---------------------------------------------------------------- the Scribe engine: failures

for (const [status, reason] of [[401, 'not-signed-in'], [403, 'not-signed-in'], [429, 'capped'], [500, 'service']]) {
  test(`scribe: token answer ${status} is reported as "${reason}" and no socket is opened`, async () => {
    const r = scribeRig({ fetch: makeFetch({ status, body: {} }) });
    r.engine.start({});
    await tick();
    assert.deepEqual(r.events, [['error', 'scribe-unavailable', reason], ['end']]);
    assert.equal(r.WebSocket.all.length, 0);
    assert.equal(r.audio.stops, 1);
  });
}

test('scribe: a token request that cannot reach the server is reported as a network problem', async () => {
  const r = scribeRig({ fetch: makeFetch({ reject: 'offline' }) });
  r.engine.start({});
  await tick();
  assert.deepEqual(r.events, [['error', 'scribe-unavailable', 'network'], ['end']]);
});

test('scribe: a token answer without a token is a service problem', async () => {
  const r = scribeRig({ fetch: makeFetch({ status: 200, body: {} }) });
  r.engine.start({});
  await tick();
  assert.deepEqual(r.events, [['error', 'scribe-unavailable', 'service'], ['end']]);
});

test('scribe: a blocked microphone is reported as not-allowed, and the socket is not left open', async () => {
  const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
  const r = scribeRig({ audio: makeAudio({ reject: denied }) });
  r.engine.start({});
  await tick();
  assert.deepEqual(r.events[0], ['error', 'not-allowed', undefined]);
  assert.equal(r.events[r.events.length - 1][0], 'end');
  assert.ok(r.WebSocket.all.every((w) => w.closed));
});

test('scribe: no microphone is reported as audio-capture', async () => {
  const missing = Object.assign(new Error('none'), { name: 'NotFoundError' });
  const r = scribeRig({ audio: makeAudio({ reject: missing }) });
  r.engine.start({});
  await tick();
  assert.equal(r.events[0][1], 'audio-capture');
});

for (const type of ['auth_error', 'quota_exceeded', 'rate_limited', 'transcriber_error', 'error']) {
  test(`scribe: a "${type}" message from the service ends the session with a service problem`, async () => {
    const r = scribeRig();
    const ws = await running(r);
    ws.say({ message_type: type, error: 'boom' });
    assert.deepEqual(r.events.slice(1), [['error', 'scribe-unavailable', 'service'], ['end']]);
    assert.equal(ws.closed, true);
  });
}

test('scribe: the session time limit ends the session quietly so the controller can start another', async () => {
  const r = scribeRig();
  const ws = await running(r);
  ws.say({ message_type: 'session_time_limit_exceeded' });
  assert.deepEqual(r.events, [['start'], ['end']]);
});

test('scribe: the server closing a running session is an end, not an error', async () => {
  const r = scribeRig();
  const ws = await running(r);
  ws.drop();
  assert.deepEqual(r.events, [['start'], ['end']]);
});

test('scribe: a socket that closes before the session began is a network problem', async () => {
  const r = scribeRig();
  r.engine.start({});
  await tick();
  r.WebSocket.all[0].drop();
  assert.equal(r.events[0][1], 'scribe-unavailable');
  assert.equal(r.events[0][2], 'network');
});

test('scribe: it reports itself unsupported without a token address or a microphone', () => {
  const base = { WebSocket: makeWebSocket(), fetch: makeFetch({ status: 200, body: {} }) };
  const withMic = Object.assign({ openAudio: makeAudio().open }, base);
  assert.equal(S.createScribeEngine(Object.assign({ tokenUrl: '/t' }, withMic)).supported, true);
  assert.equal(S.createScribeEngine(Object.assign({}, withMic)).supported, false);
  // Node has no navigator.mediaDevices, so with no audio source passed in there is no microphone.
  assert.equal(S.createScribeEngine(Object.assign({ tokenUrl: '/t' }, base)).supported, false);
});

// ---------------------------------------------------------------- Scribe with the controller and a box

test('scribe end to end: punctuated sentences land in the box, joined with a space', async () => {
  const r = scribeRig();
  const box = new FakeBox('Dear team,');
  const ctl = S.createController({ engine: r.engine, target: S.domTarget(box), lang: 'en-US', timers: fakeTimers() });
  ctl.start();
  await tick();
  const ws = r.WebSocket.all[0];
  ws.open();
  ws.say({ message_type: 'session_started' });
  assert.equal(ctl.state, 'listening');
  ws.say({ message_type: 'partial_transcript', text: 'thanks for coming' });
  assert.equal(box.value, 'Dear team,');
  ws.say({ message_type: 'committed_transcript', text: 'Thanks for coming.' });
  ws.say({ message_type: 'committed_transcript', text: 'The chat page is done.' });
  assert.equal(box.value, 'Dear team, Thanks for coming. The chat page is done.');
});

test('scribe end to end: two silent sessions in a row end listening instead of streaming silence for ever', async () => {
  const r = scribeRig();
  const ctl = S.createController({ engine: r.engine, target: S.domTarget(new FakeBox('')), lang: 'en-US', timers: fakeTimers() });
  ctl.start();
  for (let session = 0; session < 2; session++) {
    await tick();
    const ws = r.WebSocket.all[session];
    ws.open();
    ws.say({ message_type: 'session_started' });
    r.timers.fireAll();                                          // 30 s of silence
    ws.say({ message_type: 'committed_transcript', text: '' });
  }
  assert.equal(r.WebSocket.all.length, 2);                       // a third session was not opened
  assert.equal(ctl.state, 'idle');
  assert.match(ctl.info.message, /Nothing was heard/);
});

// ---------------------------------------------------------------- the person's choice

function choiceRig(choice, over) {
  over = over || {};
  const browser = F.createFakeEngine(over.browser);
  const scribe = F.createFakeEngine(over.scribe);
  const box = new FakeBox('');
  const timers = fakeTimers();
  const choiceEngine = S.createChoiceEngine({ browser, scribe, getChoice: () => choice });
  const log = [];
  const ctl = S.createController({ engine: choiceEngine, target: S.domTarget(box), lang: 'en-US', timers, onChange: (i) => log.push(i) });
  return { browser, scribe, box, choiceEngine, ctl, log };
}

test('choice: "browser" starts only the browser engine', () => {
  const r = choiceRig('browser');
  r.ctl.start();
  assert.equal(r.browser.starts, 1);
  assert.equal(r.scribe.starts, 0);
});

test('choice: "scribe" starts only the Scribe engine', () => {
  const r = choiceRig('scribe');
  r.ctl.start();
  assert.equal(r.scribe.starts, 1);
  assert.equal(r.browser.starts, 0);
});

test('choice: results from the chosen engine reach the box', () => {
  const r = choiceRig('scribe');
  r.ctl.start();
  r.scribe.begin();
  r.scribe.final('Punctuated, as promised.');
  assert.equal(r.box.value, 'Punctuated, as promised.');
});

test('choice: stop goes to the engine that is running', () => {
  const r = choiceRig('scribe');
  r.ctl.start();
  r.scribe.begin();
  r.ctl.stop();
  assert.equal(r.scribe.stops, 1);
  assert.equal(r.browser.stops, 0);
});

test('choice: when Scribe cannot start, the browser engine starts and the person is told why', () => {
  const r = choiceRig('scribe');
  r.ctl.start();
  r.scribe.error('scribe-unavailable', 'not-signed-in');         // the token was refused
  assert.equal(r.browser.starts, 1);
  assert.equal(r.ctl.info.notice, 'Punctuated voice needs you to be signed in. Using standard voice.');
  assert.equal(r.ctl.state, 'starting');                          // not an error: listening carries on
  r.browser.begin();
  assert.equal(r.ctl.state, 'listening');
  r.browser.final('standard words');
  assert.equal(r.box.value, 'standard words');
  assert.equal(r.ctl.info.notice, '');                            // the notice goes with the first words
});

test('choice: the failed Scribe session\'s own end does not stop the fallback', () => {
  const r = choiceRig('scribe');
  r.ctl.start();
  r.scribe.error('scribe-unavailable', 'capped');
  r.scribe.end();                                                 // Scribe reports its end right after its error
  r.browser.begin();
  assert.equal(r.ctl.state, 'listening');
  assert.equal(r.browser.starts, 1);
});

test('choice: a Scribe failure after it began is shown, not hidden by a switch', () => {
  const r = choiceRig('scribe');
  r.ctl.start();
  r.scribe.begin();
  r.scribe.error('scribe-unavailable', 'service');
  assert.equal(r.ctl.state, 'error');
  assert.equal(r.browser.starts, 0);
});

test('choice: when Scribe is not available here at all, the browser engine is used and the person is told', () => {
  const r = choiceRig('scribe', { scribe: { supported: false } });
  r.ctl.start();
  assert.equal(r.browser.starts, 1);
  assert.equal(r.ctl.info.notice, 'Punctuated voice is not available here, so standard voice is being used.');
});

test('choice: a browser with no speech recognition uses Scribe even if "browser" was chosen', () => {
  const r = choiceRig('browser', { browser: { supported: false } });
  r.ctl.start();
  assert.equal(r.scribe.starts, 1);
  assert.equal(r.browser.starts, 0);
});

test('choice: it is supported when either engine is, and not when neither is', () => {
  const e = (b, s) => S.createChoiceEngine({
    browser: F.createFakeEngine({ supported: b }), scribe: F.createFakeEngine({ supported: s }), getChoice: () => 'browser'
  });
  assert.equal(e(true, false).supported, true);
  assert.equal(e(false, true).supported, true);
  assert.equal(e(false, false).supported, false);
});

test('choice: a notice does not outlive listening', () => {
  const r = choiceRig('scribe', { scribe: { supported: false } });
  r.ctl.start();
  r.browser.begin();
  assert.ok(r.ctl.info.notice);
  r.ctl.stop();
  assert.equal(r.ctl.info.notice, '');
});

// ---------------------------------------------------------------- the resampler

test('resampler: 48 kHz to 16 kHz gives one sample per three, with the average value', () => {
  const out = S.makeResampler(48000, 16000).push([0, 0, 0, 1, 1, 1, 0.5, 0.5, 0.5]);
  assert.deepEqual(out, [0, 32767, 16384]);
});

test('resampler: 44.1 kHz to 16 kHz gives 160 samples from 441', () => {
  const out = S.makeResampler(44100, 16000).push(new Float32Array(441).fill(0.25));
  assert.ok(out.length === 160 || out.length === 159, 'got ' + out.length);
  assert.ok(out.every((v) => v === 8192), 'a steady level stays steady');
});

test('resampler: splitting the input into uneven pieces gives exactly the same output', () => {
  const input = Float32Array.from({ length: 4410 }, (_, i) => Math.sin(i / 7));
  const whole = S.makeResampler(44100, 16000).push(input);
  const pieces = S.makeResampler(44100, 16000);
  let split = [];
  for (const [from, to] of [[0, 1], [1, 130], [130, 2048], [2048, 2049], [2049, 4410]]) {
    split = split.concat(pieces.push(input.subarray(from, to)));
  }
  assert.deepEqual(split, whole);
});

test('resampler: loud input is clipped to the 16-bit range', () => {
  assert.deepEqual(S.makeResampler(48000, 16000).push([2, 2, 2, -2, -2, -2]), [32767, -32768]);
});

test('toBase64: 16-bit samples survive the trip', () => {
  assert.deepEqual(decode(S.toBase64(Int16Array.from([1, -2, 300, -32768, 32767]))), [1, -2, 300, -32768, 32767]);
});

// ---------------------------------------------------------------- notices

test('a notice from an engine shows while listening and clears with the first words', () => {
  const engine = F.createFakeEngine();
  const ctl = S.createController({ engine, target: S.domTarget(new FakeBox('')), lang: 'en-US', timers: fakeTimers() });
  ctl.start();
  engine.begin();
  engine.onnotice('Using standard voice.');
  assert.equal(ctl.info.notice, 'Using standard voice.');
  engine.interim('hello');
  assert.equal(ctl.info.notice, '');
});

test('friendlyError: each Punctuated voice problem has its own plain sentence', () => {
  assert.equal(S.friendlyError('scribe-unavailable', 'not-signed-in'), 'Punctuated voice needs you to be signed in.');
  assert.equal(S.friendlyError('scribe-unavailable', 'capped'), "Today's limit for punctuated voice has been used.");
  assert.match(S.friendlyError('scribe-unavailable', 'network'), /internet connection/);
  assert.equal(S.friendlyError('scribe-unavailable', 'service'), 'Punctuated voice is not available right now.');
});
