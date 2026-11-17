/* soma-video evidence.js: every claim a video script makes, next to its source. A making-of film tells a
 * true story, so each narrator line and each card is a claim that needs a source, unless the script says
 * it is not one. This replaces the hand-written EVIDENCE.md beside each draft.
 *
 * In the script, a source is a Fountain note in its own paragraph after the line or card it backs:
 *
 *   NARRATOR
 *   Mike had a shared album: seventy-five photos.
 *
 *   [[src: eric-album/originals/INDEX.md]]
 *
 * Several [[src: ...]] notes may follow one claim. [[not a claim]] marks a line that needs none (a feeling,
 * a question, the hook). A note inside the speech itself would be read aloud, so it is reported, not used.
 *
 * Written 2026-10-24 by Claude Opus 5.5 for Mike Wolf, from the component scouts' top Making-of idea.
 */
import { parseFilm } from './film.js';

const SOURCE = /^src:\s*(.+)$/i;
const NOT_A_CLAIM = /^not a claim$/i;
const INLINE_NOTE = /\[\[.*?\]\]/;

const words = (block) =>
  block.type === 'speech'
    ? block.lines.filter((line) => line.kind === 'words').map((line) => line.text).join(' ').trim()
    : block.body.map((line) => line.replace(/^#+\s*/, '')).join(' ').trim();

/**
 * { claims, problems, counts } for a script. Each claim: { blockIndex, scene, sceneTitle, who, text,
 * sources, exempt }. who is the narrator, or CARD. Problems: { blockIndex, message }.
 */
export function evidence(text) {
  const blocks = parseFilm(text);
  const claims = [];
  const problems = [];
  let sceneTitle = '';
  let open = null;
  blocks.forEach((block, blockIndex) => {
    if (block.type === 'scene') {
      sceneTitle = block.text;
      open = null;
      return;
    }
    if (block.type === 'note') {
      const source = block.text.match(SOURCE);
      if (!source && !NOT_A_CLAIM.test(block.text)) return;
      if (!open) {
        problems.push({ blockIndex, message: `[[${block.text}]] follows no line or card, so it backs nothing` });
        return;
      }
      if (source) open.sources.push(source[1].trim());
      else open.exempt = true;
      return;
    }
    const isClaim = block.type === 'speech' || (block.type === 'visual' && block.kind === 'CARD');
    if (!isClaim) return;
    if (block.type === 'speech' && block.lines.some((line) => INLINE_NOTE.test(line.text))) {
      problems.push({ blockIndex, message: `A note inside ${block.character}'s speech would be read aloud; put it in its own paragraph after the speech` });
    }
    const said = words(block);
    if (!said) {
      open = null;
      return;
    }
    open = { blockIndex, scene: block.scene ?? 0, sceneTitle, who: block.type === 'speech' ? block.character : 'CARD', text: said, sources: [], exempt: false };
    claims.push(open);
  });
  const sourced = claims.filter((c) => c.sources.length).length;
  const exempt = claims.filter((c) => !c.sources.length && c.exempt).length;
  return { claims, problems, counts: { claims: claims.length, sourced, exempt, unsourced: claims.length - sourced - exempt } };
}

/** One line for the top of the ledger: "12 claims: 9 sourced, 2 not claims, 1 with no source". */
export function summary({ counts }) {
  const parts = [`${counts.sourced} sourced`];
  if (counts.exempt) parts.push(`${counts.exempt} not ${counts.exempt === 1 ? 'a claim' : 'claims'}`);
  parts.push(counts.unsourced ? `${counts.unsourced} with no source` : 'none without a source');
  return `${counts.claims} ${counts.claims === 1 ? 'claim' : 'claims'}: ${parts.join(', ')}`;
}

/** The ledger as Markdown, the shape of the EVIDENCE.md files it replaces. */
export function toMarkdown(text, title = 'Evidence') {
  const ledger = evidence(text);
  const cell = (value) => String(value).replace(/\|/g, '\\|');
  const rows = ledger.claims.map((c) => `| ${cell(c.sceneTitle)} | ${cell(c.who)} | ${cell(c.text)} | ${c.sources.length ? c.sources.map(cell).join('; ') : c.exempt ? '(not a claim)' : '**No source**'} |`);
  return [`# ${title}`, '', summary(ledger), '', '| Scene | Who | Claim | Source |', '|---|---|---|---|', ...rows, ''].join('\n');
}

export function mountVideoEvidence(container, text, { document = container.ownerDocument } = {}) {
  const root = document.createElement('div');
  root.className = 'soma-video-evidence';
  container.append(root);
  const el = (tag, className, words) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (words !== undefined) node.textContent = words;
    return node;
  };

  function draw(source) {
    root.textContent = '';
    const ledger = evidence(source);
    root.append(el('p', ledger.counts.unsourced ? 'soma-video-evidence-summary soma-video-evidence-missing' : 'soma-video-evidence-summary', summary(ledger)));
    for (const problem of ledger.problems) root.append(el('p', 'soma-video-evidence-problem', problem.message));
    if (!ledger.claims.length) {
      root.append(el('p', 'soma-video-evidence-empty', 'No lines or cards yet.'));
      return ledger;
    }
    const table = el('table', 'soma-video-evidence-table');
    const head = el('tr');
    for (const name of ['Scene', 'Who', 'Claim', 'Source']) head.append(el('th', '', name));
    table.append(head);
    for (const claim of ledger.claims) {
      const row = el('tr', claim.sources.length ? 'soma-video-evidence-sourced' : claim.exempt ? 'soma-video-evidence-exempt' : 'soma-video-evidence-unsourced');
      row.append(el('td', '', claim.sceneTitle), el('td', '', claim.who), el('td', '', claim.text));
      const cell = el('td');
      if (claim.sources.length) for (const s of claim.sources) cell.append(el('div', 'soma-video-evidence-source', s));
      else cell.textContent = claim.exempt ? 'Not a claim' : 'No source';
      row.append(cell);
      table.append(row);
    }
    root.append(table);
    return ledger;
  }

  let ledger = draw(text);
  return {
    get ledger() {
      return ledger;
    },
    update(next) {
      ledger = draw(next);
    },
    destroy() {
      root.remove();
    },
  };
}
