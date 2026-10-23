#!/usr/bin/env node
/* vm-board-seed: make a VideoMaker storyboard from a song project's image album, and (with --upload) send it.
 *
 *   node bin/vm-board-seed.mjs ~/Projects/witness-and-stay-song --id witness-and-stay-eric \
 *     --title "Witness and Stay (Eric)" --artist eric@example.com             # writes storyboard.json, sends nothing
 *   node bin/vm-board-seed.mjs ~/Projects/witness-and-stay-song --id witness-and-stay-eric --upload
 *
 * Reads, all relative to the project folder:
 *   eric-album/album.json              images[]: id, section, line, shot, references, prompt, "9x16", "16x9" (paths under eric-album/)
 *   build/kinetic/timings.json         [{ section, text, s, e, words }]: each scene starts at its lyric line
 *   build/kinetic/beats.json           { duration }: the song's length
 *   eric-shorts/*.json                 { audio, shots: [[id, seconds]], ...renderer settings }: one cut each (9:16)
 *   audio/<song>.mp3                   the song; a 96 kbps listening copy is made with ffmpeg when sent
 *   build/<name>/kinetic.json          the full song's kinetic-lyric-video build (a cut of every scene, 16:9)
 *   out/**\/<cut>.mp4                   an earlier render of a cut, whose time marks the cut up to date
 * and writes <project>/storyboard.json (the board as it would be sent). Nothing leaves the Mac without
 * --upload, which sends the board, every picture and the song to the site with the SOMA Studio team key
 * (~/.config/soma-studio/team.key), the same way the VideoMaker worker sends assets. The pictures and the
 * song are private files on the site, readable by the board's owner, the host and its artists only.
 *
 * Written 2026-10-23 by Claude Opus 5.5 (CCc) for Mike Wolf: "turn the Eric Album into a storyboard that
 * we can change, and this is the way that we do the videos in the future".
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { cleanBoard } from '../src/storyboard.js';

const MAX_BYTES = 4_500_000;
const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4' };

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const iso = (path) => statSync(path).mtime.toISOString();
/** Lower case, letters and digits only, so a lyric matches its timings line whatever the punctuation. */
const words = (text) => String(text ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Where a lyric line starts in the song: the timings line with the same words, else the one that starts with them. */
export function findLine(timings, line, from = 0) {
  const want = words(line);
  if (!want) return null;
  const at = (test) => timings.findIndex((entry, index) => index >= from && test(words(entry.text)));
  let index = at((text) => text === want);
  if (index < 0) index = at((text) => text.startsWith(want) || want.startsWith(text));
  if (index < 0 && from > 0) return findLine(timings, line, 0);
  return index < 0 ? null : { index, ...timings[index] };
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** The board for a project, with the local file behind every picture (files) and the song (song). */
export function boardFromProject(project, { id, title, artists = [], album = 'eric-album', at = new Date().toISOString() } = {}) {
  const albumDir = join(project, album);
  const albumJson = readJson(join(albumDir, 'album.json'));
  const timingsPath = join(project, 'build/kinetic/timings.json');
  const timings = existsSync(timingsPath) ? readJson(timingsPath) : [];
  const beatsPath = join(project, 'build/kinetic/beats.json');
  const duration = existsSync(beatsPath) ? readJson(beatsPath).duration ?? null : null;
  const files = {};
  const warnings = [];

  let from = 0;
  const scenes = (albumJson.images ?? albumJson.scenes ?? []).map((image) => {
    const found = findLine(timings, image.line, from);
    if (found) from = found.index;
    else if (image.line) warnings.push(`${image.id}: no timings line for "${image.line}"`);
    const scene = {
      id: image.id, section: image.section ?? '', lyric: image.line ?? '', shot: image.shot ?? '',
      refs: image.references ?? image.refs ?? [], prompt: image.prompt ?? '', start: found ? found.s : null, end: found ? found.e : null,
      note: '', pictures: {}, source: {},
    };
    for (const aspect of ['9x16', '16x9']) {
      if (!image[aspect]) continue;
      const path = join(albumDir, image[aspect]);
      if (!existsSync(path)) {
        warnings.push(`${image.id}: ${relative(project, path)} is missing`);
        continue;
      }
      const name = `${image.id}-${aspect}${extname(path).toLowerCase()}`;
      scene.pictures[aspect] = name;
      scene.source[aspect] = relative(project, path);
      files[name] = path;
      scene.changedAt = [scene.changedAt, iso(path)].filter(Boolean).sort().at(-1);
    }
    return scene;
  });
  // A scene lasts until the next one starts (in song order), the last until the song ends.
  const timed = scenes.filter((s) => typeof s.start === 'number').sort((a, b) => a.start - b.start);
  timed.forEach((scene, index) => {
    const next = timed[index + 1]?.start;
    scene.end = next !== undefined && next > scene.start ? next : (duration ?? scene.end);
  });

  const renders = walk(join(project, 'out')).filter((path) => path.endsWith('.mp4'));
  const renderOf = (name) => renders.filter((path) => basename(path, '.mp4') === name).map(iso).sort().at(-1) ?? null;
  // The full song is the project's kinetic-lyric-video build (build/<name>/kinetic.json, not build/kinetic,
  // which holds the timings); its render is out/**/<name>.mp4.
  const buildDir = join(project, 'build');
  const kinetic = existsSync(buildDir) ? readdirSync(buildDir).filter((n) => n !== 'kinetic' && existsSync(join(buildDir, n, 'kinetic.json'))).sort() : [];
  const full = kinetic.find((n) => n.endsWith(album.replace(/-album$/, ''))) ?? kinetic[0];
  if (kinetic.length > 1) warnings.push(`full song: several kinetic builds (${kinetic.join(', ')}); used ${full}`);
  const cuts = [{
    id: 'full', name: 'Full song', aspect: '16x9', all: true,
    spec: full ? { renderer: 'kinetic-lyric-video', build: `build/${full}` } : null,
    renderedAt: full ? renderOf(full) : null, changedAt: iso(join(albumDir, 'album.json')),
  }];
  const shortsDir = join(project, 'eric-shorts');
  for (const name of existsSync(shortsDir) ? readdirSync(shortsDir).filter((n) => n.endsWith('.json')).sort() : []) {
    const spec = readJson(join(shortsDir, name));
    const cutId = basename(name, '.json');
    const { shots = [], audio = [], ...settings } = spec;
    const known = new Set(scenes.map((s) => s.id));
    const missing = shots.filter(([scene]) => !known.has(scene)).map(([scene]) => scene);
    if (missing.length) warnings.push(`${cutId}: shots name scenes not on the board: ${missing.join(', ')}`);
    cuts.push({
      id: cutId.slice(0, 40),
      name: cutId.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()),
      aspect: '9x16',
      shots: shots.filter(([scene]) => known.has(scene)).map(([scene, seconds]) => ({ scene, seconds })),
      audio,
      spec: { renderer: 'eric-shorts/vshort.py', ...settings },
      renderedAt: renderOf(cutId),
      changedAt: iso(join(shortsDir, name)),
    });
  }

  const audioDir = join(project, 'audio');
  const song = existsSync(audioDir) ? readdirSync(audioDir).filter((n) => /\.(mp3|wav|flac)$/i.test(n) && !/instrumental|listen/i.test(n)).sort()[0] : null;
  const board = cleanBoard({
    id, title, project: `~/${relative(homedir(), project)}`, artists,
    song: { file: song ? 'song.mp3' : null, duration },
    scenes, cuts, orderChangedAt: iso(join(albumDir, 'album.json')),
  }, { at });
  return { board, files, song: song ? join(audioDir, song) : null, warnings };
}

/** A 96 kbps MP3 of the song, small enough for the site. */
function listenCopy(song) {
  const out = join(tmpdir(), `vm-board-song-${process.pid}.mp3`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', song, '-c:a', 'libmp3lame', '-b:a', '96k', out]);
  return out;
}

/** The file, or (macOS sips) a JPEG copy at most 1920 px on its long side when it is over the site's limit. */
function smallEnough(path) {
  if (statSync(path).size <= MAX_BYTES) return path;
  const out = join(tmpdir(), `vm-board-${basename(path, extname(path))}.jpg`);
  execFileSync('sips', ['-s', 'format', 'jpeg', '-Z', '1920', path, '--out', out], { stdio: 'ignore' });
  return out;
}

async function send({ site, app, key, board, files, song }) {
  const team = (path, init) => fetch(`${site}/api/app/${app}/video-team/boards/${encodeURIComponent(board.id)}${path}`, {
    ...init, headers: { 'x-studio-team-key': key, 'user-agent': 'vm-board-seed/1', ...init.headers },
  });
  const put = await team('', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(board) });
  if (!put.ok) throw new Error(`The board was refused: ${put.status} ${await put.text()}`);
  let sent = 0;
  const failed = [];
  const upload = async (name, path) => {
    const file = smallEnough(path);
    const response = await team(`/files/${encodeURIComponent(name)}`, { method: 'PUT', headers: { 'content-type': TYPES[extname(file).toLowerCase()] }, body: readFileSync(file) });
    if (response.ok) sent += 1;
    else failed.push(`${name}: ${response.status}`);
  };
  if (song) await upload('song.mp3', listenCopy(song));
  for (const [name, path] of Object.entries(files)) await upload(name, path);
  return { sent, failed };
}

function options(argv) {
  const out = { artists: [], upload: false, site: process.env.VIDEOMAKER_SITE ?? 'https://soma-forge.netlify.app', app: 'videomaker', album: 'eric-album' };
  const rest = [...argv];
  while (rest.length) {
    const arg = rest.shift();
    if (arg === '--id') out.id = rest.shift();
    else if (arg === '--title') out.title = rest.shift();
    else if (arg === '--artist') out.artists.push(rest.shift());
    else if (arg === '--album') out.album = rest.shift();
    else if (arg === '--site') out.site = rest.shift();
    else if (arg === '--upload') out.upload = true;
    else if (!out.project) out.project = resolve(arg.replace(/^~(?=\/)/, homedir()));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!out.project || !out.id) throw new Error('Usage: vm-board-seed.mjs <project-folder> --id <board-id> [--title T] [--artist email]… [--album eric-album] [--upload]');
  out.title ??= basename(out.project);
  return out;
}

async function main() {
  const opts = options(process.argv.slice(2));
  const { board, files, song, warnings } = boardFromProject(opts.project, opts);
  writeFileSync(join(opts.project, 'storyboard.json'), `${JSON.stringify(board, null, 1)}\n`);
  console.log(`${board.title}: ${board.scenes.length} scenes, ${board.cuts.length} cuts (${board.cuts.map((c) => c.id).join(', ')}), ${Object.keys(files).length} pictures${song ? ', the song' : ''}.`);
  console.log(`Wrote ${join(opts.project, 'storyboard.json')}.`);
  for (const warning of warnings) console.log(`Check: ${warning}`);
  if (!opts.upload) {
    console.log('Nothing was sent. Run again with --upload to send the board, its pictures and the song to VideoMaker.');
    return;
  }
  const keyFile = process.env.STUDIO_TEAM_KEY_FILE ?? join(homedir(), '.config/soma-studio/team.key');
  const { sent, failed } = await send({ site: opts.site.replace(/\/$/, ''), app: opts.app, key: readFileSync(keyFile, 'utf8').trim(), board, files, song });
  console.log(`Sent the board and ${sent} file(s).${failed.length ? ` Could not send: ${failed.join('; ')}` : ''}`);
  console.log(`Open it: ${opts.site.replace(/\/$/, '')}/?app=${opts.app}&screen=Storyboards&board=${encodeURIComponent(board.id)}`);
  if (failed.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
