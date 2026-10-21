'use strict';
// Tests for soma-speech. No DOM and no microphone: a fake text box, a fake
// engine (src/soma-speech-fake.js) and a fake SpeechRecognition class stand in.
// The mic button, Esc key and cursor behaviour in a real page are covered by
// test/browser-test.html (run it in a browser; the demo site serves it at /test/).
//
// SOMA_SPEECH_SRC lets scripts/mutation-check.js run these same tests against a
// deliberately broken copy of the source. Each test below pins a literal
// expected value; none derives its expectation from the call under test.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const S = require(process.env.SOMA_SPEECH_SRC || path.join(__dirname, '..', 'src', 'soma-speech.js'));
const F = require(path.join(__dirname, '..', 'src', 'soma-speech-fake.js'));

// ---------------------------------------------------------------- helpers

const { FakeBox, fakeTimers } = require('./helpers.js');

function rig(initial, opts) {
  opts = opts || {};
  const box = new FakeBox(initial, opts.caret);
  const engine = F.createFakeEngine(opts.engine);
  const timers = fakeTimers();
  const log = [];
  const ctl = S.createController({
    engine,
    target: S.domTarget(box),
    lang: opts.lang || 'en-US',
    onChange: (i) => log.push(i.state),
    timers
  });
  return { box, engine, ctl, timers, log };
}

// Start listening and let the engine report that audio is flowing.
function listening(r) {
  r.ctl.start();
  r.engine.begin();
  assert.equal(r.ctl.state, 'listening');
}

// ---------------------------------------------------------------- computeInsert

test('computeInsert: appends to the end of existing text with one space', () => {
  const r = S.computeInsert('hello', 5, 5, 'world');
  assert.equal(r.value, 'hello world');
  assert.equal(r.caret, 11);
});

test('computeInsert: into an empty box adds no space', () => {
  assert.equal(S.computeInsert('', 0, 0, 'hi there').value, 'hi there');
});

test('computeInsert: in the middle keeps both sides and spaces both joins', () => {
  const r = S.computeInsert('ac', 1, 1, 'b');
  assert.equal(r.value, 'a b c');
  assert.equal(r.caret, 4);
});

test('computeInsert: replaces the selected text and keeps the rest', () => {
  const r = S.computeInsert('one TWO three', 4, 7, 'two');
  assert.equal(r.value, 'one two three');
  assert.equal(r.caret, 7);
});

test('computeInsert: punctuation hugs the previous word', () => {
  assert.equal(S.computeInsert('hello', 5, 5, ', world').value, 'hello, world');
});

test('computeInsert: no second space after a space or an opening bracket', () => {
  assert.equal(S.computeInsert('hello ', 6, 6, 'world').value, 'hello world');
  assert.equal(S.computeInsert('see (', 5, 5, 'this').value, 'see (this');
});

test('computeInsert: no space is added before punctuation that follows', () => {
  assert.equal(S.computeInsert('foo.', 3, 3, 'bar').value, 'foo bar.');
});

test('computeInsert: empty or whitespace-only text changes nothing', () => {
  const r = S.computeInsert('keep me', 2, 2, '   \n ');
  assert.equal(r.value, 'keep me');
  assert.equal(r.changed, false);
});

test('computeInsert: a missing or out-of-range cursor means the end', () => {
  assert.equal(S.computeInsert('abc', null, null, 'd').value, 'abc d');
  assert.equal(S.computeInsert('abc', 99, 99, 'd').value, 'abc d');
});

test('computeInsert: inner newlines and runs of spaces become single spaces', () => {
  assert.equal(S.computeInsert('', 0, 0, 'one\n\n  two').value, 'one two');
});

// ---------------------------------------------------------------- controller: insert and interim

test('interim words are shown but not written into the box', () => {
  const r = rig('Dear team,');
  listening(r);
  r.engine.interim('thanks for com');
  assert.equal(r.ctl.info.interim, 'thanks for com');
  assert.equal(r.box.value, 'Dear team,');
});

test('a final result goes in at the cursor and keeps what was typed', () => {
  const r = rig('Dear team,');
  listening(r);
  r.engine.interim('thanks for coming');
  r.engine.final('thanks for coming');
  assert.equal(r.box.value, 'Dear team, thanks for coming');
  assert.equal(r.ctl.info.interim, '');
  assert.deepEqual(r.box.events, ['input']);
});

test('later finals continue after the earlier ones', () => {
  const r = rig('');
  listening(r);
  r.engine.final('hello');
  r.engine.final('world again');
  assert.equal(r.box.value, 'hello world again');
});

test('the cursor is read at the moment a final arrives', () => {
  const r = rig('first third', { caret: 11 });
  listening(r);
  r.box.setSelectionRange(5, 5);            // the person clicks between the words
  r.engine.final('second');
  assert.equal(r.box.value, 'first second third');
});

test('text typed while listening is kept, and dictation continues after it', () => {
  const r = rig('');
  listening(r);
  r.engine.final('start');
  r.box.type(' typed');
  r.engine.final('end');
  assert.equal(r.box.value, 'start typed end');
});

test('selected text is replaced by dictation, like typing over it', () => {
  const r = rig('say cheese now', { caret: 4 });
  r.box.setSelectionRange(4, 10);
  listening(r);
  r.engine.final('hello');
  assert.equal(r.box.value, 'say hello now');
});

test('a box nobody has touched gets the words after its existing text', () => {
  const r = rig('Existing note.', { caret: 0 });
  listening(r);
  r.engine.final('more');
  assert.equal(r.box.value, 'Existing note. more');
});

// ---------------------------------------------------------------- controller: stopping

test('stop asks the engine to finish, shows "stopping", and ends idle', () => {
  const r = rig('');
  listening(r);
  r.ctl.stop();                              // fake engine ends at once
  assert.equal(r.engine.stops, 1);
  assert.equal(r.ctl.state, 'idle');
  assert.deepEqual(r.log, ['starting', 'listening', 'stopping', 'idle']);
});

test('words the person saw are kept when listening stops before they finalize', () => {
  const r = rig('Note:');
  listening(r);
  r.engine.interim('almost finished');
  r.ctl.stop();
  assert.equal(r.box.value, 'Note: almost finished');
});

test('words the engine finalizes on stop are inserted once', () => {
  const r = rig('');
  listening(r);
  r.engine.interim('last words');
  r.engine.pendingOnStop = 'last words';
  r.ctl.stop();
  assert.equal(r.box.value, 'last words');
});

test('an engine that never ends is cut off after a grace period', () => {
  const r = rig('', { engine: { endOnStop: false } });
  listening(r);
  r.engine.interim('stuck words');
  r.ctl.stop();
  assert.equal(r.ctl.state, 'stopping');
  assert.equal(r.timers.count, 1);
  r.timers.fireAll();
  assert.equal(r.ctl.state, 'idle');
  assert.equal(r.engine.aborts, 1);
  assert.equal(r.box.value, 'stuck words');
});

test('toggle starts, then stops', () => {
  const r = rig('');
  r.ctl.toggle();
  r.engine.begin();
  assert.equal(r.ctl.state, 'listening');
  r.ctl.toggle();
  assert.equal(r.ctl.state, 'idle');
  assert.equal(r.engine.starts, 1);
});

test('start twice does not start the engine twice', () => {
  const r = rig('');
  r.ctl.start();
  r.ctl.start();
  assert.equal(r.engine.starts, 1);
});

test('the engine is started with the requested language', () => {
  const r = rig('', { lang: 'fr-FR' });
  r.ctl.start();
  assert.equal(r.engine.lastLang, 'fr-FR');
});

// ---------------------------------------------------------------- controller: silence and errors

test('an engine that ends on silence is restarted while the person is listening', () => {
  const r = rig('');
  listening(r);
  r.engine.final('spoke once');
  r.engine.end();                            // engine timed out on its own
  assert.equal(r.engine.starts, 2);
  assert.equal(r.ctl.state, 'listening');
});

test('two silent sessions in a row end listening with a plain message', () => {
  const r = rig('');
  listening(r);
  r.engine.error('no-speech');
  r.engine.end();                            // silent session 1: restarts
  assert.equal(r.engine.starts, 2);
  r.engine.error('no-speech');
  r.engine.end();                            // silent session 2: gives up
  assert.equal(r.engine.starts, 2);
  assert.equal(r.ctl.state, 'idle');
  assert.match(r.ctl.info.message, /Nothing was heard/);
});

test('a blocked microphone is explained and does not restart', () => {
  const r = rig('');
  r.ctl.start();
  r.engine.error('not-allowed');
  r.engine.end();
  assert.equal(r.ctl.state, 'error');
  assert.match(r.ctl.info.message, /microphone is blocked/);
  assert.equal(r.engine.starts, 1);
});

test('dictation switched off in macOS names the setting to turn on', () => {
  const r = rig('');
  r.ctl.start();
  r.engine.error('service-not-allowed');
  assert.match(r.ctl.info.message, /Keyboard, then Dictation/);
});

test('aborted is ignored: that is our own doing', () => {
  const r = rig('');
  listening(r);
  r.engine.error('aborted');
  assert.equal(r.ctl.state, 'listening');
});

test('an error keeps words already shown, and a new start clears the error', () => {
  const r = rig('');
  listening(r);
  r.engine.interim('half a thought');
  r.engine.error('network');
  r.engine.end();
  assert.equal(r.box.value, 'half a thought');
  assert.equal(r.ctl.state, 'error');
  r.ctl.start();
  assert.equal(r.ctl.state, 'starting');
  assert.equal(r.engine.starts, 2);
});

test('an engine that is not supported says so, plainly, and never starts', () => {
  const r = rig('', { engine: { supported: false } });
  r.ctl.start();
  assert.equal(r.ctl.state, 'error');
  assert.equal(r.ctl.info.code, 'unsupported');
  assert.match(r.ctl.info.message, /can't turn speech into text/);
  assert.equal(r.engine.starts, 0);
});

test('a read-only box refuses to start', () => {
  const r = rig('locked');
  r.box.readOnly = true;
  r.ctl.start();
  assert.equal(r.ctl.info.code, 'read-only');
  assert.equal(r.engine.starts, 0);
});

test('dismiss clears an error and goes back to idle', () => {
  const r = rig('');
  r.ctl.start();
  r.engine.error('audio-capture');
  assert.equal(r.ctl.state, 'error');
  r.ctl.dismiss();
  assert.equal(r.ctl.state, 'idle');
  assert.equal(r.ctl.info.message, '');
});

test('after destroy the engine is aborted and late results are ignored', () => {
  const r = rig('keep');
  listening(r);
  const engine = r.engine;
  r.ctl.destroy();
  assert.equal(engine.aborts, 1);
  engine.final('too late');                  // handlers are gone; nothing happens
  assert.equal(r.box.value, 'keep');
});

// ---------------------------------------------------------------- the text box wrapper

test('domTarget applies an insert, fires input, and puts the cursor after the words', () => {
  const box = new FakeBox('ab', 1);
  const target = S.domTarget(box);
  target.apply(S.computeInsert('ab', 1, 1, 'X'));
  assert.equal(box.value, 'a X b');
  assert.equal(box.selectionStart, 4);
  assert.deepEqual(box.events, ['input']);
});

test('domTarget reports disabled and read-only boxes as locked', () => {
  const box = new FakeBox('');
  const target = S.domTarget(box);
  assert.equal(target.isLocked(), false);
  box.disabled = true;
  assert.equal(target.isLocked(), true);
});

// ---------------------------------------------------------------- the browser engine

// Stands in for window.SpeechRecognition. A test calls the on* handlers the way
// a browser would, with results shaped like SpeechRecognitionEvent.
class FakeRecognition {
  constructor() { FakeRecognition.last = this; this.started = 0; this.stopped = 0; this.aborted = 0; }
  start() { this.started += 1; if (FakeRecognition.failStart) throw new Error('already started'); }
  stop() { this.stopped += 1; }
  abort() { this.aborted += 1; }
}
function result(transcript, isFinal) {
  const alt = { transcript };
  const res = [alt];
  res.isFinal = isFinal;
  return res;
}

test('browser engine: is supported only when a SpeechRecognition class exists', () => {
  assert.equal(S.createBrowserEngine({ SpeechRecognition: FakeRecognition }).supported, true);
  const none = S.createBrowserEngine({ SpeechRecognition: null });
  // Node has no window.SpeechRecognition, so with none passed in there is no engine.
  assert.equal(none.supported, false);
});

test('browser engine: asks for continuous, interim results in the requested language', () => {
  const engine = S.createBrowserEngine({ SpeechRecognition: FakeRecognition });
  engine.start({ lang: 'de-DE' });
  const rec = FakeRecognition.last;
  assert.equal(rec.continuous, true);
  assert.equal(rec.interimResults, true);
  assert.equal(rec.lang, 'de-DE');
  assert.equal(rec.started, 1);
});

test('browser engine: turns a recognition event into interim and final results', () => {
  const engine = S.createBrowserEngine({ SpeechRecognition: FakeRecognition });
  const seen = [];
  engine.onresult = (r) => seen.push(r);
  engine.start({ lang: 'en-US' });
  const rec = FakeRecognition.last;
  // results[0] is already final and was reported earlier; this event starts at index 1
  rec.onresult({
    resultIndex: 1,
    results: [result('old', true), result('hello world', true), result('how are', false), result(' you', false)]
  });
  assert.deepEqual(seen, [
    { type: 'final', text: 'hello world' },
    { type: 'interim', text: 'how are you' }
  ]);
});

test('browser engine: clears the interim when only finals arrive', () => {
  const engine = S.createBrowserEngine({ SpeechRecognition: FakeRecognition });
  const seen = [];
  engine.onresult = (r) => seen.push(r);
  engine.start({});
  FakeRecognition.last.onresult({ resultIndex: 0, results: [result('done', true)] });
  assert.deepEqual(seen[seen.length - 1], { type: 'interim', text: '' });
});

test('browser engine: passes errors and the end through, and forwards stop and abort', () => {
  const engine = S.createBrowserEngine({ SpeechRecognition: FakeRecognition });
  const errors = [];
  let ended = 0;
  engine.onerror = (e) => errors.push(e.code);
  engine.onend = () => { ended += 1; };
  engine.start({});
  const rec = FakeRecognition.last;
  rec.onerror({ error: 'not-allowed' });
  rec.onend();
  engine.stop();
  engine.abort();
  assert.deepEqual(errors, ['not-allowed']);
  assert.equal(ended, 1);
  assert.equal(rec.stopped, 1);
  assert.equal(rec.aborted, 1);
});

test('browser engine: a start that throws is reported as an error and an end', () => {
  const engine = S.createBrowserEngine({ SpeechRecognition: FakeRecognition });
  const errors = [];
  let ended = 0;
  engine.onerror = (e) => errors.push(e.code);
  engine.onend = () => { ended += 1; };
  FakeRecognition.failStart = true;
  try { engine.start({}); } finally { FakeRecognition.failStart = false; }
  assert.deepEqual(errors, ['start-failed']);
  assert.equal(ended, 1);
});

// ---------------------------------------------------------------- the whole path, with the browser engine

test('dictation end to end: browser engine, controller and text box', () => {
  const box = new FakeBox('Dear team,');
  const engine = S.createBrowserEngine({ SpeechRecognition: FakeRecognition });
  const ctl = S.createController({ engine, target: S.domTarget(box), lang: 'en-US', timers: fakeTimers() });
  ctl.start();
  const rec = FakeRecognition.last;
  rec.onstart();
  assert.equal(ctl.state, 'listening');
  rec.onresult({ resultIndex: 0, results: [result('thanks for', false)] });
  assert.equal(box.value, 'Dear team,');                       // interim stays out of the box
  rec.onresult({ resultIndex: 0, results: [result('thanks for coming today', true)] });
  assert.equal(box.value, 'Dear team, thanks for coming today');
  ctl.stop();
  rec.onend();
  assert.equal(ctl.state, 'idle');
  assert.equal(rec.stopped, 1);
});

// ---------------------------------------------------------------- messages

test('friendlyError: every code a person can hit has a readable sentence', () => {
  for (const code of ['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported', 'read-only', 'no-speech']) {
    const msg = S.friendlyError(code);
    assert.ok(msg.length > 20 && !/undefined/.test(msg), code);
  }
  assert.match(S.friendlyError('weird-new-code'), /weird-new-code/);
});
