/* soma-play doc-import.js: bring a play in from a Google Doc, the Doc holding the pen.
 *
 *   import { mountDocImport } from './doc-import.js';
 *   mountDocImport(container, {
 *     google: { clientId, apiKey },          // PlayMaker's public Google settings, from the site's config
 *     send: (pull) => fetch(...),            // POST the pull { doc: { id, name }, scenes }; resolves to a Response
 *     last: () => fetch(...),                // GET this writer's last pull; resolves to a Response (JSON or null)
 *     withAct: false,                        // true when the data has an act field
 *     onPulled: () => {},                    // the rows changed; redraw
 *   });
 *
 * Every Google step is PlayMaker's own code (./playmaker/doc.js, bundled unchanged): its Google
 * sign-in and Picker (drive.file, the token held in memory for its hour), its Drive export of the Doc
 * as HTML, and importGoogleDocHtml, the converter PlayMaker's own Doc import uses. This file only cuts
 * the converted script into scenes (script.js splitScenes) and sends them. The app never writes to
 * the Doc.
 *
 * Written 2026-10-24 by Claude Opus 5.5 (CCc) for Mike Wolf, bead sp-l0w (GCT round 5).
 */
import { splitScenes } from './script.js';

const when = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export function mountDocImport(container, {
  document = container.ownerDocument,
  google = {},
  send,
  last = async () => null,
  withAct = false,
  onPulled = () => {},
  load = () => import('./playmaker/doc.js'),
} = {}) {
  const root = document.createElement('div');
  root.className = 'soma-doc-import';
  const status = document.createElement('p');
  status.className = 'soma-doc-import-status';
  status.setAttribute('role', 'status');
  const pull = document.createElement('button');
  pull.type = 'button';
  pull.className = 'puppet-runtime-button puppet-runtime-primary';
  const other = document.createElement('button');
  other.type = 'button';
  other.className = 'puppet-runtime-button puppet-runtime-ghost';
  other.textContent = 'Choose a different Doc';
  root.append(status, pull, other);
  container.append(root);

  let linked = null;
  let busy = false;
  const show = (message) => {
    pull.textContent = linked ? 'Pull again' : 'Bring in from Google Doc';
    other.hidden = !linked;
    status.textContent = message ?? (linked
      ? `Last updated ${when(linked.pulledAt)} from “${linked.name}” · ${linked.scenes} scene${linked.scenes === 1 ? '' : 's'}`
      : 'Your play comes from your Google Doc. You write in the Doc; this shows what it says.');
  };

  async function run(choose) {
    if (busy) return;
    if (!google.clientId) {
      show('Google Doc import is not set up on this site yet.');
      return;
    }
    busy = true;
    const view = document.defaultView ?? globalThis;
    view.__SOMA_GOOGLE_CLIENT_ID__ = google.clientId;
    view.__SOMA_GOOGLE_API_KEY__ = google.apiKey;
    let playmaker;
    try {
      playmaker = await load();
      const ref = choose || !linked ? await playmaker.pickGoogleDoc() : { id: linked.id, title: linked.name };
      if (!ref) {
        show(linked ? undefined : 'No Doc was chosen.');
        return;
      }
      show(`Reading “${ref.title}”…`);
      const html = await playmaker.exportDocAsHtml(ref.id);
      const { text } = playmaker.importGoogleDocHtml(html, ref.title);
      const scenes = splitScenes(text, { withAct, fallbackTitle: ref.title });
      if (!scenes.length) {
        show(`“${ref.title}” has no scenes in it. Nothing changed.`);
        return;
      }
      const response = await send({ doc: { id: ref.id, name: ref.title }, scenes });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        show(body.error ?? `The scenes could not be saved (${response.status}).`);
        return;
      }
      linked = body;
      show();
      onPulled(body);
    } catch (error) {
      show(playmaker?.translateGoogleFailure?.(error) ?? (error instanceof Error ? error.message : 'The Doc could not be read.'));
    } finally {
      busy = false;
    }
  }

  pull.addEventListener('click', () => run(false));
  other.addEventListener('click', () => run(true));
  show();
  Promise.resolve(last())
    .then(async (response) => (response && response.ok ? response.json() : null))
    .then((record) => {
      if (record && !busy) {
        linked = record;
        show();
      }
    })
    .catch(() => {});

  return {
    get linked() { return linked; },
    pull: () => run(false),
    destroy: () => root.remove(),
  };
}
