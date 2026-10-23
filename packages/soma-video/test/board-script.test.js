// The v4 editor's script (src/board-script.js): a board written as Fountain, and what a person types read
// back as the same ops the scene cards send.
import assert from 'node:assert/strict';
import test from 'node:test';

import { boardToScript, opBatches, readScript, scriptToOps, timeText } from '../src/board-script.js';
import { applyOps, cleanBoard, cutState } from '../src/storyboard.js';

const T0 = '2026-10-23T10:00:00.000Z';
const T1 = '2026-10-23T11:00:00.000Z';
const T2 = '2026-10-23T12:00:00.000Z';

function board() {
  return cleanBoard({
    id: 'song', title: 'Example Song', owner: 'mike', artists: ['artist@example.com'],
    scenes: [
      { id: 'e01', section: 'Intro', lyric: 'Morning comes in sideways', start: 0, end: 18.12, motion: 'in', prompt: 'A kitchen at dawn' },
      { id: 'e02', section: 'Intro', lyric: 'Every cup / every word', start: 18.12, end: 24, transition: 'dissolve', status: 'redo', note: 'warmer light' },
      { id: 'e03', section: 'Verse 1', lyric: 'A line', start: 24, end: 30, extra: 'CARD quote\n# Stay' },
      { id: 'e04', lyric: 'Untimed', note: 'hold it longer' },
    ],
    cuts: [{ id: 'full', name: 'Full song', aspect: '16x9', all: true, renderedAt: T1 }],
  }, { at: T0 });
}
const edit = (text, from, to) => {
  assert.ok(text.includes(from), `script has ${from}`);
  return text.replace(from, to);
};

test('a board writes as a script that reads back with no changes', () => {
  const b = board();
  const script = boardToScript(b);
  assert.match(script, /^Title: Example Song$/m);
  assert.match(script, /^\.Intro 0:00-0:18\.12$/m);
  assert.match(script, /^SHOT e01 motion: in$/m);
  assert.match(script, /^DISSOLVE TO:\n\n\.Intro 0:18\.12-0:24$/m);
  assert.match(script, /^~Every cup\n~every word$/m);
  assert.match(script, /^\[\[redo: warmer light\]\]$/m);
  assert.match(script, /^CARD quote\n# Stay$/m);
  assert.match(script, /^\.SCENE\nSHOT e04\n~Untimed\n\[\[hold it longer\]\]$/m);
  assert.deepEqual(scriptToOps(b, script).ops, []);
});

test('times write so they read back exactly', () => {
  for (const t of [0, 18, 18.1, 18.12, 65.5, 125.07, 600]) assert.equal(readScript(`.X ${timeText(t)}-${timeText(t + 1)}`).scenes[0].start, t);
});

test('typing a time, a lyric, a motion and a transition becomes set ops', () => {
  const b = board();
  let s = boardToScript(b);
  s = edit(s, '.Verse 1 0:24-0:30', '.Verse 1 0:24-0:32');
  s = edit(s, '~A line', '~A new line');
  s = edit(s, 'SHOT e03', 'SHOT e03 motion: panr');
  s = edit(s, 'DISSOLVE TO:', 'WIPE TO:');
  const { ops, board: after } = scriptToOps(b, s, { at: T2 });
  assert.deepEqual(ops, [
    { op: 'set', scene: 'e02', field: 'transition', value: 'wipe' },
    { op: 'set', scene: 'e03', field: 'lyric', value: 'A new line' },
    { op: 'set', scene: 'e03', field: 'end', value: 32 },
    { op: 'set', scene: 'e03', field: 'motion', value: 'panr' },
  ]);
  // what the editor shows changes the render: the cut says which scenes
  assert.deepEqual(cutState(after, after.cuts[0]).changed, ['e02', 'e03']);
});

test('a redo note marks redo; deleting it puts the scene back to keep', () => {
  const b = board();
  let s = boardToScript(b);
  s = edit(s, '[[redo: warmer light]]\n', '');
  s = edit(s, '~A line', '~A line\n[[redo: closer, less blue]]');
  const { ops, board: after } = scriptToOps(b, s, { by: { name: 'Mike' } });
  assert.deepEqual(after.scenes.map((x) => [x.id, x.status, x.note]), [['e01', 'keep', ''], ['e02', 'keep', ''], ['e03', 'redo', 'closer, less blue'], ['e04', 'keep', 'hold it longer']]);
  assert.equal(after.scenes[2].noteBy, 'Mike');
  assert.ok(ops.some((o) => o.field === 'status' && o.value === 'keep'));
});

test('a new heading adds a scene after the one above it; a deleted heading removes the scene', () => {
  const b = board();
  let s = boardToScript(b);
  s = edit(s, '.Verse 1 0:24-0:30\nSHOT e03\n~A line\nCARD quote\n# Stay\n', '.Verse 1 0:24-0:27\nSHOT e03\n~A line\nCARD quote\n# Stay\n\nPUSH TO:\n\n.Verse 1 0:27-0:30\nSHOT e03\n~A pasted copy\n');
  s = edit(s, '.Intro 0:00-0:18.12\nSHOT e01 motion: in\n~Morning comes in sideways\n\n', '');
  const { ops, board: after } = scriptToOps(b, s);
  assert.deepEqual(ops[0], { op: 'remove', scene: 'e01' });
  assert.deepEqual(after.scenes.map((x) => x.id), ['e02', 'e03', 'e03a', 'e04']);
  const added = after.scenes[2];
  assert.deepEqual([added.status, added.lyric, added.start, added.end, added.transition], ['new', 'A pasted copy', 27, 30, 'push']);
  // the first scene has nothing to come in from
  assert.equal(after.scenes[0].transition, '');
});

test('moving a scene block reorders the board', () => {
  const b = board();
  const s = boardToScript(b);
  const blocks = s.split('\n\n');
  const i = blocks.findIndex((x) => x.startsWith('.SCENE'));
  const moved = [blocks[0], blocks[i], ...blocks.slice(1, i), ...blocks.slice(i + 1)].join('\n\n');
  const { ops, board: after } = scriptToOps(b, moved);
  assert.deepEqual(after.scenes.map((x) => x.id), ['e04', 'e01', 'e02', 'e03']);
  assert.ok(ops.some((o) => o.op === 'move' && o.scene === 'e04' && o.to === 0));
});

test('a script with a problem sends nothing, so a half-typed heading never deletes a scene', () => {
  const b = board();
  const s = edit(boardToScript(b), '.Verse 1 0:24-0:30', '.Verse 1 0:24-');
  const { ops, problems } = scriptToOps(b, s);
  assert.deepEqual(ops, []);
  assert.match(problems[0].message, /start-end/);
  assert.match(scriptToOps(b, edit(boardToScript(b), 'motion: in', 'motion: zoom')).problems[0].message, /in, out, panl/);
  assert.match(scriptToOps(b, edit(boardToScript(b), '.Verse 1 0:24-0:30', '.Verse 1 0:30-0:24')).problems[0].message, /ends before/);
  assert.match(scriptToOps(b, `stray words\n${boardToScript(b)}`).problems[0].message, /not part of any scene/);
});

test('gaps and overlaps are named against their line', () => {
  const { problems } = readScript('.A 0:00-0:10\n\n.B 0:12-0:20\n\n.C 0:19-0:30');
  assert.deepEqual(problems.map((p) => p.line), [3, 5]);
  assert.match(problems[0].message, /Nothing is on screen from 0:10 to 0:12/);
  assert.match(problems[1].message, /before the one above ends/);
});

test('each line knows its scene; a transition belongs to the scene it leads into', () => {
  const { lineScene } = readScript('Title: X\n\n.A 0:00-0:10\n~one\n\nFADE TO BLACK.\n\n.B 0:10-0:20');
  assert.deepEqual(lineScene, [-1, -1, 0, 0, 0, 1, 1, 1]);
});

test('an artist may edit by script; the owner-only ops are not reachable from it', () => {
  const b = board();
  const s = edit(boardToScript(b), '~A line', '~An artist line');
  const { ops } = scriptToOps(b, s, { role: 'artist', by: { email: 'artist@example.com' } });
  assert.equal(ops.length, 1);
  assert.equal(applyOps(b, ops, { role: 'artist' }).scenes[2].lyric, 'An artist line');
});

test('ops go out in batches the routes accept', () => {
  assert.deepEqual(opBatches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(opBatches([]), []);
});

test('a render brief passes on the motion and transitions set in the editor', async () => {
  const { jobBrief } = await import('../src/storyboard.js');
  const brief = jobBrief(board(), { id: 'j1', step: 'render', cut: 'full' });
  assert.match(brief, /e01: motion in\n {2}e02: comes in by dissolve/);
  assert.doesNotMatch(brief, /e03:/);
  assert.match(jobBrief(board(), { id: 'j2', step: 'redo', scene: 'e01' }), /On screen: motion in/);
  assert.throws(() => applyOps(board(), [{ op: 'set', scene: 'e01', field: 'motion', value: 'spin' }], { role: 'owner' }), /A motion is one of/);
  assert.throws(() => applyOps(board(), [{ op: 'set', scene: 'e01', field: 'transition', value: 'iris' }], { role: 'owner' }), /A transition is one of/);
});
