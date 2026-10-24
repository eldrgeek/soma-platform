// Proves the tests catch real breakage: each mutation below loosens one rule
// the runtime enforces (most of them server checks of Puppet v0.3), and the
// suite must fail on every one. Runs on a copy of the package in a temp
// folder, so the source is never touched. A mutation of src/parser.js or
// src/render.js is applied to its browser copy too, so the test that the two
// match cannot be what catches it.
//
//   node scripts/mutation-check.mjs        (exit 0 only if every mutant is caught)
//   node scripts/mutation-check.mjs --full (ignore the cache and run every mutant)
//
// Incremental: a caught mutant is remembered in .mutation-cache.json under a
// hash of the mutant, the file it changes and the test files that caught it
// (with the shared test helpers). While none of those change it is not run
// again. When they do, the tests that caught it last time run first, and the
// whole suite only if they no longer catch it. A survivor is never cached.
// MUTATION_FULL=1 is the same as --full.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'site/functions/api.mjs';
const PLAY = '../soma-play/server/stage-read.js';
const STUDIO = '../soma-video/server/studio.js';
const BOARDS = '../soma-video/server/boards.js';
const STORYBOARD = '../soma-video/src/storyboard.js';
const NOTES = '../soma-video/src/notes.js';

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
  [API, 'const level = stricter(declaration.read, (await store.privacyLevels(appId))[name]);\n        let rows;', 'const level = declaration.read;\n        let rows;', 'privacy loosens with the live version'],
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
  // Choice lists
  [API, '    return [].concat(field.props.items).map(String).includes(value);', '    return true;', 'a choice that is not one of the items is accepted'],
  ['src/render.js', "if (roles.includes('@select') && items.length) {", 'if (false) {', 'the page draws a choice list as a text box'],
  // Puppet v0.4: row screens, read: private, the token check
  ['src/parser.js', 'if(fromList||el.rowOf===target.from)opened.add(target.name);else errors.push(', 'opened.add(target.name);if(false)errors.push(', 'a row screen opens without a row'],
  ['src/parser.js', "Number.isNaN(version)||version>=0.4?errors:", "Number.isNaN(version)||version>=0.4?warnings:", 'an unfillable token is only a warning in v0.4'],
  ['src/parser.js', "if(!m||!o.from)errors.push({line:el.line,message:'stage-read reads one field", "if(false)errors.push({line:el.line,message:'stage-read reads one field", 'stage-read takes any text'],
  ['src/parser.js', "if((a.targetType==='dialog'||target?.from)&&target&&el.hostOnly&&!target.hostOnly)", "if(a.targetType==='dialog'&&target&&el.hostOnly&&!target.hostOnly)", 'a host-only screen opens a row screen everyone receives'],
  ['src/parser.js', "if(data.read==='private'&&data.fields?.includes('status'))errors.push(", 'if(false)errors.push(', 'private data has a status the host cannot read'],
  ['src/render.js', "          root.dataset.puppetRow = opened.id;\n", '', 'the page forgets which row a screen shows'],
  ['src/render.js', 'if (tabbed.length >= 2) {', 'if (tabbed.length >= 1) {', 'one tabbed screen draws a tab bar'],
  ['src/render.js', '    const brief = opensRow(element.hook) || buttons.some((child) => opensRow(child.hook));', '    const brief = false;', 'a list that opens row screens prints whole scenes'],
  ['src/render.js', "    if (row && name.startsWith('row.')) return String(row[name.slice(4)] ?? '');\n", '', 'a row screen leaves {row.field} unfilled'],
  [API, '          rows = await store.list(appId, name, { author: (await signedIn()).id });', '          rows = await store.list(appId, name);', 'the host reads private rows'],
  ['src/store.js', "  if (privateRow === 'private' && entry.author !== actor) throw new Error(`Unknown row: ${entry.id}`);\n", '', 'the host removes a private row'],
  ['src/store.js', '(app.private ??= {})[name] = stricter(app.private?.[name], declaration.read);', '(app.private ??= {})[name] = declaration.read;', 'a looser version lowers the remembered privacy'],
  [API, "          if (!isHost || level === 'private') {", '          if (!isHost) {', 'the host removes a private row with no remove action'],
  // Stage Read
  [API, '        const offered = [...sketch.screens, ...sketch.dialogs].some(', '        const offered = true || [...sketch.screens, ...sketch.dialogs].some(', 'Stage Read reads a field no stage-read offers'],
  [API, "            (!owner.hostOnly || reader.id === config.hostId) &&\n", '', "a guest hears a host-only screen's Stage Read"],
  [API, '        const { rows } = await readable(sketch, name);', '        const rows = await store.list(appId, name);', 'Stage Read speaks a row the reader may not read'],
  [API, "      if (limit !== undefined && next > limit) return false;\n", '', 'an allowance has no limit'],
  [API, "      if (stored) conditions = stored.etag ? { onlyIfMatch: stored.etag } : {};\n      const { modified } = await blobs.setJSON(key, Math.max(0, next), conditions);", "      if (stored) conditions = {};\n      const { modified } = await blobs.setJSON(key, Math.max(0, next), conditions);", 'parallel lines all pass one allowance'],
  [PLAY, '    if (chars > limits.perLine) return', '    if (false) return', 'a line of any length is spoken'],
  [PLAY, '    if (!(await store.reserve(personKey, chars, limits.perPerson))) {', '    if (false) {', "the person's allowance is not checked"],
  [PLAY, '    if (!(await store.reserve(appKey, chars, limits.perApp))) {', '    if (false) {', "the app's allowance is not checked"],
  [PLAY, "    if (!(await store.reserve(`${prefix}lines/${today}/${person}`, 1, limits.linesPerPerson))) {", '    if (false) {', 'lines per person are not counted'],
  [PLAY, '    const giveBack = () => Promise.all([store.release(personKey, chars), store.release(appKey, chars)]);', '    const giveBack = () => Promise.resolve();', 'a failed call keeps the characters'],
  [PLAY, '    const audioKey = `${prefix}audio/${person}/${sha(', '    const audioKey = `${prefix}audio/${sha(', 'the audio cache is shared between people'],
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
  // 5. Puppet v0.5: the script editor and the narration read
  [API, '          if (!editable) throw', '          if (false) throw', 'an edit changes a field no script-editor offers'],
  [API, '          if (value.length > MAX_EDIT_LENGTH) {', '          if (false) {', 'an edit of any length is stored'],
  [API, "          if (typeof field !== 'string' || typeof value !== 'string' || Object.keys(input).length !== 2) {", '          if (false) {', 'an edit stores a value that is not text'],
  ['src/store.js', '  if (entry.author !== actor) {\n    if (level) throw', '  if (false) {\n    if (level) throw', 'someone other than the author edits a row'],
  ['src/store.js', '    if (level) throw new Error(`Unknown row: ${entry.id}`);\n    throw new Error(\'Only the row author', '    throw new Error(\'Only the row author', "someone else's private script answers differently from a missing one"],
  [API, '            walk(owner.children).some((element) => element.kind === kind && element.field === field),', "            walk(owner.children).some((element) => ['stage-read', 'video-read'].includes(element.kind) && element.field === field),", 'a video-read answers as a stage-read'],
  ['src/parser.js', "if(!(version>=0.5))errors.push(", 'if(false)errors.push(', 'a v0.4 description uses v0.5 elements'],
  ['src/parser.js', "if(el.kind==='script-editor'&&m[1]==='status')errors.push(", 'if(false)errors.push(', 'a script-editor changes status'],
  ['src/render.js', '        drafts.set(key, area.value);\n', '', 'unsaved text is lost on a redraw'],
  ['src/render.js', "        for (const entry of mounted) if (entry.label === element.label) entry.view?.update?.(area.value);\n", '', 'the view does not follow the typing'],
  // Puppet v0.6: the team key, who may ask for a job, and who may see a script's assets.
  [API, "        if (!keyMatches(request.headers.get('x-studio-team-key'), teamKey)) throw new HttpError(401, 'The team key is required');\n", '', 'the team routes need no key'],
  [API, "  if (!expected || typeof given !== 'string' || !given) return false;", "  if (typeof given !== 'string') return false;", 'an empty key matches a site with no key'],
  [API, '          requireHost(config, reader);\n', '', 'anyone signed in may ask for a job'],
  [API, '        if (!offered.length) throw new HttpError(404, `No ${element} of ${name} here`);\n', '', 'assets and jobs without the element that offers them'],
  [API, '        if (!visible.some((candidate) => candidate.id === rowId)) throw new HttpError(404, `Unknown row: ${rowId}`);\n', '', "a reader sees another person's assets"],
  [API, "Object.keys(input).some((key) => !['step', 'note'].includes(key))", 'false', 'a job body may carry any field'],
  [STUDIO, "      if (!ASSET_NAME.test(name)) throw new Error('An asset name is letters, digits, dot, dash and underscore');\n", '', 'any asset name is stored'],
  [STUDIO, '      if (!ASSET_TYPES.has(type)) throw', '      if (false) throw', 'any asset type is stored'],
  [STUDIO, '      if (bytes.byteLength > MAX_ASSET_BYTES) throw', '      if (false) throw', 'an asset of any size is stored'],
  [STUDIO, "      if (!STEP_NAMES.includes(step)) throw", '      if (false) throw', 'a job of any step is queued'],
  [STUDIO, '.needsNote && !note.trim()) throw', '.needsNote && false) throw', 'an ask with no words is queued'],
  [STUDIO, "        if (['done', 'failed'].includes(job.status)) throw", '        if (false) throw', 'a finished job is reopened'],
  [STUDIO, '        if (open && !', '        if (false && !', 'finished jobs are handed to the team again'],
  [STUDIO, ' || done > total) {', ') {', 'progress past the end is stored'],
  [STUDIO, "          ...(progress !== undefined ? { progress: cleanProgress(progress) } : {}),\n", '', 'progress is dropped'],
  // v0.7 storyboards: who may open, change and run a board, and the team's part.
  [API, "        if (!boardsOffered) throw new HttpError(404, 'No storyboards here');\n", '', 'storyboards without the element that offers them'],
  [API, '          if (!role) throw new HttpError(404, `Unknown board: ${boardId}`);\n', '', 'anyone signed in opens a board'],
  [API, '.filter(roleIn);', ';', 'every board is listed to anyone'],
  [API, '              requireHost(config, reader); // only the host starts a board\n', '', 'anyone starts a board'],
  [API, '            requireHost(config, reader); // only the host lets a job run on the Mac\n', '', 'an artist lets a job run on the Mac'],
  [API, '              held: reader.id !== config.hostId,', '              held: false,', "an artist's job runs without the host"],
  [API, "            if (role !== 'owner') throw new HttpError(403", "            if (false) throw new HttpError(403", 'an artist deletes a board'],
  [API, "              if (!withBoards || !videoBoards) continue;", "              if (!videoBoards) continue;", 'an older worker is handed storyboard jobs'],
  [API, "            return json(await videoBoards.put(appId, { ...input, id: boardId }, { owner: config.hostId, by: 'the team' }), 201);", "            return json(await videoBoards.put(appId, { ...input, id: boardId }, { owner: input.owner, by: 'the team' }), 201);", 'a seeded board names its own owner'],
  [STORYBOARD, "      if (role !== 'owner') bad('Only the board\\'s owner chooses its artists');", '', 'an artist chooses the artists'],
  [STORYBOARD, "      if (role !== 'team') bad('Only the team on the Mac sends pictures');", '', 'anyone sends pictures'],
  [STORYBOARD, "  if (who.email && board.artists.includes(String(who.email).toLowerCase())) return 'artist';", "  if (who.email) return 'artist';", 'anyone with an email is an artist'],
  [STUDIO, "        if (job.status === 'held') throw", '        if (false) throw', 'the worker runs a held job'],
  [STUDIO, "      if (job.status !== 'held') throw", '      if (false) throw', 'a finished job is let run again'],
  [BOARDS, "      if (!ASSET_TYPES.has(type)) throw new BoardError", "      if (false) throw new BoardError", 'a board file of any type is stored'],
  // Fast notes and rerolls: notes become held batches; a keep note asks for nothing.
  [API, "{ by: { name: input.by.trim() }, role: 'team', held: true }", "{ by: { name: input.by.trim() }, role: 'team', held: false }", 'notes sent from the Mac run without the host'],
  [API, '{ by, role, held: reader.id !== config.hostId }), 201);', '{ by, role, held: false }), 201);', "an artist's notes run without the host"],
  [API, " || scenes.some((id) => !board.scenes.some((s) => s.id === id))) {", ') {', 'a batch names scenes that are not on the board'],
  [API, "            if (typeof input.by !== 'string' || !input.by.trim() || input.by.length > 120) throw new HttpError(400, 'Say whose notes these are as \"by\"');\n", '', 'notes from the Mac say nothing of whose they are'],
  [NOTES, 'notes.filter((n) => !n.keep).map', 'notes.map', 'a keep note asks for a redo'],
  [NOTES, "    if (line.startsWith('>')) continue;\n", '', 'quoted replies are read as notes'],
];

// The site's functions import their neighbours in packages/ (soma-studio,
// soma-speech), so the copy sits beside links to them.
const folder = await mkdtemp(join(tmpdir(), 'puppet-mutants-'));
const work = join(folder, basename(root));
for (const name of ['src', 'site', 'test', 'examples', 'scripts', 'package.json']) {
  await cp(join(root, name), join(work, name), { recursive: true });
}
await symlink(join(root, 'node_modules'), join(work, 'node_modules'));
// soma-play is copied, not linked, because its server half is mutated below;
// soma-video is copied with it, so its import of soma-play reaches the copy.
const COPIED = new Set(['soma-play', 'soma-video']);
for (const entry of await readdir(dirname(root), { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === basename(root)) continue;
  if (COPIED.has(entry.name)) {
    for (const name of ['src', 'server', 'package.json']) {
      await cp(join(dirname(root), entry.name, name), join(folder, entry.name, name), { recursive: true });
    }
  } else {
    await symlink(join(dirname(root), entry.name), join(folder, entry.name));
  }
}

const BROWSER_COPY = {
  'src/parser.js': 'site/public/vendor/puppet/parser.js',
  'src/render.js': 'site/public/vendor/puppet/render.js',
};

// Runs the given test files (none: the whole suite). Returns the files that failed; empty means it passed.
async function failingFiles(files = []) {
  const args = ['--test', '--test-reporter=./scripts/failing-files-reporter.mjs', '--test-reporter-destination=stdout', ...files];
  try {
    await run(process.execPath, args, { cwd: work, timeout: 120000 });
    return [];
  } catch (error) {
    const failed = String(error.stdout ?? '').split('\n').filter(Boolean);
    // A crash before any test reported still counts as a failure of the whole run.
    return failed.length ? failed : ['(the run)'];
  }
}

const suitePasses = async () => (await failingFiles()).length === 0;

const FULL = process.argv.includes('--full') || process.env.MUTATION_FULL === '1';
const CACHE = join(root, '.mutation-cache.json');
const cached = FULL ? {} : await readFile(CACHE, 'utf8').then(JSON.parse, () => ({}));
const nextCache = {};
const sha = (...parts) => {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(String(part)).update('\0');
  return hash.digest('hex');
};
const read = (name) => readFile(join(work, name), 'utf8').catch(() => '(missing)');
// Test files that are not tests themselves (fake-dom.js, studio-blobs.js) can change what any test sees.
const helpers = (await readdir(join(work, 'test'))).filter((name) => !name.endsWith('.test.js')).sort();
const helperHash = sha(...(await Promise.all(helpers.map((name) => read(join('test', name))))));
async function cacheKey(id, originals, by) {
  return sha(id, helperHash, ...originals, ...by, ...(await Promise.all(by.map(read))));
}

if (!(await suitePasses())) {
  console.error('The unmutated suite fails; fix it before checking mutants.');
  process.exit(2);
}

let survivors = 0;
let skipped = 0;
// A mutant is [file, from, to, meaning]; several replacements are [file, [[from, to], ...], null, meaning].
for (const mutant of MUTANTS) {
  const [file, from, to, meaning] = mutant;
  const pairs = Array.isArray(from) ? from : [[from, to]];
  const files = [file, ...(BROWSER_COPY[file] ? [BROWSER_COPY[file]] : [])];
  const originals = await Promise.all(files.map((name) => readFile(join(work, name), 'utf8')));
  const stale = pairs.find(([from]) => originals[0].split(from).length !== 2);
  if (stale) {
    console.log(`STALE    ${file}: mutant "${meaning}" does not match the source exactly once`);
    survivors += 1;
    continue;
  }
  const id = sha(JSON.stringify(mutant));
  const before = cached[id];
  if (before && before.key === (await cacheKey(id, originals, before.by))) {
    nextCache[id] = before;
    skipped += 1;
    console.log(`cached   ${file}: ${meaning}`);
    continue;
  }
  for (const [index, name] of files.entries()) {
    await writeFile(join(work, name), pairs.reduce((text, [from, to]) => text.replace(from, to), originals[index]));
  }
  // The tests that caught it last time first; the whole suite only if they no longer do.
  const earlier = (before?.by ?? []).filter((name) => name.endsWith('.test.js'));
  let by = earlier.length ? await failingFiles(earlier) : [];
  if (!by.length) by = await failingFiles();
  for (const [index, name] of files.entries()) await writeFile(join(work, name), originals[index]);
  const passed = by.length === 0;
  console.log(`${passed ? 'SURVIVED' : 'caught  '} ${file}: ${meaning}`);
  if (passed) survivors += 1;
  else if (by.every((name) => name.endsWith('.test.js'))) {
    nextCache[id] = { key: await cacheKey(id, originals, by), by, meaning };
  }
}

await rm(folder, { recursive: true, force: true });
// Only the current mutants are kept, so a removed or edited mutant leaves nothing behind.
await writeFile(CACHE, `${JSON.stringify(nextCache, null, 2)}\n`);
const ran = MUTANTS.length - skipped;
if (survivors) {
  console.log(`FAIL ${survivors} of ${MUTANTS.length} mutants survived or no longer match (${ran} run, ${skipped} cached)`);
  process.exit(1);
}
console.log(`PASS all ${MUTANTS.length} mutants were caught (${ran} run, ${skipped} cached unchanged)`);
