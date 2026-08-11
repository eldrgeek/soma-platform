/**
 * LIVE-BROWSER closure test for SOMA bet 9ee32d628af6:
 *   "Ariadne persists across same-domain navigations per tab+domain."
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * This bet sat OPEN for ~4 months on the note "needs-Mike? yes (only Mike can
 * run the live test)" (`_estate/workqueue-sources/B-roadmaps-and-gaps.md:114`).
 * That was an abdication, not a gate: opening two pages and checking whether
 * state survives navigation needs no privilege, no consent, no signature and no
 * human conversation. It needs a browser. So this is the browser.
 *
 * `ariadne-session.test.js` next door already tests `patchAriadneSession` and
 * the gate's sessionStorage semantics against MOCKS — 13 assertions, all green,
 * and they cannot close the bet, because the bet is a claim about Chrome:
 * that a registered content script re-fires on same-origin navigation and that
 * sessionStorage is genuinely per-tab-per-origin. Only a real browser can
 * falsify that.
 *
 * WHAT IT DOES
 * ------------
 * Launches an ISOLATED Chromium (own profile, own port) with the REAL unpacked
 * extension loaded, serves a real two-page origin from localhost, and runs the
 * real activation path out of background.js (`ensureGateRegistered` +
 * `injectAriadne`). Mike's own debug Chrome on :9222 is never touched, and no
 * third-party site is contacted.
 *
 * Four claims, each independently falsifiable:
 *   1. RESUME     — activate on page A, navigate to B in the SAME tab, Ariadne
 *                   comes back with no second user action.
 *   2. PER-TAB    — a NEW tab on the same origin starts clean.
 *   3. PER-ORIGIN — a different origin starts clean.
 *   4. DISMISS    — after active='0', a same-domain nav does NOT resume.
 *
 * Claims 2-4 are the ones that matter for whether the feature is *correct*
 * rather than merely *sticky*: a resume that leaks into every tab or survives a
 * dismiss would be a worse product than no persistence at all.
 *
 * RESULT 2026-08-11: 5/5 passed. Bet 9ee32d628af6 closed WON.
 *
 * RUNNING IT
 * ----------
 *   node tests/ariadne-live-persistence.test.mjs
 *
 * Needs a playwright-core install (resolved from ~/Projects/yeshie by default;
 * override with PLAYWRIGHT_CORE=/path/to/playwright-core/index.js).
 *
 * Two non-obvious requirements, both of which cost real debugging time:
 *   - `--disable-features=DisableLoadExtensionCommandLineSwitch`. Chrome 137+
 *     disabled `--load-extension` behind that flag. Without it the extension
 *     silently does not load and there is simply never a service worker — the
 *     failure looks like a timeout, not a refusal.
 *   - Use playwright's BUNDLED chromium, not `channel: 'chrome'`. The installed
 *     Chrome 151 on this machine refuses the switch even with the feature flag.
 */
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT_SRC = path.resolve(HERE, '..');

const PW = process.env.PLAYWRIGHT_CORE
  || path.join(os.homedir(), 'Projects/yeshie/node_modules/playwright-core/index.js');
const { chromium } = (await import(PW)).default;

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'ariadne-live-'));
const EXT = path.join(WORK, 'ext');
const SITE = path.join(WORK, 'site');
const PROFILE = path.join(WORK, 'profile');

/* ── Fixture: a copy of the extension with localhost pre-granted ─────────────
 * chrome.permissions.request() needs a user gesture, which a headless-ish test
 * has no way to produce. Pre-granting the test origin removes the permission
 * PROMPT from the experiment while leaving the thing under test — the content
 * script registration and the sessionStorage gate — completely untouched.  */
fs.cpSync(EXT_SRC, EXT, {
  recursive: true,
  filter: (src) => !/node_modules|[/\\]tests([/\\]|$)/.test(src),
});
const mf = path.join(EXT, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*', 'http://localhost/*'];
fs.writeFileSync(mf, JSON.stringify(manifest, null, 2));

fs.mkdirSync(SITE, { recursive: true });
for (const n of ['a', 'b']) {
  fs.writeFileSync(
    path.join(SITE, `${n}.html`),
    `<!doctype html><html><head><title>Page ${n.toUpperCase()}</title></head>` +
    `<body><h1>Page ${n.toUpperCase()}</h1></body></html>`
  );
}

function serve(port) {
  return new Promise((res) => {
    const s = http.createServer((req, r) => {
      const f = path.join(SITE, (req.url === '/' ? '/a.html' : req.url).split('?')[0]);
      if (fs.existsSync(f)) { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(fs.readFileSync(f)); }
      else { r.writeHead(404); r.end('nope'); }
    });
    s.listen(port, '127.0.0.1', () => res(s));
  });
}

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const ORIGIN_A = 'http://127.0.0.1:8199';
const ORIGIN_B = 'http://localhost:8200';   // different host AND port => different origin

const s1 = await serve(8199);
const s2 = await serve(8200);

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-position=4000,4000',   // offscreen — never steal focus
  ],
});

let [sw] = ctx.serviceWorkers();
if (!sw) {
  const warm = await ctx.newPage();
  await warm.goto(`${ORIGIN_A}/a.html`).catch(() => {});
  await warm.waitForTimeout(1500);
  [sw] = ctx.serviceWorkers();
  await warm.close().catch(() => {});
}
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 20000 });
console.log('extension id:', new URL(sw.url()).host);

const pageA = await ctx.newPage();
await pageA.goto(`${ORIGIN_A}/a.html`);
await pageA.waitForLoadState('domcontentloaded');

// The real activation path out of background.js — not a reimplementation of it.
const activation = await sw.evaluate(async (originA) => {
  const [tab] = await chrome.tabs.query({ url: originA + '/*' });
  if (!tab) return { error: 'no tab found' };
  await ensureGateRegistered(originA);
  await injectAriadne(tab.id, false);
  const reg = await chrome.scripting.getRegisteredContentScripts();
  return { tabId: tab.id, registered: reg.map(r => r.id) };
}, ORIGIN_A);
console.log('activation:', JSON.stringify(activation));

await pageA.waitForTimeout(700);
const read = (p) => p.evaluate(() => ({
  title: document.title,
  active: sessionStorage.getItem('somaAriadneActive'),
  mode: sessionStorage.getItem('somaAriadneMode'),
  widget: !!document.querySelector('.soma-guide, #soma-guide, [class*="sg-"]'),
  patched: !!(window.somaGuide && window.somaGuide._ariadnePatched),
}));

const aState = await read(pageA);
check('activation sets somaAriadneActive=1 on page A', aState.active === '1', JSON.stringify(aState));

await pageA.goto(`${ORIGIN_A}/b.html`);
await pageA.waitForTimeout(1500);   // gate is document_idle, then a round trip to the SW
const bState = await read(pageA);
check('CLAIM 1 — Ariadne resumes on same-domain nav (no second click)',
      bState.active === '1' && (bState.widget || bState.patched), JSON.stringify(bState));

const pageA2 = await ctx.newPage();
await pageA2.goto(`${ORIGIN_A}/a.html`);
await pageA2.waitForTimeout(1200);
const tab2 = await read(pageA2);
check('CLAIM 2 — a NEW tab on the same origin starts clean',
      tab2.active !== '1' && !tab2.widget, JSON.stringify(tab2));

await pageA.goto(`${ORIGIN_B}/a.html`);
await pageA.waitForTimeout(1200);
const other = await read(pageA);
check('CLAIM 3 — a DIFFERENT origin starts clean',
      other.active !== '1' && !other.widget, JSON.stringify(other));

await pageA.goto(`${ORIGIN_A}/a.html`);
await pageA.waitForTimeout(1200);
await pageA.evaluate(() => sessionStorage.setItem('somaAriadneActive', '0'));
await pageA.goto(`${ORIGIN_A}/b.html`);
await pageA.waitForTimeout(1200);
const dismissed = await read(pageA);
check('CLAIM 4 — after dismiss (active=0) a same-domain nav does NOT resume',
      dismissed.active === '0' && !dismissed.widget, JSON.stringify(dismissed));

await ctx.close();
s1.close(); s2.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} claims passed  (fixture: ${WORK})`);
process.exit(failed.length ? 1 : 0);
