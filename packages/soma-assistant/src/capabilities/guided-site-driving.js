/**
 * CAPABILITY: guided-site-driving.
 * Delegates to the soma-guide walkthrough engine (packages/soma-guide).
 * This capability does NOT reimplement walkthroughs — it is the typed seam
 * through which an assistant bundle starts/stops/steps guide tours.
 * guide.* block in the manifest is NOT subscriber-overridable.
 */

export const CAPABILITY_ID = 'guide-relay';

const VALID_ACTIONS = ['start', 'stop', 'next', 'prev', 'goto', 'status'];

/**
 * Drive the soma-guide walkthrough engine.
 * @param {'start'|'stop'|'next'|'prev'|'goto'|'status'} action
 * @param {object} config - {
 *   tourId?: string,       // which walkthrough (for start/goto)
 *   stepIndex?: number,    // for goto
 *   guide?: object,        // guide.* block from app manifest (NOT subscriber-overridable)
 * }
 * @returns {Promise<{ok: boolean, action: string, state: object}>}
 */
export async function guidedSiteDriving(action, config = {}) {
  if (!VALID_ACTIONS.includes(action)) {
    throw new Error(`guidedSiteDriving: unknown action "${action}"`);
  }
  const engine = globalThis.SomaGuide;
  if (!engine) {
    return { ok: false, action, state: { error: 'soma-guide engine not present' } };
  }
  switch (action) {
    case 'start': return { ok: true, action, state: engine.start(config.tourId) };
    case 'stop': return { ok: true, action, state: engine.stop() };
    case 'next': return { ok: true, action, state: engine.next() };
    case 'prev': return { ok: true, action, state: engine.prev() };
    case 'goto': return { ok: true, action, state: engine.goto(config.tourId, config.stepIndex) };
    case 'status': return { ok: true, action, state: engine.status() };
    default: throw new Error(`guidedSiteDriving: unhandled action "${action}"`);
  }
}
