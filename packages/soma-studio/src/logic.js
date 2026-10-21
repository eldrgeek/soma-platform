// The studio's rules as pure functions over one studio's state object. The
// store (store.js) loads the state, runs one of these, and writes it back
// only if nobody else wrote in between. Nothing here touches the network.

// A sitting ends when nobody has written for this long; the next message
// opens a new session, so the team's copy starts fresh with the agreements.
export const SESSION_GAP_MS = 3 * 60 * 60 * 1000;
export const MAX_TEXT = 8000;
export const MAX_ITEM_TEXT = 600;

export function emptyState() {
  return {
    version: 0,
    msgSeq: 0,
    lastHumanSeq: 0,
    lastHumanAt: null,
    lastMessageAt: null,
    sessions: [],
    agreements: [],
    nextAgreement: 1,
    questions: [],
    nextQuestion: 1,
    teamCursor: 0,
    team: { status: 'idle', since: null, upTo: 0, pickupMs: null, answerMs: null },
    app: { version: 0, changedAt: null, versionId: null },
  };
}

export function currentSession(state) {
  return state.sessions.at(-1) ?? null;
}

// "3: yes" answers open question 3. Each line of a message may answer one
// question. Only the colon form counts, so a numbered list ("1. Buy milk")
// is never read as answers.
// A digit straight after the colon is a time of day ("10:30 works"), not an answer.
const ANSWER_LINE = /^\s*(?:q|#)?\s*(\d{1,4})\s*:(?!\d)\s*(\S.*?)\s*$/i;

export function parseAnswers(text) {
  const answers = [];
  for (const line of String(text ?? '').split('\n')) {
    const match = line.match(ANSWER_LINE);
    if (!match) continue;
    const n = Number(match[1]);
    if (answers.some((answer) => answer.n === n)) continue;
    answers.push({ n, answer: match[2] });
  }
  return answers;
}

function clip(text, max) {
  const value = String(text ?? '').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function bump(state) {
  state.version += 1;
}

function messageRef(state, value) {
  return Number.isInteger(value) && value > 0 && value <= state.msgSeq ? value : null;
}

// Opens a new session when there is none, when the last message is old
// enough, or when a host asks. Returns the session the next message joins.
export function ensureSession(state, at, by, { force = false } = {}) {
  const last = currentSession(state);
  const idle = state.lastMessageAt && Date.parse(at) - Date.parse(state.lastMessageAt) > SESSION_GAP_MS;
  if (!last || idle || force) {
    const session = { n: (last?.n ?? 0) + 1, startedAt: at, startedBy: by, firstSeq: state.msgSeq + 1 };
    state.sessions.push(session);
    bump(state);
    return session;
  }
  return last;
}

export function addAgreement(state, { text, from = null, fromQuestion = null, by, at }) {
  const value = clip(text, MAX_ITEM_TEXT);
  if (!value) return null;
  const agreement = {
    n: state.nextAgreement++,
    text: value,
    from: messageRef(state, from),
    fromQuestion,
    by,
    at,
    status: 'active',
    history: [],
  };
  state.agreements.push(agreement);
  bump(state);
  return agreement;
}

export function addQuestion(state, { text, from = null, by, at }) {
  const value = clip(text, MAX_ITEM_TEXT);
  if (!value) return null;
  // The same open question twice is one question.
  const same = state.questions.find(
    (question) => question.status === 'open' && question.text.toLowerCase() === value.toLowerCase(),
  );
  if (same) return same;
  const question = {
    n: state.nextQuestion++,
    text: value,
    from: messageRef(state, from),
    by,
    at,
    status: 'open',
    highlighted: false,
    highlightReason: null,
  };
  state.questions.push(question);
  bump(state);
  return question;
}

// An answered question leaves the open list and becomes an agreement that
// names the question, so the decision is kept where decisions are kept.
export function answerQuestion(state, { n, answer, by, at, messageSeq }) {
  const question = state.questions.find((item) => item.n === n);
  if (!question || question.status !== 'open') return null;
  const text = clip(answer, MAX_ITEM_TEXT);
  if (!text) return null;
  question.status = 'answered';
  question.highlighted = false;
  question.answer = text;
  question.answeredBy = by;
  question.answeredAt = at;
  question.answeredIn = messageRef(state, messageSeq);
  const agreement = addAgreement(state, {
    text: `${question.text} — ${text}`,
    from: messageSeq,
    fromQuestion: n,
    by,
    at,
  });
  question.agreement = agreement?.n ?? null;
  bump(state);
  return { question, agreement };
}

export function highlightQuestion(state, { n, reason }) {
  const question = state.questions.find((item) => item.n === n);
  if (!question || question.status !== 'open') return null;
  question.highlighted = true;
  question.highlightReason = clip(reason, 300) || null;
  bump(state);
  return question;
}

export function dropQuestion(state, { n, by, at }) {
  const question = state.questions.find((item) => item.n === n);
  if (!question || question.status !== 'open') return null;
  question.status = 'dropped';
  question.highlighted = false;
  question.droppedBy = by;
  question.droppedAt = at;
  bump(state);
  return question;
}

export function editAgreement(state, { n, text, by, at }) {
  const agreement = state.agreements.find((item) => item.n === n);
  if (!agreement || agreement.status !== 'active') return null;
  const value = clip(text, MAX_ITEM_TEXT);
  if (!value || value === agreement.text) return agreement;
  agreement.history.push({
    text: agreement.text,
    by: agreement.editedBy ?? agreement.by,
    at: agreement.editedAt ?? agreement.at,
  });
  agreement.text = value;
  agreement.editedBy = by;
  agreement.editedAt = at;
  bump(state);
  return agreement;
}

export function removeAgreement(state, { n, by, at }) {
  const agreement = state.agreements.find((item) => item.n === n);
  if (!agreement || agreement.status !== 'active') return null;
  agreement.status = 'removed';
  agreement.removedBy = by;
  agreement.removedAt = at;
  bump(state);
  return agreement;
}

// Allocates the next message number and applies what a message does to the
// state. A decider's "N: answer" lines answer open questions, because only a
// decider's own message makes an agreement (use case UC1-P4). The message
// itself is stored separately (store.js), under the number returned here.
export function admitMessage(state, { author, text, at, replyTo = null, canDecide = false }) {
  const body = clip(text, MAX_TEXT);
  if (!body) throw new Error('A message needs text');
  const session = ensureSession(state, at, author.name);
  const seq = ++state.msgSeq;
  state.lastMessageAt = at;
  const answered = [];
  if (author.kind === 'human') {
    state.lastHumanSeq = seq;
    state.lastHumanAt = at;
    if (state.team.status === 'idle') state.team = { ...state.team, status: 'waiting' };
    for (const { n, answer } of canDecide ? parseAnswers(body) : []) {
      if (answerQuestion(state, { n, answer, by: author.name, at, messageSeq: seq })) answered.push(n);
    }
  }
  bump(state);
  return {
    seq,
    session: session.n,
    at,
    author,
    text: body,
    replyTo: Number.isInteger(replyTo) && replyTo > 0 && replyTo < seq ? replyTo : null,
    answers: answered,
  };
}

// The team picked up everything up to `upTo` and is thinking. The pickup
// delay is measured here, on the server's clock, from the newest message.
export function teamWorking(state, { upTo, at }) {
  const target = Math.min(Number(upTo) || 0, state.msgSeq);
  state.team = {
    status: 'working',
    since: at,
    upTo: target,
    pickupMs: state.lastHumanAt ? Math.max(0, Date.parse(at) - Date.parse(state.lastHumanAt)) : null,
    answerMs: null,
  };
  bump(state);
  return state.team;
}

// The team's answer: its message plus the agreements, questions, answers and
// highlights it found. `upTo` moves the team's cursor, so those messages are
// not answered twice.
//
// The team only records what a decider said (UC1-P4): an agreement or an
// answer must link to a decider's own message (`isDeciderMessage`). An
// agreement that does not becomes an open question ("Do we agree: ...?"), so
// a decider settles it with "N: yes".
export function applyTeamReply(state, reply, { at, by = 'The team', messageSeq, isDeciderMessage }) {
  const result = { agreements: [], questions: [], answered: [], highlighted: [], toConfirm: [] };
  const decided = (seq) => Number.isInteger(seq) && isDeciderMessage(seq);
  for (const item of reply.answered ?? []) {
    if (!decided(item.from)) continue;
    const done = answerQuestion(state, { n: Number(item.n), answer: item.answer, by, at, messageSeq: item.from });
    if (done) result.answered.push(done.question.n);
  }
  for (const item of reply.agreements ?? []) {
    const from = Number.isInteger(item.from) ? item.from : reply.replyTo;
    if (decided(from)) {
      const made = addAgreement(state, { text: item.text, from, by, at });
      if (made) result.agreements.push(made.n);
    } else if (String(item.text ?? '').trim()) {
      const asked = addQuestion(state, { text: `Do we agree: ${String(item.text).trim()}`, from: messageSeq, by, at });
      if (asked) result.toConfirm.push(asked.n);
    }
  }
  for (const item of reply.questions ?? []) {
    const made = addQuestion(state, {
      text: item.text,
      from: Number.isInteger(item.from) ? item.from : messageSeq,
      by,
      at,
    });
    if (made) result.questions.push(made.n);
  }
  for (const n of reply.unhighlight ?? []) {
    const question = state.questions.find((item) => item.n === Number(n));
    if (question?.highlighted) {
      question.highlighted = false;
      question.highlightReason = null;
      bump(state);
    }
  }
  for (const item of reply.highlight ?? []) {
    if (highlightQuestion(state, { n: Number(item.n), reason: item.reason })) result.highlighted.push(Number(item.n));
  }
  if (Number.isInteger(reply.upTo) && reply.upTo > state.teamCursor) {
    state.teamCursor = Math.min(reply.upTo, state.msgSeq);
  }
  const since = state.team?.status === 'working' ? state.team.since : null;
  state.team = {
    status: state.teamCursor >= state.lastHumanSeq ? 'idle' : 'waiting',
    since: at,
    upTo: state.teamCursor,
    pickupMs: state.team?.pickupMs ?? null,
    answerMs: since ? Math.max(0, Date.parse(at) - Date.parse(since)) : null,
  };
  bump(state);
  return result;
}

// The team gave up on messages up to `upTo` (after its retries); the cursor
// moves on so one bad message cannot stall the studio.
export function teamSkip(state, { upTo, at }) {
  if (Number.isInteger(upTo) && upTo > state.teamCursor) state.teamCursor = Math.min(upTo, state.msgSeq);
  state.team = {
    ...state.team,
    status: state.teamCursor >= state.lastHumanSeq ? 'idle' : 'waiting',
    since: at,
    upTo: state.teamCursor,
  };
  bump(state);
  return state.team;
}

export function appChanged(state, { versionId, at }) {
  state.app = {
    version: (state.app?.version ?? 0) + 1,
    changedAt: at,
    versionId: typeof versionId === 'string' ? versionId.slice(0, 40) : null,
  };
  bump(state);
  return state.app;
}

// What a member's page needs from the state.
export function publicState(state) {
  return {
    version: state.version,
    msgSeq: state.msgSeq,
    sessions: state.sessions,
    agreements: state.agreements,
    questions: state.questions,
    team: state.team,
    teamCursor: state.teamCursor,
    lastHumanSeq: state.lastHumanSeq,
    app: state.app,
  };
}
