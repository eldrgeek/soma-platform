/**
 * CLIENT_BUNDLE: voice-first-agent.
 * ElevenLabs Conversational AI agent embed (the bill-talk / iris-talk pattern).
 * The agent itself lives at ElevenLabs; this bundle mounts the convai widget
 * and bridges session attribution back to the spine via data attributes.
 */

/**
 * Mount an ElevenLabs voice-first agent widget.
 * @param {object} manifest - Merged manifest; reads clientBundles['voice-first-agent']
 *   which must carry { agentId }.
 * @param {object} [opts] - { container?: HTMLElement }
 * @returns {{unmount: () => void, agentId: string}}
 */
export function mountVoiceFirstAgent(manifest, opts = {}) {
  const bundle = manifest?.clientBundles?.['voice-first-agent'];
  if (!bundle?.agentId) {
    throw new Error('mountVoiceFirstAgent: manifest bundle missing agentId');
  }
  const container = opts.container || document.body;

  if (!document.querySelector('script[data-soma-convai]')) {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
    script.async = true;
    script.dataset.somaConvai = 'true';
    document.head.appendChild(script);
  }

  const el = document.createElement('elevenlabs-convai');
  el.setAttribute('agent-id', bundle.agentId);
  el.dataset.assistant = manifest.assistantId;
  el.dataset.tenant = manifest.tenantId;
  container.appendChild(el);

  return {
    agentId: bundle.agentId,
    unmount() {
      el.remove();
    },
  };
}
