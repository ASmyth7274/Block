'use strict';
// ---------------------------------------------------------------------------
// Machines for moving things about. Hoppers pull items in from above (out of
// a container, a chest minecart, or off the ground) and pass them on through
// their spouts, one every eight ticks, unless ember power locks them.
// Droppers and dispensers, given a pulse of power, push out one item from a
// random slot: a dropper into whatever container it faces, or out onto the
// ground; a dispenser uses it if it can (fires arrows and snowballs, pours and
// fills buckets, scatters bone meal, lights fires, primes TNT, hatches spawn
// eggs, fits armour onto whoever stands in front of it).
// ---------------------------------------------------------------------------
const Machines = (() => {
  const ALL = (n) => { const a = []; for (let i = 0; i < n; i++) a.push(i); return a; };
  const S27 = ALL(27), S9 = ALL(9), S5 = ALL(5);
  // the inventory at a block, as seen from one of its faces (the side an item comes in or goes out by)
  function containerAt(w, x, y, z, side) {
    const id = w.getBlock(x, y, z);
    const te = w.getTile(x, y, z);
    const mark = () => w.markTileChanged(x, z);
    if (te && te.items) {
      if (id === B.CHEST) return { items: te.items, insert: () => S27, extract: () => S27, mark };
      if (id === B.HOPPER) return { items: te.items, insert: () => S5, extract: () => S5, mark };
      if (id === B.DROPPER || id === B.DISPENSER) return { items: te.items, insert: () => S9, extract: () => S9, mark };
      if (id === B.FURNACE || id === B.FURNACE_LIT) {
        // in at the top to be smelted, in at the sides as fuel; out at the bottom, done
        return { items: te.items, insert: (st) => side === 1 ? [0] : side >= 2 ? (fuelValue(st.id, st.dmg) > 0 ? [1] : []) : [], extract: () => [2], mark };
      }
      if (id === B.BREWING_STAND) {
        return { items: te.items, insert: (st) => side === 1 ? (Brewing.isIngredient(st) ? [3] : []) : (Brewing.isBottle(st) ? [0, 1, 2] : []), extract: () => te.brewTime > 0 ? [] : [0, 1, 2], mark };
      }
    }
    // a chest riding a minecart through the spot
    for (const e of w.entitiesInBox(x + 0.05, y, z + 0.05, x + 0.95, y + 1, z + 0.95, (e) => e.type === 'minecart' && !e.removed && e.items)) {
      return { items: e.items, insert: () => S27, extract: () => S27, mark: () => {} };
    }
    return null;
  }
  // put a single item like st into one of the given slots
  function putOne(c, slots, st) {
    const max = maxStackOf(st.id);
    for (const i of slots) { const s = c.items[i]; if (s && s.canStackWith(st) && s.count < max) { s.count++; return true; } }
    for (const i of slots) if (!c.items[i]) { const n = new ItemStack(st.id, 1, st.dmg); if (st.tag) n.tag = JSON.parse(JSON.stringify(st.tag)); c.items[i] = n; return true; }
    return false;
  }
  function takeOne(items, i) { const s = items[i]; s.count--; if (s.count <= 0) items[i] = null; }

  // ---------------------------------------------------------------- hoppers
  function tickHopper(game, te) {
    if (te.cool > 0) { te.cool--; return; }
    const w = game.world, { x, y, z } = te;
    if (w.getBlock(x, y, z) !== B.HOPPER) return;
    const m = w.getMeta(x, y, z);
    if (m & 8) return;
    let moved = false;
    // out through the spout
    const f = m & 7, d = FACE_DIR[f] || FACE_DIR[0];
    const out = containerAt(w, x + d[0], y + d[1], z + d[2], f ^ 1);
    if (out) for (let i = 0; i < 5; i++) {
      const s = te.items[i]; if (!s) continue;
      if (putOne(out, out.insert(s), s)) { takeOne(te.items, i); out.mark(); moved = true; break; }
    }
    // in from above
    const self = { items: te.items };
    if (te.items.some((s) => !s || s.count < maxStackOf(s.id))) {
      const src = containerAt(w, x, y + 1, z, 0);
      if (src) {
        for (const i of src.extract()) {
          const s = src.items[i]; if (!s) continue;
          if (putOne(self, S5, s)) { takeOne(src.items, i); src.mark(); moved = true; break; }
        }
      } else if (!BT.opaque[w.getBlock(x, y + 1, z)]) {
        for (const e of w.entitiesInBox(x, y + 0.6, z, x + 1, y + 1.9, z + 1, (e) => e.type === 'item' && !e.removed && e.stack)) {
          let took = false;
          while (e.stack.count > 0 && putOne(self, S5, e.stack)) { e.stack.count--; took = true; }
          if (e.stack.count <= 0) e.removed = true;
          if (took) { moved = true; break; }
        }
      }
    }
    if (moved) { te.cool = 8; w.markTileChanged(x, z); }
  }

  // ---------------------------------------------------------------- droppers and dispensers
  function fire(game, x, y, z, id) {
    const w = game.world, te = w.getTile(x, y, z);
    if (!te || !te.items) return;
    const m = w.getMeta(x, y, z), f = m & 7, d = FACE_DIR[f];
    const full = []; te.items.forEach((s, i) => { if (s) full.push(i); });
    if (!full.length) { game.audio.play('dispense_fail', 0.6, 1.2, x + 0.5, y + 0.5, z + 0.5); return; }
    const slot = full[Math.floor(Math.random() * full.length)], st = te.items[slot];
    const fx = x + 0.5 + d[0] * 0.7, fy = y + 0.5 + d[1] * 0.7, fz = z + 0.5 + d[2] * 0.7;
    const tx = x + d[0], ty = y + d[1], tz = z + d[2];
    if (id === B.DROPPER) {
      const into = containerAt(w, tx, ty, tz, f ^ 1);
      if (into) {
        if (putOne(into, into.insert(st), st)) { takeOne(te.items, slot); into.mark(); w.markTileChanged(x, z); game.audio.play('dispense', 0.5, 1.1, x + 0.5, y + 0.5, z + 0.5); }
        else game.audio.play('dispense_fail', 0.6, 1.2, x + 0.5, y + 0.5, z + 0.5);
        return;
      }
    } else if (dispense(game, x, y, z, f, d, te, slot, st, fx, fy, fz, tx, ty, tz)) { w.markTileChanged(x, z); return; }
    // nothing special to do with it: out it goes
    const one = new ItemStack(st.id, 1, st.dmg); if (st.tag) one.tag = JSON.parse(JSON.stringify(st.tag));
    const e = new ItemEntity(w, fx, fy - 0.12, fz, one);
    const sp = 0.25 + Math.random() * 0.05;
    e.vx = d[0] * sp + (Math.random() - 0.5) * 0.04; e.vy = d[1] * sp + 0.1; e.vz = d[2] * sp + (Math.random() - 0.5) * 0.04;
    e.pickupDelay = 10;
    game.spawnEntity(e);
    takeOne(te.items, slot);
    w.markTileChanged(x, z);
    game.audio.play('dispense', 0.6, 1, x + 0.5, y + 0.5, z + 0.5);
    if (game.settings.particles !== 'minimal') game.particles.smoke(fx, fy, fz, 3, false);
  }
  // a dispenser making use of what it holds; false to just throw the item out
  function dispense(game, x, y, z, f, d, te, slot, st, fx, fy, fz, tx, ty, tz) {
    const w = game.world, I = ITEM_IDS;
    const yaw = Math.atan2(-d[0], -d[2]), pitch = d[1] > 0 ? Math.PI / 2 - 0.15 : d[1] < 0 ? -Math.PI / 2 + 0.15 : 0.08;
    const shooter = { type: 'dispenser', x: fx, y: fy - 0.2, z: fz, eye: 0.2, yaw, pitch, creative: false };
    const front = w.getBlock(tx, ty, tz), frontM = w.getMeta(tx, ty, tz);
    const used = () => { takeOne(te.items, slot); return true; };
    const sound = (n, v, p) => game.audio.play(n, v || 0.6, p || 1, x + 0.5, y + 0.5, z + 0.5);
    switch (st.id) {
      case I.arrow: {
        const a = new Arrow(w, shooter, 1.1, 6); a.pickup = true; a.shooter = null;
        game.spawnEntity(a); sound('bow', 0.8, 1.2); return used();
      }
      case I.snowball: case I.egg: {
        const t = new Thrown(w, shooter, st.id === I.snowball ? 'snowball' : 'egg'); t.shooter = null;
        game.spawnEntity(t); sound('bow', 0.5, 1.4); return used();
      }
      case I.fire_charge: {
        if (typeof Fireball === 'undefined') return false;
        game.spawnEntity(new Fireball(w, null, false, fx, fy - 0.15, fz, d[0], d[1], d[2])); sound('fire_charge', 0.7, 1.1); return used();
      }
      case I.water_bucket: case I.lava_bucket: {
        if (front !== 0 && !BT.replaceable[front]) return false;
        const fid = st.id === I.water_bucket ? B.WATER : B.LAVA;
        if (fid === B.WATER && w.dim === 1) { sound('fizz', 0.5, 2); te.items[slot] = new ItemStack(I.bucket, 1, 0); return true; }
        w.setBlock(tx, ty, tz, fid, 0); w.scheduleTick(tx, ty, tz, Behaviors.tickRate(fid, w));
        te.items[slot] = new ItemStack(I.bucket, 1, 0);
        sound(fid === B.WATER ? 'bucket_empty' : 'bucket_empty_lava', 0.8, 1); return true;
      }
      case I.bucket: {
        if ((front !== B.WATER && front !== B.LAVA) || frontM !== 0) return false;
        const fill = new ItemStack(front === B.WATER ? I.water_bucket : I.lava_bucket, 1, 0);
        w.setBlock(tx, ty, tz, 0, 0);
        takeOne(te.items, slot);
        if (!te.items[slot]) te.items[slot] = fill;
        else { const free = te.items.indexOf(null); if (free >= 0) te.items[free] = fill; else Behaviors.dropStack(game, fx, fy, fz, fill); }
        sound('bucket_fill', 0.8, 1); return true;
      }
      case I.glass_bottle: {
        if (front !== B.WATER) return false;
        takeOne(te.items, slot);
        const water = new ItemStack(I.potion, 1, 0), free = te.items.indexOf(null);
        if (free >= 0) te.items[free] = water; else Behaviors.dropStack(game, fx, fy, fz, water);
        sound('bucket_fill', 0.5, 1.4); return true;
      }
      case I.dye: {
        if (st.dmg !== 0) return false;
        if (!Behaviors.boneMeal(game, { creative: true }, tx, ty, tz)) { sound('dispense_fail', 0.6, 1.2); return true; }
        return used();
      }
      case I.flint_and_steel: {
        if (front === B.TNT) { w.setBlock(tx, ty, tz, 0, 0); game.spawnEntity(new TNTEntity(w, tx + 0.5, ty, tz + 0.5, 80)); }
        else if (front === 0) { w.setBlock(tx, ty, tz, B.FIRE, 0); w.scheduleTick(tx, ty, tz, 30); }
        else return false;
        st.dmg++; if (st.dmg >= maxDamageOf(st.id)) te.items[slot] = null;
        sound('ignite', 0.8, 1); return true;
      }
      case I.spawn_egg: {
        const t = MOB_TYPES[st.dmg]; if (!t) return false;
        game.spawnMob(t.key, tx + 0.5, ty + (BT.solid[front] ? 1 : 0), tz + 0.5, { fromEgg: true });
        return used();
      }
      case I.shears: {
        const sheep = w.entitiesInBox(tx, ty, tz, tx + 1, ty + 1, tz + 1, (e) => e.type === 'sheep' && !e.dead && !e.sheared && !e.baby)[0];
        if (!sheep || !sheep.interact({ creative: true }, st)) return false;
        st.dmg++; if (st.dmg >= maxDamageOf(st.id)) te.items[slot] = null;
        return true;
      }
    }
    if (st.id === B.TNT) {
      game.spawnEntity(new TNTEntity(w, tx + 0.5, ty, tz + 0.5, 80));
      game.audio.play('fuse', 1, 1, tx + 0.5, ty + 0.5, tz + 0.5);
      return used();
    }
    // armour, onto whoever is standing in front
    const ad = armorOf(st.id);
    if (ad) {
      const p = game.player;
      if (p && !p.dead && p.box.intersects(new AABB(tx, ty, tz, tx + 1, ty + 1, tz + 1)) && !p.inventory.armor.items[ad.slot]) {
        p.inventory.armor.items[ad.slot] = st.copy(); p.inventory.armor.items[ad.slot].count = 1;
        takeOne(te.items, slot);
        sound('click', 0.6, 0.8);
        return true;
      }
    }
    return false;
  }

  // what a block placed by a player faces: hoppers point their spout at what they were placed against
  function hopperFacing(face) { return face >= 2 ? (face ^ 1) : 0; }
  return { containerAt, putOne, tickHopper, fire, hopperFacing };
})();
