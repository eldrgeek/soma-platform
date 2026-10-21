#!/usr/bin/env node
'use strict';
// Proves the tests can fail. Copies a source file to a temp file, breaks one
// thing at a time, runs the whole test suite against the broken copy, and
// requires a failure each time. It also runs the suite once against the real
// source first, because a red result only means something if the unbroken
// source is green.
//
//   node scripts/mutation-check.js        exit 0: every mutant was caught
//                                         exit 1: a mutant survived, or the baseline is red
//
// The source files are never modified; the script checks their hashes before and after.
//
// Recorded run: see README, "Tests".

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const pkg = path.join(__dirname, '..');
const FILES = {
  src: path.join(pkg, 'src', 'soma-speech.js'),
  server: path.join(pkg, 'server', 'speech-token.js')
};
const ENV_NAME = { src: 'SOMA_SPEECH_SRC', server: 'SOMA_SPEECH_SERVER' };
const TESTS = ['test/soma-speech.test.js', 'test/scribe.test.js', 'test/speech-token.test.js'];

const original = {};
const before = {};
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
for (const k of Object.keys(FILES)) {
  original[k] = fs.readFileSync(FILES[k], 'utf8');
  before[k] = hash(original[k]);
}

// Each mutation breaks one production line. `find` must occur exactly once in
// its file, so a refactor that moves the line makes this script fail loudly
// instead of passing.
const MUTATIONS = [
  // ---- the mic button and the insert rules (src)
  {
    file: 'src', name: 'insert clobbers the text already in the box',
    find: 'value: before + replacement + after,', replace: 'value: replacement,'
  },
  {
    file: 'src', name: 'insert keeps the selected text instead of replacing it',
    find: 'var after = value.slice(end);', replace: 'var after = value.slice(start);'
  },
  {
    file: 'src', name: 'no space is added between the old text and the new words',
    find: "var lead = before && !ENDS_WITH_OPENER.test(before) && !HUGS_PREVIOUS.test(words) ? ' ' : '';",
    replace: "var lead = '';"
  },
  {
    file: 'src', name: 'interim words are lost when listening stops',
    find: '      clearStopTimer();\n      flushInterim();\n      if (info.state === \'error\') return;',
    replace: '      clearStopTimer();\n      if (info.state === \'error\') return;'
  },
  {
    file: 'src', name: 'interim words are written into the box as if they were final',
    find: '        if (interim) gotResult = true;\n        set(info.state, interim);',
    replace: '        if (interim) gotResult = true;\n        commit(interim);\n        set(info.state, interim);'
  },
  {
    file: 'src', name: 'the engine is not restarted after it ends on silence',
    find: '        launch();                                  // engines end on silence; keep going\n        return;',
    replace: '        set(\'idle\');\n        return;'
  },
  {
    file: 'src', name: 'dictation goes in at the start of an untouched box instead of the end',
    find: 'if (len && el.selectionStart === 0 && el.selectionEnd === 0) el.setSelectionRange(len, len);',
    replace: ''
  },
  // ---- the Punctuated voice (src)
  {
    file: 'src', name: 'audio captured while the socket opens is thrown away',
    find: 'while (s.queue.length) send(s, s.queue.shift());', replace: 's.queue.length = 0;'
  },
  {
    file: 'src', name: 'stop does not ask Scribe for the text it is holding',
    find: '        send(s, null, true);\n', replace: ''
  },
  {
    file: 'src', name: 'the last words are dropped when the person stops',
    find: 'if (s.audio) { s.audio.stop(); s.audio = null; }   // sends the last words first\n      s.stopping = true;',
    replace: 's.stopping = true;\n      if (s.audio) { s.audio.stop(); s.audio = null; }'
  },
  {
    file: 'src', name: 'the token is put in the socket address without encoding',
    find: "'&token=' + encodeURIComponent(token);", replace: "'&token=' + token;"
  },
  {
    file: 'src', name: 'a silent Scribe session never stops itself',
    find: 'if (idleMs > 0 && !s.stopping) s.idle = timers.set(', replace: 'if (false) s.idle = timers.set('
  },
  {
    file: 'src', name: 'the resampler takes the wrong ratio',
    find: 'var ratio = Math.max(1, inRate / outRate);', replace: 'var ratio = 2;'
  },
  {
    file: 'src', name: 'a failed Punctuated start does not fall back to standard voice',
    find: "if (engine === scribe && e && e.code === 'scribe-unavailable' && !started && browser.supported) {",
    replace: 'if (false) {'
  },
  // ---- the token handler (server)
  {
    file: 'server', name: 'the per-person limit is off by one',
    find: 'if (mine > limits.perPerson)', replace: 'if (mine >= limits.perPerson)'
  },
  {
    file: 'server', name: 'there is no daily limit for everyone together',
    find: 'if (everyone > limits.global)', replace: 'if (false)'
  },
  {
    file: 'server', name: 'the API key is sent back to the page',
    find: 'return reply(200, { token: data.token, expires_in: 900 });',
    replace: 'return reply(200, { token: data.token, expires_in: 900, key: apiKey });'
  },
  {
    file: 'server', name: 'anyone is let in without signing in',
    find: "if (!who || !who.ok) return reply(who && who.status === 403 ? 403 : 401, { error: 'not-signed-in' });",
    replace: "if (!who) who = { ok: true, id: 'anyone' };"
  },
  {
    file: 'server', name: 'a code of the wrong length is compared anyway',
    find: 'if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, status: 401 };',
    replace: 'if (!crypto.timingSafeEqual(a, b)) return { ok: false, status: 401 };'
  }
];

function runSuite(overrides) {
  const env = Object.assign({}, process.env);
  for (const k of Object.keys(overrides)) env[ENV_NAME[k]] = overrides[k];
  const r = spawnSync(process.execPath, ['--test'].concat(TESTS), { cwd: pkg, env, encoding: 'utf8' });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soma-speech-mutant-'));
let failures = 0;

const baseline = runSuite({});
if (baseline.status !== 0) {
  console.error('BASELINE IS RED: the suite fails on the real source, so no mutant result means anything.');
  console.error(baseline.out.split('\n').slice(-30).join('\n'));
  process.exit(1);
}
console.log('baseline: green on the real source');

MUTATIONS.forEach((m) => {
  const text = original[m.file];
  const count = text.split(m.find).length - 1;
  if (count !== 1) {
    console.error(`STALE MUTATION "${m.name}": expected the target line once in ${m.file}, found ${count} times`);
    failures += 1;
    return;
  }
  const mutantFile = path.join(tmp, m.file + '.js');
  fs.writeFileSync(mutantFile, text.replace(m.find, () => m.replace));
  const r = runSuite({ [m.file]: mutantFile });
  if (r.status === 0) {
    console.error(`SURVIVED  ${m.name}  (the tests did not notice)`);
    failures += 1;
  } else {
    const failed = (r.out.match(/^not ok .*$/gm) || []).length;
    console.log(`caught    ${m.name}  (${failed} failing test lines)`);
  }
});

fs.rmSync(tmp, { recursive: true, force: true });
for (const k of Object.keys(FILES)) {
  if (hash(fs.readFileSync(FILES[k], 'utf8')) !== before[k]) {
    console.error(FILES[k] + ' changed during the run. It must not.');
    process.exit(1);
  }
}
console.log(failures ? `${failures} problem(s)` : `all ${MUTATIONS.length} mutants caught; sources untouched`);
process.exit(failures ? 1 : 0);
