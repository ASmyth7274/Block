'use strict';
// ---------------------------------------------------------------------------
// Creatures of the Underworld: the wailer, the charred, magma slimes and the
// flare, plus the fireballs they throw and where they spawn.
// ---------------------------------------------------------------------------
MOB_TYPES.push(
  { key: 'charred', name: 'Charred', egg: ['#2c2622', '#e0701a'], cat: 'monster', lore: 'Miners who went too deep, burnt black. They mind their own business - strike one and every charred in earshot comes for you.' },
  { key: 'wailer', name: 'Wailer', egg: ['#e4dfe8', '#8cb8e6'], cat: 'monster', lore: 'A vast pale weeper drifting over the lava seas. Its tears stop when it sees you; then come the fireballs. Hit one back.' },
  { key: 'magma_slime', name: 'Magma Slime', egg: ['#2a1a16', '#ff9a2a'], cat: 'monster', lore: 'A cooled crust around a molten heart. Bounds high, hits hard and splits when struck. Lava does not trouble it.' },
  { key: 'flare', name: 'Flare', egg: ['#e0601a', '#ffd84a'], cat: 'monster', lore: 'A caged fire that guards the fortresses, hurling burning bolts. Snowballs and water make it hiss. Its rods burn for ages.' },
);
MOB_TYPES.forEach((m, i) => { if (m) { m.index = i; MOB_INDEX[m.key] = m; } });

// ---------------------------------------------------------------------------
// Fireballs: big ones burst, small ones set things alight. A hit turns them.
// ---------------------------------------------------------------------------
class Fireball extends Entity {
  constructor(world, shooter, big, x, y, z, dx, dy, dz) {
    super(world);
    this.type = 'fireball';
    this.big = !!big;
    this.w = this.h = big ? 1 : 0.3125;
    this.shooter = shooter;
    this.setPos(x, y, z);
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    // a steady push in the direction of travel, like the classics
    this.ax = dx / l * 0.1; this.ay = dy / l * 0.1; this.az = dz / l * 0.1;
    this.vx = this.vy = this.vz = 0;
  }
  // struck by the player: sent back the way they are looking
  hurt(amount, src) {
    const e = src && src.entity;
    if (!e || e.yaw === undefined) return false;
    const dx = -Math.sin(e.yaw) * Math.cos(e.pitch), dy = Math.sin(e.pitch), dz = -Math.cos(e.yaw) * Math.cos(e.pitch);
    this.vx = dx; this.vy = dy; this.vz = dz;
    this.ax = dx * 0.1; this.ay = dy * 0.1; this.az = dz * 0.1;
    this.shooter = e;
    this.age = 0;
    return true;
  }
  tick(game) {
    this.px = this.x; this.py = this.y; this.pz = this.z;
    this.age++;
    const w = this.world;
    if (this.age > 600 || this.y < 0 || this.y > CH_H) { this.removed = true; return; }
    const len = Math.sqrt(this.vx * this.vx + this.vy * this.vy + this.vz * this.vz);
    if (len > 1e-4) {
      const hit = raycastBlocks(w, this.x, this.y + this.h / 2, this.z, this.vx, this.vy, this.vz, len, { collision: true });
      let target = null, tb = hit ? hit.t : len;
      const all = w.entities.concat(game.player && !game.player.dead ? [game.player] : []);
      for (const e of all) {
        if (e === this || e.removed || !e.hurt || e.dead || e.type === 'fireball' || (e === this.shooter && this.age < 25)) continue;
        e.updateBox();
        const b = e.box.copy(); b.x0 -= 0.3; b.y0 -= 0.3; b.z0 -= 0.3; b.x1 += 0.3; b.y1 += 0.3; b.z1 += 0.3;
        const h = rayBox(this.x, this.y + this.h / 2, this.z, this.vx / len, this.vy / len, this.vz / len, b);
        if (h && h.t < tb) { tb = h.t; target = e; }
      }
      if (target || hit) { this.impact(game, target, hit); return; }
    }
    this.x += this.vx; this.y += this.vy; this.z += this.vz;
    this.vx += this.ax; this.vy += this.ay; this.vz += this.az;
    this.vx *= 0.95; this.vy *= 0.95; this.vz *= 0.95;
    this.updateBox();
    if (this.age % 2 === 0) game.particles.smoke(this.x, this.y + this.h / 2, this.z, 1, true);
  }
  impact(game, target, hit) {
    const w = this.world;
    this.removed = true;
    if (this.big) {
      // burst first, then the direct hit (so whatever it kills drops its loot after the blast)
      Behaviors.explode(game, this.x, this.y + 0.5, this.z, 1, { type: 'fireball', entity: this }, w.gameRules.mobGriefing);
      if (target && !target.dead) target.hurt(6, { type: 'fireball', entity: this.shooter || this, knockback: 0.4 });
      return;
    }
    if (target) {
      if (!target.fireImmune && target.hurt(5, { type: 'fireball', entity: this.shooter || this, knockback: 0.2 })) target.fire = Math.max(target.fire || 0, 100);
    } else if (hit && w.gameRules.mobGriefing) {
      const d = FACE_DIR[hit.face];
      const x = hit.x + d[0], y = hit.y + d[1], z = hit.z + d[2];
      if (w.getBlock(x, y, z) === 0) { w.setBlock(x, y, z, B.FIRE, 0); w.scheduleTick(x, y, z, 30); }
    }
    game.particles.smoke(this.x, this.y, this.z, 4, true);
    game.audio.play('fizz', 0.4, 1.4, this.x, this.y, this.z);
  }
  render(er, rx, ry, rz) {
    const cam = er.game.camera;
    const s = this.big ? 1.1 : 0.45;
    let m = M3.trans(rx, ry + this.h / 2, rz);
    m = M3.mul(m, M3.ry(cam.yaw));
    m = M3.mul(m, M3.scale(s, s, s));
    m = M3.mul(m, M3.trans(-0.5, -0.5, 0));
    er.drawItem(new ItemStack(ITEM_IDS.fire_charge, 1, 0), m, 1, 1, 255, true);
    er.glow(rx, ry + this.h / 2, rz, s * 0.9, [255, 150, 40, 110]);
  }
  save() { return null; }
}

// ---------------------------------------------------------------------------
// The wailer: drifts in great open caverns, weeping; sees you, opens its eyes,
// draws breath and spits a fireball.
// ---------------------------------------------------------------------------
class Wailer extends Monster {
  constructor(world) {
    super(world, 'wailer');
    this.maxHealth = this.health = 10;
    this.w = 3.5; this.h = 3.5; this.eye = 2.4;
    this.noGravity = true; this.swims = false; this.fireImmune = true;
    this.goal = null; this.courseTimer = 0;
    this.charge = 0;
    this.talkInterval = 120;
    this.xpValue = 5;
  }
  get mouthOpen() { return this.charge > 10; }
  travel() {
    this.move(this.vx, this.vy, this.vz);
    this.vx *= 0.91; this.vy *= 0.91; this.vz *= 0.91;
    this.fallDistance = 0;
  }
  // can it float in a straight line to (x, y, z)?
  clearTo(x, y, z, d) {
    const dx = (x - this.x) / d, dy = (y - this.y) / d, dz = (z - this.z) / d;
    const b = this.box.copy();
    for (let i = 1; i < d; i++) {
      b.offset(dx, dy, dz);
      collectBoxes(this.world, b, _boxes);
      if (_boxes.length) return false;
    }
    return true;
  }
  aiTick(game) {
    const w = this.world;
    // drifting about
    if (--this.courseTimer <= 0 || !this.goal) {
      this.goal = [this.x + (Math.random() * 2 - 1) * 16, clamp(this.y + (Math.random() * 2 - 1) * 16, WG.LAVA_SEA + 4, UNDER_H - 10), this.z + (Math.random() * 2 - 1) * 16];
      this.courseTimer = 40 + this.rnd(60);
    }
    const gx = this.goal[0] - this.x, gy = this.goal[1] - this.y, gz = this.goal[2] - this.z;
    const gd = Math.sqrt(gx * gx + gy * gy + gz * gz);
    if (gd > 1) {
      if (this.courseTimer % 5 === 0 && !this.clearTo(this.goal[0], this.goal[1], this.goal[2], gd)) this.goal = null;
      else { this.vx += gx / gd * 0.04; this.vy += gy / gd * 0.04; this.vz += gz / gd * 0.04; }
    }
    // hunting
    this.updateTarget(game, 48, 64);
    const t = this.target;
    if (t && this.canSee(t)) {
      this.yaw = approachAngle(this.yaw, Math.atan2(-(t.x - this.x), -(t.z - this.z)), 20 * DEG);
      this.lookAtEntity(t, 2);
      if (++this.charge === 10) game.audio.play('wailer_charge', 2, this.soundPitch(), this.x, this.y + this.eye, this.z);
      if (this.charge >= 20) {
        const fx = -Math.sin(this.yaw) * 2, fz = -Math.cos(this.yaw) * 2;
        const sx = this.x + fx, sy = this.y + this.h / 2 + 0.5, sz = this.z + fz;
        const dx = t.x - sx, dy = (t.y + t.h / 2) - sy, dz = t.z - sz;
        game.spawnEntity(new Fireball(w, this, true, sx, sy - 0.5, sz, dx, dy, dz));
        game.audio.play('wailer_shoot', 2, this.soundPitch(), this.x, this.y + this.eye, this.z);
        this.charge = -40;
      }
    } else {
      if (this.charge > 0) this.charge--;
      const sp = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
      if (sp > 0.01) this.yaw = approachAngle(this.yaw, Math.atan2(-this.vx, -this.vz), 10 * DEG);
    }
    this.bodyYaw = this.yaw;
  }
  hurt(amount, src) {
    if (src && src.type === 'fall') return false;
    // its own fire sent back at it: a terrible blow
    if (src && src.type === 'fireball' && src.entity && src.entity.type === 'player') amount = 1000;
    return super.hurt(amount, src);
  }
  onRevenge(e) { if (e && e.type === 'player' && e.survivalLike) { this.target = e; this.unseen = 0; } }
  knockback() {}
  checkDespawn(game) { super.checkDespawn(game); }
  dropLoot(game, byPlayer) {
    this.drop(ITEM_IDS.wailer_tear, this.rnd(2));
    this.drop(ITEM_IDS.gunpowder, this.rnd(3));
  }
  onDeath(src) { super.onDeath(src); if (this.recentlyHit > 0) this.game.achieve('wailer'); }
  soundVolume() { return 2.5; }
  render(er, rx, ry, rz, partial) {
    const t = this.age + partial;
    const base = M3.mul(er.baseMatrix(this, rx, ry + Math.sin(t * 0.05) * 0.1, rz, partial), M3.scale(3.5, 3.5, 3.5));
    const col = er.entColor(this);
    const [sky, blk] = er.lightAt(this.x, this.y + this.h / 2, this.z);
    er.drawModel(MODELS.wailer, this.mouthOpen ? 'wailer_open' : 'wailer', base, {}, col, Math.max(sky, 0.35), blk);
    const pose = {};
    for (let i = 0; i < 6; i++) pose['t' + i] = [Math.sin(t * 0.067 + i * 1.3) * 0.25 + 0.15, 0, Math.cos(t * 0.05 + i) * 0.1];
    er.drawModel(MODELS.wailerTentacles, 'wailer_tentacle', base, pose, col, Math.max(sky, 0.35), blk);
  }
}

// ---------------------------------------------------------------------------
// The charred: wandering miners, left alone they leave you alone. Hit one and
// the whole crew in earshot turns on you for a good while.
// ---------------------------------------------------------------------------
class Charred extends Zombie {
  constructor(world) {
    super(world, 'charred');
    this.burns = false; this.fireImmune = true;
    this.hostile = false;
    this.anger = 0;
    this.baseSpeed = 0.23; this.damage = 5;
    this.talkInterval = 160;
  }
  onSpawn(fresh) {
    if (fresh) { this.held = new ItemStack(ITEM_IDS.gold_pickaxe, 1, 0); this.armorItems = this.armor; }
    else this.armorItems = this.armor;
  }
  get angry() { return this.anger > 0; }
  becomeAngry(e) {
    if (!e || e.type !== 'player' || !e.survivalLike) return;
    const was = this.anger > 0;
    this.anger = 400 + this.rnd(400);
    this.target = e; this.unseen = 0;
    if (!was) this.game.audio.play('charred_angry', 1, this.soundPitch(), this.x, this.y + this.eye, this.z);
  }
  onRevenge(e) {
    if (!e || e.type !== 'player' || !e.survivalLike) return;
    // the whole crew answers
    for (const o of this.world.entitiesInBox(this.x - 32, this.y - 32, this.z - 32, this.x + 32, this.y + 32, this.z + 32)) if (o.type === 'charred' && !o.dead) o.becomeAngry(e);
  }
  aiTick(game) {
    if (this.anger > 0) {
      this.anger--;
      this.hostile = true;
      const t = this.target;
      if (t && !t.dead && t.survivalLike && this.distSqTo(t) < 64 * 64 && this.world.difficulty > 0) {
        const d2 = this.chase(1.15);
        this.tryMelee(t, d2, this.damage);
        return;
      }
      this.target = null;
    } else { this.hostile = false; this.target = null; }
    if (this.pathDone && Math.random() < 1 / 120) this.wander(10, 4, 0.9);
    this.idleLook(game); this.keepWatching();
  }
  mobTick() {}
  attackEntity(e, dmg, extra) { return Mob.prototype.attackEntity.call(this, e, this.damage, extra); }
  saySound() { return this.angry ? 'charred_angry' : 'charred_say'; }
  hurtSound() { return 'charred_hurt'; }
  deathSound() { return 'charred_death'; }
  soundPitch() { return (Math.random() - Math.random()) * 0.2 + 0.9; }
  dropLoot(game, byPlayer) {
    this.drop(ITEM_IDS.rotten_flesh, this.rnd(2));
    this.drop(ITEM_IDS.gold_nugget, this.rnd(2));
    if (byPlayer && Math.random() < 0.025) this.drop(ITEM_IDS.gold_ingot, 1);
    if (this.held && byPlayer && Math.random() < 0.085) this.drop(this.held.id, 1, Math.floor(maxDamageOf(this.held.id) * Math.random() * 0.8));
    this.dropEquipment(byPlayer);
  }
  render(er, rx, ry, rz, partial) { er.drawHumanoid(this, rx, ry, rz, partial, 'charred', this.angry ? 'zombie' : 'biped'); }
  save() { const d = super.save(); if (this.anger) d.anger = this.anger; return d; }
  load(d) { super.load(d); this.anger = d.anger || 0; }
}

// ---------------------------------------------------------------------------
// Magma slimes: hotter, harder, higher-jumping slimes that live in lava
// ---------------------------------------------------------------------------
class MagmaSlime extends Slime {
  constructor(world) {
    super(world);
    this.type = 'magma_slime';
    this.def = MOB_INDEX.magma_slime;
    this.fireImmune = true;
    this.split = 0; this.psplit = 0;
  }
  setSize(s) { super.setSize(s); this.baseSpeed = 0.2 + 0.1 * s; this.xpValue = s; }
  armorValue() { return this.size * 3; }
  jump() { this.vy = 0.42 + this.size * 0.1; this.split = 1; }
  aiTick(game) {
    super.aiTick(game);
    // bigger slimes hit harder
    const t = this.target;
    if (t && this.size === 1 && this.attackTimer <= 0 && this.distSqTo(t) < 0.9 && this.canSee(t)) { this.attackTimer = 10; this.attackEntity(t, 1); }
    if (this.inLava) { this.vy = Math.max(this.vy, 0.1); this.jumping = true; }
  }
  attackEntity(e, dmg, extra) { return super.attackEntity(e, dmg + (this.size > 1 ? 2 : 0), extra); }
  mobTick(game) {
    super.mobTick(game);
    this.psplit = this.split;
    this.split *= this.onGround ? 0.5 : 0.92;
    if (this.age % 10 === 0 && Math.random() < 0.3) game.particles.smoke(this.x, this.y + this.h, this.z, 1, true);
  }
  onDeath(src) {
    const game = this.game;
    Mob.prototype.onDeath.call(this, src);
    if (this.size > 1) {
      const n = 2 + this.rnd(3);
      for (let i = 0; i < n; i++) {
        const s = new MagmaSlime(this.world);
        s.setSize(this.size / 2);
        s.setPos(this.x + ((i % 2) - 0.5) * this.size / 4, this.y + 0.5, this.z + ((i >> 1) - 0.5) * this.size / 4);
        s.yaw = Math.random() * TAU;
        game.spawnEntity(s);
      }
    }
  }
  dropLoot() { if (this.size > 1 && Math.random() < 0.3) this.drop(ITEM_IDS.magma_cream, 1); }
  hurtSound() { return 'magma_slime'; }
  deathSound() { return 'magma_slime'; }
  render(er, rx, ry, rz, partial) {
    const s = this.size;
    const sq = (this.psquish + (this.squish - this.psquish) * partial) / (s * 0.5 + 1);
    const f3 = 1 / (sq + 1);
    const base = M3.mul(er.baseMatrix(this, rx, ry, rz, partial), M3.scale(f3 * s, (1 / f3) * s, f3 * s));
    const [sky, blk] = er.lightAt(this.x, this.y + this.h / 2, this.z);
    const col = er.entColor(this);
    const gap = (this.psplit + (this.split - this.psplit) * partial) * 3;
    er.drawModel(MODELS.magmaSlime, 'magma_slime', base, {}, col, -1, 0, { only: ['core'] });
    er.drawModel(MODELS.magmaSlime, 'magma_slime', base, { top: { rot: [0, 0, 0], off: [0, gap, 0] } }, col, sky, Math.max(blk, 0.5), { only: ['top', 'bottom'] });
  }
}

// ---------------------------------------------------------------------------
// The flare: hovers in the fortresses, flares up and looses three burning bolts
// ---------------------------------------------------------------------------
class Flare extends Monster {
  constructor(world) {
    super(world, 'flare');
    this.maxHealth = this.health = 20;
    this.w = 0.6; this.h = 1.8; this.eye = 1.6;
    this.fireImmune = true; this.swims = false;
    this.damage = 6;
    this.burst = 0; this.burstTimer = 0; this.hover = 0.5 + Math.random(); this.hoverTimer = 0;
    this.talkInterval = 80;
    this.xpValue = 10;
  }
  get blazing() { return this.burst > 0; }
  travel(strafe, forward) {
    // sinks slowly, floats up toward its quarry
    if (!this.onGround && this.vy < 0) this.vy *= 0.6;
    super.travel(strafe, forward);
  }
  aiTick(game) {
    const w = this.world;
    this.updateTarget(game, 20, 48);
    const t = this.target;
    if (--this.hoverTimer <= 0) { this.hoverTimer = 100; this.hover = 0.5 + Math.random() * 3; }
    if (t && t.y + this.hover > this.y + 0.5) this.vy += (0.3 - this.vy) * 0.3;
    if (!t) {
      if (this.pathDone && Math.random() < 1 / 120) this.wander(8, 3, 0.8);
      this.idleLook(game);
      return;
    }
    this.lookAtEntity(t, 2);
    this.yaw = approachAngle(this.yaw, Math.atan2(-(t.x - this.x), -(t.z - this.z)), 20 * DEG);
    const d2 = this.distSqTo(t);
    if (d2 < 4) {
      if (this.attackTimer <= 0) { this.attackTimer = 20; if (this.attackEntity(t, this.damage)) t.fire = Math.max(t.fire || 0, 80); }
      this.steerTo(t.x, t.y, t.z, 1.0);
      return;
    }
    if (d2 < 30 * 30 && this.canSee(t)) {
      if (--this.burstTimer <= 0) {
        this.burst++;
        if (this.burst === 1) { this.burstTimer = 60; }
        else if (this.burst <= 4) { this.burstTimer = 6; this.shoot(game, t); }
        else { this.burstTimer = 100; this.burst = 0; }
      }
      if (this.burst === 0 && d2 > 64) this.steerTo(t.x, t.y, t.z, 0.8);
    } else if (--this.repath <= 0 || !this.path) { this.repath = 20; this.navigateTo(t.x, t.y, t.z, 1.0, 32); }
  }
  shoot(game, t) {
    const w = this.world;
    const sx = this.x, sy = this.y + this.h / 2 + 0.3, sz = this.z;
    const d = Math.sqrt(this.distSqTo(t));
    const k = Math.sqrt(d) * 0.5;
    const dx = t.x - sx + (Math.random() - 0.5) * k * 0.6, dy = t.y + t.h / 2 - sy, dz = t.z - sz + (Math.random() - 0.5) * k * 0.6;
    game.spawnEntity(new Fireball(w, this, false, sx, sy, sz, dx, dy, dz));
    game.audio.play('flare_shoot', 1, (Math.random() - Math.random()) * 0.2 + 1, this.x, this.y + this.eye, this.z);
  }
  hurt(amount, src) {
    if (src && src.type === 'fall') return false;
    return super.hurt(amount, src);
  }
  mobTick(game) {
    const w = this.world;
    // water and snow hurt it
    if (this.inWater && this.age % 10 === 0) this.hurt(1, { type: 'drown' });
    if (Math.random() < 0.08) game.particles.smoke(this.x + (Math.random() - 0.5) * 0.6, this.y + Math.random() * this.h, this.z + (Math.random() - 0.5) * 0.6, 1, true);
    if (this.blazing && Math.random() < 0.5) game.particles.flame(this.x + (Math.random() - 0.5) * 0.6, this.y + 0.8 + Math.random() * 1.0, this.z + (Math.random() - 0.5) * 0.6);
    if (this.age % 24 === 0 && Math.random() < 0.3) game.audio.play('fire', 0.5, 0.8 + Math.random() * 0.3, this.x, this.y + 1, this.z);
    void w;
  }
  onDeath(src) { super.onDeath(src); }
  dropLoot(game, byPlayer) { if (byPlayer) this.drop(ITEM_IDS.flare_rod, this.rnd(2)); }
  soundPitch() { return (Math.random() - Math.random()) * 0.2 + 1; }
  render(er, rx, ry, rz, partial) {
    const t = this.age + partial;
    const bob = Math.sin(t * 0.1) * 0.08;
    const base = er.baseMatrix(this, rx, ry + bob, rz, partial);
    const pose = { head: [this.ppitch + (this.pitch - this.ppitch) * partial, wrapRadians(this.headYaw - this.bodyYaw), 0] };
    // two rings of rods wheeling in opposite directions, rising and falling
    for (let i = 0; i < 8; i++) {
      // the upper ring flares out round the cage, the lower one tucks in beneath it like a flame's tail
      const upper = i < 4, a = (upper ? t * 0.08 : -t * 0.06) + (i % 4) * Math.PI / 2 + (upper ? 0 : Math.PI / 4);
      const r = upper ? 7.5 : 4.5, y = (upper ? 19 : 10) + Math.sin(t * 0.12 + i * 1.7) * 1.5;
      const lean = upper ? 0.45 : -0.35;
      pose['rod' + i] = { rot: [lean, Math.PI / 2 - a, 0], off: [Math.cos(a) * r, y, Math.sin(a) * r] };
    }
    er.drawModel(MODELS.flare, 'flare', base, pose, er.entColor(this), -1, 0);
    er.glow(rx, ry + 1.1 + bob, rz, this.blazing ? 1.3 : 0.9, [255, 140, 40, this.blazing ? 120 : 70]);
  }
}

MOB_CLASSES.charred = Charred;
MOB_CLASSES.wailer = Wailer;
MOB_CLASSES.magma_slime = MagmaSlime;
MOB_CLASSES.flare = Flare;

// ---------------------------------------------------------------------------
// Underworld spawning: by region, ignoring the dark (it is always dark), and
// fortress-dwellers inside fortress walls.
// ---------------------------------------------------------------------------
MobSpawner.prototype.tickUnder = function (rd, area) {
  const g = this.game, w = g.world, p = g.player;
  if (this.t % 20 === 1) this.count();
  const cap = Math.max(8, Math.round(26 * area / 169));
  if (w.difficulty === 0) return;
  if (this.counts.monster >= cap || this.t % 4) return;
  const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
  const cx = pcx + this.rnd(rd * 2 + 1) - rd, cz = pcz + this.rnd(rd * 2 + 1) - rd;
  const c = w.getChunk(cx, cz); if (!c) return;
  const x0 = cx * 16 + this.rnd(16), z0 = cz * 16 + this.rnd(16), y0 = 8 + this.rnd(110);
  if (w.getBlock(x0, y0, z0) !== 0) return;
  const fort = w.localGen.fortressNear ? w.localGen.fortressNear(x0, z0) : null;
  const inFort = fort && y0 >= fort.F - 2 && y0 <= fort.F + 6;
  const b = BIOMES[w.biomeAt(x0, z0)];
  const table = inFort ? [['flare', 10], ['charred', 5], ['skeleton', 8], ['magma_slime', 3]] : (b && b.umobs) || [['charred', 100]];
  let tot = 0; for (const e of table) tot += e[1];
  let r = Math.random() * tot, type = table[0][0];
  for (const e of table) { r -= e[1]; if (r < 0) { type = e[0]; break; } }
  if (type === 'wailer') {
    // wailers need room: a big pocket of air, well away from you
    if ((x0 - p.x) ** 2 + (z0 - p.z) ** 2 < 40 * 40 || this.counts.wailers >= 3) return;
    for (let dx = -2; dx <= 2; dx++) for (let dy = 0; dy <= 4; dy++) for (let dz = -2; dz <= 2; dz++) if (w.getBlock(x0 + dx, y0 + dy, z0 + dz) !== 0) return;
    g.spawnMob('wailer', x0 + 0.5, y0, z0 + 0.5);
    this.counts.monster++; this.counts.wailers++;
    return;
  }
  // everyone else needs a floor
  let y = y0;
  while (y > 1 && w.getBlock(x0, y - 1, z0) === 0) y--;
  const pack = type === 'charred' ? 4 : type === 'magma_slime' ? 2 : type === 'flare' ? 2 : 3;
  let n = 0;
  for (let k = 0; k < 8 && n < pack; k++) {
    const x = x0 + this.rnd(5) - 2, z = z0 + this.rnd(5) - 2;
    if ((x + 0.5 - p.x) ** 2 + (y - p.y) ** 2 + (z + 0.5 - p.z) ** 2 < 24 * 24 || !w.isLoaded(x, z)) continue;
    const below = w.getBlock(x, y - 1, z);
    if (!BT.solid[below] || below === B.BEDROCK || below === B.BRIMSTONE_FENCE) continue;
    if (!this.canStand(x, y, z, type === 'magma_slime' ? 1 : 2)) continue;
    if ((w.getLightRaw(x, y, z) & 15) > 11 && type !== 'charred') continue;
    g.spawnMob(type, x + 0.5, y, z + 0.5);
    n++; this.counts.monster++;
  }
};
// count wailers too (they share the monster cap but are capped on their own)
{
  const base = MobSpawner.prototype.count;
  MobSpawner.prototype.count = function () {
    base.call(this);
    let n = 0;
    for (const e of this.game.world.entities) if (!e.removed && e.type === 'wailer') n++;
    this.counts.wailers = n;
  };
}
