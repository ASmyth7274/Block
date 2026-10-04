'use strict';
// ---------------------------------------------------------------------------
// Chunk: 16 x 128 x 16 column. Index = (y << 8) | (z << 4) | x
// ---------------------------------------------------------------------------
const CH_H = 128, SEA_LEVEL = 62;

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz; this.key = ckey(cx, cz);
    this.blocks = new Uint8Array(16 * 16 * CH_H);
    this.meta = new Uint8Array(16 * 16 * CH_H);
    this.light = new Uint8Array(16 * 16 * CH_H);   // (sky << 4) | block
    this.biomes = new Uint8Array(256);
    this.heightmap = new Uint8Array(256);           // lowest y that sees the sky directly
    this.dirty = new Uint8Array(CH_H >> 4);         // sections needing a re-mesh
    this.anyDirty = true;
    this.tiles = new Map();                          // index -> tile entity
    this.modified = false;                           // differs from generated => must be saved
    this.lit = false;
    this.render = null;                              // renderer-owned GPU data
    this.tints = null;                               // per-column biome tint colours
    this.lastSeen = 0;
    this.entitiesLoaded = false;
  }
  static idx(x, y, z) { return (y << 8) | (z << 4) | x; }
  get(x, y, z) { return this.blocks[(y << 8) | (z << 4) | x]; }
  getMeta(x, y, z) { return this.meta[(y << 8) | (z << 4) | x]; }
  markDirty(y) { this.dirty[y >> 4] = 1; this.anyDirty = true; }
  markAllDirty() { this.dirty.fill(1); this.anyDirty = true; }
  // highest non-air block in a column
  topY(x, z) {
    for (let y = CH_H - 1; y > 0; y--) if (this.blocks[(y << 8) | (z << 4) | x] !== 0) return y;
    return 0;
  }
  computeHeightmap() {
    const op = BT.opacity, b = this.blocks;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      let y = CH_H - 1;
      while (y >= 0 && op[b[(y << 8) | (z << 4) | x]] === 0) y--;
      this.heightmap[(z << 4) | x] = y + 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Run-length encoding for chunk arrays (used by saves & world export)
// Format: pairs of (count-1 [0..255], value)
// ---------------------------------------------------------------------------
function rleEncode(arr) {
  const out = new Uint8Array(arr.length * 2 + 16);
  let o = 0, i = 0;
  while (i < arr.length) {
    const v = arr[i]; let n = 1;
    while (i + n < arr.length && arr[i + n] === v && n < 256) n++;
    out[o++] = n - 1; out[o++] = v;
    i += n;
  }
  return out.slice(0, o);
}
function rleDecode(src, len) {
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i + 1 < src.length && o < len; i += 2) {
    const n = src[i] + 1, v = src[i + 1];
    out.fill(v, o, Math.min(len, o + n)); o += n;
  }
  return out;
}
