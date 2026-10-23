#!/usr/bin/env node
/* vm-board-notes: put an artist's notes, as they arrived by email or text, on a VideoMaker storyboard's cards.
 *
 *   node bin/vm-board-notes.mjs --board witness-and-stay-eric --by "Eric" notes.txt          # shows, sends nothing
 *   pbpaste | node bin/vm-board-notes.mjs --board witness-and-stay-eric --by "Eric" - --send
 *
 * Reads the notes (a file, or - for stdin), reads the board with the SOMA Studio team key
 * (~/.config/soma-studio/team.key), and prints which card each note lands on (src/notes.js), which it keeps,
 * and the lines that name no card. With --send it puts the notes on the cards as redo notes, signed with
 * --by, and asks for one batch redo of those scenes. That batch is always HELD: it runs on Mike's Mac only
 * after he presses "Let it run" on the board, because the notes are the artist's words, not his click.
 * Nothing else leaves the Mac; the notes go only to the board.
 *
 * Written 2026-10-23 by Claude Opus 5.5 (CCc) for Mike Wolf: "notes from eric and reroll fast".
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { notesToRedo, parseNotes } from '../src/notes.js';

export function options(argv) {
  const out = { send: false, site: process.env.VIDEOMAKER_SITE ?? 'https://soma-forge.netlify.app', app: 'videomaker', replace: false };
  const rest = [...argv];
  while (rest.length) {
    const arg = rest.shift();
    if (arg === '--board') out.board = rest.shift();
    else if (arg === '--by') out.by = rest.shift();
    else if (arg === '--site') out.site = rest.shift();
    else if (arg === '--send') out.send = true;
    else if (arg === '--replace') out.replace = true;
    else if (!out.file) out.file = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!out.board || !out.by || !out.file) throw new Error('Usage: vm-board-notes.mjs --board <board-id> --by "<whose notes>" <notes.txt | -> [--send] [--replace]');
  out.site = out.site.replace(/\/$/, '');
  return out;
}

/** What the notes would do to the board, as lines to print. */
export function summary(board, found) {
  const lines = [];
  const redo = notesToRedo(found);
  for (const n of found.notes) lines.push(`  ${n.scene}${n.keep ? ' (keep)' : ''}: ${n.note.replace(/\n/g, ' / ')}`);
  if (!found.notes.length) lines.push('  No line names a scene on this board.');
  for (const line of found.general) lines.push(`  On no card: ${line}`);
  lines.push(redo.length ? `Would redo ${redo.length} scene(s) in one held batch: ${redo.join(', ')}.` : 'Would ask for no redo.');
  return [`${board.title} (${board.scenes.length} scenes):`, ...lines];
}

async function main() {
  const opts = options(process.argv.slice(2));
  const text = readFileSync(opts.file === '-' ? 0 : opts.file, 'utf8');
  const key = readFileSync(process.env.STUDIO_TEAM_KEY_FILE ?? join(homedir(), '.config/soma-studio/team.key'), 'utf8').trim();
  const team = (path, init = {}) => fetch(`${opts.site}/api/app/${opts.app}/video-team/boards/${encodeURIComponent(opts.board)}${path}`, {
    ...init, headers: { 'x-studio-team-key': key, 'user-agent': 'vm-board-notes/1', ...(init.body ? { 'content-type': 'application/json' } : {}) },
  });
  const got = await team('');
  if (!got.ok) throw new Error(`Could not read the board: ${got.status} ${await got.text()}`);
  const board = await got.json();
  for (const line of summary(board, parseNotes(board, text))) console.log(line);
  if (!opts.send) {
    console.log('Nothing was sent. Run again with --send to put the notes on the cards.');
    return;
  }
  const sent = await team('/notes', { method: 'POST', body: JSON.stringify({ text, by: opts.by, replace: opts.replace }) });
  if (!sent.ok) throw new Error(`The notes were refused: ${sent.status} ${await sent.text()}`);
  const result = await sent.json();
  console.log(`Put ${result.notes.length} note(s) on the board.${result.job ? ` Batch ${result.job.id} (${result.job.scenes.join(', ')}) waits for Mike to let it run.` : ''}`);
  if (result.left?.length) console.log(`More than one batch holds: ask again for ${result.left.join(', ')}.`);
  console.log(`Open it: ${opts.site}/?app=${opts.app}&screen=Storyboards&board=${encodeURIComponent(opts.board)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
