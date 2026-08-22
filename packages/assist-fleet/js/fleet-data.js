/**
 * Assist Fleet data layer — authenticated Supabase REST reads for instances + review.
 * Framework-free; used by the static fleet app and unit-tested with a fetch stub.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AssistFleetData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function queryUrl(baseUrl, table, params) {
    var qs = Object.keys(params || {}).map(function (key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
    }).join('&');
    return baseUrl.replace(/\/$/, '') + '/rest/v1/' + table + (qs ? '?' + qs : '');
  }

  function createFleetDataClient(options) {
    options = options || {};
    if (!options.url || !options.anonKey) throw new Error('url and anonKey are required');
    var fetchImpl = options.fetch || (typeof globalThis !== 'undefined' && globalThis.fetch && globalThis.fetch.bind(globalThis));
    if (!fetchImpl) throw new Error('fetch is required');
    var getAccessToken = options.getAccessToken || function () { return Promise.resolve(null); };

    async function authHeaders() {
      var token = await getAccessToken();
      var headers = {
        apikey: options.anonKey,
        'Content-Type': 'application/json'
      };
      headers.Authorization = 'Bearer ' + (token || options.anonKey);
      return headers;
    }

    async function getJson(table, params) {
      var response = await fetchImpl(queryUrl(options.url, table, params), {
        headers: await authHeaders()
      });
      if (response.status === 401 || response.status === 403) {
        var err = new Error('Authentication required');
        err.status = response.status;
        throw err;
      }
      if (!response.ok) {
        throw new Error(table + ' read failed (' + response.status + ')');
      }
      return response.json();
    }

    function deriveInstanceStatus(row, nowMs, staleMs) {
      nowMs = nowMs || Date.now();
      staleMs = staleMs || 5 * 60 * 1000;
      var last = Date.parse(row.last_seen || row.created_at || 0);
      if (!Number.isFinite(last)) return 'unknown';
      if (nowMs - last > staleMs) return 'stale';
      return row.status || 'online';
    }

    return {
      async listInstances(filters) {
        filters = filters || {};
        var params = {
          select: 'install_uuid,app_id,version,last_seen,status,created_at',
          order: 'last_seen.desc'
        };
        if (filters.appId) params.app_id = 'eq.' + filters.appId;
        var rows = await getJson(options.heartbeatTable || 'assist_heartbeats', params);
        var now = Date.now();
        return (rows || []).map(function (row) {
          return Object.assign({}, row, {
            derived_status: deriveInstanceStatus(row, now, filters.staleMs)
          });
        });
      },

      async listFeedback(filters) {
        filters = filters || {};
        var params = {
          select: 'id,app,source_app,route,type,description,area,page_context,status,build_request_id,board_card_path,created_at,reviewed_at',
          order: 'created_at.desc'
        };
        if (filters.route && filters.route !== 'all') params.route = 'eq.' + filters.route;
        if (filters.status && filters.status !== 'all') params.status = 'eq.' + filters.status;
        return getJson(options.feedbackTable || 'assist_feedback', params);
      },

      async listBuildRequests(filters) {
        filters = filters || {};
        var params = {
          select: 'id,app,requested_at,feedback_ids,item_count,status,started_at,completed_at,reviewed_at,board_card_path,notes',
          order: 'requested_at.desc'
        };
        if (filters.app && filters.app !== 'all') params.app = 'eq.' + filters.app;
        if (filters.status && filters.status !== 'all') params.status = 'eq.' + filters.status;
        return getJson(options.buildRequestTable || 'assist_build_requests', params);
      },

      /**
       * Review model modeled on Playmaker's FeedbackQueue:
       * open build requests + queued/new feedback, filterable by route.
       */
      async getReviewQueue(filters) {
        filters = filters || {};
        var route = filters.route || 'all';
        var [feedback, requests] = await Promise.all([
          this.listFeedback({ route: route }),
          this.listBuildRequests({ app: route === 'all' ? 'all' : route })
        ]);
        var openRequests = (requests || []).filter(function (r) {
          return r.status === 'requested' || r.status === 'in_progress';
        });
        var awaiting = (feedback || []).filter(function (f) {
          return f.status === 'shipped' && !f.reviewed_at;
        });
        var triage = (feedback || []).filter(function (f) {
          return f.status === 'new' || f.status === 'queued';
        });
        return {
          route: route,
          feedback: feedback || [],
          requests: requests || [],
          openRequests: openRequests,
          triage: triage,
          awaiting: awaiting,
          counts: {
            feedback: (feedback || []).length,
            openRequests: openRequests.length,
            triage: triage.length,
            awaiting: awaiting.length
          }
        };
      },

      deriveInstanceStatus: deriveInstanceStatus
    };
  }

  return Object.freeze({ createFleetDataClient: createFleetDataClient });
});
