/**
 * Build script for soma-owner.js
 *
 * Reads SOMA_OWNER_SECRET from .env (gitignored) or env var,
 * computes OWNER_CHECK = SHA-256(SHA-256(secret)),
 * substitutes __OWNER_CHECK__ / __VERSION__ in the template,
 * writes dist/soma-owner.js.
 *
 * dist/soma-owner.js is public, so it must never hold the secret or the value a
 * device stores (SHA-256(secret)). The build refuses to write a file that does.
 *
 * Usage:
 *   node packages/soma-owner/build.mjs
 *
 * First-time setup:
 *   echo "SOMA_OWNER_SECRET=$(openssl rand -hex 20)" > .env
 *   node packages/soma-owner/build.mjs
 *
 * Rotation (global revocation):
 *   echo "SOMA_OWNER_SECRET=$(openssl rand -hex 20)" > .env
 *   node packages/soma-owner/build.mjs
 *   git add dist/soma-owner.js && git commit -m "rotate owner secret"
 *   # push to master (Netlify deploys dist/); every device is revoked on its
 *   # next page load and needs the new ?soma_owner_key= link once
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

/* Load .env if present */
const envPath = resolve(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}

const secret = process.env.SOMA_OWNER_SECRET;
if (!secret || secret.length < 20) {
  console.error('ERROR: SOMA_OWNER_SECRET missing or too short.');
  console.error('Run: echo "SOMA_OWNER_SECRET=$(openssl rand -hex 20)" > .env');
  process.exit(1);
}

const sha256  = (s) => createHash('sha256').update(s).digest('hex');
const token   = sha256(secret);          /* what a device stores; never shipped */
const check   = sha256(token);           /* what the public file carries */
const version = new Date().toISOString().slice(0, 10).replace(/-/g, '');

const template = readFileSync(resolve(__dirname, 'soma-owner.template.js'), 'utf8');
const built = template
  .replace('__OWNER_CHECK__', check)
  .replace('__VERSION__',     version);

if (built.includes(secret) || built.includes(token) || !built.includes(check)) {
  console.error('ERROR: built soma-owner.js would carry the secret or the device token. Not written.');
  process.exit(1);
}

const outPath = resolve(root, 'dist/soma-owner.js');
writeFileSync(outPath, built, 'utf8');

console.log('soma-owner.js built →', outPath);
console.log('  secret  :', secret.slice(0, 6) + '...' + secret.slice(-4), '(' + secret.length + ' chars)');
console.log('  check   :', check.slice(0, 8) + '...' + check.slice(-4));
console.log('  version :', version);
console.log();
console.log('Activation URL pattern:');
console.log('  https://<soma-app>/?soma_owner_key=' + secret);
