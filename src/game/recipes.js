'use strict';
// ---------------------------------------------------------------------------
// Crafting & smelting recipes
// Ingredient refs: [id, dmg] where dmg = -1 means "any variant"
// ---------------------------------------------------------------------------
const RECIPES = [];
const SMELTING = [];

const Recipes = (() => {
  const I = ITEM_IDS;
  const ANY = -1;
  const ref = (x) => Array.isArray(x) ? x : [x, ANY];
  function shaped(result, pattern, keys, opts) {
    const k = {};
    for (const c in keys) k[c] = ref(keys[c]);
    RECIPES.push({ type: 'shaped', result: { id: result[0], count: result[1] || 1, dmg: result[2] || 0 }, pattern, keys: k, w: Math.max(...pattern.map((r) => r.length)), h: pattern.length, copyDmg: opts && opts.copyDmg });
  }
  function shapeless(result, ingredients, opts) {
    RECIPES.push({ type: 'shapeless', result: { id: result[0], count: result[1] || 1, dmg: result[2] || 0 }, ingredients: ingredients.map(ref), copyDmg: opts && opts.copyDmg });
  }
  function smelt(input, output, xp) { SMELTING.push({ input: ref(input), output: { id: output[0], count: output[1] || 1, dmg: output[2] || 0 }, xp: xp || 0.1 }); }

  // ---------------- wood basics ----------------
  for (let t = 0; t < 6; t++) shapeless([B.PLANKS, 4, t], [[B.LOG, t]]);
  shaped([I.stick, 4], ['#', '#'], { '#': B.PLANKS });
  shaped([B.CRAFTING_TABLE, 1], ['##', '##'], { '#': B.PLANKS });
  shaped([B.CHEST, 1], ['###', '# #', '###'], { '#': B.PLANKS });
  shaped([B.FURNACE, 1], ['###', '# #', '###'], { '#': B.COBBLESTONE });
  shaped([B.TORCH, 4], ['X', '#'], { X: I.coal, '#': I.stick });
  shaped([B.TORCH, 2], ['X', '#'], { X: I.ember_dust, '#': I.stick });
  shaped([I.bowl, 4], ['# #', ' # '], { '#': B.PLANKS });
  shaped([B.LADDER, 3], ['# #', '###', '# #'], { '#': I.stick });
  for (let t = 0; t < 6; t++) {
    shaped([B.FENCE, 3, t], ['W#W', 'W#W'], { W: [B.PLANKS, t], '#': I.stick });
    shaped([B.SLAB, 6, t], ['###'], { '#': [B.PLANKS, t] });
    shaped([B.STAIRS, 4, t], ['#  ', '## ', '###'], { '#': [B.PLANKS, t] });
  }
  shaped([B.FENCE_GATE, 1], ['#W#', '#W#'], { W: B.PLANKS, '#': I.stick });
  shaped([I.door_wood, 3], ['##', '##', '##'], { '#': B.PLANKS });
  shaped([I.door_iron, 3], ['##', '##', '##'], { '#': I.iron_ingot });
  shaped([B.TRAPDOOR, 2], ['###', '###'], { '#': B.PLANKS });
  shaped([I.bed, 1], ['WWW', 'PPP'], { W: B.WOOL, P: B.PLANKS });
  shaped([B.BOOKSHELF, 1], ['###', 'XXX', '###'], { '#': B.PLANKS, X: I.book });

  // ---------------- tools & armour ----------------
  const toolMats = [['wood', [B.PLANKS, ANY]], ['stone', [B.COBBLESTONE, ANY]], ['iron', [I.iron_ingot, ANY]], ['gold', [I.gold_ingot, ANY]], ['diamond', [I.diamond, ANY]], ['cobalt', [I.cobalt_ingot, ANY]], ['starmetal', [I.starmetal_ingot, ANY]]];
  for (const [m, x] of toolMats) {
    shaped([I[m + '_pickaxe']], ['XXX', ' # ', ' # '], { X: x, '#': I.stick });
    shaped([I[m + '_axe']], ['XX', 'X#', ' #'], { X: x, '#': I.stick });
    shaped([I[m + '_shovel']], ['X', '#', '#'], { X: x, '#': I.stick });
    shaped([I[m + '_hoe']], ['XX', ' #', ' #'], { X: x, '#': I.stick });
    shaped([I[m + '_sword']], ['X', 'X', '#'], { X: x, '#': I.stick });
  }
  shaped([I.stone_pickaxe], ['XXX', ' # ', ' # '], { X: B.SLATE, '#': I.stick });
  const armorMats = [['leather', I.leather], ['iron', I.iron_ingot], ['gold', I.gold_ingot], ['diamond', I.diamond], ['cobalt', I.cobalt_ingot], ['starmetal', I.starmetal_ingot]];
  for (const [m, x] of armorMats) {
    shaped([I[m + '_helmet']], ['XXX', 'X X'], { X: x });
    shaped([I[m + '_chestplate']], ['X X', 'XXX', 'XXX'], { X: x });
    shaped([I[m + '_leggings']], ['XXX', 'X X', 'X X'], { X: x });
    shaped([I[m + '_boots']], ['X X', 'X X'], { X: x });
  }
  shaped([I.bucket], ['X X', ' X '], { X: I.iron_ingot });
  shaped([I.shears], [' X', 'X '], { X: I.iron_ingot });
  shapeless([I.flint_and_steel], [I.iron_ingot, I.flint]);
  shaped([I.bow], [' #S', '# S', ' #S'], { '#': I.stick, S: I.string });
  shaped([I.arrow, 4], ['F', '#', 'E'], { F: I.flint, '#': I.stick, E: I.feather });
  shaped([I.compass], [' I ', 'IEI', ' I '], { I: I.iron_ingot, E: I.ember_dust });
  shaped([I.clock], [' G ', 'GEG', ' G '], { G: I.gold_ingot, E: I.ember_dust });

  // ---------------- food ----------------
  shaped([I.bread], ['WWW'], { W: I.wheat });
  shapeless([I.cookie, 8], [I.wheat, I.sugar, I.wheat]);
  shapeless([I.sugar], [I.sugar_cane]);
  shapeless([I.mushroom_stew], [I.bowl, B.MUSHROOM_BROWN, B.MUSHROOM_RED]);
  shapeless([I.glow_berries], [I.bowl, B.GLOWSHROOM, B.GLOWSHROOM]);
  shaped([I.golden_apple], ['###', '#A#', '###'], { '#': I.gold_ingot, A: I.apple });
  shapeless([I.pumpkin_pie], [B.PUMPKIN, I.sugar, I.egg]);
  shapeless([I.berry_pie], [I.berries, I.berries, I.wheat, I.sugar]);
  for (const meat of [I.porkchop, I.beef, I.mutton, I.venison, I.chicken, I.rotten_flesh]) shapeless([I.jerky, 2], [I.salt, meat]);

  // ---------------- storage blocks ----------------
  const block9 = (blk, item, dmg) => { shaped([blk], ['###', '###', '###'], { '#': dmg === undefined ? item : [item, dmg] }); shapeless([item, 9, dmg || 0], [blk]); };
  block9(B.IRON_BLOCK, I.iron_ingot); block9(B.GOLD_BLOCK, I.gold_ingot); block9(B.DIAMOND_BLOCK, I.diamond);
  block9(B.LAPIS_BLOCK, I.dye, 11); block9(B.JADE_BLOCK, I.jade); block9(B.COBALT_BLOCK, I.cobalt_ingot);
  block9(B.COAL_BLOCK, I.coal, 0); block9(B.STARMETAL_BLOCK, I.starmetal_ingot); block9(B.EMBER_BLOCK, I.ember_dust);
  block9(B.SULFUR_BLOCK, I.sulfur); block9(B.HAY_BALE, I.wheat);
  shaped([I.gold_ingot], ['###', '###', '###'], { '#': I.gold_nugget });
  shapeless([I.gold_nugget, 9], [I.gold_ingot]);
  shaped([B.MELON], ['###', '###', '###'], { '#': I.melon_slice });

  // ---------------- building ----------------
  shaped([B.STONE_BRICKS, 4, 0], ['##', '##'], { '#': B.STONE });
  shaped([B.STONE_BRICKS, 1, 3], ['#', '#'], { '#': [B.SLAB, 8] });
  shapeless([B.STONE_BRICKS, 1, 1], [[B.STONE_BRICKS, 0], B.VINE]);
  shapeless([B.MOSSY_COBBLESTONE, 1], [B.COBBLESTONE, B.VINE]);
  shaped([B.BRICKS], ['##', '##'], { '#': I.brick });
  shaped([B.CLAY], ['##', '##'], { '#': I.clay_ball });
  shaped([B.SNOW], ['##', '##'], { '#': I.snowball });
  shaped([B.SANDSTONE, 1, 0], ['##', '##'], { '#': [B.SAND, 0] });
  shaped([B.SANDSTONE, 4, 2], ['##', '##'], { '#': [B.SANDSTONE, 0] });
  shaped([B.SANDSTONE, 1, 1], ['#', '#'], { '#': [B.SLAB, 10] });
  shaped([B.RED_SANDSTONE, 1, 0], ['##', '##'], { '#': [B.SAND, 1] });
  shaped([B.RED_SANDSTONE, 4, 2], ['##', '##'], { '#': [B.RED_SANDSTONE, 0] });
  shaped([B.RED_SANDSTONE, 1, 1], ['#', '#'], { '#': [B.SLAB, 11] });
  shaped([B.GLASS_PANE, 16], ['###', '###'], { '#': B.GLASS });
  shaped([B.SLATE_BRICKS, 4], ['##', '##'], { '#': B.SLATE });
  shaped([B.MARBLE_BRICKS, 4, 0], ['##', '##'], { '#': B.MARBLE });
  shaped([B.MARBLE_BRICKS, 2, 1], ['#', '#'], { '#': B.MARBLE });
  shaped([B.MARBLE_BRICKS, 1, 2], ['#', '#'], { '#': [B.SLAB, 13] });
  shaped([B.POLISHED_BASALT, 4], ['##', '##'], { '#': B.BASALT });
  shaped([B.THATCH, 4], ['##', '##'], { '#': I.cattail_fiber });
  shaped([B.THATCH, 2], ['##', '##'], { '#': I.wheat });
  shapeless([I.cattail_fiber, 3], [B.CATTAIL]);
  shaped([I.string, 1], ['##'], { '#': I.cattail_fiber });
  shaped([B.ROPE, 4], ['#', '#', '#'], { '#': I.string });
  shaped([B.ROPE, 2], ['#', '#', '#'], { '#': I.cattail_fiber });
  shaped([B.LUMITE_LAMP], ['##', '##'], { '#': I.lumite_shard });
  shapeless([B.JACK_O_LANTERN], [B.PUMPKIN, B.TORCH]);
  shaped([B.DIRT, 4, 1], ['DG', 'GD'], { D: [B.DIRT, 0], G: B.GRAVEL });
  shaped([B.WOOL, 1, 0], ['##', '##'], { '#': I.string });
  for (let c = 0; c < 16; c++) {
    shaped([B.CARPET, 3, c], ['##'], { '#': [B.WOOL, c] });
    const dyeDmg = c === 0 ? 0 : c;
    if (c !== 0) shapeless([B.WOOL, 1, c], [[I.dye, dyeDmg], [B.WOOL, 0]]);
    shaped([B.STAINED_GLASS, 8, c], ['###', '#D#', '###'], { '#': B.GLASS, D: [I.dye, dyeDmg] });
    shaped([B.TERRACOTTA, 8, c + 1], ['###', '#D#', '###'], { '#': [B.TERRACOTTA, 0], D: [I.dye, dyeDmg] });
  }
  // slabs & stairs for stone-like materials
  const mats = [[6, [B.STONE, ANY]], [7, [B.COBBLESTONE, ANY]], [8, [B.STONE_BRICKS, 0]], [9, [B.BRICKS, ANY]], [10, [B.SANDSTONE, ANY]], [11, [B.RED_SANDSTONE, ANY]],
    [12, [B.SLATE_BRICKS, ANY]], [13, [B.MARBLE_BRICKS, 0]], [14, [B.POLISHED_BASALT, ANY]], [15, [B.MOSSY_COBBLESTONE, ANY]], [16, [B.THATCH, ANY]]];
  for (const [m, x] of mats) {
    shaped([B.SLAB, 6, m], ['###'], { '#': x });
    if (m !== 6) shaped([B.STAIRS, 4, m], ['#  ', '## ', '###'], { '#': x });
  }

  // ---------------- dyes ----------------
  const flowerDye = [14, 4, 3, 8, 10, 1, 9, 2];
  for (let f = 0; f < 8; f++) shapeless([I.dye, 2, flowerDye[f]], [[B.FLOWER, f]]);
  shapeless([I.dye, 3, 0], [I.bone]);
  shapeless([I.dye, 1, 15], [[I.coal, ANY]]);
  shapeless([I.dye, 2, 12], [B.PEAT]);
  shapeless([I.dye, 2, 4], [I.sulfur]);
  const mix = (a, b, out, n) => shapeless([I.dye, n || 2, out], [[I.dye, a], [I.dye, b]]);
  mix(14, 0, 6); mix(4, 11, 13); mix(11, 0, 3); mix(14, 4, 1); mix(15, 0, 7); mix(7, 0, 8); mix(11, 13, 9); mix(14, 11, 10); mix(10, 6, 2); mix(13, 0, 5);

  // ---------------- explosives & misc ----------------
  shaped([B.TNT], ['GSG', 'SGS', 'GSG'], { G: I.gunpowder, S: B.SAND });
  shapeless([I.gunpowder, 2], [I.sulfur, [I.coal, ANY]]);
  shaped([I.paper, 3], ['###'], { '#': I.sugar_cane });
  shapeless([I.book], [I.paper, I.paper, I.paper, I.leather]);
  shaped([I.prospector_rod], ['  J', ' S ', 'S  '], { J: I.jade, S: I.stick });
  shaped([I.wayfinder], [' J ', 'JCJ', ' J '], { J: I.jade, C: I.compass });
  shapeless([I.journal], [I.book, I.jade]);
  shaped([I.map], ['PPP', 'PCP', 'PPP'], { P: I.paper, C: I.compass });
  shaped([B.SLAB, 6, 16], ['###'], { '#': B.THATCH });

  // ---------------- smelting ----------------
  smelt(B.COBBLESTONE, [B.STONE], 0.1);
  smelt(B.SAND, [B.GLASS], 0.1);
  smelt(B.ASH, [B.GLASS], 0.1);
  smelt(I.clay_ball, [I.brick], 0.3);
  smelt(B.CLAY, [B.TERRACOTTA, 1, 0], 0.35);
  smelt(B.LOG, [I.coal, 1, 1], 0.15);
  smelt(B.IRON_ORE, [I.iron_ingot], 0.7);
  smelt(B.GOLD_ORE, [I.gold_ingot], 1.0);
  smelt(B.DIAMOND_ORE, [I.diamond], 1.0);
  smelt(B.LAPIS_ORE, [I.dye, 1, 11], 0.2);
  smelt(B.COAL_ORE, [I.coal], 0.1);
  smelt(B.EMBER_ORE, [I.ember_dust, 2], 0.7);
  smelt(B.JADE_ORE, [I.jade], 1.0);
  smelt(B.COBALT_ORE, [I.cobalt_ingot], 1.0);
  smelt(B.SULFUR_ORE, [I.sulfur, 2], 0.2);
  smelt(B.STARMETAL_ORE, [I.starmetal_ingot], 2.0);
  smelt(B.CACTUS, [I.dye, 1, 13], 0.2);
  smelt(I.porkchop, [I.cooked_porkchop], 0.35);
  smelt(I.beef, [I.steak], 0.35);
  smelt(I.chicken, [I.cooked_chicken], 0.35);
  smelt(I.mutton, [I.cooked_mutton], 0.35);
  smelt(I.fish, [I.cooked_fish], 0.35);
  smelt(I.venison, [I.cooked_venison], 0.35);
  smelt(I.potato, [I.baked_potato], 0.35);
  smelt([B.STONE_BRICKS, 0], [B.STONE_BRICKS, 1, 2], 0.1);
  smelt(B.QUICKSAND, [B.SAND], 0.1);
  smelt(B.SLATE, [B.SLATE_BRICKS], 0.1);

  // ---------------- matching ----------------
  function matches(r, s) {
    if (!s) return false;
    if (s.id !== r[0]) return false;
    return r[1] === ANY || r[1] === s.dmg;
  }
  // grid: array of w*h stacks (row-major)
  function find(grid, gw, gh) {
    // bounding box
    let x0 = gw, y0 = gh, x1 = -1, y1 = -1, n = 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (grid[y * gw + x]) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (!n) return null;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    for (const r of RECIPES) {
      if (r.type === 'shaped') {
        if (r.w !== w || r.h !== h) continue;
        for (let mir = 0; mir < 2; mir++) {
          let ok = true;
          for (let y = 0; y < h && ok; y++) for (let x = 0; x < w && ok; x++) {
            const px = mir ? w - 1 - x : x;
            const ch = (r.pattern[y][px] || ' ');
            const s = grid[(y + y0) * gw + (x + x0)];
            if (ch === ' ') { if (s) ok = false; }
            else if (!matches(r.keys[ch], s)) ok = false;
          }
          if (ok) return r;
        }
      } else {
        if (r.ingredients.length !== n) continue;
        const used = new Array(gw * gh).fill(false);
        let ok = true;
        for (const ing of r.ingredients) {
          let found = false;
          for (let i = 0; i < gw * gh; i++) if (!used[i] && matches(ing, grid[i])) { used[i] = true; found = true; break; }
          if (!found) { ok = false; break; }
        }
        if (ok) return r;
      }
    }
    return null;
  }
  function result(grid, gw, gh) {
    const r = find(grid, gw, gh);
    if (!r) return null;
    return new ItemStack(r.result.id, r.result.count, r.result.dmg);
  }
  function smeltResult(stack) {
    if (!stack) return null;
    for (const s of SMELTING) if (matches(s.input, stack)) return s;
    return null;
  }
  // recipes that use or produce an item (for the journal / recipe hints)
  function recipesFor(id) { return RECIPES.filter((r) => r.result.id === id); }
  return { find, result, smeltResult, recipesFor, ANY };
})();
