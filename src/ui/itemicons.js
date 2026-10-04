'use strict';
// ---------------------------------------------------------------------------
// Item icons for the GUI. Blocks are ray-cast into a classic isometric view
// at the current GUI scale (crisp texels); other items are 16x16 sprites.
// ---------------------------------------------------------------------------
const ICON_TINT = { grass: [145, 189, 89], foliage: [89, 174, 48], spruce: [97, 153, 97], birch: [128, 167, 85], redwood: [86, 128, 70], water: [63, 118, 228], lily: [32, 128, 48] };

class ItemIcons {
  constructor() {
    this.cache = new Map();
    this.spriteCache = new Map();
    // view basis for the isometric projection (object space)
    this.V = [0.6124, 0.5, 0.6124];
    this.Rt = [0.7071, 0, -0.7071];
    this.Dn = [0.3536, -0.8660, 0.3536];
    this.faceShade = [0.5, 1.0, 0.82, 0.82, 0.62, 0.62];
  }
  clear() { this.cache.clear(); }

  // Returns a canvas (16*scale square) for an item stack
  get(id, dmg, scale) {
    const key = id + ':' + dmg + ':' + scale;
    let c = this.cache.get(key);
    if (c) return c;
    c = this.render(id, dmg | 0, scale);
    this.cache.set(key, c);
    return c;
  }
  spriteName(id, dmg) {
    if (id >= 256) {
      const d = ITEMS[id];
      if (!d) return '__missing';
      return typeof d.tex === 'function' ? d.tex(dmg) : d.tex;
    }
    const b = BLOCKS[id];
    if (!b) return '__missing';
    if (b.itemSprite) return typeof b.itemSprite === 'function' ? b.itemSprite(dmg) : b.itemSprite;
    const r = b.render;
    if (r === R.CROSS || r === R.TORCH || r === R.LADDER || r === R.CROP || r === R.LILY || r === R.VINE || r === R.FIRE) {
      const t = b.tex; return typeof t === 'function' ? t(dmg, 2) : typeof t === 'string' ? t : (t.side || t.top);
    }
    if (r === R.LIQUID) return b.tex.top;
    return null;   // render as a 3D block
  }
  spriteTint(id, dmg) {
    if (id === B.TALL_GRASS && dmg !== 0) return ICON_TINT.grass;
    if (id === B.VINE) return ICON_TINT.foliage;
    if (id === B.LILY_PAD) return ICON_TINT.lily;
    return null;
  }
  render(id, dmg, scale) {
    const size = 16 * scale;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const sn = this.spriteName(id, dmg);
    if (sn !== null) {
      const img = TexGen.T[sn] || TexGen.T.__missing;
      let src = img;
      const tint = this.spriteTint(id, dmg);
      if (tint || (id === ITEM_IDS.spawn_egg)) {
        src = img.copy();
        if (tint) src.mapColors((r, g, b, a) => [r * tint[0] / 255, g * tint[1] / 255, b * tint[2] / 255, a]);
        else {
          const cols = ITEMS[id].tintFn(dmg).map(hexToRgb);
          src.mapColors((r, g, b, a) => r === 255 ? [...cols[0], a] : r === 128 ? [...cols[1], a] : [r, g, b, a]);
        }
      }
      ctx.drawImage(src.toCanvas(1), 0, 0, size, size);
      return cv;
    }
    this.renderBlock(ctx, id, dmg, size);
    return cv;
  }
  blockBoxes(id, meta) {
    const b = BLOCKS[id];
    switch (id) {
      case B.FENCE: return [{ b: [6, 0, 6, 10, 16, 10] }, { b: [0, 12, 7, 16, 15, 9] }, { b: [0, 6, 7, 16, 9, 9] }];
      case B.FENCE_GATE: return [{ b: [0, 5, 7, 2, 16, 9] }, { b: [14, 5, 7, 16, 16, 9] }, { b: [2, 6, 7, 14, 9, 9] }, { b: [2, 12, 7, 14, 15, 9] }, { b: [6, 9, 7, 10, 12, 9] }];
      case B.STAIRS: return stairBoxes(((meta & 31) << 3) | 3).map((bb) => ({ b: bb.map((v) => v * 16) }));
      case B.SLAB: return [{ b: [0, 0, 0, 16, 8, 16] }];
      case B.CACTUS: return [{ b: [1, 0, 1, 15, 16, 15], faces: [0, 1] }, { b: [0, 0, 0, 16, 16, 16], faces: [2, 3, 4, 5], inset: 1 }];
      case B.CHEST: return [{ b: [1, 0, 1, 15, 14, 15] }];
      case B.SNOW_LAYER: return [{ b: [0, 0, 0, 16, 2, 16] }];
      case B.CARPET: return [{ b: [0, 0, 0, 16, 1, 16] }];
      case B.FARMLAND: return [{ b: [0, 0, 0, 16, 15, 16] }];
      case B.TRAPDOOR: return [{ b: [0, 0, 0, 16, 3, 16] }];
      case B.BED: return [{ b: [0, 3, 0, 16, 9, 16] }];
    }
    if (b.render === R.MODEL && b.model) { try { return b.model(meta); } catch (e) { return [{ b: [0, 0, 0, 16, 16, 16] }]; } }
    return [{ b: [0, 0, 0, 16, 16, 16] }];
  }
  faceTexture(id, meta, f) {
    const atlasName = (n) => n;
    const b = BLOCKS[id];
    const t = b.tex;
    let name;
    if (typeof t === 'string') name = t;
    else if (typeof t === 'function') name = t(id === B.STAIRS ? ((meta & 31) << 3) | 3 : (id === B.CHEST || id === B.FURNACE || id === B.PUMPKIN || id === B.JACK_O_LANTERN || id === B.FURNACE_LIT) ? 1 : meta, f);
    else {
      const fk = ['bottom', 'top', 'north', 'south', 'west', 'east'][f];
      name = t[fk] || (f <= 1 ? (t.top || t.side) : (t.side || t.top));
    }
    return atlasName(name);
  }
  tintFor(id, meta, f) {
    if (id === B.GRASS) return f === 1 ? ICON_TINT.grass : null;
    if (id === B.LEAVES) {
      const k = meta & 7;
      if (k === 1) return ICON_TINT.spruce; if (k === 2) return ICON_TINT.birch; if (k === 5) return ICON_TINT.redwood;
      if (k === 4 || k === 6) return null;
      return ICON_TINT.foliage;
    }
    if (id === B.WATER) return ICON_TINT.water;
    return null;
  }
  renderBlock(ctx, id, meta, size) {
    const boxes = this.blockBoxes(id, meta);
    const img = ctx.createImageData(size, size);
    const V = this.V, Rt = this.Rt, Dn = this.Dn;
    const S = size * 10 / 16;   // pixels per block unit (classic GUI scale)
    const cy = size / 2 + size * 0.02;
    const overlay = TexGen.T.grass_side_overlay;
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const sx = (px + 0.5 - size / 2) / S, sy = (py + 0.5 - cy) / S;
      // ray origin far in front, direction -V
      const ox = 0.5 + Rt[0] * sx + Dn[0] * sy + V[0] * 4;
      const oy = 0.5 + Rt[1] * sx + Dn[1] * sy + V[1] * 4;
      const oz = 0.5 + Rt[2] * sx + Dn[2] * sy + V[2] * 4;
      const dx = -V[0], dy = -V[1], dz = -V[2];
      // gather all box hits (entry & exit) sorted by distance
      const hits = [];
      for (const bx of boxes) {
        const [x0, y0, z0, x1, y1, z1] = bx.b.map((v) => v / 16);
        const ins = (bx.inset || 0) / 16;
        let tmin = -1e9, tmax = 1e9, fmin = -1, fmax = -1;
        const axes = [[ox, dx, x0 + (bx.inset ? ins : 0), x1 - (bx.inset ? ins : 0), 4, 5], [oy, dy, y0, y1, 0, 1], [oz, dz, z0 + (bx.inset ? ins : 0), z1 - (bx.inset ? ins : 0), 2, 3]];
        let ok = true;
        for (const [o, d, lo, hi, fl, fh] of axes) {
          if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } continue; }
          let t1 = (lo - o) / d, t2 = (hi - o) / d, f1 = fl, f2 = fh;
          if (t1 > t2) { [t1, t2] = [t2, t1]; [f1, f2] = [f2, f1]; }
          if (t1 > tmin) { tmin = t1; fmin = f1; }
          if (t2 < tmax) { tmax = t2; fmax = f2; }
        }
        if (!ok || tmin > tmax) continue;
        if (!bx.faces || bx.faces.indexOf(fmin) >= 0) hits.push([tmin, fmin, bx, false]);
        if (!bx.faces || bx.faces.indexOf(fmax) >= 0) hits.push([tmax, fmax, bx, true]);
      }
      hits.sort((a, b) => a[0] - b[0]);
      for (const [t, f, bx, inner] of hits) {
        const hx = ox + dx * t, hy = oy + dy * t, hz = oz + dz * t;
        let u, v;
        switch (f) {
          case 0: case 1: u = hx; v = hz; break;
          case 2: u = 1 - hx; v = 1 - hy; break;
          case 3: u = hx; v = 1 - hy; break;
          case 4: u = hz; v = 1 - hy; break;
          default: u = 1 - hz; v = 1 - hy; break;
        }
        const tu = clamp(Math.floor(u * 16), 0, 15), tv = clamp(Math.floor(v * 16), 0, 15);
        let tex = TexGen.T[bx.tex ? (typeof bx.tex === 'string' ? bx.tex : bx.tex[f]) : this.faceTexture(id, meta, f)] || TexGen.T.__missing;
        let c = tex.get(tu, tv);
        let tint = this.tintFor(id, meta, f);
        if (id === B.GRASS && f >= 2 && overlay) {
          const oc = overlay.get(tu, tv);
          if (oc[3] > 0) { c = oc; tint = ICON_TINT.grass; }
        }
        if (c[3] < 16) continue;
        const sh = this.faceShade[f] * (inner ? 0.75 : 1);
        let r = c[0] * sh, g = c[1] * sh, b = c[2] * sh;
        if (tint) { r = r * tint[0] / 255; g = g * tint[1] / 255; b = b * tint[2] / 255; }
        const i = (py * size + px) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
        img.data[i + 3] = BLOCKS[id].translucent ? Math.max(c[3], 170) : 255;
        break;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}
