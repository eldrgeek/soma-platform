'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('manifest names Adrian', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert.equal(m.name, 'Adrian');
  assert.ok(m.content_scripts[0].js.includes('vendor/soma-assist-core.js'));
  assert.ok(m.content_scripts[0].js.includes('content.js'));
});

test('vendor core exposes createAssistChip', () => {
  const src = fs.readFileSync(path.join(ROOT, 'vendor/soma-assist-core.js'), 'utf8');
  assert.ok(src.includes('createAssistChip'));
  assert.ok(src.includes('soma-assist'));
});

test('content.js brands Adrian', () => {
  const src = fs.readFileSync(path.join(ROOT, 'content.js'), 'utf8');
  assert.ok(src.includes("title: 'Adrian'"));
  assert.ok(!/SOMA Guide/.test(src));
});
