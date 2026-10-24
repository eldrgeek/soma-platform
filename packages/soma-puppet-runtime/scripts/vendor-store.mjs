// The component store: every published build of a shared browser component,
// each at a path named by a hash of its files, never changed once written.
// Nix's idea without the Nix tool. An app's description pins the build it
// uses (`uses soma-video@<hash>`); an app with no pin loads the unhashed
// folder, which is always the latest.
//
//   node scripts/vendor-store.mjs           publish: copy each changed component to vendor/<pkg>@<hash>/
//   node scripts/vendor-store.mjs --check   exit 1 if the store is out of date or a published build changed
//
// The hashed folders are committed, so every build ever published stays on
// the site after later deploys. test/component-store.test.js runs the check.
import { createHash } from 'node:crypto';
import { cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Shared components an app may pin. The runtime itself (puppet), sign-in and
// feedback are gate code: they always move with the site, never pinned.
export const PINNABLE = ['soma-play', 'soma-video'];
export const HASH = /^[0-9a-f]{12}$/;

const here = dirname(fileURLToPath(import.meta.url));
export const VENDOR = resolve(here, '../site/public/vendor');
export const MANIFEST = join(VENDOR, 'manifest.json');

async function files(folder) {
  const out = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) out.push(...(await files(path)));
    else out.push(path);
  }
  return out;
}

// sha256 over each file's relative path and bytes, in path order, cut to 12 hex digits.
export async function hashFolder(folder) {
  const hash = createHash('sha256');
  const paths = (await files(folder)).map((path) => relative(folder, path).split('\\').join('/')).sort();
  for (const path of paths) {
    hash.update(path).update('\0').update(await readFile(join(folder, path))).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

export async function readManifest(path = MANIFEST) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

// Every problem with the store, as sentences. Empty means it is in order.
export async function checkStore(vendor = VENDOR) {
  const manifest = await readManifest(join(vendor, 'manifest.json'));
  const problems = [];
  const folders = (await readdir(vendor, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const pkg of PINNABLE) {
    const entry = manifest[pkg];
    const latest = await hashFolder(join(vendor, pkg));
    if (!entry) {
      problems.push(`${pkg} is not in the store`);
      continue;
    }
    if (entry.latest !== latest) problems.push(`${pkg} changed (now ${latest}) but the store's latest is ${entry.latest}`);
    for (const hash of Object.keys(entry.versions ?? {})) {
      if (!HASH.test(hash)) problems.push(`${pkg}@${hash} is not a 12-digit hash`);
      else if (!folders.includes(`${pkg}@${hash}`)) problems.push(`${pkg}@${hash} is in the manifest but its folder is gone`);
      else if ((await hashFolder(join(vendor, `${pkg}@${hash}`))) !== hash) problems.push(`${pkg}@${hash} was changed after it was published`);
    }
  }
  for (const name of folders.filter((f) => f.includes('@'))) {
    const [pkg, hash] = name.split('@');
    if (!manifest[pkg]?.versions?.[hash]) problems.push(`${name} has no manifest entry`);
  }
  return problems;
}

export async function publish(vendor = VENDOR, today = new Date().toISOString().slice(0, 10)) {
  const path = join(vendor, 'manifest.json');
  const manifest = await readManifest(path);
  const added = [];
  for (const pkg of PINNABLE) {
    const hash = await hashFolder(join(vendor, pkg));
    const entry = (manifest[pkg] ??= { latest: hash, versions: {} });
    entry.latest = hash;
    if (!entry.versions[hash]) {
      // `force: false`: a published build is never overwritten.
      await cp(join(vendor, pkg), join(vendor, `${pkg}@${hash}`), { recursive: true, force: false, errorOnExist: false });
      entry.versions[hash] = today;
      added.push(`${pkg}@${hash}`);
    }
  }
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return added;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const problems = await checkStore();
    for (const problem of problems) console.log(problem);
    if (problems.length) {
      console.log('Run: node scripts/vendor-store.mjs (from packages/soma-puppet-runtime) and commit the result.');
      process.exit(1);
    }
    console.log('component store in order');
  } else {
    const added = await publish();
    console.log(added.length ? `published ${added.join(', ')}` : 'nothing new to publish');
  }
}
