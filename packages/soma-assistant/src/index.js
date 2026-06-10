/**
 * @soma-platform/soma-assistant — barrel export.
 *
 * Layers:
 *   SPINE         — inference, voice, session supervision, transcripts, identity
 *   CAPABILITIES  — answer-from-content, persona-conversation, guided-site-driving,
 *                   guide-as-tool (delegate seam), feedback-channel
 *   CLIENT_BUNDLES — public-widget, subscriber-chat, voice-first-agent
 *   MANIFEST      — loader, merge contract, validation
 */

// SPINE
export { ask, chat } from './spine/inference.js';
export { SomaVoice } from './spine/voice.js';
export { SessionSupervisor } from './spine/session-supervisor.js';
export { validateTranscript, appendToPulseCore, TRANSCRIPT_SCHEMA_VERSION } from './spine/transcripts.js';
export { resolveAuth } from './spine/identity-stub.js';

// CAPABILITIES
export { answerFromContent } from './capabilities/answer-from-content.js';
export { personaChat } from './capabilities/persona-conversation.js';
export { guidedSiteDriving } from './capabilities/guided-site-driving.js';
export { delegate, buildRelayWithCitation } from './capabilities/guide-as-tool.js';
export { feedbackChannel } from './capabilities/feedback-channel.js';

// CLIENT_BUNDLES
export { mountPublicWidget } from './bundles/public-widget.js';
export { SomaFullChat, registerSubscriberChat } from './bundles/subscriber-chat.js';
export { mountVoiceFirstAgent } from './bundles/voice-first-agent.js';

// MANIFEST
export { loadAndMergeConfig } from './manifest/loader.js';
export { mergeManifests, MERGE_CONTRACT } from './manifest/merge.js';
export { validateManifest, validateSubscriberOverride } from './manifest/validate.js';
