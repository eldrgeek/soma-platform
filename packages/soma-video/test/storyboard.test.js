// The storyboard model (src/storyboard.js): what a board is, the changes people and the team make,
// which cuts need rendering again, who may do what, and the brief the Mac's team works from.
import assert from 'node:assert/strict';
import test from 'node:test';

import { applyOps, BoardError, cleanBoard, clockOf, cutState, jobBrief, nextSceneId, parseClock, parseRanges, rangesText, roleOf } from '../src/storyboard.js';

const T0 = '2026-10-23T10:00:00.000Z';
const T1 = '2026-10-23T11:00:00.000Z';
const T2 = '2026-10-23T12:00:00.000Z';

function board() {
  return cleanBoard({
    id: 'witness', title: 'Witness and Stay', project: '~/Projects/witness-and-stay-song', owner: 'mike', artists: ['Eric@Example.com'],
    song: { file: 'song.mp3', duration: 258.01 },
    scenes: [
      { id: 'e01', section: 'Intro', lyric: 'Izzy, I had that dream again.', start: 0, end: 18.12, refs: ['o47', 'o50'], prompt: 'Older Eric wakes', pictures: { '9x16': 'e01-9x16.jpg', '16x9': 'e01-16x9.jpg' }, source: { '9x16': 'eric-album/gen/9x16/e01.jpg' } },
      { id: 'e02', section: 'Intro', lyric: 'So this is how it ends?', start: 18.12, end: 24, pictures: { '9x16': 'e02-9x16.jpg' } },
      { id: 'e03', section: 'Verse 1', lyric: 'A line', start: 24, end: 30 },
    ],
    cuts: [
      { id: 'full', name: 'Full song', aspect: '16x9', all: true, renderedAt: T1 },
      { id: 'short', name: '74 meets 31', aspect: '9x16', shots: [{ scene: 'e02', seconds: 5.6 }, 'e01'], audio: [[100.24, 129.94]], renderedAt: T1, spec: { endcard: 3.5 } },
    ],
  }, { at: T0 });
}

test('a board is cleaned: emails in lower case, times rounded, shots as objects', () => {
  const b = board();
  assert.deepEqual(b.artists, ['eric@example.com']);
  assert.deepEqual(b.cuts[1].shots, [{ scene: 'e02', seconds: 5.6 }, { scene: 'e01' }]);
  assert.equal(b.scenes[2].status, 'keep');
  assert.throws(() => cleanBoard({ id: 'x', title: 'X', scenes: [{ id: 'a' }, { id: 'a' }] }), /Two scenes/);
  assert.throws(() => cleanBoard({ id: 'x', title: 'X', cuts: [{ id: 'c', name: 'C', aspect: '9x16', shots: ['nope'] }] }), /not on the board/);
  assert.throws(() => cleanBoard({ id: 'x', title: 'X', artists: ['not-an-email'] }), /Not an email/);
  assert.throws(() => cleanBoard({ id: '../x', title: 'X' }), BoardError);
});

test('times read and write as m:ss.s', () => {
  assert.equal(parseClock('1:02.5'), 62.5);
  assert.equal(parseClock('18.1'), 18.1);
  assert.ok(Number.isNaN(parseClock('soon')));
  assert.equal(clockOf(62.5), '1:02.5');
  assert.equal(clockOf(null), '');
  assert.deepEqual(parseRanges('1:40-2:10, 3:05 to 3:20'), [[100, 130], [185, 200]]);
  assert.throws(() => parseRanges('2:10-1:40'), /not a stretch/);
  assert.equal(rangesText([[100.24, 129.94]]), '1:40.2-2:09.9');
});

test('who someone is to a board', () => {
  const b = board();
  assert.equal(roleOf(b, { id: 'mike' }), 'owner');
  assert.equal(roleOf(b, { id: 'host' }, { hostId: 'host' }), 'owner');
  assert.equal(roleOf(b, { id: 'eric', email: 'ERIC@example.com' }), 'artist');
  assert.equal(roleOf(b, { id: 'someone', email: 'someone@example.com' }), null);
  assert.equal(roleOf(b, null), null);
});

test('setting a field: status and notes do not stale a cut; lyric and times do', () => {
  let b = applyOps(board(), [{ op: 'set', scene: 'e02', field: 'status', value: 'redo' }, { op: 'set', scene: 'e02', field: 'note', value: 'Warmer light' }], { role: 'artist', by: { name: 'Eric' }, at: T2 });
  assert.equal(b.scenes[1].status, 'redo');
  assert.equal(b.scenes[1].noteBy, 'Eric');
  assert.equal(b.version, 2);
  assert.equal(cutState(b, b.cuts[1]).state, 'current');
  b = applyOps(b, [{ op: 'set', scene: 'e02', field: 'end', value: '0:25' }], { role: 'artist', at: T2 });
  assert.equal(b.scenes[1].end, 25);
  assert.deepEqual(cutState(b, b.cuts[1]), { state: 'stale', changed: ['e02'], listChanged: false });
  assert.throws(() => applyOps(b, [{ op: 'set', scene: 'e02', field: 'pictures', value: {} }], { role: 'owner' }), /no field pictures/);
  assert.throws(() => applyOps(b, [{ op: 'set', scene: 'e02', field: 'status', value: 'maybe' }], { role: 'owner' }), /keep, redo or new/);
  assert.throws(() => applyOps(b, [{ op: 'set', scene: 'e99', field: 'note', value: '' }], { role: 'owner' }), /No scene e99/);
});

test('moving a scene reorders the board and stales the cut of every scene, not the short', () => {
  const b = applyOps(board(), [{ op: 'move', scene: 'e03', to: 0 }], { role: 'artist', at: T2 });
  assert.deepEqual(b.scenes.map((s) => s.id), ['e03', 'e01', 'e02']);
  assert.equal(cutState(b, b.cuts[0]).state, 'stale');
  assert.equal(cutState(b, b.cuts[1]).state, 'current');
  assert.throws(() => applyOps(b, [{ op: 'move', scene: 'e03', to: 3 }], { role: 'owner' }), /place on the board/);
});

test('adding a scene after another gives it the next id, status new, and its neighbours\' times', () => {
  const b = applyOps(board(), [{ op: 'add-after', after: 'e01', scene: { lyric: 'New line', prompt: 'A hallway' } }], { role: 'artist', at: T2 });
  assert.deepEqual(b.added, ['e01a']);
  const scene = b.scenes[1];
  assert.equal(scene.id, 'e01a');
  assert.equal(scene.status, 'new');
  assert.equal(scene.start, 18.12);
  assert.equal(scene.end, 18.12);
  assert.deepEqual(scene.refs, ['o47', 'o50']);
  assert.equal(nextSceneId(b, 'e01'), 'e01b');
  const first = applyOps(board(), [{ op: 'add-after', after: null, scene: { prompt: 'Cold open' } }], { role: 'owner', at: T2 });
  assert.equal(first.scenes[0].id, 'sa');
  assert.throws(() => applyOps(board(), [{ op: 'add-after', after: 'e01', scene: { pictures: {} } }], { role: 'owner' }), /no field pictures/);
});

test('removing a scene takes it out of every cut', () => {
  const b = applyOps(board(), [{ op: 'remove', scene: 'e02' }], { role: 'owner', at: T2 });
  assert.deepEqual(b.cuts[1].shots, [{ scene: 'e01' }]);
  assert.equal(cutState(b, b.cuts[1]).state, 'stale');
});

test('new pictures come only from the team, keep the old ones in history, and can be put back', () => {
  assert.throws(() => applyOps(board(), [{ op: 'pictures', scene: 'e01', pictures: { '9x16': 'x.jpg' } }], { role: 'artist' }), /Only the team/);
  let b = applyOps(board(), [{ op: 'set', scene: 'e01', field: 'status', value: 'redo' }, { op: 'set', scene: 'e01', field: 'note', value: 'darker' }], { role: 'artist', at: T2 });
  b = applyOps(b, [{ op: 'pictures', scene: 'e01', pictures: { '9x16': 'e01-9x16-v2.jpg' }, source: { '9x16': 'eric-album/gen/9x16/e01-v2.jpg' }, prompt: 'Older Eric wakes, darker' }], { role: 'team', by: { name: 'the team' }, at: T2 });
  const scene = b.scenes[0];
  assert.deepEqual(scene.pictures, { '9x16': 'e01-9x16-v2.jpg', '16x9': 'e01-16x9.jpg' });
  assert.equal(scene.status, 'keep');
  assert.equal(scene.note, '');
  assert.equal(scene.history.length, 1);
  assert.equal(scene.history[0].pictures['9x16'], 'e01-9x16.jpg');
  assert.equal(cutState(b, b.cuts[0]).state, 'stale');
  b = applyOps(b, [{ op: 'use-picture', scene: 'e01', history: 0 }], { role: 'artist', at: T2 });
  assert.equal(b.scenes[0].pictures['9x16'], 'e01-9x16.jpg');
  assert.equal(b.scenes[0].prompt, 'Older Eric wakes');
  assert.equal(b.scenes[0].history[0].pictures['9x16'], 'e01-9x16-v2.jpg');
});

test('cuts: add, replace (keeping the last render), report a render, remove', () => {
  let b = applyOps(board(), [{ op: 'cut', cut: { id: 'short', name: '74 meets 31', aspect: '9x16', shots: ['e01', 'e02'], audio: [[100, 130]] } }], { role: 'artist', at: T2 });
  assert.equal(b.cuts[1].renderedAt, T1);
  assert.equal(cutState(b, b.cuts[1]).listChanged, true);
  assert.throws(() => applyOps(b, [{ op: 'rendered', cut: 'short', file: 'short.mp4' }], { role: 'owner' }), /Only the team/);
  b = applyOps(b, [{ op: 'rendered', cut: 'short', file: 'short.mp4', startedAt: T2 }], { role: 'team', at: '2026-10-23T13:00:00.000Z' });
  assert.equal(b.cuts[1].render.file, 'short.mp4');
  assert.equal(cutState(b, b.cuts[1]).state, 'current');
  b = applyOps(b, [{ op: 'cut', cut: { id: 'new', name: 'Teaser', aspect: '9x16', shots: ['e03'] } }, { op: 'remove-cut', cut: 'short' }], { role: 'owner', at: T2 });
  assert.deepEqual(b.cuts.map((c) => [c.id, cutState(b, c).state]), [['full', 'current'], ['new', 'never']]);
});

test('only the owner chooses the artists; a bad change refuses the whole list', () => {
  assert.throws(() => applyOps(board(), [{ op: 'artists', artists: ['bea@example.com'] }], { role: 'artist' }), /owner chooses/);
  const b = applyOps(board(), [{ op: 'artists', artists: ['eric@example.com', 'Bea@Example.com'] }], { role: 'owner' });
  assert.deepEqual(b.artists, ['eric@example.com', 'bea@example.com']);
  const before = board();
  assert.throws(() => applyOps(before, [{ op: 'title', value: 'New' }, { op: 'nonsense' }], { role: 'owner' }), /Unknown change/);
  assert.equal(before.title, 'Witness and Stay');
  assert.throws(() => applyOps(before, [{ op: 'title', value: 'New' }], { role: 'stranger' }), /Only the board/);
  assert.throws(() => applyOps(before, [], { role: 'owner' }), /1 to 50/);
});

test('the brief for a redo names the scene, its prompt, refs and note, and the result file', () => {
  const b = applyOps(board(), [{ op: 'set', scene: 'e01', field: 'note', value: 'Make the room colder' }], { role: 'artist', by: { name: 'Eric' } });
  const brief = jobBrief(b, { id: 'job-1', step: 'redo', scene: 'e01' });
  assert.match(brief, /new pictures for scene e01/);
  assert.match(brief, /Reference photos: o47, o50/);
  assert.match(brief, /Prompt: Older Eric wakes/);
  assert.match(brief, /Redo note from Eric: Make the room colder/);
  assert.match(brief, /storyboard-out\/job-1\.json/);
  assert.match(jobBrief(b, { id: 'j', step: 'redo', scene: 'gone' }), /no longer on the board/);
  const render = jobBrief(b, { id: 'job-2', step: 'render', cut: 'short' });
  assert.match(render, /render the cut "74 meets 31" \(short\), 9:16/);
  assert.match(render, /e02 \(5\.6s\), e01/);
  assert.match(render, /Song: 1:40\.2-2:09\.9/);
  assert.match(render, /"endcard":3\.5/);
  assert.match(render, /Do not upload/);
});
