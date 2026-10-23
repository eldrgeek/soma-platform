// An artist's notes (src/notes.js): which card each line is about, what is dropped, the ops that put the
// notes on the board, and the queue one batch redo takes.
import assert from 'node:assert/strict';
import test from 'node:test';

import { isKeep, jobScenes, notesOps, notesToRedo, parseNotes, redoQueue } from '../src/notes.js';
import { applyOps, cleanBoard, jobBrief } from '../src/storyboard.js';

function board() {
  return cleanBoard({
    id: 'witness', title: 'Witness and Stay', owner: 'mike', artists: ['eric@example.com'],
    scenes: [
      { id: 'e01', lyric: 'Izzy, I had that dream again.', pictures: { '9x16': 'a.jpg' }, prompt: 'Older Eric wakes', refs: ['o47'] },
      { id: 'e02', lyric: 'So this is how it ends?', pictures: { '9x16': 'b.jpg' }, note: 'Warmer light' },
      { id: 'e03', lyric: 'Under the bridge at nineteen', pictures: { '9x16': 'c.jpg' } },
      { id: 'e05', lyric: 'Opa in the doorway' },
      { id: 'e12', lyric: 'Nah. This is how it begins.', pictures: { '16x9': 'd.jpg' } },
    ],
  }, { at: '2026-10-23T10:00:00.000Z' });
}

test('a note names its scene by id, by a short id, by number or by its place on the board', () => {
  const { notes, general } = parseNotes(board(), [
    'e01: he looks too young here',
    'E3 - lose the hat',
    'Scene 12. Brighter, it is the ending',
    '#5 needs his beret',
  ].join('\n'));
  assert.deepEqual(notes.map((n) => [n.scene, n.note]), [
    ['e01', 'he looks too young here'],
    ['e03', 'lose the hat'],
    ['e05', 'needs his beret'],
    ['e12', 'Brighter, it is the ending'],
  ]);
  assert.deepEqual(general, []);
  // A number that is no id's number is the card in that place (the second card is e02).
  assert.equal(parseNotes(board(), 'card 2: too dark').notes[0].scene, 'e02');
});

test('a quoted lyric finds its card, and one line can name several', () => {
  const { notes } = parseNotes(board(), 'The "so this is how it ends" one is too dark\ne03 and e12: keep the colours of e01');
  assert.deepEqual(notes.map((n) => n.scene), ['e01', 'e02', 'e03', 'e12']);
  assert.equal(notes.find((n) => n.scene === 'e02').note, 'The "so this is how it ends" one is too dark');
  assert.equal(notes.find((n) => n.scene === 'e03').note, 'keep the colours of e01');
});

test('a line straight after a note goes on with it; after a blank line it is general', () => {
  const { notes, general } = parseNotes(board(), 'e02: warmer\nand slower\n\nLove the whole thing!\ne02: no hat');
  assert.deepEqual(notes, [{ scene: 'e02', note: 'warmer\nand slower\nno hat', line: 'e02: warmer\nand slower\ne02: no hat', keep: false }]);
  assert.deepEqual(general, ['Love the whole thing!']);
});

test('quoted replies, signatures and times are not notes', () => {
  const text = 'e01: older\n1:02 feels late\n> e02: from the earlier mail\n\n-- \nEric\ne03: in the signature';
  const { notes, general } = parseNotes(board(), text);
  assert.deepEqual(notes.map((n) => n.scene), ['e01']);
  assert.equal(notes[0].note, 'older\n1:02 feels late');
  assert.deepEqual(general, []);
  assert.deepEqual(parseNotes(board(), 'Great!\n\nOn Fri, Oct 23, 2026 at 3:00 PM Mike Wolf <m@x.com> wrote:\ne01: quoted').notes, []);
  assert.deepEqual(parseNotes(board(), 'e99: no such scene\nscene 40: nor this').general, ['e99: no such scene', 'scene 40: nor this']);
});

test('a note that only says keep marks the card keep and asks for nothing; "In 22" at a line\'s start is scene 22', () => {
  const b = board();
  const found = parseNotes(b, 'e02 and e03: perfect, keep!\nIn 12 I look like my brother, try the beard photo\ne01: love it but older');
  assert.deepEqual(found.notes.map((n) => [n.scene, n.keep]), [['e01', false], ['e02', true], ['e03', true], ['e12', false]]);
  assert.deepEqual(notesToRedo(found), ['e01', 'e12']);
  assert.deepEqual(notesOps(b, found).filter((op) => op.scene === 'e02'), [{ op: 'set', scene: 'e02', field: 'status', value: 'keep' }]);
  assert.equal(isKeep('Keep this one'), true);
  assert.equal(isKeep("Keep the beret but he shouldn't smile"), false);
  assert.equal(parseNotes(b, 'In 2026 we open').notes.length, 0);
});

test('notesOps puts each note under the card\'s own note and marks it redo, or new without pictures', () => {
  const b = board();
  const ops = notesOps(b, parseNotes(b, 'e02: no hat\ne05: beret'));
  assert.deepEqual(ops, [
    { op: 'set', scene: 'e02', field: 'note', value: 'Warmer light\nno hat' },
    { op: 'set', scene: 'e02', field: 'status', value: 'redo' },
    { op: 'set', scene: 'e05', field: 'note', value: 'beret' },
    { op: 'set', scene: 'e05', field: 'status', value: 'new' },
  ]);
  assert.equal(notesOps(b, parseNotes(b, 'e02: no hat'), { replace: true })[0].value, 'no hat');
  // The same note twice is not written twice.
  const once = applyOps(b, ops, { by: { name: 'Eric' }, role: 'artist' });
  assert.equal(notesOps(once, parseNotes(once, 'e02: no hat'))[0].value, 'Warmer light\nno hat');
  assert.equal(once.scenes[1].noteBy, 'Eric');
});

test('redoQueue is the scenes marked redo or new that no open request covers', () => {
  const b = applyOps(board(), notesOps(board(), parseNotes(board(), 'e01: a\ne03: b\ne05: c')), { role: 'owner' });
  assert.deepEqual(redoQueue(b), ['e01', 'e03', 'e05']);
  const jobs = [
    { status: 'held', step: 'batch', scenes: ['e01'] },
    { status: 'queued', step: 'redo', scene: 'e03' },
    { status: 'done', step: 'add', scene: 'e05' },
  ];
  assert.deepEqual(redoQueue(b, jobs), ['e05']);
  assert.deepEqual(jobScenes({ scene: 'e01' }), ['e01']);
  assert.deepEqual(jobScenes({ scenes: ['e01', 'e02'] }), ['e01', 'e02']);
  assert.deepEqual(jobScenes({ cut: 'full' }), []);
});

test('the brief for a batch names every scene, its note or a reroll, and the result file written as it goes', () => {
  const b = board();
  const brief = jobBrief(b, { id: 'job-1', step: 'batch', scenes: ['e02', 'e03', 'e05', 'gone'] });
  assert.match(brief, /new pictures for 3 scenes in this one run: e02, e03, e05/);
  assert.match(brief, /skip them: gone/);
  assert.match(brief, /Redo note from the artist: Warmer light/);
  assert.match(brief, /New pictures: e03\.[\s\S]*a reroll\. Keep the prompt/);
  assert.match(brief, /Pictures for the new scene: e05/);
  assert.match(brief, /storyboard-out\/job-1\.json/);
  assert.match(brief, /one generator session/);
  assert.match(jobBrief(b, { id: 'j', step: 'batch', scenes: ['gone'] }), /None of the scenes gone is still on the board/);
});
