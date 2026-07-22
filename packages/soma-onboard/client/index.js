/**
 * Browser-safe surface of SOMA Onboard.
 *
 * Everything re-exported here is free of node builtins, so it works in a Vite
 * bundle (Vegas Connect, Revolution 1x1) and from a plain <script type="module">
 * (Legends Connect). The server engine in ../src/handlers.js is NOT re-exported
 * — it needs the service-role key and must never reach a browser bundle.
 */

export { encodeQR, qrSvg, qrDataUri } from './qr.js';

export {
  CHANNELS,
  CHANNEL_IDS,
  getChannel,
  channelTarget,
  channelTargets,
  composeInvite,
} from '../src/channels.js';

export {
  inviteUrl,
  parseInviteUrl,
  tagChannel,
  RELATIONSHIP_MAX_LENGTH,
} from '../src/invite-link.js';

export { defineOnboardConfig, DEFAULT_CHANNELS } from '../src/config.js';

export { SomaInviteSheet, defineInviteSheet } from './invite-sheet.js';

/**
 * Act on a channel target. Returns what actually happened, because the honest
 * answer varies by device: `navigator.share` may not exist, the clipboard API
 * needs a secure context, and a `sms:` link does nothing on a desktop.
 *
 * @param {import('../src/channels.js').ChannelTarget} target
 * @param {{ open?: (url: string) => void }} [opts]
 * @returns {Promise<{ ok: boolean, action: string, reason?: string }>}
 */
export async function activateChannel(target, opts = {}) {
  const open = opts.open || ((url) => window.open(url, '_blank', 'noopener'));

  switch (target.kind) {
    case 'render':
      return { ok: true, action: 'render' };

    case 'clipboard': {
      const text = target.id === 'copy' ? target.url : target.body;
      const copied = await copyText(text);
      // Signal has no prefill scheme, so we copy and then open the app.
      if (copied && target.href) open(target.href);
      return copied
        ? { ok: true, action: target.href ? 'copied-and-opened' : 'copied' }
        : { ok: false, action: 'copy', reason: 'Clipboard unavailable — select the link and copy it.' };
    }

    case 'native': {
      if (typeof navigator === 'undefined' || !navigator.share) {
        const copied = await copyText(target.url);
        return copied
          ? { ok: true, action: 'copied', reason: 'No share sheet on this device — link copied instead.' }
          : { ok: false, action: 'share', reason: 'Sharing is not available on this device.' };
      }
      try {
        await navigator.share({ title: target.subject, text: target.body, url: target.url });
        return { ok: true, action: 'shared' };
      } catch (err) {
        // A user dismissing the sheet is not an error worth shouting about.
        if (err && err.name === 'AbortError') return { ok: true, action: 'dismissed' };
        return { ok: false, action: 'share', reason: String(err?.message || err) };
      }
    }

    case 'protocol':
      // mailto: / sms: must be a same-tab navigation; window.open leaves a
      // stranded blank tab behind on iOS Safari.
      if (typeof window !== 'undefined') window.location.href = target.href;
      return { ok: true, action: 'handoff' };

    case 'web':
      open(target.href);
      return { ok: true, action: 'handoff' };

    default:
      return { ok: false, action: 'unknown', reason: `Unhandled channel kind ${target.kind}` };
  }
}

/** @param {string} text */
export async function copyText(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const okay = document.execCommand('copy');
    ta.remove();
    return okay;
  } catch {
    return false;
  }
}

/**
 * Report that an invite link was opened, so channel attribution has a numerator.
 * Fire-and-forget by design: analytics must never be in the way of joining.
 *
 * @param {string} apiBase e.g. '/api'
 * @param {{ invite?: string|null, ch?: string|null }} params
 */
export function reportInviteOpened(apiBase, params) {
  if (!params?.invite) return Promise.resolve(false);
  const body = JSON.stringify({ invite_id: params.invite, channel: params.ch || null });
  try {
    if (navigator?.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      return Promise.resolve(navigator.sendBeacon(`${apiBase}/invite-open`, blob));
    }
  } catch {
    /* fall through */
  }
  return fetch(`${apiBase}/invite-open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  })
    .then(() => true)
    .catch(() => false);
}

/** Read invite params off the current URL. */
export function readInviteParams(search = typeof location !== 'undefined' ? location.search : '') {
  const p = new URLSearchParams(search);
  return {
    invite: p.get('invite'),
    ch: p.get('ch'),
    claim: p.get('claim'),
    rel: p.get('rel'),
    for: p.get('for'),
  };
}
