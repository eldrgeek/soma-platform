import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addQuestion,
  admitMessage,
  applyTeamReply,
  editAgreement,
  emptyState,
  ensureSession,
  parseAnswers,
  removeAgreement,
  SESSION_GAP_MS,
  teamSkip,
  teamWorking,
} from '../src/logic.js';

const MIKE = { kind: 'human', id: 'u1', name: 'Mike', email: 'mw@mike-wolf.com' };
const TEAM = { kind: 'team', id: 'ai:team', name: 'The team' };
const T0 = '2026-10-21T10:00:00.000Z';
const later = (iso, ms) => new Date(Date.parse(iso) + ms).toISOString();

test('parseAnswers reads "N: answer" lines and nothing else', () => {
  assert.deepEqual(parseAnswers('3: yes'), [{ n: 3, answer: 'yes' }]);
  assert.deepEqual(parseAnswers('  Q4 : no, not yet  '), [{ n: 4, answer: 'no, not yet' }]);
  assert.deepEqual(parseAnswers('#5: the blue one'), [{ n: 5, answer: 'the blue one' }]);
  assert.deepEqual(parseAnswers('3: yes\n5: no\nand one more thought'), [
    { n: 3, answer: 'yes' },
    { n: 5, answer: 'no' },
  ]);
  // A numbered list is not a set of answers, and neither is a time of day in prose.
  assert.deepEqual(parseAnswers('1. Buy milk\n2) Call Eric'), []);
  assert.deepEqual(parseAnswers('meet at 10:30 tomorrow'), []);
  assert.deepEqual(parseAnswers('10:30 works for me'), []);
  assert.deepEqual(parseAnswers('3: 5 people'), [{ n: 3, answer: '5 people' }]);
  assert.deepEqual(parseAnswers('3:'), []);
  // The first answer to a number wins.
  assert.deepEqual(parseAnswers('2: yes\n2: no'), [{ n: 2, answer: 'yes' }]);
});

test('messages are numbered in order and a person answers an open question by number', () => {
  const state = emptyState();
  const first = admitMessage(state, { author: MIKE, text: 'Hello team', at: T0 });
  assert.equal(first.seq, 1);
  assert.equal(first.session, 1);
  const question = addQuestion(state, { text: 'Should the studio show the app?', from: 1, by: 'The team', at: T0 });
  assert.equal(question.n, 1);

  // A member who is not a decider cannot answer by number.
  const aside = admitMessage(state, { author: MIKE, text: '1: no', at: later(T0, 500) });
  assert.deepEqual(aside.answers, []);
  assert.equal(state.questions[0].status, 'open');

  const answer = admitMessage(state, { author: MIKE, text: '1: yes, on the right', at: later(T0, 1000), canDecide: true });
  assert.equal(answer.seq, 3);
  assert.deepEqual(answer.answers, [1]);
  assert.equal(state.questions[0].status, 'answered');
  assert.equal(state.questions[0].answeredIn, 3);
  assert.equal(state.agreements.length, 1);
  assert.equal(state.agreements[0].text, 'Should the studio show the app? — yes, on the right');
  assert.equal(state.agreements[0].from, 3);
  assert.equal(state.agreements[0].fromQuestion, 1);
  assert.equal(state.lastHumanSeq, 3);

  // An answered question cannot be answered again, and a missing one is ignored.
  const again = admitMessage(state, { author: MIKE, text: '1: no\n9: maybe', at: later(T0, 2000), canDecide: true });
  assert.deepEqual(again.answers, []);
  assert.equal(state.agreements.length, 1);
});

test('the team never answers questions with "N:" lines in its own message', () => {
  const state = emptyState();
  admitMessage(state, { author: MIKE, text: 'Start', at: T0 });
  addQuestion(state, { text: 'Which colour?', by: 'The team', at: T0 });
  const reply = admitMessage(state, { author: TEAM, text: '1: I would pick blue', at: T0 });
  assert.deepEqual(reply.answers, []);
  assert.equal(state.questions[0].status, 'open');
  assert.equal(state.lastHumanSeq, 1);
});

test('a long silence starts a new session; a host can start one at once', () => {
  const state = emptyState();
  admitMessage(state, { author: MIKE, text: 'one', at: T0 });
  const soon = admitMessage(state, { author: MIKE, text: 'two', at: later(T0, SESSION_GAP_MS - 1000) });
  assert.equal(soon.session, 1);
  const next = admitMessage(state, { author: MIKE, text: 'three', at: later(T0, 2 * SESSION_GAP_MS) });
  assert.equal(next.session, 2);
  assert.equal(state.sessions[1].firstSeq, 3);
  ensureSession(state, later(T0, 2 * SESSION_GAP_MS + 5), 'Mike', { force: true });
  assert.equal(state.sessions.length, 3);
  assert.equal(admitMessage(state, { author: MIKE, text: 'four', at: later(T0, 2 * SESSION_GAP_MS + 9) }).session, 3);
});

test('the same open question twice is kept once', () => {
  const state = emptyState();
  const a = addQuestion(state, { text: 'Who is it for?', by: 'The team', at: T0 });
  const b = addQuestion(state, { text: 'who is it for?', by: 'The team', at: T0 });
  assert.equal(a, b);
  assert.equal(state.questions.length, 1);
  assert.equal(state.nextQuestion, 2);
});

test('the team reply adds agreements, questions, answers and highlights, and moves its cursor', () => {
  const state = emptyState();
  admitMessage(state, { author: MIKE, text: 'Use the name SOMA Studio', at: T0 });
  addQuestion(state, { text: 'Old question?', by: 'The team', at: T0 });
  addQuestion(state, { text: 'Still open?', by: 'The team', at: T0 });
  admitMessage(state, { author: MIKE, text: 'and question one is settled: no', at: later(T0, 1000) });
  teamWorking(state, { upTo: 2, at: later(T0, 2500) });
  assert.equal(state.team.status, 'working');
  assert.equal(state.team.pickupMs, 1500);

  const message = admitMessage(state, { author: TEAM, text: 'Noted.', at: later(T0, 20000), replyTo: 2 });
  const made = applyTeamReply(
    state,
    {
      replyTo: 2,
      upTo: 2,
      agreements: [{ text: 'The product is called SOMA Studio.', from: 1 }, { text: '' }],
      questions: [{ text: 'Who hosts the first studio?' }],
      answered: [{ n: 1, answer: 'no', from: 2 }],
      highlight: [{ n: 2, reason: 'It decides the layout' }],
    },
    { at: later(T0, 20000), messageSeq: message.seq, isDeciderMessage: (seq) => seq === 1 || seq === 2 },
  );
  assert.deepEqual(made.answered, [1]);
  assert.deepEqual(made.questions, [3]);
  assert.deepEqual(made.highlighted, [2]);
  const named = state.agreements.find((item) => item.text === 'The product is called SOMA Studio.');
  assert.equal(named.from, 1);
  assert.equal(state.agreements.find((item) => item.fromQuestion === 1).from, 2);
  assert.equal(state.questions.find((item) => item.n === 2).highlighted, true);
  assert.equal(state.questions.find((item) => item.n === 3).from, message.seq);
  assert.equal(state.teamCursor, 2);
  assert.equal(state.team.status, 'idle');
  assert.equal(state.team.answerMs, 17500);
  assert.equal(state.team.pickupMs, 1500);
});

test('a message that arrives while the team thinks leaves the team waiting, not idle', () => {
  const state = emptyState();
  admitMessage(state, { author: MIKE, text: 'first', at: T0 });
  teamWorking(state, { upTo: 1, at: later(T0, 1000) });
  admitMessage(state, { author: MIKE, text: 'second', at: later(T0, 2000) });
  const reply = admitMessage(state, { author: TEAM, text: 'about the first', at: later(T0, 9000) });
  applyTeamReply(state, { upTo: 1 }, { at: later(T0, 9000), messageSeq: reply.seq, isDeciderMessage: () => true });
  assert.equal(state.teamCursor, 1);
  assert.equal(state.team.status, 'waiting');
});

test('an agreement link must point at a message that exists', () => {
  const state = emptyState();
  admitMessage(state, { author: MIKE, text: 'only message', at: T0 });
  const reply = admitMessage(state, { author: TEAM, text: 'ok', at: T0 });
  applyTeamReply(state, { agreements: [{ text: 'A thing', from: 99 }] }, { at: T0, messageSeq: reply.seq, isDeciderMessage: () => true });
  assert.equal(state.agreements[0].from, null);
});

test('a host correction keeps the old wording; a removal keeps the record', () => {
  const state = emptyState();
  admitMessage(state, { author: MIKE, text: 'go', at: T0 });
  const reply = admitMessage(state, { author: TEAM, text: 'ok', at: T0 });
  applyTeamReply(state, { replyTo: 1, agreements: [{ text: 'Studio v1 is hand built.' }] }, { at: T0, messageSeq: reply.seq, isDeciderMessage: (seq) => seq === 1 });
  const edited = editAgreement(state, { n: 1, text: 'Studio v1 is hand built, then rewritten in Puppet.', by: 'Mike', at: later(T0, 5) });
  assert.equal(edited.text, 'Studio v1 is hand built, then rewritten in Puppet.');
  assert.deepEqual(edited.history.map((item) => item.text), ['Studio v1 is hand built.']);
  assert.equal(edited.editedBy, 'Mike');
  const removed = removeAgreement(state, { n: 1, by: 'Mike', at: later(T0, 9) });
  assert.equal(removed.status, 'removed');
  assert.equal(state.agreements.length, 1);
  assert.equal(editAgreement(state, { n: 1, text: 'again', by: 'Mike', at: T0 }), null);
});

test('teamSkip moves the cursor past messages the team gave up on', () => {
  const state = emptyState();
  admitMessage(state, { author: MIKE, text: 'a', at: T0 });
  admitMessage(state, { author: MIKE, text: 'b', at: T0 });
  teamSkip(state, { upTo: 2, at: T0 });
  assert.equal(state.teamCursor, 2);
  assert.equal(state.team.status, 'idle');
  teamSkip(state, { upTo: 50, at: T0 });
  assert.equal(state.teamCursor, 2);
});

test('every change bumps the version, so pages know to fetch the state again', () => {
  const state = emptyState();
  const versions = [state.version];
  admitMessage(state, { author: MIKE, text: 'a', at: T0 });
  versions.push(state.version);
  addQuestion(state, { text: 'q?', by: 'The team', at: T0 });
  versions.push(state.version);
  teamWorking(state, { upTo: 1, at: T0 });
  versions.push(state.version);
  for (let i = 1; i < versions.length; i += 1) assert.ok(versions[i] > versions[i - 1]);
});

test('the team records only what a decider said; anything else becomes a question to confirm', () => {
  const state = emptyState();
  admitMessage(state, { author: MIKE, text: 'Ship it Friday', at: T0 });
  admitMessage(state, { author: { ...MIKE, name: 'Eric', email: 'eric@example.com' }, text: 'Blue would be nice', at: T0 });
  addQuestion(state, { text: 'Which day?', by: 'The team', at: T0 });
  const reply = admitMessage(state, { author: TEAM, text: 'Noted', at: T0, replyTo: 2 });
  const made = applyTeamReply(
    state,
    {
      replyTo: 2,
      agreements: [
        { text: 'Ship on Friday.', from: 1 },
        { text: 'The page is blue.', from: 2 },
        { text: 'Use the team wording.' },
      ],
      answered: [{ n: 1, answer: 'Thursday', from: 2 }],
    },
    { at: T0, messageSeq: reply.seq, isDeciderMessage: (seq) => seq === 1 },
  );
  assert.deepEqual(state.agreements.map((item) => item.text), ['Ship on Friday.']);
  assert.deepEqual(made.agreements, [1]);
  assert.deepEqual(made.answered, [], 'a non-decider message cannot answer a question');
  assert.equal(state.questions.find((item) => item.n === 1).status, 'open');
  assert.deepEqual(
    made.toConfirm.map((n) => state.questions.find((item) => item.n === n).text),
    ['Do we agree: The page is blue.', 'Do we agree: Use the team wording.'],
  );
});
