// vm-board-seed: a storyboard made from a song project's album, timings, short specs and renders, on a
// made-up project in a temporary folder (no real pictures).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { boardFromProject, findLine } from '../bin/vm-board-seed.mjs';
import { cutState } from '../src/storyboard.js';

function project() {
  const dir = mkdtempSync(join(tmpdir(), 'vm-seed-'));
  const file = (path, value, when) => {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), typeof value === 'string' ? value : JSON.stringify(value));
    if (when) utimesSync(join(dir, path), new Date(when), new Date(when));
  };
  const early = '2026-10-23T10:00:00Z';
  const late = '2026-10-23T12:00:00Z';
  file('eric-album/album.json', { title: 'Album', images: [
    { id: 'e01', section: 'Intro', line: 'Izzy, I had that dream again.', shot: 'close-up', references: ['o47'], prompt: 'Wakes at night', '9x16': 'gen/9x16/e01.jpg', '16x9': 'gen/16x9/e01.jpg' },
    { id: 'e02', section: 'Intro', line: 'So this is how it ends?', references: ['o29'], prompt: 'A mirror', '9x16': 'gen/9x16/e02.jpg', '16x9': 'gen/16x9/e02.jpg' },
    { id: 'e03', section: 'Verse 1', line: 'A line nobody sings', prompt: 'x', '9x16': 'gen/9x16/e03.jpg' },
  ] }, early);
  for (const name of ['9x16/e01', '16x9/e01', '9x16/e02', '16x9/e02', '9x16/e03']) file(`eric-album/gen/${name}.jpg`, 'jpeg', early);
  file('build/kinetic/timings.json', [
    { section: 'Intro', text: 'Izzy, I had that dream again', s: 2.5, e: 5 },
    { section: 'Intro', text: 'So this is how it ends?', s: 18.12, e: 19.7 },
  ]);
  file('build/kinetic/beats.json', { duration: 258.014 });
  file('build/witness-and-stay-eric/kinetic.json', {});
  file('eric-shorts/74-meets-31.json', { audio: [[100.24, 129.94]], endcard: 3.5, shots: [['e02', 5.6], ['e01', 4.8], ['e99', 2]] }, early);
  file('audio/witness-and-stay.mp3', 'mp3');
  file('audio/instrumental.mp3', 'mp3');
  file('out/eric/witness-and-stay-eric.mp4', 'mp4', late);
  file('out/eric/shorts/74-meets-31.mp4', 'mp4', late);
  return dir;
}

test('a lyric finds its timings line whatever the punctuation, in song order', () => {
  const timings = [{ text: 'Hold on', s: 1 }, { text: 'So this is how it ends?', s: 18 }, { text: 'Hold on', s: 90 }];
  assert.equal(findLine(timings, 'so this is how it ends').s, 18);
  assert.equal(findLine(timings, 'Hold on,', 2).s, 90);
  assert.equal(findLine(timings, 'Hold on').s, 1);
  assert.equal(findLine(timings, 'nothing like it'), null);
});

test('the board: scenes from the album, times from the timings, cuts from the build and the shorts', () => {
  const dir = project();
  const { board, files, song, warnings } = boardFromProject(dir, { id: 'witness', title: 'Witness and Stay', artists: ['eric@example.com'] });
  assert.deepEqual(board.scenes.map((s) => [s.id, s.start, s.end]), [['e01', 2.5, 18.12], ['e02', 18.12, 258.01], ['e03', null, null]]);
  assert.deepEqual(board.scenes[0].refs, ['o47']);
  assert.deepEqual(board.scenes[0].pictures, { '9x16': 'e01-9x16.jpg', '16x9': 'e01-16x9.jpg' });
  assert.equal(board.scenes[0].source['16x9'], 'eric-album/gen/16x9/e01.jpg');
  assert.equal(Object.keys(files).length, 5);
  assert.match(song, /witness-and-stay\.mp3$/);
  assert.equal(board.song.file, 'song.mp3');
  assert.deepEqual(board.cuts.map((c) => c.id), ['full', '74-meets-31']);
  assert.deepEqual(board.cuts[0].spec, { renderer: 'kinetic-lyric-video', build: 'build/witness-and-stay-eric' });
  assert.deepEqual(board.cuts[1].shots, [{ scene: 'e02', seconds: 5.6 }, { scene: 'e01', seconds: 4.8 }]);
  assert.deepEqual(board.cuts[1].spec, { renderer: 'eric-shorts/vshort.py', endcard: 3.5 });
  // Rendered after the pictures and specs were made: both cuts start up to date.
  assert.deepEqual(board.cuts.map((c) => cutState(board, c).state), ['current', 'current']);
  assert.ok(warnings.some((w) => /e03: no timings line/.test(w)));
  assert.ok(warnings.some((w) => /74-meets-31: shots name scenes not on the board: e99/.test(w)));
  assert.equal(board.project.startsWith('~/') || board.project.startsWith('~/../'), true);
});
