'use strict';
// ---------------------------------------------------------------------------
// In-game HUD
// ---------------------------------------------------------------------------
const HudSprites = (() => {
  const make = (rows, pal) => {
    const h = rows.length, w = rows[0].length;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = rows[y][x]; const col = pal[ch];
      if (!col) continue;
      const [r, g, b] = hexToRgb(col); const i = (y * w + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = ch === 's' ? 160 : 255;
    }
    ctx.putImageData(img, 0, 0); return c;
  };
  const HEART = [
    '.ooo.ooo.',
    'ohhfoffro',
    'ohfffffro',
    'offfffffo',
    '.offfffo.',
    '..offfo..',
    '...ofo...',
    '....o....',
    '.........'];
  const HEART_HALF = HEART.map((r) => r.split('').map((c, x) => (x > 4 && (c === 'f' || c === 'h' || c === 'r')) ? 'e' : c).join(''));
  const S = {};
  S.heartBg = make(HEART.map((r) => r.replace(/[hfr]/g, 'e')), { o: '#000000', e: '#3a1414' });
  S.heartBgFlash = make(HEART.map((r) => r.replace(/[hfr]/g, 'e')), { o: '#ffffff', e: '#3a1414' });
  S.heart = make(HEART, { o: '#000000', h: '#ff8a8a', f: '#e01818', r: '#a00c0c' });
  S.heartHalf = make(HEART_HALF, { o: '#000000', h: '#ff8a8a', f: '#e01818', r: '#a00c0c', e: '#3a1414' });
  S.heartPoison = make(HEART, { o: '#000000', h: '#c8e070', f: '#7a9a20', r: '#4a6a10' });
  S.heartPoisonHalf = make(HEART_HALF, { o: '#000000', h: '#c8e070', f: '#7a9a20', r: '#4a6a10', e: '#3a1414' });
  S.heartHardcore = make(HEART.map((r, y) => y === 2 ? 'ohfkfkfro' : r), { o: '#000000', h: '#ff8a8a', f: '#e01818', r: '#a00c0c', k: '#3a0000' });
  const FOOD = [
    '......oo.',
    '.....obbo',
    '....oobbo',
    '...omoo..',
    '.ommmmo..',
    'ommmmmo..',
    'ommmmo...',
    'ommmo....',
    '.ooo.....'];
  const FOOD_HALF = FOOD.map((r) => r.split('').map((c, x) => (x > 3 && c === 'm') ? 'e' : c).join(''));
  S.foodBg = make(FOOD.map((r) => r.replace(/[mb]/g, 'e')), { o: '#000000', e: '#3a2810' });
  S.food = make(FOOD, { o: '#000000', m: '#b0642a', b: '#f0e8d8' });
  S.foodHalf = make(FOOD_HALF, { o: '#000000', m: '#b0642a', b: '#f0e8d8', e: '#3a2810' });
  S.foodHunger = make(FOOD, { o: '#000000', m: '#6a8a2a', b: '#d0d8b0' });
  S.foodHungerHalf = make(FOOD_HALF, { o: '#000000', m: '#6a8a2a', b: '#d0d8b0', e: '#3a2810' });
  const ARM = [
    '.oo...oo.',
    'occoooccо',
    'occcccccо',
    '.occcccо.',
    '.occcccо.',
    '.occcccо.',
    '.occcccо.',
    '.ooooooo.',
    '.........'].map((r) => r.replace(/о/g, 'o'));
  S.armorBg = make(ARM.map((r) => r.replace(/c/g, 'e')), { o: '#000000', e: '#2a2a2a' });
  S.armor = make(ARM, { o: '#000000', c: '#d8d8d8' });
  S.armorHalf = make(ARM.map((r) => r.split('').map((c, x) => (x > 4 && c === 'c') ? 'e' : c).join('')), { o: '#000000', c: '#d8d8d8', e: '#2a2a2a' });
  const BUB = [
    '..ooooo..',
    '.owwbbbo.',
    'owwbbbbbo',
    'owbbbbbbo',
    'obbbbbbbo',
    'obbbbbbbo',
    '.obbbbbo.',
    '..ooooo..',
    '.........'];
  S.bubble = make(BUB, { o: '#2a4a9a', w: '#ffffff', b: '#7ab0ff' });
  S.bubblePop = make(BUB.map((r) => r.replace(/[wb]/g, '.')), { o: '#7ab0ff' });
  return S;
})();

class Hud {
  constructor(game) {
    this.game = game;
    this.chat = [];
    this.toasts = [];
    this.itemName = null; this.itemNameTimer = 0;
    this.actionBar = null; this.actionTimer = 0;
    this.title = null; this.subtitle = null; this.titleTimer = 0;
    this.lastHealth = 20; this.healthFlash = 0; this.displayHealth = 20;
    this.rng = new Noise.Random(4);
    this.fps = 0;
  }
  message(text, color) {
    this.chat.push({ text: String(text), color: color || '#ffffff', time: performance.now() });
    if (this.chat.length > 100) this.chat.shift();
  }
  toast(title, text, icon, color) { this.toasts.push({ title, text, icon, color: color || '#ffff00', time: performance.now() }); }
  showTitle(t, sub) { this.title = t; this.subtitle = sub || ''; this.titleTimer = 100; }
  showAction(text) { this.actionBar = text; this.actionTimer = 60; }
  tick() {
    if (this.itemNameTimer > 0) this.itemNameTimer--;
    if (this.actionTimer > 0) this.actionTimer--;
    if (this.titleTimer > 0) this.titleTimer--;
    const p = this.game.player;
    if (p) {
      if (p.health < this.lastHealth && p.hurtResist > 0) this.healthFlash = 20;
      else if (p.health > this.lastHealth) this.healthFlash = 10;
      if (this.healthFlash > 0) this.healthFlash--;
      this.lastHealth = p.health;
    }
  }
  setItemName(stack) { if (stack) { this.itemName = stack.name; this.itemNameTimer = 50; this.itemNameColor = (isRare(stack.id) || Enchant.has(stack)) ? '#55ffff' : '#ffffff'; } else this.itemNameTimer = 0; }

  draw(gui, partial) {
    const g = this.game, p = g.player;
    if (!p) return;
    const W = gui.w, H = gui.h, ctx = gui.ctx;
    const touch = g.touch && g.touch.active;
    if (g.settings.graphics === 'fancy' && !g.hideHud) this.vignette(gui);
    if (p.sleeping || g.sleepFade > 0) { ctx.fillStyle = 'rgba(16,16,32,' + clamp(g.sleepFade / 100, 0, 1) + ')'; ctx.fillRect(0, 0, W, H); }
    if (p.headInWater && g.settings.graphics === 'fancy') { ctx.fillStyle = 'rgba(20,40,120,0.12)'; ctx.fillRect(0, 0, W, H); }
    if (p.fire > 0 && !p.inLava && g.thirdPerson === 0) this.fireOverlay(gui);
    if (g.hideHud) return;
    const cx = Math.floor(W / 2);
    const hotY = H - 22 - (touch ? 0 : 0);
    // hotbar
    this.hotbar(gui, cx - 91, hotY);
    if (p.survivalLike) {
      this.stats(gui, cx, H);
      this.xpBar(gui, cx, H);
    }
    // held item name
    if (this.itemNameTimer > 0 && this.itemName) {
      const a = Math.min(1, this.itemNameTimer * 256 / 10 / 255);
      ctx.globalAlpha = a;
      gui.textCentered(this.itemName, cx, H - (p.survivalLike ? 59 : 35), this.itemNameColor);
      ctx.globalAlpha = 1;
    }
    if (this.actionTimer > 0 && this.actionBar) {
      ctx.globalAlpha = Math.min(1, this.actionTimer / 10);
      gui.textCentered(this.actionBar, cx, H - (p.survivalLike ? 72 : 48), '#ffffff');
      ctx.globalAlpha = 1;
    }
    if (this.titleTimer > 0 && this.title) {
      const t = this.titleTimer;
      const a = t > 80 ? (100 - t) / 20 : t < 20 ? t / 20 : 1;
      ctx.globalAlpha = clamp(a, 0, 1);
      const tw = gui.textWidth(this.title) * 3;
      gui.textScaled(this.title, Math.floor(cx - tw / 2), Math.floor(H / 2 - 40), '#ffffff', 3);
      if (this.subtitle) { const sw = gui.textWidth(this.subtitle) * 1.5; gui.textScaled(this.subtitle, Math.floor(cx - sw / 2), Math.floor(H / 2 - 8), '#e0e0e0', 1.5); }
      ctx.globalAlpha = 1;
    }
    this.drawChat(gui, false);
    this.drawToasts(gui);
    if (g.showDebug) this.debug(gui, partial);
    else if (g.settings.showFps) gui.text(this.fps + ' fps', 2, 2, '#e0e0e0');
  }
  vignette(gui) {
    const ctx = gui.ctx, W = gui.w, H = gui.h;
    const p = this.game.player;
    const l = this.game.world.getLightLevel(Math.floor(p.x), Math.floor(p.y + p.eye), Math.floor(p.z));
    const dark = 0.35 - l / 15 * 0.15;
    const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,' + dark + ')');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
  }
  fireOverlay(gui) {
    const ctx = gui.ctx, W = gui.w, H = gui.h;
    const t = TexGen.T.fire; if (!t) return;
    const cv = t.toCanvas(1);
    ctx.globalAlpha = 0.85;
    const s = Math.floor(H * 0.55);
    ctx.drawImage(cv, Math.floor(W * 0.08), H - s + Math.floor(s * 0.15), s, s);
    ctx.save(); ctx.translate(W - Math.floor(W * 0.08), 0); ctx.scale(-1, 1); ctx.drawImage(cv, 0, H - s + Math.floor(s * 0.15), s, s); ctx.restore();
    ctx.globalAlpha = 1;
  }
  hotbar(gui, x, y) {
    const ctx = gui.ctx, p = this.game.player;
    // frame
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x, y, 182, 22);
    for (let i = 0; i < 9; i++) {
      const sx = x + 1 + i * 20;
      ctx.fillStyle = 'rgba(80,80,80,0.55)'; ctx.fillRect(sx, y + 1, 20, 20);
      ctx.fillStyle = 'rgba(150,150,150,0.75)'; ctx.fillRect(sx, y + 1, 20, 1); ctx.fillRect(sx, y + 1, 1, 20);
      ctx.fillStyle = 'rgba(40,40,40,0.8)'; ctx.fillRect(sx, y + 20, 20, 1); ctx.fillRect(sx + 19, y + 1, 1, 20);
    }
    // selection
    const s = p.inventory.selected;
    const sx = x - 1 + s * 20, sy = y - 1;
    ctx.fillStyle = '#000000'; ctx.fillRect(sx, sy, 24, 1); ctx.fillRect(sx, sy + 23, 24, 1); ctx.fillRect(sx, sy, 1, 24); ctx.fillRect(sx + 23, sy, 1, 24);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(sx + 1, sy + 1, 22, 2); ctx.fillRect(sx + 1, sy + 21, 22, 2); ctx.fillRect(sx + 1, sy + 1, 2, 22); ctx.fillRect(sx + 21, sy + 1, 2, 22);
    ctx.fillStyle = '#a0a0a0'; ctx.fillRect(sx + 3, sy + 3, 18, 1); ctx.fillRect(sx + 3, sy + 20, 18, 1); ctx.fillRect(sx + 3, sy + 3, 1, 18); ctx.fillRect(sx + 20, sy + 3, 1, 18);
    for (let i = 0; i < 9; i++) {
      const st = p.inventory.main.items[i];
      if (st) gui.item(st, x + 3 + i * 20, y + 3);
    }
    // offhand slot
    const off = p.inventory.offhandItem();
    if (off) {
      const ox = x - 29;
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(ox, y, 22, 22);
      ctx.fillStyle = 'rgba(80,80,80,0.55)'; ctx.fillRect(ox + 1, y + 1, 20, 20);
      gui.item(off, ox + 3, y + 3);
    }
  }
  stats(gui, cx, H) {
    const ctx = gui.ctx, p = this.game.player, S = HudSprites;
    const t = this.game.ticks;
    const left = cx - 91, top = H - 39;
    const hp = Math.ceil(p.health);
    const flash = this.healthFlash > 0 && (Math.floor(this.healthFlash / 3) % 2 === 1);
    const regen = p.effects.regen ? t % 25 : -1;
    const poison = !!p.effects.poison;
    const hardcore = this.game.world.info.gameMode === 'hardcore';
    const rng = new Noise.Random(t * 312871);
    // hearts
    for (let i = 9; i >= 0; i--) {
      let x = left + i * 8, y = top;
      if (hp <= 4) y += rng.nextInt(2);
      if (i === regen) y -= 2;
      ctx.drawImage(flash ? S.heartBgFlash : S.heartBg, x, y);
      const v = i * 2 + 1;
      if (v < hp) ctx.drawImage(poison ? S.heartPoison : hardcore ? S.heartHardcore : S.heart, x, y);
      else if (v === hp) ctx.drawImage(poison ? S.heartPoisonHalf : S.heartHalf, x, y);
    }
    // armour
    const arm = p.armorValue();
    if (arm > 0) for (let i = 0; i < 10; i++) {
      const x = left + i * 8, y = top - 10;
      const v = i * 2 + 1;
      if (v < arm) ctx.drawImage(S.armor, x, y);
      else if (v === arm) ctx.drawImage(S.armorHalf, x, y);
      else ctx.drawImage(S.armorBg, x, y);
    }
    // food
    const hunger = !!p.effects.hunger;
    const right = cx + 91;
    for (let i = 0; i < 10; i++) {
      let x = right - i * 8 - 9, y = top;
      if (p.saturation <= 0 && t % (p.food * 3 + 1) === 0) y += rng.nextInt(3) - 1;
      ctx.drawImage(S.foodBg, x, y);
      const v = i * 2 + 1;
      if (v < p.food) ctx.drawImage(hunger ? S.foodHunger : S.food, x, y);
      else if (v === p.food) ctx.drawImage(hunger ? S.foodHungerHalf : S.foodHalf, x, y);
    }
    // air
    if (p.headInWater || p.air < 300) {
      const full = Math.ceil((p.air - 2) * 10 / 300), part = Math.ceil(p.air * 10 / 300) - full;
      for (let i = 0; i < full + part; i++) ctx.drawImage(i < full ? S.bubble : S.bubblePop, right - i * 8 - 9, top - 10);
    }
  }
  xpBar(gui, cx, H) {
    const ctx = gui.ctx, p = this.game.player;
    const x = cx - 91, y = H - 29;
    ctx.fillStyle = '#000000'; ctx.fillRect(x, y, 182, 5);
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x + 1, y + 1, 180, 3);
    const w = Math.floor(p.xp * 183);
    if (w > 0) { ctx.fillStyle = '#80ff20'; ctx.fillRect(x + 1, y + 1, Math.min(180, w - 1), 3); ctx.fillStyle = '#c8ff80'; ctx.fillRect(x + 1, y + 1, Math.min(180, w - 1), 1); }
    for (let i = 1; i < 18; i++) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x + i * 10 + Math.floor(i / 2), y + 1, 1, 3); }
    if (p.xpLevel > 0) {
      const s = String(p.xpLevel);
      const tw = gui.textWidth(s);
      const tx = Math.floor(cx - tw / 2), ty = H - 35;
      gui.font.draw(ctx, s, tx + 1, ty, '#000000', false); gui.font.draw(ctx, s, tx - 1, ty, '#000000', false);
      gui.font.draw(ctx, s, tx, ty + 1, '#000000', false); gui.font.draw(ctx, s, tx, ty - 1, '#000000', false);
      gui.font.draw(ctx, s, tx, ty, '#80ff20', false);
    }
  }
  drawChat(gui, open) {
    const ctx = gui.ctx, H = gui.h;
    const now = performance.now();
    const maxLines = open ? 20 : 10;
    let y = H - 48;
    const lines = [];
    for (let i = this.chat.length - 1; i >= 0 && lines.length < maxLines; i--) {
      const m = this.chat[i];
      const age = (now - m.time) / 1000;
      if (!open && age > 10) break;
      const wrapped = gui.font.wrap(m.text, 316);
      for (let j = wrapped.length - 1; j >= 0 && lines.length < maxLines; j--) lines.push({ t: wrapped[j], c: m.color, a: open ? 1 : clamp((10 - age) / 1, 0, 1) });
    }
    const touch = this.game.touch && this.game.touch.active && !open;
    if (touch) y = 4 + (lines.length - 1) * 9;     // keep clear of the touch buttons
    const cw = Math.min(320, gui.w - (touch ? 60 : 4));
    for (const l of lines) {
      ctx.globalAlpha = l.a * 0.5; ctx.fillStyle = '#000000'; ctx.fillRect(2, y - 1, cw, 9);
      ctx.globalAlpha = l.a; gui.text(l.t, 3, y, l.c);
      y -= 9;
    }
    ctx.globalAlpha = 1;
  }
  drawToasts(gui) {
    const ctx = gui.ctx, W = gui.w;
    const now = performance.now();
    this.toasts = this.toasts.filter((t) => now - t.time < 5000);
    let y = this.game.touch && this.game.touch.active && !this.game.screen ? 28 : 0;
    for (const t of this.toasts.slice(0, 3)) {
      const age = (now - t.time) / 1000;
      let off = 0;
      if (age < 0.5) off = (1 - age / 0.5); else if (age > 4.5) off = (age - 4.5) / 0.5;
      const w = 160, h = 32, x = W - w, yy = y - Math.round(off * 32);
      ctx.fillStyle = '#000000'; ctx.fillRect(x, yy, w, h);
      ctx.fillStyle = '#555555'; ctx.fillRect(x + 1, yy + 1, w - 2, 1); ctx.fillRect(x + 1, yy + 1, 1, h - 2);
      ctx.fillStyle = '#c6c6c6'; ctx.fillRect(x + 2, yy + 2, w - 4, h - 4);
      ctx.fillStyle = '#212121'; ctx.fillRect(x + 3, yy + 3, w - 6, h - 6);
      if (t.icon) gui.item(t.icon, x + 8, yy + 8);
      gui.text(t.title, x + 30, yy + 7, t.color);
      gui.text(gui.font.wrap(t.text, w - 36)[0], x + 30, yy + 18, '#ffffff');
      y += h;
    }
  }
  debug(gui, partial) {
    const g = this.game, p = g.player, w = g.world, r = g.renderer;
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    const facing = ['north (Towards negative Z)', 'south (Towards positive Z)', 'west (Towards negative X)', 'east (Towards positive X)'][Behaviors.playerFacing(p)];
    const b = BIOMES[w.biomeAt(bx, bz)];
    const l = w.getLightRaw(bx, Math.floor(p.y + 0.5), bz);
    const left = [
      'Blocklands ' + GAME_VERSION + ' (' + this.fps + ' fps, ' + r.stats.meshed + ' chunk updates)',
      'C: ' + r.stats.drawn + '/' + r.stats.chunks + ' chunks, ' + Math.round(r.stats.quads / 1000) + 'k quads',
      'E: ' + w.entities.length + ', P: ' + g.particles.list.length,
      '',
      'XYZ: ' + p.x.toFixed(3) + ' / ' + p.y.toFixed(5) + ' / ' + p.z.toFixed(3),
      'Block: ' + bx + ' ' + by + ' ' + bz,
      'Chunk: ' + (bx & 15) + ' ' + (by & 15) + ' ' + (bz & 15) + ' in ' + (bx >> 4) + ' ' + (by >> 4) + ' ' + (bz >> 4),
      'Facing: ' + facing + ' (' + wrapDegrees(-p.yaw * 180 / Math.PI + 180).toFixed(1) + ' / ' + (-p.pitch * 180 / Math.PI).toFixed(1) + ')',
      'Light: ' + Math.max(l >> 4, l & 15) + ' (' + (l >> 4) + ' sky, ' + (l & 15) + ' block)',
      'Biome: ' + (b ? b.name : '?'),
      'Day ' + Math.floor(w.dayTime / 24000) + ', time ' + (w.dayTime % 24000) + (w.raining ? (w.thundering ? ', thunder' : ', rain') : ''),
      'Seed: ' + w.seed,
    ];
    if (g.interaction.hit) { const h = g.interaction.hit; left.push('', 'Looking at: ' + h.x + ' ' + h.y + ' ' + h.z + ' ' + (BLOCKS[h.id] ? BLOCKS[h.id].key : h.id) + ':' + h.meta); }
    const ctx = gui.ctx;
    let y = 2;
    for (const s of left) { if (s) { ctx.fillStyle = 'rgba(80,80,80,0.56)'; ctx.fillRect(1, y - 1, gui.textWidth(s) + 2, 9); gui.text(s, 2, y, '#e0e0e0', false); } y += 9; }
    const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + 'MB' : '';
    const right = ['JS: ' + (navigator.userAgent.match(/(Chrome|Firefox|Safari)\/[\d.]+/) || ['Browser'])[0], mem ? 'Mem: ' + mem : '', 'Display: ' + r.width + 'x' + r.height, 'GUI scale: ' + gui.scale, 'Render distance: ' + g.settings.renderDistance];
    y = 2;
    for (const s of right) { if (s) { const tw = gui.textWidth(s); ctx.fillStyle = 'rgba(80,80,80,0.56)'; ctx.fillRect(gui.w - tw - 3, y - 1, tw + 2, 9); gui.text(s, gui.w - tw - 2, y, '#e0e0e0', false); } y += 9; }
    void partial;
  }
}
