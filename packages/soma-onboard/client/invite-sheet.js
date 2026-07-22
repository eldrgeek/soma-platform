/**
 * <soma-invite-sheet> — the invite surface.
 *
 * A custom element rather than a React component so all three consuming apps
 * can use the same one: Vegas Connect and Revolution 1x1 render it from JSX
 * like any DOM element, Legends Connect drops it in with a <script type=module>.
 *
 * Design intent, in priority order:
 *
 *  1. The QR is the hero. In-person invitation is the mechanic that made Vegas
 *     Connect work — someone you trust is standing there while you join. The
 *     other channels exist so distance doesn't kill the invite, not to replace
 *     the moment.
 *  2. Public channels are visually separated and labelled. Posting an invite to
 *     X is a categorically different act from texting your brother, and the UI
 *     should not let someone do the first while thinking they did the second.
 *  3. Every action reports what actually happened. "Copied!" when the clipboard
 *     silently failed is worse than no feedback at all.
 *
 * Usage:
 *   const sheet = document.createElement('soma-invite-sheet');
 *   sheet.invite = prepareInviteResponse;   // from POST /api/prepare-invite
 *   document.body.append(sheet);
 *
 * Or declaratively, for a bare invite link with no prepared invitee:
 *   <soma-invite-sheet url="https://…/j/K7M2QP4X" inviter="Greg Foster"
 *                      brand="Vegas Connect"></soma-invite-sheet>
 */

import { qrSvg } from './qr.js';
import { channelTargets } from '../src/channels.js';
import { DEFAULT_CHANNELS } from '../src/config.js';

const STYLE = `
  :host {
    --so-fg: #102743;
    --so-muted: #5b6b80;
    --so-bg: #ffffff;
    --so-card: #f6f8fb;
    --so-border: #dbe3ec;
    --so-accent: #1a4d8f;
    --so-accent-fg: #ffffff;
    --so-warn-bg: #fff6e6;
    --so-warn-border: #f0d7a8;
    --so-radius: 14px;

    display: block;
    color: var(--so-fg);
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    container-type: inline-size;
  }
  @media (prefers-color-scheme: dark) {
    :host {
      --so-fg: #e8eef6;
      --so-muted: #9fb0c4;
      --so-bg: #0e1621;
      --so-card: #17222f;
      --so-border: #2a3849;
      --so-accent: #5b9bef;
      --so-accent-fg: #08121d;
      --so-warn-bg: #2b2415;
      --so-warn-border: #4d4025;
    }
  }
  :host([theme="dark"]) {
    --so-fg: #e8eef6; --so-muted: #9fb0c4; --so-bg: #0e1621;
    --so-card: #17222f; --so-border: #2a3849; --so-accent: #5b9bef;
    --so-accent-fg: #08121d; --so-warn-bg: #2b2415; --so-warn-border: #4d4025;
  }
  :host([theme="light"]) {
    --so-fg: #102743; --so-muted: #5b6b80; --so-bg: #ffffff;
    --so-card: #f6f8fb; --so-border: #dbe3ec; --so-accent: #1a4d8f;
    --so-accent-fg: #ffffff; --so-warn-bg: #fff6e6; --so-warn-border: #f0d7a8;
  }

  * { box-sizing: border-box; }

  .sheet {
    background: var(--so-bg);
    border: 1px solid var(--so-border);
    border-radius: var(--so-radius);
    padding: 20px;
    max-width: 460px;
  }
  .eyebrow {
    text-transform: uppercase;
    letter-spacing: .08em;
    font-size: 12px;
    font-weight: 700;
    color: var(--so-muted);
    margin: 0 0 4px;
  }
  h2 { margin: 0 0 4px; font-size: 21px; line-height: 1.25; }
  .lede { margin: 0 0 16px; color: var(--so-muted); font-size: 15px; }

  .qr-wrap {
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    background: var(--so-card);
    border: 1px solid var(--so-border);
    border-radius: var(--so-radius);
    padding: 18px; margin-bottom: 16px;
  }
  .qr-wrap svg { display: block; width: min(260px, 70cqw); height: auto; border-radius: 6px; }
  .qr-caption { font-size: 13px; color: var(--so-muted); text-align: center; margin: 0; }

  .link-row { display: flex; gap: 8px; align-items: stretch; margin-bottom: 18px; }
  .link {
    flex: 1 1 auto; min-width: 0;
    font: 500 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
    background: var(--so-card); border: 1px solid var(--so-border);
    border-radius: 10px; padding: 10px 12px; color: var(--so-muted);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .group-label {
    font-size: 12px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .07em; color: var(--so-muted); margin: 0 0 8px;
  }
  .channels {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    gap: 8px; margin: 0 0 18px; padding: 0; list-style: none;
  }
  .channels li { margin: 0; }

  button {
    font: inherit; cursor: pointer; width: 100%;
    border-radius: 10px; padding: 11px 12px;
    border: 1px solid var(--so-border);
    background: var(--so-card); color: var(--so-fg);
    transition: border-color .12s ease, transform .06s ease;
  }
  button:hover { border-color: var(--so-accent); }
  button:active { transform: translateY(1px); }
  button:focus-visible { outline: 2px solid var(--so-accent); outline-offset: 2px; }
  button.primary { background: var(--so-accent); color: var(--so-accent-fg); border-color: var(--so-accent); font-weight: 600; }
  button.compact { width: auto; white-space: nowrap; }

  .public-note {
    background: var(--so-warn-bg);
    border: 1px solid var(--so-warn-border);
    border-radius: 10px; padding: 9px 12px; margin: 0 0 8px;
    font-size: 13px; color: var(--so-fg);
  }

  .status { margin: 0; min-height: 20px; font-size: 14px; }
  .status[data-tone="error"] { color: #b4342b; }
  @media (prefers-color-scheme: dark) { .status[data-tone="error"] { color: #ff9d95; } }

  @media (prefers-reduced-motion: reduce) { button { transition: none; } }
`;

export class SomaInviteSheet extends HTMLElement {
  static observedAttributes = ['url', 'inviter', 'invitee', 'brand', 'purpose', 'relationship', 'theme'];

  #root;
  /** @type {any} */
  #invite = null;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
  }

  /**
   * The `prepare-invite` response. Setting this is the normal path — the server
   * has already composed a target per channel, including the per-channel `ch=`
   * tag, so the sheet does not recompute what the server decided.
   */
  set invite(value) {
    this.#invite = value || null;
    this.#render();
  }
  get invite() {
    return this.#invite;
  }

  connectedCallback() {
    this.#render();
  }
  attributeChangedCallback() {
    if (this.isConnected) this.#render();
  }

  /** Targets from the server when present, otherwise composed here. */
  #targets() {
    if (this.#invite?.channels?.length) return this.#invite.channels;

    const url = this.#invite?.url || this.getAttribute('url');
    if (!url) return [];

    const cfg = {
      channels: (this.getAttribute('channels') || '').split(',').filter(Boolean).length
        ? this.getAttribute('channels').split(',').map((s) => s.trim())
        : DEFAULT_CHANNELS,
    };
    return channelTargets(cfg, {
      url,
      brandName: this.getAttribute('brand') || 'this app',
      inviterName: this.getAttribute('inviter') || 'A member',
      inviteeName: this.#invite?.invitee_name || this.getAttribute('invitee') || undefined,
      relationship: this.#invite?.relationship || this.getAttribute('relationship') || undefined,
      purposeOneLiner: this.getAttribute('purpose') || undefined,
    });
  }

  #render() {
    const targets = this.#targets();
    const url = this.#invite?.url || this.getAttribute('url') || '';

    if (!url) {
      this.#root.innerHTML = `<style>${STYLE}</style><div class="sheet"><p class="status" data-tone="error">No invite to show yet.</p></div>`;
      return;
    }

    const inviteeName = this.#invite?.invitee_name || this.getAttribute('invitee') || '';
    const brand = this.getAttribute('brand') || 'this app';
    const qrTarget = targets.find((t) => t.id === 'qr');
    const qrUrl = qrTarget?.url || url;

    const personal = targets.filter((t) => !t.public && t.id !== 'qr');
    const publicOnes = targets.filter((t) => t.public);

    const heading = inviteeName ? `Invite ${escapeHtml(inviteeName)}` : `Invite someone to ${escapeHtml(brand)}`;
    const lede =
      this.#invite?.message ||
      (inviteeName
        ? `Show the code if they're with you, or send it if they're not.`
        : `Show the code if they're with you, or send the link if they're not.`);

    this.#root.innerHTML = `
      <style>${STYLE}</style>
      <div class="sheet" part="sheet">
        <p class="eyebrow">Invitation</p>
        <h2>${heading}</h2>
        <p class="lede">${escapeHtml(lede)}</p>

        <div class="qr-wrap">
          ${qrSvg(qrUrl, { size: 260, title: `Invite code for ${brand}` })}
          <p class="qr-caption">Point a phone camera at this.</p>
        </div>

        <div class="link-row">
          <div class="link" title="${escapeHtml(url)}">${escapeHtml(url)}</div>
          <button class="compact" data-channel="copy" type="button">Copy</button>
        </div>

        ${personal.length ? `<p class="group-label">Send it to them</p>
        <ul class="channels">
          ${personal.map((t) => `<li><button type="button" data-channel="${t.id}">${escapeHtml(t.label)}</button></li>`).join('')}
        </ul>` : ''}

        ${publicOnes.length ? `<p class="group-label">Post it publicly</p>
        <p class="public-note">These are visible to everyone. The post won't name ${inviteeName ? escapeHtml(inviteeName) : 'anyone'} or your relationship.</p>
        <ul class="channels">
          ${publicOnes.map((t) => `<li><button type="button" data-channel="${t.id}">${escapeHtml(t.label)}</button></li>`).join('')}
        </ul>` : ''}

        <p class="status" role="status" aria-live="polite"></p>
      </div>
    `;

    this.#root.querySelectorAll('button[data-channel]').forEach((btn) => {
      btn.addEventListener('click', () => this.#activate(btn.dataset.channel, targets));
    });
  }

  async #activate(channelId, targets) {
    const target =
      targets.find((t) => t.id === channelId) ||
      // The inline Copy button next to the URL when 'copy' isn't an enabled channel.
      (channelId === 'copy'
        ? { id: 'copy', kind: 'clipboard', url: this.#invite?.url || this.getAttribute('url'), label: 'Copy' }
        : null);
    if (!target) return;

    const { activateChannel } = await import('./index.js');
    const result = await activateChannel(target);

    this.#status(
      result.reason || defaultMessage(result.action, target),
      result.ok ? 'ok' : 'error'
    );

    this.dispatchEvent(
      new CustomEvent('soma-invite-channel', {
        bubbles: true,
        composed: true,
        detail: { channel: target.id, url: target.url, result },
      })
    );
  }

  #status(text, tone) {
    const el = this.#root.querySelector('.status');
    if (!el) return;
    el.textContent = text;
    el.dataset.tone = tone;
  }
}

function defaultMessage(action, target) {
  switch (action) {
    case 'copied': return 'Copied. Paste it wherever you like.';
    case 'copied-and-opened': return `Copied — paste it into ${target.label}.`;
    case 'shared': return 'Shared.';
    case 'dismissed': return '';
    case 'handoff': return `Opening ${target.label}…`;
    case 'render': return '';
    default: return '';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
  );
}

/** Idempotent registration — safe to call from every module that needs it. */
export function defineInviteSheet(tag = 'soma-invite-sheet') {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(tag)) customElements.define(tag, SomaInviteSheet);
}

defineInviteSheet();
