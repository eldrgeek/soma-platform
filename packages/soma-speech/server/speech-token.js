'use strict';
/*!
 * speech-token.js — the server half of soma-speech's Punctuated voice.
 *
 * The page never holds the ElevenLabs key. It asks this handler for a
 * single-use token (valid 15 minutes), then talks to ElevenLabs directly.
 * The handler decides who may ask, and how often:
 *
 *   1. authorize(headers)  who is asking? Anyone not authorised gets 401 or 403.
 *   2. a daily limit per person, then a daily limit for everyone, so one person
 *      cannot use up the day and a leaked sign-in cannot run up the bill.
 *   3. only then does it spend a call on ElevenLabs.
 *
 * Plain Node, no dependencies. `req` is { method, headers }; the result is
 * { status, headers, body } (body is a JSON string). A Netlify Function wrapper
 * is in netlify/functions/speech-token.mjs.
 *
 *   const { createSpeechTokenHandler, supabaseAuthorize } = require('@soma/speech/server/speech-token.js');
 *   const handle = createSpeechTokenHandler({
 *     apiKey: process.env.ELEVENLABS_API_KEY,
 *     authorize: supabaseAuthorize({ url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY }),
 *     store: { incr: async (key) => ... },          // a counter that survives between requests
 *     limits: { perPerson: 120, global: 400 }       // tokens per day (one token is one dictation session)
 *   });
 *
 * Written 2026-10-21 (Mike Wolf; Claude Sonnet 5.5, CCc). Bead sp-zu0.
 */

const crypto = require('node:crypto');

const ELEVEN_TOKEN_URL = 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe';

function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function createSpeechTokenHandler(o) {
  const apiKey = o.apiKey;
  const authorize = o.authorize;
  const store = o.store;
  const limits = Object.assign({ perPerson: 120, global: 400 }, o.limits || {});
  const doFetch = o.fetch || fetch;
  const now = o.now || Date.now;
  const cors = {
    'access-control-allow-origin': o.allowOrigin || '*',
    'access-control-allow-headers': 'authorization, content-type, x-soma-speech-code',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '600',
    'cache-control': 'no-store'
  };

  function reply(status, body) {
    return {
      status,
      headers: Object.assign({ 'content-type': 'application/json' }, cors),
      body: JSON.stringify(body)
    };
  }

  return async function handle(req) {
    const method = String(req.method || '').toUpperCase();
    if (method === 'OPTIONS') return { status: 204, headers: cors, body: '' };
    if (method !== 'POST') return reply(405, { error: 'method-not-allowed' });
    if (!apiKey) return reply(503, { error: 'not-configured' });

    const headers = {};
    Object.keys(req.headers || {}).forEach((k) => { headers[k.toLowerCase()] = req.headers[k]; });

    let who;
    try { who = await authorize(headers); } catch (e) { who = null; }
    if (!who || !who.ok) return reply(who && who.status === 403 ? 403 : 401, { error: 'not-signed-in' });

    const day = dayKey(now());
    const person = String(who.id || 'unknown').slice(0, 80);
    // The person's own count first: someone over their limit must not eat the shared one.
    const mine = await store.incr('person:' + day + ':' + person);
    if (mine > limits.perPerson) return reply(429, { error: 'capped', scope: 'you' });
    const everyone = await store.incr('global:' + day);
    if (everyone > limits.global) return reply(429, { error: 'capped', scope: 'everyone' });

    let res;
    try {
      res = await doFetch(ELEVEN_TOKEN_URL, { method: 'POST', headers: { 'xi-api-key': apiKey } });
    } catch (e) {
      return reply(502, { error: 'upstream' });
    }
    if (!res.ok) return reply(502, { error: 'upstream', status: res.status });
    let data = null;
    try { data = await res.json(); } catch (e) { /* handled below */ }
    if (!data || !data.token) return reply(502, { error: 'upstream' });
    return reply(200, { token: data.token, expires_in: 900 });
  };
}

// A shared passcode in the x-soma-speech-code header. For a demo with no sign-in.
function demoCodeAuthorize(code) {
  return async function (headers) {
    const given = String(headers['x-soma-speech-code'] || '');
    if (!code || !given) return { ok: false, status: 401 };
    const a = Buffer.from(given);
    const b = Buffer.from(String(code));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, status: 401 };
    return { ok: true, id: 'demo-code' };
  };
}

// SOMA sign-in: a Supabase access token in the Authorization header, checked with
// Supabase itself. `allow(user)` may return false to refuse a signed-in person (403).
function supabaseAuthorize(o) {
  const doFetch = o.fetch || fetch;
  return async function (headers) {
    const m = /^Bearer\s+(.+)$/i.exec(String(headers.authorization || ''));
    if (!m) return { ok: false, status: 401 };
    const res = await doFetch(String(o.url).replace(/\/+$/, '') + '/auth/v1/user', {
      headers: { apikey: o.anonKey, authorization: 'Bearer ' + m[1] }
    });
    if (!res.ok) return { ok: false, status: 401 };
    const user = await res.json();
    if (!user || !user.id) return { ok: false, status: 401 };
    if (o.allow && !(await o.allow(user))) return { ok: false, status: 403 };
    return { ok: true, id: user.id, email: user.email };
  };
}

module.exports = { createSpeechTokenHandler, demoCodeAuthorize, supabaseAuthorize, ELEVEN_TOKEN_URL };
