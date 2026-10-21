#!/usr/bin/env node
'use strict';
// Builds the public demo site into ./public. Netlify runs it (see netlify.toml).
// The component itself has no build step; this only gathers files so the demo
// serves the exact src/ files and cannot drift from them.
//
//   public/index.html               the demo page          (site/index.html)
//   public/soma-speech.js           the component          (src/soma-speech.js)
//   public/soma-speech-fake.js      the scripted engine    (src/soma-speech-fake.js)
//   public/test/index.html          the browser test       (test/browser-test.html)
//   public/vendor/soma-feedback/    the feedback chip      (site/vendor/soma-feedback)

const fs = require('node:fs');
const path = require('node:path');

const pkg = path.join(__dirname, '..');
const out = path.join(pkg, 'public');

function copy(from, to) {
  fs.mkdirSync(path.dirname(path.join(out, to)), { recursive: true });
  fs.copyFileSync(path.join(pkg, from), path.join(out, to));
}

fs.rmSync(out, { recursive: true, force: true });
copy('site/index.html', 'index.html');
copy('src/soma-speech.js', 'soma-speech.js');
copy('src/soma-speech-fake.js', 'soma-speech-fake.js');
fs.cpSync(path.join(pkg, 'site', 'vendor'), path.join(out, 'vendor'), { recursive: true });

// The browser test lives next to src/ in the repo and next to the built files here.
const testPage = fs.readFileSync(path.join(pkg, 'test', 'browser-test.html'), 'utf8');
const rewritten = testPage.split('../src/').join('../');
if (rewritten === testPage) throw new Error('browser-test.html: no ../src/ paths found to rewrite');
fs.mkdirSync(path.join(out, 'test'), { recursive: true });
fs.writeFileSync(path.join(out, 'test', 'index.html'), rewritten);

// The end-to-end page is one folder deeper (/test/scribe/), and carries its audio sample.
const e2ePage = fs.readFileSync(path.join(pkg, 'test', 'scribe-e2e.html'), 'utf8');
const e2eRewritten = e2ePage.split('../src/').join('../../');
if (e2eRewritten === e2ePage) throw new Error('scribe-e2e.html: no ../src/ paths found to rewrite');
fs.mkdirSync(path.join(out, 'test', 'scribe', 'assets'), { recursive: true });
fs.writeFileSync(path.join(out, 'test', 'scribe', 'index.html'), e2eRewritten);
copy('test/assets/sample-speech.wav', 'test/scribe/assets/sample-speech.wav');

for (const f of ['index.html', 'soma-speech.js', 'soma-speech-fake.js', 'test/index.html', 'test/scribe/index.html',
  'test/scribe/assets/sample-speech.wav', 'vendor/soma-feedback/soma-chip-loader.js']) {
  if (!fs.existsSync(path.join(out, f))) throw new Error('build missing ' + f);
}
console.log('built ' + path.relative(process.cwd(), out) + ' (' + fs.readdirSync(out).join(', ') + ')');
