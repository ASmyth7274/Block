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
  name: (d) => d === 0 ? 'Bone Meal' : d === 11 ? 'Lapis Lazuli' : d === 15 ? 'Ink Sac' : COLOR_NAMES[d & 15] + ' Dye',
  tex: (d) => d === 0 ? 'bone_meal' : d === 11 ? 'lapis' : d === 15 ? 'ink_sac' : 'dye_' + COLORS[d & 15], variants: [...Array(16).keys()],
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
defItem('ember_dust', { name: 'Ember Dust', fuel: 800, places: 'wire' });
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
  tex: 'spawn_egg', tintFn: (d) => (typeof MOB_TYPES !== 'undefined' && MOB_TYPES[d] && MOB_TYPES[d].egg) ? MOB_TYPES[d].egg : (typeof MOB_TYPES !== 'undefined' && MOB_TYPES[d] ? ['#16161a', '#e8e8e8'] : ['#888888', '#444444']),
});
defItem('glow_berries', { name: 'Glowcap Stew', maxStack: 1, food: { hunger: 6, sat: 7.2, nightVision: 1 }, container: 'bowl', tex: 'glowcap_stew' });
defItem('journal', { name: "Explorer's Journal", maxStack: 1 });
defItem('map', { name: "Explorer's Map", maxStack: 1 });
// ---- waterways: fishing, boats, signs and paintings ----
const FISHING = { cast: false };
defItem('fishing_rod', { name: 'Fishing Rod', maxDamage: 64, handheld: true, rotateAround: true, tex: () => FISHING.cast ? 'fishing_rod_cast' : 'fishing_rod' });
defItem('salmon', { name: 'Raw Salmon', food: { hunger: 2, sat: 0.4 } });
defItem('cooked_salmon', { name: 'Cooked Salmon', food: { hunger: 6, sat: 9.6 } });
defItem('sunfish', { name: 'Sunfish', food: { hunger: 1, sat: 0.2 } });
defItem('pufferfish', { name: 'Pufferfish', food: { hunger: 1, sat: 0.2, poisonChance: 1, poisonTicks: 300, hungerChance: 1, hungerTicks: 300 } });
defItem('glimmerfin', { name: 'Glimmerfin', food: { hunger: 2, sat: 0.4, nightVision: 900 } });
defItem('message_bottle', { name: 'Message in a Bottle', maxStack: 1, rare: true });
defItem('boat', { name: (d) => (WOOD_NAMES[d] || 'Oak') + ' Boat', tex: (d) => 'boat_' + (WOOD[d] || 'oak'), maxStack: 1, variants: [0, 1, 2, 3, 4, 5, 6] });
defItem('sign', { name: (d) => (WOOD_NAMES[d] || 'Oak') + ' Sign', tex: (d) => 'sign_' + (WOOD[d] || 'oak'), maxStack: 16, variants: [0, 1, 2, 3, 4, 5, 6], fuel: 200, places: 'sign' });
defItem('painting', { name: 'Painting' });
defItem('relay', { name: 'Ember Relay', tex: 'item_relay', places: 'relay' });
defItem('minecart', { name: 'Minecart', maxStack: 1 });
defItem('chest_minecart', { name: 'Minecart with Chest', maxStack: 1 });
// ---- the Underworld ----
defItem('sunstone_dust', { name: 'Sunstone Dust' });
defItem('smoky_quartz', { name: 'Smoky Quartz' });
defItem('brimstone_brick', { name: 'Brimstone Brick' });
defItem('wailer_tear', { name: 'Wailer Tear', rare: true });
defItem('flare_rod', { name: 'Flare Rod', handheld: true, fuel: 2400 });
defItem('flare_powder', { name: 'Flare Powder' });
defItem('magma_cream', { name: 'Magma Cream' });
defItem('bloodcap', { name: 'Bloodcap', tex: 'item_bloodcap', plant: { block: 144, on: [138] } });
defItem('fire_charge', { name: 'Fire Charge' });
// ---- brewing ----
// potion damage: bits 0-5 the brew, 64 = stronger (II), 128 = longer
const POTIONS = [
  { key: 'water', name: 'Water Bottle', color: '#385dc6' },
  { key: 'awkward', name: 'Awkward Potion', color: '#385dc6' },
  { key: 'mundane', name: 'Mundane Potion', color: '#385dc6' },
  { key: 'thick', name: 'Thick Potion', color: '#385dc6' },
  { key: 'swiftness', name: 'Swiftness', effect: 'speed', dur: 3600, color: '#7cafc6', strong: true },
  { key: 'slowness', name: 'Slowness', effect: 'slow', dur: 1800, color: '#5a6c81', bad: true },
  { key: 'strength', name: 'Strength', effect: 'strength', dur: 3600, color: '#932423', strong: true },
  { key: 'weakness', name: 'Weakness', effect: 'weakness', dur: 1800, color: '#484d48', bad: true },
  { key: 'healing', name: 'Healing', effect: 'heal', instant: true, color: '#f82423', strong: true },
  { key: 'harming', name: 'Harming', effect: 'harm', instant: true, color: '#430a09', bad: true, strong: true },
  { key: 'regeneration', name: 'Regeneration', effect: 'regen', dur: 900, color: '#cd5cab', strong: true },
  { key: 'poison', name: 'Poison', effect: 'poison', dur: 900, color: '#4e9331', bad: true, strong: true },
  { key: 'fire_resistance', name: 'Fire Resistance', effect: 'fireRes', dur: 3600, color: '#e49a3a' },
  { key: 'night_vision', name: 'Night Vision', effect: 'nightVision', dur: 3600, color: '#1f1fa1' },
  { key: 'invisibility', name: 'Invisibility', effect: 'invisible', dur: 3600, color: '#7f8392' },
  { key: 'water_breathing', name: 'Water Breathing', effect: 'waterBreathing', dur: 3600, color: '#2e5299' },
  { key: 'leaping', name: 'Leaping', effect: 'jump', dur: 3600, color: '#22ff4c', strong: true },
  { key: 'featherfall', name: 'Featherfall', effect: 'featherfall', dur: 1800, color: '#e4dcff' },
];
const EFFECTS = {
  speed: { name: 'Speed', color: '#7cafc6' }, slow: { name: 'Slowness', color: '#5a6c81', bad: true }, strength: { name: 'Strength', color: '#932423' },
  weakness: { name: 'Weakness', color: '#484d48', bad: true }, regen: { name: 'Regeneration', color: '#cd5cab' }, poison: { name: 'Poison', color: '#4e9331', bad: true },
  fireRes: { name: 'Fire Resistance', color: '#e49a3a' }, nightVision: { name: 'Night Vision', color: '#1f1fa1' }, invisible: { name: 'Invisibility', color: '#7f8392' },
  waterBreathing: { name: 'Water Breathing', color: '#2e5299' }, jump: { name: 'Jump Boost', color: '#22ff4c' }, hunger: { name: 'Hunger', color: '#587653', bad: true },
  haste: { name: 'Haste', color: '#d9c043' }, darkness: { name: 'Darkness', color: '#292721', bad: true },
  featherfall: { name: 'Featherfall', color: '#e4dcff' }, drift: { name: 'Drift', color: '#b48cff', bad: true },
};
function potionOf(d) { return POTIONS[d & 63] || POTIONS[0]; }
function potionName(d, splash) {
  const p = potionOf(d);
  if (!p.effect) return (splash ? 'Splash ' : '') + p.name;
  return (splash ? 'Splash ' : '') + 'Potion of ' + p.name + ((d & 64) ? ' II' : '');
}
function potionDuration(d) { const p = potionOf(d); if (!p.dur) return 0; let t = p.dur; if (d & 128) t = Math.round(t * 8 / 3); if (d & 64) t = Math.round(t / 2); return t; }
const POTION_VARIANTS = (() => {
  const out = [];
  POTIONS.forEach((p, i) => { out.push(i); if (p.effect && p.strong) out.push(i | 64); if (p.effect && !p.instant) out.push(i | 128); });
  return out;
})();
defItem('glass_bottle', { name: 'Glass Bottle' });
defItem('potion', { name: (d) => potionName(d, false), tex: (d) => 'potion_' + potionOf(d).key, maxStack: 1, drink: true, potion: true, container: 'glass_bottle', variants: POTION_VARIANTS });
defItem('splash_potion', { name: (d) => potionName(d, true), tex: (d) => 'splash_' + potionOf(d).key, maxStack: 1, potion: true, splash: true, variants: POTION_VARIANTS });
defItem('fermented_spider_eye', { name: 'Fermented Spider Eye' });
defItem('glistering_melon', { name: 'Glistering Melon' });
// ---- the Vaults ----
defItem('seeker_eye', { name: "Seeker's Eye", rare: true });
defItem('star_crystal', { name: 'Star Crystal', rare: true });
defItem('glowberry', { name: 'Glow Berries', food: { hunger: 2, sat: 0.4 } });
defItem('hush_shard', { name: 'Hush Shard', rare: true });
defItem('echo_heart', { name: 'Echo Heart', rare: true, maxStack: 1 });
// ---- the Sift ----
// letters that went astray and ended up in the Sift (the damage value says which)
defItem('lost_letter', { name: 'Lost Letter', maxStack: 1 });
// points the way back to where you last fell
defItem('wayback_compass', { name: 'Wayback Compass', maxStack: 1, rare: true });
defItem('sift_scale', { name: 'Sifter Scale' });
// scaled boots that make no sound at all: nothing hears you walk
defItem('silent_boots', { name: 'Silent Boots', tex: 'silent_boots', maxDamage: 13 * 9, armor: { slot: 3, points: 1, mat: 'leather' }, silent: true, rare: true });
// strike it and its note rings out wherever you point: a way to lead the Listener astray
defItem('echo_fork', { name: 'Echo Fork', maxDamage: 48, handheld: true });
// ---- the Starwyrm's isle ----  (items are numbered in the order they are defined: always add new ones at the end)
// a shard of a fallen star, still warm: the Starwyrm calls them down from the sky
defItem('star_fragment', { name: 'Star Fragment', rare: true });
// ---- the Drift Isles ----
// a pale fruit of the glimmerwood: one bite and you fall like a feather for a while
defItem('starfruit', { name: 'Starfruit', food: { hunger: 4, sat: 4.8, featherfall: 600 } });
// silk and starmetal ribs, worn on the back: jump as you fall and it opens, and you glide
defItem('drift_glider', { name: 'Drift Glider', maxDamage: 432, armor: { slot: 1, points: 0, mat: 'glider' }, glider: true, rare: true });
// what is left of an orrery sentinel: a brass gear still turning slowly by itself
defItem('orrery_gear', { name: 'Orrery Gear' });
// ---- farming ----
defItem('melon_seeds', { name: 'Melon Seeds', plant: { block: 177, on: [46] } });
defItem('pumpkin_seeds', { name: 'Pumpkin Seeds', plant: { block: 178, on: [46] } });
defItem('gauge', { name: 'Ember Gauge', tex: 'item_gauge', places: 'gauge' });

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
  // saved by name as well as number, so items defined later can never shift what a save holds
  toJSON() { const o = { id: this.id, c: this.count, d: this.dmg }; if (this.id >= 256 && ITEMS[this.id]) o.k = ITEMS[this.id].key; if (this.tag) o.t = this.tag; return o; }
  static fromJSON(o) {
    if (!o) return null;
    const id = o.k && ITEM_IDS[o.k] !== undefined ? ITEM_IDS[o.k] : o.id;
    const s = new ItemStack(id, o.c, o.d); if (o.t) s.tag = o.t; return itemExists(s.id) ? s : null;
  }
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
    case B.BLOODCAP: return [ITEM_IDS.bloodcap, 0];
    case B.PORTAL: return null;
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
    case B.EMBER_WIRE: return [ITEM_IDS.ember_dust, 0];
    case B.EMBER_TORCH_OFF: return [B.EMBER_TORCH, 0];
    case B.EMBER_LAMP_ON: return [B.EMBER_LAMP, 0];
    case B.RELAY: case B.RELAY_ON: return [ITEM_IDS.relay, 0];
    case B.GAUGE: return [ITEM_IDS.gauge, 0];
    case B.SIGN: return [ITEM_IDS.sign, (meta >> 4) & 7];
    case B.WALL_SIGN: return [ITEM_IDS.sign, (meta >> 2) & 7];
  }
  return [id, blockItemDamage(id, meta)];
}
