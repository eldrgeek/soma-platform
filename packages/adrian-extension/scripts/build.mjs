import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(join(root, 'vendor'), { recursive: true });
await Promise.all([
  copyFile(join(root, '../soma-assist-core/dist/soma-assist-core.js'), join(root, 'vendor/soma-assist-core.js')),
  copyFile(join(root, '../soma-assist-core/dist/soma-script-runtime.js'), join(root, 'vendor/soma-script-runtime.js')),
  copyFile(join(root, '../soma-guide/soma-guide.js'), join(root, 'vendor/soma-guide.js'))
]);
console.log('Built Adrian extension vendor artifacts');
