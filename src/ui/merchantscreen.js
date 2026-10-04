'use strict';
// ---------------------------------------------------------------------------
// Trading with a villager, laid out like the classic merchant screen: the
// offer at the top (flip through with the arrows), payment in the two slots
// below, and the goods in the slot on the right. A sold-out offer is crossed
// out until the villager restocks.
// ---------------------------------------------------------------------------
class MerchantScreen extends ContainerScreen {
  constructor(game, villager) {
    super(game, 176, 166);
    this.v = villager;
    this.idx = 0;
    this.pay = new Inventory(2);
    this.out = new Inventory(1);
    this.pay.listeners.push(() => this.updateResult());
    this.slots.push(new Slot(this.pay, 0, 36, 53, { group: 'pay' }));
    this.slots.push(new Slot(this.pay, 1, 62, 53, { group: 'pay' }));
    this.slots.push(new Slot(this.out, 0, 120, 53, { output: true, group: 'result' }));
    this.addPlayerSlots(84);
  }
  init() {
    if (super.init) super.init();
    this.add(new Button(this.left + 36 - 19, this.top + 23, 12, 19, '<', () => this.flip(-1)));
    this.add(new Button(this.left + 120 + 27, this.top + 23, 12, 19, '>', () => this.flip(1)));
  }
  get offers() { return this.v.offers || []; }
  get offer() { return this.offers[this.idx] || null; }
  flip(d) { const n = this.offers.length; if (!n) return; this.idx = clamp(this.idx + d, 0, n - 1); this.updateResult(); }
  static fits(have, need) { return !!have && !!need && have.id === need.id && have.dmg === need.dmg && have.count >= need.count && !Enchant.has(have); }
  // which pay slot holds which price (either order works)
  match() {
    const o = this.offer, a = this.pay.items[0], b = this.pay.items[1];
    if (!o || o.uses >= o.max) return null;
    const F = MerchantScreen.fits;
    if (o.buy2) {
      if (F(a, o.buy) && F(b, o.buy2)) return [0, 1];
      if (F(b, o.buy) && F(a, o.buy2)) return [1, 0];
      return null;
    }
    if (F(a, o.buy)) return [0, -1];
    if (F(b, o.buy)) return [1, -1];
    return null;
  }
  updateResult() {
    const m = this.match();
    this.out.items[0] = m ? this.offer.sell.copy() : null;
  }
  takeOutput(s, shift) {
    const g = this.game;
    for (let guard = 0; guard < 64; guard++) {
      const got = this.out.items[0], m = this.match();
      if (!got || !m) break;
      if (shift) {
        if (!g.player.inventory.canFit(got)) break;
        g.player.inventory.add(got.copy());
      } else {
        const cur = this.cursor;
        if (cur && (!cur.canStackWith(got) || cur.count + got.count > maxStackOf(got.id))) break;
        if (cur) cur.count += got.count; else this.cursor = got.copy();
      }
      const o = this.offer;
      const take = (slot, need) => { const st = this.pay.items[slot]; st.count -= need.count; if (st.count <= 0) this.pay.items[slot] = null; };
      take(m[0], o.buy);
      if (m[1] >= 0) take(m[1], o.buy2);
      g.player.stats.trades = (g.player.stats.trades || 0) + 1;
      g.achieve('trade');
      this.v.traded(g, o);
      this.pay.changed();
      if (!shift) break;
    }
    this.updateResult();
  }
  quickTargets(s, st) {
    if (s.group === 'main' || s.group === 'hotbar') return { slots: this.slots.filter((x) => x.group === 'pay') };
    return { slots: this.slots.filter((x) => x.group === 'hotbar' || x.group === 'main'), reverse: true };
  }
  drawForeground(gui, mx, my) {
    const ctx = gui.ctx, o = this.offer;
    gui.textCentered(this.v.title, this.left + 88, this.top + 6, '#404040', false);
    this.label(gui, 'Inventory', 8, 72);
    drawArrow(gui, this.left + 86, this.top + 52, 0);
    this.hoverTip = null;
    if (!o) return;
    // the offer: what it costs and what you get
    const show = (st, x, y) => {
      if (!st) return;
      gui.item(st, this.left + x, this.top + y, { showOne: false });
      if (mx >= this.left + x && my >= this.top + y && mx < this.left + x + 16 && my < this.top + y + 16) this.hoverTip = [this.tooltipFor(st), mx, my];
    };
    show(o.buy, 36, 24);
    show(o.buy2, 62, 24);
    show(o.sell, 120, 24);
    drawArrow(gui, this.left + 86, this.top + 23, 0);
    if (o.uses >= o.max) {
      // sold out: a red cross over the arrow
      ctx.fillStyle = '#c82020';
      for (let i = 0; i < 12; i++) { ctx.fillRect(this.left + 89 + i, this.top + 22 + i, 2, 2); ctx.fillRect(this.left + 100 - i, this.top + 22 + i, 2, 2); }
      if (mx >= this.left + 83 && my >= this.top + 20 && mx < this.left + 110 && my < this.top + 40) this.hoverTip = [['§cThis trade is used up for now'], mx, my];
    }
    gui.textRight((this.idx + 1) + '/' + this.offers.length, this.left + 168, this.top + 6, '#606060', false);
  }
  draw(gui, mx, my) {
    super.draw(gui, mx, my);
    if (this.hoverTip && !this.cursor) gui.tooltip(this.hoverTip[0], this.hoverTip[1], this.hoverTip[2]);
  }
  tick() {
    const v = this.v;
    if (v.dead || v.removed || this.player.distanceSq(v.x, v.y, v.z) > 64) this.game.closeScreen();
  }
  onClose() {
    super.onClose();
    for (let i = 0; i < 2; i++) if (this.pay.items[i]) { this.game.giveItem(this.pay.items[i]); this.pay.items[i] = null; }
    this.v.customer = null;
  }
}
