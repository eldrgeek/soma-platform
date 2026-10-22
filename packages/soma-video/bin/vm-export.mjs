#!/usr/bin/env node
// vm-export: a VideoMaker script -> the two files soma-cut renders.
//
//   vm-export <script.txt | -> <out-dir> [--name film]
//   vm-export --app-json <app.json | -> --title "<script title>" <out-dir> [--name film]
//
// Writes <out-dir>/<name>.fountain (the script without its CAST block) and <out-dir>/<name>.cast.json
// (each narrator's ElevenLabs voice), then prints the checks a writer should fix. With --app-json it
// reads the Puppet runtime's stored app (Netlify Blobs key apps/videomaker.json, the store the live
// app writes) and takes the row of `scripts` whose title matches, so the render starts from the
// script as it is in the app. Then render with soma-cut:
//   node ~/Projects/soma-cut/tools/render-script.mjs <out-dir>/<name>.fountain --out <name>.mp4
//
// Written 2026-10-22 by Claude Opus 5.5 (CCc) for Mike Wolf, bead sp-go2.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { checks, clock, estimate, parseFilm, toSomaCut } from '../src/film.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  if (at === -1) return undefined;
  const [value] = args.splice(at, 2).slice(1);
  return value;
};
const name = flag('--name') ?? 'film';
const appJson = flag('--app-json');
const title = flag('--title');
const read = (path) => readFileSync(path === '-' ? 0 : path, 'utf8');

let text;
if (appJson) {
  const app = JSON.parse(read(appJson));
  const rows = (app.rows?.scripts ?? []).filter((entry) => !title || entry.row.title === title);
  if (rows.length !== 1) {
    console.error(`vm-export: found ${rows.length} scripts${title ? ` titled "${title}"` : ''}; name one with --title`);
    process.exit(2);
  }
  text = rows[0].row.text;
  console.error(`vm-export: script ${rows[0].id} "${rows[0].row.title}", ${text.length} characters`);
} else {
  if (args.length < 2) {
    console.error('usage: vm-export <script.txt | -> <out-dir> [--name film]  |  vm-export --app-json <file> --title <t> <out-dir>');
    process.exit(2);
  }
  text = read(args.shift());
}
const outDir = args[0];
if (!outDir) {
  console.error('vm-export: name an output folder');
  process.exit(2);
}

const { fountain, cast } = toSomaCut(text);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${name}.fountain`), fountain);
writeFileSync(join(outDir, `${name}.cast.json`), `${JSON.stringify(cast, null, 2)}\n`);
const blocks = parseFilm(text);
const { scenes, total } = estimate(blocks);
console.log(`${join(outDir, `${name}.fountain`)}: ${scenes.length} scenes, about ${clock(total)}`);
console.log(`${join(outDir, `${name}.cast.json`)}: ${cast.map((c) => `${c.name}=${c.note.split(' ')[0]}`).join(', ')}`);
for (const problem of checks(blocks)) console.log(`check: ${problem}`);
