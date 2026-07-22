/**
 * The one seam every consuming app touches.
 *
 * SOMA-APP-STANDARD §15b (federation over convergence): apps do NOT share
 * storage. Each app keeps its own `<tablePrefix>_members` / `_sessions` /
 * `_connections` tables in its own Supabase project. This config is what makes
 * a fork of the *engine* unnecessary — the prefix and the brand strings are
 * data, not code.
 */

/** @typedef {'contact_only'|'active'|'deactivated'} MemberStatus */

/**
 * @typedef {object} OnboardConfig
 * @property {string} appId            lowercase id used in tags/board cards, e.g. 'vegas-connect'
 * @property {string} tablePrefix      db table prefix WITHOUT trailing underscore, e.g. 'vc'
 * @property {string} brandName        human display name, e.g. 'Vegas Connect'
 * @property {string} origin           canonical public origin, e.g. 'https://vegas-connect.netlify.app'
 * @property {string} joinPath         path prefix for invite links (default '/j')
 * @property {string} purposeOneLiner  one sentence an invitee reads before joining
 * @property {string} hostName         human host, e.g. 'Greg Foster'
 * @property {string} virtualHostName  AI host, e.g. "V'Greg"
 * @property {string[]} roles          allowed member roles; first is the default
 * @property {string[]} relationships  suggested relationship labels for the picker
 * @property {string[]} channels       enabled invite channels (see channels.js)
 * @property {boolean} requireConsent  invitee must tick consent to join (default true)
 * @property {number} codeLength       invite code length (default 8 — do not change for live apps)
 * @property {string} [inviteSubject]  email subject template; `{inviter}` `{brand}` interpolated
 * @property {string} [inviteBody]     message body template; see channels.js for tokens
 */

export const DEFAULT_CHANNELS = [
  'qr',
  'copy',
  'native',
  'email',
  'sms',
  'whatsapp',
  'signal',
  'telegram',
  'x',
  'linkedin',
  'facebook',
];

const REQUIRED = ['appId', 'tablePrefix', 'brandName', 'origin'];

/**
 * Validate + normalize an app's onboarding config. Fails loudly at boot rather
 * than producing a half-configured invite at 2am (estate rule: executable
 * gates over prose).
 *
 * @param {Partial<OnboardConfig>} input
 * @returns {OnboardConfig}
 */
export function defineOnboardConfig(input) {
  const cfg = { ...input };

  const missing = REQUIRED.filter((k) => !cfg[k] || !String(cfg[k]).trim());
  if (missing.length) {
    throw new Error(
      `soma-onboard: config is missing required field(s): ${missing.join(', ')}`
    );
  }

  if (!/^[a-z0-9][a-z0-9_]*$/.test(cfg.tablePrefix)) {
    throw new Error(
      `soma-onboard: tablePrefix must be lowercase alphanumeric/underscore ` +
        `(got ${JSON.stringify(cfg.tablePrefix)}). It is interpolated into SQL identifiers.`
    );
  }

  let origin;
  try {
    origin = new URL(cfg.origin).origin;
  } catch {
    throw new Error(`soma-onboard: origin must be an absolute URL (got ${JSON.stringify(cfg.origin)})`);
  }

  const roles = Array.isArray(cfg.roles) && cfg.roles.length ? cfg.roles : ['member', 'family', 'other'];
  const channels = Array.isArray(cfg.channels) && cfg.channels.length ? cfg.channels : DEFAULT_CHANNELS;

  const joinPath = `/${String(cfg.joinPath || '/j').replace(/^\/+|\/+$/g, '')}`;

  return {
    appId: cfg.appId,
    tablePrefix: cfg.tablePrefix,
    brandName: cfg.brandName,
    origin,
    joinPath,
    purposeOneLiner: cfg.purposeOneLiner || `Join ${cfg.brandName}.`,
    hostName: cfg.hostName || '',
    virtualHostName: cfg.virtualHostName || '',
    roles,
    relationships: Array.isArray(cfg.relationships) && cfg.relationships.length
      ? cfg.relationships
      : ['wife', 'husband', 'child', 'family member', 'friend', 'colleague', 'other'],
    channels,
    requireConsent: cfg.requireConsent !== false,
    codeLength: Number.isInteger(cfg.codeLength) ? cfg.codeLength : 8,
    inviteSubject: cfg.inviteSubject || '{inviter} invited you to {brand}',
    inviteBody: cfg.inviteBody || null,
  };
}

/**
 * Table names derived from the prefix. Every store adapter routes through this
 * so a typo shows up in one place.
 * @param {OnboardConfig} cfg
 */
export function tables(cfg) {
  const p = cfg.tablePrefix;
  return {
    members: `${p}_members`,
    sessions: `${p}_sessions`,
    connections: `${p}_connections`,
    invites: `${p}_invites`,
  };
}

/** The role used when an inviter does not pick one. */
export function defaultRole(cfg) {
  return cfg.roles[0];
}
