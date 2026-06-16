/**
 * log-bill.js — Netlify Function: conversation-recording sink for Bill.
 *
 * The soma-guide engine POSTs one record per turn/decision to this endpoint
 * (cfg.telemetry.logUrl). Each record captures what Bill DECIDED — matched
 * action, extracted params, chosen rung — so off-track behavior is diagnosable
 * across all users (not just whoever can reproduce it). Review the rows in an
 * admin dashboard reading public.bill_transcripts.
 *
 * Inserts with the service-role key (bypasses RLS).
 *
 * ── Setup ───────────────────────────────────────────────────────────────────
 *   1. Apply sql/schema.sql in the Supabase SQL editor (creates bill_transcripts).
 *   2. Set these Netlify environment variables (shared with submit-feedback):
 *        SUPABASE_URL                 e.g. https://{{SUPABASE_PROJECT_REF}}.supabase.co
 *        SUPABASE_SERVICE_ROLE_KEY    service-role key (SECRET)
 *   3. Point the Bill config telemetry.logUrl at /.netlify/functions/log-bill.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://{{SUPABASE_PROJECT_REF}}.supabase.co';
const MAX_BODY_BYTES = 32768;

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(body),
  };
}

function str(val, max) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s.length > 0 ? s.slice(0, max || 2000) : null;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    return jsonResponse(503, { error: 'logging backend not configured' });
  }

  const bodyStr = event.body || '';
  if (Buffer.byteLength(bodyStr, 'utf8') > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'Request too large' });
  }

  let rec;
  try { rec = JSON.parse(bodyStr); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }

  const event_name = str(rec.event, 60);
  if (!event_name) return jsonResponse(400, { error: 'event is required' });

  let data = rec.data;
  if (data === null || typeof data !== 'object') data = {};

  const row = {
    session_id: str(rec.sessionId, 80),
    anon_id:    str(rec.anonId, 80),
    app:        str(rec.app, 80),
    page:       str(rec.page, 1000),
    event:      event_name,
    data,
    ip:         str(event.headers['x-forwarded-for'] || event.headers['client-ip'] || null, 100),
    user_agent: str(event.headers['user-agent'] || null, 500),
  };
  if (rec.ts) row.created_at = str(rec.ts, 40);

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bill_transcripts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('bill_transcripts insert failed:', res.status, errText);
      return jsonResponse(500, { error: 'insert failed' });
    }
    return jsonResponse(200, { ok: true });
  } catch (err) {
    console.error('log-bill error:', err);
    return jsonResponse(500, { error: 'insert failed' });
  }
};
