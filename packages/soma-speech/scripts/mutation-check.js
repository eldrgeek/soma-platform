#!/usr/bin/env node
'use strict';
// Proves the tests can fail. Copies src/soma-speech.js to a temp file, breaks one
// thing at a time, runs the test suite against the broken copy, and requires a
// failure each time. It also runs the suite once against the real source first,
// because a red result only means something if the unbroken source is green.
//
//   node scripts/mutation-check.js        exit 0: every mutant was caught
//                                         exit 1: a mutant survived, or the baseline is red
//
// The source file is never modified; the script checks its hash before and after.
//
// Recorded run: see README, "Tests".

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const pkg = path.join(__dirname, '..');
const srcPath = path.join(pkg, 'src', 'soma-speech.js');
const original = fs.readFileSync(srcPath, 'utf8');
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const before = hash(original);

// Each mutation breaks one production line. `find` must occur exactly once, so a
// refactor that moves the line makes this script fail loudly instead of passing.
const MUTATIONS = [
  {
    name: 'insert clobbers the text already in the box',
    find: 'value: before + replacement + after,',
    replace: 'value: replacement,'
  },
  {
    name: 'insert keeps the selected text instead of replacing it',
    find: 'var after = value.slice(end);',
    replace: 'var after = value.slice(start);'
  },
  {
    name: 'no space is added between the old text and the new words',
    find: "var lead = before && !ENDS_WITH_OPENER.test(before) && !HUGS_PREVIOUS.test(words) ? ' ' : '';",
    replace: "var lead = '';"
  },
  {
    name: 'interim words are lost when listening stops',
    find: '      clearStopTimer();\n      flushInterim();\n      if (info.state === \'error\') return;',
    replace: '      clearStopTimer();\n      if (info.state === \'error\') return;'
  },
  {
    name: 'interim words are written into the box as if they were final',
    find: '        if (interim) gotResult = true;\n        set(info.state, interim);',
    replace: '        if (interim) gotResult = true;\n        commit(interim);\n        set(info.state, interim);'
  },
  {
    name: 'the engine is not restarted after it ends on silence',
    find: '        launch();                                  // engines end on silence; keep going\n        return;',
    replace: '        set(\'idle\');\n        return;'
  },
  {
    name: 'dictation goes in at the start of an untouched box instead of the end',
    find: 'if (len && el.selectionStart === 0 && el.selectionEnd === 0) el.setSelectionRange(len, len);',
    replace: ''
  }
];

function runSuite(srcFile) {
  const r = spawnSync(process.execPath, ['--test', 'test/soma-speech.test.js'], {
    cwd: pkg,
    env: Object.assign({}, process.env, { SOMA_SPEECH_SRC: srcFile }),
    encoding: 'utf8'
  });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soma-speech-mutant-'));
let failures = 0;

const baseline = runSuite(srcPath);
if (baseline.status !== 0) {
  console.error('BASELINE IS RED: the suite fails on the real source, so no mutant result means anything.');
  console.error(baseline.out.split('\n').slice(-30).join('\n'));
  process.exit(1);
}
console.log('baseline: green on the real source');

MUTATIONS.forEach((m) => {
  const count = original.split(m.find).length - 1;
  if (count !== 1) {
    console.error(`STALE MUTATION "${m.name}": expected the target line once, found ${count} times`);
    failures += 1;
    return;
  }
  const mutantFile = path.join(tmp, 'soma-speech.js');
  fs.writeFileSync(mutantFile, original.replace(m.find, () => m.replace));
  const r = runSuite(mutantFile);
  if (r.status === 0) {
    console.error(`SURVIVED  ${m.name}  (the tests did not notice)`);
    failures += 1;
  } else {
    const failed = (r.out.match(/^not ok .*$/gm) || []).length;
    console.log(`caught    ${m.name}  (${failed} failing test lines)`);
  }
});

fs.rmSync(tmp, { recursive: true, force: true });
if (hash(fs.readFileSync(srcPath, 'utf8')) !== before) {
  console.error('src/soma-speech.js changed during the run. It must not.');
  process.exit(1);
}
console.log(failures ? `${failures} problem(s)` : `all ${MUTATIONS.length} mutants caught; source untouched`);
process.exit(failures ? 1 : 0);
