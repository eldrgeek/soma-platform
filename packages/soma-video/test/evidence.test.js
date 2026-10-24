import assert from 'node:assert/strict';
import test from 'node:test';

import { evidence, mountVideoEvidence, summary, toMarkdown } from '../src/evidence.js';
import { spokenLines, parseFilm } from '../src/film.js';

const SCRIPT = `Title: The making of Eric's album

CAST
NARRATOR: George

.THE PROBLEM

CARD title
# Seventy-five photos, thirty-six pictures

[[src: eric-album/originals/INDEX.md]]

NARRATOR
The song told Eric's whole story. But not one picture in its video was Eric.

[[src: Mike, 2026-10-23 16:11]]
[[src: README: img/s01..s24 had no reference photos]]

CLIP file:old.mp4 in 0:26 out 0:30

.A HUMAN DECIDES

NARRATOR
Then the computer stopped itself.

NARRATOR
What would you have done?

[[not a claim]]
`;

test('every line and card is a claim, with the source notes that follow it', () => {
  const { claims, counts, problems } = evidence(SCRIPT);
  assert.deepEqual(problems, []);
  assert.deepEqual(claims.map((c) => [c.sceneTitle, c.who, c.sources.length, c.exempt]), [
    ['THE PROBLEM', 'CARD', 1, false],
    ['THE PROBLEM', 'NARRATOR', 2, false],
    ['A HUMAN DECIDES', 'NARRATOR', 0, false],
    ['A HUMAN DECIDES', 'NARRATOR', 0, true],
  ]);
  assert.equal(claims[0].text, 'Seventy-five photos, thirty-six pictures', 'a card\'s markdown heading marks are dropped');
  assert.deepEqual(claims[1].sources, ['Mike, 2026-10-23 16:11', 'README: img/s01..s24 had no reference photos']);
  assert.deepEqual(counts, { claims: 4, sourced: 2, exempt: 1, unsourced: 1 });
  assert.equal(summary({ counts }), '4 claims: 2 sourced, 1 not a claim, 1 with no source');
});

test('a source after a clip still backs the line before it, but not across a scene', () => {
  const script = '.ONE\n\nNARRATOR\nA thing happened.\n\nCLIP file:a.mp4\n\n[[src: the log]]\n\n.TWO\n\n[[src: stray]]\n';
  const { claims, problems } = evidence(script);
  assert.deepEqual(claims[0].sources, ['the log']);
  assert.deepEqual(problems.map((p) => p.message), ['[[src: stray]] follows no line or card, so it backs nothing']);
});

test('a note inside a speech is reported, because a reading would speak it', () => {
  const script = '.ONE\n\nNARRATOR\nA thing happened. [[src: the log]]\n';
  const { problems, claims } = evidence(script);
  assert.match(problems[0].message, /inside NARRATOR's speech would be read aloud/);
  assert.equal(claims[0].sources.length, 0);
  assert.match(spokenLines(parseFilm(script))[0].text, /\[\[src/, 'which is why: film.js reads it as words');
});

test('source notes are not spoken, so a script with sources reads exactly as before', () => {
  const bare = SCRIPT.replace(/\n\[\[[^\]]*\]\]\n/g, '\n');
  assert.deepEqual(spokenLines(parseFilm(SCRIPT)).map((l) => l.text), spokenLines(parseFilm(bare)).map((l) => l.text));
});

test('other notes are left alone', () => {
  const { claims, problems } = evidence('.ONE\n\nNARRATOR\nHello.\n\n[[Real photos, slow push-in.]]\n');
  assert.deepEqual(problems, []);
  assert.deepEqual(claims[0].sources, []);
});

test('toMarkdown writes the EVIDENCE.md table, with pipes escaped and missing sources in bold', () => {
  const md = toMarkdown(`${SCRIPT}\n.PIPES\n\nNARRATOR\nA | B\n\n[[src: x | y]]\n`, 'Evidence: Eric\'s album');
  assert.match(md, /^# Evidence: Eric's album\n\n5 claims: 3 sourced, 1 not a claim, 1 with no source\n/);
  assert.match(md, /\| A HUMAN DECIDES \| NARRATOR \| Then the computer stopped itself\. \| \*\*No source\*\* \|/);
  assert.match(md, /\| PIPES \| NARRATOR \| A \\\| B \| x \\\| y \|/);
});

// Just enough DOM for the ledger.
function fakeDocument() {
  const make = (tag) => ({
    tagName: tag.toUpperCase(), children: [], className: '', _text: '',
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
    set textContent(value) { this._text = value; this.children = []; },
    append(...nodes) { this.children.push(...nodes); },
    remove() { this.removed = true; },
  });
  return { createElement: make, container: () => ({ ...make('div'), ownerDocument: { createElement: make } }) };
}

const find = (node, className) => (node.className.split(' ').includes(className) ? [node] : []).concat(...node.children.map((c) => find(c, className)));

test('the ledger draws a row per claim, marks the ones with no source, and follows the editor', () => {
  const doc = fakeDocument();
  const container = doc.container();
  const view = mountVideoEvidence(container, SCRIPT, { document: doc });
  const root = container.children[0];
  assert.equal(find(root, 'soma-video-evidence-summary')[0].textContent, '4 claims: 2 sourced, 1 not a claim, 1 with no source');
  assert.equal(find(root, 'soma-video-evidence-missing').length, 1);
  assert.equal(find(root, 'soma-video-evidence-unsourced').length, 1);
  assert.equal(find(root, 'soma-video-evidence-sourced').length, 2);
  assert.match(find(root, 'soma-video-evidence-unsourced')[0].textContent, /Then the computer stopped itself\.No source$/);
  view.update(SCRIPT.replace('Then the computer stopped itself.\n', 'Then the computer stopped itself.\n\n[[src: thread, 16:22]]\n'));
  assert.equal(find(root, 'soma-video-evidence-unsourced').length, 0);
  assert.equal(find(root, 'soma-video-evidence-missing').length, 0);
  assert.equal(view.ledger.counts.unsourced, 0);
  view.update('');
  assert.match(root.textContent, /No lines or cards yet\./);
  view.destroy();
  assert.equal(root.removed, true);
});
