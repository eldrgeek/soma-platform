/**
 * Dev hot-reload watcher for the SOMA Guide extension.
 *
 * Watches extension source files and serves a version counter on :27183.
 * The background service worker polls this endpoint and calls
 * chrome.runtime.reload() when the version changes.
 *
 * Usage: npm run dev   (from packages/guide-extension)
 *
 * After any source change, Chrome reloads the extension automatically.
 * Reload the unpacked extension once after first install to pick up the
 * polling code, then `npm run dev` handles all subsequent reloads.
 */

import { watch } from 'fs';
import { createServer } from 'http';
import { resolve } from 'path';

const PORT = 27183;

let version = Date.now();

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ version }));
});

server.listen(PORT, () =>
  console.log(`[soma-guide-watcher] hot-reload server on :${PORT} — watching for changes`)
);

const watched = ['.', 'vendor'];
watched.forEach(dir => {
  try {
    watch(resolve(dir), { recursive: false }, (_event, filename) => {
      if (!filename) return;
      // Ignore hidden files and the watcher script itself
      if (filename.startsWith('.') || filename === 'watch.mjs') return;
      version = Date.now();
      console.log(`[soma-guide-watcher] changed: ${dir}/${filename} → version ${version}`);
    });
  } catch (_e) {
    // Directory may not exist in some environments
  }
});

console.log('[soma-guide-watcher] watching: ./ and vendor/');
