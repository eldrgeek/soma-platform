/**
 * The demo runs the shipped engine, not a mock.
 *
 * `createOnboardHandlers` is the same factory a Netlify function calls; the
 * only substitution is the store (in-memory instead of Supabase) and the
 * transport (direct calls instead of HTTP). That is deliberate — a demo that
 * reimplements the thing it is demonstrating proves nothing.
 */

import { defineOnboardConfig } from '../src/config.js';
import { createOnboardHandlers } from '../src/handlers.js';
import { createMemoryStore } from '../src/store/memory.js';
import { createRecordingSender } from '../src/senders/resend.js';
import { uniqueCode } from '../src/codes.js';
import '../client/invite-sheet.js';

// ---------------------------------------------------------------------------
// Boot the engine
// ---------------------------------------------------------------------------

const cfg = defineOnboardConfig({
  appId: 'onboard-demo',
  tablePrefix: 'demo',
  brandName: 'Vegas Connect',
  origin: location.origin,
  hostName: 'Sam Alvarez',
  virtualHostName: "V'Sam",
  purposeOneLiner: 'A network you can only enter through someone who already knows you.',
  roles: ['player', 'chapter_president', 'family', 'vendor', 'sponsor', 'other'],
  relationships: ['wife', 'husband', 'child', 'family member', 'teammate', 'friend', 'other'],
});

const store = createMemoryStore();
const sender = createRecordingSender();
const api = createOnboardHandlers(cfg, { store, sender });

const $ = (id) => document.getElementById(id);
const log = $('log');

function note(text, ok = false) {
  const line = document.createElement('div');
  if (ok) line.className = 'ok';
  line.textContent = text;
  log.prepend(line);
}

/** Call a handler the way HTTP would, so the demo exercises the real seam. */
async function call(name, { method = 'GET', query = null, json = null, token = null } = {}) {
  const res = await api[name]({
    httpMethod: method,
    headers: {
      'x-forwarded-for': '203.0.113.42',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    queryStringParameters: query,
    body: json ? JSON.stringify(json) : null,
  });
  const parsed = JSON.parse(res.body);
  note(`${method} ${name} → ${res.statusCode}`, res.statusCode < 400);
  if (res.statusCode >= 400) throw new Error(parsed.error || 'request failed');
  return parsed;
}

// ---------------------------------------------------------------------------
// Seed the inviter
// ---------------------------------------------------------------------------

let inviter;
let inviterToken;
let prepared = null;

async function seed() {
  const code = await uniqueCode(store, cfg.codeLength);
  inviter = await store.createMember({
    code,
    name: 'Sam Alvarez',
    email: 'sam@example.com',
    phone: '+1 702 555 0100',
    role: 'player',
    status: 'active',
    consent_at: new Date().toISOString(),
  });
  inviterToken = (await store.createSession(inviter.id)).token;
  note(`seeded inviter Sam Alvarez (code ${code})`, true);

  $('rels').innerHTML = cfg.relationships.map((r) => `<option value="${r}">`).join('');
}

// ---------------------------------------------------------------------------
// 1 · Prepare
// ---------------------------------------------------------------------------

$('prepare').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);

  try {
    prepared = await call('prepare-invite', {
      method: 'POST',
      token: inviterToken,
      json: {
        name: form.get('name'),
        rel: form.get('rel'),
        email: form.get('email') || null,
        phone: form.get('phone') || null,
      },
    });
  } catch (err) {
    note(`  ${err.message}`);
    return;
  }

  $('sheet').invite = prepared;
  $('sheet-empty').hidden = true;
  $('landing-empty').hidden = true;
  renderChannelPicker();
  $('landing').innerHTML = '';
  await refreshStats();
});

// ---------------------------------------------------------------------------
// 3 · Receive + open + join
// ---------------------------------------------------------------------------

function renderChannelPicker() {
  const picker = $('channel-picker');
  picker.innerHTML = '';

  for (const target of prepared.channels) {
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.type = 'button';
    btn.textContent = `Received via ${target.label}`;
    btn.addEventListener('click', () => openAs(target));
    picker.append(btn);
  }
}

/** What happens when the invitee taps the link they were sent. */
async function openAs(target) {
  const url = new URL(target.url);
  const params = Object.fromEntries(url.searchParams.entries());

  const info = await call('invite-info', {
    query: {
      code: url.pathname.split('/').filter(Boolean)[1],
      claim: params.claim,
      rel: params.rel,
      for: params.for,
      ch: params.ch,
      invite: params.invite,
    },
  });
  await refreshStats();
  renderLanding(info, params);
}

function renderLanding(info, params) {
  const landing = $('landing');
  const oneClick = info.claim_member?.one_click;
  const who = info.claim_member?.name || info.invitee_name || 'you';

  landing.innerHTML = `
    <div style="border:1px solid var(--border);border-radius:12px;padding:16px;background:var(--bg)">
      <p style="margin:0 0 2px;font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)">
        Arrived via ${params.ch || 'an untagged link'}
      </p>
      <h3 style="margin:0 0 6px;font-size:19px">${escapeHtml(info.inviter_name)} invited you to ${escapeHtml(info.brand_name)}</h3>
      <p style="margin:0 0 10px;color:var(--muted);font-size:14px">${escapeHtml(info.purpose)}</p>
      ${info.relationship ? `<p style="margin:0 0 10px;font-size:14px">Adding ${escapeHtml(who)} as a <strong>${escapeHtml(info.relationship)}</strong>.</p>` : ''}
      <p style="margin:0 0 12px;font-size:14px;color:var(--muted)">${info.member_count} member${info.member_count === 1 ? '' : 's'} so far.</p>
      <label style="display:flex;gap:8px;align-items:flex-start;font-weight:400;font-size:14px;margin-bottom:12px">
        <input type="checkbox" id="consent" style="width:auto;margin:3px 0 0">
        <span>I agree to join and to be connected to ${escapeHtml(info.inviter_name)}.</span>
      </label>
      <button id="join-btn" type="button">${oneClick ? 'Join — one tap' : 'Join'}</button>
      <p id="join-result" style="margin:12px 0 0;font-size:14px"></p>
    </div>
  `;

  $('join-btn').addEventListener('click', async () => {
    if (!$('consent').checked) {
      $('join-result').textContent = 'Consent is required — the engine rejects the call without it.';
      return;
    }
    try {
      const result = oneClick
        ? await call('one-click-join', {
            method: 'POST',
            json: { claim: params.claim, rel: params.rel, consent: true },
          })
        : await call('join', {
            method: 'POST',
            json: {
              code_of_inviter: info.inviter_code,
              claim: params.claim,
              name: params.for || info.claim_member?.name || 'New Member',
              email: 'new@example.com',
              rel: params.rel,
              consent: true,
            },
          });

      $('join-result').innerHTML =
        `<strong>In.</strong> ${escapeHtml(result.member.name)} is now active and signed in ` +
        `(session token issued, no password), connected to ${escapeHtml(result.connected_to.name)}.`;
      $('join-btn').disabled = true;
      await refreshStats();
    } catch (err) {
      $('join-result').textContent = err.message;
    }
  });
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

async function refreshStats() {
  const stats = await store.channelStats();
  const rows = Object.entries(stats).sort((a, b) => b[1].joined - a[1].joined);
  const tbody = $('stats');

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No invitations yet.</td></tr>';
    return;
  }

  tbody.innerHTML = rows
    .map(([channel, s]) => {
      const rate = s.sent ? `${Math.round((s.joined / s.sent) * 100)}%` : '—';
      return `<tr><td>${escapeHtml(channel)}</td><td class="num">${s.sent}</td><td class="num">${s.opened}</td><td class="num">${s.joined}</td><td class="num">${rate}</td></tr>`;
    })
    .join('');
}

// The share sheet reports what each button actually did.
document.addEventListener('soma-invite-channel', (event) => {
  const { channel, result } = event.detail;
  note(`share sheet · ${channel} → ${result.action}${result.reason ? ` (${result.reason})` : ''}`, result.ok);
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
  );
}

await seed();
