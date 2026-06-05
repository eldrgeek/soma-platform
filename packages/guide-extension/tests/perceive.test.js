'use strict';

/**
 * Unit tests for perceive.js.
 *
 * Strategy: run the IIFE in a jsdom window with window.somaGuide = null
 * (bypasses the toggle guard), then inspect window.SomaGuideConfig and
 * window._somaAriadneMap which the IIFE exports.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs   = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'perceive.js'), 'utf8');

/* ── Fixture HTML mimicking wolfeducationalconsulting.com structure ── */
const FIXTURE_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Wolf Educational Consulting</title>
  <meta name="description" content="Expert guidance for college admissions.">
</head>
<body>
  <header>
    <nav>
      <a href="/about">About</a>
      <a href="/services">Services</a>
      <a href="/blog">Blog</a>
      <a href="/contact">Contact</a>
    </nav>
  </header>
  <main>
    <h1>College Admissions Made Clear</h1>
    <h2>Our Services</h2>
    <h2>Meet the Team</h2>
    <p>We help students craft compelling applications and navigate the admissions process with confidence.</p>
    <a class="btn-primary" href="/get-started">Get Started Today</a>
    <form id="contact-form" aria-label="Contact Us">
      <input type="text" placeholder="Your name">
      <input type="email" placeholder="Your email">
    </form>
  </main>
</body>
</html>`;

/** Run perceive.js in a jsdom window and return { cfg, map }. */
function runPerceive(html) {
  const dom = new JSDOM(html || FIXTURE_HTML, {
    url: 'https://example.com',
    runScripts: 'dangerously',
  });
  const win = dom.window;

  /* Ensure toggle guard is inactive (no existing widget). */
  win.eval('window.somaGuide = null;');

  /* CSS.escape polyfill for jsdom (not built into jsdom). */
  win.eval('window.CSS = { escape: function(s) { return s.replace(/[^\\w-]/g, "\\\\$&"); } };');

  win.eval(SRC);

  return { cfg: win.SomaGuideConfig, map: win._somaAriadneMap };
}

/* ──────────────────────────────────────────────────────────────── */

describe('perceive — page map extraction', () => {
  test('extracts title and metaDescription', () => {
    const { map } = runPerceive();
    assert.equal(map.title, 'Wolf Educational Consulting');
    assert.equal(map.metaDescription, 'Expert guidance for college admissions.');
  });

  test('extracts h1–h3 headingOutline', () => {
    const { map } = runPerceive();
    assert.ok(map.headingOutline.includes('College Admissions Made Clear'));
    assert.ok(map.headingOutline.includes('Our Services'));
  });

  test('extracts navLinks with text, href, cssSelector', () => {
    const { map } = runPerceive();
    assert.ok(map.navLinks.length >= 4, 'should find 4 nav links');
    const about = map.navLinks.find(l => l.text === 'About');
    assert.ok(about, 'About link found');
    assert.equal(about.href, '/about');
    assert.ok(about.cssSelector.length > 0, 'cssSelector present');
  });

  test('navLinks capped at 8', () => {
    const { map } = runPerceive();
    assert.ok(map.navLinks.length <= 8);
  });

  test('extracts forms with name and cssSelector', () => {
    const { map } = runPerceive();
    assert.ok(map.forms.length >= 1);
    assert.equal(map.forms[0].name, 'Contact Us');
    assert.ok(map.forms[0].cssSelector.length > 0);
  });

  test('shortTextSummary falls back to metaDescription when no paragraphs', () => {
    const { map } = runPerceive(
      '<html><head><title>T</title><meta name="description" content="fallback desc"></head><body></body></html>'
    );
    assert.equal(map.shortTextSummary, 'fallback desc');
  });

  test('handles page with no nav gracefully (zero-nav page)', () => {
    const { map } = runPerceive('<html><head><title>Bare</title></head><body><h1>Hi</h1></body></html>');
    assert.equal(map.navLinks.length, 0);
    assert.equal(map.primaryCTAs.length, 0);
  });
});

describe('buildConfig — dynamic SomaGuideConfig', () => {
  test('greeting references page title and top nav', () => {
    const { cfg } = runPerceive();
    assert.ok(cfg.persona.greeting.includes('Wolf Educational Consulting'));
    assert.ok(cfg.persona.greeting.includes('About'));
  });

  test('autoStartWalkthrough is set to site-tour', () => {
    const { cfg } = runPerceive();
    assert.equal(cfg.autoStartWalkthrough, 'site-tour');
    assert.equal(cfg.walkthroughs[0].id, 'site-tour');
  });

  test('walkthrough steps reference real nav elements', () => {
    const { cfg } = runPerceive();
    const steps = cfg.walkthroughs[0].steps;
    assert.ok(steps.length >= 4, 'should have 4 nav steps');
    steps.forEach(s => {
      assert.ok(s.narration && s.narration.length > 0, 'step has narration');
    });
  });

  test('fallback greet step when no nav found', () => {
    const { cfg } = runPerceive('<html><head><title>Blank</title></head><body></body></html>');
    const steps = cfg.walkthroughs[0].steps;
    assert.equal(steps.length, 1);
    assert.equal(steps[0].id, 'greet');
    assert.equal(steps[0].target, null);
    assert.ok(steps[0].narration.includes('Ariadne'));
  });

  test('persona name is Ariadne', () => {
    const { cfg } = runPerceive();
    assert.equal(cfg.persona.name, 'Ariadne');
    assert.equal(cfg.persona.avatar, '🧵');
  });

  test('voiceAgentId is the working bill-talk agent', () => {
    const { cfg } = runPerceive();
    assert.equal(cfg.voiceAgentId, 'agent_2401ks53q6t8e2drt1h7va3f2c52');
  });

  test('ttsProxyUrl points to bill-talk el-proxy', () => {
    const { cfg } = runPerceive();
    assert.equal(cfg.ttsProxyUrl, 'https://bill-talk.netlify.app/.netlify/functions/el-proxy');
  });
});

describe('perceive — visible-nav filter (BUG 2)', () => {
  /* Fixture that mimics Squarespace's double-render pattern:
   * - desktop nav: 3 visible top-level links
   * - hidden dropdown child inside the desktop nav
   * - mobile nav duplicate marked aria-hidden="true" */
  const HIDDEN_NAV_FIXTURE = `<!DOCTYPE html>
<html>
<head><title>Dupe Nav Test</title></head>
<body>
  <nav>
    <a href="/about">About Us</a>
    <a href="/services">Services</a>
    <a href="/resources">Resources</a>
    <div hidden>
      <a href="/services/detail">Service Detail</a>
    </div>
  </nav>
  <nav aria-hidden="true">
    <a href="/about">About Us</a>
    <a href="/services">Services</a>
    <a href="/resources">Resources</a>
  </nav>
</body>
</html>`;

  test('excludes links inside [hidden] containers', () => {
    const { map } = runPerceive(HIDDEN_NAV_FIXTURE);
    const hrefs = map.navLinks.map(l => l.href);
    assert.ok(!hrefs.includes('/services/detail'), 'hidden dropdown child excluded');
  });

  test('excludes links inside [aria-hidden="true"] nav (mobile duplicate)', () => {
    const { map } = runPerceive(HIDDEN_NAV_FIXTURE);
    assert.ok(map.navLinks.length <= 3, 'mobile nav duplicates excluded; expected ≤3 links');
  });

  test('deduplication keeps only one copy per text+href pair', () => {
    const { map } = runPerceive(HIDDEN_NAV_FIXTURE);
    const keys = map.navLinks.map(l => l.text + '|' + l.href);
    const unique = [...new Set(keys)];
    assert.equal(keys.length, unique.length, 'no duplicate text+href pairs');
  });

  test('retained links have non-empty text', () => {
    const { map } = runPerceive(HIDDEN_NAV_FIXTURE);
    map.navLinks.forEach(l => assert.ok(l.text.length > 0, 'text is non-empty'));
  });
});

describe('toggle guard', () => {
  test('calls open() on existing minimized widget and skips config generation', () => {
    const dom = new JSDOM(FIXTURE_HTML, {
      url: 'https://example.com',
      runScripts: 'dangerously',
    });
    const win = dom.window;
    win.eval('window.CSS = { escape: function(s) { return s; } };');
    /* Simulate an existing running widget in minimized mode. */
    win.eval([
      'window.somaGuide = {',
      '  mode: "minimized",',
      '  opened: false,',
      '  open: function() { this.opened = true; },',
      '  minimize: function() {}',
      '};',
    ].join('\n'));
    win.eval(SRC);
    assert.ok(win.somaGuide.opened, 'open() called on existing widget');
    assert.ok(!win.SomaGuideConfig, 'SomaGuideConfig not set when toggling');
  });
});
