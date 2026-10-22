// Proves the tests catch real breakage: each mutation below loosens one rule
// the runtime enforces (most of them server checks of Puppet v0.3), and the
// suite must fail on every one. Runs on a copy of the package in a temp
// folder, so the source is never touched. A mutation of src/parser.js or
// src/render.js is applied to its browser copy too, so the test that the two
// match cannot be what catches it.
//
//   node scripts/mutation-check.mjs        (exit 0 only if every mutant is caught)
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'site/functions/api.mjs';

const MUTANTS = [
  // 1. Host-only screens
  ['src/parser.js', 'if(hostOwner(o))o.hostOnly=true;', '', 'no screen is host-only'],
  ['src/parser.js', [['if(o.hostOnly){cut(o);continue}', 'if(o.hostOnly){continue}'], ['||[...check.sketch.screens,...check.sketch.dialogs].some(o=>o.hostOnly)', '']], null, 'guests receive host-only screens'],
  ['src/parser.js', 'if(!named.has(name))cut(node);', '', 'guests receive private data and stub blocks'],
  ['src/parser.js', ".map(strip).join('\\n');", ".join('\\n');", 'guests receive comments'],
  ['src/parser.js', 'for(const story of sketch.stories)if(sketch.screens.find(s=>s.name===story.entry)?.hostOnly)cut(story);', '', 'guests receive stories about host-only screens'],
  ['src/parser.js', 'if(target?.hostOnly&&!el.hostOnly)errors.push', 'if(false)errors.push', 'a public button opens a host-only screen'],
  ['src/render.js', 'filter((screen) => !screen.hostOnly || host)', 'filter(() => true)', 'the page draws host-only screens for guests'],
  [API, "        if (!isHost) {\n          try {\n            source = guestSource", "        if (false) {\n          try {\n            source = guestSource", 'the server sends guests the full description'],
  [API, '        requireHost(config, await signedIn());\n        return json(await store.listVersions', '        return json(await store.listVersions', 'guests read version history'],
  [API, '    if (owner.hostOnly && !isHost) continue;', '', 'a guest sends a row only a host-only screen could send'],
  [API, " || route === 'feedback' || credentials) {", " || route === 'feedback') {", 'a publicRead host is treated as a guest'],
  // 2. My rows only
  [API, 'reader.id === config.hostId ? {} : { author: reader.id }', '{}', "a guest's GET returns everyone's rows"],
  ['src/store.js', '.filter((entry) => author === undefined || entry.author === author)', '.filter(() => true)', 'the memory store ignores the author filter'],
  ['src/blobs-store.js', '.filter((entry) => author === undefined || entry.author === author)', '.filter(() => true)', 'the blobs store ignores the author filter'],
  [API, "declaration.read === 'own' || (await store.privateData(appId)).includes(name)", "declaration.read === 'own'", 'privacy loosens with the live version'],
  ['src/store.js', '    rememberPrivacy(app, version.sketch);\n', '', 'the memory store forgets privacy on approve'],
  ['src/blobs-store.js', '      rememberPrivacy(app, parse(version.source).sketch);\n', '', 'the blobs store forgets privacy on approve'],
  [API, 'if (!declaration) throw new HttpError(404, `Unknown data: ${name}`);', 'if (!declaration) return json(await store.list(appId, name));', 'undeclared data is returned'],
  ['src/parser.js', "if(seen[name]?.has('host'))errors.push(", "if(false)errors.push(", 'host-only data may stay public'],
  ['src/store.js', 'privateRow ? `r-${crypto.randomUUID()}` : ', '', 'private rows get guessable ids'],
  ['src/store.js', '    if (privateRow) throw new Error(`Unknown row: ${entry.id}`);\n', '', "someone else's private row answers differently from a missing one"],
  // 3. Dates
  [API, 'return days === undefined || [].concat(days).includes(DAYS[date.getUTCDay()]);', 'return true;', 'a date on a wrong weekday is accepted'],
  [API, 'date.toISOString().slice(0, 10) !== value', 'false', 'a date that does not exist is accepted'],
  [API, "  if (field.roles.includes('@required') && !value.trim()) return false;\n", '', 'an empty @required value is accepted'],
  ['src/render.js', 'if (!date || !days.includes(WEEKDAYS[date.getUTCDay()]))', 'if (false)', 'the page sends a date on a wrong weekday'],
  // 4. Approve or decline
  ['src/store.js', "approval ? { ...structuredClone(row), status: 'pending' } : structuredClone(row)", 'structuredClone(row)', 'a new row does not start pending'],
  ['src/parser.js', "&&Object.hasOwn(a.row||{},'status'))errors.push", '&&false)errors.push', 'an adds-to sets status'],
  ['src/parser.js', "if(!el.hostOnly)errors.push({line:el.line,message:'Only the host sets status", "if(false)errors.push({line:el.line,message:'Only the host sets status", 'a status button everyone sees'],
  [API, '          requireHost(config, identity);\n          const input = await body(request);\n          if (!STATUSES', '          const input = await body(request);\n          if (!STATUSES', 'the API lets a guest set status'],
  ['src/store.js', '    this.#requireHost(appId, actor);\n    const app = this.#app(appId);\n    const current', '    const app = this.#app(appId);\n    const current', 'the memory store lets a guest set status'],
  ['src/blobs-store.js', '    this.#requireHost(appId, actor);\n    return this.#update(appId, (app) => {\n      const entry', '    return this.#update(appId, (app) => {\n      const entry', 'the blobs store lets a guest set status'],
  [API, '          if (!allowed) {', '          if (false) {', 'the host sets a status no action offers'],
  ['src/store.js', '  if (!STATUSES.includes(status)) {', '  if (false) {', 'a store accepts any status value'],
  ['src/store.js', "entry.row.status !== undefined && entry.row.status !== 'pending'", 'false', 'a guest removes a decided row'],
  [API, '            if (!visible) throw', '            if (false) throw', 'a guest removes rows with no remove action'],
];

// The site's functions import their neighbours in packages/ (soma-studio,
// soma-speech), so the copy sits beside links to them.
const folder = await mkdtemp(join(tmpdir(), 'puppet-mutants-'));
const work = join(folder, basename(root));
for (const name of ['src', 'site', 'test', 'examples', 'scripts', 'package.json']) {
  await cp(join(root, name), join(work, name), { recursive: true });
}
await symlink(join(root, 'node_modules'), join(work, 'node_modules'));
for (const entry of await readdir(dirname(root), { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name !== basename(root)) {
    await symlink(join(dirname(root), entry.name), join(folder, entry.name));
  }
}

const BROWSER_COPY = {
  'src/parser.js': 'site/public/vendor/puppet/parser.js',
  'src/render.js': 'site/public/vendor/puppet/render.js',
};

async function suitePasses() {
  try {
    await run(process.execPath, ['--test'], { cwd: work, timeout: 120000 });
    return true;
  } catch {
    return false;
  }
}

if (!(await suitePasses())) {
  console.error('The unmutated suite fails; fix it before checking mutants.');
  process.exit(2);
}

let survivors = 0;
// A mutant is [file, from, to, meaning]; several replacements are [file, [[from, to], ...], null, meaning].
for (const [file, from, to, meaning] of MUTANTS) {
  const pairs = Array.isArray(from) ? from : [[from, to]];
  const files = [file, ...(BROWSER_COPY[file] ? [BROWSER_COPY[file]] : [])];
  const originals = await Promise.all(files.map((name) => readFile(join(work, name), 'utf8')));
  const stale = pairs.find(([from]) => originals[0].split(from).length !== 2);
  if (stale) {
    console.log(`STALE    ${file}: mutant "${meaning}" does not match the source exactly once`);
    survivors += 1;
    continue;
  }
  for (const [index, name] of files.entries()) {
    await writeFile(join(work, name), pairs.reduce((text, [from, to]) => text.replace(from, to), originals[index]));
  }
  const passed = await suitePasses();
  for (const [index, name] of files.entries()) await writeFile(join(work, name), originals[index]);
  console.log(`${passed ? 'SURVIVED' : 'caught  '} ${file}: ${meaning}`);
  if (passed) survivors += 1;
}

await rm(folder, { recursive: true, force: true });
if (survivors) {
  console.log(`FAIL ${survivors} of ${MUTANTS.length} mutants survived or no longer match`);
  process.exit(1);
}
console.log(`PASS all ${MUTANTS.length} mutants were caught`);
