import assert from 'node:assert/strict';
import test from 'node:test';

import { mountStageRead } from '../src/stage-read.js';

// Just enough DOM for the player: a button, a status line, click listeners.
function fakeDocument() {
  const make = (tag) => ({
    tagName: tag.toUpperCase(), children: [], attributes: {}, listeners: {}, textContent: '', className: '',
    append(...nodes) { this.children.push(...nodes); },
    remove() {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); },
    click() { for (const listener of this.listeners.click ?? []) listener({}); },
  });
  const document = { createElement: make };
  return { document, container: { ...make('div'), ownerDocument: document } };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function player({ speak, text = 'SAM: One.\nANA: Two.\n\n(She goes.)\nSAM: Three.' } = {}) {
  const { document, container } = fakeDocument();
  const played = [];
  const active = [];
  const audios = [];
  const view = mountStageRead(container, {
    text,
    document,
    speak,
    onActive: (index) => active.push(index),
    createUrl: (blob) => `url:${blob.size}`,
    createAudio: (url) => {
      const audio = { url, play() { played.push(url); audios.push(this); return Promise.resolve(); }, pause() { this.paused = true; } };
      return audio;
    },
  });
  const root = container.children[0];
  return { view, button: root.children[0], status: root.children[1], played, active, audios };
}

test('it asks for each line by number, plays them in order, and highlights each block', async () => {
  const asked = [];
  const p = player({ speak: async (line) => { asked.push(line); return new Response(new Uint8Array(line + 1)); } });
  assert.equal(p.button.textContent, 'Hear this scene');
  p.button.click();
  for (let index = 0; index < 3; index += 1) {
    await flush();
    await flush();
    p.audios.at(-1)?.onended?.();
  }
  await flush();
  assert.deepEqual(asked, [0, 1, 2]);
  assert.deepEqual(p.played, ['url:1', 'url:2', 'url:3']);
  assert.deepEqual(p.active, [null, 0, 1, 3, null], 'block 2 is a direction and is not read');
  assert.equal(p.status.textContent, 'Finished.');
});

test('a used-up allowance stops the reading and says so', async () => {
  const p = player({ speak: async () => new Response('{}', { status: 402 }) });
  p.button.click();
  await flush();
  await flush();
  assert.equal(p.status.textContent, "Today's reading allowance is used up. It starts again tomorrow.");
  assert.equal(p.button.textContent, 'Hear this scene');
});

test('Stop stops the audio', async () => {
  const p = player({ speak: async () => new Response(new Uint8Array(1)) });
  p.button.click();
  await flush();
  await flush();
  assert.equal(p.button.textContent, 'Stop');
  p.button.click();
  assert.equal(p.audios[0].paused, true);
  assert.equal(p.status.textContent, 'Stopped.');
});
