(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SomaScriptRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULT_TTL_MS = 15 * 60 * 1000;
  var CACHE_PREFIX = 'soma-script-cache:v1:';
  var FLOW_STATE_KEY = 'soma-flow-states:v1';

  function normalizeHostname(hostname) {
    return String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  }

  function queryUrl(baseUrl, table, params) {
    var query = Object.keys(params).map(function (key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
    }).join('&');
    return baseUrl.replace(/\/$/, '') + '/rest/v1/' + table + '?' + query;
  }

  async function jsonRequest(fetchImpl, url, anonKey) {
    var response = await fetchImpl(url, {
      // Supabase's modern sb_publishable key belongs in `apikey`; it is not a
      // JWT and must not be sent as a Bearer token. RLS assigns the anon role.
      headers: { apikey: anonKey }
    });
    if (!response.ok) throw new Error('Script registry request failed (' + response.status + ')');
    return response.json();
  }

  function revisionOf(manifest) {
    return manifest.slice().sort(function (a, b) {
      return String(a.id).localeCompare(String(b.id));
    }).map(function (row) {
      return [row.id, row.version, row.content_hash, row.updated_at].join(':');
    }).join('|');
  }

  function createScriptClient(options) {
    if (!options || !options.url || !options.anonKey || !options.storage) {
      throw new Error('url, anonKey, and storage are required');
    }
    var fetchImpl = options.fetch || (typeof globalThis !== 'undefined' && globalThis.fetch && globalThis.fetch.bind(globalThis));
    if (!fetchImpl) throw new Error('fetch is required');
    var now = options.now || Date.now;
    var ttlMs = options.ttlMs == null ? DEFAULT_TTL_MS : options.ttlMs;
    var appId = options.appId || 'yeshie';
    var table = options.table || 'yeshie_scripts';

    async function local(hostname, error) {
      if (!options.localFallback) throw error;
      var scripts = await options.localFallback(hostname);
      return { scripts: scripts || [], source: 'bundled', stale: true, revision: null, error: String(error.message || error) };
    }

    return {
      async getScripts(hostname, requestOptions) {
        hostname = normalizeHostname(hostname);
        if (!hostname) return { scripts: [], source: 'none', stale: false, revision: null };
        var key = CACHE_PREFIX + appId + ':' + hostname;
        var cache = await options.storage.get(key);
        var force = Boolean(requestOptions && requestOptions.force);
        if (!force && cache && now() - cache.checkedAt < ttlMs) {
          return { scripts: cache.scripts, source: 'cache', stale: false, revision: cache.revision };
        }

        try {
          var baseParams = { app_id: 'eq.' + appId, hostname: 'eq.' + hostname, published: 'eq.true', order: 'name.asc' };
          var manifest = await jsonRequest(fetchImpl, queryUrl(options.url, table, Object.assign({
            select: 'id,name,version,content_hash,updated_at'
          }, baseParams)), options.anonKey);
          var revision = revisionOf(manifest);
          if (cache && cache.revision === revision) {
            cache.checkedAt = now();
            await options.storage.set(key, cache);
            return { scripts: cache.scripts, source: 'cache-validated', stale: false, revision: revision };
          }
          var scripts = await jsonRequest(fetchImpl, queryUrl(options.url, table, Object.assign({
            select: 'id,app_id,hostname,name,version,payload,flow_metadata,is_multi_page,content_hash,updated_at'
          }, baseParams)), options.anonKey);
          var nextCache = { scripts: scripts, revision: revision, checkedAt: now() };
          await options.storage.set(key, nextCache);
          return { scripts: scripts, source: 'supabase', stale: false, revision: revision };
        } catch (error) {
          if (cache) return { scripts: cache.scripts, source: 'cache-stale', stale: true, revision: cache.revision, error: String(error.message || error) };
          return local(hostname, error);
        }
      },
      cacheKey(hostname) { return CACHE_PREFIX + appId + ':' + normalizeHostname(hostname); }
    };
  }

  function pageMatches(pageMatch, url) {
    if (!pageMatch) return true;
    var parsed;
    try { parsed = new URL(url); } catch (_) { return false; }
    if (pageMatch.hostname && normalizeHostname(parsed.hostname) !== normalizeHostname(pageMatch.hostname)) return false;
    if (pageMatch.pathname && parsed.pathname !== pageMatch.pathname) return false;
    if (pageMatch.pathnamePrefix && !parsed.pathname.startsWith(pageMatch.pathnamePrefix)) return false;
    if (pageMatch.urlPattern) {
      try { if (!(new RegExp(pageMatch.urlPattern)).test(url)) return false; } catch (_) { return false; }
    }
    return true;
  }

  function isRestrictedSurface(url) {
    var parsed;
    try { parsed = new URL(url); } catch (_) { return true; }
    if (!/^https?:$/.test(parsed.protocol)) return true;
    if (parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore')) return true;
    if (parsed.hostname === 'accounts.google.com' && (
      parsed.pathname.startsWith('/gsi/') ||
      parsed.pathname.startsWith('/o/oauth2/iframe') ||
      parsed.searchParams.get('origin') === 'chrome-extension://'
    )) return true;
    return false;
  }

  function createFlowEngine(options) {
    if (!options || !options.storage) throw new Error('storage is required');
    var now = options.now || Date.now;
    var queue = Promise.resolve();

    async function readAll() { return (await options.storage.get(FLOW_STATE_KEY)) || {}; }
    async function writeAll(states) { await options.storage.set(FLOW_STATE_KEY, states); }
    function serial(operation) {
      var result = queue.then(operation, operation);
      queue = result.catch(function () {});
      return result;
    }
    function timedOut(state) {
      var time = now();
      var overall = state.definition.timeoutMs || 5 * 60 * 1000;
      var perStep = state.definition.stepTimeoutMs || 60 * 1000;
      if (time - state.startedAt > overall) return 'flow-timeout';
      if (state.stepStartedAt != null && time - state.stepStartedAt > perStep) return 'step-timeout';
      return null;
    }
    function finish(state, status, reason) {
      state.status = status;
      state.reason = reason || null;
      state.finishedAt = now();
      state.inFlight = false;
      return { type: status, reason: reason || null, state: state };
    }

    return {
      start(tabId, definition, script) {
        return serial(async function () {
          if (!definition || !Array.isArray(definition.steps) || !definition.steps.length) throw new Error('Flow requires at least one step');
          var states = await readAll();
          states[String(tabId)] = {
            tabId: Number(tabId), definition: definition, script: script || null, cursor: 0,
            inFlight: false, status: 'waiting-page', startedAt: now(), stepStartedAt: null,
            lastUrl: null, reason: null
          };
          await writeAll(states);
          return states[String(tabId)];
        });
      },
      getState(tabId) {
        return serial(async function () { return (await readAll())[String(tabId)] || null; });
      },
      onNavigation(tabId, url, injectable) {
        return serial(async function () {
          var states = await readAll();
          var state = states[String(tabId)];
          if (!state || ['completed', 'abandoned', 'failed'].includes(state.status)) return { type: 'none', state: state || null };
          var timeout = timedOut(state);
          if (timeout) { var expired = finish(state, 'abandoned', timeout); await writeAll(states); return expired; }
          state.lastUrl = url;
          if (injectable === false || isRestrictedSurface(url)) {
            state.status = 'waiting-restricted';
            await writeAll(states);
            return { type: 'wait', reason: 'restricted-surface', state: state };
          }
          var steps = state.definition.steps;
          if (state.inFlight) {
            var next = steps[state.cursor + 1];
            if (next && pageMatches(next.pageMatch, url)) {
              state.cursor += 1;
              state.inFlight = false;
              state.stepStartedAt = now();
            } else {
              state.status = 'waiting-navigation';
              await writeAll(states);
              return { type: 'wait', reason: 'action-in-flight', state: state };
            }
          }
          var step = steps[state.cursor];
          if (!step) { var complete = finish(state, 'completed'); await writeAll(states); return complete; }
          if (!pageMatches(step.pageMatch, url)) {
            state.status = 'waiting-page';
            state.stepStartedAt = state.stepStartedAt || now();
            await writeAll(states);
            return { type: 'wait', reason: 'page-mismatch', state: state };
          }
          state.status = 'running';
          state.inFlight = true;
          state.stepStartedAt = now();
          await writeAll(states);
          return { type: 'dispatch', step: step, cursor: state.cursor, state: state };
        });
      },
      completeStep(tabId, cursor) {
        return serial(async function () {
          var states = await readAll();
          var state = states[String(tabId)];
          if (!state || state.cursor !== cursor || !state.inFlight) return { type: 'stale', state: state || null };
          state.cursor += 1;
          state.inFlight = false;
          state.stepStartedAt = now();
          if (state.cursor >= state.definition.steps.length) {
            var complete = finish(state, 'completed'); await writeAll(states); return complete;
          }
          state.status = 'waiting-page';
          await writeAll(states);
          return { type: 'advanced', state: state };
        });
      },
      failStep(tabId, cursor, reason) {
        return serial(async function () {
          var states = await readAll();
          var state = states[String(tabId)];
          if (!state || state.cursor !== cursor) return { type: 'stale', state: state || null };
          var failed = finish(state, 'failed', reason || 'step-failed');
          await writeAll(states);
          return failed;
        });
      },
      abandon(tabId, reason) {
        return serial(async function () {
          var states = await readAll();
          var state = states[String(tabId)];
          if (!state) return { type: 'none', state: null };
          var abandoned = finish(state, 'abandoned', reason || 'abandoned');
          await writeAll(states);
          return abandoned;
        });
      },
      remove(tabId) {
        return serial(async function () { var states = await readAll(); delete states[String(tabId)]; await writeAll(states); });
      }
    };
  }

  return {
    DEFAULT_TTL_MS: DEFAULT_TTL_MS,
    FLOW_STATE_KEY: FLOW_STATE_KEY,
    createScriptClient: createScriptClient,
    createFlowEngine: createFlowEngine,
    normalizeHostname: normalizeHostname,
    pageMatches: pageMatches,
    isRestrictedSurface: isRestrictedSurface,
    revisionOf: revisionOf
  };
});
