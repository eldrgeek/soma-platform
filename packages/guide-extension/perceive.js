/**
 * Ariadne — site-aware perceive + dynamic config generator.
 *
 * Runs in the MAIN world (injected by background.js) before the soma-guide
 * engine loads. On each toolbar click:
 *   - Widget already running → toggle open / minimize.
 *   - window.SomaGuideConfig already exists (native/site-specific config) → skip generation.
 *   - Widget absent → use window.AutoMapper (injected by background.js from vendor/auto-mapper.js)
 *     to perceive the live DOM, build a SomaGuideConfig via AutoMapperConverter, and let the
 *     engine auto-init. Falls back to built-in nav-tree perception when AutoMapper unavailable.
 *
 * Phase B wiring: background.js injects vendor/auto-mapper.js → vendor/converter.js → perceive.js
 * so window.AutoMapper and window.AutoMapperConverter are available here.
 */
(function (global) {
  /* ── Ariadne persona constants ─────────────────────────────────────────── */
  var PERSONA_NAME   = 'Ariadne';
  var VOICE_AGENT_ID = 'agent_2401ks53q6t8e2drt1h7va3f2c52';
  var TTS_PROXY_URL  = 'https://bill-talk.netlify.app/.netlify/functions/el-proxy';
  // Public VPS endpoint — works for all users. Dev: override in console to http://localhost:8131/ask
  var INFERENCE_URL  = 'https://vpsmikewolf.duckdns.org/infer/ask';

  /* ── Toggle if widget already running ──────────────────────────────────── */
  if (global.somaGuide) {
    if (global.somaGuide.mode === 'minimized') {
      global.somaGuide.open();
    } else {
      global.somaGuide.minimize();
    }
    return;
  }

  /* ── Site-aware hand-off: native config already present — skip generation.
   * Bill on Legends, Proteus on Levinese, etc. set window.SomaGuideConfig
   * before this script runs. We honour that config and do nothing. ── */
  if (global.SomaGuideConfig) {
    return;
  }

  /* ── CSS selector helper ────────────────────────────────────────────────── */
  function getSel(el) {
    if (!el || (typeof document !== 'undefined' && el === document.body)) return 'body';
    if (el.id) {
      try {
        return '#' + CSS.escape(el.id);
      } catch (e) {
        return '#' + el.id;
      }
    }
    if (el.tagName === 'A') {
      var href = el.getAttribute('href');
      if (href && href.length < 80 && href.indexOf('"') === -1 && href.indexOf('\n') === -1) {
        return 'a[href="' + href + '"]';
      }
    }
    var tag      = el.tagName.toLowerCase();
    var parent   = el.parentElement;
    if (!parent) return tag;
    var siblings = Array.from(parent.children).filter(function (c) { return c.tagName === el.tagName; });
    if (siblings.length === 1) return getSel(parent) + ' > ' + tag;
    return getSel(parent) + ' > ' + tag + ':nth-of-type(' + (siblings.indexOf(el) + 1) + ')';
  }

  /* ── Visibility helpers ─────────────────────────────────────────────────── */
  /* docHasLayout: layout APIs (getBoundingClientRect, offsetParent) are only
   * reliable in a real browser with a rendered layout. In jsdom they return 0,
   * so we gate all layout checks behind this flag. */
  var docHasLayout = typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    document.documentElement.getBoundingClientRect().width > 0;

  function isStructurallyHidden(el) {
    return !!(el.closest('[hidden]') || el.closest('[aria-hidden="true"]'));
  }

  function isVisible(el) {
    if (isStructurallyHidden(el)) return false;
    if (docHasLayout) {
      var rect = el.getBoundingClientRect();
      if (el.offsetParent === null || rect.width === 0 || rect.height === 0) return false;
    }
    return true;
  }

  /* ── Skip-link detector ─────────────────────────────────────────────────── */
  /* Matches a11y "skip to content" links that are navigation junk, not real
   * sections. Both text-pattern and href-pattern heuristics are used. */
  function isSkipLink(text, href) {
    if (/^skip\b/i.test(text)) return true;
    if (href && /^#(content|main|skip|navigation|nav|wrapper|primary)\b/i.test(href)) return true;
    return false;
  }

  /* ── buildNavTree(doc) — hierarchical nav model ─────────────────────────── */
  /* Returns an array of top-level sections, each with a children array.
   * Handles Squarespace's folder/dropdown pattern: top-level <li> elements
   * that contain nested <ul> children.
   * Junk filtered: skip-links, "Folder:" prefix entries, aria-hidden dupes. */
  function buildNavTree(doc) {
    var navContainers = Array.from(
      doc.querySelectorAll('nav, header, [role="navigation"]')
    ).filter(function (el) {
      return !el.closest('[aria-hidden="true"]') && !el.closest('[hidden]');
    });

    var seenSections = {};
    var navTree = [];

    navContainers.forEach(function (navEl) {
      /* Top-level li: any <li> with no <li> ancestor within this nav container */
      var allLi = Array.from(navEl.querySelectorAll('li'));
      var topItems = allLi.filter(function (li) {
        var p = li.parentElement;
        while (p && p !== navEl) {
          if (p.tagName === 'LI') return false;
          p = p.parentElement;
        }
        return true;
      });

      if (topItems.length === 0) return;

      topItems.forEach(function (li) {
        /* Section label: first direct <a>, <button>, or <span> child of the li.
         * One level of wrapping div/span is allowed (some themes add one). */
        var labelEl = null;
        for (var i = 0; i < li.children.length; i++) {
          var child = li.children[i];
          var tag = child.tagName;
          if (tag === 'A' || tag === 'BUTTON' || tag === 'SPAN') {
            labelEl = child;
            break;
          }
          if (tag === 'DIV' || tag === 'SPAN') {
            var inner = child.querySelector('a, button, span');
            if (inner) { labelEl = inner; break; }
          }
        }
        if (!labelEl) return;

        var rawText = labelEl.textContent.trim();
        /* Strip Squarespace mobile-nav "Folder: " prefix before any other check */
        var text = rawText.replace(/^Folder:\s*/i, '');
        var href = labelEl.getAttribute ? (labelEl.getAttribute('href') || '') : '';

        if (!text || text.length === 0 || text.length >= 60) return;
        if (isSkipLink(text, href)) return;
        if (!isVisible(labelEl)) return;

        /* Deduplicate by normalized section name */
        var sectionKey = text.toLowerCase();
        if (seenSections[sectionKey]) return;

        /* Children: links nested inside a <ul>/<ol> within this <li> */
        var children = [];
        var childList = li.querySelector('ul, ol');
        if (childList) {
          Array.from(childList.querySelectorAll('a')).forEach(function (a) {
            var ct = a.textContent.trim();
            var ch = a.getAttribute('href') || '';
            if (!ct || ct.length === 0 || ct.length >= 60) return;
            if (isSkipLink(ct, ch)) return;
            if (!isVisible(a)) return;
            children.push({ text: ct, href: ch, cssSelector: getSel(a) });
          });
        }

        seenSections[sectionKey] = true;
        navTree.push({
          section:     text,
          href:        href,
          cssSelector: getSel(labelEl),
          children:    children,
        });
      });
    });

    return navTree;
  }

  /* ── perceive(document) — structured page map ───────────────────────────── */
  function perceive(doc) {
    var title    = doc.title || '';
    var metaEl   = doc.querySelector('meta[name="description"]');
    var metaDesc = metaEl ? (metaEl.getAttribute('content') || '') : '';

    /* h1–h3 outline */
    var headingOutline = Array.from(doc.querySelectorAll('h1, h2, h3'))
      .map(function (h) { return h.textContent.trim(); })
      .filter(function (t) { return t.length > 0; })
      .slice(0, 10);

    /* Hierarchical nav tree (Squarespace folders + fallback for flat navs) */
    var navTree = buildNavTree(doc);

    /* Flat nav links — kept for fallback when no list structure is detected,
     * and for backward-compat callers that read map.navLinks.
     * Skip-links (href^="#", "Skip to …" text) are filtered here too. */
    var navSeen  = {};
    var navLinks = Array.from(doc.querySelectorAll('nav a, header a, [role="navigation"] a'))
      .filter(function (a) {
        if (isStructurallyHidden(a)) return false;
        if (docHasLayout) {
          var rect = a.getBoundingClientRect();
          if (a.offsetParent === null || rect.width === 0 || rect.height === 0) return false;
        }
        return true;
      })
      .map(function (a) {
        return {
          text:        a.textContent.trim(),
          href:        a.getAttribute('href') || '',
          cssSelector: getSel(a),
        };
      })
      .filter(function (l) {
        if (!l.text || l.text.length === 0 || l.text.length >= 60) return false;
        if (isSkipLink(l.text, l.href)) return false;
        var key = l.text + '|' + l.href;
        if (navSeen[key]) return false;
        navSeen[key] = true;
        return true;
      })
      .slice(0, 8);

    /* Primary CTAs — prominent buttons/links in main content */
    var ctaCandidates = Array.from(doc.querySelectorAll(
      'main button, main a[class*="btn"], main a[class*="cta"],' +
      'header button, [role="main"] button,' +
      'button[class*="cta"], button[class*="primary"], a[class*="cta"]'
    ));
    var ctaSeen = {};
    var primaryCTAs = [];
    ctaCandidates.forEach(function (btn) {
      if (primaryCTAs.length >= 5) return;
      var text = btn.textContent.trim();
      if (text && !ctaSeen[text] && text.length < 50) {
        ctaSeen[text] = true;
        primaryCTAs.push({ text: text, cssSelector: getSel(btn) });
      }
    });

    /* Forms */
    var forms = Array.from(doc.querySelectorAll('form')).map(function (f) {
      var legendEl = f.querySelector('legend');
      var name = f.getAttribute('aria-label')
        || (legendEl ? legendEl.textContent.trim() : '')
        || (f.id ? f.id.replace(/[-_]/g, ' ') : '')
        || 'form';
      return { name: name, cssSelector: getSel(f) };
    });

    /* Short text summary */
    var paragraphs = Array.from(doc.querySelectorAll('main p, [role="main"] p, section p'))
      .map(function (p) { return p.textContent.trim(); })
      .filter(function (t) { return t.length > 20 && t.length < 200; })
      .slice(0, 2)
      .join(' ');
    var shortTextSummary = paragraphs || metaDesc || title;

    return {
      title:            title,
      metaDescription:  metaDesc,
      headingOutline:   headingOutline,
      navTree:          navTree,
      navLinks:         navLinks,
      primaryCTAs:      primaryCTAs,
      forms:            forms,
      shortTextSummary: shortTextSummary,
    };
  }

  /* ── buildConfig(map) — dynamic SomaGuideConfig ─────────────────────────── */
  function buildConfig(map) {
    var title    = map.title || 'this page';
    var navTree  = map.navTree || [];
    var hasTree  = navTree.length > 0;

    var topNames = hasTree
      ? navTree.slice(0, 3).map(function (s) { return s.section; })
      : (map.navLinks || []).slice(0, 3).map(function (l) { return l.text; });

    var greeting = "Hi! I’m " + PERSONA_NAME
      + ' — ask me anything about this page, or I can take you on a quick tour.';

    var introPreamble = map.shortTextSummary
      ? map.shortTextSummary + ' Let me walk you through what’s here.'
      : '';

    var steps = [];

    if (hasTree) {
      /* Hierarchical tour: one step per top-level section.
       * Narration names the section's dropdown children so the user knows
       * what to expect before clicking. */
      navTree.forEach(function (section, i) {
        var childNames = section.children.map(function (c) { return c.text; });
        var narration;
        if (childNames.length > 0) {
          narration = (i === 0 && introPreamble ? introPreamble + ' ' : '')
            + '“' + section.section + '” — there you’ll find '
            + childNames.join(', ') + '.';
        } else {
          narration = (i === 0 && introPreamble ? introPreamble + ' ' : '')
            + '“' + section.section + '” — click to explore.';
        }
        steps.push({
          id:          'nav-' + i,
          label:       section.section,
          target:      section.cssSelector,
          narration:   narration,
          instruction: 'Click to visit ' + section.section,
          demo:        'hover',
        });
      });

      /* Closing step: invite the user to dive in */
      steps.push({
        id:          'nav-close',
        label:       'Explore',
        target:      null,
        narration:   'If you’d like to dive into any of these, click it in the menu.',
        instruction: 'Click any section to explore.',
      });

    } else {
      /* Flat fallback: one step per visible top-level nav link, plus a CTA
       * step if found. Used when the site has no detectable dropdown/folder
       * structure (e.g. a plain single-level nav). */
      (map.navLinks || []).slice(0, 5).forEach(function (link, i) {
        var narration = (i === 0 && introPreamble ? introPreamble + ' ' : '')
          + '“' + link.text + '” — click here to explore the '
          + link.text + ' section.';
        steps.push({
          id:          'nav-' + i,
          label:       link.text,
          target:      link.cssSelector,
          narration:   narration,
          instruction: 'Click to visit ' + link.text,
          demo:        'hover',
        });
      });
      if (map.primaryCTAs.length > 0 && steps.length < 6) {
        var cta = map.primaryCTAs[0];
        steps.push({
          id:          'cta-0',
          label:       cta.text,
          target:      cta.cssSelector,
          narration:   'And here’s the main call to action: ' + cta.text + '.',
          instruction: cta.text,
          demo:        'hover',
        });
      }
    }

    /* Ultimate fallback when no detectable nav/CTA */
    if (steps.length === 0) {
      steps.push({
        id:          'greet',
        label:       'Welcome',
        target:      null,
        narration:   'Hi! I’m ' + PERSONA_NAME + '. Ask me anything about this page and I’ll help you find your way.',
        instruction: 'Ask me anything.',
      });
    }

    return {
      persona: {
        name:          PERSONA_NAME,
        avatar:        '🧵',   /* 🧵 */
        greeting:      greeting,
        askGreeting:   'Ask me anything about this page! Or click "Take a tour" below to explore the navigation.',
        shortGreeting: "Hi! I'm " + PERSONA_NAME + '. Need help finding something?',
        tagline:       'Your guide through any unfamiliar page.',
      },
      voiceAgentId:  VOICE_AGENT_ID,
      ttsProxyUrl:   TTS_PROXY_URL,
      inferenceUrl:  INFERENCE_URL,
      /* askFirst: open into conversational ask mode instead of auto-tour */
      askFirst:      true,
      walkthroughs: [{
        id:    'site-tour',
        label: 'Take a tour',
        steps: steps,
      }],
    };
  }

  /* ── Run perceive and wire up config for the engine ────────────────────── */

  /* Fast path: use AutoMapper (injected by background.js) for richer perception.
   * AutoMapper produces full ARIA-role affordances, landmarks, archetype guess.
   * AutoMapperConverter merges the result into a SomaGuideConfig in one call.
   * Falls back to the built-in nav-tree perceive() when AutoMapper is unavailable
   * (e.g. isolated test environments, or if the vendor file failed to inject). */
  if (global.AutoMapper && global.AutoMapperConverter) {
    var personaCfg = {
      name:          PERSONA_NAME,
      avatar:        '🧵',
      greeting:      "Hi! I'm " + PERSONA_NAME + " — ask me anything about this page, or take a tour.",
      askGreeting:   'Ask me anything about this page! Or click "Take a tour" below to explore.',
      shortGreeting: "Hi! I'm " + PERSONA_NAME + '. Need help finding something?',
      tagline:       'Your guide through any unfamiliar page.',
    };
    var pageNode = global.AutoMapper.perceive(document, window);
    var generatedCfg = global.AutoMapperConverter.pageNodeToSomaConfig(pageNode, personaCfg);
    global.SomaGuideConfig = Object.assign(generatedCfg, {
      voiceAgentId: VOICE_AGENT_ID,
      ttsProxyUrl:  TTS_PROXY_URL,
      inferenceUrl: INFERENCE_URL,
      askFirst:     true,
    });
    /* Expose both formats for devtools inspection */
    global._somaAriadnePageNode = pageNode;
    global._somaAriadneMap = {
      title:           pageNode.title,
      metaDescription: pageNode.metaDescription,
      headingOutline:  pageNode.headings.map(function (h) { return h.text; }),
      archetype:       pageNode.archetype,
      framework:       pageNode.framework,
      affordances:     pageNode.affordances,
      primaryAffordances: pageNode.primaryAffordances,
    };
    return;
  }

  /* Fallback: built-in nav-tree perception (kept for environments where
   * the auto-mapper vendor files are not available). */
  var map = perceive(document);
  global.SomaGuideConfig = buildConfig(map);
  global._somaAriadneMap = map;   /* exposed for devtools inspection */

}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
