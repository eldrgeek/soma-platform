/* {{SITE_NAME}} — SOMA Guide ("Bill") per-site config
 * ---------------------------------------------------------------------------
 * This object configures the shared soma-guide engine for ONE site. The engine
 * (soma-guide.js) is delivered from the SOMA CDN and reads window.SomaGuideConfig;
 * it contains NO site-specific code. Everything site-specific lives here.
 *
 * Load order on the host page (see README / INTEGRATION-CHECKLIST):
 *   <script src=".../supabase-js UMD"></script>        (if using identity)
 *   <script src="/js/soma-auth-config.js"></script>    (window.SOMA_AUTH_CONFIG)
 *   <script src="/js/soma-auth.js"></script>           (SomaAuth)
 *   <script src="/js/knowledge.js"></script>           (window.SiteKnowledge string)
 *   <script src="/js/soma-guide-config.js"></script>   (THIS FILE)
 *   <script type="module" src=".../soma-guide.js"></script>  (engine, last)
 *
 * PLACEHOLDERS (replace all; full list in README.md):
 *   {{SITE_NAME}}          human site name, e.g. "Acme Membership"
 *   {{ASSISTANT_ID}}       stable id for this Bill, e.g. "acme-bill"
 *   {{APP_ID}}             short app key for identity/guide_seen, e.g. "acme"
 *   {{PERSONA_NAME}}       the guide's display name, e.g. "Bill"
 *   {{PERSONA_AVATAR}}     emoji/avatar, e.g. "🏀"
 *   {{INFERENCE_URL}}      answer endpoint (LLM proxy), or remove to disable Ask
 *   {{VOICE_AGENT_ID}}     ElevenLabs agent id, or remove the line to disable voice
 *   {{TTS_PROXY_URL}}      TTS proxy for narration, or remove to disable
 *
 * Identity/profile reads reuse window.SOMA_AUTH_CONFIG.url + .anonKey (the auth
 * config the host site already provides) — no separate Supabase URL needed here.
 */

window.SomaGuideConfig = {

  /* ── Shell ───────────────────────────────────────────────────────────── */
  /* Open into the decluttered conversational shell (one prompt + a few adaptive
   * chips that fade as used) instead of a stacked idle menu. */
  conversationalShell: true,

  /* ── Inference (Ask / answer-from-content) ───────────────────────────── */
  /* The endpoint Bill posts a question to for a grounded answer. Remove this
   * line to make Bill navigation/action-only with no free-text Q&A. */
  inferenceUrl: '{{INFERENCE_URL}}',

  /* Site knowledge pack — loaded from knowledge.js (include before this file). */
  knowledge: (typeof window.SiteKnowledge === 'string') ? window.SiteKnowledge : '',

  /* ── Persona ─────────────────────────────────────────────────────────── */
  persona: {
    name: '{{PERSONA_NAME}}',
    id: '{{ASSISTANT_ID}}',
    avatar: '{{PERSONA_AVATAR}}',
    greeting:
      'Hi! I\'m {{PERSONA_NAME}}, your AI guide to the {{SITE_NAME}} site. ' +
      'I can walk you through the site, answer questions, or help you get things done. ' +
      'What would you like to do?',
    shortGreeting: 'Welcome back! How can I help you today?',
    walkthroughDone:
      'Great — you\'ve seen the essentials! Explore on your own, or ask me ' +
      'anything by typing in the text chat.'
  },

  /* ── Voice agent (ElevenLabs) — remove if you don't want voice ──────────── */
  voiceAgentId: '{{VOICE_AGENT_ID}}',

  /* ── TTS narration proxy — remove if you don't want spoken narration ───── */
  ttsProxyUrl: '{{TTS_PROXY_URL}}',

  /* ── Cursor lead-in (ms after audio starts → cursor appears) ─────────── */
  cursorLeadIn: 1200,

  /* ── Clean on close: discard tour state when widget is minimised ─────── */
  cleanOnClose: true,

  /* ── Feedback intake ─────────────────────────────────────────────────── */
  /* Bill captures bug reports and feature requests inline and POSTs them
   * server-side to this Netlify function. A reviewer triages them. This is also
   * the destination for high-risk actions routed for approval (see actions). */
  feedbackUrl: '/.netlify/functions/submit-feedback',

  /* ── Conversation recording (diagnostics) ───────────────────────────── */
  /* Bill POSTs each turn + decision trace here; review in an admin dashboard. */
  telemetry: { logUrl: '/.netlify/functions/log-bill' },

  /* ── Identity (account-keyed SOMA profile) ──────────────────────────── */
  /* Anonymous visitors fall back to per-browser localStorage. Logged-in users
   * get a cross-app profile (public.soma_profiles) so Bill recognizes them,
   * skips the intro, and decays chips by what they've already been shown.
   * Requires the soma_profiles table + an authenticated SomaAuth session.
   * Remove the whole `identity` block to run localStorage-only (Tier 1). */
  identity: {
    appId: '{{APP_ID}}',
    getProfile: function () {
      try {
        var s = (window.SomaAuth && SomaAuth.session) ? SomaAuth.session : null;
        if (!s || !s.user) return Promise.resolve(null);
        var c = window.SOMA_AUTH_CONFIG;
        return fetch(c.url + '/rest/v1/soma_profiles?select=*&user_id=eq.' + s.user.id, {
          headers: { apikey: c.anonKey, Authorization: 'Bearer ' + s.access_token }
        }).then(function (r) { return r.ok ? r.json() : []; })
          .then(function (rows) { return (rows && rows[0]) || null; })
          .catch(function () { return null; });
      } catch (e) { return Promise.resolve(null); }
    },
    recordSeen: function (id) {
      try {
        var s = (window.SomaAuth && SomaAuth.session) ? SomaAuth.session : null;
        if (!s || !s.user) return Promise.resolve();
        var c = window.SOMA_AUTH_CONFIG;
        var base = c.url + '/rest/v1/soma_profiles';
        var H = { apikey: c.anonKey, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' };
        return fetch(base + '?select=guide_seen,bill_familiarity&user_id=eq.' + s.user.id, { headers: H })
          .then(function (r) { return r.ok ? r.json() : []; })
          .then(function (rows) {
            var cur = rows[0] || { guide_seen: {}, bill_familiarity: 0 };
            var gs = cur.guide_seen || {};
            gs['{{APP_ID}}'] = gs['{{APP_ID}}'] || [];
            if (gs['{{APP_ID}}'].indexOf(id) === -1) gs['{{APP_ID}}'].push(id);
            var row = {
              user_id: s.user.id, guide_seen: gs,
              bill_familiarity: (cur.bill_familiarity || 0) + 1,
              updated_at: new Date().toISOString()
            };
            return fetch(base + '?on_conflict=user_id', {
              method: 'POST',
              headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, H),
              body: JSON.stringify(row)
            });
          }).catch(function () {});
      } catch (e) { return Promise.resolve(); }
    }
  },

  /* ── Domain scope guard ──────────────────────────────────────────────── */
  /* Off-topic patterns are matched client-side before inference. contextNote is
   * prepended to the knowledge sent to the inference endpoint so the LLM also
   * deflects nuanced off-domain questions. Rewrite both for YOUR domain. */
  scopeGuard: {
    deflect: "That's a bit outside my lane — I'm here to help with the {{SITE_NAME}} site and how it works. What can I help you with here?",
    offTopicPatterns: [
      /\bweather\b/i,
      /write (me )?(a |an )?(poem|story|essay|song|haiku|sonnet|limerick)/i,
      /tell me a (joke|story)/i,
      /\b(stock price|stock market|share price)\b/i,
      /^(translate|how do you say |what is .* in [a-z]+\?)/i,
      /\brecipe for\b/i,
      /\b(latest news|news today|current events|headlines)\b/i
    ],
    contextNote: [
      'SCOPE INSTRUCTIONS FOR {{PERSONA_NAME}}:',
      'You are {{PERSONA_NAME}}, the AI assistant for the {{SITE_NAME}} site.',
      'You ONLY answer questions about: (1) this organization and its offerings,',
      '(2) how to use and navigate this site, and (3) what SOMA is and your role in it.',
      'For ANY question outside those domains, respond with exactly:',
      '"That\'s a bit outside my lane — I\'m here to help with the {{SITE_NAME}} site',
      'and how it works. What can I help you with here?"',
      'Do not attempt to answer off-domain questions even if you know the answer.'
    ].join('\n')
  },

  /* ── Site map ────────────────────────────────────────────────────────── */
  /* Used for navigation intents. path is the clean/relative page; absolute URLs
   * open in a new tab. Replace with your real pages. */
  siteMap: [
    { id: 'home',  label: 'Home',  path: 'index.html', description: 'Overview of {{SITE_NAME}}' }
    // { id: 'about', label: 'About', path: 'about.html', description: '...' },
  ],

  /* ── Walkthroughs (the "Show" rung) ──────────────────────────────────── */
  /* A walkthrough is an ordered list of steps the engine animates on the live
   * page (highlight + demo cursor + optional spoken narration). Step schema:
   *   { id?, label, target, narration, instruction, page?, demo?, requires?, substeps?[] }
   *     target:   CSS selector to point at
   *     page:     navigate here first (clean form, no .html — engine resolves)
   *     demo:     'click' | 'hover' | 'openDropdown'
   *     requires: { dropdown: '<selector>' }  — engine opens it before animating
   *     narration: spoken text; supports inline [[cue]] choreography markup
   *     instruction: the text shown beneath the step
   *   keywords: short phrases that trigger this walkthrough (keep single-word
   *     keywords rare — the engine only matches them in short messages).
   * See an existing SOMA site (e.g. Legends) for richly worked tours. */
  walkthroughs: [
    {
      id: 'site-tour',
      label: 'Site Tour',
      keywords: ['tour', 'overview', 'site tour', 'show me around', 'walk me through the site'],
      steps: [
        {
          target: 'nav',
          page: '/',
          label: 'Navigation',
          demo: 'hover',
          narration: 'Welcome! Let\'s start at the top. This navigation bar is your map to the whole site.',
          instruction: 'The nav links take you to every section.'
        }
        // Add more steps / substeps for a full tour.
      ]
    }
  ],

  /* ── Actions (the "Do" rung) ─────────────────────────────────────────── */
  /*
   * An action lets Bill DO something on the page on the user's behalf, not just
   * tell or show. The engine matches a typed request to an action, extracts
   * params from the sentence, and then EITHER executes it (reversible) OR routes
   * it to approval (high-risk). This is the core SOMA safety gate.
   *
   * ── Action schema ──────────────────────────────────────────────────────
   *   {
   *     id:        unique id (used in telemetry + guide_seen)
   *     label:     human verb phrase, e.g. "add a member" — also used for
   *                token-overlap matching when no keyword hits
   *     keywords:  array of trigger phrases (matched as substrings, lowercased)
   *     params:    array of param definitions the engine collects:
   *                  { name, label, type:'text'|'select', options?[], placeholder? }
   *                - 'select' params are matched against `options` from the
   *                  user's sentence (reliable); the first free-text param is
   *                  pulled from "named X" / "add X (as|to)" phrasing.
   *     steps:     declarative DOM operations the executor runs, visibly, in order:
   *                  { op:'click', target:'<sel>' }
   *                  { op:'fill',  target:'<sel>', param:'<paramName>' }   // or value:'literal'
   *                  { op:'select',target:'<sel>', param:'<paramName>' }
   *                All host access goes through the engine's host adapter, so
   *                the same action works embedded today and via iframe later.
   *     risk:      'high'  → NEVER executed directly. Bill routes it to approval
   *                          (posts a feature-style record to feedbackUrl, or says
   *                          it needs sign-off). Use for anything consequential or
   *                          hard to undo: publishing, deleting, emailing members,
   *                          spending money, changing access.
   *                (omit)  → REVERSIBLE. Bill confirms once, then executes the
   *                          steps on the page. Use for low-stakes, easily-undone
   *                          actions: filling a draft form, opening a panel,
   *                          starting a search, navigating with a pre-filled query.
   *     confirmText?: one-line confirmation, with {param} interpolation
   *     doneText?:    message shown after the steps run, with {param} interpolation
   *     requestText?: (high-risk only) the text submitted to the approval queue
   *   }
   *
   * REVERSIBLE vs HIGH-RISK is the whole point: the gate is about reversibility,
   * not importance. "Draft a request" is reversible → execute. "Publish to
   * production" / "remove a member" is not → approval. When unsure, mark it high.
   */
  actions: [

    /* ── Worked example: REVERSIBLE — drafts a change request, doesn't submit it.
     * The user types e.g. "ask for a new photo on the about page". Bill fills the
     * change-log request form fields and leaves it for the user to review + send.
     * Nothing is persisted by the action itself, so it's safe to just do. */
    {
      id: 'draft-change-request',
      label: 'draft a change request',
      keywords: ['request a change', 'ask for a change', 'draft a request', 'i need a change'],
      params: [
        { name: 'title',   label: 'What do you need?', type: 'text', placeholder: 'e.g. New photo on the About page' },
        { name: 'priority', label: 'Priority', type: 'select', options: ['normal', 'high', 'low'] }
      ],
      steps: [
        { op: 'fill',   target: '#req-title',    param: 'title' },
        { op: 'select', target: '#req-priority', param: 'priority' }
      ],
      confirmText: 'Draft a change request: "{title}" (priority: {priority})?',
      doneText: 'I\'ve filled in the request form — review it and hit Submit when you\'re ready.'
      /* no `risk` → reversible → Bill confirms once and runs the steps. */
    },

    /* ── Worked example: HIGH-RISK — would publish a change live. Bill NEVER does
     * this directly; it routes the request to the approval queue (feedbackUrl).
     * `steps` are omitted because the engine won't execute high-risk actions. */
    {
      id: 'publish-change',
      label: 'publish a change to production',
      keywords: ['publish', 'go live', 'deploy to production', 'make it live'],
      params: [
        { name: 'what', label: 'What should be published?', type: 'text', placeholder: 'e.g. the new About page copy' }
      ],
      risk: 'high',
      requestText: 'Publish request via Bill: {what}',
      confirmText: 'Submit "{what}" for publishing approval?'
      /* risk:'high' → routed to approval, never executed in the browser. */
    }

  ] /* end actions */

}; /* end SomaGuideConfig */
