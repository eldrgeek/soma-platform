import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { escapeHtml, madeText, micOptions, presentNames, renderText, seconds, teamStatusText } from '../public/view.js';

const run = promisify(execFile);

test('text from people and the team cannot inject markup', () => {
  const html = renderText('<img src=x onerror=alert(1)> **bold** `<b>`');
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<code>&lt;b&gt;<\/code>/);
  assert.equal(escapeHtml(`"'&`), '&quot;&#39;&amp;');
});

test('links are made safely and #12 points at message 12', () => {
  const html = renderText('See https://soma-forge.netlify.app/?app=a&b=1. And #12, not a#3.');
  assert.match(html, /<a href="https:\/\/soma-forge\.netlify\.app\/\?app=a&amp;b=1" target="_blank" rel="noopener">/);
  assert.match(html, /<a href="#m-12" data-ref="12">#12<\/a>/);
  assert.ok(!html.includes('#m-3'));
  // A quote next to a link cannot break out of the attribute.
  const quoted = renderText('"https://x.example/a"onmouseover="alert(1)"');
  assert.ok(!/href="[^"]*"onmouseover/.test(quoted));
  assert.ok(!quoted.includes('onmouseover="'));
});

test('paragraphs and line breaks survive', () => {
  assert.equal(renderText('one\ntwo\n\nthree'), '<p>one<br>two</p><p>three</p>');
});

test('the team status says what the team is doing and how long it takes', () => {
  const now = Date.parse('2026-10-21T12:00:30.000Z');
  const working = teamStatusText(
    { status: 'working', since: '2026-10-21T12:00:10.000Z', pickupMs: 1200 },
    { nowMs: now, lastHumanSeq: 3, teamCursor: 2, listening: true },
  );
  assert.equal(working.tone, 'working');
  assert.match(working.text, /picked up 1\.2 s after it was sent/);
  assert.match(working.text, /20 s so far/);

  const waiting = teamStatusText({ status: 'waiting' }, { nowMs: now, lastHumanAtMs: now - 3000, lastHumanSeq: 3, teamCursor: 2, listening: true });
  assert.equal(waiting.tone, 'waiting');

  const stalled = teamStatusText({ status: 'waiting' }, { nowMs: now, lastHumanAtMs: now - 45000, lastHumanSeq: 3, teamCursor: 2, listening: true });
  assert.equal(stalled.tone, 'stalled');
  assert.match(stalled.text, /45 s/);

  const idle = teamStatusText({ status: 'idle', pickupMs: 900, answerMs: 21000 }, { nowMs: now, lastHumanSeq: 3, teamCursor: 3, listening: false });
  assert.equal(idle.tone, 'idle');
  assert.match(idle.text, /picked up in 0\.9 s, answered in 21 s/);
  assert.match(idle.text, /reconnecting/);
  assert.equal(seconds(undefined), null);
});

test('a team message says what it changed', () => {
  assert.equal(
    madeText({ agreements: [3, 4], questions: [5], answered: [], highlighted: [2] }),
    'Added agreement A3, A4. Asked question 5. Highlighted question 2.',
  );
  assert.equal(madeText(null), '');
  assert.equal(madeText({ toConfirm: [7] }), 'Asked a decider to confirm, as question 7.');
});

test('presence names each person once, sorted', () => {
  const state = { 'mw@x': [{ name: 'Mike Wolf' }, { name: 'Mike Wolf' }], 'e@x': [{ name: 'Eric' }], ghost: [{}] };
  assert.deepEqual(presentNames(state), ['Eric', 'Mike Wolf']);
  assert.deepEqual(presentNames(undefined), []);
});

test('the install script copies the page, and the speech component when it exists', async () => {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const script = join(here, '../scripts/install.mjs');
  const work = await mkdtemp(join(tmpdir(), 'studio-install-'));
  const out = join(work, 'site/public/studio');
  await run(process.execPath, [script, out], { cwd: work });
  const files = await readdir(out);
  for (const name of ['index.html', 'studio.js', 'studio.css', 'view.js']) assert.ok(files.includes(name), name);
  const html = await readFile(join(out, 'index.html'), 'utf8');
  assert.match(html, /<span id="mic-slot"/);
  assert.match(html, /<script src="\/studio\/vendor\/soma-speech\/soma-speech\.js"/);
});

test('every page file the HTML names is shipped', async () => {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const html = await readFile(join(here, '../public/index.html'), 'utf8');
  // vendor/ is filled by the build from sibling packages, so it is not in public/.
  const named = [...html.matchAll(/(?:src|href)="\/studio\/([^"]+)"/g)]
    .map((match) => match[1])
    .filter((name) => !name.startsWith('vendor/'));
  assert.ok(named.includes('studio.js'));
  const files = await readdir(join(here, '../public'));
  for (const name of named) assert.ok(files.includes(name), `${name} is named by index.html but missing`);
  const js = await readFile(join(here, '../public/studio.js'), 'utf8');
  assert.match(js, /soma-chip-loader\.js/, 'the page ships the feedback chip');
});

// The soma-forge site builds from packages/soma-puppet-runtime. Netlify skips a
// build when nothing there changed, so its ignore rule must also watch this
// package, or a studio-only merge never ships (it happened to #19).
const siteToml = fileURLToPath(new URL('../../soma-puppet-runtime/netlify.toml', import.meta.url));
let siteConfig = null;
try {
  siteConfig = await readFile(siteToml, 'utf8');
} catch {
  // Not in the monorepo (the mutation check runs on a copy of this package).
}

test('the soma-forge build runs when the studio or the speech component changes', { skip: !siteConfig }, () => {
  const ignore = siteConfig.match(/^\s*ignore\s*=\s*"([^"]+)"/m)?.[1] ?? '';
  assert.match(ignore, /git diff --quiet \$CACHED_COMMIT_REF \$COMMIT_REF -- /);
  for (const path of [' . ', '../soma-studio', '../soma-speech']) assert.ok(`${ignore} `.includes(path), path);
  assert.match(siteConfig, /command = "node \.\.\/soma-studio\/scripts\/install\.mjs site\/public\/studio"/);
  assert.ok(siteConfig.indexOf('from = "/api/studio/*"') < siteConfig.indexOf('from = "/api/*"'), 'the studio route comes first');
});

test('install copies soma-speech from a sibling package into vendor/', async () => {
  const work = await mkdtemp(join(tmpdir(), 'studio-speech-'));
  const packages = join(work, 'packages');
  const here = fileURLToPath(new URL('.', import.meta.url));
  await mkdir(join(packages, 'soma-studio/scripts'), { recursive: true });
  await mkdir(join(packages, 'soma-studio/public'), { recursive: true });
  await writeFile(join(packages, 'soma-studio/scripts/install.mjs'), await readFile(join(here, '../scripts/install.mjs'), 'utf8'));
  await writeFile(join(packages, 'soma-studio/public/index.html'), '<p>studio</p>');
  await mkdir(join(packages, 'soma-speech/src'), { recursive: true });
  await writeFile(join(packages, 'soma-speech/src/soma-speech.js'), 'export {};');
  const out = join(work, 'out/studio');
  await run(process.execPath, [join(packages, 'soma-studio/scripts/install.mjs'), out], { cwd: work });
  assert.equal(await readFile(join(out, 'vendor/soma-speech/soma-speech.js'), 'utf8'), 'export {};');
});

test('the studio asks for the Punctuated voice, with the page\'s own sign-in', () => {
  const signIn = () => ({ authorization: 'Bearer abc' });
  const options = micOptions(signIn);
  assert.equal(options.mount, '#mic-slot');
  assert.equal(options.voice, 'punctuated');
  assert.equal(options.scribe.tokenUrl, '/api/speech-token');
  assert.deepEqual(options.scribe.getHeaders(), { authorization: 'Bearer abc' });
});

// studio.js cannot run under Node (it needs the browser and Supabase), so this
// pins the one line that gives the mic its options: without it the mic would
// quietly go back to the browser voice and every other test would still pass.
test('the studio page attaches its mic with those options', async () => {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const js = await readFile(join(here, '../public/studio.js'), 'utf8');
  assert.match(js, /import \{[^}]*\bmicOptions\b[^}]*\} from '\/studio\/view\.js'/);
  assert.match(js, /SomaSpeech\.attach\(ui\.composer, micOptions\(\(\) => headers\(\)\)\)/);
});
