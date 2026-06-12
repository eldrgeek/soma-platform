/**
 * converter.js — bidirectional format adapter
 *
 * Converts between:
 *   A. Yeshie site.model.json fragments  (layer 3 format, VISION.md §"Site-specific beliefs")
 *   B. SomaGuideConfig                   (soma-guide engine format)
 *
 * Design: single converter, two directions — not two generators.
 * Both formats are derived from the auto-mapper PageNode (see auto-mapper.js).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * FORMAT MAPPING DOCUMENTATION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * AutoMapper PageNode → Yeshie site.model.json fragment
 * ───────────────────────────────────────────────────────
 *   PageNode.url                  → _meta.site (hostname), stateGraph.nodes[pageKey].url
 *   PageNode.title                → stateGraph.nodes[pageKey].description (prefix)
 *   PageNode.archetype            → _meta.archetypeGuess
 *   PageNode.framework            → _meta.framework
 *   PageNode.mappedAt             → _meta.lastExplored
 *   PageNode.headings             → pages[pageKey].headings[] (new field, not in YeshID model)
 *   PageNode.landmarks            → pages[pageKey].landmarks[]
 *   PageNode.affordances[role=link]     → navigation[] items
 *   PageNode.affordances[role=button]   → pages[pageKey].buttons[]
 *   PageNode.affordances[role=textbox]  → pages[pageKey].inputs[]
 *   PageNode.affordances (each)         → abstractTargets[id] with selector + anchors
 *   PageNode.primaryAffordances         → capabilities[pageKey].actions[]
 *   PageNode.formCount            → pages[pageKey].formCount
 *   walkthrough steps             → walkthroughAnnotations[] (extension to base format)
 *
 * Yeshie site.model.json fragment → SomaGuideConfig
 * ───────────────────────────────────────────────────
 *   _meta.site                    → (used to compute siteMap[0].id)
 *   navigation[]                  → siteMap[0].links[] (url + label)
 *   stateGraph.nodes              → siteMap entries
 *   walkthroughAnnotations[]      → walkthroughs[0].steps[]
 *   (persona/voice always generic in auto-generated configs)
 *
 * AutoMapper PageNode → SomaGuideConfig  (direct, preferred for Ariadne)
 * ────────────────────────────────────────────────────────────────────────
 *   pageNode.url                  → siteMap[0].url
 *   pageNode.title                → siteMap[0].title
 *   pageNode.archetype            → siteMap[0].archetype
 *   generateSteps(pageNode)       → walkthroughs[0].steps
 *   persona config is caller-supplied (Ariadne constants in perceive.js)
 *
 * ══════════════════════════════════════════════════════════════════════════
 */

var AutoMapper = (typeof require === 'function') ? require('./auto-mapper.js') : window.AutoMapper;

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function hostname(url) {
  try { return new URL(url).hostname; } catch (e) { return url || 'unknown'; }
}

function pageKeyFromUrl(url) {
  try {
    var u = new URL(url);
    var path = u.pathname.replace(/\/$/, '') || '/';
    return 'page_' + path.replace(/^\//, '').replace(/\W+/g, '-').slice(0, 40) || 'page_home';
  } catch (e) { return 'page_unknown'; }
}

function slug(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

/* ── pageNodeToYeshieFragment ────────────────────────────────────────────── */

/**
 * Convert an AutoMapper PageNode + walkthrough steps into a Yeshie-compatible
 * site.model.json fragment.
 *
 * The fragment can be merged into an existing site.model.json, or stand alone
 * as a generated map for a cold-site first encounter.
 *
 * @param {Object} pageNode         AutoMapper PageNode
 * @param {Array}  walkthroughSteps Generated steps from generateSteps()
 * @returns {Object}  Yeshie site.model.json fragment
 */
function pageNodeToYeshieFragment(pageNode, walkthroughSteps) {
  var site     = hostname(pageNode.url);
  var pageKey  = pageKeyFromUrl(pageNode.url);
  var now      = pageNode.mappedAt || new Date().toISOString();

  /* ── State graph node ─── */
  var stateNode = {
    description: (pageNode.title || 'Page') + ' — auto-mapped by auto-mapper',
    archetype: pageNode.archetype,
    signals: [],
    knownElements: {},
  };
  /* URL signal */
  try {
    var u2 = new URL(pageNode.url);
    stateNode.signals.push({
      type: 'url_matches',
      pattern: u2.pathname.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'),
    });
  } catch (e) {}

  /* Populate knownElements from headings and landmarks */
  (pageNode.headings || []).slice(0, 5).forEach(function (h) {
    var k = slug(h.text) || ('h' + h.level);
    stateNode.knownElements[k] = 'H' + h.level + ': ' + h.text;
  });

  /* ── Abstract targets from affordances ─── */
  var abstractTargets = {};
  (pageNode.affordances || []).forEach(function (aff) {
    var id = slug(aff.name) || slug(aff.selector || '') || ('aff-' + Object.keys(abstractTargets).length);
    /* avoid collisions */
    var base = id;
    var n = 2;
    while (abstractTargets[id]) { id = base + '-' + n++; }

    abstractTargets[id] = {
      description: aff.name + ' (' + aff.role + ')',
      match: {
        role: aff.role,
        name_contains: [aff.name.toLowerCase()],
      },
      cachedSelector: aff.selector || null,
      cachedConfidence: aff.selector ? 0.85 : 0,
      anchors: aff.anchors || {},
      resolvedVia: 'auto_mapper',
      resolvedOn: now,
    };
    if (aff.tag) abstractTargets[id].tag = aff.tag;
    if (aff.type) abstractTargets[id].inputType = aff.type;
  });

  /* ── Navigation ─── */
  var navigation = [];
  var navSeen = {};
  (pageNode.affordances || []).filter(function (a) { return a.role === 'link'; })
    .forEach(function (a) {
      /* Prefer the direct href field (set by extractAffordances for <a> tags).
       * Fall back to extracting href from an `a[href="..."]` selector. */
      var href = a.href || '';
      if (!href) {
        var hrefMatch = (a.selector || '').match(/^a\[href="(.+?)"\]$/);
        if (hrefMatch) href = hrefMatch[1];
      }
      var key = a.name + '|' + href;
      if (navSeen[key]) return;
      navSeen[key] = true;
      navigation.push({ text: a.name, href: href });
    });

  /* ── Pages snapshot ─── */
  var pagesSnapshot = {};
  pagesSnapshot[pageKey] = {
    url: (function () {
      try { return new URL(pageNode.url).pathname; } catch (e) { return pageNode.url; }
    }()),
    headings: (pageNode.headings || []).slice(0, 5).map(function (h) {
      return 'H' + h.level + ': ' + h.text;
    }),
    landmarks: (pageNode.landmarks || []).map(function (l) {
      return l.role + (l.label ? ' (' + l.label + ')' : '');
    }),
    buttons: (pageNode.affordances || [])
      .filter(function (a) { return a.role === 'button'; })
      .map(function (a) { return a.name; }),
    inputs: (pageNode.affordances || [])
      .filter(function (a) { return a.role === 'textbox' || a.role === 'searchbox'; })
      .map(function (a) { return a.name; }),
    formCount: pageNode.formCount || 0,
  };

  /* ── Capabilities ─── */
  var capabilities = {};
  capabilities[pageKey] = {
    url: pagesSnapshot[pageKey].url,
    actions: (pageNode.primaryAffordances || []).map(function (a) {
      var verb = (a.role === 'link') ? 'navigate to'
               : (a.role === 'button') ? 'click'
               : (a.role === 'textbox' || a.role === 'searchbox') ? 'type into'
               : 'interact with';
      return verb + ': ' + a.name;
    }),
  };

  /* ── Walkthrough annotations ─── */
  var walkthroughAnnotations = (walkthroughSteps || []).map(function (step) {
    return {
      id: step.id,
      label: step.label,
      target: step.target || null,
      narration: step.narration,
      instruction: step.instruction,
      demo: step.demo || null,
    };
  });

  return {
    _meta: {
      layer: 3,
      name: (pageNode.title || site) + ' Site Model',
      description: 'Auto-generated by auto-mapper from live DOM. Site: ' + site + '.',
      version: '0.1',
      site: site,
      framework: pageNode.framework || 'vanilla',
      archetypeGuess: pageNode.archetype || 'generic',
      lastExplored: now.slice(0, 10),
      exploredBy: 'auto-mapper heuristic scan',
      autoGenerated: true,
    },
    stateGraph: {
      nodes: (function () { var n = {}; n[pageKey] = stateNode; return n; }()),
      transitions: [],
    },
    abstractTargets: abstractTargets,
    navigation: navigation,
    pages: pagesSnapshot,
    capabilities: capabilities,
    walkthroughAnnotations: walkthroughAnnotations,
  };
}

/* ── yeshieFragmentToSomaConfig ──────────────────────────────────────────── */

/**
 * Convert a Yeshie fragment back into a SomaGuideConfig.
 * Uses walkthroughAnnotations as the tour steps.
 *
 * @param {Object} fragment         Yeshie site.model.json fragment
 * @param {Object} personaOverride  Optional persona fields to merge in
 * @returns {Object} SomaGuideConfig
 */
function yeshieFragmentToSomaConfig(fragment, personaOverride) {
  var meta  = fragment._meta || {};
  var steps = (fragment.walkthroughAnnotations || []).map(function (ann) {
    return {
      id:          ann.id,
      label:       ann.label,
      target:      ann.target || null,
      narration:   ann.narration || ann.label || '',
      instruction: ann.instruction || '',
      demo:        ann.demo || undefined,
    };
  });

  if (steps.length === 0) {
    steps.push({
      id: 'greet',
      label: 'Welcome',
      target: null,
      narration: 'Welcome! Ask me anything about this page.',
      instruction: 'Ask me anything.',
    });
  }

  var siteMapEntry = {
    id: meta.site || 'unknown',
    url: (function () {
      var nodes = (fragment.stateGraph || {}).nodes || {};
      var keys = Object.keys(nodes);
      if (!keys.length) return '';
      return (nodes[keys[0]] && nodes[keys[0]].url) ? nodes[keys[0]].url : '';
    }()),
    title: meta.name || meta.site || 'Page',
    archetype: meta.archetypeGuess || 'generic',
    links: (fragment.navigation || []).map(function (n) {
      return { label: n.text, url: n.href };
    }),
  };

  var persona = Object.assign({
    name: 'Ariadne',
    avatar: '🧵',
    greeting: 'Hi! I\'m Ariadne — ask me anything about this page, or take a tour.',
    shortGreeting: 'Hi! Need help finding something?',
  }, personaOverride || {});

  return {
    persona: persona,
    siteMap: [siteMapEntry],
    walkthroughs: [{
      id: 'auto-tour',
      label: 'Take a tour',
      steps: steps,
    }],
  };
}

/* ── pageNodeToSomaConfig — direct (preferred path for Ariadne) ─────────── */

/**
 * Convert an AutoMapper PageNode directly into a SomaGuideConfig.
 * This is the preferred fast path used by Ariadne's perceive.js.
 *
 * @param {Object} pageNode         AutoMapper PageNode
 * @param {Object} personaConfig    Full persona config object (from Ariadne constants)
 * @returns {Object} SomaGuideConfig
 */
function pageNodeToSomaConfig(pageNode, personaConfig) {
  var steps = AutoMapper.generateSteps(pageNode, personaConfig && personaConfig.name);

  return {
    persona: personaConfig || {
      name: 'Ariadne',
      avatar: '🧵',
      greeting: 'Hi! I\'m Ariadne — ask me anything, or take a tour.',
      shortGreeting: 'Hi! Need help?',
    },
    siteMap: [{
      id: hostname(pageNode.url),
      url: pageNode.url,
      title: pageNode.title,
      archetype: pageNode.archetype,
    }],
    walkthroughs: [{
      id: 'auto-tour',
      label: 'Take a tour',
      steps: steps,
    }],
  };
}

/* ── Round-trip: pageNode → Yeshie → SomaGuideConfig ────────────────────── */

/**
 * Full round-trip: PageNode → Yeshie fragment → SomaGuideConfig.
 * Useful for verifying the converter chain and for persisting the Yeshie
 * fragment while also returning a ready-to-use SomaGuideConfig.
 *
 * @param {Object} pageNode
 * @param {Object} personaOverride
 * @returns {{ fragment: Object, somaConfig: Object }}
 */
function roundTrip(pageNode, personaOverride) {
  var steps    = AutoMapper.generateSteps(pageNode, personaOverride && personaOverride.name);
  var fragment = pageNodeToYeshieFragment(pageNode, steps);
  var config   = yeshieFragmentToSomaConfig(fragment, personaOverride);
  return { fragment: fragment, somaConfig: config };
}

/* ── Exports ─────────────────────────────────────────────────────────────── */

var Converter = {
  pageNodeToYeshieFragment: pageNodeToYeshieFragment,
  yeshieFragmentToSomaConfig: yeshieFragmentToSomaConfig,
  pageNodeToSomaConfig: pageNodeToSomaConfig,
  roundTrip: roundTrip,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Converter;
} else if (typeof window !== 'undefined') {
  window.AutoMapperConverter = Converter;
}
