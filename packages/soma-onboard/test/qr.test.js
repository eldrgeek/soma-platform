/**
 * The QR encoder is the one place in this package where "looks right" and
 * "is right" diverge invisibly — a wrong matrix renders as a perfectly
 * plausible QR code that no phone can read, and you find out standing in front
 * of the person you were inviting.
 *
 * So it is checked against the `qrcode` npm package (the same library Vegas
 * Connect ships) module-for-module, across payload lengths that span versions
 * 1 through 20 and all four alignment-pattern layouts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { encodeQR, qrSvg, qrDataUri } from '../client/qr.js';

const require = createRequire(import.meta.url);

/** The reference library is a devDependency of the workspace, not of the app. */
let QRCode = null;
try {
  QRCode = require('qrcode');
} catch {
  QRCode = null;
}

/**
 * The reference is pinned to byte mode.
 *
 * Left to itself, `qrcode` splits a payload into mixed segments — it will
 * encode "https://vegas-connect.netlify.app/j/" as bytes and "/K7M2QP4X" as
 * alphanumeric, which packs denser and can save a version. That is a valid
 * optimization and so is declining it: this encoder is byte-mode only, which
 * every scanner supports and which costs at most one version on an invite URL.
 *
 * Comparing against an unpinned reference would therefore be comparing two
 * different (both correct) encodings. Pinning the mode makes the comparison
 * test what it claims to: that the Reed–Solomon, placement, masking and format
 * bits are right.
 *
 * Note the segment-array form: `create(str, { mode: 'byte' })` is ignored by
 * this library and still auto-segments. Only an explicit segment pins the mode.
 */
const refCreate = (payload) =>
  QRCode.create([{ data: payload, mode: 'byte' }], { errorCorrectionLevel: 'M' });

const PAYLOADS = [
  'https://a.co/j/AB',
  'https://vegas-connect.netlify.app/j/K7M2QP4X',
  'https://vegas-connect.netlify.app/j/K7M2QP4X?rel=wife&ch=qr',
  'https://vegas-connect.netlify.app/j/K7M2QP4X/join?claim=R9TT2WQY&rel=wife&ch=qr&invite=1f5c9d2e-0a3b-4c8d-9e1f-2a3b4c5d6e7f',
  'https://r1x1.netlify.app/j/NOEL1X1/join?claim=ABCDEFGH&rel=neighbour&for=Marie%20Dubois&ch=email&invite=1f5c9d2e-0a3b-4c8d-9e1f-2a3b4c5d6e7f',
  // Force higher versions, including the 4-alignment-row layouts (v14+).
  `https://example.org/j/CODE?note=${'x'.repeat(120)}`,
  `https://example.org/j/CODE?note=${'x'.repeat(240)}`,
  `https://example.org/j/CODE?note=${'x'.repeat(400)}`,
  `https://example.org/j/CODE?note=${'x'.repeat(600)}`,
  // Non-ASCII: UTF-8 byte counting, not character counting.
  'https://example.org/j/CODE?for=Zoë%20Ferré&note=café ☕ 日本語',
];

test('matches the qrcode reference library module-for-module', { skip: !QRCode && 'qrcode not installed' }, async () => {
  for (const payload of PAYLOADS) {
    const mine = encodeQR(payload);
    const theirs = refCreate(payload);

    assert.equal(
      mine.version,
      theirs.version,
      `version mismatch for ${payload.slice(0, 60)}… (mine ${mine.version}, ref ${theirs.version})`
    );
    assert.equal(mine.size, theirs.modules.size, 'matrix size mismatch');

    const refData = theirs.modules.data;
    const n = theirs.modules.size;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const ref = refData[r * n + c] ? 1 : 0;
        assert.equal(
          mine.modules[r][c],
          ref,
          `module (${r},${c}) differs at version ${mine.version} ` +
            `(mask mine=${mine.mask} ref=${theirs.maskPattern}) for ${payload.slice(0, 40)}…`
        );
      }
    }
  }
});

test('covers versions 1 through 20 as payloads grow', { skip: !QRCode && 'qrcode not installed' }, () => {
  const seen = new Set();
  for (let len = 1; len <= 660; len += 1) {
    const version = encodeQR('x'.repeat(len)).version;
    seen.add(version);
  }
  for (let v = 1; v <= 20; v++) {
    assert.ok(seen.has(v), `no payload length selected version ${v}`);
  }
});

test('every version selection agrees with the reference library', { skip: !QRCode && 'qrcode not installed' }, () => {
  for (let len = 1; len <= 660; len += 7) {
    const payload = 'x'.repeat(len);
    const mine = encodeQR(payload);
    const theirs = refCreate(payload);
    assert.equal(mine.version, theirs.version, `version disagreement at ${len} bytes`);
    const n = theirs.modules.size;
    for (let i = 0; i < n * n; i++) {
      assert.equal(
        mine.modules[Math.floor(i / n)][i % n],
        theirs.modules.data[i] ? 1 : 0,
        `module ${i} differs at ${len} bytes (version ${mine.version})`
      );
    }
  }
});

test('refuses payloads beyond version 20 rather than truncating', () => {
  assert.throws(
    () => encodeQR('x'.repeat(700)),
    /exceeds version 20/,
    'an over-long payload must fail loudly, not silently drop characters'
  );
  assert.throws(() => encodeQR(''), /nothing to encode/);
});

test('renders SVG with a dark module count matching the matrix', () => {
  const url = 'https://vegas-connect.netlify.app/j/K7M2QP4X?ch=qr';
  const qr = encodeQR(url);
  const svg = qrSvg(url, { size: 300 });

  const drawn = (svg.match(/M\d+ \d+h1v1h-1z/g) || []).length;
  const dark = qr.modules.flat().filter(Boolean).length;
  assert.equal(drawn, dark, 'every dark module should be drawn exactly once');

  assert.match(svg, /width="300" height="300"/);
  assert.match(svg, /viewBox="0 0 \d+ \d+"/);
  assert.ok(qrDataUri(url).startsWith('data:image/svg+xml;charset=utf-8,'));
});

test('SVG titles are XML-escaped', () => {
  const svg = qrSvg('https://example.org/j/AB', { title: 'Invite <Sam> & "co"' });
  assert.match(svg, /<title>Invite &lt;Sam&gt; &amp; &quot;co&quot;<\/title>/);
  assert.ok(!/<title>Invite <Sam>/.test(svg));
});
