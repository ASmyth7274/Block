'use strict';
// ---------------------------------------------------------------------------
// Touch controls (pocket-edition style): D-pad, jump/fly, sneak toggle,
// drag to look, tap to use/place, hold to break. Menus get mouse emulation.
// ---------------------------------------------------------------------------
class TouchControls {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.forward = 0; this.strafe = 0;
    this.jump = false; this.sneak = false; this.flyDown = false; this.sprint = false;
    this.useHeld = false;
    this.buttons = new Map();        // touch id -> control id
    this.pressed = new Set();
    this.look = null;                // the look/action touch
    this.menu = null;                // touch driving the GUI cursor
    this.layout = null;
    const cv = game.guiCanvas;
    const opt = { passive: false };
    cv.addEventListener('touchstart', (e) => this.onStart(e), opt);
    cv.addEventListener('touchmove', (e) => this.onMove(e), opt);
    cv.addEventListener('touchend', (e) => this.onEnd(e), opt);
    cv.addEventListener('touchcancel', (e) => this.onEnd(e), opt);
    this.update();
  }
  update() {
    this.active = !!this.game.settings.touchControls;
    if (!this.active) this.reset();
  }
  reset() {
    this.buttons.clear(); this.pressed.clear();
    if (this.look) this.endLook(false);
    this.look = null;
    this.forward = 0; this.strafe = 0; this.jump = false; this.flyDown = false; this.useHeld = false;
  }
  // ------------------------------------------------------------ geometry (GUI pixels)
  computeLayout() {
    const gui = this.game.gui, W = gui.w, H = gui.h;
    const s = 26, g = 2;
    const L = {};
    const bx = 10, by = H - 10 - s * 3 - g * 2;
    const at = (c, r) => [bx + c * (s + g), by + r * (s + g), s, s];
    L.up = at(1, 0); L.left = at(0, 1); L.right = at(2, 1); L.down = at(1, 2); L.sneak = at(1, 1);
    L.upleft = at(0, 0); L.upright = at(2, 0);
    const js = 32;
    L.jump = [W - 12 - js, H - 12 - js - 26, js, js];
    L.flyup = [W - 12 - js, H - 12 - js * 2 - 30, js, js];
    L.flydown = [W - 12 - js, H - 12 - js - 26, js, js];
    L.pause = [W - 24, 4, 20, 20];
    L.chat = [W - 48, 4, 20, 20];
    const hx = Math.floor(W / 2) - 91, hy = H - 22;
    for (let i = 0; i < 9; i++) L['slot' + i] = [hx + 1 + i * 20, hy, 20, 22];
    L.inv = [hx + 184, hy, 22, 22];
    this.layout = L;
    return L;
  }
  hitControl(x, y) {
    const L = this.computeLayout();
    const p = this.game.player;
    const flying = p && p.flying;
    const order = ['pause', 'chat', 'inv'];
    for (let i = 0; i < 9; i++) order.push('slot' + i);
    order.push(...(flying ? ['flyup', 'flydown'] : ['jump']));
    order.push('up', 'down', 'left', 'right', 'sneak');
    if (this.pressed.has('up') || this.pressed.has('upleft') || this.pressed.has('upright')) order.push('upleft', 'upright');
    for (const id of order) {
      const r = L[id];
      if (r && x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3]) return id;
    }
    // generous D-pad area: snap to nearest arrow
    const c = L.sneak;
    const dx = x - (c[0] + c[2] / 2), dy = y - (c[1] + c[3] / 2);
    if (Math.abs(dx) < 46 && Math.abs(dy) < 46 && (Math.abs(dx) > 13 || Math.abs(dy) > 13)) {
      if (dy < -13 && Math.abs(dx) > 13) return dx < 0 ? 'upleft' : 'upright';
      if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
      return dy < 0 ? 'up' : 'down';
    }
    return null;
  }
  guiPos(t) {
    const cv = this.game.guiCanvas, r = cv.getBoundingClientRect(), s = this.game.gui.scale;
    return [Math.floor((t.clientX - r.left) * (cv.width / r.width) / s), Math.floor((t.clientY - r.top) * (cv.height / r.height) / s)];
  }

  // ------------------------------------------------------------ events
  onStart(e) {
    e.preventDefault();
    const g = this.game;
    g.audio.unlock();
    if (!this.active && !g.screen && g.player) { g.settings.touchControls = true; g.saveSettings(); this.update(); g.hud.toast('Touch controls', 'Enabled. Turn off in Options.', null, '#ffff55'); }
    for (const t of e.changedTouches) {
      const [x, y] = this.guiPos(t);
      if (g.screen) { this.menuStart(t, x, y); continue; }
      if (!g.player || g.player.dead) continue;
      const id = this.hitControl(x, y);
      if (id) { this.buttons.set(t.identifier, id); this.press(id, true, t); continue; }
      if (!this.look) this.look = { id: t.identifier, sx: t.clientX, sy: t.clientY, lx: t.clientX, ly: t.clientY, t0: performance.now(), moved: false, mode: null };
    }
    this.syncMovement();
  }
  onMove(e) {
    e.preventDefault();
    const g = this.game;
    for (const t of e.changedTouches) {
      if (this.menu && t.identifier === this.menu.id) { this.menuMove(t); continue; }
      const b = this.buttons.get(t.identifier);
      if (b) {
        // slide across the D-pad
        if (['up', 'down', 'left', 'right', 'upleft', 'upright'].includes(b)) {
          const [x, y] = this.guiPos(t);
          const nb = this.hitControl(x, y);
          if (nb && nb !== b && ['up', 'down', 'left', 'right', 'upleft', 'upright'].includes(nb)) { this.press(b, false); this.press(nb, true); this.buttons.set(t.identifier, nb); }
        }
        continue;
      }
      const L = this.look;
      if (L && t.identifier === L.id) {
        const dx = t.clientX - L.lx, dy = t.clientY - L.ly;
        L.lx = t.clientX; L.ly = t.clientY;
        if (!L.moved && Math.hypot(t.clientX - L.sx, t.clientY - L.sy) > 10) { L.moved = true; if (!L.mode) L.mode = 'look'; }
        const p = g.player;
        if (p && (L.moved || L.mode === 'break')) {
          const k = (0.0022 + g.settings.touchSensitivity * 0.0055) * (g.settings.invertMouse ? -1 : 1);
          p.yaw -= dx * (0.0022 + g.settings.touchSensitivity * 0.0055);
          p.pitch = clamp(p.pitch - dy * k, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
          if (g.handSway) { g.handSway[0] += dx * 0.3; g.handSway[1] += dy * 0.3; }
        }
        if (L.mode === 'break' && !g.settings.splitTouchTarget) g.interaction.rayOverride = this.rayAt(t.clientX, t.clientY);
      }
    }
    this.syncMovement();
  }
  onEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.menu && t.identifier === this.menu.id) { this.menuEnd(t); continue; }
      const b = this.buttons.get(t.identifier);
      if (b) { this.buttons.delete(t.identifier); this.press(b, false, t); continue; }
      if (this.look && t.identifier === this.look.id) { this.endLook(true, t); this.look = null; }
    }
    this.syncMovement();
    const inp = this.game.input;
    if (inp.textTarget && inp.textEl && document.activeElement !== inp.textEl) { try { inp.textEl.focus({ preventScroll: true }); } catch (err) { /* ignore */ } }
  }
  press(id, down, t) {
    const g = this.game, p = g.player;
    if (down) this.pressed.add(id); else this.pressed.delete(id);
    if (id.startsWith('slot')) {
      const i = Number(id.slice(4));
      if (down) { g.selectSlot(i); this.slotHold = { i, t0: performance.now() }; }
      else this.slotHold = null;
      return;
    }
    if (!down) return;
    switch (id) {
      case 'pause': g.openPause(); this.reset(); break;
      case 'chat': g.openChat(''); this.reset(); break;
      case 'inv': g.openInventory(); this.reset(); break;
      case 'sneak': this.sneak = !this.sneak; break;
    }
    void p; void t;
  }
  syncMovement() {
    const P = this.pressed;
    let f = 0, s = 0;
    if (P.has('up') || P.has('upleft') || P.has('upright')) f += 1;
    if (P.has('down')) f -= 1;
    if (P.has('left') || P.has('upleft')) s -= 1;
    if (P.has('right') || P.has('upright')) s += 1;
    this.forward = f; this.strafe = s;
    this.jump = P.has('jump') || P.has('flyup');
    this.flyDown = P.has('flydown');
    if (f > 0 && this.sneak && P.size && this.game.player && this.game.player.flying) this.sneak = false;
  }
  // camera ray through a screen point
  rayAt(cx, cy) {
    const g = this.game, r = g.renderer;
    const rect = g.guiCanvas.getBoundingClientRect();
    const nx = ((cx - rect.left) / rect.width) * 2 - 1, ny = 1 - ((cy - rect.top) / rect.height) * 2;
    const m = r.invVP;
    const x = m[0] * nx + m[4] * ny + m[8] + m[12], y = m[1] * nx + m[5] * ny + m[9] + m[13], z = m[2] * nx + m[6] * ny + m[10] + m[14], w = m[3] * nx + m[7] * ny + m[11] + m[15];
    let dx = x / w, dy = y / w, dz = z / w;
    const l = Math.hypot(dx, dy, dz) || 1;
    return [dx / l, dy / l, dz / l];
  }
  heldIsUsable() {
    const p = this.game.player; if (!p) return false;
    const h = p.inventory.held(); if (!h) return false;
    const f = foodOf(h.id), def = ITEMS[h.id];
    if (f) return f.always || p.food < 20 || p.creative;
    if (def && def.drink) return true;
    if (h.id === ITEM_IDS.bow) return true;
    return false;
  }
  // per frame: long-press detection
  frame() {
    const g = this.game;
    if (this.slotHold && performance.now() - this.slotHold.t0 > 600) { g.dropHeld(false); this.slotHold.t0 = performance.now() + 400; }
    const L = this.look;
    if (!L || L.mode || L.moved) return;
    if (performance.now() - L.t0 < 260) return;
    if (!g.settings.splitTouchTarget) g.interaction.rayOverride = this.rayAt(L.lx, L.ly);
    g.updateTargetNow();
    if (this.heldIsUsable() && !g.interaction.entity) { L.mode = 'use'; this.useHeld = true; g.interaction.press(2); }
    else { L.mode = 'break'; g.interaction.press(0); }
  }
  endLook(fire, t) {
    const g = this.game, L = this.look;
    if (!L) return;
    if (L.mode === 'break') g.interaction.release(0);
    else if (L.mode === 'use') { this.useHeld = false; g.interaction.release(2); }
    else if (fire && !L.moved && performance.now() - L.t0 < 300) {
      // tap: attack a creature, otherwise use / place
      if (!g.settings.splitTouchTarget && t) g.interaction.rayOverride = this.rayAt(t.clientX, t.clientY);
      g.updateTargetNow();
      const it = g.interaction, p = g.player;
      const ent = it.entity;
      if (ent && !(ent.interact && ent.interact(p, p.inventory.held()))) { it.press(0); it.release(0); }
      else if (ent) p.swing();
      else { it.press(2); it.release(2); }
    }
    g.interaction.rayOverride = null;
  }

  // ------------------------------------------------------------ menus
  menuStart(t, x, y) {
    const g = this.game, scr = g.screen;
    if (this.menu) return;
    g.input.mx = x; g.input.my = y;
    if (scr.mouseMove) scr.mouseMove(x, y);
    const container = scr instanceof ContainerScreen;
    this.menu = { id: t.identifier, x, y, sx: x, sy: y, t0: performance.now(), container, sent: false, scroll: false, acc: 0, timer: null };
    if (container) {
      this.menu.timer = setTimeout(() => {
        const m = this.menu;
        if (!m || m.sent || m.scroll || g.screen !== scr) return;
        m.sent = 2; scr.mouseDown(m.x, m.y, 2); scr.mouseUp(m.x, m.y, 2);
      }, 380);
    } else { this.menu.sent = 1; scr.mouseDown(x, y, 0); }
  }
  menuMove(t) {
    const g = this.game, scr = g.screen, m = this.menu;
    if (!scr) return;
    const [x, y] = this.guiPos(t);
    const dy = y - m.y;
    m.x = x; m.y = y;
    g.input.mx = x; g.input.my = y;
    const far = Math.abs(y - m.sy) > 8 || Math.abs(x - m.sx) > 8;
    if (far && !m.scroll && scr.wheel && Math.abs(y - m.sy) > Math.abs(x - m.sx) * 1.2 && (m.container ? !m.sent : !(scr.widgets || []).some((w) => w.dragging))) {
      if (!m.container || !this.overSlot(scr, m.sx, m.sy) || scr instanceof CreativeScreen) m.scroll = true;
    }
    if (m.scroll) {
      m.acc += dy;
      while (Math.abs(m.acc) >= 14) { scr.wheel(m.acc > 0 ? -1 : 1); m.acc -= Math.sign(m.acc) * 14; }
      return;
    }
    if (m.container && !m.sent && far) { m.sent = 1; scr.mouseDown(m.sx, m.sy, 0); }
    if (scr.mouseMove) scr.mouseMove(x, y);
  }
  overSlot(scr, x, y) { return scr.slotAt ? !!scr.slotAt(x, y) : true; }
  menuEnd(t) {
    const g = this.game, scr = g.screen, m = this.menu;
    this.menu = null;
    if (m.timer) clearTimeout(m.timer);
    if (!scr) return;
    const [x, y] = this.guiPos(t);
    if (m.scroll) { scr.mouseUp(-1000, -1000, 0); return; }
    if (m.container && !m.sent) { scr.mouseDown(m.sx, m.sy, 0); scr.mouseUp(x, y, 0); }
    else if (m.sent === 1) scr.mouseUp(x, y, 0);
    // forget the hover position so buttons don't stay highlighted
    setTimeout(() => { if (!this.menu) { g.input.mx = -1000; g.input.my = -1000; } }, 50);
  }

  // ------------------------------------------------------------ drawing
  draw(gui) {
    const g = this.game, p = g.player;
    if (!this.active || g.screen || !p || p.dead || g.hideHud) return;
    const L = this.computeLayout();
    const ctx = gui.ctx;
    const btn = (id, glyph) => {
      const r = L[id]; if (!r) return;
      const on = this.pressed.has(id) || (id === 'sneak' && this.sneak);
      ctx.fillStyle = on ? 'rgba(255,255,255,0.32)' : 'rgba(30,30,30,0.32)';
      ctx.fillRect(r[0], r[1], r[2], r[3]);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(r[0], r[1], r[2], 1); ctx.fillRect(r[0], r[1] + r[3] - 1, r[2], 1); ctx.fillRect(r[0], r[1], 1, r[3]); ctx.fillRect(r[0] + r[2] - 1, r[1], 1, r[3]);
      ctx.fillStyle = on ? 'rgba(255,255,160,0.95)' : 'rgba(255,255,255,0.8)';
      glyph(r[0] + r[2] / 2, r[1] + r[3] / 2);
    };
    const tri = (dir) => (cx, cy) => {
      for (let i = 0; i < 6; i++) {
        const w = i * 2 + 1;
        if (dir === 'up') ctx.fillRect(Math.floor(cx - w / 2), Math.floor(cy - 3 + i), w, 1);
        else if (dir === 'down') ctx.fillRect(Math.floor(cx - w / 2), Math.floor(cy + 2 - i), w, 1);
        else if (dir === 'left') ctx.fillRect(Math.floor(cx - 3 + i), Math.floor(cy - w / 2), 1, w);
        else ctx.fillRect(Math.floor(cx + 2 - i), Math.floor(cy - w / 2), 1, w);
      }
    };
    const diag = (left) => (cx, cy) => { for (let i = 0; i < 6; i++) ctx.fillRect(Math.floor(cx + (left ? -3 + i : 2 - i)), Math.floor(cy - 3 + i), 6 - i, 1); };
    btn('up', tri('up')); btn('down', tri('down')); btn('left', tri('left')); btn('right', tri('right'));
    if (this.pressed.has('up') || this.pressed.has('upleft') || this.pressed.has('upright')) { btn('upleft', diag(true)); btn('upright', diag(false)); }
    btn('sneak', (cx, cy) => { ctx.fillRect(cx - 4, cy - 1, 8, 3); if (this.sneak) ctx.fillRect(cx - 2, cy - 4, 4, 3); });
    if (p.flying) { btn('flyup', tri('up')); btn('flydown', tri('down')); }
    else btn('jump', (cx, cy) => { ctx.fillRect(cx - 5, cy + 3, 10, 2); tri('up')(cx, cy - 1); });
    btn('pause', (cx, cy) => { ctx.fillRect(cx - 4, cy - 4, 3, 9); ctx.fillRect(cx + 1, cy - 4, 3, 9); });
    btn('chat', (cx, cy) => { ctx.fillRect(cx - 5, cy - 4, 10, 6); ctx.fillRect(cx - 3, cy + 2, 2, 2); });
    // inventory "..." button next to the hotbar
    const r = L.inv;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(r[0], r[1], r[2], r[3]);
    ctx.fillStyle = this.pressed.has('inv') ? '#ffffa0' : '#ffffff';
    for (let i = 0; i < 3; i++) ctx.fillRect(r[0] + 5 + i * 5, r[1] + 10, 2, 2);
  }
}
