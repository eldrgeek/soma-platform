/*!
 * soma-speech-fake.js — a scripted engine for tests and demos. Not loaded by
 * default. It follows the engine interface in soma-speech.js, but nothing is
 * heard: a test (or the demo page's "simulate" button) decides what was "said".
 *
 *   var fake = SomaSpeechFake.createFakeEngine();
 *   SomaSpeech.attach('#box', { engine: fake });
 *   fake.begin();                 // the engine starts capturing
 *   fake.interim('hello wor');    // the bubble shows these words
 *   fake.final('hello world');    // the words land in the box
 *   fake.end();                   // the session ends
 *
 * Written 2026-10-21 (Mike Wolf; Claude Sonnet 5.5, CCc). Bead sp-hih.
 */
(function (root) {
  'use strict';

  function createFakeEngine(opts) {
    opts = opts || {};
    var e = {
      name: 'fake',
      supported: opts.supported !== false,
      starts: 0,
      stops: 0,
      aborts: 0,
      running: false,
      lastLang: null,
      endOnStop: opts.endOnStop !== false,   // false: simulate an engine that never ends
      pendingOnStop: '',                     // words the engine finalizes when stop() is called
      onstart: null, onresult: null, onerror: null, onend: null,

      // the engine interface
      start: function (o) {
        e.starts += 1;
        e.running = true;
        e.lastLang = (o && o.lang) || null;
        if (opts.autoBegin) e.begin();
      },
      stop: function () {
        e.stops += 1;
        if (e.pendingOnStop) { var t = e.pendingOnStop; e.pendingOnStop = ''; e.final(t); }
        if (e.endOnStop) e.end();
      },
      abort: function () { e.aborts += 1; e.running = false; },

      // what a test or demo drives
      begin: function () { if (e.onstart) e.onstart(); },
      interim: function (text) { if (e.onresult) e.onresult({ type: 'interim', text: text }); },
      final: function (text) { if (e.onresult) e.onresult({ type: 'final', text: text }); },
      error: function (code, message) { if (e.onerror) e.onerror({ code: code, message: message }); },
      end: function () { e.running = false; if (e.onend) e.onend(); },

      // Say a sentence word by word, then finalize it. Resolves when done.
      speak: function (sentence, speakOpts) {
        var wordMs = speakOpts && typeof speakOpts.wordMs === 'number' ? speakOpts.wordMs : 140;
        var words = String(sentence).split(/\s+/).filter(Boolean);
        return new Promise(function (resolve) {
          var i = 0;
          function step() {
            if (i < words.length) {
              i += 1;
              e.interim(words.slice(0, i).join(' '));
              setTimeout(step, wordMs);
            } else {
              e.final(words.join(' '));
              resolve();
            }
          }
          step();
        });
      }
    };
    return e;
  }

  var api = { createFakeEngine: createFakeEngine };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root && root.document) root.SomaSpeechFake = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
