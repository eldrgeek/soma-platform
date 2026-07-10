/**
 * Build soma-assist-core → dist/soma-assist-core.js + dist/soma-assist-core.css
 *
 * Embeds CSS into the JS bundle as a string (so Shadow DOM injection works from
 * a single content-script file), and also writes a standalone CSS file for
 * hosts that prefer external stylesheets.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, 'src');
const distDir = resolve(__dirname, 'dist');

if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });

const css = readFileSync(resolve(srcDir, 'soma-assist-core.css'), 'utf8');
const js = readFileSync(resolve(srcDir, 'soma-assist-core.js'), 'utf8');

/* Escape for embedding inside a JS string literal */
const cssLiteral = JSON.stringify(css);

const needle = "var EMBEDDED_CSS = typeof __SAC_CSS__ !== 'undefined' ? __SAC_CSS__ : '';";
if (!js.includes(needle)) {
  console.error('build.mjs: EMBEDDED_CSS declaration not found in source');
  process.exit(1);
}
const outJs = js.replace(needle, `var EMBEDDED_CSS = ${cssLiteral};`);

const banner = `/* soma-assist-core v1.0.0 — built ${new Date().toISOString()} */\n`;

writeFileSync(resolve(distDir, 'soma-assist-core.js'), banner + outJs, 'utf8');
writeFileSync(resolve(distDir, 'soma-assist-core.css'), css, 'utf8');

/* Also expose at package root for easy import (mirrors soma-guide layout) */
writeFileSync(resolve(__dirname, 'soma-assist-core.js'), banner + outJs, 'utf8');
writeFileSync(resolve(__dirname, 'soma-assist-core.css'), css, 'utf8');

console.log('soma-assist-core built → dist/soma-assist-core.js + dist/soma-assist-core.css');
console.log('  js  :', (banner + outJs).length, 'bytes');
console.log('  css :', css.length, 'bytes');
