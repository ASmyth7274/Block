'use strict';
// ---------------------------------------------------------------------------
// Block behaviours: placement, interaction, ticking, fluids, explosions
// ---------------------------------------------------------------------------
const Behaviors = (() => {
  const I = ITEM_IDS;
  const H4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  const isSolidTop = (w, x, y, z) => {
    const id = w.getBlock(x, y, z);
    if (BT.opaque[id]) return true;
    if (id === B.SLAB) return (w.getMeta(x, y, z) & 32) !== 0;
    if (id === B.STAIRS) return (w.getMeta(x, y, z) & 4) !== 0;
    return id === B.FENCE || id === B.GLASS || id === B.STAINED_GLASS || id === B.FARMLAND || id === B.ICE || id === B.PACKED_ICE || id === B.LEAVES || id === B.GLASS_PANE || id === B.HAY_BALE;
  };
  const playerFacing = (p) => {
    // horizontal facing index (0 N, 1 S, 2 W, 3 E) the player looks toward
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    if (Math.abs(fx) > Math.abs(fz)) return fx > 0 ? 3 : 2;
    return fz > 0 ? 1 : 0;
  };

  // ---------------------------------------------------------------- support rules
  function canStay(w, x, y, z, id, meta) {
    const below = w.getBlock(x, y - 1, z);
    switch (id) {
      case B.SAPLING: case B.TALL_GRASS: case B.FLOWER: case B.BRAMBLE:
        return below === B.GRASS || below === B.DIRT || below === B.PODZOL || below === B.FARMLAND || below === B.MYCELIUM || (id === B.FLOWER && meta === 7 && below === B.ASH);
      case B.DEAD_BUSH: return below === B.SAND || below === B.TERRACOTTA || below === B.DIRT || below === B.ASH || below === B.SALT || below === B.PODZOL || below === B.GRASS;
      case B.MUSHROOM_BROWN: case B.MUSHROOM_RED: case B.GLOWSHROOM:
        return BT.opaque[below] && (below === B.MYCELIUM || below === B.PODZOL || w.getLightLevel(x, y, z) < 13 || id === B.GLOWSHROOM);
      case B.LUMITE_CRYSTAL: return BT.opaque[below] || BT.opaque[w.getBlock(x, y + 1, z)];
      case B.CACTUS: {
        if (below !== B.SAND && below !== B.CACTUS) return false;
        for (const [dx, dz] of H4) if (BT.solid[w.getBlock(x + dx, y, z + dz)]) return false;
        return true;
      }
      case B.SUGAR_CANE: {
        if (below === B.SUGAR_CANE) return true;
        if (below !== B.GRASS && below !== B.DIRT && below !== B.SAND && below !== B.PODZOL) return false;
        for (const [dx, dz] of H4) if (w.getBlock(x + dx, y - 1, z + dz) === B.WATER) return true;
        return false;
      }
      case B.CATTAIL: {
        if (!BT.opaque[below]) return false;
        for (const [dx, dz] of H4) if (w.getBlock(x + dx, y - 1, z + dz) === B.WATER || w.getBlock(x + dx, y, z + dz) === B.WATER) return true;
        return false;
      }
      case B.WHEAT: case B.CARROTS: case B.POTATOES: return below === B.FARMLAND;
      case B.LILY_PAD: return below === B.WATER || below === B.ICE;
      case B.TORCH: {
        if (meta === 0) return isSolidTop(w, x, y - 1, z);
        const d = [null, [-1, 0], [1, 0], [0, -1], [0, 1]][meta];
        return d && BT.opaque[w.getBlock(x + d[0], y, z + d[1])];
      }
      case B.LADDER: {
        const back = [[0, 1], [0, -1], [1, 0], [-1, 0]][meta & 3];
        return BT.opaque[w.getBlock(x + back[0], y, z + back[1])];
      }
      case B.SNOW_LAYER: case B.CARPET: case B.LEAF_LITTER: return BT.solid[below] && below !== B.ICE && below !== B.PACKED_ICE || below === B.LEAVES;
      case B.DOOR_WOOD: case B.DOOR_IRON:
        if (meta & 8) return w.getBlock(x, y - 1, z) === id;
        return isSolidTop(w, x, y - 1, z) && w.getBlock(x, y + 1, z) === id;
      case B.ROPE: { const a = w.getBlock(x, y + 1, z); return a === B.ROPE || BT.solid[a]; }
      case B.SIGN: return BT.solid[below];
      case B.EMBER_TORCH: case B.EMBER_TORCH_OFF: return canStay(w, x, y, z, B.TORCH, meta);
      case B.EMBER_WIRE: case B.RELAY: case B.RELAY_ON: return isSolidTop(w, x, y - 1, z);
      case B.STONE_PLATE: case B.WOOD_PLATE: return isSolidTop(w, x, y - 1, z) || below === B.FENCE;
      case B.LEVER: case B.STONE_BUTTON: case B.WOOD_BUTTON: {
        const a = CIRCUIT_ATT[meta & 7] || CIRCUIT_ATT[0];
        const n = w.getBlock(x + a[0], y + a[1], z + a[2]);
        return (meta & 7) === 0 ? isSolidTop(w, x, y - 1, z) : BT.opaque[n];
      }
      case B.WALL_SIGN: { const d = HFACE_DIR[meta & 3]; return BT.solid[w.getBlock(x - d[0], y, z - d[1])]; }
      case B.FIRE: return BT.solid[below] || neighbourFlammable(w, x, y, z);
      case B.VINE: return true;
    }
    return true;
  }
  function neighbourFlammable(w, x, y, z) {
    for (const d of FACE_DIR) { const id = w.getBlock(x + d[0], y + d[1], z + d[2]); if (BLOCKS[id] && BLOCKS[id].flammable > 0) return true; }
    return false;
  }

  // ---------------------------------------------------------------- placement
  // returns meta to place, or -1 if invalid. ctx: {face, hitY, player}
  function placeMeta(w, id, dmg, x, y, z, ctx) {
    const f = ctx.face, p = ctx.player;
    const pf = playerFacing(p);
    switch (id) {
      case B.LOG: case B.HAY_BALE: { const axis = f <= 1 ? 0 : (f >= 4 ? 1 : 2); return (dmg & 7) | (axis << 3); }
      case B.STAIRS: {
        const up = f === 0 || (f >= 2 && ctx.hitY > 0.5);
        return pf | (up ? 4 : 0) | ((dmg & 31) << 3);
      }
      case B.SLAB: { const top = f === 0 || (f >= 2 && ctx.hitY > 0.5); return (dmg & 31) | (top ? 32 : 0); }
      case B.LEVER: case B.STONE_BUTTON: case B.WOOD_BUTTON: {
        const want = [5, 0, 4, 3, 2, 1][f];
        const axis = (id === B.LEVER && (want === 0 || want === 5) && pf >= 2) ? 16 : 0;
        if (canStay(w, x, y, z, id, want)) return want | axis;
        for (const mm of [0, 1, 2, 3, 4, 5]) if (canStay(w, x, y, z, id, mm)) return mm;
        return -1;
      }
      case B.TORCH: case B.EMBER_TORCH: {
        const m = [-1, 0, 4, 3, 2, 1][f];
        if (m < 0) return -1;
        if (!canStay(w, x, y, z, id, m)) {
          if (canStay(w, x, y, z, id, 0)) return 0;
          for (let mm = 1; mm <= 4; mm++) if (canStay(w, x, y, z, id, mm)) return mm;
          return -1;
        }
        return m;
      }
      case B.LADDER: {
        let m = [-1, -1, 0, 1, 2, 3][f];
        if (m < 0 || !canStay(w, x, y, z, id, m)) { m = -1; for (let mm = 0; mm < 4; mm++) if (canStay(w, x, y, z, id, mm)) { m = mm; break; } }
        return m;
      }
      case B.FURNACE: case B.CHEST: case B.PUMPKIN: case B.JACK_O_LANTERN: return HFACE_OPP[pf];
      case B.PISTON: case B.STICKY_PISTON: {
        if (p.pitch < -0.85) return 1;
        if (p.pitch > 0.85) return 0;
        return HFACE[HFACE_OPP[pf]];
      }
      case B.FENCE_GATE: return pf;
      case B.TRAPDOOR: {
        if (f >= 2) return [0, 0, 0, 1, 2, 3][f] | (ctx.hitY > 0.5 ? 8 : 0);
        return [1, 0, 3, 2][pf] | (f === 0 ? 8 : 0);
      }
      case B.LEAVES: return (dmg & 7) | 8;
      case B.VINE: {
        const m = [0, 0, 1, 4, 8, 2][f];
        if (!m) return -1;
        const d = { 1: [0, 1], 2: [-1, 0], 4: [0, -1], 8: [1, 0] }[m];
        if (!BT.opaque[w.getBlock(x + d[0], y, z + d[1])]) return -1;
        return m;
      }
      case B.SNOW_LAYER: return 0;
      case B.SAPLING: return dmg & 7;
    }
    const d = BLOCKS[id];
    return dmg & (d.itemMetaMask || 0) || (d.variants ? dmg : 0);
  }

  // Attempt to place a block item. Returns true on success.
  function tryPlace(game, player, stack, hit) {
    const w = game.world;
    let id = stack.id, dmg = stack.dmg;
    const def = BLOCKS[id];
    if (!def) return false;
    let x = hit.x, y = hit.y, z = hit.z;
    const targetId = w.getBlock(x, y, z), targetMeta = w.getMeta(x, y, z);
    // slab merging
    if (id === B.SLAB && targetId === B.SLAB && (targetMeta & 31) === (dmg & 31)) {
      const top = (targetMeta & 32) !== 0;
      if ((hit.face === 1 && !top) || (hit.face === 0 && top)) { return finishPlace(game, player, stack, x, y, z, B.DOUBLE_SLAB, dmg & 31); }
    }
    // snow layers stack
    if (id === B.SNOW_LAYER && targetId === B.SNOW_LAYER && hit.face === 1) {
      const m = targetMeta & 7;
      if (m < 7) return finishPlace(game, player, stack, x, y, z, B.SNOW_LAYER, m + 1);
      return finishPlace(game, player, stack, x, y + 1, z, B.SNOW_LAYER, 0);
    }
    if (!BT.replaceable[targetId] || targetId === B.LAVA && id !== B.WATER) {
      const d = FACE_DIR[hit.face];
      x += d[0]; y += d[1]; z += d[2];
    }
    if (y < 0 || y >= CH_H) return false;
    const cur = w.getBlock(x, y, z);
    if (!BT.replaceable[cur]) {
      if (id === B.SLAB && cur === B.SLAB && (w.getMeta(x, y, z) & 31) === (dmg & 31)) return finishPlace(game, player, stack, x, y, z, B.DOUBLE_SLAB, dmg & 31);
      return false;
    }
    if (cur === id && id !== B.SNOW_LAYER) return false;
    const meta = placeMeta(w, id, dmg, x, y, z, { face: hit.face, hitY: hit.hy - Math.floor(hit.hy), player });
    if (meta < 0) return false;
    if (!canStay(w, x, y, z, id, meta)) return false;
    // don't place solid blocks inside entities
    if (BT.solid[id]) {
      const boxes = [];
      blockCollisionBoxes(w, x, y, z, id, meta, boxes);
      for (const e of w.entities) {
        if (e.removed || e.dead || !e.blocksPlacement) continue;
        e.updateBox();
        for (const b of boxes) if (b.intersects(e.box)) return false;
      }
      if (!player.flying || true) { player.updateBox(); for (const b of boxes) if (b.intersects(player.box) && player.gameMode !== 'spectator') return false; }
    }
    return finishPlace(game, player, stack, x, y, z, id, meta);
  }
  function finishPlace(game, player, stack, x, y, z, id, meta) {
    const w = game.world;
    w.setBlock(x, y, z, id, meta);
    if (id === B.WATER || id === B.LAVA) w.scheduleTick(x, y, z, tickRate(id));
    const d = BLOCKS[id];
    game.audio.playBlock(d.sound, 'place', x + 0.5, y + 0.5, z + 0.5);
    if (!player.creative) player.inventory.decrementHeld(1);
    game.onBlockPlaced(id, meta, x, y, z);
    return true;
  }
  // items that place blocks (seeds, doors, beds, buckets...)
  function useItemOnBlock(game, player, stack, hit) {
    const w = game.world;
    const def = ITEMS[stack.id];
    if (!def) return false;
    const tx = hit.x + FACE_DIR[hit.face][0], ty = hit.y + FACE_DIR[hit.face][1], tz = hit.z + FACE_DIR[hit.face][2];
    const target = w.getBlock(hit.x, hit.y, hit.z);
    // plants & crops
    if (def.plant) {
      const p = def.plant;
      let x = tx, y = ty, z = tz;
      if (BT.replaceable[target] && target !== B.WATER) { x = hit.x; y = hit.y; z = hit.z; }
      if (!BT.replaceable[w.getBlock(x, y, z)] || w.getBlock(x, y, z) === B.WATER) return false;
      if (!p.on.includes(w.getBlock(x, y - 1, z))) return false;
      if (!canStay(w, x, y, z, p.block, 0)) return false;
      w.setBlock(x, y, z, p.block, 0);
      game.audio.playBlock('grass', 'place', x + 0.5, y + 0.5, z + 0.5);
      if (!player.creative) player.inventory.decrementHeld(1);
      return true;
    }
    if (def.places === 'door') {
      let x = tx, y = ty, z = tz;
      if (BT.replaceable[target]) { x = hit.x; y = hit.y; z = hit.z; }
      if (!BT.replaceable[w.getBlock(x, y, z)] || !BT.replaceable[w.getBlock(x, y + 1, z)] || y + 1 >= CH_H) return false;
      if (!isSolidTop(w, x, y - 1, z)) return false;
      const f = playerFacing(player);
      // hinge on the side with a solid block / away from other doors
      const right = [[1, 0], [-1, 0], [0, -1], [0, 1]][f];
      const hingeRight = BT.opaque[w.getBlock(x + right[0], y, z + right[1])] && !BT.opaque[w.getBlock(x - right[0], y, z - right[1])];
      const m = f | (hingeRight ? 16 : 0);
      w.setBlock(x, y, z, def.block, m, 4);
      w.setBlock(x, y + 1, z, def.block, m | 8, 4);
      w.notifyNeighbors(x, y, z, def.block); w.notifyNeighbors(x, y + 1, z, def.block);
      game.audio.playBlock(BLOCKS[def.block].sound, 'place', x + 0.5, y + 0.5, z + 0.5);
      if (!player.creative) player.inventory.decrementHeld(1);
      return true;
    }
    if (def.places === 'bed') {
      if (hit.face !== 1) return false;
      const f = playerFacing(player);
      const d = HFACE_DIR[f];
      const x = tx, y = ty, z = tz, hx = x + d[0], hz = z + d[1];
      if (!BT.replaceable[w.getBlock(x, y, z)] || !BT.replaceable[w.getBlock(hx, y, hz)]) return false;
      if (!isSolidTop(w, x, y - 1, z) || !isSolidTop(w, hx, y - 1, hz)) return false;
      w.setBlock(x, y, z, B.BED, f, 4); w.setBlock(hx, y, hz, B.BED, f | 4, 4);
      game.audio.playBlock('wood', 'place', x + 0.5, y + 0.5, z + 0.5);
      if (!player.creative) player.inventory.decrementHeld(1);
      return true;
    }
    if (def.places === 'wire' || def.places === 'relay') {
      let x = tx, y = ty, z = tz;
      if (BT.replaceable[target] && !BT.fluid[target]) { x = hit.x; y = hit.y; z = hit.z; }
      const cur = w.getBlock(x, y, z);
      if (!BT.replaceable[cur] || BT.fluid[cur] || cur === B.EMBER_WIRE) return false;
      const bid = def.places === 'wire' ? B.EMBER_WIRE : B.RELAY;
      if (!canStay(w, x, y, z, bid, 0)) return false;
      w.setBlock(x, y, z, bid, bid === B.RELAY ? playerFacing(player) : 0);
      game.audio.playBlock(bid === B.RELAY ? 'wood' : 'stone', 'place', x + 0.5, y + 0.5, z + 0.5);
      if (!player.creative) player.inventory.decrementHeld(1);
      return true;
    }
    if (def.places === 'sign') {
      if (hit.face === 0) return false;
      let x = tx, y = ty, z = tz, face = hit.face;
      if (BT.replaceable[target] && target !== B.WATER && target !== B.LAVA) { x = hit.x; y = hit.y; z = hit.z; face = 1; }
      if (!BT.replaceable[w.getBlock(x, y, z)] || BT.fluid[w.getBlock(x, y, z)] || y >= CH_H) return false;
      const wood = stack.dmg & 7;
      let id, meta;
      if (face === 1) {
        if (!BT.solid[w.getBlock(x, y - 1, z)]) return false;
        id = B.SIGN; meta = (Math.floor(16 - player.yaw / (Math.PI / 8) + 0.5) & 15) | (wood << 4);
      } else {
        id = B.WALL_SIGN; meta = [0, 0, 0, 1, 2, 3][face] | (wood << 2);
        if (!canStay(w, x, y, z, id, meta)) return false;
      }
      w.setBlock(x, y, z, id, meta);
      game.audio.playBlock('wood', 'place', x + 0.5, y + 0.5, z + 0.5);
      if (!player.creative) player.inventory.decrementHeld(1);
      const te = w.getTile(x, y, z);
      if (te && game.openSignEditor) game.openSignEditor(te);
      return true;
    }
    if (stack.id === I.painting) {
      const e = Painting.place(game, hit);
      if (!e) return false;
      game.audio.playBlock('wood', 'place', e.cx, e.cy, e.cz);
      if (!player.creative) player.inventory.decrementHeld(1);
      return true;
    }
    if (stack.id === I.water_bucket || stack.id === I.lava_bucket) {
      let x = tx, y = ty, z = tz;
      if (BT.replaceable[target] && !BT.fluid[target]) { x = hit.x; y = hit.y; z = hit.z; }
      const cur = w.getBlock(x, y, z);
      if (!BT.replaceable[cur] && cur !== B.WATER && cur !== B.LAVA) return false;
      const fid = stack.id === I.water_bucket ? B.WATER : B.LAVA;
      if (cur !== 0 && cur !== fid && !BT.fluid[cur]) dropBlock(game, x, y, z, cur, w.getMeta(x, y, z));
      w.setBlock(x, y, z, fid, 0);
      w.scheduleTick(x, y, z, tickRate(fid));
      game.audio.play(fid === B.WATER ? 'bucket_empty' : 'bucket_empty_lava', 0.8);
      if (!player.creative) player.inventory.setHeld(new ItemStack(I.bucket, 1, 0));
      return true;
    }
    if (stack.id === I.flint_and_steel) {
      if (target === B.TNT) { w.setBlock(hit.x, hit.y, hit.z, 0); game.spawnEntity(new TNTEntity(w, hit.x + 0.5, hit.y, hit.z + 0.5, 80)); }
      else {
        if (w.getBlock(tx, ty, tz) !== 0) return false;
        w.setBlock(tx, ty, tz, B.FIRE, 0);
        w.scheduleTick(tx, ty, tz, 30 + Math.floor(Math.random() * 10));
      }
      game.audio.play('ignite', 0.8, 0.9 + Math.random() * 0.2);
      if (!player.creative) player.inventory.damageHeld(player, 1);
      return true;
    }
    if (stack.id === I.dye && stack.dmg === 0) return boneMeal(game, player, hit.x, hit.y, hit.z);
    if (stack.id === I.spawn_egg) {
      const t = MOB_TYPES[stack.dmg];
      if (!t || !MOB_CLASSES[t.key]) return false;
      let x = tx, y = ty, z = tz;
      if (BT.replaceable[target] && !BT.fluid[target]) { x = hit.x; y = hit.y; z = hit.z; }
      game.spawnMob(t.key, x + 0.5, y + (BT.solid[w.getBlock(x, y, z)] ? 1 : 0), z + 0.5, { fromEgg: true });
      if (!player.creative) player.inventory.decrementHeld(1);
      return true;
    }
    if (def.tool && def.tool.kind === 'hoe' && hit.face !== 0) {
      if ((target === B.GRASS || target === B.DIRT) && w.getBlock(hit.x, hit.y + 1, hit.z) === 0) {
        w.setBlock(hit.x, hit.y, hit.z, target === B.DIRT && w.getMeta(hit.x, hit.y, hit.z) === 1 ? B.DIRT : B.FARMLAND, 0);
        game.audio.playBlock('gravel', 'step', hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
        if (!player.creative) player.inventory.damageHeld(player, 1);
        return true;
      }
    }
    if (def.tool && def.tool.kind === 'shovel' && target === B.GRASS && hit.face !== 0 && w.getBlock(hit.x, hit.y + 1, hit.z) === 0 && false) return true;
    return false;
  }
  function boneMeal(game, player, x, y, z) {
    const w = game.world;
    const id = w.getBlock(x, y, z), m = w.getMeta(x, y, z);
    let used = false;
    if (id === B.SAPLING) { if (Math.random() < 0.45) growTree(w, x, y, z, m); used = true; }
    else if (id === B.WHEAT || id === B.CARROTS || id === B.POTATOES) { if (m < 7) { w.setMeta(x, y, z, Math.min(7, m + 2 + Math.floor(Math.random() * 3))); used = true; } }
    else if (id === B.BRAMBLE) { if (m < 3) { w.setMeta(x, y, z, 3); used = true; } }
    else if (id === B.GRASS) {
      used = true;
      for (let i = 0; i < 64; i++) {
        let px = x, py = y + 1, pz = z;
        let ok = true;
        for (let j = 0; j < i / 16; j++) {
          px += Math.floor(Math.random() * 3) - 1; py += Math.floor(Math.random() * 3 * Math.random() * 3 / 2) - 1 >> 1; pz += Math.floor(Math.random() * 3) - 1;
          if (w.getBlock(px, py - 1, pz) !== B.GRASS || BT.opaque[w.getBlock(px, py, pz)]) { ok = false; break; }
        }
        if (!ok || w.getBlock(px, py, pz) !== 0) continue;
        if (Math.random() < 0.85) w.setBlock(px, py, pz, B.TALL_GRASS, 1);
        else w.setBlock(px, py, pz, B.FLOWER, Math.random() < 0.5 ? 0 : 1);
      }
    } else if (id === B.MUSHROOM_BROWN || id === B.MUSHROOM_RED) { used = true; if (Math.random() < 0.4) growHugeMushroom(w, x, y, z, id === B.MUSHROOM_RED); }
    if (used) {
      game.particles.happy(x + 0.5, y + 0.5, z + 0.5);
      if (!player.creative) player.inventory.decrementHeld(1);
    }
    return used;
  }

  // ---------------------------------------------------------------- right-click on blocks
  function useBlock(game, player, hit) {
    const w = game.world;
    const { x, y, z } = hit;
    const id = w.getBlock(x, y, z), m = w.getMeta(x, y, z);
    switch (id) {
      case B.CRAFTING_TABLE: game.openScreen(new CraftingScreen(game, x, y, z)); return true;
      case B.FURNACE: case B.FURNACE_LIT: { const te = w.getTile(x, y, z); if (te) game.openScreen(new FurnaceScreen(game, te)); return true; }
      case B.CHEST: {
        const te = w.getTile(x, y, z);
        if (te) { if (BT.opaque[w.getBlock(x, y + 1, z)]) return true; game.openScreen(new ChestScreen(game, te)); }
        return true;
      }
      case B.DOOR_WOOD: case B.DOOR_IRON: {
        const lowerY = (m & 8) ? y - 1 : y;
        const lm = w.getMeta(x, lowerY, z);
        const nm = lm ^ 4;
        w.setBlock(x, lowerY, z, id, nm, 4);
        w.setBlock(x, lowerY + 1, z, id, nm | 8, 4);
        game.audio.play((nm & 4) ? 'door_open' : 'door_close', 0.9, 0.9 + Math.random() * 0.1);
        return true;
      }
      case B.TRAPDOOR: w.setMeta(x, y, z, m ^ 4, 4); game.audio.play((m & 4) ? 'door_close' : 'door_open', 0.9, 1.1); return true;
      case B.FENCE_GATE: {
        let nm = m ^ 4;
        if (nm & 4) { const pf = playerFacing(player); nm = (nm & ~3) | ((pf < 2) === ((m & 3) < 2) ? pf : (m & 3)); }
        w.setMeta(x, y, z, nm, 4); game.audio.play((nm & 4) ? 'door_open' : 'door_close', 0.9, 1.05); return true;
      }
      case B.BED: game.tryUseBed(x, y, z, m); return true;
      case B.EMBER_ORE: w.setBlock(x, y, z, B.EMBER_ORE_LIT, 0); return false;
      case B.TNT: {
        const h = player.inventory.held();
        if (h && h.id === I.flint_and_steel) { w.setBlock(x, y, z, 0); game.spawnEntity(new TNTEntity(w, x + 0.5, y, z + 0.5, 80)); game.audio.play('fuse', 1); if (!player.creative) player.inventory.damageHeld(player, 1); return true; }
        return false;
      }
      case B.RUNESTONE: game.useRunestone(x, y, z); return true;
      case B.LEVER: case B.STONE_BUTTON: case B.WOOD_BUTTON: case B.RELAY: case B.RELAY_ON: case B.NOTE_BLOCK:
        return Circuits.use(game, x, y, z, id);
      case B.BRAMBLE: {
        if (m >= 3) { w.setMeta(x, y, z, 0); dropStack(game, x + 0.5, y + 0.5, z + 0.5, new ItemStack(I.berries, 2 + Math.floor(Math.random() * 2), 0)); game.audio.playBlock('grass', 'break', x + 0.5, y + 0.5, z + 0.5); return true; }
        return false;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- drops
  function dropStack(game, x, y, z, stack) {
    if (!stack || stack.count <= 0) return;
    const e = new ItemEntity(game.world, x, y, z, stack);
    e.vx = (Math.random() - 0.5) * 0.2; e.vy = 0.2; e.vz = (Math.random() - 0.5) * 0.2;
    game.spawnEntity(e);
  }
  function dropBlock(game, x, y, z, id, meta, tool) {
    const d = BLOCKS[id];
    if (!d) return;
    const rng = game.world.rng;
    let drops;
    if (d.drops) drops = d.drops(meta, rng, tool);
    else { const pk = pickBlockItem(id, meta); drops = pk ? [[pk[0], 1, pk[1]]] : []; }
    for (const [did, n, dd] of drops) {
      if (n <= 0 || !itemExists(did)) continue;
      const s = new ItemStack(did, n, dd);
      const e = new ItemEntity(game.world, x + 0.5 + (rng.nextFloat() - 0.5) * 0.5, y + 0.5 + (rng.nextFloat() - 0.5) * 0.5, z + 0.5 + (rng.nextFloat() - 0.5) * 0.5, s);
      e.vx = (rng.nextFloat() - 0.5) * 0.2; e.vy = 0.2; e.vz = (rng.nextFloat() - 0.5) * 0.2;
      game.spawnEntity(e);
    }
    if (d.xp && game.player && !game.player.creative) {
      const xp = d.xp[0] + rng.nextInt(d.xp[1] - d.xp[0] + 1);
      if (xp > 0) game.spawnXP(x + 0.5, y + 0.5, z + 0.5, xp);
    }
  }

  // ---------------------------------------------------------------- removal & neighbour updates
  function onBroken(game, x, y, z, id, meta) {
    const w = game.world;
    // two-block structures
    if (id === B.DOOR_WOOD || id === B.DOOR_IRON) {
      const oy = (meta & 8) ? y - 1 : y + 1;
      if (w.getBlock(x, oy, z) === id) w.setBlock(x, oy, z, 0, 0, 4);
    }
    if (id === B.BED) {
      const d = HFACE_DIR[meta & 3];
      const s = (meta & 4) ? -1 : 1;
      const ox = x + d[0] * s, oz = z + d[1] * s;
      if (w.getBlock(ox, y, oz) === B.BED) w.setBlock(ox, y, oz, 0, 0, 4);
    }
    // ice melts into water when broken above something
    if (id === B.ICE && !game.player.creative) {
      if (BT.solid[w.getBlock(x, y - 1, z)] || BT.fluid[w.getBlock(x, y - 1, z)]) { w.setBlock(x, y, z, B.WATER, 0); w.scheduleTick(x, y, z, 5); }
    }
    if (id === B.LOG || id === B.LEAVES) markLeavesForDecay(w, x, y, z, id === B.LOG ? 4 : 1);
    if ((id === B.PISTON || id === B.STICKY_PISTON) && (meta & 8)) {
      const d = FACE_DIR[meta & 7];
      if (w.getBlock(x + d[0], y + d[1], z + d[2]) === B.PISTON_HEAD) w.setBlock(x + d[0], y + d[1], z + d[2], 0, 0);
    }
    if (id === B.PISTON_HEAD) {
      const d = FACE_DIR[meta & 7], bx = x - d[0], by = y - d[1], bz = z - d[2], b = w.getBlock(bx, by, bz);
      if (b === B.PISTON || b === B.STICKY_PISTON) {
        w.setBlock(bx, by, bz, 0, 0);
        if (!game.player.creative) dropBlock(game, bx, by, bz, b, 0, null);
      }
    }
    if (id === B.EMBER_ORE_LIT || id === B.EMBER_ORE) { /* nothing */ }
  }
  function markLeavesForDecay(w, x, y, z, r) {
    r = r || 1;
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
      const bx = x + dx, by = y + dy, bz = z + dz;
      if (w.getBlock(bx, by, bz) === B.LEAVES) {
        const m = w.getMeta(bx, by, bz);
        if (!(m & 8) && !(m & 16)) w.setBlock(bx, by, bz, B.LEAVES, m | 16, 4 | 2);
      }
    }
  }
  function neighborChanged(w, x, y, z, id, meta) {
    const game = w.game;
    if (!canStay(w, x, y, z, id, meta)) {
      if (id === B.FIRE) { w.setBlock(x, y, z, 0); return; }
      w.setBlock(x, y, z, 0);
      if (game && !w.menu) dropBlock(game, x, y, z, id, meta, null);
      return;
    }
    if (BLOCKS[id].gravity) w.scheduleTick(x, y, z, 2);
    if (id === B.WATER || id === B.LAVA) { if (!mixLiquids(w, x, y, z, id, meta)) w.scheduleTick(x, y, z, tickRate(id)); }
    if (typeof Circuits !== 'undefined' && Circuits.IS[id] && !w.menu) Circuits.changed(w, x, y, z);
    if (id === B.FARMLAND && BT.solid[w.getBlock(x, y + 1, z)] && BT.opaque[w.getBlock(x, y + 1, z)]) w.setBlock(x, y, z, B.DIRT, 0);
  }

  // ---------------------------------------------------------------- scheduled ticks
  function tickRate(id) { return id === B.LAVA ? 30 : 5; }
  function scheduledTick(w, x, y, z, id) {
    const cur = w.getBlock(x, y, z);
    if (cur !== id) return;
    const m = w.getMeta(x, y, z);
    if (BLOCKS[id].gravity) { fallCheck(w, x, y, z, id, m); return; }
    if (id === B.WATER || id === B.LAVA) { flow(w, x, y, z, id, m); return; }
    if (id === B.FIRE) { fireTick(w, x, y, z, m); return; }
    if (BLOCKS[id].circuitTick) BLOCKS[id].circuitTick(w, x, y, z, m);
  }
  function fallCheck(w, x, y, z, id, m) {
    const below = w.getBlock(x, y - 1, z);
    if (y > 0 && (below === 0 || BT.fluid[below] || below === B.FIRE || (BT.replaceable[below] && !BT.solid[below]))) {
      if (w.game && w.isLoaded(x, z)) {
        w.setBlock(x, y, z, 0, 0);
        w.game.spawnEntity(new FallingBlock(w, x + 0.5, y, z + 0.5, id, m));
      }
    }
  }

  // ---- classic fluid flow ----
  function fluidLevel(w, x, y, z, id) {
    if (w.getBlock(x, y, z) !== id) return -1;
    return w.getMeta(x, y, z);
  }
  function blocksFlow(w, x, y, z) {
    const id = w.getBlock(x, y, z);
    if (id === B.DOOR_WOOD || id === B.DOOR_IRON || id === B.LADDER || id === B.SUGAR_CANE) return true;
    if (id === 0) return false;
    if (BT.fluid[id]) return false;
    return BT.solid[id] || id === B.CACTUS;
  }
  function canFlowInto(w, x, y, z, id) {
    const t = w.getBlock(x, y, z);
    if (t === id) return false;
    if (t === B.LAVA || t === B.WATER) return true;
    return !blocksFlow(w, x, y, z);
  }
  function mixLiquids(w, x, y, z, id, m) {
    if (id !== B.LAVA) return false;
    for (let f = 1; f < 6; f++) {
      const d = FACE_DIR[f];
      if (w.getBlock(x + d[0], y + d[1], z + d[2]) === B.WATER) {
        const nb = m === 0 ? B.OBSIDIAN : (m <= 4 ? B.COBBLESTONE : -1);
        if (nb < 0) continue;
        w.setBlock(x, y, z, nb, 0);
        if (w.game) { w.game.audio.play('fizz', 0.5, 2.6 + (Math.random() - Math.random()) * 0.8); w.game.particles.smoke(x + 0.5, y + 1, z + 0.5, 8); }
        return true;
      }
    }
    return false;
  }
  function flow(w, x, y, z, id, m) {
    const decay = id === B.LAVA ? 2 : 1;
    let level = m;
    if (mixLiquids(w, x, y, z, id, m)) return;
    if (level > 0) {
      let minN = -100, sources = 0;
      for (const [dx, dz] of H4) {
        let l = fluidLevel(w, x + dx, y, z + dz, id);
        if (l < 0) continue;
        if (l === 0) sources++;
        if (l >= 8) l = 0;
        if (minN < 0 || l < minN) minN = l;
      }
      let nl = minN + decay;
      if (nl >= 8 || minN < 0) nl = -1;
      const above = fluidLevel(w, x, y + 1, z, id);
      if (above >= 0) nl = above >= 8 ? above : above + 8;
      if (sources >= 2 && id === B.WATER) {
        const below = w.getBlock(x, y - 1, z);
        if (BT.solid[below] || (below === id && w.getMeta(x, y - 1, z) === 0)) nl = 0;
      }
      if (id === B.LAVA && level < 8 && nl < 8 && nl > level && w.rng.nextInt(4) !== 0) { nl = level; }
      if (nl !== level) {
        level = nl;
        if (nl < 0) { w.setBlock(x, y, z, 0, 0); return; }
        w.setBlock(x, y, z, id, nl);
        w.scheduleTick(x, y, z, tickRate(id));
      }
    }
    // flow down
    if (y > 0 && canFlowInto(w, x, y - 1, z, id)) {
      const below = w.getBlock(x, y - 1, z);
      if (id === B.LAVA && below === B.WATER) { w.setBlock(x, y - 1, z, B.STONE, 0); if (w.game) w.game.audio.play('fizz', 0.5, 2.6); return; }
      if (below === B.LAVA && id === B.WATER) { w.setBlock(x, y - 1, z, w.getMeta(x, y - 1, z) === 0 ? B.OBSIDIAN : B.COBBLESTONE, 0); return; }
      destroyForFluid(w, x, y - 1, z);
      w.setBlock(x, y - 1, z, id, level >= 8 ? level : level + 8);
      w.scheduleTick(x, y - 1, z, tickRate(id));
    } else if (level >= 0 && (level === 0 || blocksFlow(w, x, y - 1, z) || (w.getBlock(x, y - 1, z) === id && w.getMeta(x, y - 1, z) === 0))) {
      let nl = level + decay;
      if (level >= 8) nl = 1;
      if (nl >= 8) return;
      const dirs = flowDirections(w, x, y, z, id);
      for (let i = 0; i < 4; i++) if (dirs[i]) flowInto(w, x + H4[i][0], y, z + H4[i][1], id, nl);
    }
  }
  function destroyForFluid(w, x, y, z) {
    const t = w.getBlock(x, y, z);
    if (t !== 0 && !BT.fluid[t] && w.game && !w.menu) dropBlock(w.game, x, y, z, t, w.getMeta(x, y, z), null);
  }
  function flowInto(w, x, y, z, id, nl) {
    if (!canFlowInto(w, x, y, z, id)) return;
    const t = w.getBlock(x, y, z);
    if (t === B.WATER && id === B.LAVA) { w.setBlock(x, y, z, B.COBBLESTONE, 0); return; }
    if (t === B.LAVA && id === B.WATER) { w.setBlock(x, y, z, w.getMeta(x, y, z) === 0 ? B.OBSIDIAN : B.COBBLESTONE, 0); return; }
    if (t === id) { if (w.getMeta(x, y, z) <= nl) return; }
    destroyForFluid(w, x, y, z);
    w.setBlock(x, y, z, id, nl);
    w.scheduleTick(x, y, z, tickRate(id));
  }
  function flowDirections(w, x, y, z, id) {
    const cost = [1000, 1000, 1000, 1000];
    for (let i = 0; i < 4; i++) {
      const nx = x + H4[i][0], nz = z + H4[i][1];
      if (blocksFlow(w, nx, y, nz) || (w.getBlock(nx, y, nz) === id && w.getMeta(nx, y, nz) === 0)) continue;
      cost[i] = !blocksFlow(w, nx, y - 1, nz) ? 0 : slopeDistance(w, nx, y, nz, 1, i, id);
    }
    const min = Math.min(...cost);
    return cost.map((c) => c === min && c < 1000);
  }
  function slopeDistance(w, x, y, z, depth, from, id) {
    let best = 1000;
    for (let i = 0; i < 4; i++) {
      if ((from === 0 && i === 1) || (from === 1 && i === 0) || (from === 2 && i === 3) || (from === 3 && i === 2)) continue;
      const nx = x + H4[i][0], nz = z + H4[i][1];
      if (blocksFlow(w, nx, y, nz) || (w.getBlock(nx, y, nz) === id && w.getMeta(nx, y, nz) === 0)) continue;
      if (!blocksFlow(w, nx, y - 1, nz)) return depth;
      if (depth < 4) { const d = slopeDistance(w, nx, y, nz, depth + 1, i, id); if (d < best) best = d; }
    }
    return best;
  }

  // ---- fire ----
  function fireTick(w, x, y, z, m) {
    if (!w.gameRules.doFireTick) return;
    const below = w.getBlock(x, y - 1, z);
    const eternal = below === B.ASH || below === B.SCORCHED_STONE || below === B.SULFUR_ORE;
    if (!canStay(w, x, y, z, B.FIRE, m)) { w.setBlock(x, y, z, 0); return; }
    if (!eternal && w.isRainingAt(x, y, z) && w.rng.nextFloat() < 0.4) { w.setBlock(x, y, z, 0); return; }
    if (m < 15) w.setMeta(x, y, z, Math.min(15, m + 1 + (w.rng.nextInt(3) === 0 ? 1 : 0)), 4);
    w.scheduleTick(x, y, z, 30 + w.rng.nextInt(10));
    if (!eternal) {
      if (!neighbourFlammable(w, x, y, z)) { if (!BT.solid[below] || m > 3) w.setBlock(x, y, z, 0); return; }
      if (m >= 15 && w.rng.nextInt(4) === 0 && !(BLOCKS[below] && BLOCKS[below].flammable)) { w.setBlock(x, y, z, 0); return; }
    }
    // burn neighbours
    for (let f = 0; f < 6; f++) {
      const d = FACE_DIR[f], nx = x + d[0], ny = y + d[1], nz = z + d[2];
      const nid = w.getBlock(nx, ny, nz);
      const def = BLOCKS[nid];
      if (!def || !def.burnSpeed) continue;
      if (w.rng.nextInt(f <= 1 ? 250 : 300) < def.burnSpeed) {
        if (nid === B.TNT) { w.setBlock(nx, ny, nz, 0); if (w.game) w.game.spawnEntity(new TNTEntity(w, nx + 0.5, ny, nz + 0.5, 10 + w.rng.nextInt(20))); continue; }
        if (w.rng.nextInt(m + 10) < 5 && !w.isRainingAt(nx, ny, nz)) { w.setBlock(nx, ny, nz, B.FIRE, Math.min(15, m + w.rng.nextInt(5) / 4 | 0)); w.scheduleTick(nx, ny, nz, 30); }
        else w.setBlock(nx, ny, nz, 0);
      }
    }
    // spread through the air near flammables
    for (let i = 0; i < 2; i++) {
      const nx = x + w.rng.nextInt(3) - 1, ny = y + w.rng.nextInt(5) - 1, nz = z + w.rng.nextInt(3) - 1;
      if (w.getBlock(nx, ny, nz) !== 0 || !neighbourFlammable(w, nx, ny, nz)) continue;
      let enc = 0;
      for (const d of FACE_DIR) { const def = BLOCKS[w.getBlock(nx + d[0], ny + d[1], nz + d[2])]; if (def && def.flammable > enc) enc = def.flammable; }
      if (enc > 0 && w.rng.nextInt(100) < (enc + 40) / (m + 30) * 8 && !w.isRainingAt(nx, ny, nz)) { w.setBlock(nx, ny, nz, B.FIRE, Math.min(15, m + 1)); w.scheduleTick(nx, ny, nz, 30); }
    }
  }

  // ---------------------------------------------------------------- random ticks
  function randomTick(w, x, y, z, id, m) {
    switch (id) {
      case B.GRASS: case B.MYCELIUM: {
        const above = w.getBlock(x, y + 1, z);
        const la = w.getLightLevel(x, y + 1, z);
        if (la < 4 && BT.opacity[above] > 2) { w.setBlock(x, y, z, B.DIRT, 0); return; }
        if (la >= 9) for (let i = 0; i < 4; i++) {
          const nx = x + w.rng.nextInt(3) - 1, ny = y + w.rng.nextInt(5) - 3, nz = z + w.rng.nextInt(3) - 1;
          if (w.getBlock(nx, ny, nz) === B.DIRT && w.getMeta(nx, ny, nz) === 0 && w.getLightLevel(nx, ny + 1, nz) >= 4 && BT.opacity[w.getBlock(nx, ny + 1, nz)] <= 2) w.setBlock(nx, ny, nz, id, 0);
        }
        return;
      }
      case B.SAPLING:
        if (w.getLightLevel(x, y + 1, z) >= 9 && w.rng.nextInt(7) === 0) {
          if (!(m & 8)) w.setMeta(x, y, z, m | 8, 4); else growTree(w, x, y, z, m);
        }
        return;
      case B.WHEAT: case B.CARROTS: case B.POTATOES: {
        if (m >= 7 || w.getLightLevel(x, y + 1, z) < 9) return;
        const wet = w.getBlock(x, y - 1, z) === B.FARMLAND && w.getMeta(x, y - 1, z) > 0;
        const chance = wet ? 5 : 12;
        if (w.rng.nextInt(chance) === 0) w.setMeta(x, y, z, m + 1, 4);
        return;
      }
      case B.FARMLAND: {
        let water = false;
        for (let dx = -4; dx <= 4 && !water; dx++) for (let dz = -4; dz <= 4 && !water; dz++) for (let dy = 0; dy <= 1; dy++) if (w.getBlock(x + dx, y + dy, z + dz) === B.WATER) { water = true; break; }
        if (water || w.isRainingAt(x, y + 1, z)) { if (m < 7) w.setMeta(x, y, z, 7, 4); }
        else if (m > 0) w.setMeta(x, y, z, m - 1, 4);
        else { const a = w.getBlock(x, y + 1, z); if (a !== B.WHEAT && a !== B.CARROTS && a !== B.POTATOES) w.setBlock(x, y, z, B.DIRT, 0); }
        return;
      }
      case B.SUGAR_CANE: case B.CACTUS: {
        if (w.getBlock(x, y + 1, z) !== 0) return;
        let h = 1; while (w.getBlock(x, y - h, z) === id) h++;
        if (h >= 3) return;
        if (m >= 15) { w.setMeta(x, y, z, 0, 4); if (canStay(w, x, y + 1, z, id, 0) || id === B.SUGAR_CANE) w.setBlock(x, y + 1, z, id, 0); }
        else w.setMeta(x, y, z, m + 1, 4);
        return;
      }
      case B.LEAVES: {
        if ((m & 8) || !(m & 16)) return;
        if (!logNearby(w, x, y, z)) {
          w.setBlock(x, y, z, 0);
          if (w.game) dropBlock(w.game, x, y, z, id, m, null);
          markLeavesForDecay(w, x, y, z, 1);
        } else w.setMeta(x, y, z, m & ~16, 4);
        return;
      }
      case B.ICE: if (w.getBlockLight(x, y, z) > 11 - BT.opacity[id]) { w.setBlock(x, y, z, B.WATER, 0); w.scheduleTick(x, y, z, 5); } return;
      case B.SNOW_LAYER: if (w.getBlockLight(x, y, z) > 11) w.setBlock(x, y, z, 0); return;
      case B.EMBER_ORE_LIT: w.setBlock(x, y, z, B.EMBER_ORE, 0); return;
      case B.BRAMBLE: if (m < 3 && w.getLightLevel(x, y + 1, z) >= 9 && w.rng.nextInt(5) === 0) w.setMeta(x, y, z, m + 1, 4); return;
      case B.MUSHROOM_BROWN: case B.MUSHROOM_RED: case B.GLOWSHROOM:
        if (w.rng.nextInt(25) === 0) {
          const nx = x + w.rng.nextInt(3) - 1, ny = y + w.rng.nextInt(2) - w.rng.nextInt(2), nz = z + w.rng.nextInt(3) - 1;
          if (w.getBlock(nx, ny, nz) === 0 && canStay(w, nx, ny, nz, id, 0)) {
            let n = 0; for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = -1; dy <= 1; dy++) if (w.getBlock(x + dx, y + dy, z + dz) === id) n++;
            if (n < 5) w.setBlock(nx, ny, nz, id, 0);
          }
        }
        return;
      case B.FIRE: w.scheduleTick(x, y, z, 30); return;
      case B.WATER:
        // freeze in the cold (classic: still water under the open sky)
        if (m === 0 && w.isSnowingAt(x, y, z) && w.canSeeSky(x, y + 1, z) && w.getBlockLight(x, y, z) < 10) {
          let edge = false;
          for (const [dx, dz] of H4) if (w.getBlock(x + dx, y, z + dz) !== B.WATER) edge = true;
          if (edge || w.rng.nextInt(4) === 0) w.setBlock(x, y, z, B.ICE, 0);
        }
        return;
    }
  }
  function logNearby(w, x, y, z) {
    // BFS through leaves up to 4 steps
    const seen = new Set(), q = [[x, y, z, 0]];
    seen.add(x + ',' + y + ',' + z);
    while (q.length) {
      const [cx, cy, cz, d] = q.shift();
      for (const dd of FACE_DIR) {
        const nx = cx + dd[0], ny = cy + dd[1], nz = cz + dd[2];
        const k = nx + ',' + ny + ',' + nz;
        if (seen.has(k)) continue;
        seen.add(k);
        const id = w.getBlock(nx, ny, nz);
        if (id === B.LOG) return true;
        if (id === B.LEAVES && d < 4) q.push([nx, ny, nz, d + 1]);
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- growing trees from saplings
  function growTree(w, x, y, z, m) {
    const kind = LEAF_KINDS[m & 7] || 'oak';
    const map = { oak: Math.random() < 0.1 ? 'big_oak' : 'oak', spruce: 'spruce', birch: 'birch', jungle: 'jungle', maple: 'maple', redwood: 'small_redwood', gold_maple: 'gold_maple' };
    const t = map[kind];
    // check headroom
    for (let dy = 1; dy < 6; dy++) if (BT.opaque[w.getBlock(x, y + dy, z)]) return false;
    w.setBlock(x, y, z, 0, 0, 4);
    const gen = new WG.Generator(w.seed, w.genOpts);
    const rng = new Noise.Random((Math.random() * 4294967296) >>> 0);
    const writer = {
      inside: () => true,
      get: (bx, by, bz) => w.getBlock(bx, by, bz),
      isAirOrPlant: (bx, by, bz) => { const id = w.getBlock(bx, by, bz); return id === 0 || BT.replaceable[id]; },
      top: (bx, bz) => w.topSolidY(bx, bz) + 1,
      set: (bx, by, bz, id, mm, mode) => {
        if (by < 1 || by >= CH_H || !w.isLoaded(bx, bz)) return;
        const cur = w.getBlock(bx, by, bz);
        if (mode === 1 && !(cur === 0 || (BT.replaceable[cur] && !BT.fluid[cur]) || cur === B.LEAF_LITTER)) return;
        if (mode === 3 && !(cur === 0 || cur === B.LEAVES || BT.replaceable[cur] || cur === B.FLOWER || cur === B.SAPLING || cur === B.SNOW_LAYER)) return;
        w.setBlock(bx, by, bz, id, mm || 0, 4);
      },
      setIf: (bx, by, bz, id, mm, ifId) => { if (w.getBlock(bx, by, bz) === ifId) w.setBlock(bx, by, bz, id, mm, 4); },
    };
    gen.tree(writer, rng, t, x, y, z);
    return true;
  }
  function growHugeMushroom(w, x, y, z, red) {
    const gen = new WG.Generator(w.seed, w.genOpts);
    const rng = new Noise.Random((Math.random() * 4294967296) >>> 0);
    w.setBlock(x, y, z, 0, 0, 4);
    const writer = {
      set: (bx, by, bz, id, mm, mode) => { if (!w.isLoaded(bx, bz)) return; const cur = w.getBlock(bx, by, bz); if (cur === 0 || BT.replaceable[cur] || mode === 0) w.setBlock(bx, by, bz, id, mm || 0, 4); },
      setIf: () => {},
    };
    void red;
    gen.tree(writer, rng, 'huge_mushroom', x, y, z);
  }

  // ---------------------------------------------------------------- explosions
  function explode(game, x, y, z, power, source, fire) {
    const w = game.world;
    const rng = w.rng;
    const affected = new Map();
    if (w.gameRules.mobGriefing || !source || source.type === 'tnt') {
      for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) for (let k = 0; k < 16; k++) {
        if (i !== 0 && i !== 15 && j !== 0 && j !== 15 && k !== 0 && k !== 15) continue;
        let dx = i / 15 * 2 - 1, dy = j / 15 * 2 - 1, dz = k / 15 * 2 - 1;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        dx /= len; dy /= len; dz /= len;
        let f = power * (0.7 + rng.nextFloat() * 0.6);
        let px = x, py = y, pz = z;
        for (; f > 0; f -= 0.225) {
          const bx = Math.floor(px), by = Math.floor(py), bz = Math.floor(pz);
          const id = w.getBlock(bx, by, bz);
          if (id !== 0) {
            const res = BLOCKS[id] ? BLOCKS[id].resistance / 5 : 0;
            f -= (res + 0.3) * 0.3;
          }
          if (f > 0 && id !== 0 && by >= 0 && by < CH_H && BLOCKS[id].hardness >= 0) affected.set(bx + ',' + by + ',' + bz, [bx, by, bz, id]);
          px += dx * 0.3; py += dy * 0.3; pz += dz * 0.3;
        }
      }
    }
    // damage entities
    const r2 = power * 2;
    for (const e of w.entities.concat(game.player ? [game.player] : [])) {
      if (e.removed || e === source) continue;
      const d = Math.sqrt(e.distanceSq(x, y, z)) / r2;
      if (d > 1) continue;
      const ex = e.x - x, ey = e.y + (e.eye || e.h / 2) - y, ez = e.z - z;
      const el = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1;
      const exposure = blockDensity(w, x, y, z, e);
      const impact = (1 - d) * exposure;
      const dmg = Math.floor((impact * impact + impact) / 2 * 8 * power + 1);
      if (e.hurt) e.hurt(dmg, { type: 'explosion', entity: null });
      else if (e instanceof ItemEntity && impact > 0.3) e.removed = true;
      e.vx += ex / el * impact; e.vy += ey / el * impact; e.vz += ez / el * impact;
    }
    game.audio.play('explode', 1.2, (1 + (rng.nextFloat() - rng.nextFloat()) * 0.2) * 0.7, x, y, z);
    game.particles.explosion(x, y, z, power);
    for (const [bx, by, bz, id] of affected.values()) {
      const meta = w.getMeta(bx, by, bz);
      if (id === B.TNT) { w.setBlock(bx, by, bz, 0); game.spawnEntity(new TNTEntity(w, bx + 0.5, by, bz + 0.5, 10 + rng.nextInt(20))); continue; }
      w.setBlock(bx, by, bz, 0, 0);
      if (rng.nextFloat() < 1 / power && !BT.fluid[id]) dropBlock(game, bx, by, bz, id, meta, null);
      if (rng.nextInt(3) === 0) game.particles.smoke(bx + 0.5, by + 0.5, bz + 0.5, 1);
    }
    if (fire) for (const [bx, by, bz] of affected.values()) {
      if (rng.nextInt(3) === 0 && w.getBlock(bx, by, bz) === 0 && BT.opaque[w.getBlock(bx, by - 1, bz)]) w.setBlock(bx, by, bz, B.FIRE, 0);
    }
  }
  function blockDensity(w, x, y, z, e) {
    e.updateBox();
    const b = e.box;
    let hits = 0, total = 0;
    for (let i = 0; i <= 1; i += 0.5) for (let j = 0; j <= 1; j += 0.5) for (let k = 0; k <= 1; k += 0.5) {
      const tx = b.x0 + (b.x1 - b.x0) * i, ty = b.y0 + (b.y1 - b.y0) * j, tz = b.z0 + (b.z1 - b.z0) * k;
      const hit = raycastBlocks(w, tx, ty, tz, x - tx, y - ty, z - tz, Math.sqrt((x - tx) ** 2 + (y - ty) ** 2 + (z - tz) ** 2), { collision: true });
      if (!hit) hits++;
      total++;
    }
    return hits / total;
  }

  // attach to block defs
  for (let id = 1; id < 256; id++) {
    const d = BLOCKS[id];
    if (!d) continue;
    d.onNeighborChange = (w, x, y, z, meta) => neighborChanged(w, x, y, z, id, meta);
  }
  for (const id of [B.SAND, B.GRAVEL, B.ASH]) BLOCKS[id].onPlaced = (w, x, y, z) => w.scheduleTick(x, y, z, 2);

  return { canStay, placeMeta, tryPlace, useItemOnBlock, useBlock, dropBlock, dropStack, onBroken, scheduledTick, randomTick, explode, tickRate, playerFacing, growTree, isSolidTop, boneMeal };
})();

// ---------------------------------------------------------------------------
// Ray casting through blocks (DDA). Returns hit info or null.
// opts.fluids: hit fluid source blocks; opts.collision: use collision boxes
// ---------------------------------------------------------------------------
function raycastBlocks(world, ox, oy, oz, dx, dy, dz, maxDist, opts) {
  opts = opts || {};
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-9) return null;
  dx /= len; dy /= len; dz /= len;
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
  let tmx = dx > 0 ? (x + 1 - ox) * tdx : (ox - x) * tdx;
  let tmy = dy > 0 ? (y + 1 - oy) * tdy : (oy - y) * tdy;
  let tmz = dz > 0 ? (z + 1 - oz) * tdz : (oz - z) * tdz;
  if (!isFinite(tmx)) tmx = 1e9; if (!isFinite(tmy)) tmy = 1e9; if (!isFinite(tmz)) tmz = 1e9;
  const boxes = [];
  for (let i = 0; i < 400; i++) {
    if (y >= 0 && y < CH_H) {
      const id = world.getBlock(x, y, z);
      if (id !== 0) {
        const def = BLOCKS[id];
        let candidate = false;
        if (opts.fluids && BT.fluid[id]) candidate = world.getMeta(x, y, z) === 0 || opts.anyFluid;
        else if (!BT.fluid[id]) candidate = opts.collision ? BT.solid[id] : true;
        if (candidate) {
          boxes.length = 0;
          const meta = world.getMeta(x, y, z);
          if (opts.collision) blockCollisionBoxes(world, x, y, z, id, meta, boxes);
          else if (BT.fluid[id]) boxes.push(new AABB(x, y, z, x + 1, y + 1, z + 1));
          else {
            let sb = def.select ? def.select(meta, world, x, y, z) : null;
            if (def.select && !sb) { /* not selectable (fire) */ }
            else {
              if (!sb && def.collide) { const cb = []; blockCollisionBoxes(world, x, y, z, id, meta, cb); if (cb.length) { let a = cb[0].copy(); for (const c of cb) { a.x0 = Math.min(a.x0, c.x0); a.y0 = Math.min(a.y0, c.y0); a.z0 = Math.min(a.z0, c.z0); a.x1 = Math.max(a.x1, c.x1); a.y1 = Math.min(Math.max(a.y1, c.y1), y + 1); a.z1 = Math.max(a.z1, c.z1); } boxes.push(a); } }
              else if (!sb && (id === B.FENCE || id === B.GLASS_PANE)) { const cb = []; blockCollisionBoxes(world, x, y, z, id, meta, cb); for (const c of cb) { c.y1 = Math.min(c.y1, y + 1); boxes.push(c); } }
              else boxes.push(sb ? new AABB(x + sb[0], y + sb[1], z + sb[2], x + sb[3], y + sb[4], z + sb[5]) : new AABB(x, y, z, x + 1, y + 1, z + 1));
            }
          }
          let best = null;
          for (const b of boxes) {
            const h = rayBox(ox, oy, oz, dx, dy, dz, b);
            if (h && h.t <= maxDist && (!best || h.t < best.t)) best = h;
          }
          if (best) return { x, y, z, id, meta: world.getMeta(x, y, z), face: best.face, t: best.t, hx: ox + dx * best.t, hy: oy + dy * best.t, hz: oz + dz * best.t, box: boxes.length ? boxes : null };
        }
      }
    }
    if (tmx < tmy && tmx < tmz) { if (tmx > maxDist) break; x += sx; tmx += tdx; }
    else if (tmy < tmz) { if (tmy > maxDist) break; y += sy; tmy += tdy; }
    else { if (tmz > maxDist) break; z += sz; tmz += tdz; }
  }
  return null;
}
function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = -Infinity, tmax = Infinity, face = -1;
  const ax = [[ox, dx, b.x0, b.x1, 4, 5], [oy, dy, b.y0, b.y1, 0, 1], [oz, dz, b.z0, b.z1, 2, 3]];
  for (const [o, d, lo, hi, fl, fh] of ax) {
    if (Math.abs(d) < 1e-12) { if (o < lo || o > hi) return null; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d, f1 = fl, f2 = fh;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; const f = f1; f1 = f2; f2 = f; }
    if (t1 > tmin) { tmin = t1; face = f1; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  if (tmin < 0) { tmin = 0; }
  return { t: tmin, face };
}
