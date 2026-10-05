'use strict';
// ---------------------------------------------------------------------------
// Section mesher (16x16x16) with smooth lighting & ambient occlusion.
// Vertex = 3 x uint32:
//   d0: x16+32 (9b) | z16+32 (9b) << 9 | y16+32 (14b) << 18   (1/16 block units, column space, biased)
//   d1: u (5b) | v (5b) << 5 | layer (10b) << 10 | sky*4 (6b) << 20 | blk*4 (6b) << 26
//   d2: r | g << 8 | b << 16 | shade << 24
// ---------------------------------------------------------------------------
const PD = 18, PD2 = 324;
const SHADE = [0.5, 1.0, 0.8, 0.8, 0.6, 0.6];
const AO_CURVE = [0.47, 0.64, 0.81, 1.0];
// neighbour offsets in the padded volume, per face
const POFF = [-PD2, PD2, -PD, PD, -1, 1];

// Unit-cube face vertices: [x, y, z, u, v] (u,v in 0/1)
const FACE_VERTS = [
  [[0, 0, 0, 0, 0], [1, 0, 0, 1, 0], [1, 0, 1, 1, 1], [0, 0, 1, 0, 1]],     // down
  [[0, 1, 0, 0, 0], [0, 1, 1, 0, 1], [1, 1, 1, 1, 1], [1, 1, 0, 1, 0]],     // up
  [[1, 0, 0, 0, 1], [0, 0, 0, 1, 1], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0]],     // north
  [[0, 0, 1, 0, 1], [1, 0, 1, 1, 1], [1, 1, 1, 1, 0], [0, 1, 1, 0, 0]],     // south
  [[0, 0, 0, 0, 1], [0, 0, 1, 1, 1], [0, 1, 1, 1, 0], [0, 1, 0, 0, 0]],     // west
  [[1, 0, 1, 0, 1], [1, 0, 0, 1, 1], [1, 1, 0, 1, 0], [1, 1, 1, 0, 0]],     // east
];
// For AO: per face & corner, padded offsets of side1, side2, corner (relative to the face-neighbour cell)
const AO_OFF = FACE_VERTS.map((verts, f) => {
  const n = FACE_DIR[f];
  const axes = [0, 1, 2].filter((a) => n[a] === 0);
  const off = (d) => d[1] * PD2 + d[2] * PD + d[0];
  return verts.map((v) => {
    const s1 = [0, 0, 0], s2 = [0, 0, 0];
    s1[axes[0]] = v[axes[0]] ? 1 : -1;
    s2[axes[1]] = v[axes[1]] ? 1 : -1;
    const c = [s1[0] + s2[0], s1[1] + s2[1], s1[2] + s2[2]];
    return [off(s1), off(s2), off(c)];
  });
});

class MeshBuf {
  constructor() { this.a = new Uint32Array(3 * 4 * 8192); this.n = 0; }
  reset() { this.n = 0; }
  grow() { const b = new Uint32Array(this.a.length * 2); b.set(this.a); this.a = b; }
  result() { return this.n ? this.a.slice(0, this.n) : null; }
}

// local frames for pistons (local +y is the pushing face)
const PISTON_TF = [
  (v) => [v[0], 16 - v[1], 16 - v[2]], (v) => v,
  (v) => [v[0], v[2], 16 - v[1]], (v) => [v[0], 16 - v[2], v[1]],
  (v) => [16 - v[1], v[2], 16 - v[0]], (v) => [v[1], v[2], v[0]],
];
// what ember wire visibly links up with
const WIRE_LINK = new Uint8Array(256);
for (const id of [B.EMBER_WIRE, B.EMBER_TORCH, B.EMBER_TORCH_OFF, B.LEVER, B.STONE_BUTTON, B.WOOD_BUTTON, B.STONE_PLATE, B.WOOD_PLATE, B.EMBER_BLOCK, B.DETECTOR_RAIL, B.GAUGE]) WIRE_LINK[id] = 1;
const FIXED_TINT = {
  spruce: [97, 153, 97], birch: [128, 167, 85], redwood: [86, 128, 70], lily: [32, 128, 48], white: [255, 255, 255],
};

class Mesher {
  constructor(atlas) {
    this.atlas = atlas;
    this.ids = new Uint8Array(PD * PD * PD);
    this.metas = new Uint8Array(PD * PD * PD);
    this.lts = new Uint8Array(PD * PD * PD);
    this.out = [new MeshBuf(), new MeshBuf(), new MeshBuf()];
    this.nb = new Array(9);
    this.fancy = true;
    this.smooth = true;
    // per-block flags
    this.cullSame = new Uint8Array(256);
    for (const id of [B.GLASS, B.WATER, B.LAVA, B.ICE, B.STAINED_GLASS, B.GLASS_PANE]) this.cullSame[id] = 1;
    this.neighborBright = new Uint8Array(256);
    for (let i = 0; i < 256; i++) if (BLOCKS[i] && BT.opacity[i] >= 15 && !BT.opaque[i] && !BT.fluid[i]) this.neighborBright[i] = 1;
    this.rotTop = new Uint8Array(256);
    for (const id of [B.GRASS, B.DIRT, B.SAND, B.GRAVEL, B.SNOW, B.CLAY, B.MYCELIUM, B.PODZOL, B.ASH, B.SALT, B.PEAT, B.STONE, B.BEDROCK]) this.rotTop[id] = 1;
    this.tint = [255, 255, 255];
  }

  // Build all three passes for section sy of chunk c. Returns null if empty.
  build(world, c, sy) {
    for (const o of this.out) o.reset();
    this.gates = null;
    if (!this.hasBlocks(c, sy)) return null;
    this.fill(world, c, sy);
    return this.buildFilled(c, sy);
  }
  hasBlocks(c, sy) {
    const cb = c.blocks;
    for (let i = sy << 12, e = i + 4096; i < e; i++) if (cb[i] !== 0) return true;
    return false;
  }
  // the meshing proper, from a section already copied into ids/metas/lts (on a worker thread, c is
  // just { cx, cz, tints })
  buildFilled(c, sy) {
    for (const o of this.out) o.reset();
    this.gates = null;
    this.c = c; this.sy = sy;
    const ids = this.ids, metas = this.metas;
    const R = BT.render;
    for (let y = 0; y < 16; y++) {
      for (let z = 0; z < 16; z++) {
        let pi = (y + 1) * PD2 + (z + 1) * PD + 1;
        for (let x = 0; x < 16; x++, pi++) {
          const id = ids[pi];
          if (id === 0) continue;
          const meta = metas[pi];
          switch (R[id]) {
            case 1: this.cube(pi, id, meta, x, y, z); break;
            case 2: this.cross(pi, id, meta, x, y, z); break;
            case 3: this.liquid(pi, id, meta, x, y, z); break;
            case 4: this.torch(pi, id, meta, x, y, z); break;
            case 5: this.model(pi, id, meta, x, y, z); break;
            case 6: this.crop(pi, id, meta, x, y, z); break;
            case 7: this.ladder(pi, id, meta, x, y, z); break;
            case 8: this.fire(pi, id, meta, x, y, z); break;
            case 9: this.lily(pi, id, meta, x, y, z); break;
            case 10: this.vine(pi, id, meta, x, y, z); break;
            case 11: this.circuit(pi, id, meta, x, y, z); break;
            case 12: this.rail(pi, id, meta, x, y, z); break;
          }
        }
      }
    }
    const res = [this.out[0].result(), this.out[1].result(), this.out[2].result()];
    if (this.gates) res.gates = this.gates;
    return res;
  }

  fill(world, c, sy) {
    const nb = this.nb;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) nb[(dz + 1) * 3 + dx + 1] = (dx || dz) ? world.getChunk(c.cx + dx, c.cz + dz) : c;
    const ids = this.ids, metas = this.metas, lts = this.lts;
    const y0 = sy * 16 - 1;
    for (let pz = 0; pz < PD; pz++) {
      const wz = pz - 1, czo = wz < 0 ? 0 : wz > 15 ? 2 : 1, lz = wz & 15;
      for (let px = 0; px < PD; px++) {
        const wx = px - 1, cxo = wx < 0 ? 0 : wx > 15 ? 2 : 1, lx = wx & 15;
        const ch = nb[czo * 3 + cxo];
        let pi = pz * PD + px;
        const col = (lz << 4) | lx;
        if (!ch) {
          for (let py = 0; py < PD; py++, pi += PD2) { ids[pi] = 0; metas[pi] = 0; lts[pi] = 0xF0; }
          continue;
        }
        const bl = ch.blocks, mt = ch.meta, lt = ch.light;
        for (let py = 0; py < PD; py++, pi += PD2) {
          const y = y0 + py;
          if (y < 0) { ids[pi] = B.BEDROCK; metas[pi] = 0; lts[pi] = 0; continue; }
          if (y >= CH_H) { ids[pi] = 0; metas[pi] = 0; lts[pi] = 0xF0; continue; }
          const ci = (y << 8) | col;
          ids[pi] = bl[ci]; metas[pi] = mt[ci]; lts[pi] = lt[ci];
        }
      }
    }
    // slabs, stairs, farmland etc. borrow the brightest neighbour's light
    const nbr = this.neighborBright;
    for (let py = 1; py < 17; py++) for (let pz = 1; pz < 17; pz++) {
      let pi = py * PD2 + pz * PD + 1;
      for (let px = 1; px < 17; px++, pi++) {
        if (!nbr[ids[pi]]) continue;
        let s = 0, b = 0;
        for (let f = 0; f < 6; f++) { const l = lts[pi + POFF[f]]; if ((l >> 4) > s) s = l >> 4; if ((l & 15) > b) b = l & 15; }
        lts[pi] = (Math.max(0, s - 1) << 4) | Math.max(0, b - 1);
      }
    }
  }

  // ------------------------------------------------------------ tint helpers
  tintFor(id, meta, x, z) {
    const t = BT.tint[id];
    const tints = this.c.tints;
    const ci = ((z << 4) | x) * 9;
    switch (t) {
      case 1: if (id === B.TALL_GRASS && meta === 0) return FIXED_TINT.white; return [tints[ci], tints[ci + 1], tints[ci + 2]];
      case 2:
        if (id === B.LEAVES) {
          const k = meta & 7;
          if (k === 1) return FIXED_TINT.spruce;
          if (k === 2) return FIXED_TINT.birch;
          if (k === 5) return FIXED_TINT.redwood;
          if (k === 4 || k === 6 || k === 7) return FIXED_TINT.white;
        }
        return [tints[ci + 3], tints[ci + 4], tints[ci + 5]];
      case 3: return [tints[ci + 6], tints[ci + 7], tints[ci + 8]];
      case 4: return FIXED_TINT.lily;
    }
    return FIXED_TINT.white;
  }

  // ------------------------------------------------------------ emitters
  vert(buf, x16, y16, z16, u, v, layer, sky4, blk4, tint, shade) {
    if (buf.n + 3 > buf.a.length) buf.grow();
    const a = buf.a; let n = buf.n;
    a[n] = ((x16 + 32) & 511) | (((z16 + 32) & 511) << 9) | (((y16 + 32) & 16383) << 18);
    a[n + 1] = (u & 31) | ((v & 31) << 5) | ((layer & 1023) << 10) | ((sky4 & 63) << 20) | ((blk4 & 63) << 26);
    a[n + 2] = tint[0] | (tint[1] << 8) | (tint[2] << 16) | ((shade & 255) << 24);
    buf.n = n + 3;
  }

  cube(pi, id, meta, x, y, z) {
    const ids = this.ids, metas = this.metas, lts = this.lts;
    const OPQ = BT.opaque;
    const atlas = this.atlas;
    let pass = BT.pass[id];
    let isLeaf = id === B.LEAVES;
    if (isLeaf && !this.fancy) pass = 0;
    const buf = this.out[pass];
    const cullSame = this.cullSame[id];
    const tint = BT.tint[id] ? this.tintFor(id, meta, x, z) : FIXED_TINT.white;
    const yb = (this.sy * 16 + y) * 16, xb = x * 16, zb = z * 16;
    const smooth = this.smooth;
    for (let f = 0; f < 6; f++) {
      const npi = pi + POFF[f];
      const nid = ids[npi];
      if (OPQ[nid]) continue;
      if (nid === id && (cullSame || (isLeaf && !this.fancy)) && (id !== B.STAINED_GLASS || metas[npi] === meta)) continue;
      let layer = atlas.face(id, meta, f);
      let ftint = tint;
      let overlay = false;
      if (id === B.GRASS) {
        if (f >= 2) {
          const above = ids[pi + PD2];
          if (above === B.SNOW_LAYER || above === B.SNOW) layer = atlas.L_GRASS_SNOW;
          else overlay = true;
          ftint = FIXED_TINT.white;
        }
        if (f === 0) ftint = FIXED_TINT.white;
      }
      // per-corner AO and smooth light
      const ao = AO_OFF[f];
      const verts = FACE_VERTS[f];
      const l0 = lts[npi];
      let sk = [0, 0, 0, 0], bk = [0, 0, 0, 0], sh = [0, 0, 0, 0];
      const fs = SHADE[f];
      for (let k = 0; k < 4; k++) {
        if (!smooth) { sk[k] = (l0 >> 4) * 4; bk[k] = (l0 & 15) * 4; sh[k] = fs * 255; continue; }
        const o = ao[k];
        const a1 = npi + o[0], a2 = npi + o[1], a3 = npi + o[2];
        const occ1 = OPQ[ids[a1]], occ2 = OPQ[ids[a2]], occ3 = OPQ[ids[a3]];
        const lvl = (occ1 && occ2) ? 0 : 3 - (occ1 + occ2 + occ3);
        let s = l0 >> 4, b = l0 & 15, n = 1;
        if (!occ1) { const l = lts[a1]; s += l >> 4; b += l & 15; n++; }
        if (!occ2) { const l = lts[a2]; s += l >> 4; b += l & 15; n++; }
        if (!occ3 && !(occ1 && occ2)) { const l = lts[a3]; s += l >> 4; b += l & 15; n++; }
        sk[k] = Math.round(s * 4 / n); bk[k] = Math.round(b * 4 / n);
        sh[k] = fs * AO_CURVE[lvl] * 255;
      }
      let rot = 0;
      if (f === 1 && this.rotTop[id]) {
        const wx = this.c.cx * 16 + x, wz = this.c.cz * 16 + z;
        rot = ((Math.imul(wx, 0x2f0b3a49) ^ Math.imul(wz, 0x6c1b7a2d) ^ Math.imul(y, 0x9e3779b9)) >>> 13) & 3;
      }
      this.emitFace(buf, verts, xb, yb, zb, layer, sk, bk, sh, ftint, rot);
      if (overlay) this.emitFace(this.out[1], verts, xb, yb, zb, atlas.L_GRASS_OVERLAY, sk, bk, sh, tint, 0);
    }
  }
  emitFace(buf, verts, xb, yb, zb, layer, sk, bk, sh, tint, rot) {
    // choose the diagonal that keeps lighting interpolation smooth
    const b0 = sh[0] * (sk[0] + bk[0] + 4), b1 = sh[1] * (sk[1] + bk[1] + 4), b2 = sh[2] * (sk[2] + bk[2] + 4), b3 = sh[3] * (sk[3] + bk[3] + 4);
    const start = (b0 + b2 < b1 + b3) ? 1 : 0;
    for (let j = 0; j < 4; j++) {
      const k = (j + start) & 3;
      const v = verts[k];
      const uvk = verts[(k + rot) & 3];
      this.vert(buf, xb + v[0] * 16, yb + v[1] * 16, zb + v[2] * 16, uvk[3] * 16, uvk[4] * 16, layer, sk[k], bk[k], tint, sh[k]);
    }
  }

  // light of a cell for flat-lit geometry: max of own cell and the face-neighbour
  flatLight(pi, f) {
    const own = this.lts[pi];
    if (f < 0) return own;
    const nl = this.lts[pi + POFF[f]];
    return ((Math.max(own >> 4, nl >> 4)) << 4) | Math.max(own & 15, nl & 15);
  }
  // emit an arbitrary quad: p = 4 corners [x16,y16,z16], uv = 4 [u,v], light = packed
  quad(buf, p, uv, layer, light, tint, shade) {
    const s4 = (light >> 4) * 4, b4 = (light & 15) * 4, sh = shade * 255;
    for (let k = 0; k < 4; k++) this.vert(buf, p[k][0], p[k][1], p[k][2], uv[k][0], uv[k][1], layer, s4, b4, tint, sh);
  }
  quad2(buf, p, uv, layer, light, tint, shade) {
    this.quad(buf, p, uv, layer, light, tint, shade);
    this.quad(buf, [p[3], p[2], p[1], p[0]], [uv[3], uv[2], uv[1], uv[0]], layer, light, tint, shade);
  }

  cross(pi, id, meta, x, y, z) {
    const xb = x * 16, zb = z * 16, yb = (this.sy * 16 + y) * 16;
    // a stem holding its fruit: one bent plane, curving over towards it
    if ((meta & 8) && (id === B.MELON_STEM || id === B.PUMPKIN_STEM)) {
      const [dx, dz] = [[0, -1], [0, 1], [-1, 0], [1, 0]][(meta >> 4) & 3], L = this.atlas.layer('stem_attached'), light = this.lts[pi], buf = this.out[1];
      const uv = [[0, 16], [16, 16], [16, 0], [0, 0]];
      // the texture bends to its right: lay it out so that its right is towards the fruit
      const p = dx ? [[xb + 8 - 8 * dx, yb, zb + 8], [xb + 8 + 8 * dx, yb, zb + 8], [xb + 8 + 8 * dx, yb + 16, zb + 8], [xb + 8 - 8 * dx, yb + 16, zb + 8]]
        : [[xb + 8, yb, zb + 8 - 8 * dz], [xb + 8, yb, zb + 8 + 8 * dz], [xb + 8, yb + 16, zb + 8 + 8 * dz], [xb + 8, yb + 16, zb + 8 - 8 * dz]];
      this.quad2(buf, p, uv, L, light, FIXED_TINT.white, 1);
      return;
    }
    const layer = this.atlas.face(id, meta, 2);
    const tint = BT.tint[id] ? this.tintFor(id, meta, x, z) : FIXED_TINT.white;
    let ox = 0, oz = 0, oy = 0;
    if (id === B.TALL_GRASS || id === B.FLOWER) {
      const wx = this.c.cx * 16 + x, wz = this.c.cz * 16 + z;
      const h = (Math.imul(wx, 3129871) ^ Math.imul(wz, 116129781)) >>> 0;
      ox = ((h >> 16) & 15) / 15 * 6 - 3; oz = ((h >> 24) & 15) / 15 * 6 - 3;
      if (id === B.TALL_GRASS) oy = -(((h >> 8) & 15) / 15) * 3;
    }
    const a = 0.8, b = 15.2;
    const p1 = [[xb + a + ox, yb + oy, zb + a + oz], [xb + b + ox, yb + oy, zb + b + oz], [xb + b + ox, yb + 16 + oy, zb + b + oz], [xb + a + ox, yb + 16 + oy, zb + a + oz]];
    const p2 = [[xb + b + ox, yb + oy, zb + a + oz], [xb + a + ox, yb + oy, zb + b + oz], [xb + a + ox, yb + 16 + oy, zb + b + oz], [xb + b + ox, yb + 16 + oy, zb + a + oz]];
    const uv = [[0, 16], [16, 16], [16, 0], [0, 0]];
    const light = this.lts[pi];
    const buf = this.out[1];
    this.quad2(buf, p1.map((p) => p.map(Math.round)), uv, layer, light, tint, 1);
    this.quad2(buf, p2.map((p) => p.map(Math.round)), uv, layer, light, tint, 1);
  }

  crop(pi, id, meta, x, y, z) {
    const xb = x * 16, zb = z * 16, yb = (this.sy * 16 + y) * 16 - 1;
    const layer = this.atlas.face(id, meta, 2);
    const light = this.lts[pi], buf = this.out[1], t = FIXED_TINT.white;
    const uv = [[0, 16], [16, 16], [16, 0], [0, 0]];
    for (const o of [4, 12]) {
      this.quad2(buf, [[xb + o, yb, zb], [xb + o, yb, zb + 16], [xb + o, yb + 16, zb + 16], [xb + o, yb + 16, zb]], uv, layer, light, t, 0.8);
      this.quad2(buf, [[xb, yb, zb + o], [xb + 16, yb, zb + o], [xb + 16, yb + 16, zb + o], [xb, yb + 16, zb + o]], uv, layer, light, t, 0.8);
    }
  }

  torch(pi, id, meta, x, y, z) {
    const xb = x * 16, zb = z * 16, yb = (this.sy * 16 + y) * 16;
    const layer = this.atlas.face(id, meta, 2);
    const light = this.lts[pi], buf = this.out[1], t = FIXED_TINT.white;
    // shear for wall torches: bottom near the wall, top leaning out
    let bx = 0, bz = 0, lean = 0, ldx = 0, ldz = 0, lift = 0;
    if (meta >= 1 && meta <= 4) {
      lift = 3.5; lean = 0.4;
      if (meta === 1) { bx = -8; ldx = 1; }
      else if (meta === 2) { bx = 8; ldx = -1; }
      else if (meta === 3) { bz = -8; ldz = 1; }
      else { bz = 8; ldz = -1; }
    }
    const P = (px, py, pz) => {
      const yy = py + lift;
      return [Math.round(xb + px + bx * 0.62 + ldx * lean * py), Math.round(yb + yy), Math.round(zb + pz + bz * 0.62 + ldz * lean * py)];
    };
    const h0 = 0, h1 = 16;
    // four side planes spanning the full tile (only the 2px stick is opaque)
    this.quad(buf, [P(7, h0, 0), P(7, h0, 16), P(7, h1, 16), P(7, h1, 0)], [[0, 16], [16, 16], [16, 0], [0, 0]], layer, light, t, 0.6);
    this.quad(buf, [P(9, h0, 16), P(9, h0, 0), P(9, h1, 0), P(9, h1, 16)], [[0, 16], [16, 16], [16, 0], [0, 0]], layer, light, t, 0.6);
    this.quad(buf, [P(16, h0, 7), P(0, h0, 7), P(0, h1, 7), P(16, h1, 7)], [[0, 16], [16, 16], [16, 0], [0, 0]], layer, light, t, 0.8);
    this.quad(buf, [P(0, h0, 9), P(16, h0, 9), P(16, h1, 9), P(0, h1, 9)], [[0, 16], [16, 16], [16, 0], [0, 0]], layer, light, t, 0.8);
    // top cap
    this.quad(buf, [P(7, 10, 7), P(7, 10, 9), P(9, 10, 9), P(9, 10, 7)], [[7, 6], [7, 8], [9, 8], [9, 6]], layer, light, t, 1);
  }

  ladder(pi, id, meta, x, y, z) {
    const xb = x * 16, zb = z * 16, yb = (this.sy * 16 + y) * 16;
    const layer = this.atlas.face(id, meta, 2);
    const light = this.lts[pi], buf = this.out[1], t = FIXED_TINT.white;
    const uv = [[0, 16], [16, 16], [16, 0], [0, 0]];
    const d = 15;
    let p;
    switch (meta & 3) {
      case 0: p = [[xb + 16, yb, zb + d], [xb, yb, zb + d], [xb, yb + 16, zb + d], [xb + 16, yb + 16, zb + d]]; break;
      case 1: p = [[xb, yb, zb + 1], [xb + 16, yb, zb + 1], [xb + 16, yb + 16, zb + 1], [xb, yb + 16, zb + 1]]; break;
      case 2: p = [[xb + d, yb, zb], [xb + d, yb, zb + 16], [xb + d, yb + 16, zb + 16], [xb + d, yb + 16, zb]]; break;
      default: p = [[xb + 1, yb, zb + 16], [xb + 1, yb, zb], [xb + 1, yb + 16, zb], [xb + 1, yb + 16, zb + 16]]; break;
    }
    this.quad2(buf, p, uv, layer, light, t, 0.85);
  }

  vine(pi, id, meta, x, y, z) {
    const xb = x * 16, zb = z * 16, yb = (this.sy * 16 + y) * 16;
    const layer = this.atlas.face(id, meta, 2);
    const light = this.lts[pi], buf = this.out[1], t = this.tintFor(id, meta, x, z);
    const uv = [[0, 16], [16, 16], [16, 0], [0, 0]];
    const e = 0.8;
    if (meta & 1) this.quad2(buf, [[xb, yb, zb + 16 - e], [xb + 16, yb, zb + 16 - e], [xb + 16, yb + 16, zb + 16 - e], [xb, yb + 16, zb + 16 - e]].map((p) => p.map(Math.round)), uv, layer, light, t, 0.8);
    if (meta & 4) this.quad2(buf, [[xb + 16, yb, zb + e], [xb, yb, zb + e], [xb, yb + 16, zb + e], [xb + 16, yb + 16, zb + e]].map((p) => p.map(Math.round)), uv, layer, light, t, 0.8);
    if (meta & 2) this.quad2(buf, [[xb + e, yb, zb], [xb + e, yb, zb + 16], [xb + e, yb + 16, zb + 16], [xb + e, yb + 16, zb]].map((p) => p.map(Math.round)), uv, layer, light, t, 0.6);
    if (meta & 8) this.quad2(buf, [[xb + 16 - e, yb, zb + 16], [xb + 16 - e, yb, zb], [xb + 16 - e, yb + 16, zb], [xb + 16 - e, yb + 16, zb + 16]].map((p) => p.map(Math.round)), uv, layer, light, t, 0.6);
    if (meta === 0) this.quad2(buf, [[xb, yb + 15, zb], [xb, yb + 15, zb + 16], [xb + 16, yb + 15, zb + 16], [xb + 16, yb + 15, zb]], uv, layer, light, t, 0.5);
  }

  lily(pi, id, meta, x, y, z) {
    const xb = x * 16, zb = z * 16, yb = (this.sy * 16 + y) * 16 + 0.25;
    const layer = this.atlas.face(id, meta, 1);
    const light = this.lts[pi], buf = this.out[1], t = FIXED_TINT.lily;
    const wx = this.c.cx * 16 + x, wz = this.c.cz * 16 + z;
    const r = ((Math.imul(wx, 0x2f0b3a49) ^ Math.imul(wz, 0x6c1b7a2d)) >>> 13) & 3;
    const uvs = [[0, 0], [0, 16], [16, 16], [16, 0]];
    const uv = [uvs[r], uvs[(r + 1) & 3], uvs[(r + 2) & 3], uvs[(r + 3) & 3]];
    this.quad2(buf, [[xb, Math.round(yb), zb], [xb, Math.round(yb), zb + 16], [xb + 16, Math.round(yb), zb + 16], [xb + 16, Math.round(yb), zb]], uv, layer, light, t, 1);
  }

  fire(pi, id, meta, x, y, z) {
    const xb = x * 16, zb = z * 16, yb = (this.sy * 16 + y) * 16;
    const layer = this.atlas.face(id, meta, 2);
    const buf = this.out[1], t = FIXED_TINT.white, light = 0xFF;
    const uv = [[0, 16], [16, 16], [16, 0], [0, 0]];
    const h = 22;
    // leaning planes on each side + a cross
    this.quad2(buf, [[xb, yb, zb + 1], [xb + 16, yb, zb + 1], [xb + 16, yb + h, zb + 6], [xb, yb + h, zb + 6]], uv, layer, light, t, 1);
    this.quad2(buf, [[xb, yb, zb + 15], [xb + 16, yb, zb + 15], [xb + 16, yb + h, zb + 10], [xb, yb + h, zb + 10]], uv, layer, light, t, 1);
    this.quad2(buf, [[xb + 1, yb, zb], [xb + 1, yb, zb + 16], [xb + 6, yb + h, zb + 16], [xb + 6, yb + h, zb]], uv, layer, light, t, 1);
    this.quad2(buf, [[xb + 15, yb, zb], [xb + 15, yb, zb + 16], [xb + 10, yb + h, zb + 16], [xb + 10, yb + h, zb]], uv, layer, light, t, 1);
  }

  // ------------------------------------------------------------ liquids
  fluidHeight(id, pi) {
    const ids = this.ids;
    if (ids[pi] !== id) return -1;
    if (ids[pi + PD2] === id) return 16;
    const m = this.metas[pi];
    if (m === 0 || (m & 8)) return 14.2;
    return Math.max(1.6, (8 - (m & 7)) / 9 * 16);
  }
  cornerHeight(id, pi, dx, dz) {
    // the four cells sharing the corner: pi, pi+dx, pi+dz, pi+dx+dz
    const cells = [pi, pi + dx, pi + dz * PD, pi + dx + dz * PD];
    let sum = 0, cnt = 0;
    for (const c of cells) {
      if (this.ids[c + PD2] === id) return 16;
      const h = this.fluidHeight(id, c);
      if (h >= 0) {
        const m = this.metas[c];
        if (m === 0 || (m & 8)) { sum += h * 10; cnt += 10; }
        sum += h; cnt++;
      } else if (!BT.solid[this.ids[c]]) { cnt++; }
    }
    return cnt ? sum / cnt : 0;
  }
  liquid(pi, id, meta, x, y, z) {
    const ids = this.ids, OPQ = BT.opaque;
    const isWater = id === B.WATER;
    const buf = this.out[isWater ? 2 : 0];
    const xb = x * 16, zb = z * 16, yb = (this.sy * 16 + y) * 16;
    const tint = isWater ? this.tintFor(id, meta, x, z) : FIXED_TINT.white;
    const still = this.atlas.face(id, meta, 1), flow = this.atlas.face(id, meta, 2);
    const h00 = this.cornerHeight(id, pi, -1, -1), h10 = this.cornerHeight(id, pi, 1, -1), h11 = this.cornerHeight(id, pi, 1, 1), h01 = this.cornerHeight(id, pi, -1, 1);
    const above = ids[pi + PD2];
    // top
    if (above !== id) {
      const light = this.flatLight(pi, 1);
      const p = [[xb, yb + h00, zb], [xb, yb + h01, zb + 16], [xb + 16, yb + h11, zb + 16], [xb + 16, yb + h10, zb]].map((q) => q.map(Math.round));
      const uv = [[0, 0], [0, 16], [16, 16], [16, 0]];
      this.quad(buf, p, uv, still, light, tint, 1);
      if (isWater) this.quad(buf, [p[3], p[2], p[1], p[0]], [uv[3], uv[2], uv[1], uv[0]], still, light, tint, 1);
    }
    // bottom
    const below = ids[pi - PD2];
    if (below !== id && !OPQ[below]) {
      const light = this.flatLight(pi, 0);
      this.quad(buf, [[xb, yb, zb], [xb + 16, yb, zb], [xb + 16, yb, zb + 16], [xb, yb, zb + 16]], [[0, 0], [16, 0], [16, 16], [0, 16]], still, light, tint, 0.5);
    }
    // sides
    const sides = [
      [2, [xb + 16, zb, h10], [xb, zb, h00]],
      [3, [xb, zb + 16, h01], [xb + 16, zb + 16, h11]],
      [4, [xb, zb, h00], [xb, zb + 16, h01]],
      [5, [xb + 16, zb + 16, h11], [xb + 16, zb, h10]],
    ];
    for (const [f, a, b] of sides) {
      const n = ids[pi + POFF[f]];
      if (n === id || OPQ[n]) continue;
      if (isWater && n === B.ICE) continue;
      const light = this.flatLight(pi, f);
      const ha = Math.round(a[2]), hb = Math.round(b[2]);
      const p = [[a[0], yb, a[1]], [b[0], yb, b[1]], [b[0], yb + hb, b[1]], [a[0], yb + ha, a[1]]];
      const uv = [[0, 16], [16, 16], [16, 16 - Math.min(16, hb)], [0, 16 - Math.min(16, ha)]];
      this.quad(buf, p, uv, flow, light, tint, SHADE[f]);
      if (isWater) this.quad(buf, [p[3], p[2], p[1], p[0]], [uv[3], uv[2], uv[1], uv[0]], flow, light, tint, SHADE[f]);
    }
  }

  // ------------------------------------------------------------ ember circuits
  // a box given in a local frame; tf maps local pixel coords to block-relative pixels
  lbox(xb, yb, zb, tf, b, layers, light, tint, uvs) {
    const buf = this.out[1];
    const [x0, y0, z0, x1, y1, z1] = b;
    const F = [
      [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
    ];
    const N = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
    const UV = [(v) => [v[0], v[2]], (v) => [v[0], v[2]], (v) => [16 - v[0], 16 - v[1]], (v) => [v[0], 16 - v[1]], (v) => [v[2], 16 - v[1]], (v) => [16 - v[2], 16 - v[1]]];
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2, c0 = tf([cx, cy, cz]);
    for (let f = 0; f < 6; f++) {
      const layer = Array.isArray(layers) ? layers[f] : layers;
      if (layer < 0) continue;
      const c1 = tf([cx + N[f][0], cy + N[f][1], cz + N[f][2]]);
      const nx = c1[0] - c0[0], ny = c1[1] - c0[1], nz = c1[2] - c0[2];
      const shade = Math.abs(ny) > 0.7 ? (ny > 0 ? 1 : 0.5) : (Math.abs(nz) >= Math.abs(nx) ? 0.8 : 0.6);
      const pts = F[f].map((v) => { const q = tf(v); return [xb + Math.round(q[0]), yb + Math.round(q[1]), zb + Math.round(q[2])]; });
      const uv = (uvs && uvs[f]) ? uvs[f] : F[f].map((v) => UV[f](v).map((t) => clamp(Math.round(t), 0, 31)));
      this.quad2(buf, pts, uv, layer, light, tint, shade);
    }
  }
  // local frame of something attached to a face: y points away from the face
  attachFrame(a, axisX) {
    switch (a) {
      case 1: return (v) => [v[1], v[2], v[0]];
      case 2: return (v) => [16 - v[1], v[2], 16 - v[0]];
      case 3: return (v) => [16 - v[0], v[2], v[1]];
      case 4: return (v) => [v[0], v[2], 16 - v[1]];
      case 5: return axisX ? (v) => [v[2], 16 - v[1], v[0]] : (v) => [v[0], 16 - v[1], v[2]];
      default: return axisX ? (v) => [v[2], v[1], v[0]] : (v) => v;
    }
  }
  circuit(pi, id, meta, x, y, z) {
    const xb = x * 16, zb = z * 16, yb = (this.sy * 16 + y) * 16;
    const light = this.flatLight(pi, -1), atlas = this.atlas, W = FIXED_TINT.white;
    if (id === B.EMBER_WIRE) { this.wire(pi, meta, xb, yb, zb, light); return; }
    if (id === B.LEVER) {
      const tf = this.attachFrame(meta & 7, (meta & 16) !== 0);
      this.lbox(xb, yb, zb, tf, [5, 0, 4, 11, 3, 12], atlas.layer('cobblestone'), light, W);
      // the handle leans one way when off and the other when on
      const ang = (meta & 8) ? 0.7 : -0.7, ca = Math.cos(ang), sa = Math.sin(ang);
      const rt = (v) => { const yy = v[1], zz = v[2] - 8; return tf([v[0], 2 + yy * ca - zz * sa, 8 + yy * sa + zz * ca]); };
      const st = atlas.layer('lever_stick');
      const side = [[7, 16], [9, 16], [9, 6], [7, 6]];
      this.lbox(xb, yb, zb, rt, [7, 0, 7, 9, 10, 9], st, light, W, [[[7, 7], [9, 7], [9, 9], [7, 9]], [[7, 7], [9, 7], [9, 9], [7, 9]], side, side, side, side]);
      return;
    }
    if (id === B.STONE_BUTTON || id === B.WOOD_BUTTON) {
      const tf = this.attachFrame(meta & 7, false);
      this.lbox(xb, yb, zb, tf, [5, 0, 6, 11, (meta & 8) ? 1 : 2, 10], atlas.face(id, meta, 1), light, W);
      return;
    }
    if (id === B.PISTON || id === B.STICKY_PISTON || id === B.PISTON_HEAD) {
      const f = meta & 7, tf = PISTON_TF[f], L = (n) => atlas.layer(n), side = L('piston_side');
      if (id === B.PISTON_HEAD) {
        const face = L((meta & 8) ? 'piston_top_sticky' : 'piston_top');
        this.lbox(xb, yb, zb, tf, [0, 12, 0, 16, 16, 16], [L('piston_top'), face, side, side, side, side], light, W);
        const rod = [[6, 4], [10, 4], [10, 16], [6, 16]];
        this.lbox(xb, yb, zb, tf, [6, -4, 6, 10, 12, 10], [-1, -1, side, side, side, side], light, W, [null, null, rod, rod, rod, rod]);
        return;
      }
      const ext = (meta & 8) !== 0;
      const front = ext ? 'piston_inner' : (id === B.STICKY_PISTON ? 'piston_top_sticky' : 'piston_top');
      const sv = ext ? [[0, 4], [16, 4], [16, 16], [0, 16]] : null;
      this.lbox(xb, yb, zb, tf, [0, 0, 0, 16, ext ? 12 : 16, 16], [L('piston_bottom'), L(front), side, side, side, side], light, W, sv ? [null, null, sv, sv, sv, sv] : null);
      return;
    }
    if (id === B.RELAY || id === B.RELAY_ON) {
      const f = meta & 3, on = id === B.RELAY_ON;
      const tf = [(v) => v, (v) => [16 - v[0], v[1], 16 - v[2]], (v) => [v[2], v[1], 16 - v[0]], (v) => [16 - v[2], v[1], v[0]]][f];
      const top = atlas.layer(on ? 'relay_top_on' : 'relay_top'), sideL = atlas.layer('stone_slab_side'), bot = atlas.layer('stone_slab_top');
      this.lbox(xb, yb, zb, tf, [0, 0, 0, 16, 2, 16], [bot, top, sideL, sideL, sideL, sideL], light, W);
      const tl = atlas.layer(on ? 'ember_torch_on' : 'ember_torch_off');
      const post = [[7, 13], [9, 13], [9, 8], [7, 8]], cap = [[7, 6], [9, 6], [9, 8], [7, 8]];
      const delay = (meta >> 2) & 3;
      for (const pz of [2, 6 + delay * 2]) this.lbox(xb, yb, zb, tf, [7, 2, pz, 9, 7, pz + 2], tl, light, W, [post, cap, post, post, post, post]);
    }
    // a gauge: two studs behind, lit while it gives power; one in front, lit when it subtracts
    if (id === B.GAUGE) {
      const f = meta & 3, on = ((meta >> 3) & 15) > 0, sub = (meta & 4) !== 0;
      const tf = [(v) => v, (v) => [16 - v[0], v[1], 16 - v[2]], (v) => [v[2], v[1], 16 - v[0]], (v) => [16 - v[2], v[1], v[0]]][f];
      const top = atlas.layer(on ? 'gauge_top_on' : 'gauge_top'), sideL = atlas.layer('stone_slab_side'), bot = atlas.layer('stone_slab_top');
      this.lbox(xb, yb, zb, tf, [0, 0, 0, 16, 2, 16], [bot, top, sideL, sideL, sideL, sideL], light, W);
      const post = [[7, 13], [9, 13], [9, 8], [7, 8]], cap = [[7, 6], [9, 6], [9, 8], [7, 8]];
      const lit = atlas.layer('ember_torch_on'), dark = atlas.layer('ember_torch_off');
      for (const px of [3, 11]) this.lbox(xb, yb, zb, tf, [px, 2, 11, px + 2, 7, 13], on ? lit : dark, light, W, [post, cap, post, post, post, post]);
      this.lbox(xb, yb, zb, tf, [7, 2, 2, 9, 5, 4], sub ? lit : dark, light, W, [post, cap, post, post, post, post]);
    }
  }
  // rails: a flat (or sloping) double-sided track 1px above the ground
  rail(pi, id, meta, x, y, z) {
    const xb = x * 16, zb = z * 16, yb = (this.sy * 16 + y) * 16;
    const shape = id === B.RAIL ? meta & 15 : meta & 7;
    const layer = this.atlas.face(id, meta, 1);
    const light = this.lts[pi], buf = this.out[1], W = FIXED_TINT.white;
    let p, uv;
    // texture rails run along v; a curve joins the bottom edge to the right edge
    const along = [[0, 0], [0, 16], [16, 16], [16, 0]];
    switch (shape) {
      case 0: p = [[0, 1, 0], [0, 1, 16], [16, 1, 16], [16, 1, 0]]; uv = [[0, 0], [0, 16], [16, 16], [16, 0]]; break;
      case 1: p = [[0, 1, 0], [0, 1, 16], [16, 1, 16], [16, 1, 0]]; uv = [[0, 0], [16, 0], [16, 16], [0, 16]]; break;
      case 2: p = [[0, 1, 0], [0, 1, 16], [16, 17, 16], [16, 17, 0]]; uv = [[0, 0], [16, 0], [16, 16], [0, 16]]; break;
      case 3: p = [[0, 17, 0], [0, 17, 16], [16, 1, 16], [16, 1, 0]]; uv = [[0, 0], [16, 0], [16, 16], [0, 16]]; break;
      case 4: p = [[0, 17, 0], [0, 1, 16], [16, 1, 16], [16, 17, 0]]; uv = along; break;
      case 5: p = [[0, 1, 0], [0, 17, 16], [16, 17, 16], [16, 1, 0]]; uv = along; break;
      default: {
        p = [[0, 1, 0], [0, 1, 16], [16, 1, 16], [16, 1, 0]];
        const fx = shape === 7 || shape === 8, fz = shape === 8 || shape === 9;
        uv = p.map((q) => [fx ? 16 - q[0] : q[0], fz ? 16 - q[2] : q[2]]);
      }
    }
    this.quad2(buf, p.map((q) => [xb + q[0], yb + q[1], zb + q[2]]), uv, layer, light, W, 1);
  }
  wire(pi, meta, xb, yb, zb, light) {
    const ids = this.ids, metas = this.metas, OPQ = BT.opaque, Wr = B.EMBER_WIRE;
    const offs = [-PD, PD, -1, 1];
    const upOpen = !OPQ[ids[pi + PD2]];
    let c = 0, up = 0;
    for (let k = 0; k < 4; k++) {
      const q = pi + offs[k], n = ids[q];
      if (WIRE_LINK[n]) c |= 1 << k;
      else if (n === B.RELAY || n === B.RELAY_ON) { if ((metas[q] & 3) >> 1 === k >> 1) c |= 1 << k; }
      else if (!OPQ[n] && ids[q - PD2] === Wr) c |= 1 << k;
      else if (upOpen && OPQ[n] && ids[q + PD2] === Wr) { c |= 1 << k; up |= 1 << k; }
    }
    const f = (meta & 15) / 15;
    const tint = [Math.round(255 * (0.33 + 0.67 * f)), Math.round(255 * (0.07 + 0.43 * f * f)), Math.round(255 * (0.02 + 0.13 * f * f * f))];
    const buf = this.out[1], atlas = this.atlas;
    const s4 = (light >> 4) * 4, b4 = (light & 15) * 4;
    const V = (px, py, pz, u, v, layer, sh) => this.vert(buf, xb + px, yb + py, zb + pz, u, v, layer, s4, b4, tint, sh);
    const quad = (pts, uvs, layer, sh) => { for (let k = 0; k < 4; k++) V(pts[k][0], pts[k][1], pts[k][2], uvs[k][0], uvs[k][1], layer, sh); for (let k = 3; k >= 0; k--) V(pts[k][0], pts[k][1], pts[k][2], uvs[k][0], uvs[k][1], layer, sh); };
    const ns = c && !(c & 0b1100), ew = c && !(c & 0b0011);
    if (ns || ew) {
      // the line texture runs along v: along z for north-south wire, along x for east-west
      const L = atlas.layer('ember_wire_line');
      quad([[0, 0, 0], [0, 0, 16], [16, 0, 16], [16, 0, 0]], ns ? [[0, 0], [0, 16], [16, 16], [16, 0]] : [[0, 0], [16, 0], [16, 16], [0, 16]], L, 254);
    } else {
      const L = atlas.layer('ember_wire_cross');
      const x0 = (c === 0 || c & 4) ? 0 : 5, x1 = (c === 0 || c & 8) ? 16 : 11, z0 = (c === 0 || c & 1) ? 0 : 5, z1 = (c === 0 || c & 2) ? 16 : 11;
      quad([[x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0]], [[x0, z0], [x0, z1], [x1, z1], [x1, z0]], L, 254);
    }
    // dust running up the side of a block to the wire above
    if (up) {
      const L = atlas.layer('ember_wire_line');
      const uv = [[0, 16], [16, 16], [16, 0], [0, 0]];
      if (up & 1) quad([[16, 0, 0], [0, 0, 0], [0, 16, 0], [16, 16, 0]], uv, L, 253);
      if (up & 2) quad([[0, 0, 16], [16, 0, 16], [16, 16, 16], [0, 16, 16]], uv, L, 253);
      if (up & 4) quad([[0, 0, 0], [0, 0, 16], [0, 16, 16], [0, 16, 0]], uv, L, 252);
      if (up & 8) quad([[16, 0, 16], [16, 0, 0], [16, 16, 0], [16, 16, 16]], uv, L, 252);
    }
  }

  // ------------------------------------------------------------ box models
  model(pi, id, meta, x, y, z) {
    // the Sift gate is drawn by its own shader; just note where it is
    if (id === B.SIFT_GATE) { (this.gates || (this.gates = [])).push(x, this.sy * 16 + y, z, meta); return; }
    const boxes = this.boxesFor(pi, id, meta);
    if (!boxes) return;
    const pass = BT.pass[id] === 2 ? 2 : (BLOCKS[id].cutout ? 1 : 0);
    const buf = this.out[pass];
    const tint = BT.tint[id] ? this.tintFor(id, meta, x, z) : FIXED_TINT.white;
    const xb = x * 16, zb = z * 16, yb = (this.sy * 16 + y) * 16;
    const ids = this.ids, OPQ = BT.opaque, atlas = this.atlas;
    for (const bx of boxes) {
      const [x0, y0, z0, x1, y1, z1] = bx.b;
      for (let f = 0; f < 6; f++) {
        if (bx.faces && bx.faces.indexOf(f) < 0) continue;
        // boundary faces may be culled by opaque neighbours
        let onEdge = false;
        switch (f) {
          case 0: onEdge = y0 === 0; break; case 1: onEdge = y1 === 16; break;
          case 2: onEdge = z0 === 0; break; case 3: onEdge = z1 === 16; break;
          case 4: onEdge = x0 === 0; break; case 5: onEdge = x1 === 16; break;
        }
        if (onEdge && !bx.inset && OPQ[ids[pi + POFF[f]]]) continue;
        if (onEdge && !bx.inset && ids[pi + POFF[f]] === id && (id === B.GLASS_PANE || id === B.IRON_BARS || id === B.PORTAL || id === B.SIFT_GATE)) continue;
        const layer = bx.tex ? (typeof bx.tex === 'string' ? atlas.layer(bx.tex) : atlas.layer(bx.tex[f])) : atlas.face(id, meta, f);
        const light = onEdge ? this.flatLight(pi, f) : this.flatLight(pi, f);
        const ins = bx.inset || 0;
        let p, uv;
        switch (f) {
          case 0: p = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]; uv = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; break;
          case 1: p = [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]; uv = [[x0, z0], [x0, z1], [x1, z1], [x1, z0]]; break;
          case 2: { const zz = z0 + ins; p = [[x1, y0, zz], [x0, y0, zz], [x0, y1, zz], [x1, y1, zz]]; uv = [[16 - x1, 16 - y0], [16 - x0, 16 - y0], [16 - x0, 16 - y1], [16 - x1, 16 - y1]]; break; }
          case 3: { const zz = z1 - ins; p = [[x0, y0, zz], [x1, y0, zz], [x1, y1, zz], [x0, y1, zz]]; uv = [[x0, 16 - y0], [x1, 16 - y0], [x1, 16 - y1], [x0, 16 - y1]]; break; }
          case 4: { const xx = x0 + ins; p = [[xx, y0, z0], [xx, y0, z1], [xx, y1, z1], [xx, y1, z0]]; uv = [[z0, 16 - y0], [z1, 16 - y0], [z1, 16 - y1], [z0, 16 - y1]]; break; }
          default: { const xx = x1 - ins; p = [[xx, y0, z1], [xx, y0, z0], [xx, y1, z0], [xx, y1, z1]]; uv = [[16 - z1, 16 - y0], [16 - z0, 16 - y0], [16 - z0, 16 - y1], [16 - z1, 16 - y1]]; break; }
        }
        if (bx.flipU && f >= 2) uv = uv.map(([u, v]) => [16 - u, v]);
        if (bx.uvs && bx.uvs[f]) uv = bx.uvs[f];
        if (bx.rot && f === 1) { const r = bx.rot & 3; uv = [uv[r], uv[(r + 1) & 3], uv[(r + 2) & 3], uv[(r + 3) & 3]]; }
        const pp = p.map((q) => [xb + q[0], yb + q[1], zb + q[2]]);
        this.quad(buf, pp, uv, layer, light, tint, SHADE[f]);
        if (bx.twoSided) this.quad(buf, [pp[3], pp[2], pp[1], pp[0]], [uv[3], uv[2], uv[1], uv[0]], layer, light, tint, SHADE[f]);
      }
    }
  }

  boxesFor(pi, id, meta) {
    const ids = this.ids;
    switch (id) {
      case B.PORTAL: {
        // only the broad faces, plus any edge that doesn't run into more portal
        const P = B.PORTAL, xs = !(meta & 1), faces = xs ? [2, 3] : [4, 5];
        if (ids[pi - PD2] !== P) faces.push(0);
        if (ids[pi + PD2] !== P) faces.push(1);
        if (xs) { if (ids[pi - 1] !== P) faces.push(4); if (ids[pi + 1] !== P) faces.push(5); }
        else { if (ids[pi - PD] !== P) faces.push(2); if (ids[pi + PD] !== P) faces.push(3); }
        return [{ b: portalBox(meta), faces }];
      }
      case B.FENCE: case B.BRIMSTONE_FENCE: {
        const conn = id === B.FENCE ? (n) => n === B.FENCE || n === B.FENCE_GATE || BT.opaque[n] : (n) => n === B.BRIMSTONE_FENCE || BT.opaque[n];
        const out = [{ b: [6, 0, 6, 10, 16, 10] }];
        if (conn(ids[pi - PD])) { out.push({ b: [7, 12, 0, 9, 15, 6] }, { b: [7, 6, 0, 9, 9, 6] }); }
        if (conn(ids[pi + PD])) { out.push({ b: [7, 12, 10, 9, 15, 16] }, { b: [7, 6, 10, 9, 9, 16] }); }
        if (conn(ids[pi - 1])) { out.push({ b: [0, 12, 7, 6, 15, 9] }, { b: [0, 6, 7, 6, 9, 9] }); }
        if (conn(ids[pi + 1])) { out.push({ b: [10, 12, 7, 16, 15, 9] }, { b: [10, 6, 7, 16, 9, 9] }); }
        return out;
      }
      case B.GLASS_PANE: case B.IRON_BARS: {
        const conn = id === B.IRON_BARS ? (n) => n === B.IRON_BARS || BT.opaque[n] : (n) => n === B.GLASS_PANE || n === B.GLASS || n === B.STAINED_GLASS || BT.opaque[n];
        const n = conn(ids[pi - PD]), s = conn(ids[pi + PD]), w = conn(ids[pi - 1]), e = conn(ids[pi + 1]);
        const out = [];
        const any = n || s || w || e;
        if (!any || n || s) out.push({ b: [7, 0, (!any || n) ? 0 : 7, 9, 16, (!any || s) ? 16 : 9] });
        if (!any || w || e) out.push({ b: [(!any || w) ? 0 : 7, 0, 7, (!any || e) ? 16 : 9, 16, 9] });
        return out;
      }
      case B.FENCE_GATE: {
        const facing = meta & 3, open = (meta & 4) !== 0;
        const alongX = facing < 2;
        const B_ = (a) => alongX ? a : [a[2], a[1], a[0], a[5], a[4], a[3]];
        const out = [{ b: B_([0, 5, 7, 2, 16, 9]) }, { b: B_([14, 5, 7, 16, 16, 9]) }];
        if (!open) out.push({ b: B_([2, 6, 7, 14, 9, 9]) }, { b: B_([2, 12, 7, 14, 15, 9]) }, { b: B_([6, 9, 7, 10, 12, 9]) });
        else out.push({ b: B_([0, 6, 9, 2, 9, 15]) }, { b: B_([0, 12, 9, 2, 15, 15]) }, { b: B_([14, 6, 9, 16, 9, 15]) }, { b: B_([14, 12, 9, 16, 15, 15]) });
        return out;
      }
      case B.BED: {
        const facing = meta & 3, head = (meta & 4) !== 0;
        const rot = [2, 0, 1, 3][facing];
        return [
          { b: [0, 3, 0, 16, 9, 16], tex: ['planks_oak', head ? 'bed_top_head' : 'bed_top_foot', 'bed_side', 'bed_side', 'bed_side', 'bed_side'], rot },
          { b: [0, 0, 0, 3, 3, 3], tex: 'planks_oak' }, { b: [13, 0, 0, 16, 3, 3], tex: 'planks_oak' },
          { b: [0, 0, 13, 3, 3, 16], tex: 'planks_oak' }, { b: [13, 0, 13, 16, 3, 16], tex: 'planks_oak' },
        ];
      }
      case B.CACTUS:
        return [{ b: [1, 0, 1, 15, 16, 15], faces: [0, 1] }, { b: [0, 0, 0, 16, 16, 16], faces: [2, 3, 4, 5], inset: 1 }];
    }
    const d = BLOCKS[id];
    return d.model ? d.model(meta) : null;
  }
}
