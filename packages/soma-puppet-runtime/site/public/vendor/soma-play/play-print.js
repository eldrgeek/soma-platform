/* soma-play play-print.js: a scene or the whole play as a PDF in Diana's format.
 *
 *   import { mountPlayPrint } from './play-print.js';
 *   mountPlayPrint(container, { getText: () => sceneText, title: 'Witness Projection' });
 *
 * The PDF is made by PlayMaker's own PDF writer (./playmaker/print.js, bundled unchanged:
 * fountainToStagePlay, then stagePlayDocumentToPdf with pdf-lib, house style diana-wyenn): a title
 * page, the cast (the characters who speak), then US Letter script pages numbered from the first
 * script page. This file only turns soma-play's script text into the Fountain that writer reads
 * (script.js toFountain) and opens the PDF. It runs in the page and prints only text the page has.
 *
 * Written 2026-10-24 by Claude Opus 5.5 (CCc) for Mike Wolf, bead sp-l0w (GCT round 5).
 */
import { toFountain } from './script.js';

const fileName = (title) => `${String(title || 'Play').replace(/[^\w .,'’()-]+/g, ' ').trim() || 'Play'}.pdf`;

export function mountPlayPrint(container, {
  getText,
  title = 'Play',
  document = container.ownerDocument,
  load = () => import('./playmaker/print.js'),
} = {}) {
  const root = document.createElement('div');
  root.className = 'soma-play-print';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'puppet-runtime-button';
  button.textContent = 'Print (PDF)';
  const status = document.createElement('span');
  status.className = 'soma-play-print-status';
  status.setAttribute('role', 'status');
  root.append(button, status);
  container.append(root);

  let lastUrl = null;
  button.addEventListener('click', async () => {
    const view = document.defaultView;
    // Opened at once, inside the click, so the browser lets it through; the PDF goes in when ready.
    const tab = view?.open?.('', '_blank') ?? null;
    status.textContent = 'Making the PDF…';
    try {
      const text = String(getText?.() ?? '').trim();
      if (!text) throw new Error('There is nothing to print yet.');
      const { scriptToPdf } = await load();
      const bytes = await scriptToPdf(toFountain(text), { title });
      if (lastUrl) view?.URL?.revokeObjectURL?.(lastUrl);
      lastUrl = view.URL.createObjectURL(new view.Blob([bytes], { type: 'application/pdf' }));
      if (tab) {
        tab.location.href = lastUrl;
        status.textContent = 'The PDF opened in a new tab. Print it or save it from there.';
      } else {
        const link = document.createElement('a');
        link.href = lastUrl;
        link.download = fileName(title);
        root.append(link);
        link.click();
        link.remove();
        status.textContent = 'The PDF was downloaded.';
      }
    } catch (error) {
      tab?.close?.();
      status.textContent = error instanceof Error ? error.message : 'The PDF could not be made.';
    }
  });

  return {
    destroy() {
      if (lastUrl) document.defaultView?.URL?.revokeObjectURL?.(lastUrl);
      root.remove();
    },
  };
}
