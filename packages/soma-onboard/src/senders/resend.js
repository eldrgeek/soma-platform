/**
 * Server-side email sender (Resend).
 *
 * Resend is already the estate's transactional email path (it backs Supabase
 * auth email for Legends), so this reuses a domain that is verified rather than
 * introducing a second provider to warm up.
 *
 * Use this only when the inviter cannot hand the message off from their own
 * device — bulk invites from an admin page, scheduled nudges. For a person
 * holding a phone, the mailto handoff is better: the invite arrives from them,
 * in their own thread, and nothing can land it in a spam folder.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * @param {object} opts
 * @param {string} [opts.apiKey]   defaults to RESEND_API_KEY
 * @param {string} opts.from       verified sender, e.g. 'Vegas Connect <invites@…>'
 * @param {(msg: any) => string} [opts.html]  optional HTML renderer
 */
export function createResendSender(opts = {}) {
  const apiKey = opts.apiKey || process.env.RESEND_API_KEY;
  const from = opts.from || process.env.ONBOARD_INVITE_FROM;

  if (!apiKey) {
    throw new Error(
      'soma-onboard: createResendSender needs RESEND_API_KEY. ' +
        'Omit the sender entirely to fall back to the mailto handoff.'
    );
  }
  if (!from) {
    throw new Error(
      'soma-onboard: createResendSender needs `from` (or ONBOARD_INVITE_FROM), ' +
        'a sender address on a Resend-verified domain.'
    );
  }

  return {
    kind: 'resend',

    /**
     * @param {{to: string, subject: string, text: string, replyTo?: string,
     *          inviterName?: string, brandName?: string}} msg
     */
    async send(msg) {
      const payload = {
        from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        // Replies go to the human who invited them, not to a no-reply void.
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
        ...(opts.html ? { html: opts.html(msg) } : { html: defaultHtml(msg) }),
      };

      const res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Resend rejected the invite (${res.status}): ${text.slice(0, 300)}`);
      }
      try {
        return JSON.parse(text);
      } catch {
        return { id: null, raw: text };
      }
    },
  };
}

/** Deliberately plain. An invitation that looks like marketing reads like spam. */
function defaultHtml(msg) {
  const escaped = String(msg.text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const linked = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#1a4d8f">$1</a>'
  );
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#102743;white-space:pre-wrap">${linked}</div>`;
}

/**
 * A sender that records instead of sending. For tests and for dry-running an
 * invite campaign before it costs anything.
 */
export function createRecordingSender() {
  const sent = [];
  return {
    kind: 'recording',
    sent,
    async send(msg) {
      sent.push(msg);
      return { id: `rec_${sent.length}` };
    },
  };
}
