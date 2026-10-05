'use strict';
// ---------------------------------------------------------------------------
// Non-living entities: items, xp orbs, falling blocks, tnt, arrows, projectiles
// ---------------------------------------------------------------------------
class ItemEntity extends Entity {
  constructor(world, x, y, z, stack) {
    super(world);
    this.type = 'item';
    this.w = 0.25; this.h = 0.25;
    this.stack = stack;
    this.pickupDelay = 10;
    this.setPos(x, y - 0.125, z);
    this.bobOffset = Math.random() * Math.PI * 2;
    this.spin = Math.random() * Math.PI * 2;
    this.lifetime = 6000;
    this.hp = 5;
    this.fluidInset = 0;
  }
  tick(game) {
    this.baseTick();
    if (this.removed) return;
    if (this.pickupDelay > 0) this.pickupDelay--;
    // an item sinks, and rolls along the bottom with the current
    this.vy -= 0.04;
    this.noClip = this.pushOutOfBlocksItem();
    this.move(this.vx, this.vy, this.vz);
    let f = 0.98;
    if (this.onGround) f = this.groundSlip() * 0.98;
    this.vx *= f; this.vy *= 0.98; this.vz *= f;
    if (this.onGround) this.vy *= -0.5;
    if (this.inLava) { this.removed = true; game.audio.play('fizz', 0.4, 2 + Math.random() * 0.4, this.x, this.y, this.z); return; }
    // flames and cactus spines wear it away in a few moments
    if ((this.inFireBlock || this.touchingCactus) && --this.hp <= 0) {
      this.removed = true;
      if (this.inFireBlock) game.audio.play('fizz', 0.4, 2 + Math.random() * 0.4, this.x, this.y, this.z);
      return;
    }
    // merge with nearby identical stacks
    if (this.age % 25 === 1) {
      for (const e of this.world.entitiesInBox(this.x - 0.5, this.y - 0.5, this.z - 0.5, this.x + 0.5, this.y + 0.5, this.z + 0.5)) {
        if (e === this || e.type !== 'item' || e.removed || !e.stack.canStackWith(this.stack)) continue;
        const max = maxStackOf(this.stack.id);
        if (this.stack.count + e.stack.count > max) continue;
        if (e.stack.count > this.stack.count) continue;
        this.stack.count += e.stack.count; e.removed = true;
        this.pickupDelay = Math.max(this.pickupDelay, e.pickupDelay);
        this.age = Math.min(this.age, e.age);
      }
    }
    // left lying too long, or fallen out of the world: lost, and on its way to the Sift
    if (this.age >= this.lifetime || this.y < -64) { this.removed = true; Sift.lose(this.world, this.stack); }
  }
  groundSlip() { const d = BLOCKS[this.world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.1), Math.floor(this.z))]; return d ? d.slip : 0.6; }
  pushOutOfBlocksItem() {
    const id = this.world.getBlock(Math.floor(this.x), Math.floor(this.y + 0.1), Math.floor(this.z));
    if (BT.opaque[id]) { this.vy = 0.15; return true; }
    return false;
  }
  save() { const d = super.save(); d.stack = this.stack.toJSON(); d.pd = this.pickupDelay; return d; }
  load(d) { super.load(d); this.stack = ItemStack.fromJSON(d.stack); this.pickupDelay = d.pd || 0; if (!this.stack) this.removed = true; }
}

class XPOrb extends Entity {
  constructor(world, x, y, z, value) {
    super(world);
    this.type = 'xp';
    this.w = 0.25; this.h = 0.25;
    this.value = value;
    this.setPos(x, y, z);
    this.vx = (Math.random() * 0.2 - 0.1) * 2; this.vy = Math.random() * 0.2 * 2; this.vz = (Math.random() * 0.2 - 0.1) * 2;
    this.delay = 10;
    this.hp = 5;
    this.fluidInset = 0;
  }
  tick(game) {
    this.baseTick();
    if (this.inLava || ((this.inFireBlock || this.touchingCactus) && --this.hp <= 0)) { this.removed = true; return; }
    if (this.delay > 0) this.delay--;
    this.vy -= 0.03;
    const p = game.player;
    if (p && !p.dead && this.delay === 0) {
      const dx = (p.x - this.x) / 8, dy = (p.y + p.eye / 2 - this.y) / 8, dz = (p.z - this.z) / 8;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let f = 1 - d;
      if (f > 0) { f *= f; this.vx += dx / d * f * 0.1; this.vy += dy / d * f * 0.1; this.vz += dz / d * f * 0.1; }
    }
    this.move(this.vx, this.vy, this.vz);
    let fr = 0.98; if (this.onGround) fr = 0.6 * 0.98;
    this.vx *= fr; this.vy *= 0.98; this.vz *= fr;
    if (this.onGround) this.vy *= -0.9;
    if (this.age > 6000) this.removed = true;
  }
  save() { const d = super.save(); d.value = this.value; return d; }
  load(d) { super.load(d); this.value = d.value || 1; }
}
function xpSplit(v) {
  for (const s of [2477, 1237, 617, 307, 149, 73, 37, 17, 7, 3]) if (v >= s) return s;
  return 1;
}

class FallingBlock extends Entity {
  constructor(world, x, y, z, id, meta) {
    super(world);
    this.type = 'falling';
    this.w = 0.98; this.h = 0.98;
    this.block = id; this.meta = meta;
    this.setPos(x, y, z);
    this.time = 0;
  }
  tick(game) {
    this.baseTick();
    this.time++;
    this.vy -= 0.04;
    this.move(this.vx, this.vy, this.vz);
    this.vx *= 0.98; this.vy *= 0.98; this.vz *= 0.98;
    const w = this.world;
    if (this.onGround) {
      this.removed = true;
      const bx = Math.floor(this.x), by = Math.floor(this.y + 0.01), bz = Math.floor(this.z);
      const cur = w.getBlock(bx, by, bz);
      if (BT.replaceable[cur] || cur === 0) {
        w.setBlock(bx, by, bz, this.block, this.meta);
        game.audio.playBlock(BLOCKS[this.block].sound, 'step', bx + 0.5, by + 0.5, bz + 0.5);
      } else Behaviors.dropStack(game, this.x, this.y + 0.5, this.z, new ItemStack(this.block, 1, blockItemDamage(this.block, this.meta)));
    } else if (this.time > 600 || this.y < -10) {
      this.removed = true;
    }
    // crush entities (suffocation handled by player)
  }
  save() { const d = super.save(); d.block = this.block; d.meta = this.meta; return d; }
  load(d) { super.load(d); this.block = d.block; this.meta = d.meta; }
}

class TNTEntity extends Entity {
  constructor(world, x, y, z, fuse) {
    super(world);
    this.type = 'tnt';
    this.w = 0.98; this.h = 0.98;
    this.setPos(x, y, z);
    this.fuse = fuse === undefined ? 80 : fuse;
    const a = Math.random() * Math.PI * 2;
    this.vx = -Math.sin(a) * 0.02; this.vy = 0.2; this.vz = -Math.cos(a) * 0.02;
  }
  tick(game) {
    this.baseTick();
    this.vy -= 0.04;
    this.move(this.vx, this.vy, this.vz);
    this.vx *= 0.98; this.vy *= 0.98; this.vz *= 0.98;
    if (this.onGround) { this.vx *= 0.7; this.vz *= 0.7; this.vy *= -0.5; }
    if (this.fuse === 80 || this.age === 1) game.audio.play('fuse', 1, 1, this.x, this.y, this.z);
    if (--this.fuse <= 0) {
      this.removed = true;
      Behaviors.explode(game, this.x, this.y + this.h / 16, this.z, 4, { type: 'tnt' }, false);
    } else if (this.age % 2 === 0) game.particles.smoke(this.x, this.y + 0.5, this.z, 1);
  }
  save() { const d = super.save(); d.fuse = this.fuse; return d; }
  load(d) { super.load(d); this.fuse = d.fuse; }
}

class Arrow extends Entity {
  constructor(world, shooter, speed, spread) {
    super(world);
    this.type = 'arrow';
    this.w = 0.5; this.h = 0.5;
    this.shooter = shooter;
    this.pickup = shooter && shooter.type === 'player' && !shooter.creative;
    const ey = shooter ? shooter.y + (shooter.eye || 1.5) - 0.1 : 0;
    this.setPos(shooter.x, ey, shooter.z);
    const yaw = shooter.yaw, pitch = shooter.pitch;
    let dx = -Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = -Math.cos(yaw) * Math.cos(pitch);
    this.shoot(dx, dy, dz, speed, spread);
    this.inGround = false; this.groundTicks = 0; this.damage = 2; this.crit = false;
  }
  shoot(dx, dy, dz, speed, spread) {
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    dx /= l; dy /= l; dz /= l;
    dx += (Math.random() * 2 - 1) * 0.0075 * spread; dy += (Math.random() * 2 - 1) * 0.0075 * spread; dz += (Math.random() * 2 - 1) * 0.0075 * spread;
    this.vx = dx * speed; this.vy = dy * speed; this.vz = dz * speed;
    this.yaw = Math.atan2(-dx, -dz); this.pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
    this.pyaw = this.yaw; this.ppitch = this.pitch;
  }
  tick(game) {
    this.px = this.x; this.py = this.y; this.pz = this.z; this.pyaw = this.yaw; this.ppitch = this.pitch;
    this.age++;
    const w = this.world;
    if (this.inGround) {
      const id = w.getBlock(this.bx, this.by, this.bz);
      if (id !== this.inBlock) { this.inGround = false; this.vx *= Math.random() * 0.2; this.vy *= Math.random() * 0.2; this.vz *= Math.random() * 0.2; }
      else {
        this.groundTicks++;
        if (this.groundTicks > 1200) this.removed = true;
        const p = game.player;
        if (this.pickup && p && Math.abs(p.x - this.x) < 1.2 && Math.abs(p.y + 0.9 - this.y) < 1.5 && Math.abs(p.z - this.z) < 1.2 && this.groundTicks > 2) {
          if (p.inventory.add(new ItemStack(ITEM_IDS.arrow, 1, 0)) === 0) { this.removed = true; game.audio.play('pop', 0.2, ((Math.random() - Math.random()) * 0.7 + 1) * 2); }
        }
        return;
      }
    }
    const len = Math.sqrt(this.vx * this.vx + this.vy * this.vy + this.vz * this.vz);
    const hit = raycastBlocks(w, this.x, this.y, this.z, this.vx, this.vy, this.vz, len, { collision: true });
    let maxT = hit ? hit.t : len;
    // entity hits
    let target = null, tBest = maxT;
    for (const e of w.entities.concat(game.player && !game.player.dead ? [game.player] : [])) {
      if (e === this || e.removed || !e.hurt || e.dead || (e === this.shooter && this.age < 5)) continue;
      e.updateBox();
      const b = e.box.copy(); b.x0 -= 0.3; b.y0 -= 0.3; b.z0 -= 0.3; b.x1 += 0.3; b.y1 += 0.3; b.z1 += 0.3;
      const h = rayBox(this.x, this.y, this.z, this.vx / len, this.vy / len, this.vz / len, b);
      if (h && h.t < tBest) { tBest = h.t; target = e; }
    }
    if (target) {
      let dmg = Math.ceil(len * this.damage);
      if (this.crit) dmg += Math.floor(Math.random() * (dmg / 2 + 2));
      if (target.hurt(dmg, { type: 'arrow', entity: this.shooter || this, knockback: 0.3 + (this.punch || 0) * 0.6 })) {
        if (target.type !== 'player') game.audio.play('arrow_hit', 1, 1.2 / (Math.random() * 0.2 + 0.9), this.x, this.y, this.z);
        if (this.fire) target.fire = 100;
        this.removed = true;
      } else { this.vx *= -0.1; this.vy *= -0.1; this.vz *= -0.1; this.yaw += Math.PI; }
      return;
    }
    if (hit) {
      this.x += this.vx / len * hit.t; this.y += this.vy / len * hit.t; this.z += this.vz / len * hit.t;
      this.inGround = true; this.bx = hit.x; this.by = hit.y; this.bz = hit.z; this.inBlock = hit.id;
      this.vx = 0; this.vy = 0; this.vz = 0;
      game.audio.play('arrow_hit', 1, 1.2 / (Math.random() * 0.2 + 0.9), this.x, this.y, this.z);
      this.crit = false;
      game.noise(this.x, this.y, this.z, 'projectile', null);
      return;
    }
    this.x += this.vx; this.y += this.vy; this.z += this.vz;
    const hl = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
    this.yaw = Math.atan2(-this.vx, -this.vz);
    this.pitch = Math.atan2(this.vy, hl);
    let drag = 0.99;
    if (w.getBlock(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)) === B.WATER) { drag = 0.8; if (this.age % 3 === 0) game.particles.bubble(this.x, this.y, this.z); }
    this.vx *= drag; this.vy *= drag; this.vz *= drag;
    this.vy -= 0.05;
    if (this.crit) game.particles.crit(this.x, this.y, this.z, 1);
    this.updateBox();
    if (this.age > 1200) this.removed = true;
  }
  save() { return null; }
}

class Thrown extends Entity {
  constructor(world, shooter, kind) {
    super(world);
    this.type = 'thrown'; this.kind = kind;
    this.w = 0.25; this.h = 0.25;
    this.shooter = shooter;
    this.setPos(shooter.x, shooter.y + shooter.eye - 0.1, shooter.z);
    const yaw = shooter.yaw, pitch = shooter.pitch;
    const sp = 1.5;
    this.vx = -Math.sin(yaw) * Math.cos(pitch) * sp; this.vy = Math.sin(pitch) * sp; this.vz = -Math.cos(yaw) * Math.cos(pitch) * sp;
  }
  tick(game) {
    this.px = this.x; this.py = this.y; this.pz = this.z;
    this.age++;
    const len = Math.sqrt(this.vx * this.vx + this.vy * this.vy + this.vz * this.vz);
    const hit = raycastBlocks(this.world, this.x, this.y, this.z, this.vx, this.vy, this.vz, len, { collision: true });
    let target = null, tb = hit ? hit.t : len;
    for (const e of this.world.entities) {
      if (e === this || e.removed || !e.hurt || e.dead || e === this.shooter) continue;
      e.updateBox();
      const h = rayBox(this.x, this.y, this.z, this.vx / len, this.vy / len, this.vz / len, e.box);
      if (h && h.t < tb) { tb = h.t; target = e; }
    }
    if (target || hit) {
      if (target) target.hurt(this.kind === 'snowball' && (target.type === 'wraith' || target.type === 'flare') ? (target.type === 'flare' ? 3 : 4) : 0, { type: 'thrown', entity: this.shooter || this, knockback: 0.25 });
      game.particles.burst(this.x, this.y, this.z, this.kind === 'snowball' ? 'snowball' : 'egg', 8);
      game.noise(this.x, this.y, this.z, 'projectile', null);
      if (this.kind === 'egg' && Math.random() < 0.125 && game.spawnMob) game.spawnMob('chicken', this.x, this.y, this.z, { baby: true });
      this.removed = true;
      return;
    }
    this.x += this.vx; this.y += this.vy; this.z += this.vz;
    const drag = this.world.getBlock(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)) === B.WATER ? 0.8 : 0.99;
    this.vx *= drag; this.vy *= drag; this.vz *= drag; this.vy -= 0.03;
    this.updateBox();
    if (this.age > 400) this.removed = true;
  }
  save() { return null; }
}

class LightningBolt extends Entity {
  constructor(world, x, y, z) {
    super(world);
    this.type = 'lightning';
    this.setPos(x, y, z);
    this.life = 2; this.flashes = 1 + Math.floor(Math.random() * 3);
    this.seed = Math.floor(Math.random() * 1e9);
  }
  tick(game) {
    this.age++;
    if (this.age === 1) {
      game.audio.play('thunder', 2, 0.8 + Math.random() * 0.2);
      game.audio.play('explode', 0.8, 0.5 + Math.random() * 0.2, this.x, this.y, this.z);
      const w = this.world;
      const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
      if (w.getBlock(bx, by, bz) === 0 && BT.solid[w.getBlock(bx, by - 1, bz)] && w.difficulty >= 2) w.setBlock(bx, by, bz, B.FIRE, 0);
      for (const e of w.entitiesInBox(this.x - 3, this.y - 3, this.z - 3, this.x + 3, this.y + 6, this.z + 3)) if (e.hurt) { e.hurt(5, { type: 'lightning' }); e.fire = 160; }
      const p = game.player;
      if (p && Math.abs(p.x - this.x) < 3 && Math.abs(p.z - this.z) < 3 && Math.abs(p.y - this.y) < 6) { p.hurt(5, { type: 'lightning' }); p.fire = 160; }
    }
    this.world.lightningFlash = 2;
    if (--this.life < 0) {
      if (this.flashes > 0 && Math.random() < 0.6) { this.flashes--; this.life = 1; this.seed = Math.floor(Math.random() * 1e9); }
      else this.removed = true;
    }
  }
  save() { return null; }
}
