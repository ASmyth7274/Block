'use strict';
// ---------------------------------------------------------------------------
// Fishing: the float, classic bite timing (wait, a wake approaches, the float
// dips) and what comes up on the line. The catch depends on the water you
// fish in: salmon in cold rivers, sunfish in warm shallows, pufferfish at sea,
// glimmerfin after dark... and now and then a message in a bottle.
// ---------------------------------------------------------------------------
function gaussRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}
function waterSurfaceAt(w, x, y, z) {
  const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
  if (w.getBlock(bx, by, bz) !== B.WATER) return false;
  return y <= by + 1 - fluidHeightFrac(w.getMeta(bx, by, bz));
}

class FishHook extends Entity {
  constructor(world, angler) {
    super(world);
    this.type = 'fishhook';
    this.w = 0.25; this.h = 0.25;
    this.angler = angler;
    const yaw = angler.yaw, pitch = angler.pitch;
    const ey = angler.y + (angler.eyeHeight || 1.62);
    this.setPos(angler.x + Math.cos(yaw) * 0.16, ey - 0.1, angler.z - Math.sin(yaw) * 0.16);
    let dx = -Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = -Math.cos(yaw) * Math.cos(pitch);
    dx += gaussRandom() * 0.0075; dy += gaussRandom() * 0.0075; dz += gaussRandom() * 0.0075;
    const sp = 1.5;
    this.vx = dx * sp; this.vy = dy * sp; this.vz = dz * sp;
    this.inGround = false; this.groundTicks = 0;
    this.caught = null;
    this.caughtDelay = 0; this.catchableDelay = 0; this.catchable = 0; this.approach = 0;
    this.inWaterNow = false;
    const rod = angler.inventory ? angler.inventory.held() : null;
    this.luck = Enchant.level(rod, 'luck_of_the_sea'); this.lure = Enchant.level(rod, 'lure');
  }
  discard() {
    this.removed = true;
    if (this.angler && this.angler.fishHook === this) this.angler.fishHook = null;
  }
  tick(game) {
    this.px = this.x; this.py = this.y; this.pz = this.z;
    this.age++;
    const p = this.angler, w = this.world;
    const held = p ? p.inventory.held() : null;
    if (!p || p.dead || !held || held.id !== ITEM_IDS.fishing_rod || p.fishHook !== this || this.distanceSq(p.x, p.y, p.z) > 1024) { this.discard(); return; }
    if (this.caught) {
      const c = this.caught;
      if (c.removed || c.dead) this.caught = null;
      else { this.x = c.x; this.y = c.y + c.h * 0.8; this.z = c.z; this.updateBox(); return; }
    }
    if (this.inGround) {
      if (w.getBlock(this.gx, this.gy, this.gz) === this.inBlock) { if (++this.groundTicks >= 1200) this.discard(); return; }
      this.inGround = false; this.groundTicks = 0;
      this.vx *= Math.random() * 0.2; this.vy *= Math.random() * 0.2; this.vz *= Math.random() * 0.2;
    }
    // what does the float run into this tick?
    const len = Math.sqrt(this.vx * this.vx + this.vy * this.vy + this.vz * this.vz);
    if (len > 1e-4) {
      const hit = raycastBlocks(w, this.x, this.y, this.z, this.vx, this.vy, this.vz, len, { collision: true });
      let target = null, tBest = hit ? hit.t : len;
      if (!this.inWaterNow) {
        for (const e of w.entities) {
          if (e === this || e.removed || !e.hurt || e.dead || e.type === 'painting' || e.type === 'boat') continue;
          e.updateBox();
          const b = e.box.copy(); b.x0 -= 0.3; b.y0 -= 0.3; b.z0 -= 0.3; b.x1 += 0.3; b.y1 += 0.3; b.z1 += 0.3;
          const h = rayBox(this.x, this.y, this.z, this.vx / len, this.vy / len, this.vz / len, b);
          if (h && h.t < tBest) { tBest = h.t; target = e; }
        }
      }
      if (target) {
        this.caught = target;
        target.hurt(0, { type: 'thrown', entity: p, knockback: 0.1 });
        return;
      }
      if (hit) {
        const k = Math.max(0, hit.t - 0.05) / len;
        this.x += this.vx * k; this.y += this.vy * k; this.z += this.vz * k;
        this.inGround = true; this.gx = hit.x; this.gy = hit.y; this.gz = hit.z; this.inBlock = hit.id;
        this.vx = this.vy = this.vz = 0;
        this.updateBox();
        return;
      }
    }
    this.x += this.vx; this.y += this.vy; this.z += this.vz;
    this.updateBox();
    // float: how much of the bobber sits below the water line
    let water = 0;
    for (let k = 0; k < 5; k++) if (waterSurfaceAt(w, this.x, this.box.y0 + this.h * k / 5, this.z)) water += 0.2;
    if (water > 0 && !this.inWaterNow && this.age > 2) {
      game.audio.play('splash', 0.25, 1.2 + (Math.random() - 0.5) * 0.3, this.x, this.y, this.z);
      game.particles.splash(this.x, Math.floor(this.y) + 1, this.z);
    }
    this.inWaterNow = water > 0;
    if (water > 0) this.fishTick(game);
    let f = 0.92;
    this.vy += 0.04 * (water * 2 - 1);
    if (water > 0) { f *= 0.9; this.vy *= 0.8; }
    this.vx *= f; this.vy *= f; this.vz *= f;
  }
  fishTick(game) {
    const w = this.world, R = Math.random, P = game.particles;
    const bx = Math.floor(this.x), by = Math.floor(this.y) + 1, bz = Math.floor(this.z);
    let speed = 1;
    if (R() < 0.25 && w.isRainingAt(bx, by, bz)) speed = 2;
    if (R() < 0.5 && !w.canSeeSky(bx, by, bz)) speed--;
    const surf = Math.floor(this.box.y0) + 1;
    const isWater = (x, z) => w.getBlock(Math.floor(x), surf - 1, Math.floor(z)) === B.WATER;
    if (this.catchable > 0) {
      if (--this.catchable <= 0) { this.caughtDelay = 0; this.catchableDelay = 0; }
    } else if (this.catchableDelay > 0) {
      this.catchableDelay -= speed;
      if (this.catchableDelay <= 0) {
        // a bite! the float is pulled under
        this.vy -= 0.2;
        game.audio.play('splash', 0.25, 1 + (R() - R()) * 0.4, this.x, this.y, this.z);
        P.bubble(this.x, surf, this.z, 6);
        for (let i = 0; i < 6; i++) P.wake(this.x + (R() - 0.5) * 0.5, surf, this.z + (R() - 0.5) * 0.5, (R() - 0.5) * 0.2, (R() - 0.5) * 0.2);
        this.catchable = 10 + Math.floor(R() * 21);
      } else {
        // the wake of a fish swimming toward the float
        this.approach += gaussRandom() * 4;
        const a = this.approach * DEG, s = Math.sin(a), c = Math.cos(a);
        const x = this.x + s * this.catchableDelay * 0.1, z = this.z + c * this.catchableDelay * 0.1;
        if (isWater(x, z)) {
          if (R() < 0.15) P.bubble(x, surf - 0.1, z, 1);
          P.wake(x, surf, z, c * 0.04, -s * 0.04);
          P.wake(x, surf, z, -c * 0.04, s * 0.04);
        }
      }
    } else if (this.caughtDelay > 0) {
      this.caughtDelay -= speed;
      let chance = 0.15;
      if (this.caughtDelay < 20) chance += (20 - this.caughtDelay) * 0.05;
      else if (this.caughtDelay < 40) chance += (40 - this.caughtDelay) * 0.02;
      else if (this.caughtDelay < 60) chance += (60 - this.caughtDelay) * 0.01;
      if (R() < chance) {
        const a = R() * TAU, d = (25 + R() * 35) * 0.1;
        const x = this.x + Math.sin(a) * d, z = this.z + Math.cos(a) * d;
        if (isWater(x, z)) P.fishSplash(x, surf, z, 2 + Math.floor(R() * 2));
      }
      if (this.caughtDelay <= 0) { this.approach = R() * 360; this.catchableDelay = 20 + Math.floor(R() * 61); }
    } else {
      this.caughtDelay = Math.max(1, 100 + Math.floor(R() * 801) - this.lure * 100);
    }
    if (this.catchable > 0) this.vy -= R() * R() * R() * 0.2;
  }
  // reel in; returns the damage done to the rod
  retract(game) {
    const p = this.angler;
    let dmg = 0;
    if (this.caught) {
      const c = this.caught;
      const dx = p.x - this.x, dy = p.y - this.y, dz = p.z - this.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      c.vx += dx * 0.1; c.vy += dy * 0.1 + Math.sqrt(d) * 0.08; c.vz += dz * 0.1;
      dmg = 3;
    } else if (this.catchable > 0) {
      const stack = Fishing.loot(game, this);
      const it = new ItemEntity(this.world, this.x, this.y, this.z, stack);
      const dx = p.x - this.x, dy = p.y - this.y, dz = p.z - this.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      it.setPos(this.x, this.y, this.z);
      it.vx = dx * 0.1; it.vy = dy * 0.1 + Math.sqrt(d) * 0.08; it.vz = dz * 0.1;
      it.pickupDelay = 4;
      game.spawnEntity(it);
      game.spawnXP(p.x, p.y + 0.5, p.z + 0.5, 1 + Math.floor(Math.random() * 6));
      game.onFished(stack);
      dmg = 1;
    }
    if (this.inGround) dmg = 2;
    this.discard();
    return dmg;
  }
  save() { return null; }
}

const Fishing = (() => {
  const pick = (list) => {
    let tot = 0; for (const e of list) tot += e[1];
    let r = Math.random() * tot;
    for (const e of list) { r -= e[1]; if (r <= 0) return e[0](); }
    return list[0][0]();
  };
  const COLD = { taiga: 1, snowy_taiga: 1, snowy_tundra: 1, mountains: 1, redwood_grove: 1, moors: 1, stone_shore: 1 };
  const WARM = { jungle: 1, swamp: 1, beach: 1, mushroom_island: 1, desert: 1 };
  function loot(game, hook) {
    const I = ITEM_IDS, w = game.world, R = Math.random;
    const bx = Math.floor(hook.x), by = Math.floor(hook.y), bz = Math.floor(hook.z);
    const bio = BIOMES[w.biomeAt(bx, bz)], key = bio ? bio.key : 'plains';
    const sea = key === 'ocean' || key === 'deep_ocean';
    const S = (id, n, d) => () => new ItemStack(id, typeof n === 'function' ? n() : (n || 1), d || 0);
    const worn = (id) => () => { const s = new ItemStack(id, 1, 0); const m = maxDamageOf(id); if (m) s.dmg = Math.floor(m * (0.25 + R() * 0.65)); return s; };
    const junkP = Math.max(0, 0.1 - (hook.luck || 0) * 0.025 - (hook.lure || 0) * 0.01), treasureP = Math.max(0, 0.05 + (hook.luck || 0) * 0.01 - (hook.lure || 0) * 0.01);
    let f = R();
    if (f < junkP) {
      return pick([[worn(I.leather_boots), 10], [S(I.leather), 10], [S(I.bone), 10], [S(I.string), 5], [S(I.stick), 5], [S(I.bowl), 10], [S(I.rotten_flesh), 10],
        [S(I.dye, 3, 15), 3], [S(B.LILY_PAD), 8], [S(I.cattail_fiber, () => 1 + Math.floor(R() * 3)), 5]]);
    }
    f -= junkP;
    if (f < treasureP) {
      return pick([[S(I.message_bottle), sea ? 40 : 25], [worn(I.bow), 8], [worn(I.fishing_rod), 8], [S(B.LILY_PAD), 5], [S(I.gold_nugget, () => 2 + Math.floor(R() * 5)), 10],
        [S(I.jade), 6], [S(I.golden_apple), 2], [S(I.diamond), 1], [S(I.wisp_essence), 4], [S(I.compass), 3]]);
    }
    const night = !w.isDaytime() || !w.canSeeSky(bx, by + 1, bz);
    const fish = [[S(I.fish), 60], [S(I.salmon), 25], [S(I.sunfish), 2], [S(I.pufferfish), 13]];
    if (sea) { fish[3][1] = 25; fish[1][1] = 10; fish[2][1] = 3; }
    if (key === 'river') { fish[1][1] = 45; fish[3][1] = 2; }
    if (COLD[key]) fish[1][1] = 50;
    if (WARM[key]) fish[2][1] = 15;
    if (night) fish.push([S(I.glimmerfin), (key === 'swamp' || key === 'mushroom_island') ? 30 : 10]);
    return pick(fish);
  }
  return { loot };
})();
