/**
 * SPINE: two-mode voice module.
 *   Mode 1 (TTS): speak() — ElevenLabs via el-proxy (server-side key, no key in client).
 *   Mode 2 (STT): listen() — browser Web Speech API (webkitSpeechRecognition).
 * Extracted from izzy-chat's baked-in TTS/STT.
 *
 * Voice latency note (spec A8): for text-first, serial relay is acceptable.
 * When voice becomes a production path, wire parallelDispatch() below.
 */

const EL_PROXY_URL = globalThis.SOMA_EL_PROXY_URL || '/el-proxy/tts';

export const SomaVoice = {
  /** @type {AudioContext|null} */
  _audioCtx: null,
  _recognition: null,

  /**
   * Speak text via el-proxy TTS.
   * @param {string} text - Text to synthesize.
   * @param {string} voiceId - ElevenLabs voice id (from manifest persona.voice_id).
   * @returns {Promise<void>} resolves when playback completes.
   */
  async speak(text, voiceId) {
    const res = await fetch(EL_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice_id: voiceId }),
    });
    if (!res.ok) throw new Error(`el-proxy TTS failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    this._audioCtx ||= new AudioContext();
    const audio = await this._audioCtx.decodeAudioData(buf);
    const src = this._audioCtx.createBufferSource();
    src.buffer = audio;
    src.connect(this._audioCtx.destination);
    return new Promise((resolve) => {
      src.onended = resolve;
      src.start();
    });
  },

  /**
   * Listen via Web Speech API STT.
   * @param {(transcript: string, isFinal: boolean) => void} onTranscript
   * @returns {{stop: () => void}} handle to stop recognition.
   */
  listen(onTranscript) {
    const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!SR) throw new Error('Web Speech API not available in this browser');
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      onTranscript(last[0].transcript, last.isFinal);
    };
    rec.start();
    this._recognition = rec;
    return { stop: () => rec.stop() };
  },

  /**
   * Parallel dispatch stub (spec A8 — voice production path).
   * Hit guide and assistant simultaneously; route faster/higher-confidence stream.
   * Not yet implemented; API is stable for future wiring without client rewrite.
   * @param {Array<() => Promise<string>>} sources
   * @returns {Promise<string>}
   */
  async parallelDispatch(sources) {
    return Promise.race(sources.map((fn) => fn()));
  },
};
