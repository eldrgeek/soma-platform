/**
 * The canonical invite URL.
 *
 * Every channel — QR, email, SMS, a tweet — carries the SAME artifact:
 *   <origin><joinPath>/<inviterCode>[/join]?claim=&rel=&for=&ch=
 *
 * `claim` — a pre-created contact_only member the invitee claims in one tap.
 * `rel`   — relationship label the inviter asserted ("wife", "teammate").
 * `for`   — the invitee's name, so the landing page can greet them by name.
 * `ch`    — which channel this particular link was handed out through. This is
 *           the only reason the same invite gets more than one URL: it makes
 *           "which channel actually converts" answerable instead of a guess.
 */

import { CHANNEL_IDS } from './channels.js';

export const RELATIONSHIP_MAX_LENGTH = 40;

/**
 * @typedef {object} InviteLinkParts
 * @property {string} inviterCode
 * @property {string} [claimCode]     pre-created member code for one-click join
 * @property {string} [relationship]
 * @property {string} [inviteeName]
 * @property {string} [channel]       one of CHANNEL_IDS
 */

/**
 * @param {import('./config.js').OnboardConfig} cfg
 * @param {InviteLinkParts} parts
 * @param {string} [originOverride] e.g. window.location.origin in a preview deploy
 * @returns {string} absolute URL
 */
export function inviteUrl(cfg, parts, originOverride) {
  const base = String(originOverride || cfg.origin).replace(/\/$/, '');
  const code = encodeURIComponent(String(parts.inviterCode || '').trim());
  if (!code) throw new Error('soma-onboard: inviteUrl needs an inviterCode');

  const path = parts.claimCode
    ? `${cfg.joinPath}/${code}/join`
    : `${cfg.joinPath}/${code}`;

  const q = new URLSearchParams();
  if (parts.claimCode) q.set('claim', String(parts.claimCode).trim());
  const rel = String(parts.relationship || '').trim().slice(0, RELATIONSHIP_MAX_LENGTH);
  if (rel) q.set('rel', rel);
  const name = String(parts.inviteeName || '').trim();
  if (name) q.set('for', name);
  if (parts.channel && CHANNEL_IDS.includes(parts.channel)) q.set('ch', parts.channel);

  const query = q.toString();
  return query ? `${base}${path}?${query}` : `${base}${path}`;
}

/**
 * Parse an invite URL (or a bare query string) back into its parts. Used by the
 * landing page and by tests that assert round-trip fidelity.
 * @param {string} url
 * @returns {InviteLinkParts & { origin: string }}
 */
export function parseInviteUrl(url) {
  const u = new URL(url);
  const segments = u.pathname.split('/').filter(Boolean);
  const joinIndex = segments.lastIndexOf('join');
  const inviterCode = joinIndex > 0 ? segments[joinIndex - 1] : segments[segments.length - 1] || '';
  return {
    origin: u.origin,
    inviterCode: decodeURIComponent(inviterCode),
    claimCode: u.searchParams.get('claim') || undefined,
    relationship: u.searchParams.get('rel') || undefined,
    inviteeName: u.searchParams.get('for') || undefined,
    channel: u.searchParams.get('ch') || undefined,
  };
}

/**
 * Same invite, tagged for a different channel. Cheap and pure — the share sheet
 * calls this once per button so each channel hands out its own tagged URL.
 * @param {string} url
 * @param {string} channel
 */
export function tagChannel(url, channel) {
  if (!CHANNEL_IDS.includes(channel)) return url;
  const u = new URL(url);
  u.searchParams.set('ch', channel);
  return u.toString();
}
