/**
 * Self-contained QR encoder — byte mode, error correction level M, versions 1–20.
 *
 * Why not just depend on `qrcode`: Legends Connect loads its JavaScript with
 * plain <script> tags and has no bundler, so a share sheet that needs npm is a
 * share sheet Legends can't use. Twenty versions covers 669 bytes, and an
 * invite URL is ~90.
 *
 * Level M (≈15% recovery) matches what Vegas Connect shipped. It is the right
 * level for a code shown on a phone screen: high enough to survive glare and a
 * fingerprint, low enough to keep the modules large.
 *
 * Correctness is not assumed — test/qr.test.js asserts this module produces
 * byte-identical module matrices to the `qrcode` npm package across a spread of
 * payload lengths and versions.
 */

// ---------------------------------------------------------------------------
// Capacity + block structure tables (level M)
// ---------------------------------------------------------------------------

/** version → total codewords */
const TOTAL_CODEWORDS = [
  0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655,
  733, 815, 901, 991, 1085,
];

/** version → [ecCodewordsPerBlock, blocksG1, dataG1, blocksG2, dataG2] */
const EC_BLOCKS_M = [
  null,
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44],
  [30, 1, 50, 4, 51],
  [22, 6, 36, 2, 37],
  [22, 8, 37, 1, 38],
  [24, 4, 40, 5, 41],
  [24, 5, 41, 5, 42],
  [28, 7, 45, 3, 46],
  [28, 10, 46, 1, 47],
  [26, 9, 43, 4, 44],
  [26, 3, 44, 11, 45],
  [26, 3, 41, 13, 42],
];

/** version → alignment pattern centre coordinates */
const ALIGNMENT = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38],
  [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58],
  [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74],
  [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90],
];

const MAX_VERSION = 20;

// ---------------------------------------------------------------------------
// GF(256) arithmetic for Reed–Solomon
// ---------------------------------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // QR's primitive polynomial
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Generator polynomial of degree `degree`. */
function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/**
 * @param {number[]} data
 * @param {number} ecLen
 * @returns {number[]} ecLen error-correction codewords
 */
function rsEncode(data, ecLen) {
  const gen = rsGenerator(ecLen);
  const res = new Array(ecLen).fill(0);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.shift();
    res.push(0);
    for (let i = 0; i < ecLen; i++) {
      res[i] ^= gfMul(gen[i + 1], factor);
    }
  }
  return res;
}

// ---------------------------------------------------------------------------
// Data encoding
// ---------------------------------------------------------------------------

function dataCapacityBytes(version) {
  const [ecLen, b1, d1, b2, d2] = EC_BLOCKS_M[version];
  return b1 * d1 + b2 * d2;
}

function pickVersion(byteLength) {
  for (let v = 1; v <= MAX_VERSION; v++) {
    // 4 mode bits + char-count bits + payload, rounded up to whole codewords
    const countBits = v < 10 ? 8 : 16;
    const needed = Math.ceil((4 + countBits + byteLength * 8) / 8);
    if (needed <= dataCapacityBytes(v)) return v;
  }
  throw new Error(
    `soma-onboard/qr: payload of ${byteLength} bytes exceeds version ${MAX_VERSION} at level M ` +
      `(max ${dataCapacityBytes(MAX_VERSION)} bytes). Shorten the invite URL.`
  );
}

class BitBuffer {
  constructor() {
    this.bytes = [];
    this.length = 0;
  }
  put(value, bits) {
    for (let i = bits - 1; i >= 0; i--) this.putBit(((value >>> i) & 1) === 1);
  }
  putBit(bit) {
    const index = this.length >>> 3;
    if (this.bytes.length <= index) this.bytes.push(0);
    if (bit) this.bytes[index] |= 0x80 >>> (this.length & 7);
    this.length++;
  }
}

function encodeData(text, version) {
  const utf8 = new TextEncoder().encode(text);
  const capacity = dataCapacityBytes(version);
  const buf = new BitBuffer();

  buf.put(0b0100, 4); // byte mode
  buf.put(utf8.length, version < 10 ? 8 : 16);
  for (const b of utf8) buf.put(b, 8);

  // Terminator: up to four zero bits, then pad to a byte boundary.
  const capacityBits = capacity * 8;
  for (let i = 0; i < 4 && buf.length < capacityBits; i++) buf.putBit(false);
  while (buf.length % 8 !== 0) buf.putBit(false);

  // Alternating pad codewords, per spec.
  const pad = [0xec, 0x11];
  let p = 0;
  while (buf.bytes.length < capacity) buf.bytes.push(pad[p++ % 2]);

  return buf.bytes;
}

/** Split into blocks, compute EC, interleave. */
function buildCodewords(data, version) {
  const [ecLen, b1, d1, b2, d2] = EC_BLOCKS_M[version];
  const blocks = [];
  let offset = 0;
  for (let i = 0; i < b1; i++) {
    blocks.push(data.slice(offset, offset + d1));
    offset += d1;
  }
  for (let i = 0; i < b2; i++) {
    blocks.push(data.slice(offset, offset + d2));
    offset += d2;
  }

  const ecBlocks = blocks.map((b) => rsEncode(b, ecLen));

  const out = [];
  const maxData = Math.max(d1, d2);
  for (let i = 0; i < maxData; i++) {
    for (const block of blocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < ecLen; i++) {
    for (const block of ecBlocks) out.push(block[i]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Matrix construction
// ---------------------------------------------------------------------------

function sizeOf(version) {
  return version * 4 + 17;
}

function newMatrix(size) {
  return {
    size,
    /** null = unset, 0/1 = module value */
    modules: Array.from({ length: size }, () => new Array(size).fill(null)),
    /** true where a function pattern lives (never masked, never data) */
    reserved: Array.from({ length: size }, () => new Array(size).fill(false)),
  };
}

function setFunction(m, row, col, value) {
  m.modules[row][col] = value;
  m.reserved[row][col] = true;
}

function placeFinder(m, row, col) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= m.size || cc < 0 || cc >= m.size) continue;
      const inner =
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      setFunction(m, rr, cc, inner ? 1 : 0);
    }
  }
}

function placeAlignment(m, version) {
  const centres = ALIGNMENT[version];
  for (const r of centres) {
    for (const c of centres) {
      // Skip the three corners occupied by finder patterns. The colliding
      // centres are exactly 6 and size-7 — the first and last alignment
      // coordinates — so this must be size-7, not size-8.
      const last = m.size - 7;
      if ((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6)) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const ring = Math.max(Math.abs(dr), Math.abs(dc));
          setFunction(m, r + dr, c + dc, ring === 1 ? 0 : 1);
        }
      }
    }
  }
}

function placeTiming(m) {
  for (let i = 8; i < m.size - 8; i++) {
    const bit = i % 2 === 0 ? 1 : 0;
    setFunction(m, 6, i, bit);
    setFunction(m, i, 6, bit);
  }
}

function reserveFormatAreas(m, version) {
  // Format information: two copies.
  for (let i = 0; i < 9; i++) {
    if (m.modules[8][i] === null) setFunction(m, 8, i, 0);
    if (m.modules[i][8] === null) setFunction(m, i, 8, 0);
  }
  for (let i = 0; i < 8; i++) {
    setFunction(m, 8, m.size - 1 - i, 0);
    setFunction(m, m.size - 1 - i, 8, 0);
  }
  // The always-dark module.
  setFunction(m, m.size - 8, 8, 1);

  // Version information (v7+): two 3×6 blocks.
  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const a = Math.floor(i / 3);
      const b = (i % 3) + m.size - 11;
      setFunction(m, b, a, 0);
      setFunction(m, a, b, 0);
    }
  }
}

/** BCH(15,5) format info, XOR-masked per spec. */
function formatBits(mask) {
  const ecBits = 0b00; // level M
  let data = (ecBits << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

/** BCH(18,6) version info. */
function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) {
    rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  }
  return (version << 12) | rem;
}

function drawFormat(m, mask) {
  const bits = formatBits(mask);
  for (let i = 0; i < 15; i++) {
    const bit = (bits >>> i) & 1;
    // Copy 1 — around the top-left finder.
    if (i < 6) m.modules[i][8] = bit;
    else if (i < 8) m.modules[i + 1][8] = bit;
    else if (i < 9) m.modules[8][7] = bit;
    else m.modules[8][14 - i] = bit;

    // Copy 2 — split between top-right and bottom-left.
    if (i < 8) m.modules[8][m.size - 1 - i] = bit;
    else m.modules[m.size - 15 + i][8] = bit;
  }
  m.modules[m.size - 8][8] = 1;
}

function drawVersion(m, version) {
  if (version < 7) return;
  const bits = versionBits(version);
  for (let i = 0; i < 18; i++) {
    const bit = (bits >>> i) & 1;
    const a = Math.floor(i / 3);
    const b = (i % 3) + m.size - 11;
    m.modules[b][a] = bit;
    m.modules[a][b] = bit;
  }
}

/** Zig-zag data placement, right to left, skipping the timing column. */
function placeData(m, codewords) {
  let bitIndex = 0;
  let upward = true;

  for (let right = m.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the vertical timing pattern column
    for (let vert = 0; vert < m.size; vert++) {
      const row = upward ? m.size - 1 - vert : vert;
      for (let c = 0; c < 2; c++) {
        const col = right - c;
        if (m.reserved[row][col]) continue;
        let bit = 0;
        if (bitIndex >>> 3 < codewords.length) {
          bit = (codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1;
        }
        m.modules[row][col] = bit;
        bitIndex++;
      }
    }
    upward = !upward;
  }
}

function maskFn(mask, row, col) {
  switch (mask) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    default: throw new Error(`invalid mask ${mask}`);
  }
}

function applyMask(m, mask) {
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.reserved[r][c]) continue;
      if (maskFn(mask, r, c)) m.modules[r][c] ^= 1;
    }
  }
}

/** The four penalty rules from the spec; lowest total wins. */
function penalty(m) {
  const n = m.size;
  const at = (r, c) => m.modules[r][c];
  let score = 0;

  // Rule 1: runs of five or more same-coloured modules in a line.
  for (let i = 0; i < n; i++) {
    for (const horizontal of [true, false]) {
      let run = 1;
      let prev = horizontal ? at(i, 0) : at(0, i);
      for (let j = 1; j < n; j++) {
        const v = horizontal ? at(i, j) : at(j, i);
        if (v === prev) {
          run++;
        } else {
          if (run >= 5) score += run - 2;
          run = 1;
          prev = v;
        }
      }
      if (run >= 5) score += run - 2;
    }
  }

  // Rule 2: 2×2 blocks of one colour.
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = at(r, c);
      if (v === at(r, c + 1) && v === at(r + 1, c) && v === at(r + 1, c + 1)) {
        score += 3;
      }
    }
  }

  // Rule 3: the finder-like 1:1:3:1:1 pattern with four light modules either side.
  const p1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const p2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c + 11 <= n; c++) {
      let m1 = true;
      let m2 = true;
      for (let k = 0; k < 11; k++) {
        if (at(r, c + k) !== p1[k]) m1 = false;
        if (at(r, c + k) !== p2[k]) m2 = false;
      }
      if (m1) score += 40;
      if (m2) score += 40;
    }
  }
  for (let c = 0; c < n; c++) {
    for (let r = 0; r + 11 <= n; r++) {
      let m1 = true;
      let m2 = true;
      for (let k = 0; k < 11; k++) {
        if (at(r + k, c) !== p1[k]) m1 = false;
        if (at(r + k, c) !== p2[k]) m2 = false;
      }
      if (m1) score += 40;
      if (m2) score += 40;
    }
  }

  // Rule 4: deviation from a 50/50 light-dark balance.
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (at(r, c)) dark++;
  const percent = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encode text as a QR module matrix.
 * @param {string} text
 * @param {{forceMask?: number}} [opts] forceMask is a test hook — production
 *   callers always want the penalty-selected mask.
 * @returns {{ size: number, modules: number[][], version: number, mask: number, penalty: number }}
 */
export function encodeQR(text, opts = {}) {
  if (typeof text !== 'string' || !text) {
    throw new Error('soma-onboard/qr: nothing to encode');
  }
  const byteLength = new TextEncoder().encode(text).length;
  const version = pickVersion(byteLength);
  const data = encodeData(text, version);
  const codewords = buildCodewords(data, version);

  const masks =
    Number.isInteger(opts.forceMask) ? [opts.forceMask] : [0, 1, 2, 3, 4, 5, 6, 7];

  let best = null;
  for (const mask of masks) {
    const m = newMatrix(sizeOf(version));
    placeFinder(m, 0, 0);
    placeFinder(m, 0, m.size - 7);
    placeFinder(m, m.size - 7, 0);
    placeAlignment(m, version);
    placeTiming(m);
    reserveFormatAreas(m, version);
    placeData(m, codewords);
    applyMask(m, mask);
    drawFormat(m, mask);
    drawVersion(m, version);

    const score = penalty(m);
    if (!best || score < best.score) best = { score, mask, matrix: m };
  }

  return {
    size: best.matrix.size,
    modules: best.matrix.modules,
    version,
    mask: best.mask,
    penalty: best.score,
  };
}

/**
 * Render as an SVG string. SVG rather than canvas because it stays crisp when
 * someone pinch-zooms to help a squinting friend scan it, and it prints.
 *
 * @param {string} text
 * @param {{size?: number, margin?: number, dark?: string, light?: string, title?: string}} [opts]
 */
export function qrSvg(text, opts = {}) {
  const { size = 280, margin = 2, dark = '#102743', light = '#ffffff' } = opts;
  const qr = encodeQR(text);
  const dim = qr.size + margin * 2;

  // One path for every dark module beats one <rect> each: ~40x fewer nodes.
  let d = '';
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (qr.modules[r][c]) d += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }

  const title = opts.title ? `<title>${escapeXml(opts.title)}</title>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img">` +
    title +
    `<rect width="${dim}" height="${dim}" fill="${light}"/>` +
    `<path d="${d}" fill="${dark}"/>` +
    `</svg>`
  );
}

/** SVG as a data URI, for `<img src>`. */
export function qrDataUri(text, opts) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(text, opts))}`;
}

function escapeXml(s) {
  return String(s).replace(/[<>&"]/g, (ch) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch])
  );
}
