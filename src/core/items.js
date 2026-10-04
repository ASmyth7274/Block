'use strict';
// ---------------------------------------------------------------------------
// Item registry. IDs < 256 are block items, IDs >= 256 are items.
// Append-only list keeps saved worlds compatible.
// ---------------------------------------------------------------------------

const ITEMS = new Array(1024);
const ITEM_IDS = {};

const TOOL_MATS = {
  wood:      { name: 'Wooden',    level: 0, speed: 2,   dur: 59,   attack: 0, color: 'wood' },
  stone:     { name: 'Stone',     level: 1, speed: 4,   dur: 131,  attack: 1, color: 'stone' },
  iron:      { name: 'Iron',      level: 2, speed: 6,   dur: 250,  attack: 2, color: 'iron' },
  gold:      { name: 'Golden',    level: 0, speed: 12,  dur: 32,   attack: 0, color: 'gold' },
  cobalt:    { name: 'Cobalt',    level: 3, speed: 7.5, dur: 520,  attack: 2, color: 'cobalt' },
  diamond:   { name: 'Diamond',   level: 3, speed: 8,   dur: 1561, attack: 3, color: 'diamond' },
  starmetal: { name: 'Starmetal', level: 4, speed: 10,  dur: 2800, attack: 4, color: 'starmetal' },
};
const TOOL_KINDS = { pickaxe: 'Pickaxe', axe: 'Axe', shovel: 'Shovel', hoe: 'Hoe', sword: 'Sword' };
const TOOL_BASE_ATTACK = { sword: 4, axe: 3, pickaxe: 2, shovel: 1, hoe: 1 };

const ARMOR_MATS = {
  leather:   { name: 'Leather',   points: [1, 3, 2, 1], mult: 5 },
  iron:      { name: 'Iron',      points: [2, 6, 5, 2], mult: 15 },
  gold:      { name: 'Golden',    points: [2, 5, 3, 1], mult: 7 },
  cobalt:    { name: 'Cobalt',    points: [2, 7, 5, 2], mult: 22 },
  diamond:   { name: 'Diamond',   points: [3, 8, 6, 3], mult: 33 },
  starmetal: { name: 'Starmetal', points: [4, 8, 7, 3], mult: 45 },
};
const ARMOR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'];
const ARMOR_SLOT_NAMES = ['Helmet', 'Chestplate', 'Leggings', 'Boots'];
const ARMOR_BASE_DUR = [11, 16, 15, 13];

let _nextItemId = 256;
function defItem(key, props) {
  const id = _nextItemId++;
  const d = Object.assign({ id, key, name: key, tex: key, maxStack: 64, maxDamage: 0 }, props);
  if (d.maxDamage > 0) d.maxStack = 1;
  if (typeof d.name === 'string') { const nm = d.name; d.nameFn = () => nm; } else d.nameFn = d.name;
  ITEMS[id] = d;
  ITEM_IDS[key] = id;
  return d;
}

// ---- tools (order matters: append-only) ----
for (const mat of ['wood', 'stone', 'iron', 'gold', 'diamond']) {
  for (const kind of ['shovel', 'pickaxe', 'axe', 'sword', 'hoe']) {
    const m = TOOL_MATS[mat];
    defItem(mat + '_' + kind, {
      name: m.name + ' ' + TOOL_KINDS[kind], tex: kind + '_' + mat, maxDamage: m.dur,
      tool: { kind, mat, level: m.level, speed: m.speed, attack: kind === 'hoe' ? 1 : TOOL_BASE_ATTACK[kind] + m.attack },
      handheld: true,
    });
  }
}
defItem('stick', { name: 'Stick', fuel: 100, handheld: true });
defItem('coal', { name: (d) => d === 1 ? 'Charcoal' : 'Coal', tex: (d) => d === 1 ? 'charcoal' : 'coal', fuel: 1600, variants: [0, 1] });
defItem('diamond', { name: 'Diamond' });
defItem('iron_ingot', { name: 'Iron Ingot' });
defItem('gold_ingot', { name: 'Gold Ingot' });
defItem('gold_nugget', { name: 'Gold Nugget' });
defItem('string', { name: 'String', places: () => null });
defItem('feather', { name: 'Feather' });
defItem('gunpowder', { name: 'Gunpowder' });
defItem('flint', { name: 'Flint' });
defItem('leather', { name: 'Leather' });
defItem('bone', { name: 'Bone', handheld: true });
defItem('dye', {
  name: (d) => d === 0 ? 'Bone Meal' : d === 11 ? 'Lapis Lazuli' : d === 15 ? 'Ink Dye' : COLOR_NAMES[d & 15] + ' Dye',
  tex: (d) => d === 0 ? 'bone_meal' : d === 11 ? 'lapis' : 'dye_' + COLORS[d & 15], variants: [...Array(16).keys()],
});
defItem('wheat', { name: 'Wheat', tex: 'item_wheat' });
defItem('seeds', { name: 'Seeds', tex: 'seeds', plant: { block: 45, on: [46] } });
defItem('sugar', { name: 'Sugar' });
defItem('paper', { name: 'Paper' });
defItem('book', { name: 'Book' });
defItem('clay_ball', { name: 'Clay' });
defItem('brick', { name: 'Brick', tex: 'item_brick' });
defItem('slimeball', { name: 'Slimeball' });
defItem('egg', { name: 'Egg', maxStack: 16, throwable: 'egg' });
defItem('snowball', { name: 'Snowball', maxStack: 16, throwable: 'snowball' });
defItem('bowl', { name: 'Bowl', fuel: 100 });
defItem('sugar_cane', { name: 'Sugar Canes', tex: 'item_sugar_cane', plant: { block: 59, on: [2, 3, 10, 73, 59] } });
defItem('melon_slice', { name: 'Melon', food: { hunger: 2, sat: 1.2 } });
defItem('bucket', { name: 'Bucket', maxStack: 16 });
defItem('water_bucket', { name: 'Water Bucket', maxStack: 1, container: 'bucket' });
defItem('lava_bucket', { name: 'Lava Bucket', maxStack: 1, fuel: 20000, container: 'bucket' });
defItem('milk_bucket', { name: 'Milk', maxStack: 1, container: 'bucket', drink: true });
defItem('flint_and_steel', { name: 'Flint and Steel', maxDamage: 64 });
defItem('shears', { name: 'Shears', maxDamage: 238, tool: { kind: 'shears', level: 0, speed: 1.5, attack: 1 } });
defItem('bow', { name: 'Bow', maxDamage: 384, handheld: true });
defItem('arrow', { name: 'Arrow' });
defItem('compass', { name: 'Compass', maxStack: 1 });
defItem('clock', { name: 'Clock', maxStack: 1 });
// ---- food ----
defItem('apple', { name: 'Apple', food: { hunger: 4, sat: 2.4 } });
defItem('golden_apple', { name: 'Golden Apple', food: { hunger: 4, sat: 9.6, always: true, regen: 1 }, rare: true });
defItem('bread', { name: 'Bread', food: { hunger: 5, sat: 6 } });
defItem('porkchop', { name: 'Raw Porkchop', food: { hunger: 3, sat: 1.8 } });
defItem('cooked_porkchop', { name: 'Cooked Porkchop', food: { hunger: 8, sat: 12.8 } });
defItem('beef', { name: 'Raw Beef', food: { hunger: 3, sat: 1.8 } });
defItem('steak', { name: 'Steak', food: { hunger: 8, sat: 12.8 } });
defItem('chicken', { name: 'Raw Chicken', food: { hunger: 2, sat: 1.2, hungerChance: 0.3 } });
defItem('cooked_chicken', { name: 'Cooked Chicken', food: { hunger: 6, sat: 7.2 } });
defItem('mutton', { name: 'Raw Mutton', food: { hunger: 2, sat: 1.2 } });
defItem('cooked_mutton', { name: 'Cooked Mutton', food: { hunger: 6, sat: 9.6 } });
defItem('fish', { name: 'Raw Fish', food: { hunger: 2, sat: 0.4 } });
defItem('cooked_fish', { name: 'Cooked Fish', food: { hunger: 5, sat: 6 } });
defItem('carrot', { name: 'Carrot', tex: 'item_carrot', food: { hunger: 3, sat: 3.6 }, plant: { block: 75, on: [46] } });
defItem('potato', { name: 'Potato', tex: 'item_potato', food: { hunger: 1, sat: 0.6 }, plant: { block: 76, on: [46] } });
defItem('baked_potato', { name: 'Baked Potato', food: { hunger: 5, sat: 6 } });
defItem('poison_potato', { name: 'Poisonous Potato', food: { hunger: 2, sat: 1.2, poisonChance: 0.6 } });
defItem('cookie', { name: 'Cookie', food: { hunger: 2, sat: 0.4 } });
defItem('mushroom_stew', { name: 'Mushroom Stew', maxStack: 1, food: { hunger: 6, sat: 7.2 }, container: 'bowl' });
defItem('rotten_flesh', { name: 'Rotten Flesh', food: { hunger: 4, sat: 0.8, hungerChance: 0.8 } });
defItem('spider_eye', { name: 'Spider Eye', food: { hunger: 2, sat: 3.2, poisonChance: 1 } });
defItem('pumpkin_pie', { name: 'Pumpkin Pie', food: { hunger: 8, sat: 4.8 } });
// ---- armor ----
for (const mat of ['leather', 'iron', 'gold', 'diamond']) {
  for (let s = 0; s < 4; s++) {
    const m = ARMOR_MATS[mat];
    defItem(mat + '_' + ARMOR_SLOTS[s], {
      name: (mat === 'leather' ? ['Leather Cap', 'Leather Tunic', 'Leather Pants', 'Leather Boots'][s] : m.name + ' ' + ARMOR_SLOT_NAMES[s]),
      tex: ARMOR_SLOTS[s] + '_' + mat, maxDamage: ARMOR_BASE_DUR[s] * m.mult, armor: { slot: s, points: m.points[s], mat },
    });
  }
}
// ---- placeables ----
defItem('door_wood', { name: 'Wooden Door', tex: 'item_door_wood', places: 'door', block: 49 });
defItem('door_iron', { name: 'Iron Door', tex: 'item_door_iron', places: 'door', block: 51 });
defItem('bed', { name: 'Bed', tex: 'item_bed', maxStack: 1, places: 'bed', block: 22 });
// ---- Blocklands originals ----
defItem('ember_dust', { name: 'Ember Dust', fuel: 800 });
defItem('jade', { name: 'Jade' });
defItem('cobalt_ingot', { name: 'Cobalt Ingot' });
defItem('sulfur', { name: 'Sulfur' });
defItem('starmetal_ingot', { name: 'Starmetal Ingot', rare: true });
defItem('lumite_shard', { name: 'Lumite Shard' });
defItem('salt', { name: 'Salt' });
defItem('berries', { name: 'Brambleberries', food: { hunger: 2, sat: 1.2 }, plant: { block: 105, on: [2, 3, 73] } });
defItem('venison', { name: 'Raw Venison', food: { hunger: 3, sat: 1.8 } });
defItem('cooked_venison', { name: 'Cooked Venison', food: { hunger: 7, sat: 11.2 } });
defItem('jerky', { name: 'Salted Jerky', food: { hunger: 6, sat: 8 } });
defItem('berry_pie', { name: 'Bramble Pie', food: { hunger: 7, sat: 6 } });
defItem('prospector_rod', { name: "Prospector's Rod", maxDamage: 64, rare: true });
defItem('wayfinder', { name: 'Wayfinder', maxStack: 1, rare: true });
defItem('wisp_essence', { name: 'Wisp Essence', rare: true });
defItem('cattail_fiber', { name: 'Cattail Fiber' });
for (const mat of ['cobalt', 'starmetal']) {
  for (const kind of ['shovel', 'pickaxe', 'axe', 'sword', 'hoe']) {
    const m = TOOL_MATS[mat];
    defItem(mat + '_' + kind, {
      name: m.name + ' ' + TOOL_KINDS[kind], tex: kind + '_' + mat, maxDamage: m.dur, rare: mat === 'starmetal',
      tool: { kind, mat, level: m.level, speed: m.speed, attack: kind === 'hoe' ? 1 : TOOL_BASE_ATTACK[kind] + m.attack },
      handheld: true,
    });
  }
  for (let s = 0; s < 4; s++) {
    const m = ARMOR_MATS[mat];
    defItem(mat + '_' + ARMOR_SLOTS[s], {
      name: m.name + ' ' + ARMOR_SLOT_NAMES[s], tex: ARMOR_SLOTS[s] + '_' + mat, maxDamage: ARMOR_BASE_DUR[s] * m.mult,
      armor: { slot: s, points: m.points[s], mat }, rare: mat === 'starmetal',
    });
  }
}
defItem('spawn_egg', {
  name: (d) => 'Spawn ' + ((typeof MOB_TYPES !== 'undefined' && MOB_TYPES[d]) ? MOB_TYPES[d].name : 'Creature'),
  tex: 'spawn_egg', tintFn: (d) => (typeof MOB_TYPES !== 'undefined' && MOB_TYPES[d]) ? MOB_TYPES[d].egg : ['#888888', '#444444'],
});
defItem('glow_berries', { name: 'Glowcap Stew', maxStack: 1, food: { hunger: 6, sat: 7.2, nightVision: 1 }, container: 'bowl', tex: 'glowcap_stew' });
defItem('journal', { name: "Explorer's Journal", maxStack: 1 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isBlockItem(id) { return id > 0 && id < 256; }
function itemDef(id) { return id < 256 ? null : ITEMS[id]; }
function itemExists(id) { return id < 256 ? !!BLOCKS[id] && id !== 0 : !!ITEMS[id]; }
function itemName(id, dmg) {
  if (id < 256) { const b = BLOCKS[id]; return b ? b.nameFn(dmg | 0) : 'Unknown'; }
  const d = ITEMS[id]; return d ? d.nameFn(dmg | 0) : 'Unknown';
}
function maxStackOf(id) { if (id < 256) return 64; const d = ITEMS[id]; return d ? d.maxStack : 64; }
function maxDamageOf(id) { if (id < 256) return 0; const d = ITEMS[id]; return d ? d.maxDamage : 0; }
function toolOf(id) { if (id < 256) return null; const d = ITEMS[id]; return d ? d.tool || null : null; }
function foodOf(id) { if (id < 256) return null; const d = ITEMS[id]; return d ? d.food || null : null; }
function armorOf(id) { if (id < 256) return null; const d = ITEMS[id]; return d ? d.armor || null : null; }
function isRare(id) { if (id < 256) return id === B.STARMETAL_BLOCK || id === B.RUNESTONE; const d = ITEMS[id]; return d ? !!d.rare : false; }
function fuelValue(id, dmg) {
  if (id < 256) {
    const b = BLOCKS[id]; if (!b) return 0;
    if (id === B.COAL_BLOCK) return 16000;
    if (id === B.PEAT) return 2400;
    if (id === B.SAPLING) return 100;
    if (b.sound === 'wood' && b.flammable) return 300;
    if (id === B.LOG || id === B.PLANKS || id === B.FENCE || id === B.CRAFTING_TABLE || id === B.BOOKSHELF || id === B.CHEST || id === B.TRAPDOOR) return 300;
    if (id === B.SLAB && (dmg & 31) <= 5) return 150;
    if (id === B.STAIRS && (dmg & 31) <= 5) return 300;
    if (id === B.HAY_BALE || id === B.THATCH) return 200;
    return 0;
  }
  const d = ITEMS[id]; if (!d) return 0;
  if (d.fuel) return d.fuel;
  if (d.tool && d.tool.mat === 'wood') return 200;
  return 0;
}

class ItemStack {
  constructor(id, count, dmg) { this.id = id | 0; this.count = count === undefined ? 1 : count | 0; this.dmg = dmg | 0; }
  copy() { const s = new ItemStack(this.id, this.count, this.dmg); if (this.tag) s.tag = JSON.parse(JSON.stringify(this.tag)); return s; }
  static of(id, count, dmg) { return new ItemStack(id, count, dmg); }
  get maxStack() { return maxStackOf(this.id); }
  get name() { return (this.tag && this.tag.name) || itemName(this.id, this.dmg); }
  isEmpty() { return this.count <= 0 || this.id === 0; }
  sameItem(o) { return o && o.id === this.id && (maxDamageOf(this.id) > 0 || o.dmg === this.dmg) && !this.tag && !o.tag; }
  canStackWith(o) { return o && o.id === this.id && o.dmg === this.dmg && maxDamageOf(this.id) === 0 && !this.tag && !o.tag; }
  toJSON() { const o = { id: this.id, c: this.count, d: this.dmg }; if (this.tag) o.t = this.tag; return o; }
  static fromJSON(o) { if (!o) return null; const s = new ItemStack(o.id, o.c, o.d); if (o.t) s.tag = o.t; return itemExists(s.id) ? s : null; }
}

// Map a block meta to the item damage used for drops / pick-block
function blockItemDamage(id, meta) {
  const d = BLOCKS[id]; if (!d) return 0;
  if (id === B.STAIRS) return (meta >> 3) & 31;
  if (id === B.SLAB) return meta & 31;
  return meta & d.itemMetaMask;
}
// Block id that a given item should be treated as when "picked" (e.g. wheat crops -> seeds)
function pickBlockItem(id, meta) {
  switch (id) {
    case B.WHEAT: return [ITEM_IDS.seeds, 0];
    case B.CARROTS: return [ITEM_IDS.carrot, 0];
    case B.POTATOES: return [ITEM_IDS.potato, 0];
    case B.SUGAR_CANE: return [ITEM_IDS.sugar_cane, 0];
    case B.DOOR_WOOD: return [ITEM_IDS.door_wood, 0];
    case B.DOOR_IRON: return [ITEM_IDS.door_iron, 0];
    case B.BED: return [ITEM_IDS.bed, 0];
    case B.FURNACE_LIT: return [B.FURNACE, 0];
    case B.EMBER_ORE_LIT: return [B.EMBER_ORE, 0];
    case B.DOUBLE_SLAB: return [B.SLAB, meta & 31];
    case B.FARMLAND: case B.GRASS: return [id, 0];
    case B.WATER: return [ITEM_IDS.water_bucket, 0];
    case B.LAVA: return [ITEM_IDS.lava_bucket, 0];
    case B.FIRE: return null;
  }
  return [id, blockItemDamage(id, meta)];
}
