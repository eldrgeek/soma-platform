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

/* ── Squarespace-style fixture: folders + children + skip-link + mobile dupe ── */
/* Mirrors the actual wolfeducationalconsulting.com nav structure. */
const SQUARESPACE_FIXTURE = `<!DOCTYPE html>
<html>
<head>
  <title>Wolf Educational Consulting</title>
  <meta name="description" content="Expert educational consulting services.">
</head>
<body>
  <header>
    <nav>
      <!-- a11y skip-link — must be filtered out -->
      <a href="#content">Skip to Content</a>

      <!-- Desktop nav with Squarespace folder/dropdown pattern -->
      <ul class="main-nav">
        <li class="folder">
          <a href="#">About Us</a>
          <ul class="subnav">
            <li><a href="/about/team">Our Team</a></li>
            <li><a href="/about/faq">FAQ</a></li>
            <li><a href="/about/methodology">Methodology</a></li>
            <li><a href="/about/consultants">Consultants</a></li>
          </ul>
        </li>
        <li class="folder">
          <a href="#">Services</a>
          <ul class="subnav">
            <li><a href="/services/og">Orton-Gillingham</a></li>
            <li><a href="/services/math">Math</a></li>
            <li><a href="/services/exec">Executive Functioning</a></li>
            <li><a href="/services/parent">Parent Support</a></li>
          </ul>
        </li>
        <li class="folder">
          <a href="#">Resources</a>
          <ul class="subnav">
            <li><a href="/resources/financial">Financial Support</a></li>
            <li><a href="/resources/guide">Parent Resource Guide</a></li>
          </ul>
        </li>
        <li class="folder">
          <a href="#">Contact</a>
          <ul class="subnav">
            <li><a href="/contact/start">Take the Next Step</a></li>
            <li><a href="/contact/connect">Stay Connected</a></li>
            <li><a href="/contact/location">Location</a></li>
          </ul>
        </li>
      </ul>

      <!-- Mobile nav duplicate: aria-hidden when desktop, uses "Folder:" prefix -->
      <div class="mobile-nav" aria-hidden="true">
        <ul>
          <li><a href="#">Folder: About Us</a></li>
          <li><a href="/about/team">Our Team</a></li>
          <li><a href="#">Folder: Services</a></li>
          <li><a href="/services/og">Orton-Gillingham</a></li>
          <li><a href="#">Folder: Resources</a></li>
          <li><a href="#">Folder: Contact</a></li>
        </ul>
      </div>
    </nav>
  </header>
  <main>
    <h1>Expert Educational Guidance</h1>
    <p>We help students unlock their potential through personalized educational support.</p>
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
  test('askFirst mode is enabled with inferenceUrl', () => {
    const { cfg } = runPerceive();
    assert.equal(cfg.askFirst, true);
    assert.ok(cfg.inferenceUrl && cfg.inferenceUrl.length > 0, 'inferenceUrl is set');
  });

  test('walkthrough id is site-tour and label is Take a tour', () => {
    const { cfg } = runPerceive();
    assert.equal(cfg.walkthroughs[0].id, 'site-tour');
    assert.equal(cfg.walkthroughs[0].label, 'Take a tour');
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

describe('perceive — Squarespace hierarchical nav (WEC pattern)', () => {
  test('navTree has 4 top-level sections', () => {
    const { map } = runPerceive(SQUARESPACE_FIXTURE);
    assert.equal(map.navTree.length, 4, 'should find 4 sections');
  });

  test('navTree section names are About Us, Services, Resources, Contact', () => {
    const { map } = runPerceive(SQUARESPACE_FIXTURE);
    const names = map.navTree.map(s => s.section);
    assert.ok(names.includes('About Us'), 'About Us found');
    assert.ok(names.includes('Services'), 'Services found');
    assert.ok(names.includes('Resources'), 'Resources found');
    assert.ok(names.includes('Contact'), 'Contact found');
  });

  test('About Us section has correct children', () => {
    const { map } = runPerceive(SQUARESPACE_FIXTURE);
    const aboutUs = map.navTree.find(s => s.section === 'About Us');
    assert.ok(aboutUs, 'About Us section found');
    const childNames = aboutUs.children.map(c => c.text);
    assert.ok(childNames.includes('Our Team'), 'Our Team in children');
    assert.ok(childNames.includes('FAQ'), 'FAQ in children');
    assert.ok(childNames.includes('Methodology'), 'Methodology in children');
    assert.ok(childNames.includes('Consultants'), 'Consultants in children');
  });

  test('Services section has correct children', () => {
    const { map } = runPerceive(SQUARESPACE_FIXTURE);
    const services = map.navTree.find(s => s.section === 'Services');
    assert.ok(services, 'Services section found');
    const childNames = services.children.map(c => c.text);
    assert.ok(childNames.includes('Orton-Gillingham'), 'Orton-Gillingham in children');
    assert.ok(childNames.includes('Math'), 'Math in children');
    assert.ok(childNames.includes('Executive Functioning'), 'Executive Functioning in children');
    assert.ok(childNames.includes('Parent Support'), 'Parent Support in children');
  });

  test('Resources section has correct children', () => {
    const { map } = runPerceive(SQUARESPACE_FIXTURE);
    const resources = map.navTree.find(s => s.section === 'Resources');
    assert.ok(resources, 'Resources section found');
    const childNames = resources.children.map(c => c.text);
    assert.ok(childNames.includes('Financial Support'), 'Financial Support in children');
    assert.ok(childNames.includes('Parent Resource Guide'), 'Parent Resource Guide in children');
  });

  test('no Skip to Content in navTree sections', () => {
    const { map } = runPerceive(SQUARESPACE_FIXTURE);
    const names = map.navTree.map(s => s.section);
    assert.ok(!names.some(n => /skip/i.test(n)), 'no skip-link sections in navTree');
  });

  test('no Folder: prefix in navTree section names', () => {
    const { map } = runPerceive(SQUARESPACE_FIXTURE);
    map.navTree.forEach(s => {
      assert.ok(!/^Folder:/i.test(s.section), 'no "Folder:" prefix in: ' + s.section);
    });
  });

  test('no duplicate section names in navTree', () => {
    const { map } = runPerceive(SQUARESPACE_FIXTURE);
    const names = map.navTree.map(s => s.section.toLowerCase());
    const unique = [...new Set(names)];
    assert.equal(names.length, unique.length, 'no duplicate section names');
  });

  test('tour steps use hierarchical narration naming child pages', () => {
    const { cfg } = runPerceive(SQUARESPACE_FIXTURE);
    const steps = cfg.walkthroughs[0].steps;
    const aboutStep = steps.find(s => s.label === 'About Us');
    assert.ok(aboutStep, 'About Us step exists');
    assert.ok(aboutStep.narration.includes('Our Team'), 'narration includes Our Team');
    assert.ok(aboutStep.narration.includes('FAQ'), 'narration includes FAQ');
    const servicesStep = steps.find(s => s.label === 'Services');
    assert.ok(servicesStep, 'Services step exists');
    assert.ok(servicesStep.narration.includes('Orton-Gillingham'), 'narration includes Orton-Gillingham');
  });

  test('tour has a closing step inviting the user to click a section', () => {
    const { cfg } = runPerceive(SQUARESPACE_FIXTURE);
    const steps = cfg.walkthroughs[0].steps;
    const closeStep = steps[steps.length - 1];
    assert.equal(closeStep.id, 'nav-close', 'last step is nav-close');
    assert.ok(closeStep.narration.toLowerCase().includes('click'), 'closing step mentions click');
  });

  test('tour has exactly 5 steps (4 sections + closing)', () => {
    const { cfg } = runPerceive(SQUARESPACE_FIXTURE);
    const steps = cfg.walkthroughs[0].steps;
    assert.equal(steps.length, 5, '4 section steps + 1 closing step');
  });

  test('askFirst and inferenceUrl set for Squarespace fixture', () => {
    const { cfg } = runPerceive(SQUARESPACE_FIXTURE);
    assert.equal(cfg.askFirst, true);
    assert.ok(cfg.inferenceUrl && cfg.inferenceUrl.length > 0, 'inferenceUrl is set');
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
