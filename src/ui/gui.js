'use strict';
// ---------------------------------------------------------------------------
// GUI renderer: draws on a 2D canvas in "GUI pixels" (scaled by guiScale).
// ---------------------------------------------------------------------------
class GuiRenderer {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.font = new PixelFont();
    this.icons = new ItemIcons();
    this.scale = 2;
    this.w = 320; this.h = 240;
    this.buildTextures();
  }
  resize(pw, ph) {
    this.canvas.width = pw; this.canvas.height = ph;
    const pref = this.game.settings.guiScale | 0;
    let s = 1;
    while (s < 8 && Math.floor(pw / (s + 1)) >= 320 && Math.floor(ph / (s + 1)) >= 240) s++;
    if (pref > 0) s = Math.min(s, pref);
    if (s !== this.scale) this.icons.clear();
    this.scale = s;
    this.w = Math.floor(pw / s); this.h = Math.floor(ph / s);
  }
  begin() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- textures
  buildTextures() {
    const mk = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'); const img = ctx.createImageData(w, h); fn(img.data, w, h); ctx.putImageData(img, 0, 0); return c; };
    const rng = new Noise.Random(91);
    const noise = [];
    for (let i = 0; i < 200 * 20; i++) noise.push(rng.nextFloat());
    const button = (base, hi, lo, edge) => mk(200, 20, (d, w, h) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let c;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c = edge;
        else if (y === 1 || x === 1) c = hi;
        else if (y >= h - 3 || x === w - 2) c = lo;
        else { const n = (noise[y * w + x] - 0.5) * 14 + (y < 10 ? 3 : 0); c = base.map((v) => v + n); }
        const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
    });
    this.btnNormal = button([111, 111, 111], [170, 170, 170], [86, 86, 86], [0, 0, 0]);
    this.btnHover = button([126, 136, 191], [188, 198, 255], [90, 98, 150], [255, 255, 255]);
    this.btnDisabled = button([44, 44, 44], [56, 56, 56], [36, 36, 36], [0, 0, 0]);
    // dirt background tile (darkened)
    this.dirt = TexGen.T.dirt.toCanvas(1);
    // panel colours
    this.P = { bg: '#c6c6c6', hi: '#ffffff', lo: '#555555', edge: '#000000', slot: '#8b8b8b', slotHi: '#ffffff', slotLo: '#373737' };
  }

  // ---------------------------------------------------------------- primitives
  rect(x, y, w, h, color) { const c = this.ctx; c.fillStyle = color; c.fillRect(x, y, w, h); }
  gradient(x, y, w, h, c1, c2) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  }
  text(str, x, y, color, shadow) { return this.font.draw(this.ctx, str, x, y, color || '#ffffff', shadow); }
  textCentered(str, cx, y, color, shadow) { const w = this.font.width(str); return this.font.draw(this.ctx, str, Math.floor(cx - w / 2), y, color || '#ffffff', shadow); }
  textRight(str, rx, y, color, shadow) { const w = this.font.width(str); return this.font.draw(this.ctx, str, rx - w, y, color || '#ffffff', shadow); }
  textWidth(str) { return this.font.width(str); }
  // text scaled by an integer/float factor (e.g. titles)
  textScaled(str, x, y, color, s, shadow) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    this.font.draw(ctx, str, 0, 0, color, shadow);
    ctx.restore();
  }

  dirtBackground(offsetY, darkness) {
    const ctx = this.ctx;
    const tile = 32;
    offsetY = offsetY || 0;
    ctx.save();
    for (let y = -tile + (offsetY % tile); y < this.h; y += tile) for (let x = 0; x < this.w; x += tile) ctx.drawImage(this.dirt, x, y, tile, tile);
    ctx.fillStyle = 'rgba(0,0,0,' + (darkness === undefined ? 0.75 : darkness) + ')';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  }
  worldOverlay() { this.gradient(0, 0, this.w, this.h, 'rgba(16,16,16,0.75)', 'rgba(16,16,16,0.82)'); }

  button(x, y, w, h, label, state) {
    const ctx = this.ctx;
    const tex = state === 'disabled' ? this.btnDisabled : state === 'hover' ? this.btnHover : this.btnNormal;
    const hw = Math.floor(w / 2);
    // left half & right half from the 200px texture, top & bottom halves for custom heights
    const th = Math.min(h, 20), top = Math.floor(th / 2);
    ctx.drawImage(tex, 0, 0, hw, top, x, y, hw, top);
    ctx.drawImage(tex, 200 - (w - hw), 0, w - hw, top, x + hw, y, w - hw, top);
    ctx.drawImage(tex, 0, 20 - (h - top), hw, h - top, x, y + top, hw, h - top);
    ctx.drawImage(tex, 200 - (w - hw), 20 - (h - top), w - hw, h - top, x + hw, y + top, w - hw, h - top);
    if (label !== undefined && label !== null) {
      const col = state === 'disabled' ? '#a0a0a0' : state === 'hover' ? '#ffffa0' : '#e0e0e0';
      this.textCentered(label, x + w / 2, y + Math.floor((h - 8) / 2), col);
    }
  }
  // classic container panel with rounded black outline & bevel
  panel(x, y, w, h) {
    const ctx = this.ctx, P = this.P;
    ctx.fillStyle = P.edge;
    ctx.fillRect(x + 2, y, w - 4, 1); ctx.fillRect(x + 2, y + h - 1, w - 4, 1);
    ctx.fillRect(x, y + 2, 1, h - 4); ctx.fillRect(x + w - 1, y + 2, 1, h - 4);
    ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + w - 2, y + 1, 1, 1); ctx.fillRect(x + 1, y + h - 2, 1, 1); ctx.fillRect(x + w - 2, y + h - 2, 1, 1);
    ctx.fillStyle = P.bg; ctx.fillRect(x + 1, y + 2, w - 2, h - 4); ctx.fillRect(x + 2, y + 1, w - 4, h - 2);
    ctx.fillStyle = P.hi; ctx.fillRect(x + 2, y + 1, w - 5, 2); ctx.fillRect(x + 1, y + 2, 2, h - 5); ctx.fillRect(x + 3, y + 3, 1, 1);
    ctx.fillStyle = P.lo; ctx.fillRect(x + 3, y + h - 3, w - 5, 2); ctx.fillRect(x + w - 3, y + 3, 2, h - 5); ctx.fillRect(x + w - 4, y + h - 4, 1, 1);
    ctx.fillStyle = P.bg; ctx.fillRect(x + w - 3, y + 1, 1, 1); ctx.fillRect(x + w - 2, y + 2, 1, 1); ctx.fillRect(x + 1, y + h - 3, 1, 1); ctx.fillRect(x + 2, y + h - 2, 1, 1);
  }
  // 18x18 inventory slot frame (item drawn at x+1,y+1)
  slot(x, y, w, h) {
    w = w || 18; h = h || 18;
    const ctx = this.ctx, P = this.P;
    ctx.fillStyle = P.slotLo; ctx.fillRect(x, y, w - 1, 1); ctx.fillRect(x, y, 1, h - 1);
    ctx.fillStyle = P.slotHi; ctx.fillRect(x + 1, y + h - 1, w - 1, 1); ctx.fillRect(x + w - 1, y + 1, 1, h - 1);
    ctx.fillStyle = P.slot; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = '#8b8b8b'; ctx.fillRect(x + w - 1, y, 1, 1); ctx.fillRect(x, y + h - 1, 1, 1);
  }
  darkInset(x, y, w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = '#373737'; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 1, y + h - 1, w - 1, 1); ctx.fillRect(x + w - 1, y + 1, 1, h - 1);
    ctx.fillStyle = '#000000'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  }
  // draw an item stack at GUI coords (16x16 area)
  item(stack, x, y, opts) {
    if (!stack || stack.count <= 0) return;
    const ctx = this.ctx;
    const icon = this.icons.get(stack.id, stack.dmg, this.scale);
    ctx.drawImage(icon, x, y, 16, 16);
    if (stack.tag && stack.tag.ench && stack.tag.ench.length) this.glint(icon, x, y);
    opts = opts || {};
    const md = maxDamageOf(stack.id);
    if (md > 0 && stack.dmg > 0) {
      const f = 1 - stack.dmg / md;
      const w = Math.round(13 * f);
      ctx.fillStyle = '#000000'; ctx.fillRect(x + 2, y + 13, 13, 2);
      const r = Math.round(255 * (1 - f)), g = Math.round(255 * f);
      ctx.fillStyle = 'rgb(' + Math.round(r * 0.25) + ',' + Math.round(g * 0.25) + ',0)'; ctx.fillRect(x + 2, y + 13, 12, 1);
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',0)'; ctx.fillRect(x + 2, y + 13, w, 1);
    }
    if (stack.count > 1 || opts.showOne) {
      const s = String(stack.count);
      this.textRight(s, x + 17, y + 9, '#ffffff');
    }
  }
  // enchantment shimmer over an icon: purple bands sliding across, added on top
  glint(icon, x, y) {
    const size = icon.width;
    let c = this._glint;
    if (!c) c = this._glint = document.createElement('canvas');
    if (c.width !== size) { c.width = size; c.height = size; }
    const g = c.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, size, size);
    g.drawImage(icon, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = 'rgba(70,30,130,0.55)';
    g.fillRect(0, 0, size, size);
    const t = (performance.now() % 3000) / 3000;
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(170,100,255,0.9)';
    for (const k of [0, 0.5]) {
      const o = ((t + k) % 1) * size * 2.4 - size * 0.7;
      g.beginPath(); g.moveTo(o, 0); g.lineTo(o + size * 0.32, 0); g.lineTo(o + size * 0.32 - size, size); g.lineTo(o - size, size); g.closePath(); g.fill();
    }
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(c, x, y, 16, 16);
    ctx.globalCompositeOperation = 'source-over';
  }
  // tooltip box in the classic dark purple style
  tooltip(lines, mx, my) {
    if (!lines || !lines.length) return;
    let w = 0;
    for (const l of lines) w = Math.max(w, this.textWidth(l));
    const h = lines.length === 1 ? 8 : 8 + 2 + (lines.length - 1) * 10;
    let x = mx + 12, y = my - 12;
    if (x + w + 4 > this.w) x = mx - 16 - w;
    if (y + h + 6 > this.h) y = this.h - h - 6;
    if (y < 4) y = 4;
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(16,0,16,0.94)';
    ctx.fillRect(x - 3, y - 4, w + 6, 1); ctx.fillRect(x - 3, y + h + 3, w + 6, 1);
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6); ctx.fillRect(x - 4, y - 3, 1, h + 6); ctx.fillRect(x + w + 3, y - 3, 1, h + 6);
    const g = ctx.createLinearGradient(0, y - 3, 0, y + h + 3);
    g.addColorStop(0, 'rgba(80,0,255,0.31)'); g.addColorStop(1, 'rgba(40,0,127,0.31)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 3, y - 2, 1, h + 4); ctx.fillRect(x + w + 2, y - 2, 1, h + 4);
    ctx.fillRect(x - 3, y - 3, w + 6, 1); ctx.fillRect(x - 3, y + h + 2, w + 6, 1);
    let yy = y;
    lines.forEach((l, i) => { this.text(l, x, yy, i === 0 ? '#ffffff' : '#a8a8a8'); yy += i === 0 ? 12 : 10; });
  }
  // vertically scrolling list frame (world list)
  listBackground(x, y, w, h) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    for (let yy = y - 32; yy < y + h; yy += 32) for (let xx = x; xx < x + w; xx += 32) ctx.drawImage(this.dirt, xx, yy, 32, 32);
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(x, y, w, h);
    ctx.restore();
    this.gradient(x, y, w, 4, 'rgba(0,0,0,1)', 'rgba(0,0,0,0)');
    this.gradient(x, y + h - 4, w, 4, 'rgba(0,0,0,0)', 'rgba(0,0,0,1)');
  }
  // horizontal progress bar (loading screens)
  progress(x, y, w, f) {
    this.rect(x, y, w, 2, '#808080');
    this.rect(x, y, Math.round(w * clamp(f, 0, 1)), 2, '#80ff80');
  }
  sprite(name, x, y, w, h) {
    const t = TexGen.T[name]; if (!t) return;
    if (!t._cv) t._cv = t.toCanvas(1);
    this.ctx.drawImage(t._cv, x, y, w || 16, h || 16);
  }
}
