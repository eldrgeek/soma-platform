import assert from 'node:assert/strict';
import test from 'node:test';

import { characters, initials, mountLineRun, runPlan } from '../src/line-run.js';
import { parseScript, spokenLines } from '../src/script.js';

const SCENE = 'THEO: I came back for the letter.\nANA: Then take it and go.\n\n(He takes it.)\nTHEO: Not yet.\nANA: Go.';

// Just enough DOM for the player: elements with children, text, hidden, value and click listeners.
function fakeDocument() {
  const make = (tag) => ({
    tagName: tag.toUpperCase(), children: [], attributes: {}, listeners: {}, textContent: '', className: '', hidden: false, value: '', disabled: false,
    append(...nodes) { this.children.push(...nodes); },
    remove() { this.removed = true; },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); },
    click() { for (const listener of this.listeners.click ?? []) listener({}); },
  });
  const document = { createElement: make };
  return { document, container: { ...make('div'), ownerDocument: document } };
}

const flush = async () => { for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };

function runner({ speak, text = SCENE, hint } = {}) {
  const { document, container } = fakeDocument();
  const asked = [];
  const audios = [];
  const active = [];
  const view = mountLineRun(container, {
    text,
    hint,
    document,
    speak: speak ?? (async (line) => { asked.push(line); return new Response(new Uint8Array(line + 1)); }),
    onActive: (index) => active.push(index),
    createUrl: (blob) => `url:${blob.size}`,
    createAudio: (url) => {
      const audio = { url, play() { audios.push(this); return Promise.resolve(); }, pause() { this.paused = true; } };
      return audio;
    },
  });
  const [bar, cue] = container.children[0].children;
  const [choose, start, status] = bar.children;
  const [who, line, show, next] = cue.children;
  return { view, asked, audios, active, choose, start, status, cue, who, line, show, next, container };
}

test('the parts are the speakers in the order they first speak', () => {
  assert.deepEqual(characters(spokenLines(parseScript(SCENE))), ['THEO', 'ANA']);
  const r = runner();
  assert.deepEqual(r.choose.children.map((o) => o.value), ['THEO', 'ANA']);
  assert.equal(r.choose.value, 'THEO');
  assert.equal(r.start.textContent, 'Run lines');
});

test('the plan marks the chosen part\'s lines as mine', () => {
  const plan = runPlan(spokenLines(parseScript(SCENE)), 'ANA');
  assert.deepEqual(plan.map((p) => [p.character, p.mine]), [['THEO', false], ['ANA', true], ['THEO', false], ['ANA', true]]);
});

test('initials keep the first letter of each word and the punctuation', () => {
  assert.equal(initials('Then take it and go.'), 'T t i a g.');
  assert.equal(initials('"Don\'t," she said — twice!'), '"D," s s — t!');
});

test('it reads only the other parts, stops on mine with the line hidden, and goes on at Next', async () => {
  const r = runner();
  r.choose.value = 'ANA';
  r.start.click();
  await flush();
  assert.deepEqual(r.asked, [0, 2], 'THEO\'s first line plays and his next is fetched one ahead, as Stage Read does');
  assert.equal(r.audios.length, 1);
  r.audios[0].onended();
  await flush();
  assert.equal(r.cue.hidden, false, 'ANA\'s line: the run waits');
  assert.equal(r.who.textContent, 'Your line, ANA');
  assert.equal(r.line.textContent, '…', 'the words stay hidden');
  assert.deepEqual(r.asked, [0, 2], 'nothing more is fetched while the actor speaks');
  r.show.click();
  assert.equal(r.line.textContent, 'Then take it and go.');
  r.next.click();
  await flush();
  assert.equal(r.cue.hidden, true);
  assert.equal(r.audios.length, 2);
  r.audios[1].onended();
  await flush();
  assert.equal(r.who.textContent, 'Your line, ANA');
  r.next.click();
  await flush();
  assert.equal(r.status.textContent, 'Finished. Run it again?');
  assert.deepEqual(r.asked, [0, 2], 'ANA\'s own lines (1 and 3) are never asked for');
  assert.deepEqual(r.active, [null, 0, 1, 3, 4, null], 'blocks 0, 1, 3 and 4 in turn; the direction is skipped');
  assert.equal(r.choose.disabled, false);
});

test('with hint: initials the hidden line shows its initials', async () => {
  const r = runner({ hint: 'initials' });
  r.choose.value = 'THEO';
  r.start.click();
  await flush();
  assert.equal(r.line.textContent, 'I c b f t l.');
  assert.deepEqual(r.asked, [1], 'THEO starts, so nothing is played yet; ANA\'s line is fetched ahead');
});

test('Stop ends the run, even while waiting on my line', async () => {
  const r = runner();
  r.choose.value = 'THEO';
  r.start.click();
  await flush();
  assert.equal(r.cue.hidden, false);
  r.start.click();
  await flush();
  assert.equal(r.status.textContent, 'Stopped.');
  assert.equal(r.cue.hidden, true);
  assert.equal(r.start.textContent, 'Run lines');
  r.next.click();
  await flush();
  assert.equal(r.audios.length, 0, 'Next after Stop plays nothing');
});

test('a used-up allowance stops the run and says so', async () => {
  const r = runner({ speak: async () => new Response('{}', { status: 402 }) });
  r.choose.value = 'ANA';
  r.start.click();
  await flush();
  assert.equal(r.status.textContent, "Today's reading allowance is used up. It starts again tomorrow.");
  assert.equal(r.start.textContent, 'Run lines');
});

test('a scene with no speeches says so and does nothing', () => {
  const r = runner({ text: '(Lights up.)' });
  assert.equal(r.status.textContent, 'No lines to run yet.');
  r.start.click();
  assert.equal(r.start.textContent, 'Run lines');
});
