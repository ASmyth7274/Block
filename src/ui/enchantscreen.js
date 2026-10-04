'use strict';
// ---------------------------------------------------------------------------
// The enchanting table screen: an item, some lapis and three offers written
// in an old runic script. Offers stay the same until you enchant something.
// ---------------------------------------------------------------------------
const RUNE_WORDS = ('ember wane drift hollow kindle sear frost veil root stone tide gale ash bloom thread echo lumen marrow dusk hearth vow shard wisp rune '
  + 'grave crest spire sunder bind mend quell rouse deep far old night dawn moor salt jade star fall sing hum keep turn wake sleep bright dim fire '
  + 'water earth sky iron gold cold warm wild still swift slow kin wyrd lore oath mark sigil gleam murmur hush').split(' ');
// a little runic font, one 4x7 glyph per letter
const RUNE_GLYPHS = (() => {
  const out = {};
  'abcdefghijklmnopqrstuvwxyz'.split('').forEach((ch, i) => {
    const r = new Noise.Random(stringHash('rune:' + ch) >>> 0);
    const px = [];
    const stem = r.nextInt(4);
    for (let y = 0; y < 7; y++) px.push([stem, y]);
    for (let k = 0; k < 3 + r.nextInt(3); k++) {
      const y = r.nextInt(7), x0 = r.nextInt(4), len = 1 + r.nextInt(3);
      for (let x = x0; x < Math.min(4, x0 + len); x++) px.push([x, y]);
    }
    if (i % 3 === 0) { const y = r.nextInt(5); px.push([(stem + 1) % 4, y], [(stem + 2) % 4, y + 1]); }
    out[ch] = px;
  });
  return out;
})();
function drawRunes(gui, text, x, y, color, maxW) {
  const ctx = gui.ctx;
  ctx.fillStyle = color;
  let cx = x, cy = y;
  for (const word of text.split(' ')) {
    const w = word.length * 5;
    if (cx > x && cx + w > x + maxW) { cx = x; cy += 9; }
    for (const ch of word) { const g = RUNE_GLYPHS[ch]; if (g) for (const [px, py] of g) ctx.fillRect(cx + px, cy + py, 1, 1); cx += 5; }
    cx += 4;
  }
}

class EnchantScreen extends ContainerScreen {
  constructor(game, x, y, z) {
    super(game, 176, 166);
    this.pos = [x, y, z];
    this.inv = new Inventory(2);
    this.inv.listeners.push(() => this.refresh());
    this.slots.push(new Slot(this.inv, 0, 15, 47, { group: 'item', maxStack: 1 }));
    this.slots.push(new Slot(this.inv, 1, 35, 47, { group: 'lapis', filter: (s) => s.id === ITEM_IDS.dye && s.dmg === 11, icon: 'lapis' }));
    this.addPlayerSlots(84);
    this.power = Enchant.power(game.world, x, y, z);
    this.costs = [0, 0, 0]; this.hints = [null, null, null]; this.texts = ['', '', ''];
    this.refresh();
  }
  refresh() {
    const st = this.inv.items[0], p = this.player;
    this.costs = [0, 0, 0]; this.hints = [null, null, null];
    if (!st || !Enchant.canEnchant(st)) return;
    const rng = new Noise.Random(p.enchantSeed >>> 0);
    for (let i = 0; i < 3; i++) this.costs[i] = Enchant.offerCost(rng, i, this.power, st);
    for (let i = 0; i < 3; i++) {
      if (this.costs[i] <= 0) continue;
      const list = Enchant.roll(new Noise.Random((p.enchantSeed + i) >>> 0), st, this.costs[i]);
      if (!list.length) { this.costs[i] = 0; continue; }
      this.hints[i] = list[0];
      const r = new Noise.Random((p.enchantSeed * 31 + i * 977) >>> 0);
      const n = 2 + r.nextInt(3), words = [];
      for (let k = 0; k < n; k++) words.push(RUNE_WORDS[r.nextInt(RUNE_WORDS.length)]);
      this.texts[i] = words.join(' ');
    }
  }
  optionRect(i) { return [this.left + 60, this.top + 14 + i * 19, 108, 19]; }
  affordable(i) {
    const p = this.player, lap = this.inv.items[1];
    return this.costs[i] > 0 && (p.creative || (p.xpLevel >= this.costs[i] && lap && lap.count >= i + 1));
  }
  choose(i) {
    const p = this.player, st = this.inv.items[0];
    if (!st || !this.affordable(i)) return;
    const list = Enchant.roll(new Noise.Random((p.enchantSeed + i) >>> 0), st, this.costs[i]);
    if (!list.length) return;
    Enchant.apply(st, list);
    if (!p.creative) {
      p.removeLevels(i + 1);
      const lap = this.inv.items[1];
      lap.count -= i + 1;
      if (lap.count <= 0) this.inv.items[1] = null;
    }
    p.enchantSeed = (Math.random() * 2147483647) | 0;
    this.game.audio.play('levelup', 0.4, 1.4);
    this.game.audio.play('chime', 0.5, 0.7);
    const [x, y, z] = this.pos;
    for (let k = 0; k < 16; k++) this.game.particles.sparkle(x + 0.5, y + 1.2, z + 0.5, 0.7, 0.4, 1, 1, 1);
    this.game.achieve('enchant');
    this.inv.changed();
  }
  mouseDown(mx, my, btn, e) {
    for (let i = 0; i < 3; i++) {
      const [x, y, w, h] = this.optionRect(i);
      if (mx >= x && my >= y && mx < x + w && my < y + h) { if (btn === 0) this.choose(i); return true; }
    }
    return super.mouseDown(mx, my, btn, e);
  }
  quickTargets(s, st) {
    if (s.group === 'main' || s.group === 'hotbar') {
      if (st.id === ITEM_IDS.dye && st.dmg === 11) return { slots: [this.slots[1]] };
      if (!this.inv.items[0] && st.count === 1 && Enchant.canEnchant(st)) return { slots: [this.slots[0]] };
      return super.quickTargets(s, st);
    }
    return { slots: this.slots.filter((x) => x.group === 'hotbar' || x.group === 'main'), reverse: true };
  }
  drawForeground(gui, mx, my) {
    const ctx = gui.ctx;
    this.label(gui, 'Enchant', 12, 5);
    this.label(gui, 'Inventory', 8, 72);
    // an open book on the left
    const bx = this.left + 14, by = this.top + 15;
    ctx.fillStyle = '#5a2a10'; ctx.fillRect(bx, by + 2, 36, 22);
    ctx.fillStyle = '#ece4cc'; ctx.fillRect(bx + 2, by, 15, 22); ctx.fillRect(bx + 19, by, 15, 22);
    ctx.fillStyle = '#b8ac90';
    for (let k = 0; k < 6; k++) { ctx.fillRect(bx + 4, by + 3 + k * 3, 10 + (k % 2), 1); ctx.fillRect(bx + 21, by + 3 + k * 3, 9 + ((k + 1) % 2) * 2, 1); }
    ctx.fillStyle = '#3a1a08'; ctx.fillRect(bx + 17, by, 2, 24);
    this.hoverTip = null;
    for (let i = 0; i < 3; i++) {
      const [x, y, w, h] = this.optionRect(i);
      const has = this.costs[i] > 0, ok = this.affordable(i), hov = mx >= x && my >= y && mx < x + w && my < y + h;
      ctx.fillStyle = !has ? '#8b8b8b' : !ok ? '#a99ea0' : hov ? '#d8c8e8' : '#c4b8d4';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#373737'; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 1, y + h - 1, w - 1, 1); ctx.fillRect(x + w - 1, y + 1, 1, h - 1);
      if (!has) continue;
      // lapis badge with the slot number
      ctx.fillStyle = ok ? '#2f62c8' : '#5a6a8a'; ctx.fillRect(x + 3, y + 3, 11, 13);
      gui.text(String(i + 1), x + 6, y + 6, ok ? '#ffffff' : '#a0a0a0', false);
      drawRunes(gui, this.texts[i], x + 18, y + 3, ok ? (hov ? '#5a4a2a' : '#685e4a') : '#8a8070', 64);
      gui.textRight(String(this.costs[i]), x + w - 3, y + 9, ok ? '#80ff20' : '#407f10');
      if (hov) {
        const [eid, lv] = this.hints[i];
        const p = this.player, lap = this.inv.items[1];
        const lines = [Enchant.name(eid, lv) + ' . . . ?'];
        if (!p.creative) {
          lines.push('');
          lines.push(((lap && lap.count >= i + 1) ? '§7' : '§c') + (i + 1) + ' Lapis Lazuli');
          lines.push((p.xpLevel >= this.costs[i] ? '§7' : '§c') + (i + 1) + (i === 0 ? ' Enchantment Level' : ' Enchantment Levels'));
          if (p.xpLevel < this.costs[i]) lines.push('§cLevel Requirement: ' + this.costs[i]);
        }
        this.hoverTip = [lines, mx, my];
      }
    }
  }
  draw(gui, mx, my) {
    super.draw(gui, mx, my);
    if (this.hoverTip && !this.cursor) gui.tooltip(this.hoverTip[0], this.hoverTip[1], this.hoverTip[2]);
  }
  tick() {
    const [x, y, z] = this.pos;
    if (this.game.world.getBlock(x, y, z) !== B.ENCHANTING_TABLE || this.player.distanceSq(x + 0.5, y + 0.5, z + 0.5) > 64) this.game.closeScreen();
  }
  onClose() {
    super.onClose();
    for (let i = 0; i < 2; i++) if (this.inv.items[i]) { this.game.giveItem(this.inv.items[i]); this.inv.items[i] = null; }
  }
}
