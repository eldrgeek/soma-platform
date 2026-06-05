/**
 * Ariadne — site-aware perceive + dynamic config generator.
 *
 * Runs in the MAIN world (injected by background.js) before the soma-guide
 * engine loads. On each toolbar click:
 *   - Widget already running → toggle open / minimize.
 *   - Widget absent → perceive the live page DOM, build a dynamic
 *     SomaGuideConfig (site-aware greeting + walkthrough), and let the engine
 *     auto-init on the next script injection.
 *
 * The config sets autoStartWalkthrough so the engine immediately begins the
 * generated tour (and speaks the first step's narration) instead of silently
 * showing the idle panel.
 */
(function (global) {
  /* ── Ariadne persona constants ─────────────────────────────────────────── */
  var PERSONA_NAME   = 'Ariadne';
  var VOICE_AGENT_ID = 'agent_2401ks53q6t8e2drt1h7va3f2c52';
  var TTS_PROXY_URL  = 'https://bill-talk.netlify.app/.netlify/functions/el-proxy';

  /* ── Toggle if widget already running ──────────────────────────────────── */
  if (global.somaGuide) {
    if (global.somaGuide.mode === 'minimized') {
      global.somaGuide.open();
    } else {
      global.somaGuide.minimize();
    }
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

    /* Nav links — look in <nav>, <header>, role=navigation */
    var navEls   = Array.from(doc.querySelectorAll('nav a, header a, [role="navigation"] a'));
    var navLinks = navEls
      .map(function (a) {
        return {
          text:        a.textContent.trim(),
          href:        a.getAttribute('href') || '',
          cssSelector: getSel(a),
        };
      })
      .filter(function (l) { return l.text.length > 0 && l.text.length < 60; })
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
      navLinks:         navLinks,
      primaryCTAs:      primaryCTAs,
      forms:            forms,
      shortTextSummary: shortTextSummary,
    };
  }

  /* ── buildConfig(map) — dynamic SomaGuideConfig ─────────────────────────── */
  function buildConfig(map) {
    var title       = map.title || 'this page';
    var topNavNames = map.navLinks.slice(0, 3).map(function (l) { return l.text; });

    var greeting = 'Hi! I’m ' + PERSONA_NAME
      + ' — looks like you’re on “' + title + '”.'
      + (topNavNames.length > 0
          ? ' I can help you navigate to ' + topNavNames.join(', ') + '.'
          : '')
      + ' Want a quick tour, or ask me where something is?';

    /* Walkthrough: one step per top nav link, plus a CTA step if found */
    var steps = [];
    map.navLinks.slice(0, 5).forEach(function (link, i) {
      steps.push({
        id:          'nav-' + i,
        label:       link.text,
        target:      link.cssSelector,
        narration:   'This is the “' + link.text + '” section.'
          + (link.href && link.href !== '#' ? ' Click to go there.' : ''),
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
    /* Fallback when no detectable nav/CTA */
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
        shortGreeting: 'Hi! I’m ' + PERSONA_NAME + '. Need help finding something?',
        tagline:       'Your guide through any unfamiliar page.',
      },
      voiceAgentId:        VOICE_AGENT_ID,
      ttsProxyUrl:         TTS_PROXY_URL,
      /* Triggers engine to open directly into the walkthrough (audio on open). */
      autoStartWalkthrough: 'site-tour',
      walkthroughs: [{
        id:    'site-tour',
        label: 'Site Tour',
        steps: steps,
      }],
    };
  }

  /* ── Run perceive and wire up config for the engine ────────────────────── */
  var map = perceive(document);
  global.SomaGuideConfig = buildConfig(map);
  global._somaAriadneMap = map;   /* exposed for devtools inspection */

}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
