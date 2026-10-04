'use strict';
// ---------------------------------------------------------------------------
// Flood-fill light engine (sky light + block light), classic 0..15 levels.
// Sky light travels straight down without loss through fully clear blocks.
// ---------------------------------------------------------------------------
const LQ_CAP = 1 << 21; // queue entries (x,y,z triplets)
const DIR6 = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];

class LightEngine {
  constructor(world) {
    this.world = world;
    this.q = new Int32Array(LQ_CAP * 3);
    this.qh = 0; this.qt = 0;
    this.rq = new Int32Array(LQ_CAP * 4);
    this.rh = 0; this.rt = 0;
  }
  push(x, y, z) {
    const q = this.q; let t = this.qt;
    q[t] = x; q[t + 1] = y; q[t + 2] = z;
    t += 3; if (t >= q.length) t = 0;
    if (t === this.qh) { console.warn('light queue overflow'); return; }
    this.qt = t;
  }
  pushR(x, y, z, l) {
    const q = this.rq; let t = this.rt;
    q[t] = x; q[t + 1] = y; q[t + 2] = z; q[t + 3] = l;
    t += 4; if (t >= q.length) t = 0;
    this.rt = t;
  }
  // mark the section containing a cell (and touching neighbours) for re-meshing
  dirtyAt(c, lx, y, lz) {
    c.dirty[y >> 4] = 1; c.anyDirty = true;
    const yy = y & 15;
    if (yy === 0 && y > 0) c.dirty[(y >> 4) - 1] = 1;
    else if (yy === 15 && y < CH_H - 1) c.dirty[(y >> 4) + 1] = 1;
    if (lx === 0 || lx === 15 || lz === 0 || lz === 15) {
      const w = this.world;
      if (lx === 0) w.markChunkSectionDirty(c.cx - 1, c.cz, y);
      if (lx === 15) w.markChunkSectionDirty(c.cx + 1, c.cz, y);
      if (lz === 0) w.markChunkSectionDirty(c.cx, c.cz - 1, y);
      if (lz === 15) w.markChunkSectionDirty(c.cx, c.cz + 1, y);
    }
  }

  // Breadth-first propagation of all queued cells.
  propagate(sky, markDirty) {
    const W = this.world, OP = BT.opacity;
    const shift = sky ? 4 : 0, inv = sky ? 0x0F : 0xF0;
    const q = this.q, cap = q.length;
    let cc = null, ccx = 0x7fffffff, ccz = 0x7fffffff;
    let steps = 0;
    while (this.qh !== this.qt) {
      const h = this.qh;
      const x = q[h], y = q[h + 1], z = q[h + 2];
      this.qh = h + 3 >= cap ? 0 : h + 3;
      const cx = x >> 4, cz = z >> 4;
      if (cx !== ccx || cz !== ccz) { cc = W.getChunk(cx, cz); ccx = cx; ccz = cz; }
      if (!cc) continue;
      const level = (cc.light[(y << 8) | ((z & 15) << 4) | (x & 15)] >> shift) & 15;
      if (level <= 1) continue;
      steps++;
      for (let f = 0; f < 6; f++) {
        const d = DIR6[f];
        const ny = y + d[1];
        if (ny < 0 || ny >= CH_H) continue;
        const nx = x + d[0], nz = z + d[2];
        const ncx = nx >> 4, ncz = nz >> 4;
        let nc = cc;
        if (ncx !== ccx || ncz !== ccz) { nc = W.getChunk(ncx, ncz); if (!nc) continue; }
        const ni = (ny << 8) | ((nz & 15) << 4) | (nx & 15);
        const op = OP[nc.blocks[ni]];
        if (op >= 15) continue;
        const nl = (sky && f === 0 && level === 15 && op === 0) ? 15 : level - (op > 1 ? op : 1);
        if (nl <= 0) continue;
        const cur = (nc.light[ni] >> shift) & 15;
        if (cur >= nl) continue;
        nc.light[ni] = (nc.light[ni] & inv) | (nl << shift);
        if (markDirty) this.dirtyAt(nc, nx & 15, ny, nz & 15);
        this.push(nx, ny, nz);
      }
    }
    return steps;
  }

  // Remove light that depended on cell (x,y,z), then re-propagate from the boundary.
  unlight(x, y, z, sky) {
    const W = this.world, OP = BT.opacity, EM = BT.light;
    const shift = sky ? 4 : 0, inv = sky ? 0x0F : 0xF0;
    const c0 = W.getChunk(x >> 4, z >> 4);
    if (!c0) return;
    const i0 = (y << 8) | ((z & 15) << 4) | (x & 15);
    const l0 = (c0.light[i0] >> shift) & 15;
    c0.light[i0] &= inv;
    this.dirtyAt(c0, x & 15, y, z & 15);
    if (l0 > 0) this.pushR(x, y, z, l0);
    const rq = this.rq, cap = rq.length;
    while (this.rh !== this.rt) {
      const h = this.rh;
      const px = rq[h], py = rq[h + 1], pz = rq[h + 2], L = rq[h + 3];
      this.rh = h + 4 >= cap ? 0 : h + 4;
      for (let f = 0; f < 6; f++) {
        const d = DIR6[f];
        const ny = py + d[1];
        if (ny < 0 || ny >= CH_H) continue;
        const nx = px + d[0], nz = pz + d[2];
        const nc = W.getChunk(nx >> 4, nz >> 4);
        if (!nc) continue;
        const ni = (ny << 8) | ((nz & 15) << 4) | (nx & 15);
        const nl = (nc.light[ni] >> shift) & 15;
        if (nl === 0) continue;
        if (nl < L || (sky && f === 0 && L === 15 && nl === 15)) {
          nc.light[ni] &= inv;
          this.dirtyAt(nc, nx & 15, ny, nz & 15);
          this.pushR(nx, ny, nz, nl);
          if (!sky) {
            const em = EM[nc.blocks[ni]];
            if (em > 0) { nc.light[ni] = (nc.light[ni] & inv) | em; this.push(nx, ny, nz); }
          }
        } else {
          this.push(nx, ny, nz);
        }
      }
    }
  }

  // Called after a block change at (x,y,z)
  update(x, y, z) {
    const W = this.world;
    const c = W.getChunk(x >> 4, z >> 4);
    if (!c) return;
    const i = (y << 8) | ((z & 15) << 4) | (x & 15);
    const id = c.blocks[i];
    for (let s = 0; s < 2; s++) {
      const sky = s === 1;
      this.unlight(x, y, z, sky);
      // seed the cell itself
      if (!sky) {
        const em = BT.light[id];
        if (em > 0) { c.light[i] = (c.light[i] & 0xF0) | em; this.push(x, y, z); }
      } else if (y === CH_H - 1 && BT.opacity[id] === 0) {
        c.light[i] |= 0xF0; this.push(x, y, z);
      }
      // neighbours re-propagate into the cell
      for (let f = 0; f < 6; f++) {
        const d = DIR6[f], ny = y + d[1];
        if (ny < 0 || ny >= CH_H) continue;
        this.push(x + d[0], ny, z + d[2]);
      }
      if (sky && y >= CH_H - 1) this.push(x, y, z);
      this.propagate(sky, true);
    }
  }

  // Initial lighting of a freshly loaded chunk
  initChunk(c) {
    const b = c.blocks, L = c.light, OP = BT.opacity, EM = BT.light;
    L.fill(0);
    c.computeHeightmap();
    const hm = c.heightmap;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const h = hm[(z << 4) | x];
      for (let y = h; y < CH_H; y++) L[(y << 8) | (z << 4) | x] = 0xF0;
    }
    const x0 = c.cx * 16, z0 = c.cz * 16;
    const W = this.world;
    const nN = W.getChunk(c.cx, c.cz - 1), nS = W.getChunk(c.cx, c.cz + 1), nW = W.getChunk(c.cx - 1, c.cz), nE = W.getChunk(c.cx + 1, c.cz);
    const hAt = (x, z) => {
      if (x < 0) return nW ? nW.heightmap[(z << 4) | 15] : 0;
      if (x > 15) return nE ? nE.heightmap[(z << 4)] : 0;
      if (z < 0) return nN ? nN.heightmap[(15 << 4) | x] : 0;
      if (z > 15) return nS ? nS.heightmap[x] : 0;
      return hm[(z << 4) | x];
    };
    // sky seeds: direct-sky cells next to shaded cells
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const h = hm[(z << 4) | x];
      let mx = h;
      const a = hAt(x - 1, z), bb = hAt(x + 1, z), cc = hAt(x, z - 1), dd = hAt(x, z + 1);
      if (a > mx) mx = a; if (bb > mx) mx = bb; if (cc > mx) mx = cc; if (dd > mx) mx = dd;
      const top = Math.min(CH_H - 1, mx);
      for (let y = h; y <= top; y++) this.push(x0 + x, y, z0 + z);
    }
    this.propagate(true, true);
    // block light
    for (let i = 0; i < b.length; i++) {
      const em = EM[b[i]];
      if (em > 0) { L[i] = (L[i] & 0xF0) | em; this.push(x0 + (i & 15), i >> 8, z0 + ((i >> 4) & 15)); }
    }
    this.propagate(false, true);
    // merge borders with already-loaded neighbours (both directions)
    const seedBorder = (nc, horizontal, side) => {
      if (!nc) return;
      for (let y = 0; y < CH_H; y++) for (let k = 0; k < 16; k++) {
        let ax, az, bx, bz;
        if (horizontal) { ax = side < 0 ? 0 : 15; az = k; bx = side < 0 ? -1 : 16; bz = k; }
        else { ax = k; az = side < 0 ? 0 : 15; bx = k; bz = side < 0 ? -1 : 16; }
        const la = L[(y << 8) | (az << 4) | ax];
        const lb = nc.light[(y << 8) | ((bz & 15) << 4) | (bx & 15)];
        if (la > 0x11 || (la & 15) > 1 || (la >> 4) > 1) this.push(x0 + ax, y, z0 + az);
        if (lb > 0x11 || (lb & 15) > 1 || (lb >> 4) > 1) this.push(x0 + bx, y, z0 + bz);
      }
    };
    for (let s = 0; s < 2; s++) {
      seedBorder(nW, true, -1); seedBorder(nE, true, 1); seedBorder(nN, false, -1); seedBorder(nS, false, 1);
      this.propagate(s === 0, true);
    }
    c.lit = true;
  }
}
