/**
 * SOMA Onboard — join a new person to a SOMA app by invitation.
 *
 * Typical wiring in a consuming app (netlify/functions/_onboard.js):
 *
 *   import { createOnboard } from '@soma/onboard';
 *   export const { config, store, handlers, mount } = createOnboard({
 *     appId: 'vegas-connect',
 *     tablePrefix: 'vc',
 *     brandName: 'Vegas Connect',
 *     origin: 'https://vegas-connect.netlify.app',
 *     hostName: 'Sam Alvarez',
 *     roles: ['player', 'chapter_president', 'family', 'vendor', 'sponsor', 'other'],
 *   });
 */

import { defineOnboardConfig, tables, defaultRole, DEFAULT_CHANNELS } from './config.js';
import { createOnboardHandlers } from './handlers.js';
import { getSharedMemoryStore, createMemoryStore, resetSharedMemoryStore } from './store/memory.js';
import { mountNetlify, routeNetlify, toFetchHandler } from './netlify.js';

export { defineOnboardConfig, tables, defaultRole, DEFAULT_CHANNELS };
export { createOnboardHandlers };
export { createMemoryStore, getSharedMemoryStore, resetSharedMemoryStore };
export { mountNetlify, routeNetlify, toFetchHandler };
export { inviteUrl, parseInviteUrl, tagChannel, RELATIONSHIP_MAX_LENGTH } from './invite-link.js';
export {
  CHANNELS,
  CHANNEL_IDS,
  getChannel,
  channelTarget,
  channelTargets,
  composeInvite,
} from './channels.js';
export { createResendSender, createRecordingSender } from './senders/resend.js';
export { resetAbuseGuards } from './abuse.js';

/**
 * Everything an app needs, wired.
 *
 * Store selection: Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are
 * present, otherwise an in-memory store so `npm run dev` works on a laptop with
 * no cloud project. The memory store is per-process and forgets on restart —
 * that is correct for dev and catastrophic in production, so the returned
 * object reports which one it picked and `assertProductionReady()` refuses to
 * pass on memory.
 *
 * @param {Partial<import('./config.js').OnboardConfig>} configInput
 * @param {{ store?: any, sender?: any }} [deps]
 */
export function createOnboard(configInput, deps = {}) {
  const config = defineOnboardConfig(configInput);

  let store = deps.store;
  if (!store) {
    if (hasSupabaseEnv()) {
      // ESM cannot synchronously import the optional peer dependency, so the
      // Supabase path is explicit. Failing here beats silently serving real
      // invitations out of a memory store that forgets on the next cold start.
      throw new Error(
        'soma-onboard: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, so this app ' +
          'expects the Supabase store — pass it in, or use createOnboardAsync():\n' +
          "  import { createSupabaseStore } from '@soma/onboard/store/supabase';\n" +
          '  createOnboard(config, { store: createSupabaseStore(config) })'
      );
    }
    store = getSharedMemoryStore();
  }

  const handlers = createOnboardHandlers(config, { store, sender: deps.sender || null });

  return {
    config,
    store,
    handlers,
    mount: mountNetlify(handlers),
    route: routeNetlify(handlers),
    fetch: toFetchHandler(handlers),

    /** Throw unless this instance is safe to serve real invitations from. */
    assertProductionReady() {
      if (store.kind !== 'supabase') {
        throw new Error(
          `soma-onboard: refusing to run in production on the '${store.kind}' store. ` +
            'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
        );
      }
      return store.ensureReady();
    },
  };
}

/**
 * Same as createOnboard, but resolves the Supabase adapter itself when the env
 * is configured. Use this from a top-level `await` in a function module.
 *
 * @param {Partial<import('./config.js').OnboardConfig>} configInput
 * @param {{ store?: any, sender?: any }} [deps]
 */
export async function createOnboardAsync(configInput, deps = {}) {
  if (deps.store || !hasSupabaseEnv()) return createOnboard(configInput, deps);
  const config = defineOnboardConfig(configInput);
  const { createSupabaseStore } = await import('./store/supabase.js');
  return createOnboard(config, { ...deps, store: createSupabaseStore(config) });
}

function hasSupabaseEnv() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
