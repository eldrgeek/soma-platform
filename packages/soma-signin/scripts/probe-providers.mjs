#!/usr/bin/env node
// Live check for SOMA Auth sign-in providers on the shared Supabase project.
//
//   node scripts/probe-providers.mjs                # uses the shared project
//   SUPABASE_URL=… SUPABASE_ANON_KEY=… node scripts/probe-providers.mjs
//
// For each SOMA provider it reports (1) whether /auth/v1/settings says it is
// enabled and (2) whether /auth/v1/authorize?provider=X answers with a 302 to
// the provider's own sign-in host. Read-only: it never follows the redirect.
// Exit code 1 if a provider that settings call enabled does not redirect
// correctly.

const URL_ = (process.env.SUPABASE_URL || 'https://omfwcodoimjmbrhssvfl.supabase.co').replace(/\/+$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || '';

const EXPECTED_HOST = {
  google: /(^|\.)accounts\.google\.com$/,
  github: /(^|\.)github\.com$/,
  azure: /(^|\.)login\.microsoftonline\.com$/,
  apple: /(^|\.)appleid\.apple\.com$/,
  facebook: /(^|\.)facebook\.com$/,
};

async function settings() {
  if (!ANON) return null;
  try {
    const r = await fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: ANON } });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function authorize(provider) {
  let r;
  try {
    r = await fetch(`${URL_}/auth/v1/authorize?provider=${provider}`, { redirect: 'manual' });
  } catch (e) {
    return { status: 0, host: `unreachable (${e.cause?.code || e.message})` };
  }
  const loc = r.headers.get('location') || '';
  let host = '';
  try {
    host = new URL(loc).hostname;
  } catch {}
  return { status: r.status, host };
}

const s = await settings();
let bad = 0;
console.log(`project ${URL_}${s ? '' : '  (no SUPABASE_ANON_KEY or settings unreachable: enabled column unknown)'}`);
for (const provider of Object.keys(EXPECTED_HOST)) {
  const enabled = s ? s.external?.[provider] === true : undefined;
  const { status, host } = await authorize(provider);
  const redirects = status === 302 && EXPECTED_HOST[provider].test(host);
  if ((enabled || status === 0) && !redirects) bad++;
  const flag = enabled === undefined ? '?' : enabled ? 'on ' : 'off';
  console.log(`${provider.padEnd(9)} enabled=${flag}  authorize=${status} ${host || '-'}  ${redirects ? 'OK' : enabled ? 'BROKEN' : ''}`);
}
process.exit(bad ? 1 : 0);
