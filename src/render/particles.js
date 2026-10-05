'use strict';
// ---------------------------------------------------------------------------
// Particles (billboards using the texture array)
// ---------------------------------------------------------------------------
class Particles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.max = 4000;
  }
  get world() { return this.game.world; }
  layer(name) { return this.game.renderer.atlas.layer(name); }
  add(p) {
    if (this.list.length >= this.max) this.list.shift();
    p.px = p.x; p.py = p.y; p.pz = p.z;
    p.age = 0;
    if (p.u0 === undefined) { p.u0 = 0; p.v0 = 0; p.u1 = 1; p.v1 = 1; }
    if (p.r === undefined) { p.r = 1; p.g = 1; p.b = 1; }
    if (p.a === undefined) p.a = 1;
    if (p.gravity === undefined) p.gravity = 0;
    if (p.drag === undefined) p.drag = 0.98;
    if (p.collide === undefined) p.collide = true;
    this.list.push(p);
    return p;
  }
  density() { const s = this.game.settings.particles; return s === 'minimal' ? 0.25 : s === 'decreased' ? 0.5 : 1; }
  // ---------------------------------------------------------------- emitters
  blockTexture(id, meta, face) {
    const atlas = this.game.renderer.atlas;
    if (id === B.GRASS) return atlas.layer('dirt');
    return atlas.face(id, meta, face === undefined ? 2 : face);
  }
  blockTint(id, meta) {
    if (id === B.LEAVES) { const k = meta & 7; if (k === 4 || k === 6 || k === 7) return [1, 1, 1]; return [0.42, 0.68, 0.3]; }
    if (id === B.TALL_GRASS && meta) return [0.5, 0.74, 0.35];
    return [1, 1, 1];
  }
  breakBlock(x, y, z, id, meta) {
    const n = 4, d = this.density();
    const layer = this.blockTexture(id, meta, 2);
    const t = this.blockTint(id, meta);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
      if (Math.random() > d) continue;
      const px = x + (i + 0.5) / n, py = y + (j + 0.5) / n, pz = z + (k + 0.5) / n;
      this.digging(px, py, pz, px - x - 0.5, py - y - 0.5, pz - z - 0.5, layer, t);
    }
  }
  digging(x, y, z, vx, vy, vz, layer, tint) {
    const u = Math.floor(Math.random() * 12) / 16, v = Math.floor(Math.random() * 12) / 16;
    const sp = (Math.random() + Math.random() + 1) * 0.15;
    const l = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    const s = sp / l * 0.4;
    this.add({ x, y, z, vx: vx * s + (Math.random() * 2 - 1) * 0.04, vy: vy * s + 0.1 + (Math.random() * 2 - 1) * 0.04, vz: vz * s + (Math.random() * 2 - 1) * 0.04,
      size: (Math.random() * 0.5 + 0.5) * 0.1, life: Math.floor(4 / (Math.random() * 0.9 + 0.1)), gravity: 0.04, layer, u0: u, v0: v, u1: u + 0.25, v1: v + 0.25,
      r: tint[0] * 0.6, g: tint[1] * 0.6, b: tint[2] * 0.6, lit: true });
  }
  hitBlock(x, y, z, face, id, meta) {
    if (Math.random() > this.density()) return;
    const d = FACE_DIR[face];
    let px = x + Math.random() * 0.8 + 0.1, py = y + Math.random() * 0.8 + 0.1, pz = z + Math.random() * 0.8 + 0.1;
    if (d[0]) px = x + (d[0] > 0 ? 1.05 : -0.05);
    if (d[1]) py = y + (d[1] > 0 ? 1.05 : -0.05);
    if (d[2]) pz = z + (d[2] > 0 ? 1.05 : -0.05);
    const p = this.add({ x: px, y: py, z: pz, vx: (Math.random() - 0.5) * 0.04, vy: Math.random() * 0.05, vz: (Math.random() - 0.5) * 0.04, size: 0.06, life: 8 + Math.floor(Math.random() * 6), gravity: 0.04,
      layer: this.blockTexture(id, meta, face), lit: true });
    const u = Math.floor(Math.random() * 12) / 16, v = Math.floor(Math.random() * 12) / 16;
    p.u0 = u; p.v0 = v; p.u1 = u + 0.25; p.v1 = v + 0.25;
    const t = this.blockTint(id, meta); p.r = t[0] * 0.6; p.g = t[1] * 0.6; p.b = t[2] * 0.6;
  }
  itemBreak(stack, x, y, z, n, eating, dir) {
    const name = this.game.gui.icons.spriteName(stack.id, stack.dmg);
    const layer = name ? this.layer(name) : this.blockTexture(stack.id, stack.dmg, 2);
    for (let i = 0; i < n; i++) {
      const u = Math.floor(Math.random() * 12) / 16, v = Math.floor(Math.random() * 12) / 16;
      let vx = (Math.random() - 0.5) * 0.1, vy = Math.random() * 0.1 + 0.1, vz = (Math.random() - 0.5) * 0.1;
      if (dir) { vx += dir[0] * 0.1; vy += dir[1] * 0.1 + 0.05; vz += dir[2] * 0.1; }
      this.add({ x, y, z, vx, vy, vz, size: 0.06, life: 10 + Math.floor(Math.random() * 10), gravity: 0.04, layer, u0: u, v0: v, u1: u + 0.25, v1: v + 0.25, lit: true });
    }
    void eating;
  }
  smoke(x, y, z, n, big) {
    const L = this.layer('particle_smoke');
    for (let i = 0; i < n; i++) {
      const g = Math.random() * 0.3;
      this.add({ x: x + (Math.random() - 0.5) * 0.4, y: y + (Math.random() - 0.5) * 0.2, z: z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 0.02, vy: 0.02 + Math.random() * 0.03, vz: (Math.random() - 0.5) * 0.02,
        size: (big ? 0.25 : 0.12) * (0.75 + Math.random() * 0.5), life: Math.floor(8 / (Math.random() * 0.8 + 0.2)), gravity: -0.002, layer: L, r: g, g, b: g, grow: big ? 1.6 : 1.3, drag: 0.96, collide: false, fade: true });
    }
  }
  flame(x, y, z) {
    this.add({ x, y, z, vx: 0, vy: 0.002, vz: 0, size: 0.07, life: Math.floor(8 / (Math.random() * 0.8 + 0.2)) + 4, layer: this.layer('particle_flame'), collide: false, drag: 0.96, shrink: true, bright: true });
  }
  splash(x, y, z) {
    const L = this.layer('particle_drip');
    const n = Math.floor(14 * this.density());
    for (let i = 0; i < n; i++) this.add({ x: x + (Math.random() - 0.5) * 0.8, y, z: z + (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 0.15, vy: 0.1 + Math.random() * 0.2, vz: (Math.random() - 0.5) * 0.15, size: 0.06, life: 10 + Math.floor(Math.random() * 10), gravity: 0.04, layer: L, r: 0.55, g: 0.65, b: 1, lit: true });
    this.bubble(x, y - 0.5, z, 6);
  }
  // runes floating from a bookshelf into the enchanting table
  glyph(sx, sy, sz, tx, ty, tz) {
    const life = 30 + Math.floor(Math.random() * 15);
    const p = this.add({ x: sx + (Math.random() - 0.5) * 0.6, y: sy + Math.random() * 0.5, z: sz + (Math.random() - 0.5) * 0.6, vx: 0, vy: 0, vz: 0, size: 0.06, life,
      layer: this.layer('particle_glyph' + Math.floor(Math.random() * 8)), r: 0.95, g: 0.9, b: 1, collide: false, bright: true, drag: 1 });
    p.seek = [tx, ty, tz, p.x, p.y, p.z];
    return p;
  }
  // flat white flecks drifting on the water surface (boat wakes, approaching fish)
  wake(x, y, z, vx, vz) {
    this.add({ x, y: y + 0.02, z, vx, vy: 0, vz, size: 0.05, life: 8 + Math.floor(Math.random() * 8), layer: this.layer('particle_drip'), r: 0.9, g: 0.95, b: 1, drag: 0.92, collide: false, lit: true, fade: true });
  }
  fishSplash(x, y, z, n) {
    const L = this.layer('particle_drip');
    for (let i = 0; i < n; i++) this.add({ x: x + (Math.random() - 0.5) * 0.2, y: y + 0.05, z: z + (Math.random() - 0.5) * 0.2, vx: (Math.random() - 0.5) * 0.08, vy: 0.08 + Math.random() * 0.08, vz: (Math.random() - 0.5) * 0.08, size: 0.05, life: 8 + Math.floor(Math.random() * 6), gravity: 0.04, layer: L, r: 0.55, g: 0.65, b: 1, lit: true });
  }
  // water flung off a shaking wolf
  shakeDrops(x, y, z, w, n) {
    const L = this.layer('particle_drip');
    n = Math.ceil(n * this.density());
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      this.add({ x: x + Math.cos(a) * w * 0.5, y: y + Math.random() * 0.3, z: z + Math.sin(a) * w * 0.5, vx: Math.cos(a) * 0.12, vy: 0.08 + Math.random() * 0.1, vz: Math.sin(a) * 0.12,
        size: 0.05, life: 10 + Math.floor(Math.random() * 8), gravity: 0.04, layer: L, r: 0.55, g: 0.65, b: 1, lit: true });
    }
  }
  // a squid's cloud of ink, hanging in the water
  ink(x, y, z, n) {
    const L = this.layer('particle_smoke');
    n = Math.ceil(n * this.density());
    for (let i = 0; i < n; i++) {
      const g = 0.02 + Math.random() * 0.05, a = Math.random() * TAU, sp = Math.random() * 0.12;
      this.add({ x: x + (Math.random() - 0.5) * 0.5, y: y + (Math.random() - 0.5) * 0.5, z: z + (Math.random() - 0.5) * 0.5, vx: Math.cos(a) * sp, vy: (Math.random() - 0.4) * 0.06, vz: Math.sin(a) * sp,
        size: 0.18 + Math.random() * 0.12, life: 40 + Math.floor(Math.random() * 40), layer: L, r: g, g, b: g * 1.4, grow: 1.8, drag: 0.9, collide: false, fade: true, lit: true });
    }
  }
  bubble(x, y, z, n) {
    const L = this.layer('particle_bubble');
    for (let i = 0; i < (n || 1); i++) this.add({ x: x + (Math.random() - 0.5) * 0.5, y, z: z + (Math.random() - 0.5) * 0.5, vx: (Math.random() - 0.5) * 0.02, vy: 0.04 + Math.random() * 0.02, vz: (Math.random() - 0.5) * 0.02, size: 0.05, life: 20 + Math.floor(Math.random() * 20), layer: L, drag: 0.85, gravity: -0.002, collide: false, water: true });
  }
  drip(x, y, z, lava) {
    this.add({ x, y, z, vx: 0, vy: 0, vz: 0, size: 0.04, life: 60, gravity: 0.02, layer: this.layer('particle_drip'), r: lava ? 1 : 0.3, g: lava ? 0.4 : 0.45, b: lava ? 0.1 : 1, bright: lava, splashOnLand: true });
  }
  crit(x, y, z, n, magic) {
    const L = this.layer('particle_crit');
    for (let i = 0; i < n; i++) this.add({ x: x + (Math.random() - 0.5) * 0.6, y: y + (Math.random() - 0.5) * 0.6, z: z + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4 + 0.1, vz: (Math.random() - 0.5) * 0.4, size: 0.08, life: 10 + Math.floor(Math.random() * 6), gravity: 0.04, layer: L,
      r: magic ? 0.55 : 0.9, g: magic ? 0.35 : 0.85, b: magic ? 1 : 0.6, drag: 0.7, collide: false, bright: !!magic });
  }
  happy(x, y, z) {
    const L = this.layer('particle_glint');
    for (let i = 0; i < 12; i++) this.add({ x: x + (Math.random() - 0.5) * 1.2, y: y + (Math.random() - 0.5) * 1.2, z: z + (Math.random() - 0.5) * 1.2, vx: 0, vy: 0.01, vz: 0, size: 0.06, life: 16 + Math.floor(Math.random() * 10), layer: L, r: 0.4, g: 1, b: 0.4, collide: false });
  }
  hearts(x, y, z, n) {
    const L = this.layer('particle_heart');
    for (let i = 0; i < n; i++) this.add({ x: x + (Math.random() - 0.5), y: y + Math.random() * 0.5, z: z + (Math.random() - 0.5), vx: 0, vy: 0.02, vz: 0, size: 0.1, life: 16, layer: L, collide: false, drag: 0.86 });
  }
  sparkle(x, y, z, r, g, b, n, spread) {
    const L = this.layer('particle_glint');
    spread = spread || 0.5;
    for (let i = 0; i < (n || 1); i++) this.add({ x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread, z: z + (Math.random() - 0.5) * spread, vx: (Math.random() - 0.5) * 0.01, vy: 0.005 + Math.random() * 0.01, vz: (Math.random() - 0.5) * 0.01, size: 0.05, life: 20 + Math.floor(Math.random() * 20), layer: L, r, g, b, collide: false, bright: true, fade: true });
  }
  explosion(x, y, z, power) {
    const L = this.layer('particle_smoke');
    const n = Math.floor(24 * this.density());
    for (let i = 0; i < n; i++) {
      const px = x + (Math.random() - 0.5) * power * 1.2, py = y + (Math.random() - 0.5) * power * 1.2, pz = z + (Math.random() - 0.5) * power * 1.2;
      const c = 0.6 + Math.random() * 0.4;
      this.add({ x: px, y: py, z: pz, vx: (px - x) * 0.02, vy: (py - y) * 0.02 + 0.02, vz: (pz - z) * 0.02, size: 0.5 + Math.random() * 0.5, life: 8 + Math.floor(Math.random() * 8), layer: L, r: c, g: c, b: c, collide: false, grow: 1.4, fade: true, bright: true });
    }
    this.smoke(x, y, z, Math.floor(16 * this.density()), true);
  }
  burst(x, y, z, kind, n) {
    if (kind === 'snowball') { const L = this.layer('snowball'); for (let i = 0; i < n; i++) this.add({ x, y, z, vx: (Math.random() - 0.5) * 0.15, vy: Math.random() * 0.15, vz: (Math.random() - 0.5) * 0.15, size: 0.06, life: 12, gravity: 0.04, layer: L, u0: 0.4, v0: 0.4, u1: 0.6, v1: 0.6, lit: true }); }
    else { const L = this.layer('egg'); for (let i = 0; i < n; i++) this.add({ x, y, z, vx: (Math.random() - 0.5) * 0.15, vy: Math.random() * 0.15, vz: (Math.random() - 0.5) * 0.15, size: 0.06, life: 12, gravity: 0.04, layer: L, u0: 0.4, v0: 0.4, u1: 0.6, v1: 0.6, lit: true }); }
  }
  rainSplash(x, y, z) {
    this.add({ x, y, z, vx: (Math.random() - 0.5) * 0.05, vy: 0.05 + Math.random() * 0.05, vz: (Math.random() - 0.5) * 0.05, size: 0.04, life: 5 + Math.floor(Math.random() * 4), gravity: 0.04, layer: this.layer('particle_drip'), r: 0.4, g: 0.5, b: 1, lit: true });
  }
  note(x, y, z, hue) {
    const c = hsbToRgb(hue, 0.8, 1);
    this.add({ x, y, z, vx: 0, vy: 0.04, vz: 0, size: 0.1, life: 12, layer: this.layer('particle_note'), r: c[0], g: c[1], b: c[2], drag: 0.66, collide: false });
  }
  wisp(x, y, z) {
    this.add({ x: x + (Math.random() - 0.5) * 0.3, y: y + (Math.random() - 0.5) * 0.3, z: z + (Math.random() - 0.5) * 0.3, vx: 0, vy: 0.01, vz: 0, size: 0.06 + Math.random() * 0.04, life: 15 + Math.floor(Math.random() * 10), layer: this.layer('particle_glint'), r: 0.55, g: 1, b: 0.95, collide: false, bright: true, fade: true });
  }

  // ---------------------------------------------------------------- update
  tick() {
    const w = this.world;
    const keep = [];
    for (const p of this.list) {
      p.px = p.x; p.py = p.y; p.pz = p.z;
      if (++p.age >= p.life) continue;
      p.vy -= p.gravity;
      if (p.collide && w) {
        const nx = p.x + p.vx, ny = p.y + p.vy, nz = p.z + p.vz;
        const id = w.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
        if (BT.solid[id] && BT.opaque[id]) {
          if (BT.opaque[w.getBlock(Math.floor(p.x), Math.floor(ny), Math.floor(p.z))]) {
            if (p.splashOnLand && p.vy < 0) { p.life = p.age + 4; p.gravity = 0; }
            p.vy = 0; p.onGround = true;
          }
          if (BT.opaque[w.getBlock(Math.floor(nx), Math.floor(p.y), Math.floor(p.z))]) p.vx = 0;
          if (BT.opaque[w.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(nz))]) p.vz = 0;
        }
      }
      if (p.water && w && w.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) !== B.WATER) continue;
      if (p.seek) {
        // classic enchanting glyphs: start at the shelf, rise, then fall into the table
        const k = p.age / p.life, s = p.seek, e = 1 - k;
        p.x = s[0] + (s[3] - s[0]) * e; p.z = s[2] + (s[5] - s[2]) * e;
        p.y = s[1] + (s[4] - s[1]) * e + (1 - e * e) * 0.6 * e * 4;
        keep.push(p);
        continue;
      }
      p.x += p.vx; p.y += p.vy; p.z += p.vz;
      p.vx *= p.drag; p.vy *= p.drag; p.vz *= p.drag;
      if (p.onGround) { p.vx *= 0.7; p.vz *= 0.7; }
      keep.push(p);
    }
    this.list = keep;
  }
  clear() { this.list.length = 0; }

  render(renderer, cam, partial) {
    if (!this.list.length) return;
    const gl = renderer.gl, b = renderer.batch;
    const w = this.world;
    // camera basis
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const rx = cy, rz = -sy;                       // right vector (x, 0, z)
    const ux = sy * sp, uy = cp, uz = cy * sp;      // up vector
    renderer.useEnt(renderer.vp, 0, 0.05, true);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    b.reset();
    const f32 = b.f32, u8 = b.u8;
    for (const p of this.list) {
      if (b.n + 6 > b.maxVerts) b.flush();
      const t = p.age + partial;
      const x = p.px + (p.x - p.px) * partial - cam.x, y = p.py + (p.y - p.py) * partial - cam.y, z = p.pz + (p.z - p.pz) * partial - cam.z;
      let s = p.size;
      if (p.grow) s *= 1 + (p.grow - 1) * (t / p.life) * 2;
      if (p.shrink) { const f = t / p.life; s *= 1 - f * f * 0.5; }
      let a = p.a;
      if (p.fade) a *= 1 - t / p.life;
      let sky = -1, blk = 0;
      if (p.lit && w && !p.bright) { const l = w.getLightRaw(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)); sky = (l >> 4) / 15; blk = (l & 15) / 15; }
      else if (!p.bright && w) { const l = w.getLightRaw(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)); sky = (l >> 4) / 15; blk = Math.max(l & 15, 4) / 15; }
      const cr = Math.round(clamp(p.r, 0, 1) * 255), cg = Math.round(clamp(p.g, 0, 1) * 255), cb = Math.round(clamp(p.b, 0, 1) * 255), ca = Math.round(clamp(a, 0, 1) * 255);
      const corners = [[-1, -1, p.u0, p.v1], [1, -1, p.u1, p.v1], [1, 1, p.u1, p.v0], [-1, 1, p.u0, p.v0]];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const c = corners[k];
        const o = b.n * 9;
        f32[o] = x + (rx * c[0] + ux * c[1]) * s; f32[o + 1] = y + uy * c[1] * s; f32[o + 2] = z + (rz * c[0] + uz * c[1]) * s;
        f32[o + 3] = c[2]; f32[o + 4] = c[3]; f32[o + 5] = p.layer;
        const ci = (o + 6) * 4; u8[ci] = cr; u8[ci + 1] = cg; u8[ci + 2] = cb; u8[ci + 3] = ca;
        f32[o + 7] = sky; f32[o + 8] = blk;
        b.n++;
      }
    }
    b.flush();
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
  }
}
