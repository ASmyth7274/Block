'use strict';
// ---------------------------------------------------------------------------
// Blocklands - shared math & utility helpers (main thread)
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function fract(x) { return x - Math.floor(x); }
function mod(a, n) { return ((a % n) + n) % n; }
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function wrapDegrees(a) { a %= 360; if (a >= 180) a -= 360; if (a < -180) a += 360; return a; }
function wrapRadians(a) { a %= TAU; if (a >= Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; }
function sign(x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }
function nowMs() { return performance.now(); }

// Chunk key helpers (numeric keys are much faster than strings in Maps)
function ckey(cx, cz) { return (cx + 32768) * 65536 + (cz + 32768); }
function ckeyX(k) { return Math.floor(k / 65536) - 32768; }
function ckeyZ(k) { return (k % 65536) - 32768; }

function hexToRgb(hex) {
  if (typeof hex === 'number') return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) | (clamp(r | 0, 0, 255) << 16) | (clamp(g | 0, 0, 255) << 8) | clamp(b | 0, 0, 255)).toString(16).slice(1);
}

// Java-style String.hashCode (used to turn text seeds into numbers, like the classics did)
function stringHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

// ---------------------------------------------------------------------------
// 4x4 matrices, column-major Float32Array (WebGL convention)
// ---------------------------------------------------------------------------
const Mat4 = {
  create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  identity(m) { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  copy(out, a) { out.set(a); return out; },
  perspective(out, fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect; out[5] = f;
    out[10] = (far + near) * nf; out[11] = -1;
    out[14] = 2 * far * near * nf;
    return out;
  },
  ortho(out, l, r, b, t, n, f) {
    const lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f);
    out.fill(0);
    out[0] = -2 * lr; out[5] = -2 * bt; out[10] = 2 * nf;
    out[12] = (l + r) * lr; out[13] = (t + b) * bt; out[14] = (f + n) * nf; out[15] = 1;
    return out;
  },
  multiply(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
      a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return out;
  },
  translate(out, a, x, y, z) {
    if (out !== a) out.set(a);
    out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
    out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
    out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
    out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    return out;
  },
  scale(out, a, x, y, z) {
    for (let i = 0; i < 4; i++) { out[i] = a[i] * x; out[4 + i] = a[4 + i] * y; out[8 + i] = a[8 + i] * z; out[12 + i] = a[12 + i]; }
    return out;
  },
  rotateX(out, a, rad) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    if (a !== out) { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3]; out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15]; }
    out[4] = a10 * c + a20 * s; out[5] = a11 * c + a21 * s; out[6] = a12 * c + a22 * s; out[7] = a13 * c + a23 * s;
    out[8] = a20 * c - a10 * s; out[9] = a21 * c - a11 * s; out[10] = a22 * c - a12 * s; out[11] = a23 * c - a13 * s;
    return out;
  },
  rotateY(out, a, rad) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    if (a !== out) { out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7]; out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15]; }
    out[0] = a00 * c - a20 * s; out[1] = a01 * c - a21 * s; out[2] = a02 * c - a22 * s; out[3] = a03 * c - a23 * s;
    out[8] = a00 * s + a20 * c; out[9] = a01 * s + a21 * c; out[10] = a02 * s + a22 * c; out[11] = a03 * s + a23 * c;
    return out;
  },
  rotateZ(out, a, rad) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    if (a !== out) { out[8] = a[8]; out[9] = a[9]; out[10] = a[10]; out[11] = a[11]; out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15]; }
    out[0] = a00 * c + a10 * s; out[1] = a01 * c + a11 * s; out[2] = a02 * c + a12 * s; out[3] = a03 * c + a13 * s;
    out[4] = a10 * c - a00 * s; out[5] = a11 * c - a01 * s; out[6] = a12 * c - a02 * s; out[7] = a13 * c - a03 * s;
    return out;
  },
  invert(out, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
      a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10,
      b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12,
      b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30,
      b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1.0 / det;
    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  },
  transformPoint(out, m, x, y, z) {
    const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
    out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
    return out;
  }
};

// Frustum culling: planes extracted from a view-projection matrix
class Frustum {
  constructor() { this.p = new Float32Array(24); }
  setFromMatrix(m) {
    const p = this.p;
    const set = (i, a, b, c, d) => { const l = Math.hypot(a, b, c) || 1; p[i] = a / l; p[i + 1] = b / l; p[i + 2] = c / l; p[i + 3] = d / l; };
    set(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);
    set(4, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);
    set(8, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);
    set(12, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);
    set(16, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]);
    set(20, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);
  }
  // Axis-aligned box test (camera-relative coords)
  testBox(x0, y0, z0, x1, y1, z1) {
    const p = this.p;
    for (let i = 0; i < 24; i += 4) {
      const a = p[i], b = p[i + 1], c = p[i + 2], d = p[i + 3];
      const x = a > 0 ? x1 : x0, y = b > 0 ? y1 : y0, z = c > 0 ? z1 : z0;
      if (a * x + b * y + c * z + d < 0) return false;
    }
    return true;
  }
}

// Simple binary min-heap keyed by number (used for scheduled block ticks)
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item, key) {
    const a = this.a; a.push({ item, key });
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].key <= a[i].key) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  peekKey() { return this.a.length ? this.a[0].key : Infinity; }
  pop() {
    const a = this.a; if (!a.length) return undefined;
    const top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].key < a[m].key) m = l;
        if (r < a.length && a[r].key < a[m].key) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top.item;
  }
}

// Tiny event-free helpers for downloading / reading files
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; if (accept) input.accept = accept;
    input.style.display = 'none';
    input.onchange = () => { resolve(input.files && input.files[0] ? input.files[0] : null); input.remove(); };
    document.body.appendChild(input);
    input.click();
  });
}

function formatDate(ts) {
  const d = new Date(ts);
  const p = (n) => (n < 10 ? '0' : '') + n;
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
