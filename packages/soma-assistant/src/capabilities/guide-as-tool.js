/**
 * CAPABILITY: guide-as-tool — the delegate seam (spec A5 / section 5b).
 * Lets a persona assistant consult or hand control to the guide.
 *
 * Two modes:
 *   'consult-and-relay' — seam.resolve() returns the guide's answer; the
 *     caller MUST relay it with buildRelayWithCitation() so the persona never
 *     claims guide knowledge as its own (persona-safety constraint, spec 5c).
 *   'take-over' — seam.activate() returns a client directive; the client
 *     bundle switches the user into guide-driven interaction.
 *
 * Mode selection is determined by intent classification (app-howto → consult-and-relay;
 * app-demo → take-over). The seam boundary is the enforcement point.
 *
 * Voice parallel dispatch (spec A8): when voice is a production path, wire
 * seam.resolveParallel() via SomaVoice.parallelDispatch() instead of resolve().
 */

import { ask } from '../spine/inference.js';

/**
 * Create a delegate seam to the guide.
 * @param {object} guideConfig - { question?, context?, tourId?, auditTrace? }
 * @param {object} tenantPolicy - tenantPolicy.* from app manifest (immutable by subscriber).
 * @param {object} session - SessionSupervisor session (attribution source).
 * @param {'consult-and-relay'|'take-over'} mode
 * @returns {Promise<{mode: string, resolve: () => Promise<string>, activate: () => object}>}
 */
export async function delegate(guideConfig, tenantPolicy, session, mode) {
  if (!['consult-and-relay', 'take-over'].includes(mode)) {
    throw new Error(`delegate: unknown mode "${mode}"`);
  }
  if (tenantPolicy?.guideDelegation === false) {
    throw new Error('delegate: tenantPolicy forbids guide delegation');
  }
  return {
    mode,
    /** consult-and-relay: ask the guide, return answer for cited relay. */
    async resolve() {
      if (mode !== 'consult-and-relay') throw new Error('resolve() only valid in consult-and-relay mode');
      const { answer } = await ask(guideConfig.question, {
        ...guideConfig.context,
        tenantId: session.tenant_id,
        sessionId: session.session_id,
        source: 'guide-relay',
      });
      return answer;
    },
    /** take-over: client directive to switch user into guide-driven interaction. */
    activate() {
      if (mode !== 'take-over') throw new Error('activate() only valid in take-over mode');
      return {
        directive: 'guide-take-over',
        tourId: guideConfig.tourId ?? null,
        session_id: session.session_id,
        auditTrace: guideConfig.auditTrace ?? null,
      };
    },
  };
}

/**
 * Persona-safety constraint (spec 5c).
 * Guide answers MUST be cited verbatim; the persona may frame but not rewrite.
 * buildRelayWithCitation() produces the relay prompt enforcing this.
 * @param {object} persona - { name } from merged manifest.
 * @param {string} answer - guide answer from seam.resolve().
 * @returns {string} relay prompt with citation block.
 */
export function buildRelayWithCitation(persona, answer) {
  return [
    `SYSTEM: You are ${persona.name}. When a GUIDE ANSWER block is present, you MUST cite it`,
    `verbatim or paraphrase only with explicit attribution. You may not omit, contradict,`,
    `or silently substitute guide answers. Persona voice applies to framing only.`,
    ``,
    `GUIDE ANSWER [verbatim — do not rephrase]:`,
    answer,
  ].join('\n');
}
