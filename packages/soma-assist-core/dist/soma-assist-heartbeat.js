(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SomaAssistHeartbeat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULT_INTERVAL_MS = 60 * 1000;
  var STORAGE_KEY = 'soma-assist:install-uuid';

  function normalizeAppId(appId) {
    var value = String(appId || '').trim().toLowerCase();
    if (value === 'adrian' || value === 'guide' || value === 'somaguide') return 'soma-guide';
    if (value === 'shared') return 'common';
    return value || 'common';
  }

  function uuidV4(randomValues) {
    var bytes;
    if (typeof randomValues === 'function') {
      bytes = randomValues(16);
    } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      bytes = crypto.getRandomValues(new Uint8Array(16));
    } else {
      bytes = new Uint8Array(16);
      for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = [];
    for (var j = 0; j < bytes.length; j++) {
      hex.push((bytes[j] + 0x100).toString(16).slice(1));
    }
    return (
      hex.slice(0, 4).join('') + '-' +
      hex.slice(4, 6).join('') + '-' +
      hex.slice(6, 8).join('') + '-' +
      hex.slice(8, 10).join('') + '-' +
      hex.slice(10, 16).join('')
    );
  }

  function resolveInstallUuid(storage, createUuid) {
    createUuid = createUuid || uuidV4;
    if (!storage) return createUuid();
    try {
      var existing = storage.getItem(STORAGE_KEY);
      if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
      var next = createUuid();
      storage.setItem(STORAGE_KEY, next);
      return next;
    } catch (_) {
      return createUuid();
    }
  }

  function createHeartbeatClient(options) {
    options = options || {};
    if (!options.url || !options.anonKey || !options.appId) {
      throw new Error('url, anonKey, and appId are required');
    }
    var fetchImpl = options.fetch || (typeof globalThis !== 'undefined' && globalThis.fetch && globalThis.fetch.bind(globalThis));
    if (!fetchImpl) throw new Error('fetch is required');
    var appId = normalizeAppId(options.appId);
    var version = String(options.version || '0.0.0');
    var intervalMs = options.intervalMs == null ? DEFAULT_INTERVAL_MS : Number(options.intervalMs);
    var storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    var installUuid = options.installUuid || resolveInstallUuid(storage, options.createUuid);
    var timer = null;
    var stopped = false;
    var lastResult = null;

    async function beat(status) {
      if (stopped) return lastResult;
      var body = {
        p_install_uuid: installUuid,
        p_app_id: appId,
        p_version: version,
        p_status: status || 'online'
      };
      var response = await fetchImpl(options.url.replace(/\/$/, '') + '/rest/v1/rpc/assist_record_heartbeat', {
        method: 'POST',
        headers: {
          apikey: options.anonKey,
          Authorization: 'Bearer ' + options.anonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        var text = await response.text();
        throw new Error('heartbeat failed (' + response.status + '): ' + text.slice(0, 200));
      }
      lastResult = await response.json();
      if (typeof options.onBeat === 'function') {
        try { options.onBeat(lastResult); } catch (_) {}
      }
      return lastResult;
    }

    function start() {
      stopped = false;
      // Fire on startup, then interval.
      Promise.resolve(beat('online')).catch(function (err) {
        if (typeof options.onError === 'function') options.onError(err);
      });
      if (timer) clearInterval(timer);
      if (intervalMs > 0) {
        timer = setInterval(function () {
          Promise.resolve(beat('online')).catch(function (err) {
            if (typeof options.onError === 'function') options.onError(err);
          });
        }, intervalMs);
        if (typeof timer.unref === 'function') timer.unref();
      }
      return api;
    }

    function stop() {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      return api;
    }

    var api = {
      start: start,
      stop: stop,
      beat: beat,
      get installUuid() { return installUuid; },
      get appId() { return appId; },
      get lastResult() { return lastResult; }
    };
    return api;
  }

  return Object.freeze({
    createHeartbeatClient: createHeartbeatClient,
    resolveInstallUuid: resolveInstallUuid,
    normalizeAppId: normalizeAppId,
    uuidV4: uuidV4,
    DEFAULT_INTERVAL_MS: DEFAULT_INTERVAL_MS,
    STORAGE_KEY: STORAGE_KEY
  });
});
