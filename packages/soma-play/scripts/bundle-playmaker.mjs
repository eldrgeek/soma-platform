// Bundles two parts of PlayMaker, unchanged, into plain browser modules for soma-play:
//   src/playmaker/print.js  PlayMaker's PDF writer (fountainToStagePlay + stagePlayDocumentToPdf, pdf-lib)
//   src/playmaker/doc.js    PlayMaker's Google Doc reading (Google sign-in, Picker, Drive export)
//                              and its Doc-to-Fountain conversion (importGoogleDocHtml)
// Each bundle starts with the PlayMaker commit it was built from, and vendor/PROVENANCE.json
// records the commit, the entry points and each bundle's sha256. They sit in src/ so the Puppet
// runtime's component store publishes them with the rest of soma-play.
//
//   node scripts/bundle-playmaker.mjs [--playmaker ~/Projects/playmaker] [--ref origin/master]
//
// It reads PlayMaker's source with `git archive <ref> src` (it never touches PlayMaker's working
// tree) and uses PlayMaker's installed esbuild and node_modules. Written 2026-10-24 by Claude Opus
// 5.5 (CCc) for Mike Wolf, bead for GCT round 5 ("Reuse PlayMaker's code; don't rewrite it").
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const playmaker = resolve(arg('--playmaker', join(homedir(), 'Projects/playmaker')));
const ref = arg('--ref', 'origin/master');
const commit = execFileSync('git', ['-C', playmaker, 'rev-parse', ref], { encoding: 'utf8' }).trim();

const work = mkdtempSync(join(tmpdir(), 'soma-play-pm-'));
execFileSync('sh', ['-c', `git -C "${playmaker}" archive ${commit} src | tar -x -C "${work}"`]);

const esbuild = join(playmaker, 'node_modules/.bin/esbuild');
const out = join(here, 'src/playmaker');
mkdirSync(out, { recursive: true });
const banner = `/* Bundled from PlayMaker (eldrgeek/playmaker) commit ${commit} by packages/soma-play/scripts/bundle-playmaker.mjs. Do not edit: rebuild. */`;
const bundles = [
  { entry: 'entry-print.ts', file: 'print.js' },
  { entry: 'entry-doc.ts', file: 'doc.js' },
];
const provenance = { playmaker: 'eldrgeek/playmaker', commit, builtWith: 'esbuild', bundles: [] };
for (const { entry, file } of bundles) {
  execFileSync(esbuild, [
    join(here, 'playmaker', entry),
    '--bundle',
    '--format=esm',
    '--platform=browser',
    '--target=es2020',
    '--minify',
    '--legal-comments=none',
    `--alias:@=${join(work, 'src')}`,
    '--define:import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID=globalThis.__SOMA_GOOGLE_CLIENT_ID__',
    '--define:import.meta.env.VITE_GOOGLE_API_KEY=globalThis.__SOMA_GOOGLE_API_KEY__',
    `--define:import.meta.env.DEV=false`,
    `--define:import.meta.env.PROD=true`,
    `--define:import.meta.env.MODE="production"`,
    '--define:import.meta.env={}',
    `--banner:js=${banner}`,
    `--outfile=${join(out, file)}`,
  ], { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, NODE_PATH: join(playmaker, 'node_modules') }, cwd: playmaker });
  const bytes = readFileSync(join(out, file));
  provenance.bundles.push({ entry: `playmaker/${entry}`, file: `src/playmaker/${file}`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
writeFileSync(join(out, 'PROVENANCE.json'), `${JSON.stringify(provenance, null, 2)}\n`);
rmSync(work, { recursive: true, force: true });
console.log(JSON.stringify(provenance, null, 2));
