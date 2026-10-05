'use strict';
// ---------------------------------------------------------------------------
// Container screens (inventory, crafting, furnace, chest, creative)
// ---------------------------------------------------------------------------
class ContainerScreen extends Screen {
  constructor(game, pw, ph) {
    super(game);
    this.background = 'world';
    this.pw = pw || 176; this.ph = ph || 166;
    this.slots = [];
    this.hover = null;
    this.drag = null;
    this.lastClickTime = 0; this.lastClickSlot = null;
    this.pauses = false;
  }
  get player() { return this.game.player; }
  get cursor() { return this.game.cursorStack; }
  set cursor(s) { this.game.cursorStack = s && s.count > 0 ? s : null; }
  init() { this.left = Math.floor((this.W - this.pw) / 2); this.top = Math.floor((this.H - this.ph) / 2); }
  addPlayerSlots(y0) {
    const inv = this.player.inventory.main;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) this.slots.push(new Slot(inv, 9 + r * 9 + c, 8 + c * 18, y0 + r * 18, { group: 'main' }));
    for (let c = 0; c < 9; c++) this.slots.push(new Slot(inv, c, 8 + c * 18, y0 + 58, { group: 'hotbar' }));
  }
  slotAt(mx, my) {
    const x = mx - this.left, y = my - this.top;
    for (const s of this.slots) if (x >= s.x - 1 && y >= s.y - 1 && x < s.x + 17 && y < s.y + 17) return s;
    return null;
  }
  drawPanel(gui) { gui.panel(this.left, this.top, this.pw, this.ph); }
  drawSlots(gui) {
    for (const s of this.slots) {
      if (s.big) { gui.slot(this.left + s.x - 5, this.top + s.y - 5, 26, 26); }
      else gui.slot(this.left + s.x - 1, this.top + s.y - 1);
      if (!s.stack && s.icon) { gui.ctx.globalAlpha = 0.35; gui.sprite(s.icon, this.left + s.x, this.top + s.y); gui.ctx.globalAlpha = 1; }
    }
  }
  drawItems(gui, mx, my) {
    const ctx = gui.ctx;
    for (const s of this.slots) {
      const st = s.stack;
      let shown = st;
      if (this.drag && this.drag.slots.length > 1 && this.drag.slots.includes(s) && this.cursor) {
        const n = this.dragAmount(s);
        shown = st ? Object.assign(st.copy(), { count: st.count + n }) : Object.assign(this.cursor.copy(), { count: n });
      }
      if (shown) gui.item(shown, this.left + s.x, this.top + s.y);
    }
    const h = this.slotAt(mx, my);
    this.hover = h;
    if (h) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(this.left + h.x, this.top + h.y, 16, 16); }
  }
  drawCursor(gui, mx, my) {
    if (this.cursor) {
      let c = this.cursor;
      if (this.drag && this.drag.slots.length > 1) { const used = this.drag.slots.reduce((a, s) => a + this.dragAmount(s), 0); c = Object.assign(c.copy(), { count: c.count - used }); }
      if (c.count > 0) gui.item(c, mx - 8, my - 8);
    } else if (this.hover && this.hover.stack) gui.tooltip(this.tooltipFor(this.hover.stack), mx, my);
  }
  tooltipFor(st) {
    const lines = [(Enchant.has(st) ? '§b' : isRare(st.id) ? '§b' : '') + st.name];
    for (const [eid, lv] of Enchant.list(st)) lines.push('§7' + Enchant.name(eid, lv));
    const t = toolOf(st.id), a = armorOf(st.id), f = foodOf(st.id);
    if (t && t.kind !== 'shears') lines.push('§9+' + t.attack + ' Attack Damage');
    if (a) lines.push('§9+' + a.points + ' Armor');
    if (f) lines.push('§7Restores ' + (f.hunger / 2) + ' hunger');
    if (ITEMS[st.id] && ITEMS[st.id].potion) {
      const pp = potionOf(st.dmg);
      if (!pp.effect) lines.push('§7No Effects');
      else lines.push((pp.bad ? '§c' : '§9') + pp.name + ((st.dmg & 64) ? ' II' : '') + (pp.instant ? '' : ' (' + fmtTicks(potionDuration(st.dmg) * (ITEMS[st.id].splash ? 0.75 : 1)) + ')'));
    }
    const md = maxDamageOf(st.id);
    if (md > 0 && st.dmg > 0) lines.push('§7Durability: ' + (md - st.dmg) + ' / ' + md);
    const lore = ITEM_LORE[st.id < 256 ? 'b' + st.id : st.id];
    if (lore) for (const l of lore) lines.push('§8' + l);
    if (this.game.showDebug) lines.push('§8#' + st.id + (st.dmg ? '/' + st.dmg : ''));
    return lines;
  }
  draw(gui, mx, my) {
    this.drawBackground(gui);
    this.drawPanel(gui);
    this.drawSlots(gui);
    this.drawForeground(gui, mx, my);
    this.drawItems(gui, mx, my);
    for (const w of this.widgets) w.draw(gui, mx, my);
    const cr = this.closeRect();
    if (cr) { gui.button(cr[0], cr[1], cr[2], cr[3], null, mx >= cr[0] && my >= cr[1] && mx < cr[0] + cr[2] && my < cr[1] + cr[3] ? 'hover' : 'normal'); gui.textCentered('x', cr[0] + cr[2] / 2 + 1, cr[1] + 5, '#ffffff'); }
    this.drawCursor(gui, mx, my);
  }
  // touch screens get a close button next to the panel
  closeRect() {
    if (!this.game.touch || !this.game.touch.active) return null;
    const x = Math.min(this.W - 20, this.left + this.pw + 4);
    return [x, Math.max(2, this.top), 18, 18];
  }
  drawForeground() {}
  label(gui, text, x, y) { gui.text(text, this.left + x, this.top + y, '#404040', false); }

  // ---------------------------------------------------------------- clicking
  mouseDown(mx, my, btn, e) {
    if (super.mouseDown(mx, my, btn)) return true;
    const cr = this.closeRect();
    if (cr && mx >= cr[0] && my >= cr[1] && mx < cr[0] + cr[2] && my < cr[1] + cr[3]) { this.game.audio.play('click', 0.6); this.game.closeScreen(); return true; }
    const s = this.slotAt(mx, my);
    const shift = e && e.shiftKey;
    if (!s) {
      const outside = mx < this.left || my < this.top || mx >= this.left + this.pw || my >= this.top + this.ph;
      if (outside && this.cursor && !this.isInsideExtra(mx, my)) {
        if (btn === 0) { this.game.dropStack(this.cursor); this.cursor = null; }
        else if (btn === 2) { const one = this.cursor.copy(); one.count = 1; this.game.dropStack(one); this.cursor.count--; if (this.cursor.count <= 0) this.cursor = null; }
      }
      return true;
    }
    if (btn === 1 && this.player.creative && s.stack) { const c = s.stack.copy(); c.count = maxStackOf(c.id); this.cursor = c; return true; }
    if (shift) { this.quickMove(s); return true; }
    const now = performance.now();
    if (btn === 0 && !shift && this.lastClickSlot === s && now - this.lastClickTime < 250 && this.cursor) { this.collectAll(); this.lastClickTime = 0; return true; }
    this.lastClickTime = now; this.lastClickSlot = s;
    if (this.cursor && !s.output && (btn === 0 || btn === 2)) { this.drag = { btn, slots: [s] }; return true; }
    this.click(s, btn);
    return true;
  }
  isInsideExtra() { return false; }
  mouseMove(mx, my) {
    super.mouseMove(mx, my);
    if (this.drag && this.cursor) {
      const s = this.slotAt(mx, my);
      if (s && !this.drag.slots.includes(s) && !s.output && s.accepts(this.cursor) && (!s.stack || s.stack.canStackWith(this.cursor))) {
        const max = this.drag.btn === 0 ? this.cursor.count : this.cursor.count;
        if (this.drag.slots.length < max) this.drag.slots.push(s);
      }
    }
  }
  mouseUp(mx, my, btn) {
    super.mouseUp(mx, my, btn);
    if (!this.drag) return;
    const d = this.drag; this.drag = null;
    if (d.slots.length === 1) { this.click(d.slots[0], d.btn); return; }
    for (const s of d.slots) {
      const n = this.dragAmountFor(s, d);
      if (n <= 0) continue;
      if (s.stack) s.stack.count += n; else { const c = this.cursor.copy(); c.count = n; s.stack = c; }
      s.inv.changed();
    }
    const used = d.slots.reduce((a, s) => a + this.dragAmountFor(s, d, true), 0);
    if (this.cursor) { this.cursor.count -= used; if (this.cursor.count <= 0) this.cursor = null; }
    this.onSlotsChanged();
  }
  dragAmount(s) { return this.drag ? this.dragAmountFor(s, this.drag) : 0; }
  dragAmountFor(s, d) {
    const c = this.cursor; if (!c) return 0;
    const per = d.btn === 0 ? Math.floor(c.count / d.slots.length) : 1;
    const room = s.limit(c) - (s.stack ? s.stack.count : 0);
    return Math.max(0, Math.min(per, room));
  }
  click(s, btn) {
    const cur = this.cursor, st = s.stack;
    if (s.output) { this.takeOutput(s, false); return; }
    if (btn === 0) {
      if (!cur) { if (st) { this.cursor = st; s.stack = null; } }
      else if (!st) { if (s.accepts(cur)) { const n = Math.min(cur.count, s.limit(cur)); const c = cur.copy(); c.count = n; s.stack = c; cur.count -= n; if (cur.count <= 0) this.cursor = null; } }
      else if (st.canStackWith(cur)) { const n = Math.min(cur.count, s.limit(st) - st.count); if (n > 0) { st.count += n; cur.count -= n; if (cur.count <= 0) this.cursor = null; s.inv.changed(); } }
      else if (s.accepts(cur) && cur.count <= s.limit(cur)) { s.stack = cur; this.cursor = st; }
    } else if (btn === 2) {
      if (!cur) { if (st) { const half = Math.ceil(st.count / 2); const c = st.copy(); c.count = half; this.cursor = c; st.count -= half; if (st.count <= 0) s.stack = null; else s.inv.changed(); } }
      else if (!st) { if (s.accepts(cur)) { const c = cur.copy(); c.count = 1; s.stack = c; cur.count--; if (cur.count <= 0) this.cursor = null; } }
      else if (st.canStackWith(cur)) { if (st.count < s.limit(st)) { st.count++; cur.count--; if (cur.count <= 0) this.cursor = null; s.inv.changed(); } }
      else if (s.accepts(cur) && cur.count <= s.limit(cur)) { s.stack = cur; this.cursor = st; }
    }
    this.onSlotsChanged();
  }
  collectAll() {
    const cur = this.cursor; if (!cur) return;
    const max = maxStackOf(cur.id);
    for (let pass = 0; pass < 2; pass++) for (const s of this.slots) {
      if (cur.count >= max) break;
      const st = s.stack;
      if (!st || s.output || !st.canStackWith(cur)) continue;
      if (pass === 0 && st.count >= maxStackOf(st.id)) continue;
      const n = Math.min(st.count, max - cur.count);
      cur.count += n; st.count -= n;
      if (st.count <= 0) s.stack = null; else s.inv.changed();
    }
    this.onSlotsChanged();
  }
  // move a stack into a list of slots (merging first)
  moveInto(stack, targets, reverse) {
    const list = reverse ? targets.slice().reverse() : targets;
    const max = maxStackOf(stack.id);
    if (max > 1) for (const t of list) {
      const s = t.stack;
      if (s && s.canStackWith(stack) && s.count < t.limit(s)) { const n = Math.min(stack.count, t.limit(s) - s.count); s.count += n; stack.count -= n; t.inv.changed(); if (stack.count <= 0) return true; }
    }
    for (const t of list) {
      if (!t.stack && t.accepts(stack)) { const n = Math.min(stack.count, t.limit(stack)); const c = stack.copy(); c.count = n; t.stack = c; stack.count -= n; if (stack.count <= 0) return true; }
    }
    return stack.count <= 0;
  }
  quickMove(s) {
    const st = s.stack; if (!st) return;
    if (s.output) { this.takeOutput(s, true); return; }
    const targets = this.quickTargets(s, st);
    if (!targets) return;
    this.moveInto(st, targets.slots, targets.reverse);
    if (st.count <= 0) s.stack = null; else s.inv.changed();
    this.onSlotsChanged();
  }
  quickTargets(s, st) {
    const main = this.slots.filter((x) => x.group === 'main'), hot = this.slots.filter((x) => x.group === 'hotbar');
    if (s.group === 'main') return { slots: hot };
    if (s.group === 'hotbar') return { slots: main };
    return { slots: hot.concat(main), reverse: true };
  }
  takeOutput() {}
  onSlotsChanged() {}
  onClose() {
    // return the cursor stack to the player
    if (this.cursor) { this.game.giveItem(this.cursor); this.cursor = null; }
  }
  keyDown(e) {
    if (e.key === 'Escape' || e.code === KEYS.inventory) { this.game.closeScreen(); return; }
    const h = this.hover;
    if (h && e.code && e.code.startsWith('Digit')) {
      const n = parseInt(e.code.slice(5), 10) - 1;
      if (n >= 0 && n < 9 && !h.output) {
        const inv = this.player.inventory.main;
        const a = h.stack, b2 = inv.items[n];
        if ((!b2 || h.accepts(b2))) { h.stack = b2; inv.set(n, a); this.onSlotsChanged(); }
      }
      return;
    }
    if (h && e.code === KEYS.drop && h.stack && !h.output) {
      const st = h.stack;
      const n = e.ctrlKey ? st.count : 1;
      const d = st.copy(); d.count = n; this.game.dropStack(d);
      st.count -= n; if (st.count <= 0) h.stack = null; else h.inv.changed();
      this.onSlotsChanged();
      return;
    }
  }
}

// small helper to draw the furnace arrow & flame and the crafting arrow
function drawArrow(gui, x, y, progress) {
  const ctx = gui.ctx;
  const shape = ['.........##.............', '.........###............', '##########:###..........', '##########::###.........', '##########:::###........', '##########::::###.......',
    '##########:::::###......', '##########::::::###.....', '##########:::::::###....', '##########::::::::##....', '##########:::::::##.....', '##########::::::##......',
    '##########:::::##.......', '##########::::##........', '.........:::##..........', '.........::##...........', '.........###............'];
  void shape;
  // simple classic arrow: shaft + head
  const col = '#8b8b8b';
  ctx.fillStyle = col;
  ctx.fillRect(x, y + 6, 16, 4);
  for (let i = 0; i < 8; i++) ctx.fillRect(x + 15 + i, y + i, 1, 16 - i * 2);
  if (progress > 0) {
    const w = Math.floor(24 * progress);
    ctx.fillStyle = '#ffffff';
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, 17); ctx.clip();
    ctx.fillRect(x, y + 6, 16, 4);
    for (let i = 0; i < 8; i++) ctx.fillRect(x + 15 + i, y + i, 1, 16 - i * 2);
    ctx.restore();
  }
}
function drawFlame(gui, x, y, f) {
  const ctx = gui.ctx;
  const rows = ['.....#.......', '.....##......', '....###......', '....####.....', '...#####.#...', '...#########.', '..##########.', '..##########.', '.###########.', '.###########.', '.###########.', '..#########..', '...#######...'];
  const draw = (fill, clipTop) => {
    for (let r = 0; r < rows.length; r++) {
      if (r < clipTop) continue;
      for (let c = 0; c < rows[r].length; c++) if (rows[r][c] === '#') { ctx.fillStyle = fill(r, c); ctx.fillRect(x + c, y + r, 1, 1); }
    }
  };
  draw(() => '#8b8b8b', 0);
  if (f > 0) {
    const top = Math.round(rows.length * (1 - f));
    draw((r) => r < 5 ? '#ffe050' : r < 9 ? '#ff9a20' : '#e04a10', top);
  }
}

// ticks as m:ss
function fmtTicks(t) { const s = Math.max(0, Math.floor(t / 20)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
// the effects you are under, in little panels left of the inventory
function drawEffectList(gui, p, x, y) {
  const ks = Object.keys(p.effects || {}).filter((k) => EFFECTS[k]);
  if (!ks.length) return;
  const step = ks.length > 5 ? Math.floor(132 / ks.length) : 33;
  ks.forEach((k, i) => {
    const ef = EFFECTS[k], yy = y + i * step;
    gui.panel(x, yy, 120, 32);
    const pi = POTIONS.findIndex((q) => q.effect === k);
    if (pi >= 0) gui.item(new ItemStack(ITEM_IDS.potion, 1, pi), x + 7, yy + 7);
    else if (k === 'darkness') gui.item(new ItemStack(ITEM_IDS.hush_shard, 1, 0), x + 7, yy + 7);
    const lvl = (p.effectAmp && p.effectAmp[k]) ? ' II' : '';
    gui.text(ef.name + lvl, x + 28, yy + 6, ef.bad ? '#ff8080' : '#ffffff');
    gui.text(fmtTicks(p.effects[k]), x + 28, yy + 16, '#7f7f7f');
  });
}

// ---------------------------------------------------------------- brewing stand
class BrewingScreen extends ContainerScreen {
  constructor(game, te) {
    super(game, 176, 166);
    this.te = te;
    this.inv = new Inventory(4, te.items);
    this.inv.listeners.push(() => this.game.world.markTileChanged(te.x, te.z));
    const bottle = (s) => Brewing.isBottle(s) || s.id === ITEM_IDS.glass_bottle;
    for (const [i, x, y] of [[0, 56, 51], [1, 79, 58], [2, 102, 51]]) this.slots.push(new Slot(this.inv, i, x, y, { group: 'bottle', maxStack: 1, filter: bottle }));
    this.slots.push(new Slot(this.inv, 3, 79, 17, { group: 'ing', filter: (s) => Brewing.isIngredient(s) }));
    this.addPlayerSlots(84);
  }
  quickTargets(s, st) {
    if (s.group === 'main' || s.group === 'hotbar') {
      if (Brewing.isIngredient(st)) return { slots: [this.slots[3]] };
      if (Brewing.isBottle(st)) return { slots: this.slots.filter((x) => x.group === 'bottle') };
      return super.quickTargets(s, st);
    }
    return { slots: this.slots.filter((x) => x.group === 'hotbar' || x.group === 'main'), reverse: true };
  }
  drawForeground(gui) {
    const ctx = gui.ctx, L = this.left, T = this.top, te = this.te;
    gui.textCentered('Brewing Stand', L + this.pw / 2, T + 6, '#404040', false);
    this.label(gui, 'Inventory', 8, 72);
    // the pipes from the ingredient down to the three bottles
    ctx.fillStyle = '#8b8b8b';
    ctx.fillRect(L + 63, T + 28, 50, 2); ctx.fillRect(L + 63, T + 28, 2, 20); ctx.fillRect(L + 111, T + 28, 2, 20); ctx.fillRect(L + 86, T + 36, 2, 19);
    // progress: a falling arrow beside the ingredient, bubbles rising beside the pipe
    const f = te.brewTime > 0 ? 1 - te.brewTime / Brewing.BREW_TIME : 0;
    const ax = L + 98, ay = T + 16;
    ctx.fillStyle = '#5a5a5a'; ctx.fillRect(ax + 3, ay, 3, 22); for (let i = 0; i < 5; i++) ctx.fillRect(ax + i, ay + 22 + i, 9 - i * 2, 1);
    if (f > 0) {
      ctx.fillStyle = '#ffffff';
      const h = Math.floor(27 * f);
      ctx.save(); ctx.beginPath(); ctx.rect(ax, ay, 9, h); ctx.clip();
      ctx.fillRect(ax + 3, ay, 3, 22); for (let i = 0; i < 5; i++) ctx.fillRect(ax + i, ay + 22 + i, 9 - i * 2, 1);
      ctx.restore();
      const b = (this.game.ticks >> 1) % 8;
      ctx.fillStyle = '#d8eaff';
      for (let i = 0; i < 3; i++) { const by = T + 40 - ((b * 3 + i * 9) % 26); ctx.fillRect(L + 67 + (i % 2) * 3, by, 2, 2); }
    }
  }
  tick() {
    const te = this.te, w = this.game.world;
    if (w.getTile(te.x, te.y, te.z) !== te || this.player.distanceSq(te.x + 0.5, te.y + 0.5, te.z + 0.5) > 64) this.game.closeScreen();
  }
}

// ---------------------------------------------------------------- player inventory
class InventoryScreen extends ContainerScreen {
  constructor(game) {
    super(game, 176, 166);
    const p = this.player;
    this.craft = new Inventory(4);
    this.result = new Inventory(1);
    this.craft.listeners.push(() => this.updateResult());
    for (let i = 0; i < 4; i++) {
      const slotIdx = i;
      this.slots.push(new Slot(p.inventory.armor, i, 8, 8 + i * 18, { group: 'armor', maxStack: 1, filter: (s) => { const a = armorOf(s.id); return (a && a.slot === slotIdx) || (slotIdx === 0 && s.id === B.PUMPKIN); }, icon: ['helmet_iron', 'chestplate_iron', 'leggings_iron', 'boots_iron'][i] }));
    }
    this.slots.push(new Slot(p.inventory.offhand, 0, 77, 62, { group: 'offhand' }));
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) this.slots.push(new Slot(this.craft, r * 2 + c, 98 + c * 18, 18 + r * 18, { group: 'craft' }));
    this.slots.push(new Slot(this.result, 0, 154, 28, { output: true, group: 'result' }));
    this.addPlayerSlots(84);
  }
  updateResult() { this.result.items[0] = Recipes.result(this.craft.items, 2, 2); }
  takeOutput(s, shift) { craftTake(this, s, this.craft, 2, shift); }
  quickTargets(s, st) {
    const a = armorOf(st.id);
    if ((s.group === 'main' || s.group === 'hotbar') && a) {
      const t = this.slots.find((x) => x.group === 'armor' && x.index === a.slot);
      if (t && !t.stack) return { slots: [t] };
    }
    return super.quickTargets(s, st);
  }
  drawForeground(gui, mx, my) {
    drawEffectList(gui, this.player, this.left - 124, this.top);
    this.label(gui, 'Crafting', 86, 6);
    drawArrow(gui, this.left + 132, this.top + 28, 0);
    // player preview window (cut out so the 3D view shows through)
    const bx = this.left + 26, by = this.top + 8;
    gui.darkInset(bx, by, 52, 72);
    this.previewRect = [bx + 1, by + 1, 50, 70];
    this.previewMouse = [mx, my];
  }
  onClose() {
    super.onClose();
    for (let i = 0; i < 4; i++) if (this.craft.items[i]) { this.game.giveItem(this.craft.items[i]); this.craft.items[i] = null; }
  }
}
// take crafted output (shift = craft as many as possible into the inventory)
function craftTake(screen, slot, grid, size, shift) {
  const g = screen.game;
  let crafted = 0;
  for (let guard = 0; guard < 64; guard++) {
    const out = slot.stack;
    if (!out) break;
    if (shift) {
      const tmp = out.copy();
      if (!g.player.inventory.canFit(tmp)) break;
      g.player.inventory.add(tmp);
    } else {
      const cur = screen.cursor;
      if (cur && (!cur.canStackWith(out) || cur.count + out.count > maxStackOf(out.id))) break;
      if (cur) cur.count += out.count; else screen.cursor = out.copy();
    }
    crafted += out.count;
    g.onCrafted(out);
    // consume ingredients
    for (let i = 0; i < grid.size; i++) {
      const s = grid.items[i];
      if (!s) continue;
      const def = ITEMS[s.id];
      if (def && def.container && s.id !== ITEM_IDS.milk_bucket || s.id === ITEM_IDS.water_bucket || s.id === ITEM_IDS.lava_bucket) {
        grid.items[i] = new ItemStack(ITEM_IDS[def.container], 1, 0);
      } else if (s.id === ITEM_IDS.milk_bucket) grid.items[i] = new ItemStack(ITEM_IDS.bucket, 1, 0);
      else { s.count--; if (s.count <= 0) grid.items[i] = null; }
    }
    grid.changed();
    if (!shift) break;
    const nr = slot.stack;
    if (!nr || nr.id !== out.id) break;
  }
  if (crafted) g.audio.play('pop', 0.15, 1.6);
  void size;
}

// ---------------------------------------------------------------- crafting table
class CraftingScreen extends ContainerScreen {
  constructor(game, x, y, z) {
    super(game, 176, 166);
    this.pos = [x, y, z];
    this.craft = new Inventory(9);
    this.result = new Inventory(1);
    this.craft.listeners.push(() => { this.result.items[0] = Recipes.result(this.craft.items, 3, 3); });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) this.slots.push(new Slot(this.craft, r * 3 + c, 30 + c * 18, 17 + r * 18, { group: 'craft' }));
    const out = new Slot(this.result, 0, 124, 35, { output: true, group: 'result' }); out.big = true;
    this.slots.push(out);
    this.addPlayerSlots(84);
  }
  takeOutput(s, shift) { craftTake(this, s, this.craft, 3, shift); }
  quickTargets(s, st) {
    if (s.group === 'craft') return { slots: this.slots.filter((x) => x.group === 'main' || x.group === 'hotbar') };
    return super.quickTargets(s, st);
  }
  drawForeground(gui) {
    this.label(gui, 'Crafting', 28, 6);
    this.label(gui, 'Inventory', 8, 72);
    drawArrow(gui, this.left + 90, this.top + 35, 0);
  }
  tick() {
    const p = this.player, [x, y, z] = this.pos;
    if (this.game.world.getBlock(x, y, z) !== B.CRAFTING_TABLE || p.distanceSq(x + 0.5, y + 0.5, z + 0.5) > 64) this.game.closeScreen();
  }
  onClose() {
    super.onClose();
    for (let i = 0; i < 9; i++) if (this.craft.items[i]) { this.game.giveItem(this.craft.items[i]); this.craft.items[i] = null; }
  }
}

// ---------------------------------------------------------------- furnace
class FurnaceScreen extends ContainerScreen {
  constructor(game, te) {
    super(game, 176, 166);
    this.te = te;
    this.inv = new Inventory(3, te.items);
    this.inv.listeners.push(() => this.game.world.markTileChanged(te.x, te.z));
    this.slots.push(new Slot(this.inv, 0, 56, 17, { group: 'in' }));
    this.slots.push(new Slot(this.inv, 1, 56, 53, { group: 'fuel', filter: (s) => fuelValue(s.id, s.dmg) > 0 }));
    const out = new Slot(this.inv, 2, 116, 35, { output: true, group: 'out' }); out.big = true;
    this.slots.push(out);
    this.addPlayerSlots(84);
  }
  takeOutput(s, shift) {
    const st = s.stack; if (!st) return;
    if (shift) { if (this.moveInto(st, this.slots.filter((x) => x.group === 'hotbar' || x.group === 'main'), true)) s.stack = null; else s.inv.changed(); }
    else {
      const cur = this.cursor;
      if (!cur) { this.cursor = st; s.stack = null; }
      else if (cur.canStackWith(st) && cur.count + st.count <= maxStackOf(st.id)) { cur.count += st.count; s.stack = null; }
      else return;
    }
    // award stored smelting xp
    const xp = Math.floor(this.te.xp); this.te.xp -= xp;
    if (Math.random() < this.te.xp) { this.te.xp = 0; this.game.player.addXP(xp + 1); } else if (xp > 0) this.game.player.addXP(xp);
    this.game.onSmelted(st);
  }
  quickTargets(s, st) {
    if (s.group === 'main' || s.group === 'hotbar') {
      if (Recipes.smeltResult(st)) return { slots: [this.slots[0]] };
      if (fuelValue(st.id, st.dmg) > 0) return { slots: [this.slots[1]] };
      return super.quickTargets(s, st);
    }
    return { slots: this.slots.filter((x) => x.group === 'hotbar' || x.group === 'main'), reverse: true };
  }
  drawForeground(gui) {
    const t = this.te;
    gui.textCentered('Furnace', this.left + this.pw / 2, this.top + 6, '#404040', false);
    this.label(gui, 'Inventory', 8, 72);
    drawFlame(gui, this.left + 56, this.top + 36, t.burnMax > 0 ? t.burn / t.burnMax : 0);
    drawArrow(gui, this.left + 79, this.top + 34, t.cook / 200);
  }
  tick() {
    const te = this.te, w = this.game.world;
    if (w.getTile(te.x, te.y, te.z) !== te || this.player.distanceSq(te.x + 0.5, te.y + 0.5, te.z + 0.5) > 64) this.game.closeScreen();
  }
}

// ---------------------------------------------------------------- chest
class ChestScreen extends ContainerScreen {
  constructor(game, te) {
    const rows = 3;
    super(game, 176, 114 + rows * 18);
    this.te = te; this.rows = rows;
    this.inv = new Inventory(27, te.items);
    this.inv.listeners.push(() => this.game.world.markTileChanged(te.x, te.z));
    for (let r = 0; r < rows; r++) for (let c = 0; c < 9; c++) this.slots.push(new Slot(this.inv, r * 9 + c, 8 + c * 18, 18 + r * 18, { group: 'chest' }));
    this.addPlayerSlots(103 + (rows - 4) * 18);
    te.open++;
    game.audio.play('chest_open', 0.5, 0.9 + Math.random() * 0.1, te.x + 0.5, te.y + 0.5, te.z + 0.5);
    if (te.buried) { te.buried = false; game.onTreasureFound(te); }
    game.onChestOpened(te);
  }
  quickTargets(s, st) {
    if (s.group === 'chest') return { slots: this.slots.filter((x) => x.group === 'hotbar' || x.group === 'main'), reverse: true };
    return { slots: this.slots.filter((x) => x.group === 'chest') };
  }
  drawForeground(gui) {
    this.label(gui, 'Chest', 8, 6);
    this.label(gui, 'Inventory', 8, this.ph - 96 + 2);
  }
  tick() {
    const te = this.te, w = this.game.world;
    if (w.getTile(te.x, te.y, te.z) !== te || this.player.distanceSq(te.x + 0.5, te.y + 0.5, te.z + 0.5) > 64) this.game.closeScreen();
  }
  onClose() {
    super.onClose();
    this.te.open = Math.max(0, this.te.open - 1);
    this.game.audio.play('chest_close', 0.5, 0.9 + Math.random() * 0.1, this.te.x + 0.5, this.te.y + 0.5, this.te.z + 0.5);
  }
}

// a chest riding on a minecart
class CartChestScreen extends ChestScreen {
  constructor(game, cart) {
    super(game, { x: Math.floor(cart.x), y: Math.floor(cart.y), z: Math.floor(cart.z), items: cart.items, open: 0, buried: false });
    this.cart = cart;
  }
  drawForeground(gui) {
    this.label(gui, 'Minecart with Chest', 8, 6);
    this.label(gui, 'Inventory', 8, this.ph - 96 + 2);
  }
  tick() { const c = this.cart; if (c.removed || this.player.distanceSq(c.x, c.y, c.z) > 64) this.game.closeScreen(); }
}

// ---------------------------------------------------------------- creative inventory
const CREATIVE_TABS = (() => {
  const blk = (id, d) => [id, d || 0];
  const all = (id) => { const b = BLOCKS[id]; return (b.variants || [0]).map((v) => [id, v]); };
  const I = ITEM_IDS;
  const items = (keys) => keys.map((k) => [I[k], 0]);
  const T = [];
  T.push({ name: 'Building Blocks', icon: [B.BRICKS, 0], list: [
    blk(B.STONE), blk(B.GRASS), ...all(B.DIRT), blk(B.PODZOL), blk(B.MYCELIUM), blk(B.COBBLESTONE), blk(B.MOSSY_COBBLESTONE), ...all(B.PLANKS), blk(B.BEDROCK), ...all(B.SAND), blk(B.GRAVEL),
    blk(B.GOLD_ORE), blk(B.IRON_ORE), blk(B.COAL_ORE), blk(B.LAPIS_ORE), blk(B.DIAMOND_ORE), blk(B.EMBER_ORE), blk(B.JADE_ORE), blk(B.COBALT_ORE), blk(B.SULFUR_ORE), blk(B.STARMETAL_ORE),
    ...all(B.LOG), blk(B.GLASS), ...all(B.SANDSTONE), ...all(B.RED_SANDSTONE), ...all(B.WOOL), blk(B.GOLD_BLOCK), blk(B.IRON_BLOCK), blk(B.DIAMOND_BLOCK), blk(B.LAPIS_BLOCK), blk(B.JADE_BLOCK),
    blk(B.COBALT_BLOCK), blk(B.COAL_BLOCK), blk(B.STARMETAL_BLOCK), blk(B.EMBER_BLOCK), blk(B.SULFUR_BLOCK), ...all(B.SLAB), ...all(B.STAIRS), blk(B.BRICKS), blk(B.TNT), blk(B.BOOKSHELF), blk(B.OBSIDIAN),
    ...all(B.STONE_BRICKS), blk(B.SNOW), blk(B.ICE), blk(B.PACKED_ICE), blk(B.CLAY), ...all(B.TERRACOTTA), ...all(B.STAINED_GLASS), blk(B.SLATE), blk(B.SLATE_BRICKS), blk(B.MARBLE), ...all(B.MARBLE_BRICKS),
    blk(B.BASALT), blk(B.POLISHED_BASALT), blk(B.ASH), blk(B.PEAT), blk(B.SALT), blk(B.SCORCHED_STONE), blk(B.THATCH), blk(B.QUICKSAND), blk(B.HAY_BALE), blk(B.HUGE_MUSHROOM_BROWN), blk(B.HUGE_MUSHROOM_RED), blk(B.RUNESTONE),
    blk(B.BRIMSTONE), blk(B.BONESAND), blk(B.QUARTZ_ORE), blk(B.SUNSTONE), ...all(B.QUARTZ_BLOCK), blk(B.BRIMSTONE_BRICKS), blk(B.BONE_BLOCK), blk(B.STARSTONE), blk(B.STARSTONE_BRICKS),
    blk(B.DEEPSTONE), ...all(B.DEEPSTONE_BRICKS), blk(B.REINFORCED_DEEPSTONE), blk(B.CAVE_MOSS), blk(B.HUSHMOSS), blk(B.SIFT_SAND), blk(B.SILTSTONE), ...all(B.SILTSTONE_BRICKS), blk(B.SIFT_GLASS)] });
  T.push({ name: 'Decoration', icon: [B.FLOWER, 0], list: [
    ...all(B.SAPLING), ...all(B.LEAVES), blk(B.COBWEB), ...all(B.TALL_GRASS), blk(B.DEAD_BUSH), ...all(B.FLOWER), blk(B.MUSHROOM_BROWN), blk(B.MUSHROOM_RED), blk(B.GLOWSHROOM), blk(B.LUMITE_CRYSTAL),
    blk(B.TORCH), blk(B.CHEST), blk(B.CRAFTING_TABLE), blk(B.FURNACE), blk(B.ENCHANTING_TABLE), blk(B.LADDER), blk(B.ROPE), blk(B.SNOW_LAYER), blk(B.CACTUS), blk(B.PUMPKIN), blk(B.JACK_O_LANTERN), blk(B.MELON), blk(B.VINE),
    blk(B.LILY_PAD), blk(B.CATTAIL), blk(B.BRAMBLE), blk(B.LEAF_LITTER), ...all(B.FENCE), blk(B.FENCE_GATE), blk(B.TRAPDOOR), blk(B.GLASS_PANE), ...all(B.CARPET), blk(B.LUMITE_LAMP), blk(B.MOB_SPAWNER), blk(B.BRIMSTONE_FENCE), [I.bloodcap, 0],
    blk(B.IRON_BARS), blk(B.RIFT_FRAME), ...all(B.INFESTED_BRICKS), [I.star_crystal, 0], blk(B.WYRM_EGG), [I.star_fragment, 0],
    blk(B.GLOW_VINE), blk(B.GLOW_VINE_BERRIES), blk(B.PALE_LANTERN), blk(B.HUSH_SENSOR), blk(B.HUSH_SHRIEKER), blk(B.GATE_KEYSTONE), blk(B.DUNE_GRASS),
    [I.door_wood, 0], [I.door_iron, 0], [I.bed, 0], ...WOOD.map((w, i) => [I.sign, i]), [I.painting, 0]] });
  T.push({ name: 'Tools', icon: [I.iron_axe, 0], list: [...['wood', 'stone', 'iron', 'gold', 'cobalt', 'diamond', 'starmetal'].flatMap((m) => ['shovel', 'pickaxe', 'axe', 'hoe'].map((k) => [I[m + '_' + k], 0])),
    ...items(['flint_and_steel', 'shears', 'fishing_rod', 'bucket', 'water_bucket', 'lava_bucket', 'milk_bucket', 'compass', 'clock', 'map', 'prospector_rod', 'wayfinder', 'journal', 'message_bottle', 'echo_fork', 'wayback_compass', 'lost_letter'])] });
  T.push({ name: 'Combat', icon: [I.gold_sword, 0], list: [...['wood', 'stone', 'iron', 'gold', 'cobalt', 'diamond', 'starmetal'].map((m) => [I[m + '_sword'], 0]), [I.bow, 0], [I.arrow, 0],
    ...['leather', 'iron', 'gold', 'cobalt', 'diamond', 'starmetal'].flatMap((m) => ARMOR_SLOTS.map((s) => [I[m + '_' + s], 0])), [I.silent_boots, 0], [I.snowball, 0], [I.egg, 0]] });
  T.push({ name: 'Ember Circuits', icon: [I.ember_dust, 0], list: [[I.ember_dust, 0], blk(B.EMBER_TORCH), blk(B.LEVER), blk(B.STONE_BUTTON), blk(B.WOOD_BUTTON), blk(B.STONE_PLATE), blk(B.WOOD_PLATE),
    [I.relay, 0], blk(B.PISTON), blk(B.STICKY_PISTON), blk(B.EMBER_LAMP), blk(B.NOTE_BLOCK), blk(B.EMBER_BLOCK), blk(B.HUSH_SENSOR), blk(B.TNT), [I.door_wood, 0], [I.door_iron, 0], blk(B.TRAPDOOR), blk(B.FENCE_GATE), blk(B.DETECTOR_RAIL)] });
  T.push({ name: 'Transportation', icon: [B.BOOSTER_RAIL, 0], list: [blk(B.RAIL), blk(B.BOOSTER_RAIL), blk(B.DETECTOR_RAIL), [I.minecart, 0], [I.chest_minecart, 0], ...WOOD.map((w, i) => [I.boat, i])] });
  T.push({ name: 'Brewing', icon: [I.potion, 10], list: [blk(B.BREWING_STAND), [I.glass_bottle, 0], ...POTION_VARIANTS.map((d) => [I.potion, d]), ...POTION_VARIANTS.map((d) => [I.splash_potion, d]),
    ...items(['bloodcap', 'sugar', 'glistering_melon', 'spider_eye', 'fermented_spider_eye', 'wailer_tear', 'flare_powder', 'magma_cream', 'glimmerfin', 'pufferfish', 'slimeball', 'ember_dust', 'sunstone_dust', 'gunpowder'])] });
  T.push({ name: 'Foodstuffs', icon: [I.apple, 0], list: items(['apple', 'golden_apple', 'bread', 'porkchop', 'cooked_porkchop', 'beef', 'steak', 'chicken', 'cooked_chicken', 'mutton', 'cooked_mutton', 'venison', 'cooked_venison', 'jerky',
    'fish', 'cooked_fish', 'salmon', 'cooked_salmon', 'sunfish', 'pufferfish', 'glimmerfin', 'carrot', 'potato', 'baked_potato', 'poison_potato', 'cookie', 'melon_slice', 'mushroom_stew', 'glow_berries', 'pumpkin_pie', 'berry_pie', 'berries', 'glowberry', 'rotten_flesh', 'spider_eye']) });
  T.push({ name: 'Materials', icon: [I.stick, 0], list: [...items(['coal']), [I.coal, 1], ...items(['diamond', 'iron_ingot', 'gold_ingot', 'gold_nugget', 'cobalt_ingot', 'starmetal_ingot', 'jade', 'ember_dust', 'sulfur', 'lumite_shard', 'salt',
    'stick', 'bowl', 'string', 'cattail_fiber', 'feather', 'flint', 'gunpowder', 'leather', 'bone', 'clay_ball', 'brick', 'paper', 'book', 'slimeball', 'wheat', 'seeds', 'sugar', 'sugar_cane', 'wisp_essence',
      'sunstone_dust', 'smoky_quartz', 'brimstone_brick', 'wailer_tear', 'flare_rod', 'flare_powder', 'magma_cream', 'fire_charge', 'seeker_eye', 'hush_shard', 'echo_heart', 'sift_scale']),
    ...[...Array(16).keys()].map((d) => [I.dye, d])] });
  T.push({ name: 'Creatures', icon: [I.spawn_egg, 1], list: [] });   // filled when mobs load
  T.push({ name: 'Search', icon: [I.compass, 0], list: [], search: true });
  T.push({ name: 'Survival Inventory', icon: [B.CHEST, 0], list: [], survival: true });
  return T;
})();

class CreativeScreen extends ContainerScreen {
  constructor(game) {
    super(game, 195, 136);
    this.tab = 0; this.scroll = 0;
    this.grid = new Inventory(45);
    this.destroy = new Inventory(1);
    this.search = '';
    this.buildSlots();
  }
  init() {
    super.init();
    this.searchField = null;
    if (CREATIVE_TABS[this.tab].search) {
      this.searchField = this.add(new TextField(this.left + 82, this.top + 6, 89, 10, this.search, 30));
      this.searchField.onChange = (t) => { this.search = t; this.scroll = 0; this.fill(); };
      this.searchField.focused = true; this.game.input.focusText(this.searchField);
    }
  }
  tabItems() {
    const t = CREATIVE_TABS[this.tab];
    if (t.name === 'Creatures') return MOB_TYPES.map((m, i) => m && m.egg && !m.noEgg ? [ITEM_IDS.spawn_egg, i] : null).filter(Boolean);
    if (t.search) {
      const q = this.search.toLowerCase();
      const out = [];
      for (const tt of CREATIVE_TABS) if (!tt.search && !tt.survival) for (const it of (tt.name === 'Creatures' ? [] : tt.list)) if (!q || itemName(it[0], it[1]).toLowerCase().includes(q)) out.push(it);
      return out;
    }
    return t.list;
  }
  buildSlots() {
    this.slots = [];
    const t = CREATIVE_TABS[this.tab];
    if (t.survival) {
      const p = this.player;
      for (let i = 0; i < 4; i++) this.slots.push(new Slot(p.inventory.armor, i, 54 + (i >> 1) * 54, 6 + (i & 1) * 27, { group: 'armor', maxStack: 1, filter: (s) => { const a = armorOf(s.id); return a && a.slot === i; } }));
      this.slots.push(new Slot(p.inventory.offhand, 0, 35, 20, { group: 'offhand' }));
      for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) this.slots.push(new Slot(p.inventory.main, 9 + r * 9 + c, 9 + c * 18, 54 + r * 18, { group: 'main' }));
      const d = new Slot(this.destroy, 0, 173, 112, { group: 'destroy' }); this.slots.push(d);
    } else {
      for (let r = 0; r < 5; r++) for (let c = 0; c < 9; c++) this.slots.push(new Slot(this.grid, r * 9 + c, 9 + c * 18, 18 + r * 18, { group: 'creative' }));
    }
    for (let c = 0; c < 9; c++) this.slots.push(new Slot(this.player.inventory.main, c, 9 + c * 18, 112, { group: 'hotbar' }));
    this.fill();
  }
  fill() {
    const items = this.tabItems();
    const rows = Math.ceil(items.length / 9);
    this.maxScroll = Math.max(0, rows - 5);
    this.scroll = clamp(this.scroll, 0, this.maxScroll);
    for (let i = 0; i < 45; i++) {
      const it = items[this.scroll * 9 + i];
      this.grid.items[i] = it && itemExists(it[0]) ? new ItemStack(it[0], 1, it[1]) : null;
    }
  }
  setTab(i) { this.tab = i; this.scroll = 0; this.buildSlots(); this.layout(); }
  tabRect(i) {
    const top = i < 6;
    const col = top ? i : i - 6;
    return [this.left + col * 29, top ? this.top - 28 : this.top + this.ph - 4, 28, 32, top];
  }
  isInsideExtra(mx, my) { for (let i = 0; i < CREATIVE_TABS.length; i++) { const [x, y, w, h] = this.tabRect(i); if (mx >= x && my >= y && mx < x + w && my < y + h) return true; } return false; }
  mouseDown(mx, my, btn, e) {
    for (let i = 0; i < CREATIVE_TABS.length; i++) {
      const [x, y, w, h] = this.tabRect(i);
      if (mx >= x && my >= y && mx < x + w && my < y + h) { this.setTab(i); this.game.audio.play('click', 0.4); return true; }
    }
    // scrollbar
    if (!CREATIVE_TABS[this.tab].survival && mx >= this.left + 175 && mx < this.left + 189 && my >= this.top + 18 && my < this.top + 18 + 90) { this.scrolling = true; this.scrollTo(my); return true; }
    const s = this.slotAt(mx, my);
    if (s && s.group === 'creative') {
      if (this.cursor) { this.cursor = null; return true; }
      if (!s.stack) return true;
      const c = s.stack.copy();
      c.count = (btn === 1 || (e && e.shiftKey)) ? maxStackOf(c.id) : (btn === 2 ? 1 : maxStackOf(c.id));
      if (e && e.shiftKey) { this.player.inventory.add(c); return true; }
      this.cursor = c;
      return true;
    }
    if (s && s.group === 'destroy') {
      if (this.cursor) this.cursor = null;
      else if (e && e.shiftKey) { this.player.inventory.main.clear(); }
      return true;
    }
    return super.mouseDown(mx, my, btn, e);
  }
  scrollTo(my) { const f = clamp((my - this.top - 18 - 7) / (90 - 15), 0, 1); this.scroll = Math.round(f * this.maxScroll); this.fill(); }
  mouseMove(mx, my) { if (this.scrolling) { this.scrollTo(my); return; } super.mouseMove(mx, my); }
  mouseUp(mx, my, btn) { this.scrolling = false; super.mouseUp(mx, my, btn); }
  wheel(d) { if (!CREATIVE_TABS[this.tab].survival) { this.scroll = clamp(this.scroll + d, 0, this.maxScroll); this.fill(); } }
  quickTargets(s, st) {
    if (s.group === 'hotbar') return { slots: [] };
    return super.quickTargets(s, st);
  }
  keyDown(e) {
    if (this.searchField && this.searchField.focused && e.key !== 'Escape') return;
    super.keyDown(e);
  }
  drawPanel(gui) {
    const t = CREATIVE_TABS[this.tab];
    for (let i = 0; i < CREATIVE_TABS.length; i++) if (i !== this.tab) this.drawTab(gui, i, false);
    gui.panel(this.left, this.top, this.pw, this.ph);
    this.drawTab(gui, this.tab, true);
    if (!t.survival) {
      gui.text(t.name, this.left + 8, this.top + 6, '#404040', false);
      // scrollbar
      const sx = this.left + 175, sy = this.top + 18;
      gui.slot(sx - 1, sy - 1, 14, 92);
      const k = this.maxScroll ? this.scroll / this.maxScroll : 0;
      gui.button(sx, sy + Math.round(k * (90 - 15)), 12, 15, null, this.maxScroll ? 'normal' : 'disabled');
    } else {
      gui.darkInset(this.left + 72, this.top + 5, 32, 45);
      this.previewRect = [this.left + 73, this.top + 6, 30, 43];
      this.previewMouse = [this.game.input.mx, this.game.input.my];
    }
  }
  drawTab(gui, i, active) {
    const [x, y, w, h, top] = this.tabRect(i);
    const ctx = gui.ctx;
    ctx.fillStyle = '#000000'; ctx.fillRect(x + 1, y, w - 2, h); ctx.fillRect(x, y + 1, w, h - 2);
    ctx.fillStyle = active ? '#c6c6c6' : '#8f8f8f'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = active ? '#ffffff' : '#c6c6c6'; ctx.fillRect(x + 1, y + 1, w - 3, 1); ctx.fillRect(x + 1, y + 1, 1, h - 3);
    if (active) { ctx.fillStyle = '#c6c6c6'; if (top) ctx.fillRect(x + 1, y + h - 4, w - 2, 6); else ctx.fillRect(x + 1, y - 2, w - 2, 6); }
    const ic = CREATIVE_TABS[i].icon;
    gui.item(new ItemStack(ic[0], 1, ic[1]), x + 6, y + (top ? 9 : 7));
  }
  drawForeground(gui, mx, my) {
    for (let i = 0; i < CREATIVE_TABS.length; i++) {
      const [x, y, w, h] = this.tabRect(i);
      if (mx >= x && my >= y && mx < x + w && my < y + h && !this.cursor) this.tabTip = [CREATIVE_TABS[i].name, mx, my];
    }
    const t = CREATIVE_TABS[this.tab];
    if (t.survival) { const d = this.slots.find((s) => s.group === 'destroy'); if (d) { gui.ctx.fillStyle = '#8b2020'; gui.ctx.fillRect(this.left + d.x, this.top + d.y, 16, 16); gui.text('x', this.left + d.x + 6, this.top + d.y + 4, '#ffffff'); } }
  }
  draw(gui, mx, my) {
    this.tabTip = null;
    super.draw(gui, mx, my);
    if (this.tabTip) gui.tooltip([this.tabTip[0]], this.tabTip[1], this.tabTip[2]);
  }
}
const ITEM_LORE = {};
