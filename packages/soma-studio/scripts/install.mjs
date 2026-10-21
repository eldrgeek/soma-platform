// Copies the studio page into a site's publish folder, under /studio/. The
// soma-forge site runs it as its build command:
//
//   node ../soma-studio/scripts/install.mjs site/public/studio
//
// If workstream B's speech component (packages/soma-speech) is present, its
// browser files go to /studio/vendor/soma-speech/, where the page looks for
// them. Until then the page simply has no mic button.
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = process.argv[2];
if (!target) {
  console.error('usage: node install.mjs <publish-dir>/studio');
  process.exit(2);
}
const out = resolve(process.cwd(), target);

const exists = async (path) => stat(path).then(() => true, () => false);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(resolve(here, '../public'), out, { recursive: true });

const speech = resolve(here, '../../soma-speech');
for (const folder of ['dist', 'src']) {
  const from = resolve(speech, folder);
  if (await exists(resolve(from, 'soma-speech.js'))) {
    await cp(from, resolve(out, 'vendor/soma-speech'), { recursive: true });
    console.log(`studio: installed soma-speech from ${folder}/`);
    break;
  }
}
console.log(`studio: page installed in ${out}`);
