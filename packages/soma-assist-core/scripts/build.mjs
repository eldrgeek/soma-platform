import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [source, css] = await Promise.all([
  readFile(join(root, 'src/soma-assist-core.js'), 'utf8'),
  readFile(join(root, 'src/soma-assist-core.css'), 'utf8')
]);
await mkdir(join(root, 'dist'), { recursive: true });
await Promise.all([
  writeFile(join(root, 'dist/soma-assist-core.js'), source.replace('__SOMA_ASSIST_CSS_JSON__', JSON.stringify(css))),
  writeFile(join(root, 'dist/soma-assist-core.css'), css)
]);
console.log('Built dist/soma-assist-core.js and dist/soma-assist-core.css');
