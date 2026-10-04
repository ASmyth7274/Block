'use strict';
// ---------------------------------------------------------------------------
// Block registry. Static data only; behaviours are attached in world/behaviors.js
// IDs are explicit and stable (saves depend on them). Append-only!
// ---------------------------------------------------------------------------

// Face indices (same order as the classic EnumFacing): down, up, north(-Z), south(+Z), west(-X), east(+X)
const FACE = { DOWN: 0, UP: 1, NORTH: 2, SOUTH: 3, WEST: 4, EAST: 5 };
const FACE_DIR = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
const FACE_OPP = [1, 0, 3, 2, 5, 4];
// horizontal facing 0..3 => face index
const HFACE = [FACE.NORTH, FACE.SOUTH, FACE.WEST, FACE.EAST];
const HFACE_DIR = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const HFACE_OPP = [1, 0, 3, 2];

// Render types
const R = { NONE: 0, CUBE: 1, CROSS: 2, LIQUID: 3, TORCH: 4, MODEL: 5, CROP: 6, LADDER: 7, FIRE: 8, LILY: 9, VINE: 10, CIRCUIT: 11 };

const WOOD = ['oak', 'spruce', 'birch', 'jungle', 'maple', 'redwood'];
const WOOD_NAMES = ['Oak', 'Spruce', 'Birch', 'Jungle', 'Maple', 'Redwood'];
// leaves / sapling "kinds" (tree species); wood type used by each
const LEAF_KINDS = ['oak', 'spruce', 'birch', 'jungle', 'maple', 'redwood', 'gold_maple'];
const LEAF_NAMES = ['Oak', 'Spruce', 'Birch', 'Jungle', 'Red Maple', 'Redwood', 'Golden Maple'];
const LEAF_WOOD = [0, 1, 2, 3, 4, 5, 4];

const COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
const COLOR_NAMES = ['White', 'Orange', 'Magenta', 'Light Blue', 'Yellow', 'Lime', 'Pink', 'Gray', 'Light Gray', 'Cyan', 'Purple', 'Blue', 'Brown', 'Green', 'Red', 'Black'];
const COLOR_RGB = ['#e9ecec', '#f07613', '#bd44b3', '#3aafd9', '#f8c627', '#70b919', '#ed8dac', '#3e4447', '#8e8e86', '#158991', '#792aac', '#35399d', '#724728', '#546d1b', '#a12722', '#141519'];

const FLOWERS = ['rose', 'buttercup', 'bluebell', 'daisy', 'heather', 'marigold', 'snowbell', 'fireweed'];
const FLOWER_NAMES = ['Rose', 'Buttercup', 'Bluebell', 'Daisy', 'Heather', 'Marigold', 'Snowbell', 'Fireweed'];

// Slab & stair materials
const SLAB_MATS = [
  { key: 'oak', name: 'Oak Wood', tex: 'planks_oak', tool: 'axe', hard: 2, sound: 'wood', flam: true },
  { key: 'spruce', name: 'Spruce Wood', tex: 'planks_spruce', tool: 'axe', hard: 2, sound: 'wood', flam: true },
  { key: 'birch', name: 'Birch Wood', tex: 'planks_birch', tool: 'axe', hard: 2, sound: 'wood', flam: true },
  { key: 'jungle', name: 'Jungle Wood', tex: 'planks_jungle', tool: 'axe', hard: 2, sound: 'wood', flam: true },
  { key: 'maple', name: 'Maple Wood', tex: 'planks_maple', tool: 'axe', hard: 2, sound: 'wood', flam: true },
  { key: 'redwood', name: 'Redwood', tex: 'planks_redwood', tool: 'axe', hard: 2, sound: 'wood', flam: true },
  { key: 'stone', name: 'Stone', tex: 'stone_slab_side', top: 'stone_slab_top', tool: 'pickaxe', hard: 2, sound: 'stone' },
  { key: 'cobblestone', name: 'Cobblestone', tex: 'cobblestone', tool: 'pickaxe', hard: 2, sound: 'stone' },
  { key: 'stone_brick', name: 'Stone Brick', tex: 'stone_bricks', tool: 'pickaxe', hard: 2, sound: 'stone' },
  { key: 'brick', name: 'Brick', tex: 'bricks', tool: 'pickaxe', hard: 2, sound: 'stone' },
  { key: 'sandstone', name: 'Sandstone', tex: 'sandstone_side', top: 'sandstone_top', bottom: 'sandstone_bottom', tool: 'pickaxe', hard: 2, sound: 'stone' },
  { key: 'red_sandstone', name: 'Red Sandstone', tex: 'red_sandstone_side', top: 'red_sandstone_top', bottom: 'red_sandstone_bottom', tool: 'pickaxe', hard: 2, sound: 'stone' },
  { key: 'slate_brick', name: 'Slate Brick', tex: 'slate_bricks', tool: 'pickaxe', hard: 2.5, sound: 'stone' },
  { key: 'marble_brick', name: 'Marble Brick', tex: 'marble_bricks', tool: 'pickaxe', hard: 2, sound: 'stone' },
  { key: 'basalt', name: 'Polished Basalt', tex: 'polished_basalt_side', top: 'polished_basalt_top', tool: 'pickaxe', hard: 2, sound: 'stone' },
  { key: 'mossy_cobblestone', name: 'Mossy Cobblestone', tex: 'mossy_cobblestone', tool: 'pickaxe', hard: 2, sound: 'stone' },
  { key: 'thatch', name: 'Thatch', tex: 'thatch', tool: 'hoe', hard: 0.5, sound: 'grass', flam: true },
];

// Block storage
const BLOCKS = new Array(256);
const B = { AIR: 0 };
const BLOCK_KEYS = {};

function defBlock(id, key, props) {
  const d = Object.assign({
    id, key, name: key,
    render: R.CUBE, tex: key,
    opaque: true, solid: true, cutout: false, translucent: false,
    opacity: 15, light: 0,
    hardness: 1, resistance: null, tool: null, level: 0, needsTool: false,
    sound: 'stone', tint: null, replaceable: false,
    gravity: false, flammable: 0, burnSpeed: 0,
    slip: 0.6, climbable: false,
    variants: null,       // list of item damage values (for creative / naming)
    itemMetaMask: 0,      // block meta & mask => item damage (variant part)
    itemSprite: null,     // texture name or fn(dmg) for a flat inventory icon
    collide: null,        // fn(meta, world, x,y,z) => [[x0,y0,z0,x1,y1,z1], ...] in block units
    select: null,         // fn(meta, world, x,y,z) => [x0,y0,z0,x1,y1,z1]
    model: null,          // fn(meta, nb) => list of boxes (1/16 units) for R.MODEL
    drops: null,          // fn(meta, rng, tool) => [[id, count, dmg], ...]
    xp: null,             // [min, max] experience when mined
    tileEntity: null,
    fluid: false,
  }, props);
  if (d.resistance === null) d.resistance = d.hardness * 5;
  if (typeof d.name === 'string') { const nm = d.name; d.nameFn = () => nm; } else d.nameFn = d.name;
  BLOCKS[id] = d;
  B[key.toUpperCase()] = id;
  BLOCK_KEYS[key] = id;
  return d;
}

// --- common shapes --------------------------------------------------------
const transparentBase = { opaque: false, opacity: 0 };
const plantBase = { render: R.CROSS, opaque: false, solid: false, cutout: true, opacity: 0, hardness: 0, sound: 'grass', replaceable: false };
const FULL = [0, 0, 0, 1, 1, 1];
function box16(x0, y0, z0, x1, y1, z1) { return [x0 / 16, y0 / 16, z0 / 16, x1 / 16, y1 / 16, z1 / 16]; }

defBlock(0, 'air', { name: 'Air', render: R.NONE, opaque: false, solid: false, opacity: 0, hardness: 0, replaceable: true, tex: null });

defBlock(1, 'stone', { name: 'Stone', hardness: 1.5, resistance: 30, tool: 'pickaxe', needsTool: true, drops: () => [[B.COBBLESTONE, 1, 0]] });
defBlock(2, 'grass', {
  name: 'Grass Block', tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, tint: 'grass',
  hardness: 0.6, tool: 'shovel', sound: 'grass', drops: () => [[B.DIRT, 1, 0]],
});
defBlock(3, 'dirt', {
  name: (m) => m === 1 ? 'Coarse Dirt' : 'Dirt', tex: (m) => m === 1 ? 'coarse_dirt' : 'dirt',
  hardness: 0.5, tool: 'shovel', sound: 'gravel', variants: [0, 1], itemMetaMask: 1,
});
defBlock(4, 'cobblestone', { name: 'Cobblestone', hardness: 2, resistance: 30, tool: 'pickaxe', needsTool: true });
defBlock(5, 'planks', {
  name: (m) => (WOOD_NAMES[m] || 'Oak') + ' Planks', tex: (m) => 'planks_' + (WOOD[m] || 'oak'),
  hardness: 2, resistance: 15, tool: 'axe', sound: 'wood', flammable: 20, burnSpeed: 5, variants: [0, 1, 2, 3, 4, 5], itemMetaMask: 7,
});
defBlock(6, 'sapling', Object.assign({}, plantBase, {
  name: (m) => (LEAF_NAMES[m & 7] || 'Oak') + ' Sapling', tex: (m) => 'sapling_' + (LEAF_KINDS[m & 7] || 'oak'),
  variants: [0, 1, 2, 3, 4, 5, 6], itemMetaMask: 7, itemSprite: (d) => 'sapling_' + (LEAF_KINDS[d & 7] || 'oak'),
  select: () => box16(2, 0, 2, 14, 12, 14),
}));
defBlock(7, 'bedrock', { name: 'Bedrock', hardness: -1, resistance: 18000000, drops: () => [] });
defBlock(8, 'water', {
  name: 'Water', render: R.LIQUID, tex: { top: 'water_still', side: 'water_flow' }, opaque: false, solid: false, translucent: true,
  opacity: 2, hardness: 100, replaceable: true, fluid: true, tint: 'water', drops: () => [],
});
defBlock(9, 'lava', {
  name: 'Lava', render: R.LIQUID, tex: { top: 'lava_still', side: 'lava_flow' }, opaque: false, solid: false,
  opacity: 15, light: 15, hardness: 100, replaceable: true, fluid: true, drops: () => [],
});
defBlock(10, 'sand', {
  name: (m) => m === 1 ? 'Red Sand' : 'Sand', tex: (m) => m === 1 ? 'red_sand' : 'sand',
  hardness: 0.5, tool: 'shovel', sound: 'sand', gravity: true, variants: [0, 1], itemMetaMask: 1,
});
defBlock(11, 'gravel', {
  name: 'Gravel', hardness: 0.6, tool: 'shovel', sound: 'gravel', gravity: true,
  drops: (m, rng) => rng.nextInt(10) === 0 ? [[ITEM_IDS.flint, 1, 0]] : [[B.GRAVEL, 1, 0]],
});
defBlock(12, 'gold_ore', { name: 'Gold Ore', hardness: 3, resistance: 15, tool: 'pickaxe', level: 2, needsTool: true });
defBlock(13, 'iron_ore', { name: 'Iron Ore', hardness: 3, resistance: 15, tool: 'pickaxe', level: 1, needsTool: true });
defBlock(14, 'coal_ore', {
  name: 'Coal Ore', hardness: 3, resistance: 15, tool: 'pickaxe', needsTool: true,
  drops: () => [[ITEM_IDS.coal, 1, 0]], xp: [0, 2],
});
defBlock(15, 'log', {
  name: (m) => (WOOD_NAMES[m & 7] || 'Oak') + ' Log',
  tex: (m, f) => {
    const w = WOOD[m & 7] || 'oak', axis = (m >> 3) & 3;
    const end = axis === 0 ? (f === 0 || f === 1) : axis === 1 ? (f === 4 || f === 5) : (f === 2 || f === 3);
    return end ? 'log_' + w + '_top' : 'log_' + w;
  },
  hardness: 2, tool: 'axe', sound: 'wood', flammable: 5, burnSpeed: 5, variants: [0, 1, 2, 3, 4, 5], itemMetaMask: 7,
});
defBlock(16, 'leaves', {
  name: (m) => (LEAF_NAMES[m & 7] || 'Oak') + ' Leaves', tex: (m) => 'leaves_' + (LEAF_KINDS[m & 7] || 'oak'),
  opaque: false, cutout: true, opacity: 1, hardness: 0.2, tool: 'hoe', sound: 'grass', tint: 'foliage',
  flammable: 30, burnSpeed: 60, variants: [0, 1, 2, 3, 4, 5, 6], itemMetaMask: 7,
  drops: (m, rng, tool) => {
    const kind = m & 7;
    if (tool && tool.kind === 'shears') return [[B.LEAVES, 1, kind]];
    const out = [];
    const sap = kind === 3 ? 40 : 20;
    if (rng.nextInt(sap) === 0) out.push([B.SAPLING, 1, kind]);
    if ((kind === 0 || kind === 4 || kind === 6) && rng.nextInt(200) === 0) out.push([ITEM_IDS.apple, 1, 0]);
    return out;
  },
});
defBlock(17, 'mossy_cobblestone', { name: 'Mossy Cobblestone', hardness: 2, resistance: 30, tool: 'pickaxe', needsTool: true });
defBlock(18, 'glass', { name: 'Glass', opaque: false, cutout: true, opacity: 0, hardness: 0.3, sound: 'glass', drops: () => [] });
defBlock(19, 'lapis_ore', {
  name: 'Lapis Lazuli Ore', hardness: 3, resistance: 15, tool: 'pickaxe', level: 1, needsTool: true,
  drops: (m, rng) => [[ITEM_IDS.dye, 4 + rng.nextInt(5), 11]], xp: [2, 5],
});
defBlock(20, 'lapis_block', { name: 'Lapis Lazuli Block', hardness: 3, resistance: 15, tool: 'pickaxe', level: 1, needsTool: true });
defBlock(21, 'sandstone', {
  name: (m) => ['Sandstone', 'Chiseled Sandstone', 'Smooth Sandstone'][m] || 'Sandstone',
  tex: (m, f) => f === 1 ? 'sandstone_top' : f === 0 ? 'sandstone_bottom' : (['sandstone_side', 'sandstone_carved', 'sandstone_smooth'][m] || 'sandstone_side'),
  hardness: 0.8, tool: 'pickaxe', needsTool: true, variants: [0, 1, 2], itemMetaMask: 3,
});
defBlock(22, 'bed', {
  name: 'Bed', render: R.MODEL, tex: { top: 'bed_top_foot', side: 'bed_side', bottom: 'planks_oak' }, opaque: false, opacity: 0, hardness: 0.2, sound: 'wood', itemSprite: 'item_bed',
  collide: () => [box16(0, 0, 0, 16, 9, 16)], select: () => box16(0, 0, 0, 16, 9, 16),
  drops: (m) => (m & 4) ? [[ITEM_IDS.bed, 1, 0]] : [],
});
defBlock(23, 'wool', {
  name: (m) => COLOR_NAMES[m & 15] + ' Wool', tex: (m) => 'wool_' + COLORS[m & 15],
  hardness: 0.8, tool: 'shears', sound: 'cloth', flammable: 30, burnSpeed: 60, variants: [...Array(16).keys()], itemMetaMask: 15,
});
defBlock(24, 'tall_grass', Object.assign({}, plantBase, {
  name: (m) => ['Shrub', 'Tall Grass', 'Fern'][m] || 'Tall Grass', tex: (m) => ['dead_bush', 'tall_grass', 'fern'][m] || 'tall_grass',
  tint: 'grass', replaceable: true, flammable: 60, burnSpeed: 100, variants: [1, 2], itemMetaMask: 3,
  itemSprite: (d) => ['dead_bush', 'tall_grass', 'fern'][d] || 'tall_grass',
  select: () => box16(2, 0, 2, 14, 13, 14),
  drops: (m, rng, tool) => tool && tool.kind === 'shears' ? [[B.TALL_GRASS, 1, m]] : (rng.nextInt(8) === 0 ? [[ITEM_IDS.seeds, 1, 0]] : []),
}));
defBlock(25, 'dead_bush', Object.assign({}, plantBase, {
  name: 'Dead Bush', replaceable: true, flammable: 60, burnSpeed: 100, itemSprite: 'dead_bush',
  select: () => box16(2, 0, 2, 14, 13, 14),
  drops: (m, rng) => [[ITEM_IDS.stick, rng.nextInt(3), 0]],
}));
defBlock(26, 'flower', Object.assign({}, plantBase, {
  name: (m) => FLOWER_NAMES[m & 7], tex: (m) => 'flower_' + FLOWERS[m & 7],
  variants: [0, 1, 2, 3, 4, 5, 6, 7], itemMetaMask: 7, itemSprite: (d) => 'flower_' + FLOWERS[d & 7],
  select: () => box16(5, 0, 5, 11, 10, 11),
}));
defBlock(27, 'mushroom_brown', Object.assign({}, plantBase, { name: 'Brown Mushroom', light: 1, itemSprite: 'mushroom_brown', select: () => box16(5, 0, 5, 11, 6, 11) }));
defBlock(28, 'mushroom_red', Object.assign({}, plantBase, { name: 'Red Mushroom', itemSprite: 'mushroom_red', select: () => box16(5, 0, 5, 11, 6, 11) }));
defBlock(29, 'gold_block', { name: 'Block of Gold', hardness: 3, resistance: 30, tool: 'pickaxe', level: 2, needsTool: true, sound: 'metal' });
defBlock(30, 'iron_block', { name: 'Block of Iron', hardness: 5, resistance: 30, tool: 'pickaxe', level: 1, needsTool: true, sound: 'metal' });

function slabMat(m) { return SLAB_MATS[m & 31] || SLAB_MATS[6]; }
function slabTex(m, f) { const s = slabMat(m); return f === 1 ? (s.top || s.tex) : f === 0 ? (s.bottom || s.top || s.tex) : s.tex; }
defBlock(31, 'double_slab', {
  name: (m) => 'Double ' + slabMat(m).name + ' Slab', tex: slabTex,
  hardness: 2, resistance: 30, tool: 'pickaxe', needsTool: true, itemMetaMask: 31,
  drops: (m) => [[B.SLAB, 2, m & 31]],
});
defBlock(32, 'slab', {
  name: (m) => slabMat(m).name + ' Slab', tex: slabTex, render: R.MODEL, opaque: false, opacity: 15,
  hardness: 2, resistance: 30, tool: 'pickaxe', needsTool: true, itemMetaMask: 31,
  variants: SLAB_MATS.map((s, i) => i),
  model: (m) => (m & 32) ? [{ b: [0, 8, 0, 16, 16, 16] }] : [{ b: [0, 0, 0, 16, 8, 16] }],
  collide: (m) => [(m & 32) ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1]],
  select: (m) => (m & 32) ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1],
});
defBlock(33, 'bricks', { name: 'Bricks', hardness: 2, resistance: 30, tool: 'pickaxe', needsTool: true });
defBlock(34, 'tnt', { name: 'TNT', tex: { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' }, hardness: 0, sound: 'grass', flammable: 15, burnSpeed: 100 });
defBlock(35, 'bookshelf', {
  name: 'Bookshelf', tex: { top: 'planks_oak', bottom: 'planks_oak', side: 'bookshelf' }, hardness: 1.5, tool: 'axe', sound: 'wood',
  flammable: 30, burnSpeed: 20, drops: () => [[ITEM_IDS.book, 3, 0]],
});
defBlock(36, 'obsidian', { name: 'Obsidian', hardness: 50, resistance: 6000, tool: 'pickaxe', level: 3, needsTool: true });
defBlock(37, 'torch', {
  name: 'Torch', render: R.TORCH, opaque: false, solid: false, cutout: true, opacity: 0, light: 14, hardness: 0,
  sound: 'wood', itemSprite: 'torch', itemMetaMask: 0,
  select: (m) => {
    switch (m) {
      case 1: return box16(0, 3, 5.5, 5, 13, 10.5);
      case 2: return box16(11, 3, 5.5, 16, 13, 10.5);
      case 3: return box16(5.5, 3, 0, 10.5, 13, 5);
      case 4: return box16(5.5, 3, 11, 10.5, 13, 16);
      default: return box16(6, 0, 6, 10, 10, 10);
    }
  },
});
defBlock(38, 'fire', { name: 'Fire', render: R.FIRE, tex: 'fire', opaque: false, solid: false, cutout: true, opacity: 0, light: 15, hardness: 0, replaceable: true, drops: () => [], select: () => null });
defBlock(39, 'mob_spawner', { name: 'Monster Spawner', opaque: false, cutout: true, opacity: 0, hardness: 5, tool: 'pickaxe', needsTool: true, sound: 'metal', drops: () => [], xp: [15, 43], tileEntity: 'spawner' });

function stairMat(m) { return SLAB_MATS[(m >> 3) & 31] || SLAB_MATS[0]; }
defBlock(40, 'stairs', {
  name: (m) => slabMat(m).name + ' Stairs', // item damage = material
  tex: (m, f) => slabTex((m >> 3) & 31, f), render: R.MODEL, opaque: false, opacity: 15,
  hardness: 2, resistance: 30, tool: 'pickaxe', needsTool: true,
  variants: SLAB_MATS.map((s, i) => i).filter((i) => i !== 6),
  model: (m) => stairBoxes(m).map((b) => ({ b: b.map((v) => v * 16) })),
  collide: (m) => stairBoxes(m),
});
function stairBoxes(m) {
  const facing = m & 3, up = (m & 4) !== 0;
  const base = up ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1];
  const y0 = up ? 0 : 0.5, y1 = up ? 0.5 : 1;
  // the tall half sits on the side the stairs "face" away from (ascend towards facing)
  let step;
  switch (facing) {
    case 0: step = [0, y0, 0, 1, y1, 0.5]; break;   // ascending to north
    case 1: step = [0, y0, 0.5, 1, y1, 1]; break;   // south
    case 2: step = [0, y0, 0, 0.5, y1, 1]; break;   // west
    default: step = [0.5, y0, 0, 1, y1, 1]; break;  // east
  }
  return [base, step];
}
defBlock(41, 'chest', {
  name: 'Chest', render: R.MODEL, tex: (m, f) => f === 0 || f === 1 ? 'chest_top' : (f === HFACE[m & 3] ? 'chest_front' : 'chest_side'),
  opaque: false, opacity: 0, hardness: 2.5, tool: 'axe', sound: 'wood', tileEntity: 'chest', flammable: 5, burnSpeed: 5,
  model: () => [{ b: [1, 0, 1, 15, 14, 15] }],
  collide: () => [box16(1, 0, 1, 15, 14, 15)], select: () => box16(1, 0, 1, 15, 14, 15), itemMetaMask: 0,
});
defBlock(42, 'diamond_ore', {
  name: 'Diamond Ore', hardness: 3, resistance: 15, tool: 'pickaxe', level: 2, needsTool: true,
  drops: () => [[ITEM_IDS.diamond, 1, 0]], xp: [3, 7],
});
defBlock(43, 'diamond_block', { name: 'Block of Diamond', hardness: 5, resistance: 30, tool: 'pickaxe', level: 2, needsTool: true, sound: 'metal' });
defBlock(44, 'crafting_table', {
  name: 'Crafting Table', tex: { top: 'crafting_table_top', bottom: 'planks_oak', north: 'crafting_table_front', south: 'crafting_table_side', west: 'crafting_table_side', east: 'crafting_table_front' },
  hardness: 2.5, tool: 'axe', sound: 'wood', flammable: 5, burnSpeed: 5,
});
defBlock(45, 'wheat', Object.assign({}, plantBase, {
  name: 'Wheat Crops', render: R.CROP, tex: (m) => 'wheat_' + Math.min(7, m), itemSprite: 'item_wheat',
  select: (m) => [0, 0, 0, 1, 0.125 + Math.min(7, m) * 0.1, 1],
  drops: (m, rng) => m >= 7 ? [[ITEM_IDS.wheat, 1, 0], [ITEM_IDS.seeds, 1 + rng.nextInt(3), 0]] : [[ITEM_IDS.seeds, 1, 0]],
}));
defBlock(46, 'farmland', {
  name: 'Farmland', render: R.MODEL, tex: (m, f) => f === 1 ? (m > 0 ? 'farmland_wet' : 'farmland_dry') : 'dirt',
  opaque: false, opacity: 15, hardness: 0.6, tool: 'shovel', sound: 'gravel',
  model: () => [{ b: [0, 0, 0, 16, 15, 16] }], collide: () => [box16(0, 0, 0, 16, 15, 16)],
  drops: () => [[B.DIRT, 1, 0]],
});
function facingTex(front, side, top, bottom) {
  return (m, f) => f === 1 ? top : f === 0 ? (bottom || top) : (f === HFACE[m & 3] ? front : side);
}
defBlock(47, 'furnace', { name: 'Furnace', tex: facingTex('furnace_front', 'furnace_side', 'furnace_top'), hardness: 3.5, tool: 'pickaxe', needsTool: true, tileEntity: 'furnace', itemMetaMask: 0 });
defBlock(48, 'furnace_lit', { name: 'Furnace', tex: facingTex('furnace_front_on', 'furnace_side', 'furnace_top'), light: 13, hardness: 3.5, tool: 'pickaxe', needsTool: true, tileEntity: 'furnace', drops: () => [[B.FURNACE, 1, 0]] });

function doorBoxes(m) {
  // bits: 0-1 facing (direction the door faces when closed), 2 open, 3 upper, 4 hinge right
  const facing = m & 3, open = (m & 4) !== 0, hinge = (m & 16) !== 0;
  const t = 3 / 16;
  // when closed the slab sits on the side facing away from 'facing'
  let side = facing;
  if (open) {
    // rotate 90 degrees around the hinge
    const rotCW = [3, 2, 0, 1], rotCCW = [2, 3, 1, 0];
    side = hinge ? rotCCW[facing] : rotCW[facing];
  }
  switch (side) {
    case 0: return [0, 0, 1 - t, 1, 1, 1];   // facing north -> panel on south edge
    case 1: return [0, 0, 0, 1, 1, t];
    case 2: return [1 - t, 0, 0, 1, 1, 1];
    default: return [0, 0, 0, t, 1, 1];
  }
}
defBlock(49, 'door_wood', {
  name: 'Wooden Door', render: R.MODEL, tex: (m) => (m & 8) ? 'door_wood_upper' : 'door_wood_lower',
  opaque: false, cutout: true, opacity: 0, hardness: 3, tool: 'axe', sound: 'wood', itemSprite: 'item_door_wood',
  model: (m) => [{ b: doorBoxes(m).map((v) => v * 16), flipU: (m & 16) !== 0 }],
  collide: (m) => [doorBoxes(m)], select: (m) => doorBoxes(m),
  drops: (m) => (m & 8) ? [] : [[ITEM_IDS.door_wood, 1, 0]],
});
defBlock(50, 'ladder', {
  name: 'Ladder', render: R.LADDER, opaque: false, solid: true, cutout: true, opacity: 0, hardness: 0.4, tool: 'axe', sound: 'ladder',
  climbable: true, itemSprite: 'ladder', itemMetaMask: 0,
  collide: (m) => [ladderBox(m)], select: (m) => ladderBox(m),
});
function ladderBox(m) {
  const t = 2 / 16;
  switch (m & 3) { // facing = direction the ladder faces (away from its wall)
    case 0: return [0, 0, 1 - t, 1, 1, 1];
    case 1: return [0, 0, 0, 1, 1, t];
    case 2: return [1 - t, 0, 0, 1, 1, 1];
    default: return [0, 0, 0, t, 1, 1];
  }
}
defBlock(51, 'door_iron', {
  name: 'Iron Door', render: R.MODEL, tex: (m) => (m & 8) ? 'door_iron_upper' : 'door_iron_lower',
  opaque: false, cutout: true, opacity: 0, hardness: 5, tool: 'pickaxe', needsTool: true, sound: 'metal', itemSprite: 'item_door_iron',
  model: (m) => [{ b: doorBoxes(m).map((v) => v * 16), flipU: (m & 16) !== 0 }],
  collide: (m) => [doorBoxes(m)], select: (m) => doorBoxes(m),
  drops: (m) => (m & 8) ? [] : [[ITEM_IDS.door_iron, 1, 0]],
});
defBlock(52, 'ember_ore', {
  name: 'Ember Ore', hardness: 3, resistance: 15, tool: 'pickaxe', level: 2, needsTool: true,
  drops: (m, rng) => [[ITEM_IDS.ember_dust, 4 + rng.nextInt(2), 0]], xp: [1, 5],
});
defBlock(53, 'ember_ore_lit', {
  name: 'Ember Ore', tex: 'ember_ore_lit', light: 9, hardness: 3, resistance: 15, tool: 'pickaxe', level: 2, needsTool: true,
  drops: (m, rng) => [[ITEM_IDS.ember_dust, 4 + rng.nextInt(2), 0]], xp: [1, 5],
});
defBlock(54, 'snow_layer', {
  name: 'Snow', render: R.MODEL, tex: 'snow', opaque: false, opacity: 0, hardness: 0.1, tool: 'shovel', sound: 'snow',
  replaceable: true, itemMetaMask: 0,
  model: (m) => [{ b: [0, 0, 0, 16, ((m & 7) + 1) * 2, 16] }],
  collide: (m) => (m & 7) === 0 ? [] : [[0, 0, 0, 1, ((m & 7)) * 2 / 16, 1]],
  select: (m) => [0, 0, 0, 1, ((m & 7) + 1) * 2 / 16, 1],
  drops: (m, rng, tool) => tool && tool.kind === 'shovel' ? [[ITEM_IDS.snowball, 1 + (m & 7), 0]] : [],
});
defBlock(55, 'ice', { name: 'Ice', opaque: false, translucent: true, opacity: 2, hardness: 0.5, tool: 'pickaxe', sound: 'glass', slip: 0.98, drops: () => [] });
defBlock(56, 'snow', { name: 'Snow', tex: 'snow', hardness: 0.2, tool: 'shovel', sound: 'snow', drops: () => [[ITEM_IDS.snowball, 4, 0]] });
defBlock(57, 'cactus', {
  name: 'Cactus', render: R.MODEL, tex: { top: 'cactus_top', bottom: 'cactus_bottom', side: 'cactus_side' }, opaque: false, cutout: true, opacity: 0,
  hardness: 0.4, sound: 'cloth', itemMetaMask: 0,
  model: () => [{ b: [1, 0, 1, 15, 16, 15], faces: [0, 1] }, { b: [0, 0, 1, 16, 16, 15], faces: [4, 5], inset: true }, { b: [1, 0, 0, 15, 16, 16], faces: [2, 3], inset: true }],
  collide: () => [box16(1, 0, 1, 15, 15, 15)], select: () => box16(1, 0, 1, 15, 16, 15),
});
defBlock(58, 'clay', { name: 'Clay', hardness: 0.6, tool: 'shovel', sound: 'gravel', drops: () => [[ITEM_IDS.clay_ball, 4, 0]] });
defBlock(59, 'sugar_cane', Object.assign({}, plantBase, {
  name: 'Sugar Canes', tint: null, itemSprite: 'item_sugar_cane', select: () => box16(2, 0, 2, 14, 16, 14),
  drops: () => [[ITEM_IDS.sugar_cane, 1, 0]],
}));
defBlock(60, 'fence', {
  name: (m) => (WOOD_NAMES[m & 7] || 'Oak') + ' Fence', tex: (m) => 'planks_' + (WOOD[m & 7] || 'oak'), render: R.MODEL, opaque: false, opacity: 0,
  hardness: 2, tool: 'axe', sound: 'wood', flammable: 5, burnSpeed: 20, variants: [0, 1, 2, 3, 4, 5], itemMetaMask: 7,
  // model & collision computed with neighbour info in the mesher / physics
});
defBlock(61, 'pumpkin', { name: 'Pumpkin', tex: facingTex('pumpkin_face', 'pumpkin_side', 'pumpkin_top'), hardness: 1, tool: 'axe', sound: 'wood', itemMetaMask: 0 });
defBlock(62, 'jack_o_lantern', { name: "Jack o'Lantern", tex: facingTex('pumpkin_face_on', 'pumpkin_side', 'pumpkin_top'), light: 15, hardness: 1, tool: 'axe', sound: 'wood', itemMetaMask: 0 });
function trapdoorBox(m) {
  const t = 3 / 16, open = (m & 4) !== 0, top = (m & 8) !== 0;
  if (!open) return top ? [0, 1 - t, 0, 1, 1, 1] : [0, 0, 0, 1, t, 1];
  switch (m & 3) { // attached side
    case 0: return [0, 0, 1 - t, 1, 1, 1];
    case 1: return [0, 0, 0, 1, 1, t];
    case 2: return [1 - t, 0, 0, 1, 1, 1];
    default: return [0, 0, 0, t, 1, 1];
  }
}
defBlock(63, 'trapdoor', {
  name: 'Trapdoor', render: R.MODEL, tex: 'trapdoor', opaque: false, cutout: true, opacity: 0, hardness: 3, tool: 'axe', sound: 'wood', itemMetaMask: 0,
  model: (m) => [{ b: trapdoorBox(m).map((v) => v * 16) }], collide: (m) => [trapdoorBox(m)], select: (m) => trapdoorBox(m),
});
defBlock(64, 'stone_bricks', {
  name: (m) => ['Stone Bricks', 'Mossy Stone Bricks', 'Cracked Stone Bricks', 'Chiseled Stone Bricks'][m & 3],
  tex: (m) => ['stone_bricks', 'stone_bricks_mossy', 'stone_bricks_cracked', 'stone_bricks_carved'][m & 3],
  hardness: 1.5, resistance: 30, tool: 'pickaxe', needsTool: true, variants: [0, 1, 2, 3], itemMetaMask: 3,
});
defBlock(65, 'huge_mushroom_brown', {
  name: 'Mushroom', tex: (m, f) => m === 1 ? ((f === 0 || f === 1) ? 'mushroom_pores' : 'mushroom_stem') : (f === 0 ? 'mushroom_pores' : 'mushroom_cap_brown'),
  hardness: 0.2, tool: 'axe', sound: 'wood', drops: (m, rng) => rng.nextInt(10) < 2 ? [[B.MUSHROOM_BROWN, 1, 0]] : [],
});
defBlock(66, 'huge_mushroom_red', {
  name: 'Mushroom', tex: (m, f) => m === 1 ? ((f === 0 || f === 1) ? 'mushroom_pores' : 'mushroom_stem') : (f === 0 ? 'mushroom_pores' : 'mushroom_cap_red'),
  hardness: 0.2, tool: 'axe', sound: 'wood', drops: (m, rng) => rng.nextInt(10) < 2 ? [[B.MUSHROOM_RED, 1, 0]] : [],
});
defBlock(67, 'glass_pane', {
  name: 'Glass Pane', render: R.MODEL, tex: 'glass', opaque: false, cutout: true, opacity: 0, hardness: 0.3, sound: 'glass',
  itemSprite: 'glass', drops: () => [],
});
defBlock(68, 'melon', { name: 'Melon', tex: { top: 'melon_top', bottom: 'melon_top', side: 'melon_side' }, hardness: 1, tool: 'axe', sound: 'wood', drops: (m, rng) => [[ITEM_IDS.melon_slice, 3 + rng.nextInt(5), 0]] });
defBlock(69, 'vine', {
  name: 'Vines', render: R.VINE, tex: 'vine', opaque: false, solid: false, cutout: true, opacity: 0, hardness: 0.2, tool: 'shears',
  sound: 'grass', tint: 'foliage', replaceable: true, climbable: true, flammable: 15, burnSpeed: 100, itemSprite: 'vine',
  drops: (m, rng, tool) => tool && tool.kind === 'shears' ? [[B.VINE, 1, 0]] : [], itemMetaMask: 0,
});
defBlock(70, 'fence_gate', {
  name: 'Fence Gate', render: R.MODEL, tex: 'planks_oak', opaque: false, opacity: 0, hardness: 2, tool: 'axe', sound: 'wood', itemMetaMask: 0,
  collide: (m) => (m & 4) ? [] : [((m & 3) < 2) ? [0, 0, 0.375, 1, 1.5, 0.625] : [0.375, 0, 0, 0.625, 1.5, 1]],
  select: (m) => ((m & 3) < 2) ? [0, 0, 0.375, 1, 1, 0.625] : [0.375, 0, 0, 0.625, 1, 1],
});
defBlock(71, 'mycelium', { name: 'Mycelium', tex: { top: 'mycelium_top', bottom: 'dirt', side: 'mycelium_side' }, hardness: 0.6, tool: 'shovel', sound: 'grass', drops: () => [[B.DIRT, 1, 0]] });
defBlock(72, 'lily_pad', {
  name: 'Lily Pad', render: R.LILY, tex: 'lily_pad', opaque: false, cutout: true, opacity: 0, hardness: 0, sound: 'grass', tint: 'lily',
  itemSprite: 'lily_pad', collide: () => [[0, 0, 0, 1, 1 / 64, 1]], select: () => [0, 0, 0, 1, 1 / 64, 1],
});
defBlock(73, 'podzol', { name: 'Podzol', tex: { top: 'podzol_top', bottom: 'dirt', side: 'podzol_side' }, hardness: 0.5, tool: 'shovel', sound: 'gravel', drops: () => [[B.DIRT, 1, 0]] });
defBlock(74, 'cobweb', Object.assign({}, plantBase, {
  name: 'Cobweb', tex: 'cobweb', hardness: 4, tool: 'sword', sound: 'stone', itemSprite: 'cobweb', select: () => FULL,
  drops: (m, rng, tool) => tool && (tool.kind === 'shears') ? [[B.COBWEB, 1, 0]] : (tool && tool.kind === 'sword' ? [[ITEM_IDS.string, 1, 0]] : []),
}));
defBlock(75, 'carrots', Object.assign({}, plantBase, {
  name: 'Carrots', render: R.CROP, tex: (m) => 'carrots_' + Math.min(3, m >> 1), itemSprite: 'item_carrot',
  select: (m) => [0, 0, 0, 1, 0.125 + Math.min(7, m) * 0.07, 1],
  drops: (m, rng) => m >= 7 ? [[ITEM_IDS.carrot, 2 + rng.nextInt(3), 0]] : [[ITEM_IDS.carrot, 1, 0]],
}));
defBlock(76, 'potatoes', Object.assign({}, plantBase, {
  name: 'Potatoes', render: R.CROP, tex: (m) => 'potatoes_' + Math.min(3, m >> 1), itemSprite: 'item_potato',
  select: (m) => [0, 0, 0, 1, 0.125 + Math.min(7, m) * 0.07, 1],
  drops: (m, rng) => m >= 7 ? [[ITEM_IDS.potato, 2 + rng.nextInt(3), 0]].concat(rng.nextInt(50) === 0 ? [[ITEM_IDS.poison_potato, 1, 0]] : []) : [[ITEM_IDS.potato, 1, 0]],
}));
defBlock(77, 'hay_bale', {
  name: 'Hay Bale', tex: (m, f) => { const ax = (m >> 3) & 3; const end = ax === 0 ? f < 2 : ax === 1 ? f >= 4 : (f === 2 || f === 3); return end ? 'hay_top' : 'hay_side'; },
  hardness: 0.5, tool: 'hoe', sound: 'grass', flammable: 60, burnSpeed: 20, itemMetaMask: 0,
});
defBlock(78, 'carpet', {
  name: (m) => COLOR_NAMES[m & 15] + ' Carpet', tex: (m) => 'wool_' + COLORS[m & 15], render: R.MODEL, opaque: false, opacity: 0,
  hardness: 0.1, sound: 'cloth', variants: [...Array(16).keys()], itemMetaMask: 15, flammable: 60, burnSpeed: 20,
  model: () => [{ b: [0, 0, 0, 16, 1, 16] }], collide: () => [box16(0, 0, 0, 16, 1, 16)], select: () => box16(0, 0, 0, 16, 1, 16),
});
defBlock(79, 'terracotta', {
  name: (m) => m === 0 ? 'Terracotta' : COLOR_NAMES[(m - 1) & 15] + ' Terracotta', tex: (m) => m === 0 ? 'terracotta' : 'terracotta_' + COLORS[(m - 1) & 15],
  hardness: 1.25, resistance: 21, tool: 'pickaxe', needsTool: true, variants: [...Array(17).keys()], itemMetaMask: 31,
});
defBlock(80, 'packed_ice', { name: 'Packed Ice', hardness: 0.5, tool: 'pickaxe', sound: 'glass', slip: 0.98, drops: () => [] });
defBlock(81, 'coal_block', { name: 'Block of Coal', hardness: 5, resistance: 30, tool: 'pickaxe', needsTool: true, flammable: 5, burnSpeed: 5 });
defBlock(82, 'red_sandstone', {
  name: (m) => ['Red Sandstone', 'Chiseled Red Sandstone', 'Smooth Red Sandstone'][m] || 'Red Sandstone',
  tex: (m, f) => f === 1 ? 'red_sandstone_top' : f === 0 ? 'red_sandstone_bottom' : (['red_sandstone_side', 'red_sandstone_carved', 'red_sandstone_smooth'][m] || 'red_sandstone_side'),
  hardness: 0.8, tool: 'pickaxe', needsTool: true, variants: [0, 1, 2], itemMetaMask: 3,
});
defBlock(83, 'stained_glass', {
  name: (m) => COLOR_NAMES[m & 15] + ' Stained Glass', tex: (m) => 'stained_glass_' + COLORS[m & 15],
  opaque: false, translucent: true, opacity: 0, hardness: 0.3, sound: 'glass', variants: [...Array(16).keys()], itemMetaMask: 15, drops: () => [],
});
defBlock(84, 'jade_ore', { name: 'Jade Ore', hardness: 3, resistance: 15, tool: 'pickaxe', level: 2, needsTool: true, drops: () => [[ITEM_IDS.jade, 1, 0]], xp: [3, 7] });
defBlock(85, 'jade_block', { name: 'Block of Jade', hardness: 5, resistance: 30, tool: 'pickaxe', level: 2, needsTool: true, sound: 'metal' });
defBlock(86, 'cobalt_ore', { name: 'Cobalt Ore', hardness: 4, resistance: 20, tool: 'pickaxe', level: 2, needsTool: true });
defBlock(87, 'cobalt_block', { name: 'Block of Cobalt', hardness: 5, resistance: 30, tool: 'pickaxe', level: 2, needsTool: true, sound: 'metal' });
defBlock(88, 'sulfur_ore', { name: 'Sulfur Ore', hardness: 3, resistance: 15, tool: 'pickaxe', level: 1, needsTool: true, drops: (m, rng) => [[ITEM_IDS.sulfur, 1 + rng.nextInt(3), 0]], xp: [1, 3] });
defBlock(89, 'sulfur_block', { name: 'Block of Sulfur', hardness: 2, tool: 'pickaxe', needsTool: true, sound: 'sand', flammable: 5, burnSpeed: 30 });
defBlock(90, 'starmetal_ore', { name: 'Starmetal Ore', light: 3, hardness: 10, resistance: 1200, tool: 'pickaxe', level: 3, needsTool: true });
defBlock(91, 'starmetal_block', { name: 'Block of Starmetal', light: 5, hardness: 10, resistance: 1200, tool: 'pickaxe', level: 3, needsTool: true, sound: 'metal' });
defBlock(92, 'slate', { name: 'Slate', hardness: 3, resistance: 30, tool: 'pickaxe', needsTool: true });
defBlock(93, 'slate_bricks', { name: 'Slate Bricks', hardness: 3, resistance: 30, tool: 'pickaxe', needsTool: true });
defBlock(94, 'marble', { name: 'Marble', hardness: 1.5, resistance: 30, tool: 'pickaxe', needsTool: true });
defBlock(95, 'marble_bricks', {
  name: (m) => ['Marble Bricks', 'Marble Pillar', 'Chiseled Marble'][m] || 'Marble Bricks',
  tex: (m, f) => m === 1 ? (f < 2 ? 'marble_pillar_top' : 'marble_pillar') : m === 2 ? 'marble_carved' : 'marble_bricks',
  hardness: 1.5, resistance: 30, tool: 'pickaxe', needsTool: true, variants: [0, 1, 2], itemMetaMask: 3,
});
defBlock(96, 'basalt', { name: 'Basalt', tex: { top: 'basalt_top', bottom: 'basalt_top', side: 'basalt_side' }, hardness: 1.25, resistance: 21, tool: 'pickaxe', needsTool: true });
defBlock(97, 'polished_basalt', { name: 'Polished Basalt', tex: { top: 'polished_basalt_top', bottom: 'polished_basalt_top', side: 'polished_basalt_side' }, hardness: 1.25, resistance: 21, tool: 'pickaxe', needsTool: true });
defBlock(98, 'ash', { name: 'Ash', hardness: 0.5, tool: 'shovel', sound: 'sand', gravity: true });
defBlock(99, 'peat', { name: 'Peat', hardness: 0.6, tool: 'shovel', sound: 'gravel', flammable: 5, burnSpeed: 5 });
defBlock(100, 'salt', { name: 'Salt Crust', hardness: 0.6, tool: 'pickaxe', sound: 'glass', drops: (m, rng) => [[ITEM_IDS.salt, 2 + rng.nextInt(3), 0]] });
defBlock(101, 'lumite_crystal', Object.assign({}, plantBase, {
  name: 'Lumite Crystal', light: 12, hardness: 0.3, tool: 'pickaxe', sound: 'glass', itemSprite: 'lumite_crystal',
  select: () => box16(3, 0, 3, 13, 14, 13), drops: (m, rng) => [[ITEM_IDS.lumite_shard, 1 + rng.nextInt(2), 0]],
}));
defBlock(102, 'lumite_lamp', { name: 'Lumite Lamp', light: 15, hardness: 0.3, sound: 'glass' });
defBlock(103, 'glowshroom', Object.assign({}, plantBase, { name: 'Glowshroom', light: 10, itemSprite: 'glowshroom', select: () => box16(4, 0, 4, 12, 9, 12) }));
defBlock(104, 'rope', {
  name: 'Rope', render: R.MODEL, opaque: false, solid: false, cutout: true, opacity: 0, hardness: 0.3, sound: 'cloth', climbable: true,
  itemSprite: 'item_rope', model: () => [{ b: [7, 0, 7, 9, 16, 9] }], select: () => box16(6, 0, 6, 10, 16, 10), flammable: 30, burnSpeed: 60,
});
defBlock(105, 'bramble', Object.assign({}, plantBase, {
  name: 'Bramble Bush', tex: (m) => m >= 3 ? 'bramble_ripe' : 'bramble', itemSprite: 'bramble', replaceable: false, select: () => box16(1, 0, 1, 15, 14, 15),
  drops: (m, rng) => m >= 3 ? [[ITEM_IDS.berries, 2 + rng.nextInt(2), 0], [B.BRAMBLE, 1, 0]] : [[B.BRAMBLE, 1, 0]],
}));
defBlock(106, 'cattail', Object.assign({}, plantBase, { name: 'Cattail', itemSprite: 'cattail', select: () => box16(3, 0, 3, 13, 16, 13), drops: () => [[B.CATTAIL, 1, 0]] }));
defBlock(107, 'quicksand', { name: 'Quicksand', opaque: true, solid: false, hardness: 0.5, tool: 'shovel', sound: 'sand', select: () => FULL });
defBlock(108, 'thatch', { name: 'Thatch', hardness: 0.5, tool: 'hoe', sound: 'grass', flammable: 60, burnSpeed: 20 });
defBlock(109, 'scorched_stone', { name: 'Scorched Stone', hardness: 2, resistance: 30, tool: 'pickaxe', needsTool: true });
defBlock(110, 'runestone', { name: 'Runestone', tex: { top: 'runestone_top', bottom: 'runestone_top', side: 'runestone' }, light: 6, hardness: 30, resistance: 6000, tool: 'pickaxe', level: 3, needsTool: true });
defBlock(111, 'ember_block', { name: 'Block of Ember', light: 8, hardness: 5, resistance: 30, tool: 'pickaxe', needsTool: true, sound: 'metal' });
defBlock(112, 'leaf_litter', {
  name: 'Fallen Leaves', render: R.MODEL, tex: 'leaf_litter', opaque: false, cutout: true, opacity: 0, hardness: 0.1, sound: 'grass',
  replaceable: true, flammable: 60, burnSpeed: 100, itemSprite: 'leaf_litter',
  model: () => [{ b: [0, 0, 0, 16, 1, 16], faces: [1] }], collide: () => [], select: () => box16(0, 0, 0, 16, 1, 16),
  drops: (m, rng, tool) => tool && tool.kind === 'shears' ? [[B.LEAF_LITTER, 1, 0]] : [],
});

// signs: the board, post and text are drawn by the entity renderer (like the classic sign renderer)
// standing sign meta: rotation (0-15) | wood << 4; wall sign meta: facing (N,S,W,E) | wood << 2
function wallSignBox(m) {
  const t = 2 / 16, y0 = 4.5 / 16, y1 = 12.5 / 16;
  switch (m & 3) {
    case 0: return [0, y0, 1 - t, 1, y1, 1];
    case 1: return [0, y0, 0, 1, y1, t];
    case 2: return [1 - t, y0, 0, 1, y1, 1];
    default: return [0, y0, 0, t, y1, 1];
  }
}
defBlock(113, 'sign', {
  name: 'Sign', render: R.NONE, tex: (m) => 'planks_' + (WOOD[(m >> 4) & 7] || 'oak'), opaque: false, solid: false, opacity: 0, hardness: 1, tool: 'axe', sound: 'wood',
  tileEntity: 'sign', select: () => box16(4, 0, 4, 12, 16, 12), drops: (m) => [[ITEM_IDS.sign, 1, (m >> 4) & 7]], itemSprite: 'sign_oak',
});
defBlock(114, 'wall_sign', {
  name: 'Sign', render: R.NONE, tex: (m) => 'planks_' + (WOOD[(m >> 2) & 7] || 'oak'), opaque: false, solid: false, opacity: 0, hardness: 1, tool: 'axe', sound: 'wood',
  tileEntity: 'sign', select: (m) => wallSignBox(m), drops: (m) => [[ITEM_IDS.sign, 1, (m >> 2) & 7]], itemSprite: 'sign_oak',
});

// ---- ember circuits (the classic redstone set) ----
// attachment codes for levers & buttons: 0 floor, 1-4 walls (same as torches), 5 ceiling
const CIRCUIT_ATT = [[0, -1, 0], [-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1], [0, 1, 0]];
function attachedBox(m, w, h, d) {
  // a w x d footprint, h tall, centred on the face it is attached to (pixels)
  const a = m & 7, x0 = 8 - w / 2, x1 = 8 + w / 2, z0 = 8 - d / 2, z1 = 8 + d / 2;
  switch (a) {
    case 1: return box16(0, 8 - d / 2, x0, h, 8 + d / 2, x1);
    case 2: return box16(16 - h, 8 - d / 2, x0, 16, 8 + d / 2, x1);
    case 3: return box16(x0, 8 - d / 2, 0, x1, 8 + d / 2, h);
    case 4: return box16(x0, 8 - d / 2, 16 - h, x1, 8 + d / 2, 16);
    case 5: return box16(x0, 16 - h, z0, x1, 16, z1);
    default: return box16(x0, 0, z0, x1, h, z1);
  }
}
// pistons: facing is a face index (0 down, 1 up, 2 N, 3 S, 4 W, 5 E), bit 8 = extended (base) / sticky (head)
function pistonBaseBox(m) {
  if (!(m & 8)) return FULL;
  const t = 4 / 16;
  switch (m & 7) {
    case 0: return [0, t, 0, 1, 1, 1]; case 1: return [0, 0, 0, 1, 1 - t, 1];
    case 2: return [0, 0, t, 1, 1, 1]; case 3: return [0, 0, 0, 1, 1, 1 - t];
    case 4: return [t, 0, 0, 1, 1, 1]; default: return [0, 0, 0, 1 - t, 1, 1];
  }
}
function pistonHeadBoxes(m) {
  const t = 4 / 16, a = 6 / 16, b = 10 / 16;
  switch (m & 7) {
    case 0: return [[0, 0, 0, 1, t, 1], [a, t, a, b, 1, b]];
    case 1: return [[0, 1 - t, 0, 1, 1, 1], [a, 0, a, b, 1 - t, b]];
    case 2: return [[0, 0, 0, 1, 1, t], [a, a, t, b, b, 1]];
    case 3: return [[0, 0, 1 - t, 1, 1, 1], [a, a, 0, b, b, 1 - t]];
    case 4: return [[0, 0, 0, t, 1, 1], [t, a, a, 1, b, b]];
    default: return [[1 - t, 0, 0, 1, 1, 1], [0, a, a, 1 - t, b, b]];
  }
}
const circuitBase = { opaque: false, solid: false, opacity: 0, hardness: 0, cutout: true };
defBlock(115, 'ember_wire', Object.assign({}, circuitBase, {
  name: 'Ember Wire', render: R.CIRCUIT, tex: 'ember_wire_cross', sound: 'stone', itemSprite: 'ember_dust',
  select: () => box16(0, 0, 0, 16, 1, 16), drops: () => [[ITEM_IDS.ember_dust, 1, 0]],
}));
const torchSelect = (m) => {
  switch (m) {
    case 1: return box16(0, 3, 5.5, 5, 13, 10.5);
    case 2: return box16(11, 3, 5.5, 16, 13, 10.5);
    case 3: return box16(5.5, 3, 0, 10.5, 13, 5);
    case 4: return box16(5.5, 3, 11, 10.5, 13, 16);
  }
  return box16(6, 0, 6, 10, 10, 10);
};
defBlock(116, 'ember_torch', Object.assign({}, circuitBase, {
  name: 'Ember Torch', render: R.TORCH, tex: 'ember_torch_on', light: 7, sound: 'wood', itemSprite: 'ember_torch_on', itemMetaMask: 0, select: torchSelect,
  drops: () => [[B.EMBER_TORCH, 1, 0]],
}));
defBlock(117, 'ember_torch_off', Object.assign({}, circuitBase, {
  name: 'Ember Torch', render: R.TORCH, tex: 'ember_torch_off', sound: 'wood', itemSprite: 'ember_torch_off', itemMetaMask: 0, select: torchSelect,
  drops: () => [[B.EMBER_TORCH, 1, 0]],
}));
defBlock(118, 'lever', Object.assign({}, circuitBase, {
  name: 'Lever', render: R.CIRCUIT, tex: 'cobblestone', hardness: 0.5, sound: 'wood', itemSprite: 'item_lever', itemMetaMask: 0,
  select: (m) => attachedBox(m, 8, 10, 8),
}));
defBlock(119, 'stone_button', Object.assign({}, circuitBase, {
  name: 'Stone Button', render: R.CIRCUIT, tex: 'stone', hardness: 0.5, sound: 'stone', itemMetaMask: 0,
  select: (m) => attachedBox(m, 6, (m & 8) ? 1 : 2, 4), model: () => [{ b: [5, 6, 6, 11, 10, 10] }],
}));
defBlock(120, 'wood_button', Object.assign({}, circuitBase, {
  name: 'Wooden Button', render: R.CIRCUIT, tex: 'planks_oak', hardness: 0.5, sound: 'wood', itemMetaMask: 0,
  select: (m) => attachedBox(m, 6, (m & 8) ? 1 : 2, 4), model: () => [{ b: [5, 6, 6, 11, 10, 10] }],
}));
defBlock(121, 'stone_plate', Object.assign({}, circuitBase, {
  name: 'Stone Pressure Plate', render: R.MODEL, tex: 'stone', cutout: false, hardness: 0.5, sound: 'stone', tool: 'pickaxe', itemMetaMask: 0,
  model: (m) => [{ b: [1, 0, 1, 15, 1, 15], inset: 0 }], select: () => box16(1, 0, 1, 15, 1, 15),
}));
defBlock(122, 'wood_plate', Object.assign({}, circuitBase, {
  name: 'Wooden Pressure Plate', render: R.MODEL, tex: 'planks_oak', cutout: false, hardness: 0.5, sound: 'wood', tool: 'axe', itemMetaMask: 0,
  model: (m) => [{ b: [1, 0, 1, 15, 1, 15] }], select: () => box16(1, 0, 1, 15, 1, 15),
}));
defBlock(123, 'ember_lamp', { name: 'Ember Lamp', tex: 'ember_lamp_off', hardness: 0.3, sound: 'glass', drops: () => [[B.EMBER_LAMP, 1, 0]] });
defBlock(124, 'ember_lamp_on', { name: 'Ember Lamp', tex: 'ember_lamp_on', light: 15, hardness: 0.3, sound: 'glass', drops: () => [[B.EMBER_LAMP, 1, 0]] });
defBlock(125, 'relay', Object.assign({}, circuitBase, {
  name: 'Ember Relay', render: R.CIRCUIT, tex: 'relay_top', sound: 'wood', itemSprite: 'item_relay', select: () => box16(0, 0, 0, 16, 2, 16),
  collide: () => [box16(0, 0, 0, 16, 2, 16)], solid: true, drops: () => [[ITEM_IDS.relay, 1, 0]],
}));
defBlock(126, 'relay_on', Object.assign({}, circuitBase, {
  name: 'Ember Relay', render: R.CIRCUIT, tex: 'relay_top_on', light: 0, sound: 'wood', itemSprite: 'item_relay', select: () => box16(0, 0, 0, 16, 2, 16),
  collide: () => [box16(0, 0, 0, 16, 2, 16)], solid: true, drops: () => [[ITEM_IDS.relay, 1, 0]],
}));
defBlock(128, 'piston', { name: 'Piston', render: R.CIRCUIT, tex: (m, f) => f === 1 ? 'piston_top' : f === 0 ? 'piston_bottom' : 'piston_side', opaque: false, opacity: 15, hardness: 0.5, sound: 'stone', itemMetaMask: 0,
  collide: (m) => [pistonBaseBox(m)], select: (m) => pistonBaseBox(m), drops: () => [[B.PISTON, 1, 0]] });
defBlock(129, 'sticky_piston', { name: 'Sticky Piston', render: R.CIRCUIT, tex: (m, f) => f === 1 ? 'piston_top_sticky' : f === 0 ? 'piston_bottom' : 'piston_side', opaque: false, opacity: 15, hardness: 0.5, sound: 'stone', itemMetaMask: 0,
  collide: (m) => [pistonBaseBox(m)], select: (m) => pistonBaseBox(m), drops: () => [[B.STICKY_PISTON, 1, 0]] });
defBlock(130, 'piston_head', { name: 'Piston Head', render: R.CIRCUIT, tex: 'piston_side', opaque: false, opacity: 0, hardness: 0.5, sound: 'stone',
  collide: (m) => pistonHeadBoxes(m), select: (m) => pistonHeadBoxes(m)[0], drops: () => [] });
defBlock(131, 'piston_moving', { name: 'Moving Block', render: R.NONE, tex: 'piston_side', opaque: false, solid: false, opacity: 0, hardness: -1, tileEntity: 'moving', select: () => null, drops: () => [] });
defBlock(127, 'note_block', { name: 'Note Block', tex: 'note_block', hardness: 0.8, tool: 'axe', sound: 'wood', flammable: 5, burnSpeed: 5, drops: () => [[B.NOTE_BLOCK, 1, 0]] });

// -------------------------------------------------------------------------
// Derived lookup tables for fast access in hot loops
// -------------------------------------------------------------------------
const BT = {
  opaque: new Uint8Array(256),     // full opaque cube (face culling + AO)
  solid: new Uint8Array(256),      // has collision
  opacity: new Uint8Array(256),
  light: new Uint8Array(256),
  render: new Uint8Array(256),
  pass: new Uint8Array(256),       // 0 opaque, 1 cutout, 2 translucent
  replaceable: new Uint8Array(256),
  fluid: new Uint8Array(256),
  tint: new Uint8Array(256),       // 0 none, 1 grass, 2 foliage, 3 water, 4 lily, 5 birch, 6 spruce
};
const TINT_IDS = { grass: 1, foliage: 2, water: 3, lily: 4 };
for (let i = 0; i < 256; i++) {
  const d = BLOCKS[i];
  if (!d) { BT.solid[i] = 0; continue; }
  BT.opaque[i] = (d.opaque && d.render === R.CUBE && !d.cutout && !d.translucent) ? 1 : 0;
  BT.solid[i] = d.solid ? 1 : 0;
  BT.opacity[i] = d.opacity;
  BT.light[i] = d.light;
  BT.render[i] = d.render;
  BT.pass[i] = d.translucent ? 2 : (d.cutout ? 1 : 0);
  BT.replaceable[i] = d.replaceable ? 1 : 0;
  BT.fluid[i] = d.fluid ? 1 : 0;
  BT.tint[i] = d.tint ? (TINT_IDS[d.tint] || 0) : 0;
}

function blockName(id, meta) {
  const d = BLOCKS[id];
  return d ? d.nameFn(meta | 0) : 'Unknown';
}
function isFluid(id) { return id === B.WATER || id === B.LAVA; }

// Compact table for the world-gen worker (ids + a few flags)
function workerBlockTable() {
  const ids = {};
  for (const k in B) ids[k] = B[k];
  return { ids, opaque: Array.from(BT.opaque), solid: Array.from(BT.solid), replaceable: Array.from(BT.replaceable), opacity: Array.from(BT.opacity) };
}
