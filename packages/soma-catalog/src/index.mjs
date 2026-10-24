// The SOMA component catalog: one record per Puppet word, in components/<word>.json.
// A Designer AI reads catalog.json (or buildCatalog() with live pins) to choose
// words, then skeleton() writes a starting app that the real parser accepts.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { parse } from '../../soma-puppet-runtime/src/parser.js';
import { PINNABLE, MANIFEST, readManifest } from '../../soma-puppet-runtime/scripts/vendor-store.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..');
export const REPO = resolve(ROOT, '../..');
export const COMPONENTS = join(ROOT, 'components');
export const schema = JSON.parse(readFileSync(join(ROOT, 'schema/soma-component-v1.schema.json'), 'utf8'));
export { PINNABLE };

const validator = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

// { valid, errors }: errors are 'word: /path message' sentences.
export function validateRecord(record) {
  const valid = validator(record);
  const name = record?.word ?? '(no word)';
  return { valid, errors: valid ? [] : validator.errors.map((e) => `${name}: ${e.instancePath || '/'} ${e.message}`) };
}

export function loadRecords(dir = COMPONENTS) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

const num = (v) => Number.parseFloat(v);
export const latestVersion = (records) => records.map((r) => r.since).sort((a, b) => num(a) - num(b)).at(-1);

// The parts of the grammar a Designer needs besides the words. Roles are checked against the parser by test.
export const GRAMMAR = {
  roles: ['@primary', '@secondary', '@danger', '@ghost', '@voice', '@ai', '@inert', '@required', '@multiline', '@select', '@toggle', '@text', '@date', '@top', '@bottom', '@left', '@right', '@main', '@center', '@overlay', '@top-right', '@bottom-right', '@modal'],
  tokens: {
    '{me.name}': 'the signed-in person\'s name; anywhere',
    '{Name.count}': 'rows of declared data Name this reader can read',
    '{form.Label}': 'what was typed in the field labelled Label on the same screen or dialog',
    '{row.field}': 'a field of the row, only on a screen from data, never in an adds to',
  },
  actions: [
    'opens screen "Name"', 'opens dialog "Name"', 'closes self', 'closes dialog "Name"', 'back', 'toast "Words"',
    'adds to data { field: "value" }', 'removes from data', 'sets status "confirmed"|"declined" (host-only screen, button in a list)',
    'starts host "Name"', 'sets field "Label" = "value"', 'goto story "Name"', 'no-op',
  ],
  blocks: {
    puppet: 'puppet "Title" version "0.x" (first line)',
    uses: 'uses <component>@<12-hex hash>: pin a shared component build (top level)',
    app: 'app "Name" { promise: "...", requires: signin }',
    data: 'data name { fields: [a, b], read: own|private }; own = the host reads all, private = everyone only their own',
    screen: 'screen "Name" { ... }; requires: host makes it host-only; screen "Name" from data shows one row and needs a list or table of that data to open it, never first',
    dialog: 'dialog "Name" { ... } opened by opens dialog',
    stub: 'stub name { {a: "x"} } fake rows',
  },
};

// Pins come from the component store's manifest (packages/soma-puppet-runtime/scripts/vendor-store.mjs):
// the latest published build of each pinnable component. A word with no component has no pin.
export async function pinsFromManifest(path = MANIFEST) {
  const manifest = await readManifest(path);
  return Object.fromEntries(PINNABLE.filter((c) => manifest[c]?.latest).map((c) => [c, manifest[c].latest]));
}

// The catalog document. With pins, each record with a component gains pin: { component, hash, uses }.
export function catalog(records = loadRecords(), pins = null) {
  const components = records.map((r) => {
    if (!pins) return r;
    const hash = r.component ? pins[r.component] ?? null : null;
    return { ...r, pin: r.component ? { component: r.component, hash, uses: hash ? `uses ${r.component}@${hash}` : null } : null };
  });
  return {
    catalog: 'soma-component/1',
    about: 'Every Puppet Script word: what it does, where it may go, what it reads and writes, its routes and who may call them, and the shared component that draws it. Pins name the latest published build; an app with no pin loads the latest.',
    grammarVersion: latestVersion(records),
    grammar: GRAMMAR,
    pinnable: PINNABLE,
    components,
  };
}

export async function buildCatalog({ pins = true } = {}) {
  return catalog(loadRecords(), pins ? await pinsFromManifest() : null);
}

// Search for a Designer: every term must match the word, a tag, or the summary.
export function find(records, query = '') {
  const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return records.filter((r) => terms.every((t) => r.word.includes(t) || r.tags.includes(t) || r.summary.toLowerCase().includes(t)));
}

const fill = (template, { data, field, rowScreen }) =>
  template.replaceAll('$data', data).replaceAll('$field', field).replaceAll('$rowScreen', rowScreen);
const indent = (snippet, by = '  ') => snippet.split('\n').map((l) => by + l).join('\n');

// A small app that holds one record's template in its placement, used by the tests to prove each record's
// metadata against the real parser. Pass placement to put it somewhere else on purpose.
export function exampleApp(record, { version = '0.7', placement = record.placement } = {}) {
  const snippet = fill(record.template, { data: 'items', field: 'text', rowScreen: 'Item' });
  const home = placement === 'row' ? '' : `\n${indent(snippet)}`;
  const row = placement === 'row' ? `\n${indent(snippet)}` : '';
  return `puppet "Catalog example" version "${version}"

data items {
  fields: [title, text]
}

screen "Home" {
  field "Title"
  list "Items" from items -> opens screen "Item"${home}
}

screen "Item" from items {
  hero { title: "{row.title}" }${row}
}

dialog "About" {
  text "About this app"
}
`;
}

const label = (name) => name.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());

/* An app skeleton from a Designer's choices:
   { title, promise?, data: { name, fields, read? }, home: [words], row: [words], rowField?, pin? }
   The home screen lists the data and has a field per one-line field plus Add; the row screen shows one row
   with the chosen row words. Returns { source, errors, warnings } from the real parser, plus refusals for
   words that are unknown or placed where they cannot go. */
export function skeleton(spec, { records = loadRecords(), pins = {} } = {}) {
  const byWord = new Map(records.map((r) => [r.word, r]));
  const refusals = [];
  const { name, fields, read } = spec.data ?? {};
  if (!/^[a-z][\w-]*$/.test(name ?? '')) refusals.push('data.name must be a plain lower-case name, such as scenes');
  if (!Array.isArray(fields) || !fields.length) refusals.push('data.fields must list at least one field');
  if (read !== undefined && !['own', 'private'].includes(read)) refusals.push('data.read is own or private, or left out');
  const rowField = spec.rowField ?? (fields?.includes('text') ? 'text' : fields?.at(-1));
  const pick = (words, where) =>
    (words ?? []).flatMap((w) => {
      const r = byWord.get(w);
      if (!r) return refusals.push(`${w} is not a Puppet word in the catalog`), [];
      if (r.placement === 'row' && where === 'home') return refusals.push(`${w} goes only on the row screen`), [];
      if (r.placement === 'screen' && where === 'row') return refusals.push(`${w} goes only on a screen that is not from data`), [];
      return [r];
    });
  const home = pick(spec.home, 'home');
  const row = pick(spec.row, 'row');
  if (refusals.length) return { source: null, errors: refusals.map((message) => ({ line: 0, message })), warnings: [] };

  const used = [...home, ...row];
  const version = latestVersion([{ since: '0.4' }, ...used]);
  const uses = spec.pin ? [...new Set(used.map((r) => r.component).filter((c) => c && pins[c]))].map((c) => `uses ${c}@${pins[c]}`) : [];
  const plural = label(name);
  const singular = label(spec.singular ?? name.replace(/s$/, ''));
  const ctx = { data: name, field: rowField, rowScreen: singular };
  const short = fields.filter((f) => f !== rowField || !row.length);
  const formFields = short.map((f) => `  field "${label(f)}"${f === fields[0] ? ' @required' : ''}${f === 'text' ? ' @multiline' : ''}`);
  const assign = short.map((f) => `${f}: "{form.${label(f)}}"`).join(', ');
  const longField = row.length && rowField ? [`  field "${label(rowField)}" @multiline`] : [];
  const longAssign = row.length && rowField ? `, ${rowField}: "{form.${label(rowField)}}"` : '';
  const source = [
    `puppet "${spec.title}" version "${version}"`,
    ...uses,
    '',
    `app "${spec.title}" {`,
    ...(spec.promise ? [`  promise: "${spec.promise}"`] : []),
    '  requires: signin',
    '}',
    '',
    `data ${name} {`,
    `  fields: [${fields.join(', ')}]`,
    ...(read ? [`  read: ${read}`] : []),
    '}',
    '',
    `screen "${plural}" {`,
    `  hero { title: "${spec.title}", subtitle: "Hello, {me.name}." }`,
    `  list "${plural}" from ${name} empty: "Nothing yet. Add the first one below."${row.length ? ` -> opens screen "${singular}"` : ''}`,
    ...formFields,
    ...longField,
    `  button "Add" @primary -> adds to ${name} { ${assign}${longAssign} } ; toast "Added"`,
    ...home.map((r) => indent(fill(r.template, ctx))),
    '}',
    ...(row.length
      ? ['', `screen "${singular}" from ${name} {`, `  hero { title: "{row.${fields[0]}}" }`, ...row.map((r) => indent(fill(r.template, ctx))), `  button "Delete" @danger -> removes from ${name}`, '}']
      : []),
    '',
    'dialog "About" {',
    '  text "About this app"',
    '}',
    '',
  ].join('\n');
  const { errors, warnings } = parse(source);
  return { source, errors, warnings, version, uses };
}
