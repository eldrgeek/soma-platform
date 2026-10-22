import assert from 'node:assert/strict';
import test from 'node:test';

import { checks, estimate, filmInfo, filmVoices, parseFilm, songTimes, spokenLines, toSomaCut, VOICES } from '../src/film.js';
import { createVideoReader, readFilm } from '../server/video-read.js';
import { mountVideoView } from '../src/video-view.js';
import { mount } from '../../soma-puppet-runtime/test/fake-dom.js';

const SCRIPT = `Title: How the Gig Video Was Made
Credit: Mike Wolf and the team
Draft date: 2026-10-22

SETTINGS
format: 16:9
narration-engine: eleven

CAST
CLAUDE: Chris
SUNO: Charlie

.THE SONG

MUSIC file:~/gig/no_vocals.wav fade-in 1s

CARD title
# A Gig Isn't What It Used To Be

CLAUDE
(warm)
I'm Claude. Here is how we made it.

CLIP file:~/gig/v3.mp4 in 0:10 out 0:16

SUNO
I'm Suno. I made the music.

DISSOLVE TO:

.THE PICTURES

GROK
I wrote four prompts.
`;

test('parses the title page, SETTINGS, CAST, scenes, visuals and speeches', () => {
  const blocks = parseFilm(SCRIPT);
  const { title, settings, cast } = filmInfo(blocks);
  assert.equal(title.Title, 'How the Gig Video Was Made');
  assert.equal(settings['narration-engine'], 'eleven');
  assert.deepEqual(cast, { CLAUDE: 'Chris', SUNO: 'Charlie' });
  assert.deepEqual(blocks.filter((b) => b.type === 'scene').map((b) => [b.scene, b.text]), [[1, 'THE SONG'], [2, 'THE PICTURES']]);
  const visuals = blocks.filter((b) => b.type === 'visual');
  assert.deepEqual(visuals.map((b) => [b.kind, b.track]), [['MUSIC', true], ['CARD', false], ['CLIP', false]]);
  assert.deepEqual(visuals[1].body, ['# A Gig Isn\'t What It Used To Be']);
  assert.equal(blocks.find((b) => b.type === 'transition').text, 'DISSOLVE TO:');
});

test('speaks only narrator words: no parentheticals, cards or clips', () => {
  const lines = spokenLines(parseFilm(SCRIPT));
  assert.deepEqual(lines.map((l) => [l.character, l.text]), [
    ['CLAUDE', "I'm Claude. Here is how we made it."],
    ['SUNO', "I'm Suno. I made the music."],
    ['GROK', 'I wrote four prompts.'],
  ]);
});

test('CAST voices win; others get a voice no one else in the script has', () => {
  const voices = filmVoices(parseFilm(SCRIPT));
  assert.equal(voices.CLAUDE.name, 'Chris');
  assert.equal(voices.SUNO.name, 'Charlie');
  assert.ok(VOICES.includes(voices.GROK));
  assert.ok(!['Chris', 'Charlie'].includes(voices.GROK.name));
});

test('checks name a narrator with no CAST voice and an unknown voice', () => {
  const problems = checks(parseFilm(SCRIPT.replace('SUNO: Charlie', 'SUNO: Nobody')));
  assert.ok(problems.some((p) => p.startsWith('GROK has no voice in CAST')));
  assert.ok(problems.some((p) => p.includes('"Nobody", which is not on the roster')));
  assert.ok(problems.some((p) => p.startsWith('Scene 2 (THE PICTURES) has nothing to look at')));
});

test('estimates each scene from its words and its footage', () => {
  const { scenes, total } = estimate(parseFilm(SCRIPT));
  assert.equal(scenes[0].seconds, 6); // the 6-second clip outlasts 12 words of narration
  assert.equal(total, scenes.reduce((s, x) => s + x.seconds, 0));
});

test('toSomaCut removes CAST and returns the cast sidecar', () => {
  const { fountain, cast } = toSomaCut(SCRIPT);
  assert.ok(!/^CAST$/m.test(fountain));
  assert.ok(!fountain.includes('CLAUDE: Chris'));
  assert.ok(fountain.includes('SETTINGS\nformat: 16:9'));
  assert.ok(fountain.includes('.THE SONG'));
  assert.deepEqual(cast.find((c) => c.name === 'CLAUDE').voiceId, 'iP95p4xoKVk53GoZ742B');
  assert.equal(cast.length, 3);
});

test('the AV view puts a visual in the row of the line after it, and highlights a line', () => {
  const container = mount();
  const view = mountVideoView(container, SCRIPT);
  const text = container.textContent;
  assert.ok(text.includes('How the Gig Video Was Made'));
  assert.ok(text.includes('1. THE SONG'));
  assert.ok(text.includes('CLAUDE · Chris'));
  const claude = view.blocks.findIndex((b) => b.type === 'speech' && b.character === 'CLAUDE');
  view.highlight(claude);
  const lit = container.querySelectorAll('.soma-video-spotlight');
  assert.equal(lit.length, 2);
  assert.ok(lit[0].textContent.startsWith('CARD'));
  assert.ok(lit[1].textContent.includes("I'm Claude."));
  view.highlight(null);
  assert.equal(container.querySelectorAll('.soma-video-spotlight').length, 0);
  view.update('Title: Next\n\n.ONE\n\nCARD title\nHi');
  assert.ok(container.textContent.includes('Next'));
});

const SONG = `Title: A Song

.VERSE 1 0:14-0:48

MUSIC file:audio/song.mp3

CARD title
# A Song

~War is the angry expression of
~The absence of reason

.CHORUS 0:48 to 1:11

CARD quote
The heart

~The Compassionate Heart`;

test('a song-clocked script: ~ lines are sung lyrics, never read; heading times are the scene length', () => {
  const blocks = parseFilm(SONG);
  const lyrics = blocks.filter((b) => b.type === 'lyric');
  assert.deepEqual(lyrics.map((b) => b.lines), [['War is the angry expression of', 'The absence of reason'], ['The Compassionate Heart']]);
  assert.equal(lyrics[0].scene, 1);
  assert.deepEqual(spokenLines(blocks), []);
  assert.deepEqual(songTimes('VERSE 1 0:14-0:48'), { start: 14, end: 48 });
  assert.deepEqual(songTimes('CHORUS 0:48 – 1:11'), { start: 48, end: 71 });
  assert.equal(songTimes('THE SONG'), null);
  assert.equal(songTimes('BACKWARDS 1:00-0:30'), null);
  assert.deepEqual(estimate(blocks), { scenes: [{ title: 'VERSE 1 0:14-0:48', seconds: 34 }, { title: 'CHORUS 0:48 to 1:11', seconds: 23 }], total: 57 });
  assert.deepEqual(checks(blocks), []);
  assert.equal(readFilm(SONG).lines.length, 0);
});

test('the AV view draws sung lines in the sound column, one line each, beside their picture', () => {
  const container = mount();
  mountVideoView(container, SONG);
  const lyric = container.querySelectorAll('.soma-video-lyric');
  assert.equal(lyric.length, 2);
  assert.equal(lyric[0].children.length, 2);
  assert.equal(lyric[0].children[1].textContent, 'The absence of reason');
  const cells = lyric[0].parent.parent.children;
  assert.ok(cells[cells.indexOf(lyric[0].parent) - 1].textContent.startsWith('CARD'));
  assert.ok(container.textContent.includes('about 0:34'));
});

function memoryCounters() {
  const values = new Map();
  return {
    values,
    async reserve(key, amount, limit) {
      const next = (values.get(key) ?? 0) + amount;
      if (next > limit) return false;
      values.set(key, next);
      return true;
    },
    async release(key, amount) { values.set(key, (values.get(key) ?? 0) - amount); },
    async getAudio(key) { return values.get(key) ?? null; },
    async setAudio(key, bytes) { values.set(key, bytes); },
  };
}

test('the narration read speaks a line in its CAST voice and counts apart from Stage Read', async () => {
  const calls = [];
  const store = memoryCounters();
  const speak = createVideoReader({
    apiKey: 'k',
    store,
    fetch: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(new Uint8Array([1, 2, 3]));
    },
  });
  const out = await speak({ who: 'mike', scope: 'videomaker', text: SCRIPT, line: 1 });
  assert.equal(out.status, 200);
  assert.equal(out.headers['x-stage-read-voice'], 'Charlie');
  assert.ok(calls[0].url.includes('IKne3meq5aSn9XLyUdCD'));
  assert.equal(calls[0].body.text, "I'm Suno. I made the music.");
  assert.ok([...store.values.keys()].every((key) => key.startsWith('video/')));
  const again = await speak({ who: 'mike', scope: 'videomaker', text: SCRIPT, line: 1 });
  assert.equal(again.headers['x-stage-read-cached'], 'yes');
  assert.equal(calls.length, 1);
  assert.equal((await speak({ who: 'mike', text: SCRIPT, line: 9 })).status, 404);
  assert.equal(readFilm(SCRIPT).lines.length, 3);
});
