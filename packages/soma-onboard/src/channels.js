/**
 * Invite channels.
 *
 * Vegas Connect / Revolution 1x1 shipped exactly one channel: a QR code shown
 * phone-to-phone, with a copy-link fallback. That works because those invites
 * happen in person — but it makes "invite your brother in Cleveland" impossible.
 * This module is the part of SOMA-onboard that did not previously exist.
 *
 * Two delivery modes, deliberately:
 *
 *   handoff  — the invite is composed here and handed to the inviter's own mail
 *              client / SMS app / share sheet / social composer. Zero infra, no
 *              deliverability problem, and the message provably comes FROM the
 *              inviter, which is the whole social proof of an invitation. This
 *              is the default for every channel.
 *
 *   server   — the app sends the email itself (senders/resend.js). Needed when
 *              the inviter isn't holding a device (bulk invites from an admin
 *              page, a scheduled reminder). Costs a domain + API key, and the
 *              message comes from the app, not the person. Opt-in per call.
 *
 * QR is a channel like any other; it just renders instead of navigating.
 */

/**
 * @typedef {'qr'|'copy'|'native'|'email'|'sms'|'whatsapp'|'signal'|'telegram'|'x'|'linkedin'|'facebook'} ChannelId
 */

/**
 * @typedef {object} InviteContext
 * @property {string} url            the tagged invite URL for this channel
 * @property {string} brandName
 * @property {string} inviterName
 * @property {string} [inviteeName]
 * @property {string} [relationship]
 * @property {string} [purposeOneLiner]
 * @property {string} [note]         a personal line the inviter typed
 */

/** SMS bodies get truncated by carriers; keep the whole thing in one segment-ish. */
const SMS_MAX = 300;
/** X/Twitter counts the URL as 23 chars regardless of length. */
const X_MAX = 280;

export const CHANNELS = [
  {
    id: 'qr',
    label: 'Show a QR code',
    kind: 'render',
    inPerson: true,
    hint: 'Best when you are standing next to them.',
  },
  {
    id: 'copy',
    label: 'Copy invite link',
    kind: 'clipboard',
    hint: 'Paste it anywhere.',
  },
  {
    id: 'native',
    label: 'Share…',
    kind: 'native',
    hint: 'Opens your phone’s share sheet.',
  },
  {
    id: 'email',
    label: 'Email',
    kind: 'protocol',
    serverSendable: true,
  },
  {
    id: 'sms',
    label: 'Text message',
    kind: 'protocol',
  },
  { id: 'whatsapp', label: 'WhatsApp', kind: 'web' },
  { id: 'signal', label: 'Signal', kind: 'web' },
  { id: 'telegram', label: 'Telegram', kind: 'web' },
  { id: 'x', label: 'X', kind: 'web', public: true },
  { id: 'linkedin', label: 'LinkedIn', kind: 'web', public: true },
  { id: 'facebook', label: 'Facebook', kind: 'web', public: true },
];

export const CHANNEL_IDS = CHANNELS.map((c) => c.id);

/** @param {string} id */
export function getChannel(id) {
  return CHANNELS.find((c) => c.id === id) || null;
}

// ---------------------------------------------------------------------------
// Message composition
// ---------------------------------------------------------------------------

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

/**
 * The relationship clause. "Mike is adding you as a cousin" reads warmer and,
 * more usefully, it tells the invitee this is not a mass blast.
 * @param {InviteContext} ctx
 */
function relationshipClause(ctx) {
  if (!ctx.relationship) return '';
  const article = /^[aeiou]/i.test(ctx.relationship) ? 'an' : 'a';
  return ` as ${article} ${ctx.relationship}`;
}

/**
 * Compose the message for a channel. Public channels (X, LinkedIn, Facebook)
 * never name the invitee or the relationship — those posts are visible to
 * strangers, and "Mike invited Dana as his wife" is not something to
 * broadcast. This is a hard rule, not a style preference.
 *
 * @param {ChannelId} channelId
 * @param {InviteContext} ctx
 * @returns {{ subject: string, body: string, short: string }}
 */
export function composeInvite(channelId, ctx) {
  const channel = getChannel(channelId);
  const isPublic = !!channel?.public;
  const inviter = ctx.inviterName || 'A member';
  const brand = ctx.brandName;
  const purpose = ctx.purposeOneLiner || '';
  const note = String(ctx.note || '').trim();

  const subject = isPublic
    ? `I'm on ${brand}`
    : `${inviter} invited you to ${brand}`;

  if (isPublic) {
    const short = truncateForX(
      [`I'm on ${brand}.`, purpose, 'Come in through my invite:'].filter(Boolean).join(' '),
      ctx.url
    );
    return { subject, body: `${short}\n\n${ctx.url}`, short };
  }

  const greeting = ctx.inviteeName ? `${firstName(ctx.inviteeName)} —` : 'Hi —';
  const lead = `${inviter} invited you to join ${brand}${relationshipClause(ctx)}.`;

  const bodyLines = [
    greeting,
    '',
    lead,
    purpose ? '' : null,
    purpose || null,
    note ? '' : null,
    note || null,
    '',
    'Your invite link:',
    ctx.url,
    '',
    'It only works for you, and it expires if it goes unused.',
  ].filter((l) => l !== null);

  const body = bodyLines.join('\n');

  const short = truncate(
    [lead, note].filter(Boolean).join(' ') + ` ${ctx.url}`,
    SMS_MAX
  );

  return { subject, body, short };
}

function truncate(text, max) {
  const s = String(text);
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/** X counts every URL as 23 chars; budget the prose against that. */
function truncateForX(prose, url) {
  const budget = X_MAX - 23 - 2; // url + the "\n\n" before it
  return truncate(prose, budget);
}

// ---------------------------------------------------------------------------
// Channel targets — what a button actually does
// ---------------------------------------------------------------------------

/**
 * @typedef {object} ChannelTarget
 * @property {ChannelId} id
 * @property {string} label
 * @property {'render'|'clipboard'|'native'|'protocol'|'web'} kind
 * @property {string} url          the tagged invite URL (for qr/copy/native)
 * @property {string} [href]       where the button navigates (protocol/web)
 * @property {string} [subject]
 * @property {string} [body]
 * @property {string} [hint]
 * @property {boolean} [public]
 */

/**
 * Build the href for one channel.
 *
 * @param {ChannelId} channelId
 * @param {InviteContext} ctx
 * @param {{ email?: string, phone?: string }} [to] known contact details
 * @returns {ChannelTarget}
 */
export function channelTarget(channelId, ctx, to = {}) {
  const channel = getChannel(channelId);
  if (!channel) throw new Error(`soma-onboard: unknown channel ${JSON.stringify(channelId)}`);

  const { subject, body, short } = composeInvite(channelId, ctx);
  const base = {
    id: channel.id,
    label: channel.label,
    kind: channel.kind,
    url: ctx.url,
    subject,
    body,
    hint: channel.hint,
    public: !!channel.public,
  };

  switch (channel.id) {
    case 'qr':
    case 'copy':
    case 'native':
      return base;

    case 'email': {
      const addr = to.email ? encodeURIComponent(to.email) : '';
      const q = new URLSearchParams({ subject, body });
      return { ...base, href: `mailto:${addr}?${q.toString()}` };
    }

    case 'sms': {
      // RFC 5724 uses `?body=`; iOS historically wanted `&body=`. `?` works on
      // both current iOS and Android, and a lone `sms:` with no number opens
      // the composer with the body prefilled, which is what we want.
      const num = to.phone ? String(to.phone).replace(/[^\d+]/g, '') : '';
      return { ...base, href: `sms:${num}?&body=${encodeURIComponent(short)}` };
    }

    case 'whatsapp': {
      const num = to.phone ? String(to.phone).replace(/[^\d]/g, '') : '';
      const q = new URLSearchParams({ text: short });
      return {
        ...base,
        href: num
          ? `https://wa.me/${num}?${q.toString()}`
          : `https://wa.me/?${q.toString()}`,
      };
    }

    case 'signal':
      // Signal has no prefill-message URL scheme. Best honest behaviour is to
      // put the message on the clipboard and open the app.
      return { ...base, kind: 'clipboard', href: 'https://signal.me/', hint: 'Copies the invite, then opens Signal.' };

    case 'telegram': {
      const q = new URLSearchParams({ url: ctx.url, text: short });
      return { ...base, href: `https://t.me/share/url?${q.toString()}` };
    }

    case 'x': {
      const q = new URLSearchParams({ text: short });
      return { ...base, href: `https://twitter.com/intent/tweet?${q.toString()}` };
    }

    case 'linkedin': {
      const q = new URLSearchParams({ url: ctx.url });
      return { ...base, href: `https://www.linkedin.com/sharing/share-offsite/?${q.toString()}` };
    }

    case 'facebook': {
      const q = new URLSearchParams({ u: ctx.url });
      return { ...base, href: `https://www.facebook.com/sharer/sharer.php?${q.toString()}` };
    }

    default:
      return base;
  }
}

/**
 * Every enabled channel, tagged and composed, ready to render as buttons.
 * Channels the app disabled in config are absent; channels that need a phone
 * number still appear (they open an empty composer) unless `requireContact`.
 *
 * @param {import('./config.js').OnboardConfig} cfg
 * @param {InviteContext} ctx  ctx.url should be the UNtagged invite url
 * @param {{ email?: string, phone?: string, requireContact?: boolean }} [to]
 * @returns {ChannelTarget[]}
 */
export function channelTargets(cfg, ctx, to = {}) {
  const tag = (url, id) => {
    try {
      const u = new URL(url);
      u.searchParams.set('ch', id);
      if (getChannel(id)?.public) return stripForPublic(u);
      return u.toString();
    } catch {
      return url;
    }
  };

  return cfg.channels
    .filter((id) => CHANNEL_IDS.includes(id))
    .filter((id) => {
      if (!to.requireContact) return true;
      if (id === 'email') return !!to.email;
      if (id === 'sms' || id === 'whatsapp') return !!to.phone;
      return true;
    })
    .map((id) => channelTarget(id, { ...ctx, url: tag(ctx.url, id) }, to));
}

/**
 * A public post gets a bare invite link — inviter code and channel tag, nothing
 * else. Two things are being prevented here, and the second is the serious one:
 *
 *   `for` / `rel` — the invitee's name and how they're related to the inviter.
 *                   Composing a name-free message is pointless if the URL
 *                   underneath it says `?for=Dana%20Foster&rel=wife`.
 *
 *   `claim`       — the code that lets its bearer become a specific pre-created
 *                   member, whose email and phone the inviter already supplied.
 *                   Posted to X, that is a one-tap identity handover to whoever
 *                   reads it first. A claim link is only ever for the person it
 *                   was made for.
 *
 * The path is rewritten too: `/j/<code>/join` is the claim landing page, so a
 * public link goes to the plain `/j/<code>` invite page instead.
 *
 * @param {URL} u
 */
function stripForPublic(u) {
  for (const key of ['claim', 'for', 'rel', 'invite']) u.searchParams.delete(key);
  u.pathname = u.pathname.replace(/\/join\/?$/, '');
  return u.toString();
}
