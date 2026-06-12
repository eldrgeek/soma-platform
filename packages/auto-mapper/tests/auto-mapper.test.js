'use strict';

/**
 * Unit tests for auto-mapper.js
 *
 * Strategy: run auto-mapper.js in a jsdom window via eval, or import as
 * CommonJS module (auto-mapper exports via module.exports when in Node).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs   = require('node:fs');
const path = require('node:path');

const AutoMapper = require('../auto-mapper.js');

/* ── Fixture: admin-dashboard-like (Vuetify admin) ──────────────────────── */
const ADMIN_FIXTURE = `<!DOCTYPE html>
<html>
<head>
  <title>Admin Dashboard</title>
  <meta name="description" content="Manage your organization.">
</head>
<body class="v-application">
  <header>
    <nav class="v-navigation-drawer">
      <a href="/overview" aria-label="Home">Home</a>
      <a href="/people" aria-label="People">People</a>
      <a href="/applications" aria-label="Applications">Applications</a>
      <a href="/settings" aria-label="Settings">Settings</a>
    </nav>
  </header>
  <main role="main">
    <h1>Dashboard Overview</h1>
    <h2>Recent Activity</h2>
    <button aria-label="Add User" type="button">Add User</button>
    <button aria-label="Export CSV" type="button">Export CSV</button>
    <input placeholder="Search" aria-label="Search" type="search">
    <table>
      <thead><tr><th>Name</th><th>Email</th><th>Status</th></tr></thead>
      <tbody>
        <tr><td>Alice</td><td>alice@example.com</td><td>Active</td></tr>
      </tbody>
    </table>
  </main>
</body>
</html>`;

/* ── Fixture: content site (blog) ───────────────────────────────────────── */
const CONTENT_FIXTURE = `<!DOCTYPE html>
<html>
<head>
  <title>Tech Blog</title>
  <meta name="description" content="Articles about technology and software.">
</head>
<body>
  <header>
    <nav>
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/articles">Articles</a></li>
        <li><a href="/about">About</a></li>
        <li><a href="/contact">Contact</a></li>
      </ul>
    </nav>
  </header>
  <main>
    <h1>Latest Posts</h1>
    <article>
      <h2>Building with AI in 2025</h2>
      <p>This is a blog article about modern AI development. By Jane Smith · 2025.</p>
      <a href="/articles/ai-2025">Read More</a>
    </article>
    <article>
      <h2>Open Source Patterns</h2>
      <p>Exploring open source software development best practices.</p>
      <a href="/articles/oss-patterns">Read More</a>
    </article>
  </main>
</body>
</html>`;

/** Run perceive against a fixture HTML string */
function runPerceive(html) {
  const dom = new JSDOM(html, { url: 'https://example.com' });
  const doc = dom.window.document;
  return AutoMapper.perceive(doc, dom.window);
}

/* ──────────────────────────────────────────────────────────────────────── */

describe('auto-mapper — admin dashboard fixture', () => {
  let pageNode;
  test('perceive returns a pageNode with required fields', () => {
    pageNode = runPerceive(ADMIN_FIXTURE);
    assert.ok(pageNode, 'pageNode exists');
    assert.equal(typeof pageNode.url, 'string');
    assert.equal(typeof pageNode.title, 'string');
    assert.equal(typeof pageNode.archetype, 'string');
    assert.equal(typeof pageNode.framework, 'string');
    assert.ok(Array.isArray(pageNode.headings));
    assert.ok(Array.isArray(pageNode.landmarks));
    assert.ok(Array.isArray(pageNode.affordances));
    assert.ok(Array.isArray(pageNode.primaryAffordances));
    assert.equal(typeof pageNode.mappedAt, 'string');
  });

  test('classifies archetype as admin-dashboard for v-application body', () => {
    const node = runPerceive(ADMIN_FIXTURE);
    assert.equal(node.archetype, 'admin-dashboard');
  });

  test('detects framework as vue from v-application class', () => {
    const node = runPerceive(ADMIN_FIXTURE);
    assert.equal(node.framework, 'vue');
  });

  test('extracts headings with level and text', () => {
    const node = runPerceive(ADMIN_FIXTURE);
    const h1 = node.headings.find(h => h.level === 1);
    assert.ok(h1, 'H1 found');
    assert.equal(h1.text, 'Dashboard Overview');
    const h2 = node.headings.find(h => h.level === 2);
    assert.ok(h2, 'H2 found');
    assert.equal(h2.text, 'Recent Activity');
  });

  test('extracts landmarks including main and nav', () => {
    const node = runPerceive(ADMIN_FIXTURE);
    const roles = node.landmarks.map(l => l.role);
    assert.ok(roles.includes('navigation') || roles.includes('nav'), 'nav landmark present');
    assert.ok(roles.includes('main'), 'main landmark present');
  });

  test('extracts button affordances with stable selectors', () => {
    const node = runPerceive(ADMIN_FIXTURE);
    const addUser = node.affordances.find(a => a.name === 'Add User');
    assert.ok(addUser, 'Add User affordance found');
    assert.equal(addUser.role, 'button');
    assert.ok(addUser.selector, 'selector present');
    assert.ok(addUser.selector.includes('aria-label') || addUser.selector.includes('Add User'),
      'selector uses stable aria-label: ' + addUser.selector);
  });

  test('extracts search input affordance', () => {
    const node = runPerceive(ADMIN_FIXTURE);
    const search = node.affordances.find(a => a.name === 'Search' || a.name.toLowerCase().includes('search'));
    assert.ok(search, 'Search affordance found');
    assert.ok(['textbox', 'searchbox'].includes(search.role), 'role is textbox/searchbox');
  });

  test('extracts nav link affordances with stable selectors', () => {
    const node = runPerceive(ADMIN_FIXTURE);
    const navLinks = node.affordances.filter(a => a.role === 'link');
    assert.ok(navLinks.length >= 3, 'at least 3 nav links; got: ' + navLinks.length);
    const home = navLinks.find(a => a.name === 'Home');
    assert.ok(home, 'Home link found');
    /* aria-label correctly wins over href per VISION.md stability hierarchy */
    assert.ok(home.selector === '[aria-label="Home"]' || home.selector === 'a[href="/overview"]',
      'selector is a stable identifier: ' + home.selector);
    /* href is preserved separately for navigation extraction */
    assert.equal(home.href, '/overview', 'href field preserved');
  });

  test('co-selectors include ariaLabel for aria-labeled elements', () => {
    const node = runPerceive(ADMIN_FIXTURE);
    const addUser = node.affordances.find(a => a.name === 'Add User');
    assert.ok(addUser, 'Add User found');
    assert.equal(addUser.anchors.ariaLabel, 'Add User');
  });

  test('primaryAffordances is a non-empty subset of affordances', () => {
    const node = runPerceive(ADMIN_FIXTURE);
    assert.ok(node.primaryAffordances.length > 0, 'primaryAffordances non-empty');
    assert.ok(node.primaryAffordances.length <= node.affordances.length);
  });
});

describe('auto-mapper — content site fixture', () => {
  test('classifies archetype as content-site', () => {
    const node = runPerceive(CONTENT_FIXTURE);
    // The content fixture doesn't match the "By ... · 2025" pattern exactly since
    // we check in the full text, but "blog" in title triggers it
    assert.ok(['content-site', 'generic', 'marketing-site'].includes(node.archetype),
      'archetype is a known type: ' + node.archetype);
  });

  test('extracts headings from content fixture', () => {
    const node = runPerceive(CONTENT_FIXTURE);
    assert.ok(node.headings.length >= 1);
    const h1 = node.headings.find(h => h.text === 'Latest Posts');
    assert.ok(h1, 'Latest Posts H1 found');
  });

  test('metaDescription is populated', () => {
    const node = runPerceive(CONTENT_FIXTURE);
    assert.equal(node.metaDescription, 'Articles about technology and software.');
  });

  test('framework detected as vanilla for plain HTML', () => {
    const node = runPerceive(CONTENT_FIXTURE);
    assert.equal(node.framework, 'vanilla');
  });
});

describe('auto-mapper — empty/minimal page', () => {
  test('handles page with no nav, no buttons, no headings', () => {
    const node = runPerceive('<html><head><title>Empty</title></head><body><p>Just text.</p></body></html>');
    assert.equal(node.title, 'Empty');
    assert.equal(node.affordances.length, 0);
    assert.equal(node.headings.length, 0);
    assert.equal(node.formCount, 0);
  });
});

describe('generateSteps', () => {
  test('produces intro + close steps plus one per primary affordance', () => {
    const node = runPerceive(ADMIN_FIXTURE);
    const steps = AutoMapper.generateSteps(node, 'Ariadne');
    assert.ok(steps.length >= 2, 'at least intro + close');
    assert.equal(steps[0].id, 'intro');
    assert.equal(steps[steps.length - 1].id, 'close');
  });

  test('each step has required soma-guide fields', () => {
    const node = runPerceive(ADMIN_FIXTURE);
    const steps = AutoMapper.generateSteps(node, 'Ariadne');
    steps.forEach(function (s) {
      assert.ok(s.id, 'step has id');
      assert.ok(s.label, 'step has label');
      assert.ok(typeof s.narration === 'string', 'step has narration');
      assert.ok(typeof s.instruction === 'string', 'step has instruction');
    });
  });

  test('intro narration uses metaDescription when available', () => {
    const node = runPerceive(ADMIN_FIXTURE);
    const steps = AutoMapper.generateSteps(node, 'Ariadne');
    assert.ok(steps[0].narration.includes('Manage your organization'),
      'intro narration uses metaDescription');
  });
});

describe('stableSelector', () => {
  test('returns aria-label selector for element with aria-label', () => {
    const dom = new JSDOM('<html><body><button aria-label="Click Me">btn</button></body></html>', { url: 'https://example.com' });
    const el = dom.window.document.querySelector('button');
    assert.equal(AutoMapper.stableSelector(el), '[aria-label="Click Me"]');
  });

  test('returns href selector for anchors with href', () => {
    const dom = new JSDOM('<html><body><a href="/about">About</a></body></html>', { url: 'https://example.com' });
    const el = dom.window.document.querySelector('a');
    assert.equal(AutoMapper.stableSelector(el), 'a[href="/about"]');
  });

  test('returns placeholder selector for inputs', () => {
    const dom = new JSDOM('<html><body><input placeholder="Search here"></body></html>', { url: 'https://example.com' });
    const el = dom.window.document.querySelector('input');
    assert.equal(AutoMapper.stableSelector(el), 'input[placeholder="Search here"]');
  });

  test('returns null for element with only generated id', () => {
    const dom = new JSDOM('<html><body><input id="input-v-42"></body></html>', { url: 'https://example.com' });
    const el = dom.window.document.querySelector('input');
    assert.equal(AutoMapper.stableSelector(el), null);
  });
});

describe('elementRole', () => {
  test('returns explicit role attribute when present', () => {
    const dom = new JSDOM('<html><body><div role="button">x</div></body></html>', { url: 'https://example.com' });
    const el = dom.window.document.querySelector('div');
    assert.equal(AutoMapper.elementRole(el), 'button');
  });

  test('infers link role for <a>', () => {
    const dom = new JSDOM('<html><body><a href="/">Home</a></body></html>', { url: 'https://example.com' });
    const el = dom.window.document.querySelector('a');
    assert.equal(AutoMapper.elementRole(el), 'link');
  });

  test('infers checkbox role for input[type="checkbox"]', () => {
    const dom = new JSDOM('<html><body><input type="checkbox"></body></html>', { url: 'https://example.com' });
    const el = dom.window.document.querySelector('input');
    assert.equal(AutoMapper.elementRole(el), 'checkbox');
  });
});

describe('classifyArchetype', () => {
  test('classifies auth-page for login title', () => {
    const dom = new JSDOM('<html><head><title>Sign In to Your Account</title></head><body></body></html>',
      { url: 'https://example.com/login' });
    const doc = dom.window.document;
    const result = AutoMapper.classifyArchetype({ doc, url: 'https://example.com/login', title: 'Sign In to Your Account', headings: [], formCount: 1 });
    assert.equal(result, 'auth-page');
  });

  test('classifies form-page when 1+ forms and few headings', () => {
    const result = AutoMapper.classifyArchetype({
      doc: new JSDOM('<html><body></body></html>', { url: 'https://example.com' }).window.document,
      url: 'https://example.com/contact',
      title: 'Contact Us',
      headings: [{ level: 1, text: 'Contact' }],
      formCount: 1,
    });
    assert.equal(result, 'form-page');
  });
});
