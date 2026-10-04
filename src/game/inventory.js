'use strict';
// ---------------------------------------------------------------------------
// Inventories & slots
// ---------------------------------------------------------------------------
class Inventory {
  constructor(size, items) { this.items = items || new Array(size).fill(null); this.size = this.items.length; this.listeners = []; }
  get(i) { return this.items[i]; }
  set(i, s) { this.items[i] = (s && s.count > 0) ? s : null; this.changed(); }
  changed() { for (const l of this.listeners) l(this); }
  clear() { this.items.fill(null); this.changed(); }
  // try to insert a stack; returns the number of items that did NOT fit
  add(stack, order) {
    if (!stack || stack.count <= 0) return 0;
    let left = stack.count;
    const max = maxStackOf(stack.id);
    const idx = order || [...Array(this.size).keys()];
    if (max > 1) {
      for (const i of idx) {
        const s = this.items[i];
        if (s && s.canStackWith(stack) && s.count < max) {
          const n = Math.min(left, max - s.count);
          s.count += n; left -= n;
          if (left <= 0) break;
        }
      }
    }
    if (left > 0) for (const i of idx) {
      if (!this.items[i]) {
        const n = Math.min(left, max);
        const ns = stack.copy(); ns.count = n;
        this.items[i] = ns; left -= n;
        if (left <= 0) break;
      }
    }
    this.changed();
    return left;
  }
  count(id, dmg) {
    let n = 0;
    for (const s of this.items) if (s && s.id === id && (dmg === undefined || dmg < 0 || s.dmg === dmg)) n += s.count;
    return n;
  }
  removeItems(id, dmg, n) {
    for (let i = 0; i < this.size && n > 0; i++) {
      const s = this.items[i];
      if (s && s.id === id && (dmg === undefined || dmg < 0 || s.dmg === dmg)) {
        const k = Math.min(n, s.count);
        s.count -= k; n -= k;
        if (s.count <= 0) this.items[i] = null;
      }
    }
    this.changed();
    return n === 0;
  }
  toJSON() { return this.items.map((s) => s ? s.toJSON() : null); }
  load(arr) { if (!arr) return; for (let i = 0; i < this.size; i++) this.items[i] = arr[i] ? ItemStack.fromJSON(arr[i]) : null; this.changed(); }
}

class PlayerInventory {
  constructor() {
    this.main = new Inventory(36);      // 0-8 hotbar
    this.armor = new Inventory(4);      // helmet, chest, legs, boots
    this.offhand = new Inventory(1);
    this.selected = 0;
  }
  held() { return this.main.items[this.selected]; }
  setHeld(s) { this.main.set(this.selected, s); }
  offhandItem() { return this.offhand.items[0]; }
  // pick-up order: hotbar first, then the rest
  add(stack) {
    const order = [...Array(36).keys()];
    return this.main.add(stack, order);
  }
  canFit(stack) {
    let left = stack.count;
    const max = maxStackOf(stack.id);
    for (const s of this.main.items) {
      if (!s) left -= max; else if (s.canStackWith(stack)) left -= max - s.count;
      if (left <= 0) return true;
    }
    return left <= 0;
  }
  decrementHeld(n) {
    const s = this.held(); if (!s) return;
    s.count -= n || 1;
    if (s.count <= 0) this.main.items[this.selected] = null;
    this.main.changed();
  }
  damageHeld(player, amount) {
    const s = this.held();
    if (!s) return;
    const md = maxDamageOf(s.id);
    if (md <= 0) return;
    s.dmg += amount || 1;
    if (s.dmg >= md) { this.main.items[this.selected] = null; if (player.onToolBreak) player.onToolBreak(s); }
    this.main.changed();
  }
  findSlot(id, dmg) { for (let i = 0; i < 36; i++) { const s = this.main.items[i]; if (s && s.id === id && (dmg === undefined || s.dmg === dmg)) return i; } return -1; }
  toJSON() { return { main: this.main.toJSON(), armor: this.armor.toJSON(), offhand: this.offhand.toJSON(), selected: this.selected }; }
  load(d) { if (!d) return; this.main.load(d.main); this.armor.load(d.armor); this.offhand.load(d.offhand); this.selected = d.selected | 0; }
  dropAll() {
    const out = [];
    for (const inv of [this.main, this.armor, this.offhand]) { for (let i = 0; i < inv.size; i++) if (inv.items[i]) { out.push(inv.items[i]); inv.items[i] = null; } inv.changed(); }
    return out;
  }
}

class Slot {
  constructor(inv, index, x, y, opts) {
    this.inv = inv; this.index = index; this.x = x; this.y = y;
    opts = opts || {};
    this.filter = opts.filter || null;
    this.output = !!opts.output;
    this.maxStack = opts.maxStack || 64;
    this.group = opts.group || 'main';
    this.icon = opts.icon || null;       // background hint sprite (armour slots)
    this.onTake = opts.onTake || null;
  }
  get stack() { return this.inv.get(this.index); }
  set stack(s) { this.inv.set(this.index, s); }
  accepts(s) { return !this.output && (!this.filter || this.filter(s)); }
  limit(s) { return Math.min(this.maxStack, maxStackOf(s.id)); }
}
