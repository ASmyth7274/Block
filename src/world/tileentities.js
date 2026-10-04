'use strict';
// ---------------------------------------------------------------------------
// Tile entities: chests, furnaces, monster spawners, signs
// ---------------------------------------------------------------------------
class TileEntity {
  constructor(type, x, y, z) { this.type = type; this.x = x; this.y = y; this.z = z; }
  save() { return { type: this.type, x: this.x, y: this.y, z: this.z }; }
  load() {}
}

class ChestTE extends TileEntity {
  constructor(x, y, z) { super('chest', x, y, z); this.items = new Array(27).fill(null); this.open = 0; this.lid = 0; this.prevLid = 0; }
  save() { return Object.assign(super.save(), { items: this.items.map((s, i) => s ? Object.assign({ slot: i }, s.toJSON()) : null).filter(Boolean), buried: this.buried || undefined }); }
  load(d) {
    if (d.items) for (const it of d.items) {
      const s = ItemStack.fromJSON(it);
      if (!s) continue;
      let slot = it.slot !== undefined ? it.slot : this.items.indexOf(null);
      if (slot < 0 || slot >= 27) continue;
      if (this.items[slot]) { slot = this.items.indexOf(null); if (slot < 0) continue; }
      this.items[slot] = s;
    }
    if (d.buried) this.buried = true;
  }
}

class FurnaceTE extends TileEntity {
  constructor(x, y, z) { super('furnace', x, y, z); this.items = [null, null, null]; this.burn = 0; this.burnMax = 0; this.cook = 0; this.xp = 0; }
  save() {
    return Object.assign(super.save(), { items: this.items.map((s) => s ? s.toJSON() : null), burn: this.burn, burnMax: this.burnMax, cook: this.cook, xp: this.xp });
  }
  load(d) {
    if (d.items) this.items = d.items.map((o) => o ? ItemStack.fromJSON(o) : null);
    while (this.items.length < 3) this.items.push(null);
    this.burn = d.burn || 0; this.burnMax = d.burnMax || 0; this.cook = d.cook || 0; this.xp = d.xp || 0;
  }
}

class SpawnerTE extends TileEntity {
  constructor(x, y, z) { super('spawner', x, y, z); this.mob = 'zombie'; this.delay = 20; this.spin = 0; this.prevSpin = 0; }
  save() { return Object.assign(super.save(), { mob: this.mob, delay: this.delay }); }
  load(d) { if (d.mob) this.mob = d.mob; this.delay = d.delay || 20; }
}

class SignTE extends TileEntity {
  constructor(x, y, z) { super('sign', x, y, z); this.lines = ['', '', '', '']; }
  save() { return Object.assign(super.save(), { lines: this.lines.slice() }); }
  load(d) { if (Array.isArray(d.lines)) for (let i = 0; i < 4; i++) this.lines[i] = String(d.lines[i] || '').slice(0, 15); }
}

function makeTileEntity(type, x, y, z) {
  switch (type) {
    case 'sign': return new SignTE(x, y, z);
    case 'chest': return new ChestTE(x, y, z);
    case 'furnace': return new FurnaceTE(x, y, z);
    case 'spawner': return new SpawnerTE(x, y, z);
  }
  return null;
}
function tileEntityFromData(d) {
  const te = makeTileEntity(d.type, d.x, d.y, d.z);
  if (te) te.load(d);
  return te;
}
