// Undo, redo, split and pictures of your own (src/storyboard.js changeOps, restore, split, own-picture):
// what the editor sends to take a change back or make it again, and what the board keeps so it can.
import assert from 'node:assert/strict';
import test from 'node:test';

import { applyOps, changeOps, cleanBoard, cutState, jobBrief, nextSceneId } from '../src/storyboard.js';

const T0 = '2026-10-23T10:00:00.000Z';
const T1 = '2026-10-23T11:00:00.000Z';
const T2 = '2026-10-23T12:00:00.000Z';
const owner = { role: 'owner', by: { name: 'Mike' } };

function board() {
  return cleanBoard({
    id: 'witness', title: 'Witness and Stay', owner: 'mike', artists: ['eric@example.com'],
    scenes: [
      { id: 'e01', section: 'Intro', lyric: 'Izzy', start: 0, end: 10, prompt: 'Older Eric wakes', pictures: { '9x16': 'e01-9x16.jpg', '16x9': 'e01-16x9.jpg' }, source: { '16x9': 'gen/e01.jpg' }, motion: 'in' },
      { id: 'e02', section: 'Intro', lyric: 'So this is how it ends?', start: 10, end: 20, pictures: { '16x9': 'e02-16x9.jpg' } },
      { id: 'e03', section: 'Verse 1', lyric: 'A line', start: 20, end: 30 },
    ],
    cuts: [
      { id: 'full', name: 'Full song', aspect: '16x9', all: true, renderedAt: T1 },
      { id: 'short', name: 'Short', aspect: '9x16', shots: [{ scene: 'e02', seconds: 5.6 }, 'e01'], renderedAt: T1 },
    ],
  }, { at: T0 });
}
const run = (b, ops, at = T2, as = owner) => applyOps(b, ops, { ...as, at });
/** The editor's undo and redo: the change's difference, replayed on the board as it is now. */
const undo = (before, after, now = after) => run(now, changeOps(after, before, now));
const redo = (before, after, now) => run(now, changeOps(before, after, now));
const view = (b) => b.scenes.map((s) => `${s.id}:${s.start}-${s.end}:${s.lyric}:${s.status}:${JSON.stringify(s.pictures)}`);
const cutView = (b) => b.cuts.map((c) => `${c.id}:${c.shots.map((s) => s.scene + (s.seconds ? `@${s.seconds}` : '')).join(',')}`);

test('a removed scene is kept, with its pictures and its places in the cuts, and comes back with restore', () => {
  const before = board();
  const after = run(before, [{ op: 'remove', scene: 'e02' }]);
  assert.deepEqual(after.scenes.map((s) => s.id), ['e01', 'e03']);
  assert.equal(after.removed[0].scene.pictures['16x9'], 'e02-16x9.jpg');
  assert.deepEqual(after.removed[0].shots, [{ cut: 'short', index: 0, seconds: 5.6 }]);
  const back = run(after, [{ op: 'restore', scene: 'e02', after: 'e01' }]);
  assert.deepEqual(view(back), view(before));
  assert.deepEqual(cutView(back), cutView(before));
  assert.deepEqual(back.removed, []);
  assert.throws(() => run(back, [{ op: 'restore', scene: 'e02', after: null }]), /not a removed scene/);
  assert.throws(() => run(after, [{ op: 'restore', scene: 'e02', after: 'nope' }]), /No scene nope/);
  // A board keeps the last 30 removed scenes, and a cleaned board keeps them too.
  assert.equal(cleanBoard(after, { at: T2 }).removed[0].scene.id, 'e02');
});

test('a new scene never takes the id of a removed one, so an undo cannot mean the wrong scene', () => {
  const after = run(board(), [{ op: 'remove', scene: 'e02' }]);
  assert.equal(nextSceneId(after, 'e01'), 'e01a');
  const gone = run(run(board(), [{ op: 'add-after', after: 'e01', scene: {} }]), [{ op: 'remove', scene: 'e01a' }]);
  assert.equal(nextSceneId(gone, 'e01'), 'e01b');
});

test('undo and redo a typed change, a retime and a status', () => {
  const before = board();
  const after = run(before, [
    { op: 'set', scene: 'e02', field: 'lyric', value: 'So this is how it ends' },
    { op: 'set', scene: 'e01', field: 'end', value: 12 },
    { op: 'set', scene: 'e02', field: 'start', value: 12 },
    { op: 'set', scene: 'e03', field: 'note', value: 'warmer' },
    { op: 'set', scene: 'e03', field: 'status', value: 'redo' },
  ]);
  const undone = undo(before, after);
  assert.deepEqual(view(undone), view(before));
  assert.equal(undone.scenes[2].note, '');
  assert.deepEqual(view(redo(before, after, undone)), view(after));
});

test('undo keeps what someone else changed meanwhile', () => {
  const before = board();
  const after = run(before, [{ op: 'set', scene: 'e01', field: 'lyric', value: 'Izzy!' }]);
  const eric = run(after, [{ op: 'set', scene: 'e03', field: 'lyric', value: 'Eric typed this' }], T2, { role: 'artist', by: { name: 'Eric' } });
  const undone = undo(before, after, eric);
  assert.equal(undone.scenes[0].lyric, 'Izzy');
  assert.equal(undone.scenes[2].lyric, 'Eric typed this');
  // A field someone else has since set to the undone value is not sent again.
  assert.deepEqual(changeOps(after, before, before), []);
});

test('undo a removed scene puts it back with its picture and its shots; redo removes it again', () => {
  const before = board();
  const after = run(before, [{ op: 'remove', scene: 'e01' }]);
  const undone = undo(before, after);
  assert.deepEqual(view(undone), view(before));
  assert.deepEqual(cutView(undone), cutView(before));
  const redone = redo(before, after, undone);
  assert.deepEqual(view(redone), view(after));
});

test('undo an added scene removes it; redo brings the same scene back', () => {
  const before = board();
  const after = run(before, [{ op: 'add-after', after: 'e02', scene: { lyric: 'New', start: 20, end: 25 } }]);
  assert.deepEqual(after.added, ['e02a']);
  const undone = undo(before, after);
  assert.deepEqual(undone.scenes.map((s) => s.id), ['e01', 'e02', 'e03']);
  const redone = redo(before, after, undone);
  assert.deepEqual(redone.scenes.map((s) => `${s.id}:${s.lyric}`), ['e01:Izzy', 'e02:So this is how it ends?', 'e02a:New', 'e03:A line']);
});

test('undo a move puts the scenes back in order, and keeps a scene added meanwhile after the one it followed', () => {
  const before = board();
  const after = run(before, [{ op: 'move', scene: 'e03', to: 0 }]);
  assert.deepEqual(undo(before, after).scenes.map((s) => s.id), ['e01', 'e02', 'e03']);
  const added = run(after, [{ op: 'add-after', after: 'e03', scene: {} }]);
  assert.deepEqual(undo(before, after, added).scenes.map((s) => s.id), ['e01', 'e02', 'e03', 'e03a']);
  assert.deepEqual(redo(before, after, undo(before, after)).scenes.map((s) => s.id), ['e03', 'e01', 'e02']);
});

test('split cuts a timed scene in two at a time inside it; the second half keeps the picture', () => {
  const before = board();
  const after = run(before, [{ op: 'split', scene: 'e01', at: 4 }]);
  assert.deepEqual(after.added, ['e01a']);
  const [a, b] = after.scenes;
  assert.deepEqual([a.id, a.start, a.end, b.id, b.start, b.end], ['e01', 0, 4, 'e01a', 4, 10]);
  assert.deepEqual(b.pictures, a.pictures);
  assert.deepEqual([b.prompt, b.motion, b.transition, b.lyric, b.status], ['Older Eric wakes', 'in', 'cut', '', 'keep']);
  assert.deepEqual(cutView(after), ['full:', 'short:e02@5.6,e01,e01a']);
  assert.equal(cutState(after, after.cuts[1]).state, 'stale');
  assert.throws(() => run(before, [{ op: 'split', scene: 'e01', at: 10 }]), /inside it/);
  assert.throws(() => run(before, [{ op: 'split', scene: 'e01', at: 0 }]), /inside it/);
  const untimed = cleanBoard({ id: 'u', title: 'U', scenes: [{ id: 'a' }] });
  assert.throws(() => run(untimed, [{ op: 'split', scene: 'a', at: 3 }]), /inside it/);
  // Undo takes the split back; redo makes it again with the same id.
  const undone = undo(before, after);
  assert.deepEqual(view(undone), view(before));
  assert.deepEqual(cutView(undone), cutView(before));
  assert.deepEqual(view(redo(before, after, undone)), view(after));
});

test('a picture of your own: only an uploaded file, never by the team; the old one goes to history and undo puts it back', () => {
  const before = board();
  const after = run(before, [{ op: 'own-picture', scene: 'e02', aspect: '16x9', file: 'up-e02-16x9-abc.jpg' }], T2, { role: 'artist', by: { name: 'Eric' } });
  const scene = after.scenes[1];
  assert.equal(scene.pictures['16x9'], 'up-e02-16x9-abc.jpg');
  assert.equal(scene.history.at(-1).pictures['16x9'], 'e02-16x9.jpg');
  assert.equal(scene.status, 'keep');
  assert.throws(() => run(before, [{ op: 'own-picture', scene: 'e02', aspect: '16x9', file: 'e01-16x9.jpg' }]), /starts with up-/);
  assert.throws(() => run(before, [{ op: 'own-picture', scene: 'e02', aspect: '4x3', file: 'up-x.jpg' }]), /9x16 or 16x9/);
  assert.throws(() => run(before, [{ op: 'own-picture', scene: 'e02', aspect: '16x9', file: 'up-x.jpg' }], T2, { role: 'team' }), /pictures change/);
  const undone = undo(before, after);
  assert.equal(undone.scenes[1].pictures['16x9'], 'e02-16x9.jpg');
  assert.equal(redo(before, after, undone).scenes[1].pictures['16x9'], 'up-e02-16x9-abc.jpg');
});

test('the brief tells the Mac how to fetch an uploaded picture', () => {
  const b = run(board(), [{ op: 'own-picture', scene: 'e01', aspect: '9x16', file: 'up-e01-9x16-abc.jpg' }]);
  const render = jobBrief(b, { id: 'j1', step: 'render', cut: 'short' }, { site: 'https://soma-forge.netlify.app', app: 'videomaker' });
  assert.match(render, /e01 9:16: curl -sf -H "x-studio-team-key: \$\(cat ~\/\.config\/soma-studio\/team\.key\)" https:\/\/soma-forge\.netlify\.app\/api\/app\/videomaker\/video-team\/boards\/witness\/files\/up-e01-9x16-abc\.jpg -o storyboard-files\/up-e01-9x16-abc\.jpg/);
  // The full cut is 16:9, where e01's picture is still the team's own.
  assert.doesNotMatch(jobBrief(b, { id: 'j2', step: 'render', cut: 'full' }), /Pictures a person uploaded/);
  assert.match(jobBrief(b, { id: 'j3', step: 'redo', scene: 'e01' }), /were uploaded; use them as a reference/);
  assert.match(jobBrief(b, { id: 'j4', step: 'batch', scenes: ['e01', 'e02'] }), /up-e01-9x16-abc\.jpg/);
});
