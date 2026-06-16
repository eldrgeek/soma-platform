/**
 * submit-feedback.js — Netlify Function for Bill-mediated feedback submissions.
 *
 * Accepts a JSON POST from the soma-guide engine (Bill widget) when a member
 * reports a bug or submits a feature request via the conversation. Stores the
 * submission in public.bill_feedback using the service-role key (bypasses RLS).
 *
 * This is the "AI manager as feedback membrane": member -> Bill -> reviewer.
 * Members are NOT trusted to write directly; all submissions route here and
 * surface in your admin dashboard for review.
 *
 * ── Setup ───────────────────────────────────────────────────────────────────
 *   1. Apply sql/schema.sql in the Supabase SQL editor (creates bill_feedback).
 *   2. Set these Netlify environment variables (Site settings -> Environment):
 *        SUPABASE_URL                 e.g. https://{{SUPABASE_PROJECT_REF}}.supabase.co
 *        SUPABASE_SERVICE_ROLE_KEY    service-role key (SECRET — never ship to client)
 *   3. Point the Bill config feedbackUrl at /.netlify/functions/submit-feedback.
 *
 * SUPABASE_URL has a placeholder fallback so a misconfigured deploy fails loudly
 * rather than writing to the wrong project.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://{{SUPABASE_PROJECT_REF}}.supabase.co';
const MAX_BODY_BYTES = 16384;

// Email whose submissions auto-approve (the trusted reviewer). Optional — leave
// the placeholder unreplaced (or set OWNER_EMAIL) to disable auto-approval.
const OWNER_EMAIL = (process.env.OWNER_EMAIL || '{{OWNER_EMAIL}}').toLowerCase();
const DEFAULT_ASSISTANT_ID = process.env.ASSISTANT_ID || '{{ASSISTANT_ID}}';

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
    return jsonResponse(503, {
      error: 'feedback backend not configured',
      message: 'Bill feedback is not yet enabled. Set SUPABASE_SERVICE_ROLE_KEY in Netlify environment variables and redeploy.',
    });
  }

  const bodyStr = event.body || '';
  if (Buffer.byteLength(bodyStr, 'utf8') > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'Request too large' });
  }

  let body;
  try {
    body = JSON.parse(bodyStr);
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  // Honeypot
  if (body.website && String(body.website).trim() !== '') {
    return jsonResponse(200, { message: 'Received' });
  }

  const type = str(body.type, 20);
  if (!type || !['bug', 'feature'].includes(type)) {
    return jsonResponse(400, { error: 'type must be "bug" or "feature"' });
  }

  const description = str(body.description, 5000);
  if (!description) {
    return jsonResponse(400, { error: 'description is required' });
  }

  const memberEmail = str(body.member_email, 255);

  // The trusted reviewer submits on their own authority — auto-approve.
  const autoApprove =
    OWNER_EMAIL &&
    !OWNER_EMAIL.startsWith('{{') &&
    memberEmail &&
    memberEmail.toLowerCase() === OWNER_EMAIL;

  const row = {
    type,
    description,
    member_name:   str(body.member_name, 120),
    member_email:  memberEmail,
    page_context:  str(body.page_context, 500),
    assistant_id:  str(body.assistant_id, 60) || DEFAULT_ASSISTANT_ID,
    source:        'bill-widget',
    ip:            str(event.headers['x-forwarded-for'] || event.headers['client-ip'] || null, 100),
    user_agent:    str(event.headers['user-agent'] || null, 500),
    status:        autoApprove ? 'owner-approved' : 'new',
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bill_feedback`, {
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
      console.error('Supabase insert failed:', res.status, errText);
      return jsonResponse(500, { error: 'Failed to record feedback' });
    }

    return jsonResponse(200, { message: 'Feedback submitted — a reviewer will look at it shortly. Thank you!' });
  } catch (err) {
    console.error('Insert error:', err);
    return jsonResponse(500, { error: 'Failed to record feedback' });
  }
};
