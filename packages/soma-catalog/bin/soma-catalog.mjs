#!/usr/bin/env node
// soma-catalog build             write catalog.json (records only, no pins, so it changes only when a record does)
// soma-catalog check             exit 1 when a record is invalid or catalog.json is out of date
// soma-catalog show [query]      print the catalog with live pins from the component store, optionally filtered
// soma-catalog skeleton <spec>   write a starting app from a Designer's spec (JSON file, or - for stdin)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, buildCatalog, catalog, find, loadRecords, pinsFromManifest, skeleton, validateRecord } from '../src/index.mjs';

const [command = 'show', arg] = process.argv.slice(2);
const OUT = join(ROOT, 'catalog.json');
const text = (doc) => `${JSON.stringify(doc, null, 2)}\n`;

if (command === 'build') {
  writeFileSync(OUT, text(catalog(loadRecords())));
  console.log(`wrote ${OUT}`);
} else if (command === 'check') {
  const records = loadRecords();
  const problems = records.flatMap((r) => validateRecord(r).errors);
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {}
  if (current !== text(catalog(records))) problems.push('catalog.json is out of date; run: npm run build (in packages/soma-catalog)');
  problems.forEach((p) => console.log(p));
  if (problems.length) process.exit(1);
  console.log(`catalog in order: ${records.length} words`);
} else if (command === 'show') {
  const doc = await buildCatalog();
  if (arg) doc.components = find(doc.components, arg);
  process.stdout.write(text(doc));
} else if (command === 'skeleton') {
  const spec = JSON.parse(readFileSync(arg === '-' || !arg ? 0 : arg, 'utf8'));
  const result = skeleton(spec, { pins: await pinsFromManifest() });
  for (const e of result.errors) console.error(`error line ${e.line}: ${e.message}`);
  for (const w of result.warnings) console.error(`warning line ${w.line}: ${w.message}`);
  if (result.source) process.stdout.write(result.source);
  if (result.errors.length) process.exit(1);
} else {
  console.error('usage: soma-catalog build | check | show [query] | skeleton <spec.json|->');
  process.exit(2);
}
