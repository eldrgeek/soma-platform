/* soma-play play-view.js: one scene drawn read-only in Diana's script format: PlayMaker's script editor in its read-only profile.
 *
 *   import { mountPlayView } from './play-view.js';
 *   const view = mountPlayView(container, sceneText);
 *   view.highlight(blockIndex);   // Stage Read's spotlight; null clears it
 *
 * Diana's house format is PlayMaker's default (playmaker docs/PLAYMAKER-FORMAT.md, src/lib/houseStyle.ts,
 * src/features/scenes/dianaDraft3.css): Times New Roman 11 pt at 1.15 line height; the character cue
 * flush left in capitals, not bold, with the speech under it in the same paragraph; parentheticals in
 * italics on their own line; narrative directions in italics two inches in; technical cues (lights,
 * sound, blackout) at the margin in plain type; US Letter pages, one-inch margins. On a screen narrower
 * than a page the pages are scaled down whole, so the layout keeps its proportions.
 *
 * Written 2026-10-22 by Claude Opus 5.5 (CCc) for Mike Wolf, bead sp-u4x.
 */
import { parseScript } from './script.js';

const STYLE_ID = 'soma-play-style';
const CSS = `
.soma-play { --soma-play-font: "Times New Roman", Tinos, "Liberation Serif", Times, serif; overflow: hidden; }
.soma-play-pages { transform-origin: top left; width: 8.5in; }
.soma-play-page { box-sizing: border-box; width: 8.5in; height: 11in; padding: 1in; margin: 0 0 16px; overflow: hidden;
  background: #fff; color: #1b1b1b; box-shadow: 0 1px 4px #0003; font-family: var(--soma-play-font); font-size: 11pt; line-height: 1.15; }
.soma-play-page:last-child { margin-bottom: 0; }
.soma-play-heading { margin: 0 0 10pt; font-size: 14pt; font-weight: 400; break-after: avoid; }
.soma-play-speech { margin: 0 0 10pt; }
.soma-play-cue { text-transform: uppercase; font-weight: 400; }
.soma-play-paren { font-style: italic; }
.soma-play-direction { margin: 0 0 10pt 2in; font-style: italic; }
.soma-play-direction.soma-play-technical { margin-left: 0; font-style: normal; }
.soma-play-spotlight { background: rgb(245 158 11 / 0.12); box-shadow: inset 3px 0 0 rgb(245 158 11 / 0.85); border-radius: 2px; }
.soma-play-empty { font-family: var(--soma-play-font); color: #66768a; }
.soma-play-profile { margin: 0 0 6px; font: 12px/1.3 system-ui, -apple-system, sans-serif; color: #66768a; letter-spacing: 0.02em; }
`;

function installStyle(document) {
  if (!document.head || document.getElementById?.(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

function element(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function blockNode(document, block) {
  if (block.type === 'heading') return element(document, 'h3', 'soma-play-heading', block.text);
  if (block.type === 'direction') {
    return element(document, 'p', `soma-play-direction${block.technical ? ' soma-play-technical' : ''}`, block.text);
  }
  const paragraph = element(document, 'p', 'soma-play-speech');
  paragraph.append(element(document, 'span', 'soma-play-cue', block.role ? `${block.character} ${block.role}` : block.character));
  for (const line of block.lines) {
    paragraph.append(document.createElement('br'));
    paragraph.append(line.kind === 'parenthetical'
      ? element(document, 'span', 'soma-play-paren', line.text)
      : document.createTextNode ? document.createTextNode(line.text) : element(document, 'span', '', line.text));
  }
  return paragraph;
}

// Moves blocks onto a new page when the page they are on overflows. Without layout (no
// scrollHeight, as in tests) everything stays on one page.
function paginate(document, pages, nodes) {
  let page = element(document, 'div', 'soma-play-page');
  pages.append(page);
  for (const node of nodes) {
    page.append(node);
    if (page.scrollHeight > page.clientHeight && page.children.length > 1) {
      node.remove();
      page = element(document, 'div', 'soma-play-page');
      pages.append(page);
      page.append(node);
    }
  }
}

export function mountPlayView(container, text, { document = container.ownerDocument } = {}) {
  installStyle(document);
  const blocks = parseScript(text);
  // play-view is PlayMaker's script editor in its read-only profile (GRAMMAR-v0.10 section 3),
  // and the page says so.
  const profile = element(document, 'p', 'soma-play-profile', 'PlayMaker editor · read-only');
  const root = element(document, 'div', 'soma-play');
  container.append(profile, root);
  if (!blocks.length) {
    root.append(element(document, 'p', 'soma-play-empty', 'No script yet.'));
    return { blocks, highlight() {}, destroy: () => { profile.remove(); root.remove(); } };
  }
  const pages = element(document, 'div', 'soma-play-pages');
  root.append(pages);
  const nodes = blocks.map((block) => blockNode(document, block));
  paginate(document, pages, nodes);
  // Scale the pages down whole when the screen is narrower than a page.
  const fit = () => {
    const width = root.clientWidth;
    const page = pages.firstChild?.offsetWidth;
    if (!width || !page) return;
    const scale = Math.min(1, width / page);
    pages.style.transform = scale < 1 ? `scale(${scale})` : '';
    root.style.height = scale < 1 ? `${pages.offsetHeight * scale}px` : '';
  };
  fit();
  const view = document.defaultView;
  view?.addEventListener?.('resize', fit);
  let lit = null;
  return {
    blocks,
    highlight(index) {
      lit?.classList?.remove('soma-play-spotlight');
      lit = index === null || index === undefined ? null : nodes[index] ?? null;
      lit?.classList?.add('soma-play-spotlight');
      lit?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    },
    destroy() {
      view?.removeEventListener?.('resize', fit);
      profile.remove();
      root.remove();
    },
  };
}
