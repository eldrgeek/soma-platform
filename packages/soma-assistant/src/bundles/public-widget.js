/**
 * CLIENT_BUNDLE: public-widget.
 * Manifest-driven floating widget (FAB) mount. Wraps the soma-guide widget
 * (packages/soma-guide/soma-guide.js) and adds answer-from-content + optional TTS.
 * All config driven from the merged manifest's clientBundles['public-widget'] block.
 * Anonymous auth scope; no subscriber context crosses into this bundle.
 */

import { answerFromContent } from '../capabilities/answer-from-content.js';
import { guidedSiteDriving } from '../capabilities/guided-site-driving.js';
import { SomaVoice } from '../spine/voice.js';

/**
 * Mount the public widget on the current page.
 * @param {object} manifest - Merged manifest; reads clientBundles['public-widget'].
 * @param {object} [opts] - { container?: HTMLElement }
 * @returns {{unmount: () => void, ask: (q: string) => Promise<string>}}
 */
export function mountPublicWidget(manifest, opts = {}) {
  const bundle = manifest?.clientBundles?.['public-widget'];
  if (!bundle) throw new Error('mountPublicWidget: manifest has no public-widget bundle');

  const container = opts.container || (typeof document !== 'undefined' ? document.body : null);
  if (!container) throw new Error('mountPublicWidget: no DOM container available');

  const root = document.createElement('div');
  root.className = 'soma-assistant-fab';
  root.dataset.assistant = manifest.assistantId;
  container.appendChild(root);

  if (bundle.capabilities?.includes('guided-site-driving')) {
    guidedSiteDriving('status', { guide: manifest.guide }).catch(() => {});
  }

  return {
    /** Ask a grounded question; speaks the answer if tts modality is enabled. */
    async ask(q) {
      const { answer } = await answerFromContent(q, {
        assistant: manifest.assistantId,
        contextDoc: manifest.persona?.contextDoc,
        tenantId: manifest.tenantId,
      });
      if (bundle.modalities?.includes('tts') && manifest.persona?.voice_id) {
        SomaVoice.speak(answer, manifest.persona.voice_id).catch(() => {});
      }
      return answer;
    },
    unmount() {
      root.remove();
    },
  };
}
