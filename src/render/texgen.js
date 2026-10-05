'use strict';
// ---------------------------------------------------------------------------
// Procedural 16x16 texture generation in the spirit of classic "programmer art".
// Every texture is generated deterministically from its name.
// ---------------------------------------------------------------------------

class Img {
  constructor(w, h) { this.w = w || 16; this.h = h || 16; this.d = new Uint8ClampedArray(this.w * this.h * 4); }
  idx(x, y) { return (((y % this.h) + this.h) % this.h * this.w + (((x % this.w) + this.w) % this.w)) * 4; }
  set(x, y, c, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a === undefined ? (c[3] === undefined ? 255 : c[3]) : a;
  }
  setw(x, y, c, a) { const i = this.idx(x, y); this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a === undefined ? 255 : a; }
  get(x, y) { const i = this.idx(x, y); return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  alpha(x, y) { return this.d[this.idx(x, y) + 3]; }
  fill(c, a) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c, a); return this; }
  clear() { this.d.fill(0); return this; }
  copy() { const o = new Img(this.w, this.h); o.d.set(this.d); return o; }
  rect(x0, y0, w, h, c, a) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c, a); return this; }
  // multiply brightness of a pixel
  shade(x, y, f) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.d[i] = this.d[i] * f; this.d[i + 1] = this.d[i + 1] * f; this.d[i + 2] = this.d[i + 2] * f;
  }
  // overlay another image where it has alpha
  over(o, ox, oy) {
    ox = ox || 0; oy = oy || 0;
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
      const i = (y * o.w + x) * 4, a = o.d[i + 3] / 255;
      if (a <= 0) continue;
      const tx = x + ox, ty = y + oy;
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
      const j = (ty * this.w + tx) * 4;
      this.d[j] = this.d[j] * (1 - a) + o.d[i] * a;
      this.d[j + 1] = this.d[j + 1] * (1 - a) + o.d[i + 1] * a;
      this.d[j + 2] = this.d[j + 2] * (1 - a) + o.d[i + 2] * a;
      this.d[j + 3] = Math.max(this.d[j + 3], o.d[i + 3]);
    }
    return this;
  }
  mapColors(fn) {
    for (let i = 0; i < this.d.length; i += 4) {
      const r = fn(this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]);
      this.d[i] = r[0]; this.d[i + 1] = r[1]; this.d[i + 2] = r[2]; if (r[3] !== undefined) this.d[i + 3] = r[3];
    }
    return this;
  }
  toCanvas(scale) {
    scale = scale || 1;
    const c = document.createElement('canvas'); c.width = this.w * scale; c.height = this.h * scale;
    const ctx = c.getContext('2d');
    if (scale === 1) { ctx.putImageData(new ImageData(new Uint8ClampedArray(this.d), this.w, this.h), 0, 0); }
    else {
      const t = this.toCanvas(1); ctx.imageSmoothingEnabled = false; ctx.drawImage(t, 0, 0, c.width, c.height);
    }
    return c;
  }
}

const TexGen = (function () {
  const C = (hex) => hexToRgb(hex);
  const T = {};          // name -> Img
  const ANIM = {};       // name -> animator
  const rngFor = (name) => new Noise.Random(stringHash('tex:' + name) >>> 0);

  // Tileable value noise on a 16x16 grid with lattice period p
  function vnoise(rng, p, w, h) {
    w = w || 16; h = h || 16;
    const gw = Math.max(1, Math.round(w / p)), gh = Math.max(1, Math.round(h / p));
    const g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = rng.nextFloat();
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fx = x / w * gw, fy = y / h * gh;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = g[(y0 % gh) * gw + (x0 % gw)], b = g[(y0 % gh) * gw + ((x0 + 1) % gw)];
      const c = g[((y0 + 1) % gh) * gw + (x0 % gw)], d = g[((y0 + 1) % gh) * gw + ((x0 + 1) % gw)];
      out[y * w + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    }
    return out;
  }
  // fractal tileable noise (0..1)
  function fnoise(rng, w, h, scales, weights) {
    w = w || 16; h = h || 16;
    scales = scales || [8, 4, 2, 1]; weights = weights || [0.4, 0.3, 0.2, 0.1];
    const out = new Float32Array(w * h);
    let tw = 0;
    for (let s = 0; s < scales.length; s++) {
      const n = scales[s] <= 1 ? null : vnoise(rng, scales[s], w, h);
      for (let i = 0; i < out.length; i++) out[i] += (n ? n[i] : rng.nextFloat()) * weights[s];
      tw += weights[s];
    }
    for (let i = 0; i < out.length; i++) out[i] /= tw;
    return out;
  }
  // stretch values to 0..1
  function normalize(arr) {
    let lo = Infinity, hi = -Infinity;
    for (const v of arr) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const r = hi - lo || 1;
    for (let i = 0; i < arr.length; i++) arr[i] = (arr[i] - lo) / r;
    return arr;
  }
  function pal(list) { return list.map((h) => (typeof h === 'string' ? C(h) : h)); }
  function pick(p, v) { return p[Math.max(0, Math.min(p.length - 1, Math.floor(v * p.length)))]; }
  function noiseImg(name, palette, opts) {
    opts = opts || {};
    const rng = rngFor(name);
    const img = new Img();
    const n = normalize(fnoise(rng, 16, 16, opts.scales, opts.weights));
    const p = pal(palette);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let v = n[y * 16 + x];
      if (opts.jitter) v = Math.max(0, Math.min(0.999, v + (rng.nextFloat() - 0.5) * opts.jitter));
      img.set(x, y, pick(p, v));
    }
    return img;
  }
  function gray(v) { return [v, v, v]; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function mul(c, f) { return [c[0] * f, c[1] * f, c[2] * f]; }

  function reg(name, img) { T[name] = img; return img; }

  // ===================== natural blocks =====================
  function stone(name, base) {
    const rng = rngFor(name || 'stone');
    const img = new Img();
    const n = normalize(fnoise(rng, 16, 16, [8, 4, 2, 1], [0.25, 0.35, 0.25, 0.15]));
    const p = pal(base || ['#6b6b6b', '#737373', '#7b7b7b', '#7f7f7f', '#868686', '#8f8f8f']);
    for (let i = 0; i < 256; i++) img.set(i & 15, i >> 4, pick(p, n[i]));
    // a few darker crack-like pixels
    for (let k = 0; k < 7; k++) {
      let x = rng.nextInt(16), y = rng.nextInt(16);
      const len = 1 + rng.nextInt(3), dx = rng.nextBool() ? 1 : 0;
      for (let j = 0; j < len; j++) { img.setw(x, y, mul(p[0], 0.92)); if (dx) x++; else y++; }
    }
    return img;
  }
  reg('stone', stone('stone'));
  reg('stone_slab_top', (() => {
    const img = stone('slabtop', ['#9a9a9a', '#a3a3a3', '#a8a8a8', '#adadad']);
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#b8b8b8')); img.set(0, i, C('#b8b8b8')); img.set(i, 15, C('#737373')); img.set(15, i, C('#737373')); }
    return img;
  })());
  reg('stone_slab_side', (() => {
    const img = stone('slabside', ['#9a9a9a', '#a3a3a3', '#a8a8a8', '#adadad']);
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#b8b8b8')); img.set(i, 7, C('#737373')); img.set(i, 8, C('#b8b8b8')); img.set(i, 15, C('#737373')); img.set(0, i, C('#b0b0b0')); img.set(15, i, C('#7a7a7a')); }
    return img;
  })());

  // Voronoi stones (cobblestone & friends)
  function cobble(name, opts) {
    opts = opts || {};
    const rng = rngFor(name);
    const img = new Img();
    const pts = [];
    const n = opts.count || 11;
    for (let i = 0; i < n; i++) pts.push([rng.nextFloat() * 16, rng.nextFloat() * 16, rng.nextFloat()]);
    const light = pal(opts.light || ['#5a5a5a', '#6e6e6e', '#7e7e7e', '#8c8c8c', '#9a9a9a', '#a8a8a8']);
    const mortar = pal(opts.mortar || ['#3f3f3f', '#4a4a4a', '#545454']);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let d1 = 1e9, d2 = 1e9, best = 0;
      for (let i = 0; i < pts.length; i++) {
        for (let oy = -16; oy <= 16; oy += 16) for (let ox = -16; ox <= 16; ox += 16) {
          const dx = x + 0.5 - (pts[i][0] + ox), dy = y + 0.5 - (pts[i][1] + oy);
          const d = Math.sqrt(dx * dx + dy * dy * 1.1);
          if (d < d1) { d2 = d1; d1 = d; best = i; } else if (d < d2) d2 = d;
        }
      }
      const edge = d2 - d1;
      if (edge < (opts.edge || 0.9)) { img.set(x, y, mortar[rng.nextInt(mortar.length)]); continue; }
      // shading: brighter toward top-left of each stone
      const p = pts[best];
      let dx = x + 0.5 - p[0], dy = y + 0.5 - p[1];
      if (dx > 8) dx -= 16; if (dx < -8) dx += 16; if (dy > 8) dy -= 16; if (dy < -8) dy += 16;
      let v = 0.55 + p[2] * 0.25 - (dx + dy) * 0.06 + (rng.nextFloat() - 0.5) * 0.18;
      if (edge < 1.6) v -= 0.18;
      img.set(x, y, pick(light, Math.max(0, Math.min(0.999, v))));
    }
    return img;
  }
  reg('cobblestone', cobble('cobblestone'));
  reg('mossy_cobblestone', (() => {
    const img = cobble('cobblestone');
    const rng = rngFor('mossy');
    const n = normalize(fnoise(rng, 16, 16, [8, 4, 2], [0.5, 0.3, 0.2]));
    const moss = pal(['#3d5a2a', '#4a6b31', '#5a7d3a', '#6b8f45']);
    for (let i = 0; i < 256; i++) if (n[i] > 0.52) img.set(i & 15, i >> 4, pick(moss, (n[i] - 0.52) / 0.48 * 0.7 + rng.nextFloat() * 0.3));
    return img;
  })());

  const DIRT_PAL = ['#5a3d28', '#6b4a32', '#79553a', '#866043', '#8f6647', '#9c7352', '#b08a68'];
  function dirt(name, palette) {
    const rng = rngFor(name);
    const img = new Img();
    const p = pal(palette || DIRT_PAL);
    const n = normalize(fnoise(rng, 16, 16, [4, 2, 1], [0.3, 0.3, 0.4]));
    for (let i = 0; i < 256; i++) {
      let v = n[i];
      img.set(i & 15, i >> 4, pick(p, v * 0.86 + 0.07));
    }
    // dark & light specks
    for (let k = 0; k < 14; k++) img.set(rng.nextInt(16), rng.nextInt(16), p[rng.nextInt(2)]);
    for (let k = 0; k < 6; k++) img.set(rng.nextInt(16), rng.nextInt(16), p[p.length - 1]);
    return img;
  }
  reg('dirt', dirt('dirt'));
  reg('coarse_dirt', (() => {
    const img = dirt('coarse', ['#4f3524', '#5e412c', '#6e4c34', '#7d593d', '#8a6545', '#9a7451']);
    const rng = rngFor('coarse2');
    for (let k = 0; k < 20; k++) img.set(rng.nextInt(16), rng.nextInt(16), C(rng.nextBool() ? '#7a7a7a' : '#5e5e5e'));
    return img;
  })());
  reg('farmland_dry', (() => {
    const img = dirt('farm', ['#5c3f2a', '#6a4930', '#775338', '#835d3f', '#8d6646']);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (y % 4 === 3 || y % 4 === 0) img.shade(x, y, 0.82);
      if (y % 4 === 1) img.shade(x, y, 1.08);
    }
    return img;
  })());
  reg('farmland_wet', T.farmland_dry.copy().mapColors((r, g, b) => [r * 0.62, g * 0.58, b * 0.55]));

  // grass top is grayscale (tinted per biome at render time)
  reg('grass_top', (() => {
    const rng = rngFor('grass_top');
    const img = new Img();
    const n = normalize(fnoise(rng, 16, 16, [4, 2, 1], [0.25, 0.35, 0.4]));
    const p = [118, 134, 146, 156, 166, 178, 190].map(gray);
    for (let i = 0; i < 256; i++) img.set(i & 15, i >> 4, pick(p, n[i]));
    return img;
  })());
  function overhang(name, depthMin, depthMax) {
    const rng = rngFor(name);
    const depth = [];
    for (let x = 0; x < 16; x++) depth.push(depthMin + rng.nextInt(depthMax - depthMin + 1));
    // smooth a little but keep jaggedness
    for (let x = 0; x < 16; x++) if (rng.nextInt(4) === 0) depth[x] += 1;
    return depth;
  }
  reg('grass_side_overlay', (() => {
    const img = new Img();
    const top = T.grass_top;
    const depth = overhang('grass_side', 2, 4);
    for (let x = 0; x < 16; x++) for (let y = 0; y < depth[x]; y++) {
      const c = top.get(x, y + 5);
      img.set(x, y, [c[0], c[1], c[2]]);
    }
    return img;
  })());
  reg('grass_side', T.dirt.copy());   // base; overlay drawn as a second tinted quad
  reg('grass_side_snowed', (() => {
    const img = T.dirt.copy();
    const depth = overhang('snow_side', 3, 5);
    const snow = pal(['#e7f2f2', '#f4fbfb', '#ffffff']);
    const rng = rngFor('snowside');
    for (let x = 0; x < 16; x++) for (let y = 0; y < depth[x]; y++) img.set(x, y, snow[rng.nextInt(3)]);
    return img;
  })());
  reg('snow', noiseImg('snow', ['#dbe9ec', '#e6f2f4', '#eef8f8', '#f5fcfc', '#ffffff'], { scales: [4, 2, 1], weights: [0.3, 0.3, 0.4] }));
  reg('mycelium_top', (() => {
    const img = noiseImg('myc', ['#5c4f57', '#6a5c65', '#776873', '#857580', '#928391'], { scales: [4, 2, 1], weights: [0.3, 0.3, 0.4] });
    const rng = rngFor('myc2');
    for (let k = 0; k < 18; k++) img.set(rng.nextInt(16), rng.nextInt(16), C(rng.nextBool() ? '#b4a7b5' : '#a497a6'));
    return img;
  })());
  reg('mycelium_side', (() => {
    const img = T.dirt.copy(); const top = T.mycelium_top; const depth = overhang('myc_side', 2, 4);
    for (let x = 0; x < 16; x++) for (let y = 0; y < depth[x]; y++) img.set(x, y, top.get(x, y + 3));
    return img;
  })());
  reg('podzol_top', (() => {
    const img = noiseImg('podzol', ['#4a3118', '#5a3c1d', '#6b4823', '#7c552a', '#8e6332'], { scales: [4, 2, 1], weights: [0.2, 0.35, 0.45] });
    const rng = rngFor('podzol2');
    for (let k = 0; k < 12; k++) { const x = rng.nextInt(16), y = rng.nextInt(16); img.set(x, y, C('#9c7038')); img.set(x + 1, y, C('#866030')); }
    return img;
  })());
  reg('podzol_side', (() => {
    const img = T.dirt.copy(); const top = T.podzol_top; const depth = overhang('pod_side', 2, 4);
    for (let x = 0; x < 16; x++) for (let y = 0; y < depth[x]; y++) img.set(x, y, top.get(x, y + 4));
    return img;
  })());

  reg('sand', (() => {
    const img = noiseImg('sand', ['#cfc48e', '#d6cc96', '#dbd3a0', '#e0d8a8', '#e6dfb4'], { scales: [4, 2, 1], weights: [0.2, 0.3, 0.5] });
    const rng = rngFor('sand2');
    for (let k = 0; k < 10; k++) img.set(rng.nextInt(16), rng.nextInt(16), C(rng.nextBool() ? '#c4b67f' : '#ece6c2'));
    return img;
  })());
  reg('red_sand', T.sand.copy().mapColors((r, g, b) => [r * 0.86 + 20, g * 0.56, b * 0.33]));
  reg('quicksand', (() => {
    const img = noiseImg('quicksand', ['#b9ab74', '#c2b47c', '#cbbe87', '#d2c690'], { scales: [8, 4, 2], weights: [0.4, 0.35, 0.25] });
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const s = Math.sin((x + y * 0.5) * 0.9) * Math.cos(y * 0.6);
      if (s > 0.55) img.shade(x, y, 0.9);
    }
    return img;
  })());
  reg('gravel', (() => {
    const rng = rngFor('gravel');
    const img = new Img().fill(C('#7a7070'));
    const cols = pal(['#5f5959', '#6e6767', '#7f7676', '#8e8584', '#9f9594', '#ada3a1', '#857a6e', '#6b6157', '#93877c']);
    // pebbles
    for (let k = 0; k < 40; k++) {
      const x = rng.nextInt(16), y = rng.nextInt(16), c = cols[rng.nextInt(cols.length)];
      const w = 1 + rng.nextInt(3), h = 1 + rng.nextInt(2);
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) img.setw(x + xx, y + yy, mul(c, 1 + (yy === 0 && xx === 0 ? 0.12 : 0) - (yy === h - 1 ? 0.08 : 0)));
    }
    for (let k = 0; k < 18; k++) img.setw(rng.nextInt(16), rng.nextInt(16), C('#4f4949'));
    return img;
  })());
  reg('clay', noiseImg('clay', ['#949aa6', '#9aa0ac', '#9fa5b1', '#a5abb7', '#aab0bc'], { scales: [8, 4, 1], weights: [0.3, 0.3, 0.4] }));
  reg('bedrock', (() => {
    const rng = rngFor('bedrock');
    const img = new Img();
    const n = normalize(fnoise(rng, 16, 16, [4, 2, 1], [0.35, 0.35, 0.3]));
    const p = pal(['#1e1e1e', '#2f2f2f', '#3e3e3e', '#565656', '#6b6b6b', '#7f7f7f']);
    for (let i = 0; i < 256; i++) img.set(i & 15, i >> 4, pick(p, Math.min(0.999, n[i] * 1.1 * (0.7 + rng.nextFloat() * 0.5))));
    return img;
  })());
  reg('obsidian', (() => {
    const img = noiseImg('obsidian', ['#0f0a18', '#140e20', '#1b1229', '#241836', '#2f2044', '#3b2754'], { scales: [8, 4, 2, 1], weights: [0.2, 0.3, 0.3, 0.2] });
    const rng = rngFor('obs2');
    for (let k = 0; k < 6; k++) img.set(rng.nextInt(16), rng.nextInt(16), C('#5c437d'));
    return img;
  })());
  reg('ice', (() => {
    const img = noiseImg('ice', ['#7ea6e8', '#86aef0', '#8eb6f5', '#96bdf8'], { scales: [8, 4], weights: [0.6, 0.4] });
    for (let i = 0; i < 256; i++) img.d[i * 4 + 3] = 170;
    const rng = rngFor('ice2');
    for (let k = 0; k < 4; k++) { let x = rng.nextInt(16), y = rng.nextInt(16); for (let j = 0; j < 4; j++) { img.set(x, y, C('#d4e6ff'), 200); x++; y--; } }
    return img;
  })());
  reg('packed_ice', (() => {
    const img = noiseImg('pice', ['#8bb2f2', '#93baf5', '#9cc2f8', '#a7cafa', '#b4d3fc'], { scales: [8, 4, 2], weights: [0.4, 0.4, 0.2] });
    const rng = rngFor('pice2');
    for (let k = 0; k < 5; k++) { let x = rng.nextInt(16), y = rng.nextInt(16); for (let j = 0; j < 5; j++) { img.setw(x, y, C('#e0eeff')); x++; if (rng.nextBool()) y--; } }
    return img;
  })());

  // ---- ores ----
  const ORE_SHAPES = [
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1]],
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[0, 0], [1, 0], [2, 0], [1, 1]],
    [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
    [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1]],
    [[0, 0], [1, 1], [0, 1]],
    [[1, 0], [2, 0], [0, 1], [1, 1]],
  ];
  function ore(name, base, colors, opts) {
    opts = opts || {};
    const img = (base || T.stone).copy();
    const rng = rngFor(name);
    const p = pal(colors);
    const clusters = opts.clusters || 5;
    const placed = [];
    for (let c = 0; c < clusters; c++) {
      let cx, cy, tries = 0;
      do { cx = rng.nextInt(14); cy = rng.nextInt(14); tries++; }
      while (tries < 60 && placed.some(([x, y]) => Math.abs(x - cx) < 4 && Math.abs(y - cy) < 4));
      placed.push([cx, cy]);
      const shape = ORE_SHAPES[rng.nextInt(ORE_SHAPES.length)];
      const cells = shape.map(([x, y]) => [cx + x, cy + y]);
      const has = (x, y) => cells.some(([a, b]) => a === x && b === y);
      // dark rim (subtle) under & right of the cluster
      if (opts.outline) for (const [x, y] of cells) {
        if (!has(x, y + 1)) img.setw(x, y + 1, mul(img.get(x, y + 1), 0.8));
        if (!has(x + 1, y)) img.setw(x + 1, y, mul(img.get(x + 1, y), 0.86));
      }
      for (const [x, y] of cells) {
        let ci = 1;
        if (!has(x, y - 1) && !has(x - 1, y)) ci = 2;          // top-left: highlight
        else if (!has(x, y + 1) && !has(x + 1, y)) ci = 0;     // bottom-right: shadow
        img.setw(x, y, p[ci]);
      }
    }
    return img;
  }
  reg('coal_ore', ore('coal_ore', null, ['#141414', '#2a2a2a', '#404040'], { clusters: 6 }));
  reg('iron_ore', ore('iron_ore', null, ['#a07a5e', '#d8af93', '#ead0bd'], { clusters: 5, outline: true }));
  reg('gold_ore', ore('gold_ore', null, ['#c99a13', '#fcee4b', '#fffbb3'], { clusters: 5, outline: true }));
  reg('diamond_ore', ore('diamond_ore', null, ['#1aa7ad', '#5decf5', '#d8fffb'], { clusters: 5, outline: true }));
  reg('lapis_ore', ore('lapis_ore', null, ['#0f2b6e', '#1d47a8', '#3f6fd6'], { clusters: 6 }));
  reg('ember_ore', ore('ember_ore', null, ['#7a1408', '#c2321a', '#f0702e'], { clusters: 6 }));
  reg('ember_ore_lit', ore('ember_ore', null, ['#c2321a', '#ff7a2b', '#ffd27a'], { clusters: 6 }));
  reg('jade_ore', ore('jade_ore', null, ['#145c33', '#2f9e5c', '#7fe0a6'], { clusters: 4, outline: true }));
  reg('sulfur_ore', ore('sulfur_ore', null, ['#9a9a20', '#d9d94a', '#f7f7a0'], { clusters: 6 }));

  // ---- new stones ----
  reg('slate', (() => {
    const rng = rngFor('slate');
    const img = new Img();
    const n = normalize(fnoise(rng, 16, 16, [8, 4, 2, 1], [0.2, 0.3, 0.3, 0.2]));
    const p = pal(['#363b42', '#3e434a', '#454b53', '#4c525b', '#545b64', '#5d646e']);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let v = n[y * 16 + x];
      if (y % 4 === 0) v *= 0.75; // layering
      img.set(x, y, pick(p, v));
    }
    for (let k = 0; k < 8; k++) { const y = rng.nextInt(16), x = rng.nextInt(12); for (let j = 0; j < 3 + rng.nextInt(3); j++) img.setw(x + j, y, C('#2c3036')); }
    return img;
  })());
  reg('cobalt_ore', ore('cobalt_ore', T.slate, ['#1e2a8a', '#3d5bd9', '#9fb2ff'], { clusters: 5, outline: true }));
  reg('starmetal_ore', (() => {
    const img = noiseImg('starrock', ['#140f1f', '#1d1630', '#271d40', '#30244e'], { scales: [4, 2, 1], weights: [0.4, 0.3, 0.3] });
    const rng = rngFor('starmetal');
    const glint = pal(['#6a5acd', '#b8a8ff', '#ffffff']);
    for (let k = 0; k < 7; k++) {
      const x = 1 + rng.nextInt(14), y = 1 + rng.nextInt(14);
      img.set(x, y, glint[2]); img.set(x - 1, y, glint[1]); img.set(x + 1, y, glint[1]); img.set(x, y - 1, glint[0]); img.set(x, y + 1, glint[0]);
    }
    return img;
  })());
  reg('marble', (() => {
    const img = noiseImg('marble', ['#d3d0c9', '#dcd9d3', '#e5e3de', '#eeece8', '#f6f5f2'], { scales: [8, 4, 2], weights: [0.4, 0.35, 0.25] });
    const rng = rngFor('marble2');
    for (let v = 0; v < 2; v++) {
      let x = rng.nextInt(16), y = 0;
      while (y < 16) { img.setw(x, y, C('#a9a49c')); if (rng.nextInt(3) === 0) img.setw(x + 1, y, C('#bfbab3')); x += rng.nextInt(3) - 1; y++; }
    }
    return img;
  })());
  reg('basalt_side', (() => {
    const rng = rngFor('basalt');
    const img = new Img();
    const p = pal(['#2a2a2e', '#323236', '#3a3a3f', '#434348', '#4c4c52']);
    const colW = [3, 4, 3, 3, 3];
    let x = 0, ci = 0;
    while (x < 16) {
      const w = colW[ci++ % colW.length];
      const base = rng.nextFloat() * 0.6 + 0.2;
      for (let xx = 0; xx < w && x + xx < 16; xx++) for (let y = 0; y < 16; y++) {
        let v = base + (rng.nextFloat() - 0.5) * 0.25 + (xx === 0 ? 0.15 : 0) - (xx === w - 1 ? 0.2 : 0);
        img.set(x + xx, y, pick(p, Math.max(0, Math.min(0.999, v))));
      }
      x += w;
    }
    return img;
  })());
  reg('basalt_top', (() => {
    const img = cobble('basalt_top', { count: 7, light: ['#2a2a2e', '#323236', '#3a3a3f', '#434348', '#4c4c52'], mortar: ['#1c1c1f', '#202024'], edge: 0.7 });
    return img;
  })());
  reg('polished_basalt_side', (() => {
    const img = noiseImg('pbasalt', ['#38383d', '#3e3e43', '#44444a'], { scales: [8, 4, 1], weights: [0.4, 0.3, 0.3] });
    for (let i = 0; i < 16; i++) { img.set(0, i, C('#55555c')); img.set(15, i, C('#29292d')); img.set(i, 0, C('#55555c')); img.set(i, 15, C('#29292d')); }
    for (let i = 2; i < 14; i++) { img.set(7, i, C('#323237')); img.set(8, i, C('#4a4a50')); }
    return img;
  })());
  reg('polished_basalt_top', (() => {
    const img = noiseImg('pbasalt_t', ['#38383d', '#3e3e43', '#44444a'], { scales: [8, 4, 1], weights: [0.4, 0.3, 0.3] });
    for (let i = 0; i < 16; i++) { img.set(0, i, C('#55555c')); img.set(15, i, C('#29292d')); img.set(i, 0, C('#55555c')); img.set(i, 15, C('#29292d')); }
    for (let i = 4; i < 12; i++) { img.set(4, i, C('#2f2f34')); img.set(11, i, C('#4f4f56')); img.set(i, 4, C('#2f2f34')); img.set(i, 11, C('#4f4f56')); }
    return img;
  })());
  reg('ash', (() => {
    const img = noiseImg('ash', ['#7f7d79', '#8a8884', '#959390', '#a19f9b', '#adaba7', '#bab8b4'], { scales: [4, 2, 1], weights: [0.25, 0.3, 0.45] });
    const rng = rngFor('ash2');
    for (let k = 0; k < 8; k++) img.set(rng.nextInt(16), rng.nextInt(16), C('#5e5c59'));
    for (let k = 0; k < 2; k++) img.set(rng.nextInt(16), rng.nextInt(16), C('#d0582a'));
    return img;
  })());
  reg('peat', (() => {
    const img = noiseImg('peat', ['#241912', '#2c1f16', '#35261b', '#3f2d20', '#4a3626'], { scales: [4, 2, 1], weights: [0.3, 0.3, 0.4] });
    const rng = rngFor('peat2');
    for (let k = 0; k < 14; k++) { const x = rng.nextInt(16), y = rng.nextInt(16); img.set(x, y, C('#5a4430')); img.set(x + 1, y + (rng.nextBool() ? 1 : 0), C('#4e3a29')); }
    return img;
  })());
  reg('salt', (() => {
    const img = noiseImg('salt', ['#ddd5d5', '#e6dfdf', '#eee9e9', '#f5f2f2', '#ffffff'], { scales: [4, 2, 1], weights: [0.3, 0.3, 0.4] });
    const rng = rngFor('salt2');
    // polygon cracks
    for (let k = 0; k < 3; k++) { let x = rng.nextInt(16), y = rng.nextInt(16); for (let j = 0; j < 7; j++) { img.setw(x, y, C('#c9bcbc')); if (rng.nextBool()) x++; else y++; } }
    return img;
  })());
  reg('scorched_stone', (() => {
    const img = stone('scorched', ['#231d1a', '#2a2420', '#332c27', '#3c342e', '#463d36', '#504640']);
    const rng = rngFor('scorched2');
    for (let k = 0; k < 4; k++) img.set(rng.nextInt(16), rng.nextInt(16), C(rng.nextBool() ? '#c4521e' : '#8a3a16'));
    return img;
  })());
  reg('runestone', (() => {
    const img = stone('runestone', ['#2b2f33', '#33383d', '#3b4046', '#434950', '#4b525a']);
    // carved rune glyph glowing cyan
    const glyph = [
      '................',
      '................',
      '.......##.......',
      '......#..#......',
      '.....#....#.....',
      '.......##.......',
      '.......##.......',
      '....########....',
      '.......##.......',
      '.......##.......',
      '......#..#......',
      '.....#....#.....',
      '....#......#....',
      '................',
      '................',
      '................'];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (glyph[y][x] === '#') { img.set(x, y, C('#5cf2e8')); img.set(x + 1, y + 1, C('#1d4f52')); }
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#53595f')); img.set(i, 15, C('#202326')); }
    return img;
  })());
  reg('runestone_top', (() => {
    const img = stone('runestone_t', ['#2b2f33', '#33383d', '#3b4046', '#434950']);
    for (let i = 3; i < 13; i++) { img.set(i, 3, C('#5cf2e8')); img.set(i, 12, C('#5cf2e8')); img.set(3, i, C('#5cf2e8')); img.set(12, i, C('#5cf2e8')); }
    img.rect(7, 7, 2, 2, C('#a8fff9'));
    return img;
  })());

  // ===================== wood =====================
  const WOODPAL = {
    oak:     { plank: ['#7a6038', '#8a6d40', '#9c7f4e', '#a88a57', '#b8965f'], bark: ['#4a3820', '#5a4428', '#6b5232', '#7e6240'], ring: ['#8a6b3e', '#a07c4c', '#b4905a'] },
    spruce:  { plank: ['#523a20', '#5e4426', '#6b4f2c', '#785832', '#856139'], bark: ['#2a1c0e', '#352414', '#3f2c18', '#4c361f'], ring: ['#5e4426', '#6e5030', '#7d5c37'] },
    birch:   { plank: ['#b3a36a', '#bfae74', '#c8b77a', '#d0c084', '#d7c890'], bark: ['#d8d8d2', '#e6e6e0', '#f0f0ea', '#c4c4bc'], ring: ['#b8a46c', '#cdb97d', '#dccb90'] },
    jungle:  { plank: ['#80573a', '#8d6142', '#9a6b4a', '#a67452', '#b07d57'], bark: ['#463818', '#55451e', '#5f4f23', '#6e5f2a'], ring: ['#8d6142', '#a06e4b', '#b27c55'] },
    maple:   { plank: ['#94573d', '#a26043', '#b06a49', '#bc7451', '#c67e59'], bark: ['#4a3a34', '#594640', '#68534c', '#76615a'], ring: ['#a8684a', '#bf7856', '#d18a63'] },
    redwood: { plank: ['#6e2c1f', '#7b3324', '#8c3a2a', '#9a4230', '#a84a37'], bark: ['#5a2414', '#6c2e1a', '#7e3820', '#8f4227'], ring: ['#8c3a2a', '#a04634', '#b4523d'] },
    glimmer: { plank: ['#7a7498', '#86809f', '#928cac', '#9e98b8', '#aaa4c4'], bark: ['#4c4670', '#5a547e', '#68628e', '#78729e'], ring: ['#8e88aa', '#a29cbe', '#b6b0d0'] },
  };
  function planks(w) {
    const P = pal(WOODPAL[w].plank);
    const rng = rngFor('planks_' + w);
    const img = new Img();
    for (let board = 0; board < 4; board++) {
      const seam = rng.nextInt(16);
      const tone = rng.nextFloat() * 0.3 - 0.15;
      for (let y = board * 4; y < board * 4 + 4; y++) {
        for (let x = 0; x < 16; x++) {
          let v = 0.55 + tone + Math.sin((x + board * 5) * 0.7 + y * 0.3) * 0.08 + (rng.nextFloat() - 0.5) * 0.25;
          if (y === board * 4 + 3) v = 0.05;              // dark gap under each board
          else if (y === board * 4) v += 0.12;              // highlight on top edge
          if (x === seam && y !== board * 4 + 3) v = 0.12;  // end seam
          img.set(x, y, pick(P, Math.max(0, Math.min(0.999, v))));
        }
      }
    }
    return img;
  }
  function logSide(w) {
    const P = pal(WOODPAL[w].bark);
    const rng = rngFor('log_' + w);
    const img = new Img();
    if (w === 'birch') {
      const n = normalize(fnoise(rng, 16, 16, [8, 2], [0.5, 0.5]));
      for (let i = 0; i < 256; i++) img.set(i & 15, i >> 4, pick(P.slice(0, 3), n[i]));
      for (let k = 0; k < 9; k++) {
        const y = rng.nextInt(16), x = rng.nextInt(14), len = 1 + rng.nextInt(4);
        for (let j = 0; j < len; j++) img.setw(x + j, y, C(j === 0 || j === len - 1 ? '#545454' : '#2b2b2b'));
      }
      return img;
    }
    const n = vnoise(rng, 4);
    for (let x = 0; x < 16; x++) {
      const colBase = rng.nextFloat();
      for (let y = 0; y < 16; y++) {
        let v = colBase * 0.5 + n[(y * 16 + x)] * 0.3 + rng.nextFloat() * 0.2;
        if ((x + Math.floor(y / 5)) % 4 === 0) v *= 0.5; // dark furrows
        img.set(x, y, pick(P, Math.min(0.999, v)));
      }
    }
    if (w === 'jungle') { for (let k = 0; k < 10; k++) img.set(rng.nextInt(16), rng.nextInt(16), C(rng.nextBool() ? '#4c6b2a' : '#5d7d33')); }
    if (w === 'glimmer') { for (let k = 0; k < 8; k++) img.set(rng.nextInt(16), rng.nextInt(16), C(k % 3 ? '#cfc4ff' : '#fff4c8')); }
    return img;
  }
  function logTop(w) {
    const R = pal(WOODPAL[w].ring), Bk = pal(WOODPAL[w].bark);
    const rng = rngFor('logtop_' + w);
    const img = new Img();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d > 6.6) { img.set(x, y, Bk[rng.nextInt(Bk.length)]); continue; }
      const ring = Math.floor(d + (rng.nextFloat() - 0.5) * 0.6) % 2;
      img.set(x, y, R[ring === 0 ? 2 : (rng.nextInt(3) === 0 ? 0 : 1)]);
    }
    return img;
  }
  for (const w of WOOD) {
    reg('planks_' + w, planks(w));
    reg('log_' + w, logSide(w));
    reg('log_' + w + '_top', logTop(w));
  }

  // leaves: grayscale (tinted), with holes
  function leaves(name, opts) {
    opts = opts || {};
    const rng = rngFor(name);
    const img = new Img();
    const n = normalize(fnoise(rng, 16, 16, [4, 2, 1], [0.3, 0.3, 0.4]));
    const p = opts.palette ? pal(opts.palette) : [72, 92, 112, 130, 148, 166, 184].map(gray);
    for (let i = 0; i < 256; i++) {
      const x = i & 15, y = i >> 4;
      const hole = rng.nextFloat() < (opts.holes === undefined ? 0.22 : opts.holes);
      if (hole) { img.set(x, y, [0, 0, 0], 0); continue; }
      let v = n[i];
      if (opts.multi) img.set(x, y, opts.multi(rng, v)); else img.set(x, y, pick(p, v));
    }
    return img;
  }
  reg('leaves_oak', leaves('leaves_oak'));
  reg('leaves_spruce', leaves('leaves_spruce', { holes: 0.16 }));
  reg('leaves_birch', leaves('leaves_birch', { holes: 0.24 }));
  reg('leaves_jungle', leaves('leaves_jungle', { holes: 0.15 }));
  reg('leaves_redwood', leaves('leaves_redwood', { holes: 0.18 }));
  reg('leaves_maple', leaves('leaves_maple', {
    holes: 0.2, multi: (rng, v) => pick(pal(['#7a1a0c', '#9a2412', '#b8341a', '#cf4a20', '#e0662a', '#e88a2e']), Math.min(0.999, v * 0.8 + rng.nextFloat() * 0.2)),
  }));
  reg('leaves_gold_maple', leaves('leaves_gold_maple', {
    holes: 0.2, multi: (rng, v) => pick(pal(['#8a5a10', '#a8701a', '#c48c22', '#d9a42c', '#e8bc3c', '#f2d055']), Math.min(0.999, v * 0.8 + rng.nextFloat() * 0.2)),
  }));
  reg('leaf_litter', (() => {
    const rng = rngFor('litter');
    const img = new Img();
    const cols = pal(['#9a2412', '#cf4a20', '#e0662a', '#d9a42c', '#a8701a', '#7a5328', '#b8341a']);
    for (let k = 0; k < 26; k++) {
      const x = rng.nextInt(16), y = rng.nextInt(16), c = cols[rng.nextInt(cols.length)];
      img.setw(x, y, c); img.setw(x + 1, y, mul(c, 0.85));
      if (rng.nextBool()) img.setw(x, y + 1, mul(c, 0.9));
    }
    return img;
  })());

  // ===================== crafted / building =====================
  reg('bricks', (() => {
    const rng = rngFor('bricks');
    const img = new Img().fill(C('#b3a59c'));
    const P = pal(['#7f3f30', '#8c4434', '#96503d', '#a1584a', '#a6634e']);
    for (let row = 0; row < 4; row++) {
      const off = (row % 2) * 4;
      for (let bx = -1; bx < 3; bx++) {
        const x0 = bx * 8 + off, tone = rng.nextFloat() * 0.5;
        for (let y = row * 4; y < row * 4 + 3; y++) for (let x = x0; x < x0 + 7; x++) {
          if (x < 0 || x >= 16) continue;
          let v = tone + rng.nextFloat() * 0.5;
          if (y === row * 4) v += 0.15;
          img.set(x, y, pick(P, Math.min(0.999, v)));
        }
      }
      for (let x = 0; x < 16; x++) img.set(x, row * 4 + 3, C(rng.nextBool() ? '#b9aea6' : '#a59990'));
    }
    return img;
  })());
  function stoneBricks(name, palette, dark, light, opts) {
    opts = opts || {};
    const rng = rngFor(name);
    const img = stone(name + '_base', palette);
    const D = C(dark), L = C(light);
    const rows = opts.rows || [[0, 8, [0]], [8, 8, [8]]]; // [y0, h, seamsX]
    for (const [y0, h, seams] of rows) {
      for (let x = 0; x < 16; x++) { img.set(x, y0, L); img.set(x, y0 + h - 1, D); }
      for (const sx of seams) for (let y = y0; y < y0 + h; y++) { img.set(sx, y, L); img.set((sx + 15) % 16, y, D); }
    }
    return img;
  }
  reg('stone_bricks', stoneBricks('sbrick', ['#6f6f6f', '#767676', '#7c7c7c', '#828282'], '#545454', '#8e8e8e'));
  reg('stone_bricks_mossy', (() => {
    const img = T.stone_bricks.copy(); const rng = rngFor('sbmoss');
    const n = normalize(fnoise(rng, 16, 16, [8, 4, 2], [0.5, 0.3, 0.2]));
    const moss = pal(['#3d5a2a', '#4a6b31', '#5a7d3a', '#6b8f45']);
    for (let i = 0; i < 256; i++) if (n[i] > 0.55) img.set(i & 15, i >> 4, pick(moss, rng.nextFloat()));
    return img;
  })());
  reg('stone_bricks_cracked', (() => {
    const img = T.stone_bricks.copy(); const rng = rngFor('sbcrack');
    for (let k = 0; k < 3; k++) { let x = 2 + rng.nextInt(12), y = rng.nextInt(16); for (let j = 0; j < 6; j++) { img.setw(x, y, C('#3e3e3e')); x += rng.nextInt(3) - 1; y++; } }
    return img;
  })());
  reg('stone_bricks_carved', (() => {
    const img = stone('sbcarved', ['#6f6f6f', '#767676', '#7c7c7c', '#828282']);
    const D = C('#545454'), L = C('#8e8e8e');
    for (let i = 0; i < 16; i++) { img.set(i, 0, L); img.set(0, i, L); img.set(i, 15, D); img.set(15, i, D); }
    for (let i = 3; i < 13; i++) { img.set(i, 3, D); img.set(3, i, D); img.set(i, 12, L); img.set(12, i, L); }
    for (let i = 6; i < 10; i++) { img.set(i, 6, L); img.set(6, i, L); img.set(i, 9, D); img.set(9, i, D); }
    return img;
  })());
  reg('slate_bricks', stoneBricks('slbrick', ['#3a3f46', '#40454c', '#464c54', '#4c525b'], '#25292e', '#5c636c', { rows: [[0, 4, [3]], [4, 4, [11]], [8, 4, [5]], [12, 4, [13]]] }));
  reg('marble_bricks', stoneBricks('mbrick', ['#dcd9d3', '#e5e3de', '#eeece8', '#f2f0ec'], '#b6b1a9', '#ffffff'));
  reg('marble_pillar', (() => {
    const img = noiseImg('mpillar', ['#dcd9d3', '#e5e3de', '#eeece8', '#f2f0ec'], { scales: [4, 1], weights: [0.5, 0.5] });
    for (let y = 0; y < 16; y++) { for (const x of [2, 6, 10, 14]) { img.set(x, y, C('#c4bfb7')); img.set(x + 1, y, C('#fbfaf8')); } img.set(0, y, C('#b6b1a9')); }
    return img;
  })());
  reg('marble_pillar_top', (() => {
    const img = noiseImg('mpillart', ['#dcd9d3', '#e5e3de', '#eeece8'], { scales: [4, 1], weights: [0.5, 0.5] });
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#fbfaf8')); img.set(0, i, C('#fbfaf8')); img.set(i, 15, C('#b6b1a9')); img.set(15, i, C('#b6b1a9')); }
    for (let i = 4; i < 12; i++) { img.set(i, 4, C('#c4bfb7')); img.set(4, i, C('#c4bfb7')); img.set(i, 11, C('#fbfaf8')); img.set(11, i, C('#fbfaf8')); }
    return img;
  })());
  reg('marble_carved', (() => {
    const img = T.marble_pillar_top.copy();
    for (let i = 6; i < 10; i++) { img.set(i, 7, C('#a9a49c')); img.set(7, i, C('#a9a49c')); }
    return img;
  })());

  function sandstoneSet(prefix, P0) {
    const P = pal(P0);
    const rng = rngFor(prefix);
    const top = new Img();
    const n = normalize(fnoise(rng, 16, 16, [4, 2, 1], [0.3, 0.3, 0.4]));
    for (let i = 0; i < 256; i++) top.set(i & 15, i >> 4, pick(P.slice(1), n[i]));
    reg(prefix + '_top', top);
    const side = new Img();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let v = n[((y * 7) % 16) * 16 + x] * 0.6 + 0.3;
      if (y < 3) v = 0.75 + rng.nextFloat() * 0.2;
      if (y === 3 || y === 11) v = 0.15;
      if (y === 12) v = 0.8;
      side.set(x, y, pick(P, Math.min(0.999, v)));
    }
    reg(prefix + '_side', side);
    const bottom = top.copy();
    for (let k = 0; k < 12; k++) bottom.set(rng.nextInt(16), rng.nextInt(16), P[0]);
    reg(prefix + '_bottom', bottom);
    const smooth = new Img().fill(P[2]);
    for (let i = 0; i < 256; i++) if (rng.nextInt(6) === 0) smooth.set(i & 15, i >> 4, P[3]);
    reg(prefix + '_smooth', smooth);
    const carved = side.copy();
    for (let y = 4; y < 11; y++) for (let x = 2; x < 14; x++) carved.set(x, y, P[2]);
    const glyph = ['..##..##..', '.#..##..#.', '..#....#..', '.#..##..#.', '..##..##..'];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 10; x++) if (glyph[y][x] === '#') carved.set(3 + x, 5 + y, P[0]);
    reg(prefix + '_carved', carved);
  }
  sandstoneSet('sandstone', ['#a89a62', '#cbbd85', '#d4c68f', '#ddd09a', '#e6dba8']);
  sandstoneSet('red_sandstone', ['#8a4314', '#a6541c', '#b55e22', '#c06a2a', '#cc7636']);

  reg('glass', (() => {
    const img = new Img();
    const F = C('#dbf4f7'), H = C('#ffffff');
    for (let i = 0; i < 16; i++) { img.set(i, 0, F); img.set(0, i, F); img.set(i, 15, C('#a8d6dc')); img.set(15, i, C('#a8d6dc')); }
    img.set(0, 0, H);
    for (let k = 0; k < 3; k++) { img.set(3 + k, 5 - k, H, 210); img.set(4 + k, 6 - k, F, 160); }
    for (let k = 0; k < 2; k++) img.set(10 + k, 12 - k, H, 200);
    return img;
  })());
  for (let c = 0; c < 16; c++) {
    const col = C(COLOR_RGB[c]);
    const img = new Img();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      img.set(x, y, edge ? mix(col, [255, 255, 255], 0.3) : col, edge ? 230 : 130);
    }
    img.set(4, 4, mix(col, [255, 255, 255], 0.6), 200); img.set(5, 3, mix(col, [255, 255, 255], 0.6), 200);
    reg('stained_glass_' + COLORS[c], img);
  }

  // wool & terracotta
  for (let c = 0; c < 16; c++) {
    const col = C(COLOR_RGB[c]);
    const rng = rngFor('wool' + c);
    const img = new Img();
    const n = normalize(fnoise(rng, 16, 16, [4, 2, 1], [0.3, 0.3, 0.4]));
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const wave = Math.sin((x + y) * 1.1) * 0.06 + Math.sin((x - y) * 0.8) * 0.04;
      const f = 0.82 + n[y * 16 + x] * 0.26 + wave;
      img.set(x, y, mul(col, f));
    }
    reg('wool_' + COLORS[c], img);
    const tc = mix(mix(col, C('#985e43'), 0.45), [128, 128, 128], 0.1);
    reg('terracotta_' + COLORS[c], (() => {
      const t = new Img(); const n2 = normalize(fnoise(rngFor('tc' + c), 16, 16, [8, 2, 1], [0.4, 0.3, 0.3]));
      for (let i = 0; i < 256; i++) t.set(i & 15, i >> 4, mul(tc, 0.92 + n2[i] * 0.14));
      return t;
    })());
  }
  reg('terracotta', noiseImg('terracotta', ['#8f573e', '#965c42', '#9b6045', '#a0644a'], { scales: [8, 2, 1], weights: [0.4, 0.3, 0.3] }));

  // ---- utility blocks ----
  reg('crafting_table_top', (() => {
    const img = T.planks_oak.copy();
    const D = C('#4f3a22'), M = C('#6b5232');
    for (let i = 0; i < 16; i++) { img.set(i, 0, D); img.set(0, i, D); img.set(i, 15, D); img.set(15, i, D); }
    for (let i = 1; i < 15; i++) { img.set(i, 1, M); img.set(1, i, M); }
    // inset 3x3 grid work surface
    for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) img.set(x, y, mul(img.get(x, y), 1.1));
    for (let i = 3; i < 13; i++) { img.set(6, i, M); img.set(9, i, M); img.set(i, 6, M); img.set(i, 9, M); }
    return img;
  })());
  function hangingTools(img, saw) {
    const G = C('#8a8a8a'), GL = C('#b4b4b4'), GD = C('#5a5a5a'), H = C('#6b4a2a'), HL = C('#8c6238');
    if (saw) {
      // saw: blade on the left
      for (let y = 4; y < 11; y++) for (let x = 2; x < 6; x++) img.set(x, y, (x + y) % 2 ? G : GL);
      for (let y = 4; y < 11; y++) img.set(1, y, GD);
      img.rect(2, 2, 3, 2, H); img.set(3, 2, HL);
      // hammer on the right
      img.rect(9, 3, 5, 2, GD); img.rect(10, 3, 3, 1, GL);
      for (let y = 5; y < 12; y++) { img.set(11, y, H); img.set(12, y, HL); }
    } else {
      // pliers & hand drill
      for (let y = 3; y < 12; y++) { img.set(3 + (y > 7 ? 1 : 0), y, GD); img.set(6 - (y > 7 ? 1 : 0), y, GD); }
      img.rect(3, 2, 4, 1, G);
      img.rect(10, 2, 3, 3, H); img.set(11, 3, HL);
      for (let y = 5; y < 13; y++) img.set(11, y, y % 2 ? GL : G);
    }
  }
  reg('crafting_table_side', (() => {
    const img = T.planks_oak.copy();
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#4f3a22')); img.set(i, 15, C('#4f3a22')); }
    hangingTools(img, true);
    return img;
  })());
  reg('crafting_table_front', (() => {
    const img = T.planks_oak.copy();
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#4f3a22')); img.set(i, 15, C('#4f3a22')); }
    hangingTools(img, false);
    return img;
  })());
  const FURN = ['#5d5d5d', '#686868', '#727272', '#7c7c7c', '#878787'];
  reg('furnace_side', (() => {
    const img = stone('furnace_side', FURN);
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#9a9a9a')); img.set(0, i, C('#9a9a9a')); img.set(i, 15, C('#4a4a4a')); img.set(15, i, C('#4a4a4a')); }
    return img;
  })());
  reg('furnace_top', (() => {
    const img = stone('furnace_top', FURN);
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#9a9a9a')); img.set(0, i, C('#9a9a9a')); img.set(i, 15, C('#4a4a4a')); img.set(15, i, C('#4a4a4a')); }
    for (let i = 3; i < 13; i++) { img.set(i, 3, C('#4a4a4a')); img.set(3, i, C('#4a4a4a')); img.set(i, 12, C('#9a9a9a')); img.set(12, i, C('#9a9a9a')); }
    return img;
  })());
  function furnaceFront(lit) {
    const img = T.furnace_side.copy();
    // vent
    for (let x = 4; x < 12; x++) { img.set(x, 3, C('#3a3a3a')); img.set(x, 4, x % 2 ? C('#2a2a2a') : C('#4f4f4f')); }
    // opening
    for (let y = 8; y < 14; y++) for (let x = 3; x < 13; x++) {
      const edge = y === 8 || x === 3 || x === 12 || y === 13;
      if (edge) { img.set(x, y, C(y === 13 || x === 12 ? '#9a9a9a' : '#3a3a3a')); continue; }
      if (!lit) img.set(x, y, C(y > 11 ? '#2a2a2a' : '#121212'));
      else {
        const f = (y - 9) / 4 + Math.sin(x * 1.7) * 0.15;
        img.set(x, y, C(f > 0.7 ? '#ffe06a' : f > 0.45 ? '#ffae2a' : f > 0.2 ? '#e8661a' : '#5a1e08'));
      }
    }
    return img;
  }
  reg('furnace_front', furnaceFront(false));
  reg('furnace_front_on', furnaceFront(true));
  reg('chest_top', (() => {
    const P = pal(['#7a4f20', '#8a5a26', '#9c662c', '#a87232']);
    const rng = rngFor('chest');
    const img = new Img();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, pick(P, Math.min(0.999, 0.4 + Math.sin(x * 0.9 + y * 0.2) * 0.15 + rng.nextFloat() * 0.35)));
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#3d2610')); img.set(0, i, C('#3d2610')); img.set(i, 15, C('#3d2610')); img.set(15, i, C('#3d2610')); }
    return img;
  })());
  reg('chest_side', (() => {
    const img = T.chest_top.copy();
    for (let x = 0; x < 16; x++) { img.set(x, 4, C('#3d2610')); img.set(x, 5, C('#5a3a18')); }
    return img;
  })());
  reg('chest_front', (() => {
    const img = T.chest_side.copy();
    img.rect(6, 3, 4, 5, C('#2a2a2a'));
    img.rect(7, 4, 2, 3, C('#c8c8c8'));
    img.set(7, 4, C('#ffffff'));
    return img;
  })());
  reg('tnt_side', (() => {
    const img = new Img();
    const R = pal(['#a3260f', '#c2341a', '#db441a', '#e65a2c']);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const stick = x % 4;
      img.set(x, y, R[stick === 0 ? 0 : stick === 3 ? 1 : (y % 5 === 0 ? 2 : 3)]);
    }
    for (let y = 5; y < 11; y++) for (let x = 0; x < 16; x++) img.set(x, y, C(y === 5 || y === 10 ? '#b9b9b9' : '#ececec'));
    const glyph = ['###.#..#.###', '.#..##.#..#.', '.#..#.##..#.', '.#..#..#..#.'];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 12; x++) if (glyph[y][x] === '#') img.set(2 + x, 6 + y, C('#1a1a1a'));
    return img;
  })());
  reg('tnt_top', (() => {
    const img = new Img().fill(C('#c2341a'));
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const x0 = sx * 4, y0 = sy * 4;
      img.rect(x0 + 1, y0 + 1, 2, 2, C('#e65a2c')); img.set(x0, y0, C('#8a2410')); img.set(x0 + 3, y0 + 3, C('#8a2410'));
    }
    img.rect(7, 7, 2, 2, C('#3a3a3a')); img.set(7, 6, C('#555555'));
    return img;
  })());
  reg('tnt_bottom', T.tnt_top.copy().mapColors((r, g, b) => [r * 0.8, g * 0.8, b * 0.8]));
  reg('bookshelf', (() => {
    const img = T.planks_oak.copy();
    const rng = rngFor('books');
    const bookCols = pal(['#8c2a1e', '#2a4f8c', '#2e7a32', '#7a5a1e', '#5a2a7a', '#a87a2a', '#3a6a6a', '#8c8c8c']);
    for (const y0 of [1, 9]) {
      let x = 1;
      while (x < 15) {
        const w = 1 + (rng.nextInt(3) === 0 ? 1 : 0);
        const h = 5 + rng.nextInt(2);
        const c = bookCols[rng.nextInt(bookCols.length)];
        for (let xx = 0; xx < w && x + xx < 15; xx++) for (let y = y0 + (6 - h); y < y0 + 6; y++) img.set(x + xx, y, xx === 0 ? mul(c, 1.15) : c);
        img.set(x, y0 + (6 - h) + 1, C('#d8c890'));
        x += w;
      }
      for (let xx = 0; xx < 16; xx++) img.set(xx, y0 + 6, C('#4f3a22'));
    }
    return img;
  })());
  reg('ladder', (() => {
    const img = new Img();
    const W = pal(['#6b5232', '#8a6b3e', '#a07c4c']);
    for (let y = 0; y < 16; y++) { img.set(2, y, W[1]); img.set(3, y, W[0]); img.set(12, y, W[1]); img.set(13, y, W[0]); }
    for (const y of [1, 5, 9, 13]) for (let x = 4; x < 12; x++) { img.set(x, y, W[2]); img.set(x, y + 1, W[0]); }
    return img;
  })());
  reg('torch', (() => {
    const img = new Img();
    const S = pal(['#4f3a22', '#6b5232', '#8a6b3e']);
    for (let y = 8; y < 16; y++) { img.set(7, y, S[1]); img.set(8, y, y % 3 === 0 ? S[2] : S[0]); }
    img.set(7, 6, C('#ffffb0')); img.set(8, 6, C('#ffd84a'));
    img.set(7, 7, C('#ffcc3a')); img.set(8, 7, C('#e8961a'));
    img.set(7, 5, C('#fff4c0'), 160); img.set(8, 5, C('#ffd84a'), 120);
    return img;
  })());
  reg('door_wood_lower', (() => {
    const img = T.planks_oak.copy();
    for (let y = 0; y < 16; y++) { img.set(0, y, C('#4f3a22')); img.set(15, y, C('#4f3a22')); }
    for (let y = 2; y < 14; y++) for (let x = 3; x < 13; x++) if (y === 2 || y === 13 || x === 3 || x === 12) img.set(x, y, C('#6b5232'));
    img.set(12, 1, C('#5a5a5a')); img.set(12, 0, C('#8a8a8a'));
    return img;
  })());
  reg('door_wood_upper', (() => {
    const img = T.planks_oak.copy();
    for (let y = 0; y < 16; y++) { img.set(0, y, C('#4f3a22')); img.set(15, y, C('#4f3a22')); }
    for (let x = 0; x < 16; x++) img.set(x, 0, C('#4f3a22'));
    for (let y = 3; y < 11; y++) for (let x = 3; x < 13; x++) img.set(x, y, [0, 0, 0], 0);
    for (let y = 3; y < 11; y++) img.set(7, y, C('#6b5232'));
    for (let x = 3; x < 13; x++) img.set(x, 6, C('#6b5232'));
    img.set(12, 14, C('#8a8a8a')); img.set(12, 15, C('#5a5a5a'));
    return img;
  })());
  reg('door_iron_lower', (() => {
    const img = noiseImg('ironpl', ['#a8a8a8', '#b4b4b4', '#c0c0c0', '#cacaca'], { scales: [8, 1], weights: [0.5, 0.5] });
    for (let y = 0; y < 16; y++) { img.set(0, y, C('#6a6a6a')); img.set(15, y, C('#6a6a6a')); }
    for (let x = 0; x < 16; x++) img.set(x, 15, C('#6a6a6a'));
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13], [2, 8], [13, 8]]) { img.set(x, y, C('#e8e8e8')); img.set(x + 1, y + 1, C('#5a5a5a')); }
    return img;
  })());
  reg('door_iron_upper', (() => {
    const img = T.door_iron_lower.copy();
    for (let x = 0; x < 16; x++) { img.set(x, 0, C('#6a6a6a')); img.set(x, 15, C('#b4b4b4')); }
    for (let y = 3; y < 9; y++) for (let x = 4; x < 12; x++) img.set(x, y, [0, 0, 0], 0);
    for (let y = 3; y < 9; y++) for (const x of [6, 9]) img.set(x, y, C('#7a7a7a'));
    return img;
  })());
  reg('trapdoor', (() => {
    const img = T.planks_oak.copy();
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#4f3a22')); img.set(0, i, C('#4f3a22')); img.set(i, 15, C('#4f3a22')); img.set(15, i, C('#4f3a22')); }
    for (const [x0, y0] of [[3, 3], [9, 3], [3, 9], [9, 9]]) img.rect(x0, y0, 4, 4, [0, 0, 0], 0);
    return img;
  })());
  reg('mob_spawner', (() => {
    const img = new Img();
    const P = pal(['#11161c', '#1f2a36', '#2e3d4d', '#41556a']);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const bar = x % 4 === 0 || y % 4 === 0 || x === 15 || y === 15;
      if (bar) img.set(x, y, P[(x + y) % 3 === 0 ? 3 : 1 + ((x * y) % 2)]);
    }
    return img;
  })());
  reg('hay_side', (() => {
    const img = noiseImg('hay', ['#a5852a', '#b8962f', '#c4a13a', '#d0ad45', '#dcbc55'], { scales: [8, 1], weights: [0.3, 0.7] });
    for (let x = 0; x < 16; x++) { img.set(x, 3, C('#6b4a1e')); img.set(x, 12, C('#6b4a1e')); img.set(x, 4, C('#8a6428')); img.set(x, 13, C('#8a6428')); }
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x * 7 + y * 3) % 11 === 0) img.shade(x, y, 0.85);
    return img;
  })());
  reg('hay_top', (() => {
    const img = noiseImg('haytop', ['#a5852a', '#b8962f', '#c4a13a', '#d0ad45'], { scales: [4, 1], weights: [0.4, 0.6] });
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (Math.floor(d) % 3 === 0) img.shade(x, y, 0.82); }
    return img;
  })());
  reg('thatch', (() => {
    const img = noiseImg('thatch', ['#9c7d2e', '#b08e36', '#c9a84a', '#dbbe62'], { scales: [4, 1], weights: [0.3, 0.7] });
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + y * 2) % 5 === 0) img.shade(x, y, 0.75);
    for (let x = 0; x < 16; x++) { img.shade(x, 7, 0.7); img.shade(x, 15, 0.7); }
    return img;
  })());
  // metal / gem blocks
  function metalBlock(name, P0, opts) {
    opts = opts || {};
    const P = pal(P0);
    const rng = rngFor(name);
    const img = new Img();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let v = 0.45 + (rng.nextFloat() - 0.5) * 0.25 - (x + y) * 0.012;
      if (x === 0 || y === 0) v = 0.92; if (x === 15 || y === 15) v = 0.05;
      if (opts.plates && (x === 7 || y === 7)) v = 0.1; if (opts.plates && (x === 8 || y === 8)) v = 0.85;
      img.set(x, y, pick(P, Math.max(0, Math.min(0.999, v))));
    }
    if (opts.sparkle) for (let k = 0; k < opts.sparkle; k++) { const x = 1 + rng.nextInt(14), y = 1 + rng.nextInt(14); img.set(x, y, P[P.length - 1]); }
    return img;
  }
  reg('iron_block', metalBlock('iron_block', ['#a8a8a8', '#c4c4c4', '#d8d8d8', '#e6e6e6', '#f4f4f4'], { plates: true }));
  reg('gold_block', metalBlock('gold_block', ['#b5821a', '#d9a82e', '#f5d04b', '#fbe27a', '#fff6b8'], { plates: true }));
  reg('diamond_block', metalBlock('diamond_block', ['#2a9e98', '#3cb4ae', '#5fe3db', '#8af0ea', '#d0fffb'], { sparkle: 6 }));
  reg('lapis_block', metalBlock('lapis_block', ['#102a6e', '#163380', '#2048a0', '#2e58b8', '#3a66c8'], { sparkle: 8 }));
  reg('jade_block', metalBlock('jade_block', ['#145c33', '#22744a', '#3baa6a', '#5cc888', '#9cf0bf'], { sparkle: 5 }));
  reg('cobalt_block', metalBlock('cobalt_block', ['#1c2a78', '#283a90', '#3b54c4', '#5470e0', '#8ca0ff'], { plates: true }));
  reg('coal_block', metalBlock('coal_block', ['#0e0e0e', '#161616', '#1e1e1e', '#2a2a2a', '#3a3a3a'], { sparkle: 4 }));
  reg('starmetal_block', metalBlock('starmetal_block', ['#1a1430', '#2a2048', '#3e2f6a', '#6a5acd', '#e8e0ff'], { plates: true, sparkle: 9 }));
  reg('ember_block', metalBlock('ember_block', ['#5a0e04', '#7a1408', '#a82410', '#e05020', '#ffb057'], { sparkle: 10 }));
  reg('sulfur_block', noiseImg('sulfur_block', ['#a8a830', '#c4c440', '#d9d94a', '#ecec70', '#f8f8a8'], { scales: [4, 2, 1], weights: [0.2, 0.3, 0.5] }));
  reg('lumite_lamp', (() => {
    const img = new Img();
    const F = pal(['#2a2a33', '#3d3d4a', '#55556a']);
    const G = pal(['#7fe6f2', '#bff7ff', '#e8ffff', '#ffffff']);
    const rng = rngFor('lamp');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const frame = x < 2 || y < 2 || x > 13 || y > 13 || x === 7 || x === 8 || y === 7 || y === 8;
      if (frame) img.set(x, y, F[(x === 0 || y === 0) ? 2 : (x === 15 || y === 15) ? 0 : 1]);
      else img.set(x, y, G[Math.min(3, rng.nextInt(3) + ((x % 7 > 2 && y % 7 > 2) ? 1 : 0))]);
    }
    return img;
  })());

  // ===================== plants (transparent sprites) =====================
  function sprite(name, rows, colors) {
    const img = new Img();
    for (let y = 0; y < 16; y++) {
      const row = rows[y] || '';
      for (let x = 0; x < 16; x++) {
        const ch = row[x];
        if (!ch || ch === '.' || ch === ' ') continue;
        const c = colors[ch];
        if (c) img.set(x, y, typeof c === 'string' ? C(c) : c);
      }
    }
    return reg(name, img);
  }
  reg('tall_grass', (() => {
    const rng = rngFor('tallgrass');
    const img = new Img();
    for (let b = 0; b < 9; b++) {
      let x = 1 + rng.nextInt(14) + 0.0;
      const h = 6 + rng.nextInt(9), lean = (rng.nextFloat() - 0.5) * 0.5;
      for (let y = 15; y > 15 - h; y--) {
        const v = 120 + (15 - y) * 6 + rng.nextInt(20);
        img.set(Math.round(x), y, gray(Math.min(230, v)));
        x += lean;
      }
    }
    return img;
  })());
  reg('fern', (() => {
    const rng = rngFor('fern');
    const img = new Img();
    for (let f = 0; f < 4; f++) {
      const bx = 3 + f * 3, h = 9 + rng.nextInt(5), dir = f < 2 ? -1 : 1;
      for (let k = 0; k < h; k++) {
        const y = 15 - k, x = bx + Math.round(dir * k * 0.15);
        img.set(x, y, gray(110 + k * 5));
        if (k > 2 && k % 2 === 0) { img.set(x - 1, y, gray(140 + k * 4)); img.set(x + 1, y - 1, gray(150 + k * 4)); }
      }
    }
    return img;
  })());
  sprite('dead_bush', [
    '................', '....#.......#...', '.....#.....#....', '..#..#....#..#..', '...#.#...#..#...',
    '....##..#..#....', '.##...#.#.#.....', '...##..###...##.', '.....#.##..##...', '......###.#.....',
    '.......##.......', '.......##.......', '.......#........', '.......#........', '.......##.......', '......#..#......'],
    { '#': '#7a5c34' });
  sprite('flower_rose', [
    '................', '................', '......####......', '.....#rRr##.....', '.....rRrRr#.....', '.....#rRRr#.....',
    '......####......', '.......g........', '.......g...gg....', '....gg.g..g.....', '......gg.g......', '.......gg.......',
    '.......g........', '.......g........', '.......g........', '.......g........'],
    { '#': '#8a1010', 'r': '#c41e1e', 'R': '#e83a3a', 'g': '#3f8f2b' });
  sprite('flower_buttercup', [
    '................', '................', '................', '................', '......y.y.......', '.....yYoYy......',
    '......yYy.......', '.......g........', '.......g........', '.......g..g.....', '....g..g.g......', '.....g.gg.......',
    '......gg........', '.......g........', '.......g........', '.......g........'],
    { 'y': '#f5d400', 'Y': '#ffe94d', 'o': '#e8961a', 'g': '#4c9a2a' });
  sprite('flower_bluebell', [
    '................', '................', '.......gg.......', '......g..g......', '.....g....g.....', '....g.....bB....',
    '...bB.....bbB...', '...bbB.....b....', '....b..g........', '.......g...bB...', '.......g..bbbB..', '.......g...b....',
    '......gg........', '.......g........', '.......g........', '.......g........'],
    { 'g': '#3f8f2b', 'b': '#3a5fd9', 'B': '#6a8aff' });
  sprite('flower_daisy', [
    '................', '................', '.......w........', '.....w.w.w......', '......wyw.......', '....wwyYyww.....',
    '......wyw.......', '.....w.w.w......', '.......w........', '.......g........', '.......g..g.....', '....g..g.g......',
    '.....g.gg.......', '......gg........', '.......g........', '.......g........'],
    { 'w': '#f2f2f2', 'y': '#e8c820', 'Y': '#f5a623', 'g': '#4c9a2a' });
  sprite('flower_heather', [
    '................', '................', '...p.....p......', '..pPp...pPp..p..', '...p..p..p..pPp.', '...g.pPp.g...p..',
    '...g..p..g...g..', '..pg..g..g.p.g..', '.pPg..g.g.pPpg..', '..g.g.g.g..p.g..', '..g..gggg...g...', '...g..gg...g....',
    '....g.gg..g.....', '.....ggggg......', '.......g........', '.......g........'],
    { 'p': '#9a4fb8', 'P': '#c47ae0', 'g': '#4a6b31' });
  sprite('flower_marigold', [
    '................', '................', '................', '.....o.O.o......', '....oOoOoOo.....', '...O.oOdOo.O....',
    '....oOoOoOo.....', '.....o.O.o......', '.......g........', '.......g...g....', '....g..g..g.....', '.....g.g.g......',
    '......ggg.......', '.......g........', '.......g........', '.......g........'],
    { 'o': '#f07f12', 'O': '#ffa33a', 'd': '#8a3a08', 'g': '#4c9a2a' });
  sprite('flower_snowbell', [
    '................', '................', '.......ggg......', '......g...g.....', '.....g.....g....', '....wW.....wW...',
    '...wwwW...wwwW..', '....w.......w...', '.......g........', '.......g........', '.......g..g.....', '....g..g.g......',
    '.....g.gg.......', '......gg........', '.......g........', '.......g........'],
    { 'g': '#4c8a5a', 'w': '#e8f4ff', 'W': '#b0d4f0' });
  sprite('flower_fireweed', [
    '.......m........', '......mMm.......', '.......m........', '......mMm.......', '.......M........', '......mMm.......',
    '.....m.g.m......', '......mgm.......', '.......g........', '.....g.g........', '......gg..g.....', '.......g.g......',
    '.......gg.......', '.......g........', '.......g........', '.......g........'],
    { 'm': '#d03a9a', 'M': '#f06abf', 'g': '#3f8f2b' });
  sprite('mushroom_brown', [
    '................', '................', '................', '................', '................', '................',
    '................', '.....######.....', '....#bBbbBb#....', '...#bbbbbbbb#...', '....########....', '......wWw.......',
    '......wWw.......', '......wWw.......', '......wWw.......', '................'],
    { '#': '#6b4f35', 'b': '#9a7553', 'B': '#b58e68', 'w': '#d6c5b0', 'W': '#e8dccb' });
  sprite('mushroom_red', [
    '................', '................', '................', '................', '................', '................',
    '......####......', '.....#rwrr#.....', '....#rrrrwr#....', '....#wrrrrr#....', '....########....', '......wWw.......',
    '......wWw.......', '......wWw.......', '......wWw.......', '................'],
    { '#': '#8a1010', 'r': '#e52b2b', 'w': '#f0f0f0', 'W': '#d6c5b0' });
  sprite('glowshroom', [
    '................', '................', '................', '................', '................', '.....######.....',
    '....#cCcCcc#....', '...#cCCcccCc#...', '...##########...', '......sSs.......', '......sSs....c..', '..c...sSs...cC#.',
    '.cC#..sSs...sS..', '..sS..sSs...sS..', '..sS..sSs...sS..', '................'],
    { '#': '#1a8a80', 'c': '#3fe0d0', 'C': '#a8fff4', 's': '#9fc8c0', 'S': '#cfe8e0' });
  sprite('lumite_crystal', [
    '................', '.......#........', '......#W#.......', '......#C#...#...', '.....#CWC#.#W#..', '..#..#CWC#.#C#..',
    '.#W#.#CWC#.#C#..', '.#C#.#CWC##CW#..', '.#CW##CWC#CC#...', '..#C#CCWC#C#....', '..#CC#CWC#C#....', '...#C#CWCCC#....',
    '....#CCWCC#.....', '.....#####......', '................', '................'],
    { '#': '#3a9aaa', 'C': '#7fe6f2', 'W': '#e8ffff' });
  sprite('cobweb', [
    'w.......w......w', '.w......w.....w.', '..w.....w....w..', '...wwwwwwwwww...', '....w...w..w....', '....w.wwwww.w...',
    '....w.w.w.w.w...', 'wwwwwwwwwwwwwwww', '....w.w.w.w.w...', '....w.wwwww.w...', '....w...w...w...', '...wwwwwwwwwww..',
    '..w.....w.....w.', '.w......w......w', 'w.......w.......', '........w.......'],
    { 'w': [224, 224, 224, 210] });
  sprite('vine', [
    '.g...g.....g..g.', '.g..g.g...g...g.', 'gg..g.....gg..g.', '.g.gg......g.gg.', '.gg.g.....g..g..', '..g.g.g...g.g...',
    '..gg..g..gg.g...', '.g.g..gg.g..gg..', '.g..g.g..g...g..', 'g...gg...g...gg.', '.g..g....gg..g..', '.g.g......g.g...',
    '..g.......g.g...', '..g........g....', '...........g....', '................'],
    { 'g': [130, 130, 130] });
  sprite('lily_pad', [
    '................', '.....gggggg.....', '...gggGgggggg...', '..ggGgggg..ggg..', '.ggggGgg....ggg.', '.gggggGg..gggg..',
    'ggggggGggggggg..', 'gGGGGGGgggggggg.', 'gggggggGGGGGGgg.', '.ggggggGggggggg.', '.gggggGgggggggg.', '..ggggGgggggggg.',
    '...gggGggggggg..', '.....ggggggg....', '................', '................'],
    { 'g': [150, 150, 150], 'G': [110, 110, 110] });
  sprite('cattail', [
    '.......bb.......', '......bBBb......', '......bBBb......', '......bBBb......', '......bBBb......', '......bbbb......',
    '.......gg.......', '...g...g.....g..', '....g..g....g...', '....g..g...g....', '.....g.g..g.....', '.....g.g..g.....',
    '......gg.g......', '......ggg.......', '.......g........', '.......g........'],
    { 'b': '#4a2c14', 'B': '#6e4220', 'g': '#5a8a2a' });
  function bramble(ripe) {
    const rng = rngFor('bramble');
    const img = new Img();
    const G = pal(['#2a4a1a', '#355a22', '#41702a', '#4f8233']);
    for (let k = 0; k < 90; k++) {
      const x = 1 + rng.nextInt(14), y = 3 + rng.nextInt(13);
      const d = Math.hypot((x - 7.5) / 7, (y - 10) / 7);
      if (d < 1) img.set(x, y, G[rng.nextInt(4)]);
    }
    for (let k = 0; k < 12; k++) img.set(1 + rng.nextInt(14), 3 + rng.nextInt(13), C('#8a7a5a'));
    if (ripe) for (let k = 0; k < 9; k++) { const x = 2 + rng.nextInt(12), y = 5 + rng.nextInt(9); img.set(x, y, C('#3a1446')); img.set(x + 1, y, C('#5c2470')); img.set(x, y - 1, C('#8a4aa0')); }
    return img;
  }
  reg('bramble', bramble(false));
  reg('bramble_ripe', bramble(true));
  sprite('sugar_cane', [
    '..gG......gG....', '..gG..gG..gG....', '..gG..gG..gG....', '..dd..gG..dd....', '..gG..gG..gG....', '..gG..dd..gG..l.',
    '..gG..gG..gG.l..', '..gG..gG..gG....', 'l.dd..gG..gG....', '.lgG..gG..dd....', '..gG..dd..gG....', '..gG..gG..gG.l..',
    '..gG..gG..gG..l.', '..dd..gG..gG....', '..gG..gG..dd....', '..gG..gG..gG....'],
    { 'g': '#6ea22e', 'G': '#89c13e', 'd': '#4f7a1e', 'l': '#9ad04e' });
  sprite('cactus_side', [
    '.gGggGgggGggGgg.', '.gGgggggGggggGg.', '.gGggGggGggGgGg.', '.dGgggggGgggggg.', '.gGgg.gggGgg.Gg.', '.gGggGggGggGgGg.',
    '.gGgggggGggggGd.', '.gGggGggGggGgGg.', '.gGdggggGgggggg.', '.gGggGgggGggGgg.', '.gGgggggGggggGg.', '.gGggGggGggdgGg.',
    '.gGggg.gGggggGg.', '.gGggGggGggGgGg.', '.dGgggggGgggggg.', '.gGggGgggGggGgg.'],
    { 'g': '#13802a', 'G': '#1d9c38', 'd': '#e8e8c0' });
  reg('cactus_side', (() => {
    const img = T.cactus_side;
    for (let y = 0; y < 16; y++) { img.set(1, y, C('#0d6b1a')); img.set(14, y, C('#0d6b1a')); }
    return img;
  })());
  reg('cactus_top', (() => {
    const img = new Img();
    for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      img.set(x, y, C(d > 5.6 ? '#0d6b1a' : (Math.floor(d) % 2 ? '#13802a' : '#1d9c38')));
    }
    img.set(7, 7, C('#e8e8c0')); img.set(8, 8, C('#e8e8c0'));
    return img;
  })());
  reg('cactus_bottom', T.cactus_top.copy().mapColors((r, g, b, a) => [r * 0.8, g * 0.8, b * 0.8, a]));
  // saplings
  sprite('sapling_oak', [
    '................', '.....gGGg.......', '...gGgGGgGg.....', '..gGGgGgGGgg....', '..gGgGGGgGGg....', '...gGgGgGgg.....',
    '....gGgGg.......', '......w.........', '......w...gg....', '..gg..w..gG.....', '...gG.w.g.......', '.....gww........',
    '......w.........', '......w.........', '......w.........', '......w.........'],
    { 'g': '#3f7a1e', 'G': '#5a9a2e', 'w': '#6b5232' });
  sprite('sapling_spruce', [
    '.......g........', '.......g........', '......gGg.......', '.....g.g.g......', '......gGg.......', '....gg.g.gg.....',
    '.....gGgGg......', '...gg..g..gg....', '....ggGgGgg.....', '..gg...w...gg...', '.......w........', '.......w........',
    '.......w........', '.......w........', '.......w........', '.......w........'],
    { 'g': '#2e4f2e', 'G': '#3f6b3f', 'w': '#4c361f' });
  sprite('sapling_birch', [
    '................', '......gGg.......', '....gGgGgGg.....', '...gGgGGgGgg....', '...ggGgGgGg.....', '....gGgGg.......',
    '......w.........', '......w.........', '......wg........', '....g.w.........', '.....gw.........', '......w.........',
    '......w.........', '......k.........', '......w.........', '......w.........'],
    { 'g': '#6a9a3e', 'G': '#8ab84e', 'w': '#e6e6e0', 'k': '#2b2b2b' });
  sprite('sapling_jungle', [
    '................', '...gg....gg.....', '..gGGg..gGGg....', '.gGggGggGggGg...', '..g..gGGg..g....', '.....gGGg.......',
    '....gg.w.gg.....', '...g...w...g....', '.......w........', '.......w........', '.......w........', '.......w........',
    '.......w........', '.......w........', '.......w........', '.......w........'],
    { 'g': '#2e7a1e', 'G': '#45a02e', 'w': '#5f4f23' });
  sprite('sapling_maple', [
    '................', '.....rRr........', '...rRoRrRr......', '..rRRoRoRRr.....', '..rRoRRRoRr.....', '...rRrRoRr......',
    '....rRrRr.......', '......w.........', '......w...rr....', '..rr..w..rR.....', '...rR.w.r.......', '.....rww........',
    '......w.........', '......w.........', '......w.........', '......w.........'],
    { 'r': '#9a2412', 'R': '#cf4a20', 'o': '#e88a2e', 'w': '#68534c' });
  sprite('sapling_gold_maple', [
    '................', '.....yYy........', '...yYoYyYy......', '..yYYoYoYYy.....', '..yYoYYYoYy.....', '...yYyYoYy......',
    '....yYyYy.......', '......w.........', '......w...yy....', '..yy..w..yY.....', '...yY.w.y.......', '.....yww........',
    '......w.........', '......w.........', '......w.........', '......w.........'],
    { 'y': '#c48c22', 'Y': '#e8bc3c', 'o': '#f2d055', 'w': '#68534c' });
  sprite('sapling_redwood', [
    '.......g........', '......gGg.......', '......gGg.......', '.....gGgGg......', '......gGg.......', '....ggGgGgg.....',
    '.....gGgGg......', '...ggGgGgGgg....', '.......w........', '.......w........', '.......w........', '.......w........',
    '.......w........', '.......w........', '.......w........', '.......w........'],
    { 'g': '#3a5a2a', 'G': '#4f7a35', 'w': '#7e3820' });
  // crops
  function cropStages(prefix, count, colorsFn) {
    for (let s = 0; s < count; s++) {
      const rng = rngFor(prefix + s);
      const img = new Img();
      const t = s / (count - 1);
      const h = 2 + Math.round(t * 12);
      for (let b = 0; b < 5; b++) {
        const bx = 1 + b * 3 + rng.nextInt(2);
        for (let k = 0; k < h; k++) {
          const y = 15 - k;
          const c = colorsFn(t, k / h, rng);
          img.set(bx + (k > h * 0.6 && b % 2 ? 1 : 0), y, c);
        }
      }
      reg(prefix + s, img);
    }
  }
  cropStages('wheat_', 8, (t, k, rng) => {
    if (t > 0.95) return C(k > 0.6 ? (rng.nextBool() ? '#c9a03a' : '#e0bc55') : '#a8913a');
    if (t > 0.6 && k > 0.6) return C(rng.nextBool() ? '#8ab03a' : '#b0b84a');
    return C(k > 0.5 ? '#5aa02e' : '#3f8a1e');
  });
  cropStages('carrots_', 4, (t, k, rng) => (t > 0.95 && k < 0.15) ? C('#f08a1a') : C(rng.nextBool() ? '#3f8a1e' : '#5aa02e'));
  cropStages('potatoes_', 4, (t, k, rng) => (t > 0.95 && k < 0.15) ? C('#c9a050') : C(rng.nextBool() ? '#3f8a1e' : '#4f9a2e'));
  // pumpkin & melon
  reg('pumpkin_side', (() => {
    const img = new Img();
    const rng = rngFor('pumpkin');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const rib = x % 4 === 0 ? 0.7 : x % 4 === 2 ? 1.08 : 1;
      const base = C(rng.nextInt(4) === 0 ? '#d97c14' : '#e38a1d');
      img.set(x, y, mul(base, rib * (y === 0 || y === 15 ? 0.85 : 1)));
    }
    return img;
  })());
  reg('pumpkin_top', (() => {
    const img = T.pumpkin_side.copy();
    img.rect(6, 6, 4, 4, C('#7a5a1e')); img.rect(7, 7, 2, 2, C('#4f7a1e'));
    return img;
  })());
  function pumpkinFace(lit) {
    const img = T.pumpkin_side.copy();
    const D = lit ? C('#ffd23a') : C('#3b1c04'), D2 = lit ? C('#ffae1a') : C('#2a1202');
    const face = [
      '................', '................', '................', '...##......##...', '..####....####..', '................',
      '................', '.......##.......', '................', '..#..........#..', '..##.######.##..', '...##########...',
      '....####.###....', '................', '................', '................'];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (face[y][x] === '#') img.set(x, y, (x + y) % 3 ? D : D2);
    return img;
  }
  reg('pumpkin_face', pumpkinFace(false));
  reg('pumpkin_face_on', pumpkinFace(true));
  reg('melon_side', (() => {
    const img = new Img(); const rng = rngFor('melon');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const stripe = (x + Math.round(Math.sin(y * 0.5) * 1)) % 5;
      img.set(x, y, C(stripe === 0 ? '#5a8a1e' : stripe === 1 ? '#6e9c24' : (rng.nextInt(5) === 0 ? '#a7c951' : '#8eb53a')));
    }
    return img;
  })());
  reg('melon_top', (() => {
    const img = T.melon_side.copy();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 3) img.set(x, y, C('#a7c951')); }
    img.rect(7, 7, 2, 2, C('#6b5a2a'));
    return img;
  })());
  // huge mushroom
  reg('mushroom_cap_brown', noiseImg('capbrown', ['#7d5a3f', '#8a6545', '#957051', '#a07a59'], { scales: [4, 1], weights: [0.4, 0.6] }));
  reg('mushroom_cap_red', (() => {
    const img = noiseImg('capred', ['#b81a1a', '#c82020', '#d42828'], { scales: [4, 1], weights: [0.4, 0.6] });
    const rng = rngFor('capred2');
    for (let k = 0; k < 5; k++) { const x = rng.nextInt(14), y = rng.nextInt(14); img.rect(x, y, 2 + rng.nextInt(2), 2, C('#f0f0f0')); }
    return img;
  })());
  reg('mushroom_stem', noiseImg('mstem', ['#c8bfa8', '#d2c9b2', '#dcd3bc', '#e4dcc8'], { scales: [8, 1], weights: [0.3, 0.7] }));
  reg('mushroom_pores', noiseImg('mpores', ['#b8a88a', '#c8b89a', '#d4c6a8'], { scales: [2, 1], weights: [0.5, 0.5] }));
  // rope (centered 2px wide)
  reg('rope', (() => {
    const img = new Img();
    for (let y = 0; y < 16; y++) {
      const a = (y % 4) < 2;
      img.set(7, y, C(a ? '#b8945a' : '#7a5c34')); img.set(8, y, C(a ? '#7a5c34' : '#9c7a48'));
    }
    return img;
  })());
  // bed parts
  reg('bed_top_head', (() => {
    const img = new Img().fill(C('#a12722'));
    const rng = rngFor('bedhead');
    for (let i = 0; i < 256; i++) if (rng.nextInt(5) === 0) img.set(i & 15, i >> 4, C('#8c2020'));
    for (let y = 0; y < 7; y++) for (let x = 1; x < 15; x++) img.set(x, y, C(y === 6 ? '#c8c8c8' : (rng.nextInt(4) ? '#f0f0f0' : '#e2e2e2')));
    for (let y = 0; y < 16; y++) { img.set(0, y, C('#6b5232')); img.set(15, y, C('#6b5232')); }
    return img;
  })());
  reg('bed_top_foot', (() => {
    const img = new Img().fill(C('#a12722'));
    const rng = rngFor('bedfoot');
    for (let i = 0; i < 256; i++) if (rng.nextInt(5) === 0) img.set(i & 15, i >> 4, C('#8c2020'));
    for (let x = 0; x < 16; x++) img.set(x, 15, C('#6b5232'));
    for (let y = 0; y < 16; y++) { img.set(0, y, C('#6b5232')); img.set(15, y, C('#6b5232')); }
    return img;
  })());
  reg('bed_side', (() => {
    const img = new Img();
    for (let y = 7; y < 10; y++) for (let x = 0; x < 16; x++) img.set(x, y, C(y === 7 ? '#c43a32' : '#a12722'));
    for (let y = 10; y < 13; y++) for (let x = 0; x < 16; x++) img.set(x, y, C('#8a6b3e'));
    for (let y = 13; y < 16; y++) { img.set(0, y, C('#6b5232')); img.set(1, y, C('#6b5232')); img.set(14, y, C('#6b5232')); img.set(15, y, C('#6b5232')); }
    return img;
  })());

  // ===================== sky =====================
  reg('sun', (() => {
    const img = new Img();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d > 4.6) continue;
      if (d > 3.5) img.set(x, y, C('#ffd860'), 90);
      else if (d > 2.5) img.set(x, y, C('#fff0a0'), 230);
      else img.set(x, y, d < 1.5 ? C('#ffffff') : C('#fffbe0'), 255);
    }
    return img;
  })());
  for (let ph = 0; ph < 8; ph++) {
    const img = new Img();
    const rng = rngFor('moon');
    const craters = [];
    for (let k = 0; k < 4; k++) craters.push([5 + rng.nextInt(6), 5 + rng.nextInt(6), 1]);
    // phase: fraction lit, from the right (waxing) or left (waning)
    const lit = [1, 0.75, 0.5, 0.25, 0, 0.25, 0.5, 0.75][ph];
    const waxing = ph > 4;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 3.6) continue;
      let v = 200 + rng.nextInt(30);
      for (const [cx, cy, r] of craters) if (Math.abs(x - cx) <= r - 1 && Math.abs(y - cy) <= r - 1) v -= 55;
      const u = (dx + 4) / 8;
      const inLight = ph === 0 ? true : ph === 4 ? false : (waxing ? u > 1 - lit : u < lit);
      if (!inLight) v *= 0.12;
      img.set(x, y, [v * 0.92, v * 0.95, v], inLight ? 255 : 90);
    }
    reg('moon_' + ph, img);
  }

  // fire (static fallback frame; animated at runtime)
  reg('fire', new Img());

  // ===================== destroy stages =====================
  {
    const rng = rngFor('destroy');
    const segs = [];
    for (let l = 0; l < 10; l++) {
      let x = 7.5 + (rng.nextFloat() - 0.5) * 3, y = 7.5 + (rng.nextFloat() - 0.5) * 3;
      let ang = l / 10 * Math.PI * 2 + rng.nextFloat() * 0.6;
      for (let k = 0; k < 16; k++) {
        segs.push([Math.floor(x), Math.floor(y), k * 0.9 + l * 0.25 + rng.nextFloat()]);
        // occasional branch
        if (k > 3 && rng.nextInt(6) === 0) segs.push([Math.floor(x + Math.sin(ang)), Math.floor(y - Math.cos(ang)), k + 2]);
        ang += (rng.nextFloat() - 0.5) * 1.1;
        x += Math.cos(ang); y += Math.sin(ang);
        if (x < 0 || x >= 16 || y < 0 || y >= 16) break;
      }
    }
    for (let s = 0; s < 10; s++) {
      const img = new Img();
      const limit = 1.2 + s * 1.55;
      for (const [x, y, o] of segs) {
        if (o > limit) continue;
        img.set(x, y, [24, 24, 24], 210);
      }
      // soft halo next to lines
      const halo = img.copy();
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        if (halo.alpha(x, y) > 0) continue;
        if ((x < 15 && halo.alpha(x + 1, y) > 0) || (y < 15 && halo.alpha(x, y + 1) > 0)) img.set(x, y, [70, 70, 70], 70);
      }
      reg('destroy_' + s, img);
    }
  }

  // ===================== animated liquids & fire =====================
  // A small heat-diffusion automaton, re-run live every animation tick.
  function WaterAnim(flow) {
    const cur = new Float32Array(256), nxt = new Float32Array(256), heat = new Float32Array(256), vel = new Float32Array(256);
    const rng = new Noise.Random(flow ? 7 : 3);
    this.flow = flow;
    this.step = function () {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        let s = 0;
        for (let k = x - 1; k <= x + 1; k++) s += cur[(y & 15) * 16 + (k & 15)];
        nxt[y * 16 + x] = s / 3.3 + heat[y * 16 + x] * 0.8;
      }
      for (let i = 0; i < 256; i++) {
        heat[i] += vel[i] * 0.05;
        if (heat[i] < 0) heat[i] = 0;
        vel[i] -= 0.1;
        if (rng.nextFloat() < 0.05) vel[i] = 0.5;
      }
      if (flow) { // scroll down for flowing water
        const tmp = nxt.slice();
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) nxt[y * 16 + x] = tmp[((y + 15) & 15) * 16 + x];
        const th = heat.slice(); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) heat[y * 16 + x] = th[((y + 15) & 15) * 16 + x];
      }
      cur.set(nxt);
    };
    this.render = function (img) {
      for (let i = 0; i < 256; i++) {
        let c = Math.max(0, Math.min(1, cur[i]));
        c = c * c;
        img.d[i * 4] = 32 + c * 32; img.d[i * 4 + 1] = 64 + c * 64; img.d[i * 4 + 2] = 230 + c * 25; img.d[i * 4 + 3] = 170 + c * 50;
      }
    };
    for (let i = 0; i < 40; i++) this.step();
  }
  function LavaAnim(flow) {
    const cur = new Float32Array(256), nxt = new Float32Array(256), heat = new Float32Array(256), vel = new Float32Array(256);
    const rng = new Noise.Random(flow ? 11 : 5);
    let t = 0;
    this.step = function () {
      t++;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        let s = 0;
        const ox = Math.floor(Math.sin(y * Math.PI * 2 / 16) * 1.2), oy = Math.floor(Math.sin(x * Math.PI * 2 / 16) * 1.2);
        for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) s += cur[((yy + oy) & 15) * 16 + ((xx + ox) & 15)];
        const h = heat[(y & 15) * 16 + (x & 15)] + heat[((y + 1) & 15) * 16 + (x & 15)] + heat[((y + 1) & 15) * 16 + ((x + 1) & 15)] + heat[(y & 15) * 16 + ((x + 1) & 15)];
        nxt[y * 16 + x] = s / 10 + h / 4 * 0.8;
      }
      for (let i = 0; i < 256; i++) {
        heat[i] += vel[i] * 0.01;
        if (heat[i] < 0) heat[i] = 0;
        vel[i] -= 0.06;
        if (rng.nextFloat() < 0.005) vel[i] = 1.5;
      }
      if (flow && t % 3 === 0) {
        const tmp = nxt.slice();
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) nxt[y * 16 + x] = tmp[((y + 15) & 15) * 16 + x];
      }
      cur.set(nxt);
    };
    this.render = function (img) {
      for (let i = 0; i < 256; i++) {
        const c = Math.max(0, Math.min(1, cur[i] * 2));
        img.d[i * 4] = c * 100 + 155; img.d[i * 4 + 1] = c * c * 255; img.d[i * 4 + 2] = c * c * c * c * 128; img.d[i * 4 + 3] = 255;
      }
    };
    for (let i = 0; i < 60; i++) this.step();
  }
  function FireAnim() {
    const W = 16, H = 20;
    let cur = new Float32Array(W * H), nxt = new Float32Array(W * H);
    const rng = new Noise.Random(13);
    this.step = function () {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let cnt = 18, s = cur[((y + 1) % H) * W + x] * cnt;   // heat rises from the row below
        for (let xx = x - 1; xx <= x + 1; xx++) for (let yy = y; yy <= y + 1; yy++) {
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) s += cur[yy * W + xx];
          cnt++;
        }
        let v = s / (cnt * 1.06);
        if (y >= H - 1) v = rng.nextFloat() * rng.nextFloat() * rng.nextFloat() * 4 + rng.nextFloat() * 0.1 + 0.2;
        nxt[y * W + x] = v;
      }
      const t = cur; cur = nxt; nxt = t;
    };
    this.render = function (img) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        let c = Math.max(0, Math.min(1, cur[y * W + x] * 1.8));
        const i = (y * 16 + x) * 4;
        img.d[i] = c * 155 + 100; img.d[i + 1] = c * c * 255; img.d[i + 2] = Math.pow(c, 10) * 255; img.d[i + 3] = c < 0.5 ? 0 : 255;
      }
    };
    for (let i = 0; i < 80; i++) this.step();
  }
  ANIM.water_still = new WaterAnim(false);
  ANIM.water_flow = new WaterAnim(true);
  ANIM.lava_still = new LavaAnim(false);
  ANIM.lava_flow = new LavaAnim(true);
  ANIM.fire = new FireAnim();
  for (const k in ANIM) { const img = new Img(); ANIM[k].render(img); reg(k, img); }

  return { T, ANIM, Img, sprite, reg, pal, rngFor, fnoise, vnoise, normalize, noiseImg, mul, mix, C, stone, ore, stoneBricks, pick };
})();
