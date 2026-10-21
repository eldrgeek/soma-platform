// Pure helpers for the studio page: text to safe HTML, and the words the page
// shows about the team. No DOM here, so the tests run them in Node.

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

// A small, safe subset of Markdown: paragraphs, line breaks, `code`, **bold**,
// links, and "#12" references to messages. Everything is escaped first, so
// nothing a person or the team writes can add markup of its own.
const URL_RE = /https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]]/g;

export function renderText(text) {
  const words = (part) =>
    escapeHtml(part)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])#(\d{1,6})\b/g, '$1<a href="#m-$2" data-ref="$2">#$2</a>');
  // Links are cut out of the raw text before escaping, so a quote or an
  // ampersand can never end up half inside an attribute.
  const inline = (line) => {
    let html = '';
    let offset = 0;
    for (const match of line.matchAll(URL_RE)) {
      html += words(line.slice(offset, match.index));
      const url = escapeHtml(match[0]);
      html += `<a href="${url}" target="_blank" rel="noopener">${url}</a>`;
      offset = match.index + match[0].length;
    }
    return html + words(line.slice(offset));
  };
  return String(text ?? '')
    .trim()
    .split(/\n{2,}/)
    .map((block) => `<p>${block.split('\n').map(inline).join('<br>')}</p>`)
    .join('');
}

export function seconds(ms) {
  if (!Number.isFinite(ms)) return null;
  return ms < 10000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}

// One line under the chat that says what the team is doing and how long it
// takes, measured on the server's clock.
export function teamStatusText(team, { nowMs, lastHumanAtMs, lastHumanSeq = 0, teamCursor = 0, listening }) {
  const pickup = seconds(team?.pickupMs);
  if (team?.status === 'working') {
    const since = Date.parse(team.since);
    const elapsed = Number.isFinite(since) ? seconds(Math.max(0, nowMs - since)) : null;
    return {
      tone: 'working',
      text: `The team is working on it${pickup ? ` (picked up ${pickup} after it was sent)` : ''}${elapsed ? ` · ${elapsed} so far` : ''}.`,
    };
  }
  if (lastHumanSeq > teamCursor) {
    const waited = Number.isFinite(lastHumanAtMs) ? Math.max(0, nowMs - lastHumanAtMs) : 0;
    if (waited > 20000) {
      return {
        tone: 'stalled',
        text: `The team has not picked this up after ${seconds(waited)}. Its listener on Mike's Mac may be offline; the message is kept and will be answered when it returns.`,
      };
    }
    return { tone: 'waiting', text: `Sent. The team usually picks a message up within 2 seconds.` };
  }
  const answered = seconds(team?.answerMs);
  const last = pickup || answered ? ` Last answer: picked up in ${pickup ?? '?'}, answered in ${answered ?? '?'}.` : '';
  return {
    tone: 'idle',
    text: `The team is listening. A new message reaches it by a push from the server in about a second. A short answer takes about 10 seconds; one that reads files can take a minute or more.${last}${listening ? '' : ' (Live updates are reconnecting; the page checks every few seconds.)'}`,
  };
}

export function timeLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function dateLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// What a team message changed, in words: "Added A3 and A4. Asked question 5."
export function madeText(made) {
  if (!made) return '';
  const parts = [];
  const list = (items, prefix = '') => items.map((n) => `${prefix}${n}`).join(', ');
  if (made.agreements?.length) parts.push(`Added agreement ${list(made.agreements, 'A')}.`);
  if (made.questions?.length) parts.push(`Asked question ${list(made.questions)}.`);
  if (made.answered?.length) parts.push(`Recorded the answer to question ${list(made.answered)}.`);
  if (made.highlighted?.length) parts.push(`Highlighted question ${list(made.highlighted)}.`);
  return parts.join(' ');
}
