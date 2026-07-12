'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Capture = require(path.join(__dirname, '../src/soma-assist-capture.js'));

describe('soma-assist-capture — context detection', () => {
  test('extension context when chrome.debugger present', () => {
    assert.equal(Capture.detectContext({ chrome: { debugger: {} } }), 'extension');
  });
  test('page context when getDisplayMedia present', () => {
    assert.equal(Capture.detectContext({ navigator: { mediaDevices: { getDisplayMedia: () => {} } } }), 'page');
  });
  test('none when neither present', () => {
    assert.equal(Capture.detectContext({}), 'none');
  });
  test('createViewportRecorder throws a clear error in a bare context', () => {
    assert.throws(() => Capture.createViewportRecorder({ env: {} }), /no viewport-capture backend/);
  });
});

describe('soma-assist-capture — debugger screencast backend (extension skin)', () => {
  // A fake chrome.debugger that records commands and lets us emit CDP events.
  function fakeDebugger() {
    const listeners = [];
    return {
      commands: [],
      attached: null,
      detached: false,
      attach(target, ver, cb) { this.attached = { target, ver }; cb(); },
      detach(target, cb) { this.detached = true; cb(); },
      sendCommand(target, method, params, cb) { this.commands.push({ method, params }); cb({ ok: true }); },
      onEvent: {
        addListener(fn) { listeners.push(fn); },
        removeListener(fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
        _emit(source, method, params) { listeners.slice().forEach((fn) => fn(source, method, params)); },
        _count() { return listeners.length; }
      }
    };
  }

  test('start attaches, enables Page, starts screencast; frames are collected + acked; stop detaches', async () => {
    const dbg = fakeDebugger();
    const rec = Capture.createDebuggerScreencastRecorder({ debugger: dbg, runtime: {}, tabId: 42 });
    await rec.start({ format: 'jpeg', quality: 80 });

    assert.deepEqual(dbg.attached.target, { tabId: 42 });
    const methods = dbg.commands.map((c) => c.method);
    assert.ok(methods.includes('Page.enable'), 'enables Page domain');
    assert.ok(methods.includes('Page.startScreencast'), 'starts screencast');
    assert.equal(dbg.onEvent._count(), 1, 'one frame listener registered');

    // Emit two frames; each must be acked with its sessionId.
    dbg.onEvent._emit({ tabId: 42 }, 'Page.screencastFrame', { data: 'AAAA', sessionId: 1, metadata: { timestamp: 0.10, deviceWidth: 1280, deviceHeight: 800 } });
    dbg.onEvent._emit({ tabId: 42 }, 'Page.screencastFrame', { data: 'BBBB', sessionId: 2, metadata: { timestamp: 0.20 } });
    // a frame from a DIFFERENT tab must be ignored
    dbg.onEvent._emit({ tabId: 99 }, 'Page.screencastFrame', { data: 'XXXX', sessionId: 3, metadata: { timestamp: 0.30 } });
    await new Promise((r) => setTimeout(r, 0)); // let ack microtasks flush

    const result = await rec.stop();
    assert.equal(result.format, 'frames');
    assert.equal(result.frames.length, 2, 'only frames for this tab collected');
    assert.deepEqual(result.frames.map((f) => f.data), ['AAAA', 'BBBB']);
    assert.equal(result.frames[0].timestampSec, 0.10);
    const acks = dbg.commands.filter((c) => c.method === 'Page.screencastFrameAck').map((c) => c.params.sessionId);
    assert.deepEqual(acks, [1, 2], 'each collected frame is acked by sessionId');
    assert.ok(dbg.commands.some((c) => c.method === 'Page.stopScreencast'));
    assert.equal(dbg.detached, true, 'debugger detached on stop');
    assert.equal(dbg.onEvent._count(), 0, 'listener removed on stop');
  });

  test('missing tabId is a clear error', () => {
    assert.throws(() => Capture.createDebuggerScreencastRecorder({ debugger: fakeDebugger(), runtime: {} }), /tabId is required/);
  });
});

describe('soma-assist-capture — display-media backend (embed skin)', () => {
  function fakeStream() {
    const track = { kind: 'video', stopped: false, stop() { this.stopped = true; }, onended: null };
    return { _track: track, getTracks() { return [track]; }, getVideoTracks() { return [track]; } };
  }
  // Minimal MediaRecorder fake driven manually.
  function FakeRecorder(stream, opts) {
    this.stream = stream; this.mimeType = opts.mimeType; this.state = 'inactive';
    this.ondataavailable = null; this.onstop = null;
    this.start = () => { this.state = 'recording'; };
    this.stop = () => {
      this.state = 'inactive';
      if (this.ondataavailable) this.ondataavailable({ data: { size: 4 } });
      if (this.onstop) this.onstop();
    };
  }

  test('start opens getDisplayMedia, stop returns a webm blob and stops tracks', async () => {
    const stream = fakeStream();
    let asked = null;
    const rec = Capture.createDisplayMediaRecorder({
      mediaDevices: { getDisplayMedia: async (c) => { asked = c; return stream; } },
      MediaRecorder: FakeRecorder,
      Blob: class { constructor(parts, o) { this.parts = parts; this.type = o.type; this.size = parts.length; } }
    });
    await rec.start({ fps: 24 });
    assert.ok(asked.video, 'requested a video stream');
    const out = await rec.stop();
    assert.equal(out.format, 'webm');
    assert.equal(out.mimeType, 'video/webm');
    assert.ok(out.blob, 'returns a blob');
    assert.equal(stream._track.stopped, true, 'display stream tracks stopped on stop()');
  });
});
