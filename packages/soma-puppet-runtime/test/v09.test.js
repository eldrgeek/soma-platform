// Puppet v0.9: video-evidence, a video script's claims next to their sources. The grammar and the page's
// wiring; the ledger itself is tested in packages/soma-video/test/evidence.test.js. No server route.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mountVideoEvidence } from '../../soma-video/src/evidence.js';
import { parse, walk } from '../src/parser.js';
import { render } from '../src/render.js';
import { mount } from './fake-dom.js';

const VIDEOMAKER = await readFile(new URL('../examples/videomaker.puppet', import.meta.url), 'utf8');
const SCRIPT = '.ONE\n\nNARRATOR\nA thing happened.\n\n[[src: the log]]\n\nNARRATOR\nThen another.\n';

const app = (body, version = '0.9') => `puppet "Evidence" version "${version}"
data scripts {
  fields: [title, text]
  read: private
}
screen "Scripts" {
  list "Scripts" from scripts -> opens screen "Script"
  field "Title"
  button "Add" -> adds to scripts { title: "{form.Title}" }
}
screen "Script" from scripts {
${body}
}
`;
const errors = (source) => parse(source).errors.map((e) => e.message);

test('video-evidence takes its text like video-view, from v0.9', () => {
  assert.deepEqual(errors(app('  video-evidence "{row.text}"')), []);
  assert.ok(errors(app('  video-evidence "{row.text}"', '0.8')).some((m) => /video-evidence is a Puppet v0.9 element/.test(m)));
  assert.ok(errors(app('  video-evidence')).some((m) => /video-evidence needs its text in quotes/.test(m)));
});

test('the VideoMaker example shows the ledger on the script screen', () => {
  const { sketch, errors: found, warnings } = parse(VIDEOMAKER);
  assert.deepEqual(found, []);
  assert.deepEqual(warnings, []);
  const script = sketch.screens.find((s) => s.name === 'Script');
  assert.ok(walk(script.children).some((el) => el.kind === 'video-evidence' && el.label === '{row.text}'));
});

const open = async (body, components) => {
  const root = mount();
  render(parse(app(body)).sketch, { root, data: { scripts: [{ id: 'r-1', title: 'Film', text: SCRIPT }] }, me: {}, components });
  await root.querySelectorAll('.puppet-runtime-list-row')[0].click();
  return root;
};

test('the renderer hands the ledger the row\'s text, and the editor\'s typing redraws it', async () => {
  const updates = [];
  let given;
  const root = await open('  script-editor "{row.text}"\n  video-evidence "{row.text}"', {
    'video-evidence': (node, text) => { given = text; return { update: (next) => updates.push(next) }; },
  });
  assert.equal(given, SCRIPT);
  const area = root.querySelector('.puppet-runtime-script-text');
  area.value = `${SCRIPT}\n[[src: the second log]]\n`;
  for (const listener of area.listeners.input) listener({});
  assert.deepEqual(updates, [area.value]);
});

test('the real ledger draws in the page', async () => {
  const root = await open('  video-evidence "{row.text}"', { 'video-evidence': (node, text) => mountVideoEvidence(node, text) });
  assert.match(root.textContent, /2 claims: 1 sourced, 1 with no source/);
});

test('without the component the page says the ledger is not available', async () => {
  const root = await open('  video-evidence "{row.text}"', {});
  assert.match(root.textContent, /The evidence ledger is not available here\./);
});
