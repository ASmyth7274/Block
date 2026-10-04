'use strict';
// ---------------------------------------------------------------------------
// Entity rendering, held items, first-person hand, block outline & cracks
// ---------------------------------------------------------------------------
class EntityRenderer {
  constructor(game, renderer) {
    this.game = game;
    this.r = renderer;
    const gl = renderer.gl;
    gl.bindTexture(gl.TEXTURE_2D, renderer.skinTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, Skins.AW, Skins.AH, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(Skins.atlas.buffer));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.skinBatch = new DynBatch(gl, [[3, 'f'], [3, 'f'], [4, 'ub'], [2, 'f']], 65536);
    this.extrudeCache = new Map();
    this.tmp = [0, 0, 0];
    this.handProj = Mat4.create();
    this.deferred = [];
    this.glows = [];
    this.lines = [];
  }
  // additive camera-facing glow sprite
  glow(rx, ry, rz, size, col) { this.glows.push([rx, ry, rz, size, col]); }
  uploadSkins() {
    const gl = this.r.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.r.skinTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, Skins.AW, Skins.AH, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(Skins.atlas.buffer));
  }
  // ---------------------------------------------------------------- vertex output
  vtx(b, x, y, z, u, v, layer, col, sky, blk) {
    if (b.n >= b.maxVerts) return;
    const o = b.n * 9, f = b.f32, u8 = b.u8;
    f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = u; f[o + 4] = v; f[o + 5] = layer;
    const ci = (o + 6) * 4; u8[ci] = col[0]; u8[ci + 1] = col[1]; u8[ci + 2] = col[2]; u8[ci + 3] = col[3];
    f[o + 7] = sky; f[o + 8] = blk;
    b.n++;
  }
  quadOut(b, p, uv, layer, col, sky, blk) {
    const idx = [0, 1, 2, 0, 2, 3];
    for (const k of idx) this.vtx(b, p[k][0], p[k][1], p[k][2], uv[k][0], uv[k][1], layer, col, sky, blk);
  }
  shadeFor(n) {
    // simple directional lighting (normals already in world space)
    const l = 0.6 + 0.4 * Math.max(0, n[1]) * 1.0 - 0.25 * Math.max(0, -n[1]) + 0.1 * Math.abs(n[0]) * -0.5 + 0.1 * Math.abs(n[2]) * 0.0;
    return clamp(Math.abs(n[0]) > 0.7 ? 0.62 + 0.38 * Math.max(0, n[1]) : l, 0.45, 1);
  }

  // Draw a model: parts posed by `pose` (partName -> [rx, ry, rz] or {rot, off, hide, scale})
  drawModel(model, skin, base, pose, col, sky, blk, opts) {
    opts = opts || {};
    const slot = Skins.slots[skin] || Skins.slots.wanderer;
    const b = this.skinBatch;
    const p = this.tmp, nrm = [0, 0, 0];
    for (const name in model) {
      const part = model[name];
      if (!part) continue;
      const ps = pose[part.follow || name];
      if (ps && ps.hide) continue;
      if (opts.only && !opts.only.includes(name)) continue;
      if (part.antler && !opts.antlers) continue;
      if (part.translucent && opts.noTranslucent) continue;
      let m = M3.mul(base, M3.trans(part.pivot[0], part.pivot[1], part.pivot[2]));
      if (ps && ps.off) m = M3.mul(m, M3.trans(ps.off[0], ps.off[1], ps.off[2]));
      const rot = ps ? (ps.rot || ps) : null;
      if (rot && rot.length) {
        if (rot[2]) m = M3.mul(m, M3.rz(rot[2]));
        if (rot[1]) m = M3.mul(m, M3.ry(rot[1]));
        if (rot[0]) m = M3.mul(m, M3.rx(rot[0]));
      }
      if (part.rot0) {
        if (part.rot0[2]) m = M3.mul(m, M3.rz(part.rot0[2]));
        if (part.rot0[1]) m = M3.mul(m, M3.ry(part.rot0[1]));
        if (part.rot0[0]) m = M3.mul(m, M3.rx(part.rot0[0]));
      }
      if (ps && ps.scale) m = M3.mul(m, M3.scale(ps.scale, ps.scale, ps.scale));
      const pc = (part.translucent && opts.translucentAlpha) ? [col[0], col[1], col[2], opts.translucentAlpha] : col;
      for (const bxd of part.boxes) {
        const box = opts.inflate ? Object.assign({}, bxd, { inflate: (bxd.inflate || 0) + opts.inflate }) : bxd;
        for (const f of (opts.inflate ? boxFaces(box) : cachedFaces(box))) {
          M3.applyDir(m, f.n[0], f.n[1], f.n[2], nrm);
          const nl = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
          const sh = this.shadeFor([nrm[0] / nl, nrm[1] / nl, nrm[2] / nl]);
          const c = [pc[0] * sh, pc[1] * sh, pc[2] * sh, pc[3]];
          const verts = f.verts.map((v) => M3.apply(m, v[0], v[1], v[2], [0, 0, 0]));
          const uvs = f.uv.map((uv) => [slot.u + uv[0] * slot.du, slot.v + uv[1] * slot.dv]);
          this.quadOut(b, verts, uvs, opts.flash > 0 ? opts.flash : -1, c, sky, blk);
        }
      }
    }
  }
  // queue a draw for the translucent pass (slimes, wraiths)
  later(fn) { this.deferred.push(fn); }

  // ---------------------------------------------------------------- items as 3D objects
  extruded(name) {
    let q = this.extrudeCache.get(name);
    if (q) return q;
    const img = TexGen.T[name] || TexGen.T.__missing;
    q = [];
    const a = (x, y) => (x < 0 || y < 0 || x > 15 || y > 15) ? 0 : img.alpha(x, y);
    const t = 1 / 32;
    // front & back faces
    q.push({ v: [[0, 0, t], [1, 0, t], [1, 1, t], [0, 1, t]], uv: [[0, 1], [1, 1], [1, 0], [0, 0]], n: [0, 0, 1] });
    q.push({ v: [[1, 0, -t], [0, 0, -t], [0, 1, -t], [1, 1, -t]], uv: [[1, 1], [0, 1], [0, 0], [1, 0]], n: [0, 0, -1] });
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (a(x, y) < 128) continue;
      const x0 = x / 16, x1 = (x + 1) / 16, y0 = 1 - (y + 1) / 16, y1 = 1 - y / 16;
      const u0 = (x + 0.25) / 16, u1 = (x + 0.75) / 16, v0 = (y + 0.25) / 16, v1 = (y + 0.75) / 16;
      const uv = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
      if (a(x - 1, y) < 128) q.push({ v: [[x0, y0, -t], [x0, y0, t], [x0, y1, t], [x0, y1, -t]], uv, n: [-1, 0, 0] });
      if (a(x + 1, y) < 128) q.push({ v: [[x1, y0, t], [x1, y0, -t], [x1, y1, -t], [x1, y1, t]], uv, n: [1, 0, 0] });
      if (a(x, y - 1) < 128) q.push({ v: [[x0, y1, t], [x1, y1, t], [x1, y1, -t], [x0, y1, -t]], uv, n: [0, 1, 0] });
      if (a(x, y + 1) < 128) q.push({ v: [[x0, y0, -t], [x1, y0, -t], [x1, y0, t], [x0, y0, t]], uv, n: [0, -1, 0] });
    }
    this.extrudeCache.set(name, q);
    return q;
  }
  // m: transform (item space: sprite 0..1 square / block -0.5..0.5 cube)
  drawItem(stack, m, sky, blk, alpha, flat) {
    const icons = this.game.gui.icons;
    const atlas = this.r.atlas;
    const b = this.r.batch;
    const sn = icons.spriteName(stack.id, stack.dmg);
    const al = alpha === undefined ? 255 : alpha;
    if (sn === null && stack.id < 256) {
      // 3D block
      const boxes = icons.blockBoxes(stack.id, stack.dmg);
      for (const bx of boxes) {
        const [x0, y0, z0, x1, y1, z1] = bx.b.map((v) => v / 16 - 0.5);
        const faces = [
          [0, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]], [1, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0]],
          [2, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]], [3, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]],
          [4, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]], [5, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]],
        ];
        for (const [f, verts, n] of faces) {
          if (bx.faces && bx.faces.indexOf(f) < 0) continue;
          const tn = bx.tex ? (typeof bx.tex === 'string' ? bx.tex : bx.tex[f]) : icons.faceTexture(stack.id, stack.dmg, f);
          const layer = atlas.layer(tn);
          const nn = M3.applyDir(m, n[0], n[1], n[2], [0, 0, 0]);
          const nl = Math.hypot(nn[0], nn[1], nn[2]) || 1;
          let sh = this.shadeFor([nn[0] / nl, nn[1] / nl, nn[2] / nl]);
          let tint = icons.tintFor(stack.id, stack.dmg, f) || [255, 255, 255];
          const c = [tint[0] * sh, tint[1] * sh, tint[2] * sh, al];
          const uvs = verts.map((v) => {
            const px = v[0] + 0.5, py = v[1] + 0.5, pz = v[2] + 0.5;
            switch (f) { case 0: case 1: return [px, pz]; case 2: return [1 - px, 1 - py]; case 3: return [px, 1 - py]; case 4: return [pz, 1 - py]; default: return [1 - pz, 1 - py]; }
          });
          const pv = verts.map((v) => M3.apply(m, v[0], v[1], v[2], [0, 0, 0]));
          this.quadOut(b, pv, uvs, layer, c, sky, blk);
          if (stack.id === B.GRASS && f >= 2) this.quadOut(b, pv, uvs, atlas.layer('grass_side_overlay'), [145 * sh, 189 * sh, 89 * sh, al], sky, blk);
        }
      }
      return;
    }
    const layer = atlas.layer(sn);
    let tint = icons.spriteTint(stack.id, stack.dmg) || [255, 255, 255];
    if (stack.id === ITEM_IDS.spawn_egg) tint = hexToRgb(ITEMS[stack.id].tintFn(stack.dmg)[0]);
    const quads = flat ? this.extruded(sn).slice(0, 2) : this.extruded(sn);
    for (const q of quads) {
      const nn = M3.applyDir(m, q.n[0], q.n[1], q.n[2], [0, 0, 0]);
      const nl = Math.hypot(nn[0], nn[1], nn[2]) || 1;
      const sh = this.shadeFor([nn[0] / nl, nn[1] / nl, nn[2] / nl]);
      const c = [tint[0] * sh, tint[1] * sh, tint[2] * sh, al];
      this.quadOut(b, q.v.map((v) => M3.apply(m, v[0], v[1], v[2], [0, 0, 0])), q.uv, layer, c, sky, blk);
    }
  }

  // ---------------------------------------------------------------- frame
  lightAt(x, y, z) {
    const w = this.game.world;
    const l = w.getLightRaw(Math.floor(x), Math.floor(y), Math.floor(z));
    return [(l >> 4) / 15, (l & 15) / 15];
  }
  render(cam, partial) {
    const g = this.game, w = g.world, gl = this.r.gl;
    this.frameNo = (this.frameNo || 0) + 1;
    this.r.batch.reset(); this.skinBatch.reset();
    const all = w.entities;
    const p = g.player;
    for (const e of all) {
      if (e.removed) continue;
      const [x, y, z] = e.lerpPos(partial);
      const dx = x - cam.x, dz = z - cam.z;
      if (dx * dx + dz * dz > (g.settings.renderDistance * 16 + 8) ** 2) continue;
      this.drawEntity(e, x - cam.x, y - cam.y, z - cam.z, partial);
      if (e.fire > 0 && !e.fireImmune && !e.inWater && e.h) this.drawFire(e, x - cam.x, y - cam.y, z - cam.z);
    }
    if (p && g.thirdPerson && !p.dead) {
      const [x, y, z] = p.lerpPos(partial);
      this.drawEntity(p, x - cam.x, y - cam.y, z - cam.z, partial);
      if (p.fire > 0 && !p.inWater && !p.creative) this.drawFire(p, x - cam.x, y - cam.y, z - cam.z);
    }
    this.drawSigns(cam);
    gl.disable(gl.CULL_FACE);
    this.r.useEnt(this.r.vp, 1, 0.1, true);
    this.skinBatch.flush();
    this.r.useEnt(this.r.vp, 0, 0.1, true);
    this.r.batch.flush();
    // fishing lines
    if (this.lines.length) {
      const b = this.r.batch;
      b.reset();
      for (const ln of this.lines) this.lineQuads(b, this.linePoints(ln));
      this.lines.length = 0;
      this.r.useEnt(this.r.vp, 2, -1, true);
      b.flush();
    }
    // translucent creatures
    if (this.deferred.length) {
      this.skinBatch.reset();
      for (const fn of this.deferred) fn();
      this.deferred.length = 0;
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      this.r.useEnt(this.r.vp, 1, 0.01, true);
      this.skinBatch.flush();
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    if (this.glows.length) {
      const b = this.r.batch, cam = this.game.camera, L = this.r.atlas.layer('wisp_glow');
      b.reset();
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      const rx = [cy, 0, -sy], up = [sy * sp, cp, cy * sp];
      for (const [x, y, z, s, c] of this.glows) {
        const p = (a, bb) => [x + (rx[0] * a + up[0] * bb) * s, y + (rx[1] * a + up[1] * bb) * s, z + (rx[2] * a + up[2] * bb) * s];
        this.quadOut(b, [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)], [[0, 1], [1, 1], [1, 0], [0, 0]], L, c, -1, 0);
      }
      this.glows.length = 0;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      this.r.useEnt(this.r.vp, 0, 0.004, true);
      b.flush();
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    gl.enable(gl.CULL_FACE);
  }

  drawEntity(e, rx, ry, rz, partial) {
    const g = this.game;
    switch (e.type) {
      case 'item': return this.drawItemEntity(e, rx, ry, rz, partial);
      case 'xp': return this.drawXP(e, rx, ry, rz, partial);
      case 'falling': case 'tnt': return this.drawBlockEntity(e, rx, ry, rz, partial);
      case 'arrow': return this.drawArrow(e, rx, ry, rz, partial);
      case 'thrown': return this.drawThrown(e, rx, ry, rz, partial);
      case 'lightning': return this.drawLightning(e, rx, ry, rz);
      case 'boat': return this.drawBoat(e, rx, ry, rz, partial);
      case 'fishhook': return this.drawHook(e, rx, ry, rz, partial);
      case 'painting': return this.drawPainting(e, rx, ry, rz);
      case 'wisp': {
        const t = e.age + partial, pulse = 1 + Math.sin(t * 0.25) * 0.12;
        this.glow(rx, ry + 0.2, rz, 0.55 * pulse, [110, 255, 230, 150]);
        this.glow(rx, ry + 0.2, rz, 0.18 * pulse, [230, 255, 250, 255]);
        return;
      }
    }
    if (e.render) return e.render(this, rx, ry, rz, partial);
    void g;
  }
  // layered flames around a burning entity
  drawFire(e, rx, ry, rz) {
    const cam = this.game.camera, b = this.r.batch, layer = this.r.atlas.layer('fire');
    const W = e.w * 1.4;
    const rxv = Math.cos(cam.yaw), rzv = -Math.sin(cam.yaw);
    const tx = Math.sin(cam.yaw), tz = Math.cos(cam.yaw);
    let half = W / 2, y = ry, left = e.h, k = 0;
    const qh = W * 1.4, col = [255, 255, 255, 255];
    while (left > 0 && k < 10) {
      const push = W * 0.3 - k * 0.03;
      const cx = rx + tx * push, cz = rz + tz * push;
      const uv = k % 2 ? [[1, 1], [0, 1], [0, 0], [1, 0]] : [[0, 1], [1, 1], [1, 0], [0, 0]];
      this.quadOut(b, [[cx - rxv * half, y, cz - rzv * half], [cx + rxv * half, y, cz + rzv * half], [cx + rxv * half, y + qh, cz + rzv * half], [cx - rxv * half, y + qh, cz - rzv * half]], uv, layer, col, -1, 0);
      left -= 0.45 * W; y += 0.45 * W; half *= 0.9; k++;
    }
  }
  drawItemEntity(e, rx, ry, rz, partial) {
    const t = e.age + partial;
    const bob = Math.sin(t / 10 + e.bobOffset) * 0.1 + 0.1;
    const spin = (t / 20 + e.bobOffset) * (180 / Math.PI) * DEG;
    const [sky, blk] = this.lightAt(e.x, e.y + 0.2, e.z);
    const isBlock = e.stack.id < 256 && this.game.gui.icons.spriteName(e.stack.id, e.stack.dmg) === null;
    const n = e.stack.count > 48 ? 5 : e.stack.count > 32 ? 4 : e.stack.count > 16 ? 3 : e.stack.count > 1 ? 2 : 1;
    const rng = new Noise.Random(187);
    for (let i = 0; i < n; i++) {
      let m = M3.trans(rx, ry + bob + (isBlock ? 0.125 : 0.0625), rz);
      m = M3.mul(m, M3.ry(spin));
      if (i > 0) m = M3.mul(m, M3.trans((rng.nextFloat() * 2 - 1) * (isBlock ? 0.15 : 0.12), (rng.nextFloat() * 2 - 1) * (isBlock ? 0.15 : 0.12), (rng.nextFloat() * 2 - 1) * (isBlock ? 0.15 : 0.06)));
      if (isBlock) m = M3.mul(m, M3.scale(0.25, 0.25, 0.25));
      else m = M3.mul(M3.mul(m, M3.scale(0.5, 0.5, 0.5)), M3.trans(-0.5, -0.25, 0));
      this.drawItem(e.stack, m, sky, blk, 255);
    }
  }
  drawXP(e, rx, ry, rz, partial) {
    const b = this.r.batch;
    const t = e.age + partial;
    const cam = this.game.camera;
    const s = 0.12 + Math.min(0.1, e.value / 200);
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const pulse = (Math.sin(t / 2) + 1) * 0.5;
    const col = [Math.round(255 * (0.5 + pulse * 0.5)), 255, Math.round(255 * (0.1 + (1 - pulse) * 0.2)), 255];
    const layer = this.r.atlas.layer('particle_glint');
    const yy = ry + 0.15;
    const p = [[rx - cy * s, yy - s, rz + sy * s], [rx + cy * s, yy - s, rz - sy * s], [rx + cy * s, yy + s, rz - sy * s], [rx - cy * s, yy + s, rz + sy * s]];
    this.quadOut(b, p, [[0, 1], [1, 1], [1, 0], [0, 0]], layer, col, -1, 0);
  }
  drawBlockEntity(e, rx, ry, rz, partial) {
    const [sky, blk] = this.lightAt(e.x, e.y + 0.5, e.z);
    const id = e.type === 'tnt' ? B.TNT : e.block;
    const meta = e.type === 'tnt' ? 0 : e.meta;
    let s = 1;
    let m = M3.trans(rx, ry + 0.5, rz);
    if (e.type === 'tnt') {
      const f = e.fuse - partial + 1;
      if (f < 10) { const k = 1 - f / 10; s = 1 + k * k * k * k * 0.3; }
      m = M3.mul(m, M3.scale(s, s, s));
      this.drawItem(new ItemStack(id, 1, meta), m, sky, blk, 255);
      if (Math.floor(e.fuse / 5) % 2 === 0) {
        // white flash overlay
        const b = this.r.batch; const n0 = b.n;
        this.drawItem(new ItemStack(id, 1, meta), M3.mul(m, M3.scale(1.01, 1.01, 1.01)), -1, 0, 120);
        for (let i = n0; i < b.n; i++) { const ci = (i * 9 + 6) * 4; b.u8[ci] = 255; b.u8[ci + 1] = 255; b.u8[ci + 2] = 255; }
      }
      return;
    }
    this.drawItem(new ItemStack(id, 1, blockItemDamage(id, meta)), m, sky, blk, 255);
  }
  drawArrow(e, rx, ry, rz, partial) {
    const [sky, blk] = this.lightAt(e.x, e.y, e.z);
    const yaw = e.pyaw + wrapRadians(e.yaw - e.pyaw) * partial, pitch = e.ppitch + (e.pitch - e.ppitch) * partial;
    let m = M3.trans(rx, ry, rz);
    m = M3.mul(m, M3.ry(yaw));
    m = M3.mul(m, M3.rx(pitch));
    // arrow sprite is diagonal; rotate so it points along -Z
    m = M3.mul(m, M3.ry(Math.PI / 2));
    m = M3.mul(m, M3.rz(-Math.PI / 4 - Math.PI / 2));
    m = M3.mul(m, M3.scale(0.7, 0.7, 0.7));
    m = M3.mul(m, M3.trans(-0.5, -0.5, 0));
    this.drawItem(new ItemStack(ITEM_IDS.arrow, 1, 0), m, sky, blk, 255);
  }
  drawThrown(e, rx, ry, rz) {
    const [sky, blk] = this.lightAt(e.x, e.y, e.z);
    const cam = this.game.camera;
    let m = M3.trans(rx, ry, rz);
    m = M3.mul(m, M3.ry(cam.yaw));
    m = M3.mul(m, M3.scale(0.4, 0.4, 0.4));
    m = M3.mul(m, M3.trans(-0.5, -0.5, 0));
    this.drawItem(new ItemStack(e.kind === 'snowball' ? ITEM_IDS.snowball : ITEM_IDS.egg, 1, 0), m, sky, blk, 255, true);
  }
  drawLightning(e, rx, ry, rz) {
    const b = this.r.batch;
    const rng = new Noise.Random(e.seed);
    const layer = this.r.atlas.layer('particle_spark');
    let x = rx, z = rz;
    const top = 128 - (ry + this.game.camera.y);
    const col = [190, 210, 255, 220];
    for (let y = top; y > ry; y -= 4) {
      const nx = x + (rng.nextFloat() - 0.5) * 2.2, nz = z + (rng.nextFloat() - 0.5) * 2.2;
      const w = 0.15;
      this.quadOut(b, [[x - w, y, z], [x + w, y, z], [nx + w, y - 4, nz], [nx - w, y - 4, nz]], [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]], layer, col, -1, 0);
      this.quadOut(b, [[x, y, z - w], [x, y, z + w], [nx, y - 4, nz + w], [nx, y - 4, nz - w]], [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]], layer, col, -1, 0);
      x = nx; z = nz;
    }
  }

  // ---------------------------------------------------------------- boats, floats, paintings & signs
  // an axis-aligned box (in m's units) with a tiled block texture on every face
  texBox(b, m, bx, layer, sky, blk, uvScale, tint, skip) {
    const [x0, y0, z0, x1, y1, z1] = bx, k = uvScale || 1 / 16, t = tint || [255, 255, 255];
    const faces = [
      [[[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], [0, -1, 0], 0, 2],
      [[[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0], 0, 2],
      [[[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], 0, 1],
      [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], 0, 1],
      [[[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], 2, 1],
      [[[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], 2, 1],
    ];
    const nn = [0, 0, 0];
    faces.forEach(([vs, n, ua, va], fi) => {
      if (skip && skip.includes(fi)) return;
      M3.applyDir(m, n[0], n[1], n[2], nn);
      const nl = Math.hypot(nn[0], nn[1], nn[2]) || 1;
      const sh = this.shadeFor([nn[0] / nl, nn[1] / nl, nn[2] / nl]);
      const c = [t[0] * sh, t[1] * sh, t[2] * sh, 255];
      const uv = vs.map((v) => [v[ua] * k, (va === 1 ? -v[1] : v[2]) * k]);
      this.quadOut(b, vs.map((v) => M3.apply(m, v[0], v[1], v[2], [0, 0, 0])), uv, layer, c, sky, blk);
    });
  }
  drawBoat(e, rx, ry, rz, partial) {
    const [sky, blk] = this.lightAt(e.x, e.y + 0.5, e.z);
    let m = M3.mul(M3.trans(rx, ry, rz), M3.ry(e.lerpYaw(partial)));
    const ht = e.hitTime - partial, dmg = Math.max(0, e.damage - partial);
    if (ht > 0) m = M3.mul(m, M3.rz(Math.sin(ht) * ht * dmg / 10 * e.hitDir * DEG));
    m = M3.mul(m, M3.scale(1 / 16, 1 / 16, 1 / 16));
    const layer = this.r.atlas.layer('planks_' + (WOOD[e.wood] || 'oak'));
    const b = this.r.batch;
    this.texBox(b, m, [-8, -3, -12, 8, 1, 12], layer, sky, blk);
    this.texBox(b, m, [-10, 1, -10, -8, 7, 10], layer, sky, blk);
    this.texBox(b, m, [8, 1, -10, 10, 7, 10], layer, sky, blk);
    this.texBox(b, m, [-10, 1, -12, 10, 7, -10], layer, sky, blk);
    this.texBox(b, m, [-10, 1, 10, 10, 7, 12], layer, sky, blk);
  }
  // where the line leaves the rod
  rodTip(p, partial) {
    const g = this.game, cam = g.camera;
    const [x, y, z] = p.lerpPos(partial);
    if (p === g.player && !g.thirdPerson) {
      const yaw = p.pyaw + wrapRadians(p.yaw - p.pyaw) * partial, pitch = p.ppitch + (p.pitch - p.ppitch) * partial;
      const sp = p.pswing + (p.swingProgress - p.pswing) * partial, f8 = Math.sin(Math.sqrt(sp) * Math.PI);
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch - f8 * 0.7), spp = Math.sin(pitch - f8 * 0.7);
      const fwd = [-sy * cp, spp, -cy * cp], right = [cy, 0, -sy], up = [sy * spp, cp, cy * spp];
      // match the tip of the rod drawn by the hand renderer (fixed 70 degree projection)
      const t = Math.tan((cam.fov || 70) * DEG / 2) / Math.tan(35 * DEG);
      const kr = 0.35 * 0.545 * t, ku = 0.35 * 0.048 * t;
      return [cam.x + right[0] * kr + up[0] * ku + fwd[0] * 0.35, cam.y + right[1] * kr + up[1] * ku + fwd[1] * 0.35, cam.z + right[2] * kr + up[2] * ku + fwd[2] * 0.35];
    }
    const by = p.pbodyYaw + wrapRadians(p.bodyYaw - p.pbodyYaw) * partial;
    const fx = -Math.sin(by), fz = -Math.cos(by), rx = Math.cos(by), rz = -Math.sin(by);
    return [x + rx * 0.35 + fx * 0.8, y + (p.eyeHeight || 1.62) - 0.45 - (p.sneaking ? 0.19 : 0), z + rz * 0.35 + fz * 0.8];
  }
  drawHook(e, rx, ry, rz, partial) {
    const cam = this.game.camera, b = this.r.batch;
    const [sky, blk] = this.lightAt(e.x, e.y + 0.3, e.z);
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const R = [cy, 0, -sy], U = [sy * sp, cp, cy * sp], s = 0.375, oy = ry + 0.1;
    const pt = (a, c) => [rx + (R[0] * a + U[0] * c) * s, oy + (R[1] * a + U[1] * c) * s, rz + (R[2] * a + U[2] * c) * s];
    this.quadOut(b, [pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1)], [[0, 1], [1, 1], [1, 0], [0, 0]], this.r.atlas.layer('fishing_bobber'), [255, 255, 255, 255], sky, blk);
    const p = e.angler;
    if (!p || p.dead) return;
    this.lines.push({ a: [rx, ry + 0.25, rz], angler: p, partial });
  }
  // the line sags from the rod tip to the float (built after the angler is drawn, so the tip is current)
  linePoints(ln) {
    const cam = this.game.camera, p = ln.angler;
    const tip = (p._rodTipFrame === this.frameNo && (p !== this.game.player || this.game.thirdPerson)) ? p._rodTip : this.rodTip(p, ln.partial);
    const a = ln.a, d = [tip[0] - cam.x - a[0], tip[1] - cam.y - a[1], tip[2] - cam.z - a[2]];
    const pts = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([a[0] + d[0] * t, a[1] + d[1] * (t * t + t) * 0.5, a[2] + d[2] * t]); }
    return pts;
  }
  // thin camera-facing strips along a polyline (positions relative to the camera)
  lineQuads(b, pts) {
    const col = [0, 0, 0, 255];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, mz = (p0[2] + p1[2]) / 2;
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
      let px = dy * mz - dz * my, py = dz * mx - dx * mz, pz = dx * my - dy * mx;
      const pl = Math.hypot(px, py, pz) || 1, th = Math.max(0.0006, Math.hypot(mx, my, mz) * 1.6 / this.r.height);
      px = px / pl * th; py = py / pl * th; pz = pz / pl * th;
      this.quadOut(b, [[p0[0] - px, p0[1] - py, p0[2] - pz], [p1[0] - px, p1[1] - py, p1[2] - pz], [p1[0] + px, p1[1] + py, p1[2] + pz], [p0[0] + px, p0[1] + py, p0[2] + pz]], [[0, 0], [0, 0], [0, 0], [0, 0]], 0, col, -1, 0);
    }
  }
  drawPainting(e, rx, ry, rz) {
    const a = e.artDef, sb = this.skinBatch, AW = Skins.AW, AH = Skins.AH;
    const n = HFACE_DIR[e.facing], s = HFACE_DIR[PAINT_CCW[e.facing]];
    const shade = [0.8, 0.8, 0.6, 0.6][e.facing];
    const cx = rx, cyy = ry + a.h / 2, cz = rz;
    const fd = 0.03125;
    const P = (along, up, out) => [cx + s[0] * along + n[0] * out, cyy + up, cz + s[1] * along + n[1] * out];
    const wx = e.cx, wy = e.cy, wz = e.cz;
    for (let i = 0; i < a.w; i++) for (let j = 0; j < a.h; j++) {
      const al = i - a.w / 2, up = j - a.h / 2;
      const [sky, blk] = this.lightAt(wx + s[0] * (al + 0.5) + n[0] * 0.5, wy + up + 0.5, wz + s[1] * (al + 0.5) + n[1] * 0.5);
      const u0 = (a.u + i * 16) / AW, u1 = (a.u + i * 16 + 16) / AW, v0 = (a.v + (a.h - 1 - j) * 16) / AH, v1 = v0 + 16 / AH;
      const c = [255 * shade, 255 * shade, 255 * shade, 255];
      this.quadOut(sb, [P(al, up, fd), P(al + 1, up, fd), P(al + 1, up + 1, fd), P(al, up + 1, fd)], [[u0, v1], [u1, v1], [u1, v0], [u0, v0]], -1, c, sky, blk);
      // edges of the canvas
      const bu = Paintings.back.u / AW, bv = Paintings.back.v / AH, e1 = 1 / AW, e2 = 16 / AW;
      const ec = [180 * shade, 180 * shade, 180 * shade, 255];
      if (j === a.h - 1) this.quadOut(sb, [P(al, up + 1, fd), P(al + 1, up + 1, fd), P(al + 1, up + 1, -fd), P(al, up + 1, -fd)], [[bu, bv], [bu + e2, bv], [bu + e2, bv + e1], [bu, bv + e1]], -1, ec, sky, blk);
      if (j === 0) this.quadOut(sb, [P(al, up, -fd), P(al + 1, up, -fd), P(al + 1, up, fd), P(al, up, fd)], [[bu, bv], [bu + e2, bv], [bu + e2, bv + e1], [bu, bv + e1]], -1, ec, sky, blk);
      if (i === 0) this.quadOut(sb, [P(al, up, -fd), P(al, up, fd), P(al, up + 1, fd), P(al, up + 1, -fd)], [[bu, bv], [bu + e1, bv], [bu + e1, bv + e2], [bu, bv + e2]], -1, ec, sky, blk);
      if (i === a.w - 1) this.quadOut(sb, [P(al + 1, up, fd), P(al + 1, up, -fd), P(al + 1, up + 1, -fd), P(al + 1, up + 1, fd)], [[bu, bv], [bu + e1, bv], [bu + e1, bv + e2], [bu, bv + e2]], -1, ec, sky, blk);
    }
  }
  drawSigns(cam) {
    const w = this.game.world, R = 64;
    for (const c of w.chunks.values()) {
      if (!c.tiles.size) continue;
      const dx = c.cx * 16 + 8 - cam.x, dz = c.cz * 16 + 8 - cam.z;
      if (dx * dx + dz * dz > (R + 12) * (R + 12)) continue;
      for (const te of c.tiles.values()) {
        if (te.type !== 'sign') continue;
        const ex = te.x + 0.5 - cam.x, ey = te.y + 0.5 - cam.y, ez = te.z + 0.5 - cam.z;
        if (ex * ex + ey * ey + ez * ez > R * R) continue;
        this.drawSign(te, cam);
      }
    }
  }
  drawSign(te, cam) {
    const w = this.game.world;
    const id = w.getBlock(te.x, te.y, te.z), meta = w.getMeta(te.x, te.y, te.z);
    if (id !== B.SIGN && id !== B.WALL_SIGN) return;
    const standing = id === B.SIGN;
    const wood = standing ? (meta >> 4) & 7 : (meta >> 2) & 7;
    const rot = standing ? (meta & 15) * 22.5 * DEG : [Math.PI, 0, Math.PI / 2, -Math.PI / 2][meta & 3];
    let m = M3.mul(M3.trans(te.x + 0.5 - cam.x, te.y - cam.y, te.z + 0.5 - cam.z), M3.ry(-rot));
    if (!standing) m = M3.mul(m, M3.trans(0, -0.3125, -0.4375));
    const [sky, blk] = this.lightAt(te.x + 0.5, te.y + 0.5, te.z + 0.5);
    const layer = this.r.atlas.layer('planks_' + (WOOD[wood] || 'oak'));
    const k = 1 / 24, mb = M3.mul(m, M3.scale(k, k, k));
    this.texBox(this.r.batch, mb, [-12, 14, -1, 12, 26, 1], layer, sky, blk, 1 / 24);
    if (standing) this.texBox(this.r.batch, mb, [-1, 0, -1, 1, 14, 1], this.r.atlas.layer('log_' + (WOOD[wood] || 'oak')), sky, blk, 1 / 24);
    // the text: four centred lines of the pixel font
    const sb = this.skinBatch, AW = Skins.AW, AH = Skins.AH, G = Paintings.glyphs;
    const editing = this.game.screen && this.game.screen.signTE === te ? this.game.screen : null;
    const blink = editing && Math.floor(performance.now() / 300) % 2 === 0;
    const col = [0, 0, 0, 255];
    for (let j = 0; j < 4; j++) {
      let str = (te.lines[j] || '').replace(/§./g, '');
      if (editing && editing.line === j) str = '> ' + str + (blink ? '_' : ' ') + ' <';
      if (!str) continue;
      let x = -Paintings.textWidth(str) / 2;
      const yTop = j * 10 - 20;
      for (const ch of str) {
        const g = G[ch] || G['?'];
        if (ch !== ' ') {
          const x0 = x / 96, x1 = (x + g.w) / 96, yt = 0.8333 - yTop / 96, yb = 0.8333 - (yTop + 8) / 96, zf = 0.0467;
          const q = [[x0, yb, zf], [x1, yb, zf], [x1, yt, zf], [x0, yt, zf]].map((v) => M3.apply(m, v[0], v[1], v[2], [0, 0, 0]));
          const u0 = g.u / AW, u1 = (g.u + g.w) / AW, v0 = g.v / AH, v1 = (g.v + 8) / AH;
          this.quadOut(sb, q, [[u0, v1], [u1, v1], [u1, v0], [u0, v0]], -1, col, sky, blk);
        }
        x += g.w + 1;
      }
    }
  }

  // ---------------------------------------------------------------- humanoids (player & mobs)
  // Poses use this model space (y up, facing -Z): a positive X rotation swings a
  // hanging limb forward, a positive Y rotation turns to the left.
  bipedPose(e, partial, kind) {
    const swing = e.limbSwing - e.limbAmount * (1 - partial);
    const amt = clamp(e.prevLimbAmount + (e.limbAmount - e.prevLimbAmount) * partial, 0, 1);
    const bodyYaw = e.pbodyYaw + wrapRadians(e.bodyYaw - e.pbodyYaw) * partial;
    const headYaw = e.pheadYaw + wrapRadians(e.headYaw - e.pheadYaw) * partial;
    const pitch = e.ppitch + (e.pitch - e.ppitch) * partial;
    const t = e.age + partial;
    const hy = wrapRadians(headYaw - bodyYaw);
    const pose = {};
    pose.head = [pitch, hy, 0];
    // walking: arms swing opposite to the legs
    let ra = Math.cos(swing * 0.6662 + Math.PI) * amt, la = Math.cos(swing * 0.6662) * amt;
    pose.rleg = [Math.cos(swing * 0.6662) * 1.4 * amt, 0, 0];
    pose.lleg = [Math.cos(swing * 0.6662 + Math.PI) * 1.4 * amt, 0, 0];
    let raz = 0, laz = 0, ray = 0, lay = 0;
    if (e.riding) { ra += Math.PI / 5; la += Math.PI / 5; pose.rleg = [Math.PI * 0.4, -Math.PI / 10, 0]; pose.lleg = [Math.PI * 0.4, Math.PI / 10, 0]; }
    // holding something: the arm comes forward a little
    if (e.held || (e.type === 'player' && e.inventory && e.inventory.held())) ra = ra * 0.5 + Math.PI / 10;
    // attack swing
    const sp = e.pswing + (e.swingProgress - e.pswing) * partial;
    const zombieLike = kind === 'zombie' || kind === 'mummy' || kind === 'wraith';
    if (sp > 0 && !zombieLike) {
      const by = Math.sin(Math.sqrt(sp) * Math.PI * 2) * 0.2;
      let f = 1 - sp; f *= f; f *= f; f = 1 - f;
      const f1 = Math.sin(f * Math.PI), f2 = Math.sin(sp * Math.PI) * (pitch + 0.7) * 0.75;
      pose.body = [0, -by, 0];
      ra += f1 * 1.2 + f2; ray -= by * 3; lay -= by; la -= by;
      raz += Math.sin(sp * Math.PI) * -0.4;
    }
    if (e.sneaking) {
      pose.body = { rot: [-0.5, pose.body ? pose.body[1] : 0, 0] };
      ra -= 0.4; la -= 0.4;
      pose.rleg = { rot: pose.rleg, off: [0, 3, 4] }; pose.lleg = { rot: pose.lleg, off: [0, 3, 4] };
      pose.head = { rot: pose.head, off: [0, -1, 0] };
    }
    // idle breathing sway
    raz += Math.cos(t * 0.09) * 0.05 + 0.05; laz -= Math.cos(t * 0.09) * 0.05 + 0.05;
    ra -= Math.sin(t * 0.067) * 0.05; la += Math.sin(t * 0.067) * 0.05;
    if (zombieLike) {
      const f = Math.sin(sp * Math.PI), f1 = Math.sin((1 - (1 - sp) * (1 - sp)) * Math.PI);
      ray = 0.1 - f * 0.6; lay = -(0.1 - f * 0.6);
      ra = Math.PI / 2 + f * 1.2 - f1 * 0.4; la = ra;
      raz = Math.cos(t * 0.09) * 0.05 + 0.05; laz = -raz;
      ra -= Math.sin(t * 0.067) * 0.05; la += Math.sin(t * 0.067) * 0.05;
    } else if (kind === 'skeleton' && e.aiming) {
      ra = Math.PI / 2 + pitch; la = Math.PI / 2 + pitch; ray = 0.1 + hy; lay = -0.5 + hy; raz = 0; laz = 0;
    }
    pose.rarm = [ra, ray, raz];
    pose.larm = [la, lay, laz];
    return pose;
  }
  baseMatrix(e, rx, ry, rz, partial, scale) {
    const bodyYaw = e.pbodyYaw + wrapRadians(e.bodyYaw - e.pbodyYaw) * partial;
    let m = M3.trans(rx, ry, rz);
    if (e.sleeping) {
      m = M3.mul(m, M3.ry(e.sleepYaw || 0));
      m = M3.mul(m, M3.trans(0, 0.56, 0));
      m = M3.mul(m, M3.rx(-Math.PI / 2));
      m = M3.mul(m, M3.trans(0, -1.5, 0));
    } else m = M3.mul(m, M3.ry(bodyYaw));
    if (e.dead && e.deathTime > 0) {
      let f = Math.sqrt((e.deathTime + partial - 1) / 20 * 1.6);
      if (f > 1) f = 1;
      m = M3.mul(m, M3.rz(f * Math.PI / 2 * (e.flipDeath ? -1 : 1)));
    }
    const s = (scale || 1) / 16;
    return M3.mul(m, M3.scale(s, s, s));
  }
  entColor(e) {
    let c = [255, 255, 255, 255];
    if (e.hurtTime > 0 || (e.dead && e.deathTime > 0)) c = [255, 150, 150, 255];
    return c;
  }
  drawHumanoid(e, rx, ry, rz, partial, skin, kind, opts) {
    opts = opts || {};
    const [sky, blk] = this.lightAt(e.x, e.y + e.h * 0.6, e.z);
    const model = kind === 'skeleton' ? MODELS.skeleton : kind === 'wraith' ? MODELS.wraith : MODELS.biped;
    const pose = this.bipedPose(e, partial, kind);
    const base = this.baseMatrix(e, rx, ry + (opts.yOff || 0) - (e.sneaking ? 0.2 : 0), rz, partial, opts.scale);
    const col = this.entColor(e);
    if (opts.alpha) col[3] = opts.alpha;
    const lsky = opts.glow ? -1 : sky, lblk = opts.glow ? 0 : blk;
    this.drawModel(model, skin, base, pose, col, lsky, lblk);
    // armour
    if (e.armorItems || e.inventory) {
      const armor = e.inventory ? e.inventory.armor.items : e.armorItems;
      for (let i = 0; i < 4; i++) {
        const a = armor[i]; if (!a) continue;
        const ad = armorOf(a.id); if (!ad) continue;
        const parts = [['head', 'hat'], ['body', 'rarm', 'larm'], ['body', 'rleg', 'lleg'], ['rleg', 'lleg']][i];
        const sk = (i === 2 ? 'legs_' : 'armor_') + ad.mat;
        this.drawModel(model, sk, base, pose, col, lsky, lblk, { only: parts, inflate: i === 2 ? 0.5 : 1 });
      }
    }
    // held item (right hand)
    const held = e.inventory ? e.inventory.held() : e.held;
    if (held) {
      let m = M3.mul(base, M3.trans(MODELS.biped.rarm.pivot[0], MODELS.biped.rarm.pivot[1], MODELS.biped.rarm.pivot[2]));
      const ra = pose.rarm;
      if (ra[2]) m = M3.mul(m, M3.rz(ra[2]));
      if (ra[1]) m = M3.mul(m, M3.ry(ra[1]));
      if (ra[0]) m = M3.mul(m, M3.rx(ra[0]));
      m = M3.mul(m, M3.trans(1, -10, -1));
      m = M3.mul(m, M3.scale(16, 16, 16));
      const isBlock = held.id < 256 && this.game.gui.icons.spriteName(held.id, held.dmg) === null;
      if (isBlock) {
        m = M3.mul(m, M3.trans(0, -0.0625, -0.18));
        m = M3.mul(m, M3.rx(0.35)); m = M3.mul(m, M3.ry(Math.PI / 4));
        m = M3.mul(m, M3.scale(0.375, 0.375, 0.375));
      } else {
        m = M3.mul(m, M3.rx(-Math.PI / 2));
        m = M3.mul(m, M3.ry(Math.PI / 2));
        m = M3.mul(m, M3.rz(Math.PI * 0.75));
        m = M3.mul(m, M3.scale(0.6, 0.6, 0.6));
        m = M3.mul(m, M3.trans(-0.5, -0.5, 0));
      }
      if (!isBlock && ITEMS[held.id] && ITEMS[held.id].rotateAround) {
        // rods are held out in front, tip raised (the sprite's diagonal points forward and up)
        m = M3.mul(base, M3.trans(MODELS.biped.rarm.pivot[0], MODELS.biped.rarm.pivot[1], MODELS.biped.rarm.pivot[2]));
        if (ra[2]) m = M3.mul(m, M3.rz(ra[2]));
        if (ra[1]) m = M3.mul(m, M3.ry(ra[1]));
        if (ra[0]) m = M3.mul(m, M3.rx(ra[0]));
        m = M3.mul(m, M3.trans(1, -10, -1));
        m = M3.mul(m, M3.scale(16, 16, 16));
        const sn = Math.sin(25 * DEG), co = Math.cos(25 * DEG), r2 = Math.SQRT1_2;
        m = M3.mul(m, [0, 0, 1, (sn - co) * r2, (sn + co) * r2, 0, (-co - sn) * r2, (sn - co) * r2, 0, 0, 0, 0]);
        m = M3.mul(m, M3.scale(0.9, 0.9, 0.9));
        m = M3.mul(m, M3.trans(-0.15, -0.15, 0));
        const cam = this.game.camera, tip = M3.apply(m, 0.9, 0.9, 0, [0, 0, 0]);
        e._rodTip = [tip[0] + cam.x, tip[1] + cam.y, tip[2] + cam.z]; e._rodTipFrame = this.frameNo;
      }
      this.drawItem(held, m, lsky, lblk, 255);
    }
  }

  // ---------------------------------------------------------------- first-person hand
  drawHand(cam, partial) {
    const g = this.game, p = g.player, gl = this.r.gl;
    if (!p || g.thirdPerson || g.hideHud || p.dead || p.sleeping) return;
    const r = this.r;
    gl.clear(gl.DEPTH_BUFFER_BIT);
    Mat4.perspective(this.handProj, 70 * DEG, r.width / r.height, 0.05, 10);
    const held = p.lastHeld !== undefined ? p.lastHeld : p.inventory.held();
    const equip = p.pequip + (p.equip - p.pequip) * partial;
    const sp = p.pswing + (p.swingProgress - p.pswing) * partial;
    const [sky, blk] = this.lightAt(p.x, p.y + p.eye, p.z);
    // view bobbing for the hand
    let m = M3.ident();
    if (g.settings.viewBobbing) {
      const dw = p.distWalked - p.pdistWalked;
      const f1 = -(p.distWalked + dw * partial);
      const bob = p.pbob + (p.bob - p.pbob) * partial;
      m = M3.mul(m, M3.trans(Math.sin(f1 * Math.PI) * bob * 0.5, -Math.abs(Math.cos(f1 * Math.PI) * bob), 0));
      m = M3.mul(m, M3.rz(Math.sin(f1 * Math.PI) * bob * 3 * DEG));
      m = M3.mul(m, M3.rx(Math.abs(Math.cos(f1 * Math.PI - 0.2) * bob) * 5 * DEG));
    }
    // hand sway follows camera movement
    const sway = g.handSway || [0, 0];
    m = M3.mul(m, M3.rx(sway[1] * 0.1 * DEG));
    m = M3.mul(m, M3.ry(sway[0] * 0.1 * DEG));
    const b = this.r.batch, sb = this.skinBatch;
    b.reset(); sb.reset();
    const useT = p.useItem ? (p.useMax - p.useTime) + partial : 0;
    // classic first-person transforms (camera looks down -Z)
    const firstPersonBase = (mm, swingP) => {
      let a = M3.mul(mm, M3.trans(0.56, -0.52 - (1 - equip) * 0.6, -0.72));
      a = M3.mul(a, M3.ry(45 * DEG));
      const f = Math.sin(swingP * swingP * Math.PI), f1 = Math.sin(Math.sqrt(swingP) * Math.PI);
      a = M3.mul(a, M3.ry(-f * 20 * DEG));
      a = M3.mul(a, M3.rz(-f1 * 20 * DEG));
      a = M3.mul(a, M3.rx(-f1 * 80 * DEG));
      return M3.mul(a, M3.scale(0.4, 0.4, 0.4));
    };
    if (!held) {
      // bare arm, drawn in the classic model space (x & y mirrored relative to ours)
      const f = -0.3 * Math.sin(Math.sqrt(sp) * Math.PI), f1 = 0.4 * Math.sin(Math.sqrt(sp) * Math.PI * 2), f2 = -0.4 * Math.sin(sp * Math.PI);
      let a = M3.mul(m, M3.trans(f, f1, f2));
      a = M3.mul(a, M3.trans(0.64, -0.6 - (1 - equip) * 0.6, -0.72));
      a = M3.mul(a, M3.ry(45 * DEG));
      const f3 = Math.sin(sp * sp * Math.PI), f4 = Math.sin(Math.sqrt(sp) * Math.PI);
      a = M3.mul(a, M3.ry(f4 * 70 * DEG));
      a = M3.mul(a, M3.rz(-f3 * 20 * DEG));
      a = M3.mul(a, M3.trans(-1, 3.6, 3.5));
      a = M3.mul(a, M3.rz(120 * DEG));
      a = M3.mul(a, M3.rx(200 * DEG));
      a = M3.mul(a, M3.ry(-135 * DEG));
      a = M3.mul(a, M3.trans(5.6, 0, 0));
      a = M3.mul(a, M3.scale(1 / 16, 1 / 16, 1 / 16));
      a = M3.mul(a, M3.trans(-5, 2, 0));          // classic shoulder pivot
      a = M3.mul(a, M3.rz(Math.PI));              // our model space -> classic
      a = M3.mul(a, M3.trans(-5, -22, 0));        // cancel our pivot
      const arm = { rarm: MODELS.biped.rarm };
      this.drawModel(arm, g.playerSkin(), a, { rarm: [0, 0, 0.1] }, [255, 255, 255, 255], sky, blk);
    } else {
      const isBlock = held.id < 256 && g.gui.icons.spriteName(held.id, held.dmg) === null;
      const def = ITEMS[held.id];
      const eating = p.useItem && (foodOf(p.useItem.id) || (ITEMS[p.useItem.id] && ITEMS[p.useItem.id].drink));
      let a;
      if (eating) {
        const left = p.useTime - partial + 1;
        const f1 = left / p.useMax;
        let f2 = Math.abs(Math.cos(left / 4 * Math.PI) * 0.1);
        if (f1 >= 0.8) f2 = 0;
        let e = M3.mul(m, M3.trans(0, f2, 0));
        const f3 = 1 - Math.pow(f1, 27);
        e = M3.mul(e, M3.trans(f3 * 0.6, f3 * -0.5, 0));
        e = M3.mul(e, M3.ry(f3 * 90 * DEG));
        e = M3.mul(e, M3.rx(f3 * 10 * DEG));
        e = M3.mul(e, M3.rz(f3 * 30 * DEG));
        a = firstPersonBase(e, 0);
      } else if (held.id === ITEM_IDS.bow && p.useItem) {
        a = firstPersonBase(m, 0);
        a = M3.mul(a, M3.rz(-18 * DEG)); a = M3.mul(a, M3.ry(-12 * DEG)); a = M3.mul(a, M3.rx(-8 * DEG));
        a = M3.mul(a, M3.trans(-0.9, 0.2, 0));
        let f1 = useT / 20; f1 = (f1 * f1 + f1 * 2) / 3; if (f1 > 1) f1 = 1;
        if (f1 > 0.1) a = M3.mul(a, M3.trans(0, Math.sin((useT - 0.1) * 1.3) * (f1 - 0.1) * 0.01, 0));
        a = M3.mul(a, M3.trans(0, 0, f1 * 0.1));
        a = M3.mul(a, M3.scale(1, 1, 1 + f1 * 0.2));
      } else {
        const f = -0.4 * Math.sin(Math.sqrt(sp) * Math.PI), f1 = 0.2 * Math.sin(Math.sqrt(sp) * Math.PI * 2), f2 = -0.2 * Math.sin(sp * Math.PI);
        a = firstPersonBase(M3.mul(m, M3.trans(f, f1, f2)), sp);
      }
      if (!isBlock) {
        // flat items are held mirrored, tip pointing in toward the view (rods are turned round to point at the crosshair)
        if (def && def.rotateAround) a = M3.mul(a, M3.ry(Math.PI));
        a = M3.mul(a, M3.trans(0, -0.3, 0));
        a = M3.mul(a, M3.scale(1.5, 1.5, 1.5));
        a = M3.mul(a, M3.ry(50 * DEG));
        a = M3.mul(a, M3.rz(335 * DEG));
        a = M3.mul(a, M3.trans(-0.9375, -0.0625, 0));
        a = M3.mul(a, M3.trans(1, 0, 0));
        a = M3.mul(a, M3.scale(-1, 1, 1));
      }
      void def;
      this.drawItem(held, a, sky, blk, 255);
    }
    const vp = Mat4.create();
    if (cam.roll) Mat4.rotateZ(vp, vp, cam.roll);
    Mat4.multiply(vp, this.handProj, vp);
    gl.disable(gl.CULL_FACE);
    r.useEnt(vp, 1, 0.1, false);
    sb.flush();
    r.useEnt(vp, 0, 0.1, false);
    b.flush();
    gl.enable(gl.CULL_FACE);
  }

  // ---------------------------------------------------------------- block outline & cracks
  drawSelection(cam, hit, breaking) {
    if (!hit) return;
    const g = this.game, gl = this.r.gl, b = this.r.batch;
    const w = g.world;
    const boxes = [];
    const def = BLOCKS[hit.id];
    if (def && def.select && def.select(hit.meta)) { const s = def.select(hit.meta); boxes.push(new AABB(hit.x + s[0], hit.y + s[1], hit.z + s[2], hit.x + s[3], hit.y + s[4], hit.z + s[5])); }
    else if (hit.box) for (const bb of hit.box) boxes.push(bb);
    else boxes.push(new AABB(hit.x, hit.y, hit.z, hit.x + 1, hit.y + 1, hit.z + 1));
    b.reset();
    const e = 0.002, t = 0.0045;
    const col = [0, 0, 0, 102];
    for (const bb of boxes) {
      const x0 = bb.x0 - e - cam.x, y0 = bb.y0 - e - cam.y, z0 = bb.z0 - e - cam.z, x1 = bb.x1 + e - cam.x, y1 = bb.y1 + e - cam.y, z1 = bb.z1 + e - cam.z;
      const edges = [
        [[x0, y0, z0], [x1, y0, z0]], [[x0, y1, z0], [x1, y1, z0]], [[x0, y0, z1], [x1, y0, z1]], [[x0, y1, z1], [x1, y1, z1]],
        [[x0, y0, z0], [x0, y1, z0]], [[x1, y0, z0], [x1, y1, z0]], [[x0, y0, z1], [x0, y1, z1]], [[x1, y0, z1], [x1, y1, z1]],
        [[x0, y0, z0], [x0, y0, z1]], [[x1, y0, z0], [x1, y0, z1]], [[x0, y1, z0], [x0, y1, z1]], [[x1, y1, z0], [x1, y1, z1]],
      ];
      for (const [p0, p1] of edges) {
        // thin quad facing the camera
        const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, mz = (p0[2] + p1[2]) / 2;
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
        // perpendicular = edge x view
        let px = dy * mz - dz * my, py = dz * mx - dx * mz, pz = dx * my - dy * mx;
        const pl = Math.hypot(px, py, pz) || 1;
        const dist = Math.hypot(mx, my, mz);
        const th = t * Math.max(1, dist * 0.6);
        px = px / pl * th; py = py / pl * th; pz = pz / pl * th;
        this.quadOut(b, [[p0[0] - px, p0[1] - py, p0[2] - pz], [p1[0] - px, p1[1] - py, p1[2] - pz], [p1[0] + px, p1[1] + py, p1[2] + pz], [p0[0] + px, p0[1] + py, p0[2] + pz]], [[0, 0], [0, 0], [0, 0], [0, 0]], 0, col, -1, 0);
      }
    }
    // outline
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    this.r.useEnt(this.r.vp, 2, -1, false);
    b.flush();
    gl.depthMask(true);
    // crack overlay
    if (breaking && breaking.progress > 0 && breaking.x === hit.x && breaking.y === hit.y && breaking.z === hit.z) {
      const stage = clamp(Math.floor(breaking.progress * 10), 0, 9);
      const layer = this.r.atlas.L_DESTROY[stage];
      const n0 = b.n;
      for (const bb of boxes) {
        const ee = 0.004;
        const x0 = bb.x0 - ee - cam.x, y0 = bb.y0 - ee - cam.y, z0 = bb.z0 - ee - cam.z, x1 = bb.x1 + ee - cam.x, y1 = bb.y1 + ee - cam.y, z1 = bb.z1 + ee - cam.z;
        const bx0 = bb.x0 - hit.x, by0 = bb.y0 - hit.y, bz0 = bb.z0 - hit.z, bx1 = bb.x1 - hit.x, by1 = bb.y1 - hit.y, bz1 = bb.z1 - hit.z;
        const c = [255, 255, 255, 255];
        this.quadOut(b, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [[bx0, bz0], [bx0, bz1], [bx1, bz1], [bx1, bz0]], layer, c, -1, 0);
        this.quadOut(b, [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]], [[bx0, bz1], [bx1, bz1], [bx1, bz0], [bx0, bz0]], layer, c, -1, 0);
        this.quadOut(b, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [[1 - bx1, 1 - by0], [1 - bx0, 1 - by0], [1 - bx0, 1 - by1], [1 - bx1, 1 - by1]], layer, c, -1, 0);
        this.quadOut(b, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [[bx0, 1 - by0], [bx1, 1 - by0], [bx1, 1 - by1], [bx0, 1 - by1]], layer, c, -1, 0);
        this.quadOut(b, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [[bz0, 1 - by0], [bz1, 1 - by0], [bz1, 1 - by1], [bz0, 1 - by1]], layer, c, -1, 0);
        this.quadOut(b, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [[1 - bz1, 1 - by0], [1 - bz0, 1 - by0], [1 - bz0, 1 - by1], [1 - bz1, 1 - by1]], layer, c, -1, 0);
      }
      void n0;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.DST_COLOR, gl.SRC_COLOR);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      this.r.useEnt(this.r.vp, 0, 0.01, true);
      b.flush();
      gl.depthMask(true);
    }
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
  }
}
