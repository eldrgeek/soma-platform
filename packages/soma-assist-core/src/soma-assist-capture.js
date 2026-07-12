(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SomaAssistCapture = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // soma-assist-capture — ONE viewport screen-capture contract, TWO backends, so
  // Yeshie and Adrian share this code no matter which skin they wear (Mike,
  // 2026-07-11: "they should be sharing code wherever possible … maybe really the
  // same thing with a different costume on"). The costume that matters for capture
  // is the runtime CONTEXT:
  //
  //   • EXTENSION background (Yeshie, Adrian-as-extension) — has chrome.* . Uses
  //     chrome.debugger + CDP Page.startScreencast: PROGRAMMATIC (no user gesture),
  //     needs only the "debugger" permission (Yeshie already declares it). Returns
  //     timestamped frames — exactly what a downstream renderer (soma-cut) wants,
  //     since it re-times/mux es footage onto a narration clock anyway.
  //
  //   • PAGE / embed (Adrian embedded as a library on someone's web page) — has NO
  //     chrome.* , only DOM APIs. Uses getDisplayMedia + MediaRecorder → a webm
  //     Blob. Requires a user gesture (the browser shows its own share picker),
  //     which is correct for a person-initiated recording.
  //
  // Both backends implement the same recorder contract { start(opts), stop() }.
  // Everything is dependency-injectable (chrome.debugger, navigator.mediaDevices,
  // MediaRecorder) so the orchestration is unit-testable with fakes — the same
  // style as soma-assist-heartbeat's injected fetch.

  var DEFAULT_SCREENCAST_QUALITY = 90;

  // --- Backend A: PAGE / embed — getDisplayMedia + MediaRecorder → webm ----------
  function createDisplayMediaRecorder(opts) {
    opts = opts || {};
    var mediaDevices = opts.mediaDevices ||
      (typeof navigator !== 'undefined' && navigator.mediaDevices ? navigator.mediaDevices : null);
    var RecorderImpl = opts.MediaRecorder ||
      (typeof MediaRecorder !== 'undefined' ? MediaRecorder : null);
    var BlobImpl = opts.Blob || (typeof Blob !== 'undefined' ? Blob : null);
    if (!mediaDevices || !mediaDevices.getDisplayMedia) throw new Error('getDisplayMedia not available in this context');
    if (!RecorderImpl) throw new Error('MediaRecorder not available in this context');
    if (!BlobImpl) throw new Error('Blob not available in this context');

    var stream = null;
    var recorder = null;
    var chunks = [];

    function stopTracks() {
      if (stream && stream.getTracks) stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
      recorder = null;
    }

    async function start(startOpts) {
      startOpts = startOpts || {};
      stream = await mediaDevices.getDisplayMedia({
        video: startOpts.video || { frameRate: startOpts.fps || 30 },
        audio: startOpts.audio || false
      });
      chunks = [];
      var mimeType = startOpts.mimeType || 'video/webm';
      recorder = new RecorderImpl(stream, { mimeType: mimeType });
      recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      // A track ending (user hits "Stop sharing") is a legitimate stop, not a leak.
      var vtrack = stream.getVideoTracks ? stream.getVideoTracks()[0] : null;
      if (vtrack) vtrack.onended = function () { if (recorder && recorder.state !== 'inactive') recorder.stop(); };
      recorder.start(startOpts.timesliceMs || 250);
      return { backend: 'display-media' };
    }

    function stop() {
      return new Promise(function (resolve, reject) {
        if (!recorder) return reject(new Error('display-media recorder: not recording'));
        var rec = recorder;
        rec.onstop = function () {
          try {
            var blob = new BlobImpl(chunks, { type: rec.mimeType || 'video/webm' });
            stopTracks();
            resolve({ backend: 'display-media', format: 'webm', mimeType: blob.type, blob: blob });
          } catch (e) { reject(e); }
        };
        if (rec.state === 'inactive') rec.onstop();
        else rec.stop();
      });
    }

    return { kind: 'display-media', start: start, stop: stop };
  }

  // --- Backend B: EXTENSION background — chrome.debugger CDP screencast → frames --
  function createDebuggerScreencastRecorder(opts) {
    opts = opts || {};
    var dbg = opts.debugger ||
      (typeof chrome !== 'undefined' && chrome.debugger ? chrome.debugger : null);
    var runtime = opts.runtime ||
      (typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime : null);
    if (!dbg) throw new Error('chrome.debugger not available (extension background with the "debugger" permission is required)');
    if (opts.tabId == null) throw new Error('tabId is required for the debugger-screencast backend');
    var target = { tabId: opts.tabId };

    var frames = [];
    var attached = false;
    var onEvent = null;

    function lastError() {
      return runtime && runtime.lastError ? runtime.lastError : null;
    }

    function sendCommand(method, params) {
      return new Promise(function (resolve, reject) {
        dbg.sendCommand(target, method, params || {}, function (result) {
          var err = lastError();
          if (err) return reject(new Error(method + ': ' + err.message));
          resolve(result);
        });
      });
    }

    function attach() {
      return new Promise(function (resolve, reject) {
        dbg.attach(target, opts.protocolVersion || '1.3', function () {
          var err = lastError();
          if (err) return reject(new Error('debugger.attach: ' + err.message));
          attached = true;
          resolve();
        });
      });
    }

    function detach() {
      return new Promise(function (resolve) {
        if (!attached) return resolve();
        dbg.detach(target, function () { attached = false; resolve(); });
      });
    }

    async function start(startOpts) {
      startOpts = startOpts || {};
      frames = [];
      await attach();
      onEvent = function (source, method, params) {
        if (!source || source.tabId !== opts.tabId) return;
        if (method === 'Page.screencastFrame') {
          frames.push({
            data: params.data, // base64 image
            timestampSec: params.metadata ? params.metadata.timestamp : undefined,
            deviceWidth: params.metadata ? params.metadata.deviceWidth : undefined,
            deviceHeight: params.metadata ? params.metadata.deviceHeight : undefined
          });
          // CDP stalls the stream unless every frame is acked.
          sendCommand('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(function () {});
        }
      };
      dbg.onEvent.addListener(onEvent);
      await sendCommand('Page.enable');
      await sendCommand('Page.startScreencast', {
        format: startOpts.format || 'jpeg',
        quality: startOpts.quality == null ? DEFAULT_SCREENCAST_QUALITY : startOpts.quality,
        everyNthFrame: startOpts.everyNthFrame || 1,
        maxWidth: startOpts.maxWidth,
        maxHeight: startOpts.maxHeight
      });
      return { backend: 'debugger-screencast' };
    }

    async function stop() {
      try { await sendCommand('Page.stopScreencast'); } catch (e) { /* attach may already be gone */ }
      if (onEvent && dbg.onEvent && dbg.onEvent.removeListener) dbg.onEvent.removeListener(onEvent);
      onEvent = null;
      await detach();
      return { backend: 'debugger-screencast', format: 'frames', frameFormat: 'jpeg', frames: frames };
    }

    return { kind: 'debugger-screencast', start: start, stop: stop, _sendCommand: sendCommand };
  }

  // --- Single-frame screenshot (extension: cheap, no attach) ----------------------
  function captureVisibleTab(opts) {
    opts = opts || {};
    var tabs = opts.tabs || (typeof chrome !== 'undefined' && chrome.tabs ? chrome.tabs : null);
    var runtime = opts.runtime || (typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime : null);
    if (!tabs || !tabs.captureVisibleTab) throw new Error('chrome.tabs.captureVisibleTab not available');
    return new Promise(function (resolve, reject) {
      tabs.captureVisibleTab(opts.windowId == null ? undefined : opts.windowId, { format: opts.format || 'png' }, function (dataUrl) {
        var err = runtime && runtime.lastError ? runtime.lastError : null;
        if (err) return reject(new Error('captureVisibleTab: ' + err.message));
        resolve({ format: opts.format || 'png', dataUrl: dataUrl });
      });
    });
  }

  // --- Context detection + one factory both skins call ---------------------------
  function detectContext(env) {
    env = env || (typeof globalThis !== 'undefined' ? globalThis : {});
    if (env.chrome && env.chrome.debugger) return 'extension';
    if (env.navigator && env.navigator.mediaDevices && env.navigator.mediaDevices.getDisplayMedia) return 'page';
    return 'none';
  }

  // Return a recorder implementing { start(opts), stop() } for THIS runtime, or an
  // explicit one via opts.context ('extension' | 'page'). opts flows to the chosen
  // backend (e.g. tabId for extension). This is the single entry point Yeshie's
  // background and Adrian's page-embed both call.
  function createViewportRecorder(opts) {
    opts = opts || {};
    var context = opts.context || detectContext(opts.env);
    if (context === 'extension') return createDebuggerScreencastRecorder(opts);
    if (context === 'page') return createDisplayMediaRecorder(opts);
    throw new Error('SomaAssistCapture: no viewport-capture backend available in this context (need chrome.debugger or navigator.mediaDevices.getDisplayMedia)');
  }

  return Object.freeze({
    createViewportRecorder: createViewportRecorder,
    createDisplayMediaRecorder: createDisplayMediaRecorder,
    createDebuggerScreencastRecorder: createDebuggerScreencastRecorder,
    captureVisibleTab: captureVisibleTab,
    detectContext: detectContext,
    DEFAULT_SCREENCAST_QUALITY: DEFAULT_SCREENCAST_QUALITY
  });
});
