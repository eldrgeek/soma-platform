/**
 * auto-mapper.js — heuristic DOM perception module (Phase B, Bill product path)
 *
 * Browser-injectable. Given the live DOM it produces:
 *   1. A page node: url, title, archetype guess, landmarks/headings,
 *      affordances (links/buttons/inputs) with role + accessible name +
 *      stable selector + co-selector anchors per VISION.md stability hierarchy.
 *   2. Candidate walkthrough steps for the page's primary affordances.
 *
 * Output formats:
 *   - Yeshie-compatible site.model.json fragment (same asset class as
 *     ~/Projects/yeshie/sites/{domain}/site.model.json).
 *   - SomaGuideConfig consumable directly by soma-guide engine.
 *
 * Converter lives in converter.js — see that file for the documented mapping.
 *
 * LLM extension point: search for "LLM_HOOK" to find where a labeling/
 * classification pass could be added in a future v2.
 *
 * No build step required — vanilla JS, IIFE, runs in MAIN world.
 */

/* ── GENERATED_ID_RE: matches framework-generated IDs that change between
 * renders and are useless as stable selectors. Ported from Yeshie
 * target-resolver.ts. */
var GENERATED_ID_RE = /^(input-v-\d+|checkbox-v-\d+|_react_|react-\d+|uid-\d+|yui-\d+)$/;

/* ── Archetype classification signals ──────────────────────────────────────
 * LLM_HOOK: these heuristics could be replaced or augmented by an LLM pass
 * that reads the full page and returns a richer classification. */
var ARCHETYPE_SIGNALS = {
  'admin-dashboard': [
    /sidebar.*nav/i, /data.?table/i, /crud/i, /\.v-navigation-drawer/,
    /admin|dashboard|manage|settings/i,
  ],
  'marketing-site': [
    /cta|hero|pricing|features|testimonial/i,
    /landing|homepage|home page/i,
  ],
  'content-site': [
    /blog|article|post|news|magazine/i,
    /by\s+[A-Z].*\s+·\s+\d{4}/,
  ],
  'form-page': [],  /* detected by form count below */
  'auth-page': [
    /sign.?in|log.?in|log.?out|password|forgot|reset|register|create account/i,
  ],
};

/* ── Selector stability hierarchy (VISION.md §"Selector Stability") ────────
 * 1. aria-label
 * 2. placeholder
 * 3. name attribute
 * 4. data-testid
 * 5. stable (non-generated) id
 * 6. stable developer-named class
 * 7. text-based selector (text content)
 * 8. CSS positional (fallback only — fragile) */

/**
 * Compute the most-stable CSS selector for an element, following the
 * VISION.md stability hierarchy. Returns null when no stable selector exists.
 * @param {Element} el
 * @returns {string|null}
 */
function stableSelector(el) {
  var ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return '[aria-label="' + ariaLabel.replace(/"/g, '\\"') + '"]';

  var placeholder = el.getAttribute('placeholder');
  if (placeholder) return el.tagName.toLowerCase() + '[placeholder="' + placeholder.replace(/"/g, '\\"') + '"]';

  var name = el.getAttribute('name');
  if (name) return el.tagName.toLowerCase() + '[name="' + name.replace(/"/g, '\\"') + '"]';

  var testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id') || el.getAttribute('data-cy');
  if (testId) return '[data-testid="' + testId.replace(/"/g, '\\"') + '"]';

  var id = el.id;
  if (id && !GENERATED_ID_RE.test(id)) {
    try { return '#' + CSS.escape(id); } catch (e) { return '#' + id; }
  }

  /* Href-stable selector for anchors */
  if (el.tagName === 'A') {
    var href = el.getAttribute('href');
    if (href && href.length < 120 && href.indexOf('"') === -1 && href.indexOf('\n') === -1) {
      return 'a[href="' + href + '"]';
    }
  }

  /* Developer-named class — stable if it doesn't look like a bundler hash */
  var cls = el.getAttribute('class') || '';
  var stableCls = cls.split(/\s+/).find(function (c) {
    return c.length > 2 && !/^[a-z]{1,3}\d{3,}/.test(c) && !/^[A-Za-z]{2}-/.test(c) &&
      !/^sc-/.test(c) && !/data-v-/.test(c) && !/^css-/.test(c);
  });
  if (stableCls) return '.' + stableCls;

  return null;
}

/**
 * Build a co-selector anchor set from stable attributes on an element.
 * Co-selectors let the resolver recover when the primary selector breaks
 * (e.g. on re-bundle). See VISION.md §"Co-selector anchor pattern".
 * @param {Element} el
 * @returns {Object}
 */
function coSelectors(el) {
  var anchors = {};
  var ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) anchors.ariaLabel = ariaLabel;
  var placeholder = el.getAttribute('placeholder');
  if (placeholder) anchors.placeholder = placeholder;
  var name = el.getAttribute('name');
  if (name) anchors.name = name;
  var testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
  if (testId) anchors.dataTestId = testId;
  var id = el.id;
  if (id && !GENERATED_ID_RE.test(id)) anchors.id = id;
  var text = el.textContent.trim().slice(0, 60);
  if (text) anchors.text = text;
  return anchors;
}

/**
 * Compute the ARIA role for an element (explicit role attr, or inferred from tag).
 * @param {Element} el
 * @returns {string}
 */
function elementRole(el) {
  var explicit = el.getAttribute('role');
  if (explicit) return explicit;
  var tag = el.tagName.toLowerCase();
  var roleMap = {
    a: 'link', button: 'button', input: 'textbox', textarea: 'textbox',
    select: 'combobox', form: 'form', nav: 'navigation',
    main: 'main', header: 'banner', footer: 'contentinfo',
    aside: 'complementary', section: 'region', article: 'article',
    h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading',
    h5: 'heading', h6: 'heading', table: 'table', ul: 'list', ol: 'list',
  };
  if (tag === 'input') {
    var type = el.getAttribute('type') || '';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
    if (type === 'search') return 'searchbox';
  }
  return roleMap[tag] || tag;
}

/**
 * Accessible name for an element, prioritizing explicit labels.
 * @param {Element} el
 * @param {Document} doc
 * @returns {string}
 */
function accessibleName(el, doc) {
  var ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  var labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy && doc) {
    var labelEl = doc.getElementById(labelledBy);
    if (labelEl) return labelEl.textContent.trim();
  }

  if (doc) {
    var id = el.id;
    if (id) {
      var forLabel = doc.querySelector('label[for="' + id + '"]');
      if (forLabel) return forLabel.textContent.trim();
    }
  }

  var placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder.trim();

  var title = el.getAttribute('title');
  if (title) return title.trim();

  var text = el.textContent.trim().replace(/\s+/g, ' ');
  if (text) return text.slice(0, 80);

  var alt = el.getAttribute('alt');
  if (alt) return alt.trim();

  return '';
}

/* ── Layout / visibility helpers ────────────────────────────────────────── */

var _docHasLayout = null;
function docHasLayout() {
  if (_docHasLayout !== null) return _docHasLayout;
  _docHasLayout = typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    document.documentElement.getBoundingClientRect().width > 0;
  return _docHasLayout;
}

function isVisible(el) {
  if (el.closest('[hidden]') || el.closest('[aria-hidden="true"]')) return false;
  if (docHasLayout()) {
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    if (el.offsetParent === null && el.tagName !== 'BODY' && el.tagName !== 'HTML') return false;
  }
  return true;
}

/* ── Framework detection (ported from runtime.model.json §frameworkDetection) */

function detectFramework(doc, win) {
  if (!win) win = (typeof window !== 'undefined') ? window : {};
  if (win.__vue__ || doc.querySelector('[data-v-]') || doc.querySelector('.v-application')) return 'vue';
  if (doc.querySelector('[data-reactroot]')) return 'react';
  var keys = Object.keys(win);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].startsWith && keys[i].startsWith('__reactFiber')) return 'react';
  }
  if (doc.querySelector('[ng-version]') || win.ng) return 'angular';
  return 'vanilla';
}

/* ── Landmark extraction ─────────────────────────────────────────────────── */

function extractLandmarks(doc) {
  var landmarks = [];
  var seen = {};
  var selectors = [
    'header, [role="banner"]',
    'nav, [role="navigation"]',
    'main, [role="main"]',
    'aside, [role="complementary"]',
    'footer, [role="contentinfo"]',
    'form, [role="form"]',
    '[role="search"]',
  ];
  selectors.forEach(function (sel) {
    var els = doc.querySelectorAll(sel);
    els.forEach(function (el) {
      if (el.closest('[aria-hidden="true"]') || el.closest('[hidden]')) return;
      var role = elementRole(el);
      var label = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || '';
      var key = role + '|' + label;
      if (seen[key]) return;
      seen[key] = true;
      var sel2 = stableSelector(el);
      landmarks.push({
        role: role,
        label: label || undefined,
        selector: sel2 || undefined,
      });
    });
  });
  return landmarks;
}

/* ── Heading extraction ──────────────────────────────────────────────────── */

function extractHeadings(doc) {
  return Array.from(doc.querySelectorAll('h1, h2, h3, h4'))
    .filter(function (h) { return !h.closest('[hidden]') && !h.closest('[aria-hidden="true"]'); })
    .map(function (h) {
      return {
        level: parseInt(h.tagName.slice(1), 10),
        text: h.textContent.trim(),
        selector: stableSelector(h) || h.tagName.toLowerCase(),
      };
    })
    .filter(function (h) { return h.text.length > 0 && h.text.length < 200; })
    .slice(0, 20);
}

/* ── Affordance extraction ───────────────────────────────────────────────── */

/**
 * Collect all interactive affordances (links, buttons, inputs) from the page.
 * Each affordance has:
 *   role, name, selector, anchors, tag, type? (for inputs)
 * Filtered: hidden elements, skip-links, empty names.
 * @param {Document} doc
 * @returns {Array}
 */
function extractAffordances(doc) {
  var results = [];
  var seen = {};

  function addAffordance(el) {
    if (!isVisible(el)) return;
    var role = elementRole(el);
    var name = accessibleName(el, doc);
    if (!name || name.length === 0) return;

    var sel = stableSelector(el);
    var key = role + '|' + (sel || name.slice(0, 30));
    if (seen[key]) return;
    seen[key] = true;

    var entry = {
      role: role,
      name: name,
      selector: sel,
      anchors: coSelectors(el),
      tag: el.tagName.toLowerCase(),
    };
    var type = el.getAttribute('type');
    if (type) entry.type = type;
    /* Preserve href for links — used by converter for navigation extraction */
    if (el.tagName === 'A') {
      var href = el.getAttribute('href');
      if (href) entry.href = href;
    }
    results.push(entry);
  }

  /* Primary interactive elements */
  var primary = doc.querySelectorAll(
    'a[href], button, [role="button"], [role="menuitem"], [role="option"], ' +
    'input:not([type="hidden"]), textarea, select, [role="tab"], [role="link"]'
  );
  Array.from(primary).forEach(addAffordance);

  /* Also pick up contenteditable areas */
  Array.from(doc.querySelectorAll('[contenteditable="true"]')).forEach(addAffordance);

  return results.slice(0, 60);
}

/* ── Archetype classification ────────────────────────────────────────────── */

/**
 * Guess the page archetype from headings, classes, form count, and URL.
 * LLM_HOOK: return value could be enriched by an LLM classification of the
 * full headingOutline + shortTextSummary to produce a more reliable label.
 * @param {Object} params
 * @returns {string}
 */
function classifyArchetype(params) {
  var doc = params.doc;
  var url = params.url || '';
  var title = params.title || '';
  var headings = params.headings || [];
  var formCount = params.formCount || 0;

  var fullText = [url, title].concat(headings.map(function (h) { return h.text; })).join(' ');

  /* auth-page */
  if (ARCHETYPE_SIGNALS['auth-page'].some(function (re) { return re.test(fullText); })) {
    return 'auth-page';
  }

  /* admin-dashboard — check DOM class signals too */
  var bodyClass = (doc.body && doc.body.className) || '';
  var hasAdminSignal = ARCHETYPE_SIGNALS['admin-dashboard'].some(function (re) {
    return re.test(fullText) || re.test(bodyClass);
  }) || doc.querySelector('.v-application') || doc.querySelector('[data-v-app]');
  if (hasAdminSignal) return 'admin-dashboard';

  /* form-page */
  if (formCount >= 1 && headings.length <= 3) return 'form-page';

  /* content-site */
  if (ARCHETYPE_SIGNALS['content-site'].some(function (re) { return re.test(fullText); })) {
    return 'content-site';
  }

  /* marketing-site */
  if (ARCHETYPE_SIGNALS['marketing-site'].some(function (re) { return re.test(fullText); })) {
    return 'marketing-site';
  }

  return 'generic';
}

/* ── Primary affordances for tour generation ─────────────────────────────── */

/**
 * Select the most tour-worthy affordances from a full affordance list.
 * Priority: nav links > primary buttons > CTA links > forms > other buttons.
 * @param {Array} affordances
 * @param {Document} doc
 * @returns {Array}
 */
function selectPrimaryAffordances(affordances, doc) {
  /* Nav links */
  var navEls = new Set(
    Array.from(doc.querySelectorAll('nav a, header a, [role="navigation"] a'))
  );

  var navAffordances = affordances.filter(function (a) {
    if (a.role !== 'link') return false;
    var el = a.selector ? doc.querySelector(a.selector) : null;
    return el && navEls.has(el);
  }).slice(0, 6);

  /* Primary buttons (submit, cta-class, primary-class) */
  var primaryButtons = affordances.filter(function (a) {
    return a.role === 'button' && (
      a.type === 'submit' ||
      (a.selector && /(cta|primary|submit|hero|action)/i.test(a.selector))
    );
  }).slice(0, 3);

  /* Forms */
  var formAffordances = affordances.filter(function (a) {
    return a.role === 'form';
  }).slice(0, 2);

  /* Merge: nav first, then buttons, then forms */
  var merged = navAffordances.concat(primaryButtons).concat(formAffordances);
  /* Deduplicate by selector */
  var seen = {};
  return merged.filter(function (a) {
    var k = a.selector || a.name;
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  }).slice(0, 8);
}

/* ── Main perceive function ──────────────────────────────────────────────── */

/**
 * Perceive a live DOM and return a structured page node.
 *
 * Output shape (auto-mapper PageNode):
 * {
 *   url:        string,
 *   title:      string,
 *   archetype:  string,           // heuristic guess — see LLM_HOOK
 *   framework:  string,           // 'vue' | 'react' | 'angular' | 'vanilla'
 *   metaDescription: string,
 *   headings:   [{level, text, selector}],
 *   landmarks:  [{role, label?, selector?}],
 *   affordances: [{role, name, selector, anchors, tag, type?}],
 *   primaryAffordances: [{...}],  // tour-worthy subset
 *   formCount:  number,
 *   mappedAt:   string,           // ISO timestamp
 * }
 *
 * @param {Document} doc
 * @param {Window}   win   optional (defaults to globalThis window)
 * @returns {Object}  PageNode
 */
function perceive(doc, win) {
  win = win || (typeof window !== 'undefined' ? window : {});

  /* Use win.location (the jsdom/browser window) rather than the Node.js global
   * location, which doesn't exist in Node and would silently return ''. */
  var url = (win.location && win.location.href) ? win.location.href : '';
  var title    = doc.title || '';
  var metaEl   = doc.querySelector('meta[name="description"]');
  var metaDesc = metaEl ? (metaEl.getAttribute('content') || '') : '';

  var headings     = extractHeadings(doc);
  var landmarks    = extractLandmarks(doc);
  var affordances  = extractAffordances(doc);
  var forms        = doc.querySelectorAll('form');
  var formCount    = forms.length;
  var framework    = detectFramework(doc, win);

  var archetype = classifyArchetype({
    doc: doc,
    url: url,
    title: title,
    headings: headings,
    formCount: formCount,
  });

  var primaryAffordances = selectPrimaryAffordances(affordances, doc);

  return {
    url: url,
    title: title,
    metaDescription: metaDesc,
    archetype: archetype,
    framework: framework,
    headings: headings,
    landmarks: landmarks,
    affordances: affordances,
    primaryAffordances: primaryAffordances,
    formCount: formCount,
    mappedAt: new Date().toISOString(),
  };
}

/* ── Walkthrough step generation ────────────────────────────────────────── */

/**
 * Generate candidate walkthrough steps from a PageNode's primaryAffordances.
 * Steps match the soma-guide step schema:
 *   { id, label, target, narration, instruction, demo }
 *
 * @param {Object} pageNode
 * @param {string} personaName
 * @returns {Array}
 */
function generateSteps(pageNode, personaName) {
  var name     = personaName || 'your guide';
  var steps    = [];
  var primary  = pageNode.primaryAffordances || [];

  /* Intro step */
  var introNarration = pageNode.metaDescription
    ? pageNode.metaDescription + ' Let me walk you through what\'s here.'
    : 'Welcome to ' + (pageNode.title || 'this page') + '. Let me show you what\'s available.';

  steps.push({
    id: 'intro',
    label: 'Welcome',
    target: null,
    narration: introNarration,
    instruction: 'I\'ll guide you through the key areas of this page.',
  });

  /* One step per primary affordance */
  primary.forEach(function (aff, i) {
    var demo = (aff.role === 'link' || aff.role === 'button') ? 'hover' : null;
    var narration;
    if (aff.role === 'link') {
      narration = '"' + aff.name + '" — click here to navigate to the ' + aff.name + ' section.';
    } else if (aff.role === 'button') {
      narration = '"' + aff.name + '" — this button ' + (aff.type === 'submit' ? 'submits the form' : 'triggers an action') + '.';
    } else if (aff.role === 'form' || aff.role === 'textbox') {
      narration = 'Here\'s the ' + aff.name + ' input — fill this in to interact with the page.';
      demo = null;
    } else {
      narration = '"' + aff.name + '" — click to interact.';
    }
    steps.push({
      id: 'aff-' + i,
      label: aff.name.slice(0, 40),
      target: aff.selector || null,
      narration: narration,
      instruction: aff.name,
      demo: demo || undefined,
    });
  });

  /* Closing step */
  steps.push({
    id: 'close',
    label: 'Explore',
    target: null,
    narration: 'That\'s a quick overview! If you\'d like to dive deeper, ask me anything.',
    instruction: 'Ask me anything about this page.',
  });

  return steps;
}

/* ── Exports (CommonJS + browser global) ────────────────────────────────── */

var AutoMapper = {
  perceive: perceive,
  generateSteps: generateSteps,
  stableSelector: stableSelector,
  coSelectors: coSelectors,
  elementRole: elementRole,
  accessibleName: accessibleName,
  detectFramework: detectFramework,
  classifyArchetype: classifyArchetype,
  extractLandmarks: extractLandmarks,
  extractHeadings: extractHeadings,
  extractAffordances: extractAffordances,
  selectPrimaryAffordances: selectPrimaryAffordances,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AutoMapper;
} else if (typeof window !== 'undefined') {
  window.AutoMapper = AutoMapper;
}
