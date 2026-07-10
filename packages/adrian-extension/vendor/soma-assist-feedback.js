(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SomaAssistFeedback = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var COMMON_PATTERNS = [
    /\b(assist[- ]?core|shared\s+ui|chip|chat\s+window|resize|drag|geometry|composer|shadow\s*dom)\b/i,
    /\b(both\s+apps|all\s+assistants|common\s+code|shared\s+component)\b/i,
    /\b(soma-assist|assist window|floating assistant)\b/i
  ];
  var YESHIE_PATTERNS = [
    /\b(yeshie|recipe|payload|script\s+runtime|browser\s+automation|rpa|sites\/)\b/i,
    /\b(multi[- ]page\s+flow|flow\s+engine|extension\s+recipe)\b/i
  ];
  var GUIDE_PATTERNS = [
    /\b(adrian|soma[- ]?guide|ariadne|walkthrough|guide\s+mode|tour)\b/i,
    /\b(page\s+help|onboarding\s+tour|highlight)\b/i
  ];

  var APP_ALIASES = {
    yeshie: 'yeshie',
    'soma-guide': 'soma-guide',
    somaguide: 'soma-guide',
    adrian: 'soma-guide',
    guide: 'soma-guide',
    common: 'common',
    shared: 'common'
  };

  function normalizeAppId(value) {
    var key = String(value || '').trim().toLowerCase();
    if (!key) return '';
    return APP_ALIASES[key] || key;
  }

  function matchesAny(text, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i].test(text)) return true;
    }
    return false;
  }

  /**
   * Classify feedback as yeshie | soma-guide | common.
   * common-code changes affect both apps; app-specific ones affect only that app.
   *
   * Rules (highest priority first):
   * 1. Explicit route override when valid.
   * 2. Common-code signals in text/area → common (even if filed from one app).
   * 3. Strong yeshie-only or guide-only signals → that app.
   * 4. Fall back to the submitting source app (adrian → soma-guide).
   */
  function classifyFeedback(input) {
    input = input || {};
    var sourceApp = normalizeAppId(input.sourceApp || input.appId || input.app) || 'common';
    var text = [input.description, input.area, input.pageContext, input.title]
      .filter(Boolean).map(String).join('\n');
    var explicitRaw = input.route != null && input.route !== ''
      ? input.route
      : (input.explicitRoute != null && input.explicitRoute !== '' ? input.explicitRoute : null);
    if (explicitRaw != null) {
      var explicit = normalizeAppId(explicitRaw);
      if (explicit === 'yeshie' || explicit === 'soma-guide' || explicit === 'common') {
        return { route: explicit, reason: 'explicit-route', sourceApp: sourceApp };
      }
    }
    if (matchesAny(text, COMMON_PATTERNS)) {
      return { route: 'common', reason: 'common-signal', sourceApp: sourceApp };
    }
    var yeshieHit = matchesAny(text, YESHIE_PATTERNS);
    var guideHit = matchesAny(text, GUIDE_PATTERNS);
    if (yeshieHit && !guideHit) {
      return { route: 'yeshie', reason: 'yeshie-signal', sourceApp: sourceApp };
    }
    if (guideHit && !yeshieHit) {
      return { route: 'soma-guide', reason: 'guide-signal', sourceApp: sourceApp };
    }
    if (yeshieHit && guideHit) {
      return { route: 'common', reason: 'cross-app-signal', sourceApp: sourceApp };
    }
    if (sourceApp === 'yeshie' || sourceApp === 'soma-guide') {
      return { route: sourceApp, reason: 'source-app', sourceApp: sourceApp };
    }
    return { route: 'common', reason: 'default-common', sourceApp: sourceApp || 'common' };
  }

  function slugify(text, maxLen) {
    maxLen = maxLen || 48;
    var slug = String(text || 'feedback')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, maxLen)
      .replace(/-+$/g, '');
    return slug || 'feedback';
  }

  function isoDate(d) {
    d = d || new Date();
    return d.toISOString().slice(0, 10);
  }

  function buildBoardCard(meta) {
    meta = meta || {};
    var route = meta.route || 'common';
    var description = String(meta.description || '').trim();
    var title = meta.title || (route + ' feedback: ' + description.slice(0, 72));
    var filename = isoDate(meta.createdAt ? new Date(meta.createdAt) : null) +
      '-' + route + '-feedback-' + slugify(description) + '.md';
    var sourceSurface = meta.sourceSurface || 'extension';
    var lines = [
      '---',
      'source-surface: ' + sourceSurface,
      'needs-mike: false',
      '---',
      '',
      '# ' + title,
      '',
      '<!--SOMA-CARD-META',
      'needs-mike: false',
      'auto-dispatch: true',
      'tags: [outer-loop, assist-feedback, wp3]',
      'app: ' + route,
      'source-app: ' + (meta.sourceApp || route),
      'route: ' + route,
      'request-id: ' + (meta.requestId || ''),
      'feedback-id: ' + (meta.feedbackId || ''),
      'SOMA-CARD-META-->',
      '',
      '# ' + route + ' — assist feedback',
      '',
      '**Source app:** ' + (meta.sourceApp || route),
      '**Route:** ' + route + ' (' + (meta.reason || 'classified') + ')',
      '**Page:** ' + (meta.pageContext || '(unknown)'),
      '**Area:** ' + (meta.area || '(unspecified)'),
      '**Type:** ' + (meta.type || 'feedback'),
      '',
      '## Verbatim ask',
      '',
      description,
      '',
      '_Filed via soma-assist-core feedback affordance (WP3). Auto-dispatch card for build-queue consumer allowlist._',
      ''
    ];
    return { filename: filename, markdown: lines.join('\n'), relativePath: 'board/inbox/' + filename };
  }

  function restHeaders(anonKey, extra) {
    var headers = {
      apikey: anonKey,
      Authorization: 'Bearer ' + anonKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    };
    if (extra) {
      Object.keys(extra).forEach(function (k) { headers[k] = extra[k]; });
    }
    return headers;
  }

  function createFeedbackClient(options) {
    options = options || {};
    if (!options.url || !options.anonKey) {
      throw new Error('url and anonKey are required');
    }
    var fetchImpl = options.fetch || (typeof globalThis !== 'undefined' && globalThis.fetch && globalThis.fetch.bind(globalThis));
    if (!fetchImpl) throw new Error('fetch is required');
    var boardWriter = options.boardWriter || null;

    return {
      classify: classifyFeedback,
      buildBoardCard: buildBoardCard,
      async submit(input) {
        input = input || {};
        var description = String(input.description || '').trim();
        if (!description) throw new Error('description is required');
        var classification = classifyFeedback(input);
        var route = classification.route;
        var type = input.type || 'feedback';
        if (['bug', 'feature', 'feedback'].indexOf(type) === -1) type = 'feedback';

        var cardStub = buildBoardCard({
          route: route,
          sourceApp: classification.sourceApp,
          description: description,
          pageContext: input.pageContext,
          area: input.area,
          type: type,
          reason: classification.reason,
          sourceSurface: input.sourceSurface || 'extension'
        });

        var response = await fetchImpl(options.url.replace(/\/$/, '') + '/rest/v1/rpc/assist_submit_feedback', {
          method: 'POST',
          headers: restHeaders(options.anonKey, options.authHeaders || null),
          body: JSON.stringify({
            p_source_app: classification.sourceApp,
            p_route: route,
            p_description: description,
            p_type: type,
            p_area: input.area || null,
            p_page_context: input.pageContext || null,
            p_install_uuid: input.installUuid || null,
            p_board_card_path: cardStub.relativePath,
            p_board_card_markdown: cardStub.markdown,
            p_reason: classification.reason
          })
        });
        if (!response.ok) {
          var body = await response.text();
          throw new Error('assist_submit_feedback failed (' + response.status + '): ' + body.slice(0, 240));
        }
        var payload = await response.json();
        var feedbackRow = payload.feedback || payload;
        var requestRow = payload.request || null;

        var card = buildBoardCard({
          route: route,
          sourceApp: classification.sourceApp,
          description: description,
          pageContext: input.pageContext,
          area: input.area,
          type: type,
          reason: classification.reason,
          sourceSurface: input.sourceSurface || 'extension',
          requestId: requestRow && requestRow.id,
          feedbackId: feedbackRow && feedbackRow.id,
          createdAt: feedbackRow && feedbackRow.created_at
        });

        var writtenPath = null;
        if (typeof boardWriter === 'function') {
          writtenPath = await boardWriter(card);
        } else if (options.boardInboxDir && typeof options.fsWrite === 'function') {
          var full = String(options.boardInboxDir).replace(/\/$/, '') + '/' + card.filename;
          await options.fsWrite(full, card.markdown);
          writtenPath = full;
        }

        return {
          feedback: feedbackRow,
          request: requestRow ? Object.assign({}, requestRow, {
            board_card_markdown: card.markdown,
            board_card_path: card.relativePath
          }) : null,
          classification: classification,
          card: card,
          boardCardPath: writtenPath || card.relativePath
        };
      }
    };
  }

  return Object.freeze({
    classifyFeedback: classifyFeedback,
    normalizeAppId: normalizeAppId,
    buildBoardCard: buildBoardCard,
    createFeedbackClient: createFeedbackClient
  });
});
