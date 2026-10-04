'use strict';
// ---------------------------------------------------------------------------
// Explorer's Map screen: pan (drag), zoom (wheel / buttons), markers.
// ---------------------------------------------------------------------------
class MapScreen extends Screen {
  constructor(game) {
    super(game);
    this.background = 'world';
    this.pauses = false;
    this.touchPan = true;
    const p = game.player;
    this.cx = p ? p.x : 0; this.cz = p ? p.z : 0;
    this.zoom = 2;                   // GUI pixels per block
    this.dragging = null;
    this.regions = new Map();        // "rx,rz" -> { cv, version }
    this.hover = null;
  }
  init() {
    const W = this.W, H = this.H;
    this.mx0 = 8; this.my0 = 22; this.mw = W - 16; this.mh = H - 52;
    const by = H - 26;
    this.add(new Button(W / 2 - 154, by, 50, 20, '-', () => this.setZoom(this.zoom / 2)));
    this.add(new Button(W / 2 - 100, by, 50, 20, '+', () => this.setZoom(this.zoom * 2)));
    this.add(new Button(W / 2 - 46, by, 92, 20, 'Center', () => { const p = this.game.player; this.cx = p.x; this.cz = p.z; }));
    this.add(new Button(W / 2 + 50, by, 104, 20, 'Done', () => this.close()));
  }
  setZoom(z) { this.zoom = clamp(z, 0.25, 8); }
  close() { this.game.closeScreen(); }
  regionCanvas(rx, rz) {
    const store = this.game.maps;
    const key = rx + ',' + rz;
    let r = this.regions.get(key);
    if (r && r.version === store.version) return r.cv;
    if (!r) { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512; r = { cv, ctx: cv.getContext('2d'), img: null, version: -1, has: false }; this.regions.set(key, r); }
    if (!r.img) r.img = r.ctx.createImageData(512, 512);
    const d = r.img.data;
    let any = false;
    for (let lcz = 0; lcz < 32; lcz++) for (let lcx = 0; lcx < 32; lcx++) {
      const ch = store.chunks.get(ckey(rx * 32 + lcx, rz * 32 + lcz));
      for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
        const o = (((lcz * 16 + lz) * 512) + lcx * 16 + lx) * 4;
        const v = ch ? ch[(lz << 4) | lx] : 0;
        const c = v ? MAP_COLORS[v >> 2] : null;
        if (!c) { d[o + 3] = 0; continue; }
        const k = MAP_SHADE[v & 3] / 255;
        d[o] = c[0] * k; d[o + 1] = c[1] * k; d[o + 2] = c[2] * k; d[o + 3] = 255;
        any = true;
      }
    }
    r.ctx.putImageData(r.img, 0, 0);
    r.version = store.version; r.has = any;
    return r.cv;
  }
  toWorld(mx, my) { return [this.cx + (mx - (this.mx0 + this.mw / 2)) / this.zoom, this.cz + (my - (this.my0 + this.mh / 2)) / this.zoom]; }
  toScreen(x, z) { return [this.mx0 + this.mw / 2 + (x - this.cx) * this.zoom, this.my0 + this.mh / 2 + (z - this.cz) * this.zoom]; }
  draw(gui, mx, my) {
    gui.worldOverlay();
    const ctx = gui.ctx, g = this.game, store = g.maps, p = g.player;
    const x0 = this.mx0, y0 = this.my0, w = this.mw, h = this.mh;
    // parchment frame
    ctx.fillStyle = '#5a3e1c'; ctx.fillRect(x0 - 4, y0 - 4, w + 8, h + 8);
    ctx.fillStyle = '#8a6a3a'; ctx.fillRect(x0 - 3, y0 - 3, w + 6, h + 6);
    ctx.fillStyle = '#e4d6ac'; ctx.fillRect(x0, y0, w, h);
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
    // parchment texture
    ctx.fillStyle = 'rgba(160,130,80,0.10)';
    for (let i = 0; i < 60; i++) { const px = x0 + ((i * 97) % w), py = y0 + ((i * 53) % h); ctx.fillRect(px, py, 2 + (i % 3), 1); }
    if (store) {
      const [wx0, wz0] = this.toWorld(x0, y0), [wx1, wz1] = this.toWorld(x0 + w, y0 + h);
      const rx0 = Math.floor(wx0 / 512), rx1 = Math.floor(wx1 / 512), rz0 = Math.floor(wz0 / 512), rz1 = Math.floor(wz1 / 512);
      ctx.imageSmoothingEnabled = false;
      for (let rz = rz0; rz <= rz1; rz++) for (let rx = rx0; rx <= rx1; rx++) {
        const cv = this.regionCanvas(rx, rz);
        const r = this.regions.get(rx + ',' + rz);
        if (!r || !r.has) continue;
        const [sx, sy] = this.toScreen(rx * 512, rz * 512);
        ctx.drawImage(cv, Math.round(sx), Math.round(sy), Math.round(512 * this.zoom), Math.round(512 * this.zoom));
      }
    }
    // markers
    const mark = (x, z, fn) => { const [sx, sy] = this.toScreen(x, z); if (sx >= x0 - 8 && sy >= y0 - 8 && sx < x0 + w + 8 && sy < y0 + h + 8) fn(Math.round(sx), Math.round(sy)); };
    const w0 = g.world;
    if (w0 && w0.spawn) mark(w0.spawn.x + 0.5, w0.spawn.z + 0.5, (sx, sy) => { ctx.fillStyle = '#202020'; ctx.fillRect(sx - 3, sy - 1, 7, 3); ctx.fillRect(sx - 1, sy - 3, 3, 7); ctx.fillStyle = '#f0e8d0'; ctx.fillRect(sx - 2, sy, 5, 1); ctx.fillRect(sx, sy - 2, 1, 5); });
    const sp = p && p.spawnPoint && !Array.isArray(p.spawnPoint) && !p.spawnPoint.forced ? p.spawnPoint : null;
    if (sp) mark(sp.x + 0.5, sp.z + 0.5, (sx, sy) => { ctx.fillStyle = '#202020'; ctx.fillRect(sx - 3, sy - 2, 7, 5); ctx.fillStyle = '#c02020'; ctx.fillRect(sx - 2, sy - 1, 5, 3); ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - 2, sy - 1, 2, 1); });
    // treasure from messages in bottles: a red X
    const marks = w0 && w0.info && w0.info.treasureMarks;
    if (marks) for (const t of marks) mark(t.x + 0.5, t.z + 0.5, (sx, sy) => {
      for (let k = -3; k <= 3; k++) { ctx.fillStyle = '#3a0a0a'; ctx.fillRect(sx + k - 1, sy + k - 1, 3, 3); ctx.fillRect(sx + k - 1, sy - k - 1, 3, 3); }
      ctx.fillStyle = '#d02020';
      for (let k = -3; k <= 3; k++) { ctx.fillRect(sx + k, sy + k, 1, 1); ctx.fillRect(sx + k, sy - k, 1, 1); }
    });
    if (p) mark(p.x, p.z, (sx, sy) => {
      // arrow pointing where the player looks
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      for (let t = -3; t <= 4; t++) {
        const half = Math.max(0, (4 - t) * 0.6);
        for (let s = -half; s <= half; s += 0.5) {
          const px = sx + fx * t + fz * s, py = sy + fz * t - fx * s;
          ctx.fillStyle = t > 1 ? '#ffffff' : '#d02020';
          ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
        }
      }
    });
    ctx.restore();
    // header & hover readout
    gui.textCentered("Explorer's Map", this.W / 2, 6, '#ffffff');
    const explored = store ? store.explored() : 0;
    gui.text(Math.round(explored * 256 / 1000) / 1000 + ' km² explored', 8, 6, '#a0a0a0');
    if (mx >= x0 && my >= y0 && mx < x0 + w && my < y0 + h) {
      const [wx, wz] = this.toWorld(mx, my);
      const bx = Math.floor(wx), bz = Math.floor(wz);
      const known = store && store.chunks.has(ckey(bx >> 4, bz >> 4));
      const bio = known && w0 ? BIOMES[w0.biomeAt(bx, bz)] : null;
      gui.textRight('X ' + bx + '  Z ' + bz + (bio ? '  ' + bio.name : known ? '' : '  (unexplored)'), this.W - 8, 6, '#e0e0e0');
    }
    for (const wd of this.widgets) wd.draw(gui, mx, my);
  }
  mouseDown(mx, my, btn) {
    if (super.mouseDown(mx, my, btn)) return true;
    if (mx >= this.mx0 && my >= this.my0 && mx < this.mx0 + this.mw && my < this.my0 + this.mh) this.dragging = { mx, my, cx: this.cx, cz: this.cz };
    return true;
  }
  mouseMove(mx, my) {
    super.mouseMove(mx, my);
    if (this.dragging) { this.cx = this.dragging.cx - (mx - this.dragging.mx) / this.zoom; this.cz = this.dragging.cz - (my - this.dragging.my) / this.zoom; }
  }
  mouseUp(mx, my, btn) { super.mouseUp(mx, my, btn); this.dragging = null; }
  wheel(d) { this.setZoom(d < 0 ? this.zoom * 2 : this.zoom / 2); }
  keyDown(e) {
    if (e.key === 'Escape' || e.code === 'KeyM' || e.code === KEYS.inventory) { this.close(); return; }
    if (e.key === '+' || e.key === '=') this.setZoom(this.zoom * 2);
    if (e.key === '-') this.setZoom(this.zoom / 2);
    const step = 32 / this.zoom;
    if (e.key === 'ArrowLeft') this.cx -= step; if (e.key === 'ArrowRight') this.cx += step;
    if (e.key === 'ArrowUp') this.cz -= step; if (e.key === 'ArrowDown') this.cz += step;
  }
}
