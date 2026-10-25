import assert from 'node:assert/strict';
import test from 'node:test';

import { mountDocImport } from '../src/doc-import.js';
import { mountPlayPrint } from '../src/play-print.js';
import { parseScript, splitScenes, toFountain } from '../src/script.js';

// What PlayMaker's converter (importGoogleDocHtml) returned for a Google Doc in the browser.
const CONVERTED = [
  'Witness Projection', '', 'A play by Eric Kohner', '', 'CHARACTERS', '', 'IZZY, his friend', '',
  'ACT ONE', '', 'SCENE ONE', '', '(Lights up. A kitchen at night.)', '', 'OLDER ERIC', 'Keep your voice down.', '',
  'BLACKOUT.', '', 'SCENE TWO', '', 'IZZY', 'Then read it to me.', '', 'ACT TWO', '', 'SCENE ONE', '', 'IZZY', 'Start with the door.',
].join('\n');

test('splitScenes cuts the converted script at each scene, keeps the act, and drops the front matter', () => {
  const withAct = splitScenes(CONVERTED, { withAct: true });
  assert.deepEqual(withAct.map(({ act, title }) => [act, title]), [['ACT ONE', 'SCENE ONE'], ['ACT ONE', 'SCENE TWO'], ['ACT TWO', 'SCENE ONE']]);
  assert.equal(withAct[0].text.split('\n')[0], 'ACT ONE', 'the first scene of an act opens with the act');
  assert.equal(withAct[0].text.includes('Kohner'), false, 'the title page is not brought in');
  assert.deepEqual(splitScenes(CONVERTED).map(({ title }) => title), ['ACT ONE, SCENE ONE', 'ACT ONE, SCENE TWO', 'ACT TWO, SCENE ONE']);
  assert.deepEqual(splitScenes('SAM: hi', { fallbackTitle: 'My Doc' }), [{ title: 'My Doc', text: 'SAM: hi' }]);
  assert.deepEqual(splitScenes('   '), []);
  assert.deepEqual(splitScenes('## Act 1 Scene 2\n\nSAM\nhi').map(({ title }) => title), ['Act 1 Scene 2']);
});

test('toFountain writes the headings PlayMaker\'s PDF writer reads, and keeps every line', () => {
  const fountain = toFountain('ACT ONE\n\nSCENE ONE\n\n(Lights up.)\n\nSAM: Hello.\n\nANA\n(quietly)\nGo.');
  assert.equal(fountain, '## ACT ONE\n\n## SCENE ONE\n\n(Lights up.)\n\nSAM\nHello.\n\nANA\n(quietly)\nGo.');
  assert.deepEqual(parseScript(fountain).map(({ type }) => type), parseScript('ACT ONE\n\nSCENE ONE\n\n(Lights up.)\n\nSAM: Hello.\n\nANA\n(quietly)\nGo.').map(({ type }) => type));
});

test('PlayMaker\'s own PDF writer makes a real PDF from a scene', async () => {
  const { scriptToPdf } = await import('../src/playmaker/print.js');
  const bytes = await scriptToPdf(toFountain(splitScenes(CONVERTED)[0].text), { title: 'Witness Projection' });
  assert.equal(String.fromCharCode(...bytes.slice(0, 5)), '%PDF-');
  assert.ok(bytes.length > 2000);
});

// Just enough DOM for the two components.
function fakeDocument() {
  const tabs = [];
  const made = (tag) => ({
    tagName: tag.toUpperCase(), children: [], attributes: {}, listeners: {}, textContent: '', className: '', hidden: false,
    append(...nodes) { this.children.push(...nodes); },
    remove() {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); },
    async click() { for (const listener of this.listeners.click ?? []) await listener({}); },
  });
  const view = {
    open: () => { const tab = { location: {} }; tabs.push(tab); return tab; },
    URL: { createObjectURL: () => 'blob:pdf', revokeObjectURL() {} },
    Blob: class { constructor(parts, options) { this.parts = parts; this.type = options.type; } },
  };
  const document = { createElement: made, defaultView: view };
  return { document, container: { ...made('div'), ownerDocument: document }, tabs };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('play-print hands PlayMaker\'s writer the Fountain and opens the PDF in a new tab', async () => {
  const { document, container, tabs } = fakeDocument();
  const asked = [];
  mountPlayPrint(container, {
    document,
    getText: () => 'SAM: Hello.',
    title: 'Table Read',
    load: async () => ({ scriptToPdf: async (fountain, options) => { asked.push([fountain, options]); return new Uint8Array([37]); } }),
  });
  const [button, status] = container.children[0].children;
  assert.equal(button.textContent, 'Print (PDF)');
  await button.click();
  assert.deepEqual(asked, [['SAM\nHello.', { title: 'Table Read' }]]);
  assert.equal(tabs[0].location.href, 'blob:pdf');
  assert.match(status.textContent, /opened in a new tab/);
});

test('play-print says when there is nothing to print', async () => {
  const { document, container } = fakeDocument();
  mountPlayPrint(container, { document, getText: () => '  ', load: async () => ({ scriptToPdf: async () => new Uint8Array() }) });
  const [button, status] = container.children[0].children;
  await button.click();
  assert.equal(status.textContent, 'There is nothing to print yet.');
});

function playmakerStub({ html = '<p>x</p>', text = CONVERTED, fail } = {}) {
  const calls = { picked: 0, exported: [] };
  return {
    calls,
    load: async () => ({
      pickGoogleDoc: async () => { calls.picked += 1; return { id: 'docTheo_1234567890', title: 'Witness Projection' }; },
      exportDocAsHtml: async (id) => { calls.exported.push(id); if (fail) throw fail; return html; },
      importGoogleDocHtml: () => ({ text }),
      translateGoogleFailure: (error) => `Google said: ${error.message}`,
    }),
  };
}

test('doc-import picks a Doc, converts it with PlayMaker\'s code, sends the scenes, and shows the pull', async () => {
  const { document, container } = fakeDocument();
  const sent = [];
  const pm = playmakerStub();
  let pulled = 0;
  mountDocImport(container, {
    document,
    google: { clientId: 'client', apiKey: 'key' },
    withAct: true,
    load: pm.load,
    send: async (pull) => { sent.push(pull); return new Response(JSON.stringify({ id: pull.doc.id, name: pull.doc.name, pulledAt: '2026-10-24T20:00:00Z', scenes: pull.scenes.length })); },
    onPulled: () => { pulled += 1; },
  });
  const [status, pull, other] = container.children[0].children;
  assert.equal(pull.textContent, 'Bring in from Google Doc');
  assert.equal(other.hidden, true);
  await pull.click();
  assert.equal(document.defaultView.__SOMA_GOOGLE_CLIENT_ID__, 'client');
  assert.deepEqual(sent[0].doc, { id: 'docTheo_1234567890', name: 'Witness Projection' });
  assert.deepEqual(sent[0].scenes.map(({ act, title }) => [act, title]), [['ACT ONE', 'SCENE ONE'], ['ACT ONE', 'SCENE TWO'], ['ACT TWO', 'SCENE ONE']]);
  assert.match(status.textContent, /Last updated .* from “Witness Projection” · 3 scenes/);
  assert.equal(pull.textContent, 'Pull again');
  assert.equal(other.hidden, false);
  assert.equal(pulled, 1);

  await pull.click();
  assert.equal(pm.calls.picked, 1, 'Pull again reads the same Doc without the picker');
  assert.deepEqual(pm.calls.exported, ['docTheo_1234567890', 'docTheo_1234567890']);
  await other.click();
  assert.equal(pm.calls.picked, 2, 'Choose a different Doc opens the picker');
});

test('doc-import says plainly when it is not set up, when Google refuses, and when the server refuses', async () => {
  const notSet = fakeDocument();
  mountDocImport(notSet.container, { document: notSet.document, google: {}, send: async () => { throw new Error('no'); } });
  await notSet.container.children[0].children[1].click();
  assert.equal(notSet.container.children[0].children[0].textContent, 'Google Doc import is not set up on this site yet.');

  const refused = fakeDocument();
  mountDocImport(refused.container, { document: refused.document, google: { clientId: 'c' }, load: playmakerStub({ fail: new Error('access_denied') }).load, send: async () => new Response('{}') });
  await refused.container.children[0].children[1].click();
  assert.equal(refused.container.children[0].children[0].textContent, 'Google said: access_denied');

  const server = fakeDocument();
  mountDocImport(server.container, { document: server.document, google: { clientId: 'c' }, load: playmakerStub().load, send: async () => new Response(JSON.stringify({ error: 'A pull has 1 to 300 scenes' }), { status: 400 }) });
  await server.container.children[0].children[1].click();
  assert.equal(server.container.children[0].children[0].textContent, 'A pull has 1 to 300 scenes');
});

test('doc-import shows the writer\'s last pull when it opens', async () => {
  const { document, container } = fakeDocument();
  mountDocImport(container, {
    document,
    google: { clientId: 'c' },
    send: async () => new Response('{}'),
    last: async () => new Response(JSON.stringify({ id: 'docTheo_1234567890', name: 'Witness Projection', pulledAt: '2026-10-24T20:00:00Z', scenes: 3 })),
  });
  await flush();
  await flush();
  assert.match(container.children[0].children[0].textContent, /Last updated .* “Witness Projection” · 3 scenes/);
  assert.equal(container.children[0].children[1].textContent, 'Pull again');
});
