// The v4 editor's clock (src/video-editor.js): where each scene sits on the song, what the picture shows at
// a moment (scene, motion, transition, caption), and the song's waveform peaks.
import assert from 'node:assert/strict';
import test from 'node:test';

import { captionAt, frameAt, layoutScenes, MOTION_CYCLE, motionAt, sceneAtTime, songPeaks, TRANSITION_CYCLE, TRANSITION_SECONDS } from '../src/video-editor.js';

const scenes = [
  { id: 'a', start: 0, end: 10, transition: '', motion: 'in', lyric: 'one / two' },
  { id: 'b', start: 10, end: 20, transition: 'dissolve', motion: '', lyric: '' },
  { id: 'c', start: null, end: null, transition: 'cut', motion: 'panr', lyric: 'three' },
  { id: 'd', start: 20, end: 30, transition: 'wipe', motion: '', lyric: '' },
];

test('scenes sit on the song; an untimed scene follows the one before it', () => {
  const placed = layoutScenes(scenes);
  assert.deepEqual(placed.map((p) => [p.scene.id, p.start, p.end, p.timed]), [['a', 0, 10, true], ['b', 10, 20, true], ['c', 20, 25, false], ['d', 20, 30, true]]);
  assert.equal(sceneAtTime(placed, 9.99), 0);
  assert.equal(sceneAtTime(placed, 10), 1);
  assert.equal(sceneAtTime(placed, 99), 3);
  assert.equal(sceneAtTime(placed, -1), 0);
  assert.equal(sceneAtTime([], 3), -1);
});

test('a transition plays over the first moments of the scene it brings in', () => {
  const placed = layoutScenes(scenes);
  const f = frameAt(placed, 10 + TRANSITION_SECONDS / 2);
  assert.deepEqual([f.index, f.from, f.transition], [1, 0, 'dissolve']);
  assert.ok(Math.abs(f.mix - 0.5) < 1e-9);
  const after = frameAt(placed, 10 + TRANSITION_SECONDS + 0.01);
  assert.deepEqual([after.from, after.mix], [-1, 1]);
  // a cut, the renderer's default and the first scene show no transition
  assert.equal(frameAt(placed, 0.1).from, -1);
  assert.equal(frameAt(placed, 20.1).from, -1);
  assert.ok(frameAt(placed, 5).progress === 0.5);
});

test('captions share the scene evenly, line by line', () => {
  const [a, b] = layoutScenes(scenes);
  assert.equal(captionAt(a, 0), 'one');
  assert.equal(captionAt(a, 4.9), 'one');
  assert.equal(captionAt(a, 5), 'two');
  assert.equal(captionAt(a, 10), 'two');
  assert.equal(captionAt(b, 12), '');
});

test('motion is a zoom or a pan across the scene; none stands still', () => {
  assert.deepEqual(motionAt('', 0.5), { scale: 1, dx: 0, dy: 0 });
  assert.ok(motionAt('in', 1).scale > motionAt('in', 0).scale);
  assert.ok(motionAt('out', 1).scale < motionAt('out', 0).scale);
  assert.ok(motionAt('panr', 1).dx > motionAt('panr', 0).dx);
  assert.ok(motionAt('panl', 1).dx < motionAt('panl', 0).dx);
  assert.ok(motionAt('up', 1).dy < motionAt('up', 0).dy);
  assert.ok(motionAt('down', 1).dy > motionAt('down', 0).dy);
  // every motion the model allows moves the picture
  for (const m of MOTION_CYCLE.filter(Boolean)) assert.notDeepEqual(motionAt(m, 0), motionAt(m, 1), m);
  assert.deepEqual(TRANSITION_CYCLE, ['', 'cut', 'dissolve', 'fade', 'wipe', 'push']);
});

test('the waveform is the loudest sample in each slice, scaled to the loudest', () => {
  const left = new Float32Array([0, 0.1, -0.5, 0.2, 0, 0, 0.05, 0]);
  const right = new Float32Array([0, 0, 0, 0, 0.25, -0.1, 0, 0]);
  const peaks = songPeaks([left, right], 4, 2);
  assert.deepEqual([...peaks].map((p) => Math.round(p * 1000) / 1000), [0.2, 1, 0.5, 0.1]);
  assert.deepEqual([...songPeaks([new Float32Array(4)], 4, 2)], [0, 0]);
});
