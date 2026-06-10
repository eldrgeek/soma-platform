/**
 * CLIENT_BUNDLE: subscriber-chat.
 * <soma-full-chat> web component — full-page persona chat for authenticated
 * subscribers. Extracted shape of izzy-chat's SPA. Wires spine voice (TTS+STT)
 * and persona-conversation. Transcripts default per manifest; guide-as-tool
 * client side is handled by detecting the 'guide-take-over' directive response.
 */

import { personaChat } from '../capabilities/persona-conversation.js';
import { SomaVoice } from '../spine/voice.js';

export class SomaFullChat extends HTMLElement {
  constructor() {
    super();
    this.messages = [];
    this.manifest = null;
    this.bundle = null;
  }

  /** @param {object} manifest - merged manifest (app + subscriber override). */
  configure(manifest) {
    this.manifest = manifest;
    this.bundle = manifest.clientBundles?.['subscriber-chat'];
  }

  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <div class="soma-chat">
        <div class="soma-chat-log" part="log"></div>
        <form class="soma-chat-input" part="input">
          <input type="text" name="q" autocomplete="off" placeholder="Type a message…" />
          <button type="submit">Send</button>
        </form>
      </div>`;
    this.shadowRoot.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = this.shadowRoot.querySelector('input');
      if (input.value.trim()) this.send(input.value.trim());
      input.value = '';
    });
  }

  /**
   * Send a user turn through persona-conversation.
   * Handles guide-take-over directives: dispatches a 'soma-guide:take-over' custom event
   * so the host page's soma-guide integration can intercept and activate the walkthrough.
   * @param {string} text
   * @returns {Promise<string>} assistant reply text.
   */
  async send(text) {
    this.messages.push({ role: 'user', content: text });
    const result = await personaChat(
      this.manifest.assistantId, this.messages, this.manifest, false,
    );
    if (result.directive === 'guide-take-over') {
      this.dispatchEvent(new CustomEvent('soma-guide:take-over', { detail: result, bubbles: true }));
      return '';
    }
    const { reply } = result;
    this.messages.push({ role: 'assistant', content: reply });
    if (this.bundle?.modalities?.includes('tts') && this.manifest.persona?.voice_id) {
      SomaVoice.speak(reply, this.manifest.persona.voice_id).catch(() => {});
    }
    return reply;
  }

  /** Begin STT dictation; sends final transcript as a chat turn. */
  startListening() {
    if (!this.bundle?.modalities?.includes('stt')) throw new Error('stt modality disabled in manifest');
    return SomaVoice.listen((transcript, isFinal) => {
      this.shadowRoot.querySelector('input').value = transcript;
      if (isFinal) this.send(transcript);
    });
  }
}

/** Register the <soma-full-chat> custom element (idempotent). */
export function registerSubscriberChat() {
  if (typeof customElements !== 'undefined' && !customElements.get('soma-full-chat')) {
    customElements.define('soma-full-chat', SomaFullChat);
  }
}
