// Proves the tests catch real breakage: each mutation below breaks one rule
// the studio depends on, and the suite must fail on every one. Runs on a
// copy of the package in a temp folder, so the source is never touched.
//
//   node scripts/mutation-check.mjs        (exit 0 only if every mutant is caught)
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MUTANTS = [
  ['src/logic.js', 'if (author.kind === \'human\') {\n    state.lastHumanSeq', 'if (true) {\n    state.lastHumanSeq', 'the team answers questions by number'],
  ['src/logic.js', ':(?!\\d)', ':', 'a time of day answers a question'],
  ['src/logic.js', "if (!question || question.status !== 'open') return null;\n  const text", "if (!question) return null;\n  const text", 'an answered question is answered again'],
  ['src/logic.js', 'question.status = \'answered\';', 'question.status = \'open\';', 'an answered question stays open'],
  ['src/logic.js', 'value > 0 && value <= state.msgSeq', 'value > 0', 'an agreement links to a message that does not exist'],
  ['src/logic.js', '> SESSION_GAP_MS', '> SESSION_GAP_MS * 100', 'a long silence does not start a new session'],
  ['src/logic.js', 'state.teamCursor = Math.min(reply.upTo, state.msgSeq);\n  }\n  const since', 'state.teamCursor = state.teamCursor;\n  }\n  const since', 'the team cursor never moves'],
  ['src/logic.js', "status: state.teamCursor >= state.lastHumanSeq ? 'idle' : 'waiting',\n    since: at,\n    upTo: state.teamCursor,\n    pickupMs", "status: 'idle',\n    since: at,\n    upTo: state.teamCursor,\n    pickupMs", 'the team reads idle while a message waits'],
  ['src/logic.js', 'if (same) return same;', '', 'duplicate open questions'],
  ['src/logic.js', 'agreement.history.push', 'void', 'a correction loses the old wording'],
  ['src/logic.js', 'canDecide ? parseAnswers(body) : []', 'parseAnswers(body)', 'a non-decider answers questions by number'],
  ['src/logic.js', 'const decided = (seq) => Number.isInteger(seq) && isDeciderMessage(seq);', 'const decided = () => true;', 'the team records an agreement nobody decided'],
  ['src/api.js', 'const isDecider = isMember && keys.some((key) => studio.deciders.includes(key));', 'const isDecider = isMember;', 'every member is a decider'],
  ['src/api.js', "return message?.author?.kind === 'human' && access(studio, message.author).isDecider;", 'return Boolean(message);', 'the team\'s own message counts as a decision'],
  ['src/api.js', 'const isMember = isHost || keys.some', 'const isMember = true || keys.some', 'anyone signed in gets in'],
  ['src/api.js', 'if (!role.isHost) throw', 'if (false) throw', 'members act as hosts'],
  ['src/api.js', 'return left.length === right.length && timingSafeEqual(left, right);', 'return true;', 'any team key is accepted'],
  ['src/api.js', 'await ping(studio.id, { team: true });', 'await ping(studio.id);', 'the team is not pinged when a person posts'],
  ['src/api.js', ".filter((message) => message.author?.kind === 'human')", '', 'the team is asked to answer itself'],
  ['src/api.js', 'dev ? config.devHosts', 'true ? config.devHosts', 'dev identities count on the live site'],
  ['src/api.js', "    try {\n      await broadcast(messages);\n    } catch (error) {\n      // A lost ping", "    {\n      await broadcast(messages);\n    } if (0) {\n      // A lost ping", 'a failed ping fails the request'],
  ['src/store.js', "if (stored) conditions = stored.etag ? { onlyIfMatch: stored.etag } : {};", 'if (stored) conditions = {};', 'concurrent writers overwrite each other'],
  ['src/store.js', "const STRONG = { consistency: 'strong' };", 'const STRONG = {};', 'reads are eventually consistent'],
  ['public/view.js', "'<': '&lt;',", "'<': '<',", 'markup from a message is rendered'],
  ['public/view.js', "if (waited > 20000) {", 'if (waited > 2e9) {', 'a stalled team is never reported'],
  ['public/view.js', 'names.add(String(entry.name))', 'void 0', 'presence shows nobody'],
  ['scripts/install.mjs', "await cp(from, resolve(out, 'vendor/soma-speech'), { recursive: true });", '', 'the speech component is not installed'],
];

const work = await mkdtemp(join(tmpdir(), 'studio-mutants-'));
for (const name of ['src', 'public', 'test', 'scripts', 'studios.js', 'package.json']) {
  await cp(join(root, name), join(work, name), { recursive: true });
}

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
for (const [file, from, to, meaning] of MUTANTS) {
  const path = join(work, file);
  const original = await readFile(path, 'utf8');
  if (!original.includes(from)) {
    console.log(`STALE  ${file}: mutant "${meaning}" no longer matches the source`);
    survivors += 1;
    continue;
  }
  await writeFile(path, original.replace(from, to));
  const passed = await suitePasses();
  await writeFile(path, original);
  console.log(`${passed ? 'SURVIVED' : 'caught  '} ${file}: ${meaning}`);
  if (passed) survivors += 1;
}
console.log(`${MUTANTS.length - survivors} of ${MUTANTS.length} mutants caught`);
process.exit(survivors ? 1 : 0);
