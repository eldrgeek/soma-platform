import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [source, css, scriptRuntime] = await Promise.all([
  readFile(join(root, 'src/soma-assist-core.js'), 'utf8'),
  readFile(join(root, 'src/soma-assist-core.css'), 'utf8'),
  readFile(join(root, 'src/soma-script-runtime.js'), 'utf8')
]);
await mkdir(join(root, 'dist'), { recursive: true });
await Promise.all([
  writeFile(join(root, 'dist/soma-assist-core.js'), source.replace('__SOMA_ASSIST_CSS_JSON__', JSON.stringify(css))),
  writeFile(join(root, 'dist/soma-assist-core.css'), css),
  writeFile(join(root, 'dist/soma-script-runtime.js'), scriptRuntime)
]);
console.log('Built assist UI and script runtime artifacts');
