// Checks a deployed runtime site without signing in. It proves the live
// protections: no request without a real Supabase token gets through, the
// made-up x-dev-user identities are refused, and SOMA sign-in can redirect
// back to this site. The signed-in host steps run in a browser as the host.
//
//   timeout 120 node scripts/live-check.mjs https://soma-forge.netlify.app
import assert from 'node:assert/strict';

const baseUrl = (process.argv[2] || process.env.PM_BASE_URL || '').replace(/\/$/, '');
if (!baseUrl.startsWith('https://')) {
  console.error('usage: node scripts/live-check.mjs https://<site>');
  process.exit(2);
}
const appId = 'sunday-supper';
const apiBase = `${baseUrl}/api/app/${appId}`;

let failures = 0;

async function step(name, check) {
  try {
    await check();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}: ${error instanceof Error ? error.message : error}`);
  }
}

async function status(url, init) {
  const response = await fetch(url, init);
  return response.status;
}

let config;

await step('the app page is served', async () => {
  const response = await fetch(`${baseUrl}/?app=${appId}`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /app\.js/);
});

await step('config names SOMA sign-in and dev identity is off', async () => {
  const response = await fetch(`${baseUrl}/api/config`);
  assert.equal(response.status, 200);
  config = await response.json();
  assert.match(config.supabaseUrl, /^https:\/\/\w+\.supabase\.co$/);
  assert.ok(config.supabaseAnonKey, 'no public key configured');
  assert.equal(config.devIdentity, false);
});

await step('reading the app without a token is refused', async () => {
  assert.equal(await status(`${apiBase}/current`), 401);
});

await step('a made-up x-dev-user identity is refused', async () => {
  assert.equal(await status(`${apiBase}/current`, {
    headers: { 'x-dev-user': 'rosa:Rosa' },
  }), 401);
  assert.equal(await status(`${apiBase}/approve`, {
    method: 'POST',
    headers: { 'x-dev-user': 'rosa:Rosa', 'content-type': 'application/json' },
    body: JSON.stringify({ versionId: 'v1' }),
  }), 401);
});

await step('a forged bearer token is refused', async () => {
  assert.equal(await status(`${apiBase}/current`, {
    headers: { authorization: 'Bearer not-a-real-token' },
  }), 401);
});

await step('writes without a token are refused', async () => {
  for (const route of ['propose', 'approve', 'undo', 'data/dishes', 'feedback']) {
    const code = await status(`${apiBase}/${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(code, 401, `${route} returned ${code}`);
  }
});

await step('SOMA sign-in redirects back to this site', async () => {
  assert.ok(config?.supabaseUrl, 'config step failed');
  const verify = new URL(`${config.supabaseUrl}/auth/v1/verify`);
  verify.searchParams.set('type', 'magiclink');
  verify.searchParams.set('token', 'bogus');
  verify.searchParams.set('redirect_to', `${baseUrl}/`);
  const response = await fetch(verify, { redirect: 'manual' });
  const location = response.headers.get('location') ?? '';
  assert.ok(
    location.startsWith(`${baseUrl}/`),
    `sign-in redirect went to ${location.split('#')[0] || 'nowhere'}`,
  );
});

await step('the feedback chip loader and its central channel are served', async () => {
  assert.equal(await status(`${baseUrl}/vendor/soma-feedback/soma-chip-loader.js`), 200);
  assert.equal(await status(`${baseUrl}/soma-chip/channels/stable.json`), 200);
});

if (failures) {
  console.log(`FAIL ${failures} live check(s)`);
  process.exit(1);
}
console.log('PASS all live checks');
