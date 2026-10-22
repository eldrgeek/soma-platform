import assert from 'node:assert/strict';
import test from 'node:test';

import { castVoices, isTechnicalCue, parseScript, spokenLines, VOICES } from '../src/script.js';

test('the reading order of GRAMMAR-v0.4 section 5', () => {
  const blocks = parseScript([
    '## Act 1 Scene 1',
    'ACT ONE, SCENE TWO',
    '(Lights up. A kitchen at night.)',
    'OLDER ERIC: The lamps are low tonight.',
    'YOUNGER ERIC',
    '(whispering)',
    "I can't keep it down.",
    'Not after the letter came.',
    'BLACKOUT.',
    'IZZY',
    'Then read it.',
    '',
    'Izzy crosses to the window.',
  ].join('\n'));
  assert.deepEqual(blocks.map((block) => [block.type, block.character ?? block.text]), [
    ['heading', 'Act 1 Scene 1'],
    ['heading', 'ACT ONE, SCENE TWO'],
    ['direction', '(Lights up. A kitchen at night.)'],
    ['speech', 'OLDER ERIC'],
    ['speech', 'YOUNGER ERIC'],
    ['direction', 'BLACKOUT.'],
    ['speech', 'IZZY'],
    ['direction', 'Izzy crosses to the window.'],
  ]);
  assert.equal(blocks[2].technical, true);
  assert.equal(blocks[7].technical, false);
  assert.deepEqual(blocks[4].lines.map(({ kind }) => kind), ['parenthetical', 'words', 'words']);
});

test('spoken lines are the speeches with words, numbered from 0; nothing else is spoken', () => {
  const lines = spokenLines(parseScript('(She sits.)\nSAM: One.\nANA\n(beat)\nTwo.\nThree.\n\nBLACKOUT.'));
  assert.deepEqual(lines.map(({ index, character, text }) => [index, character, text]), [
    [0, 'SAM', 'One.'],
    [1, 'ANA', 'Two. Three.'],
  ]);
});

test('technical cues follow PlayMaker\'s Diana rule', () => {
  for (const cue of ['Lights fade.', '(Blackout.)', 'Music up', 'Sound of rain', 'End of Act One', 'Time: 1987']) {
    assert.equal(isTechnicalCue(cue), true, cue);
  }
  for (const line of ['She lights a candle and waits by the window for a long time.', 'He leaves.']) {
    assert.equal(isTechnicalCue(line), false, line);
  }
});

test('each character keeps a voice from the roster, and a scene never doubles one', () => {
  const scene = parseScript('OLDER ERIC: a\nYOUNGER ERIC: b\nIZZY: c\nDIANA: d\nMO: e');
  const cast = castVoices(scene);
  assert.equal(new Set(Object.values(cast).map(({ id }) => id)).size, 5);
  assert.ok(Object.values(cast).every((voice) => VOICES.includes(voice)));
  assert.deepEqual(castVoices(parseScript('IZZY: again\nOLDER ERIC: again\nYOUNGER ERIC: x\nDIANA: y\nMO: z')), cast, 'the same cast gets the same voices');
});
