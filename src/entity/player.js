'use strict';
// ---------------------------------------------------------------------------
// The player
// ---------------------------------------------------------------------------
function xpBarCap(level) { return level >= 30 ? 112 + (level - 30) * 9 : level >= 15 ? 37 + (level - 15) * 5 : 7 + level * 2; }

class Player extends Living {
  constructor(world, game) {
    super(world);
    this.type = 'player';
    this.game = game;
    this.w = 0.6; this.h = 1.8; this.eye = 1.62;
    this.inventory = new PlayerInventory();
    this.gameMode = 'survival';
    this.flying = false; this.flySpeed = 0.05;
    this.food = 20; this.saturation = 5; this.exhaustion = 0; this.foodTimer = 0;
    this.air = 300;
    this.xpLevel = 0; this.xp = 0; this.xpTotal = 0; this.score = 0;
    this.spawnPoint = null;
    this.distWalked = 0; this.pdistWalked = 0; this.bob = 0; this.pbob = 0; this.bobPitch = 0; this.pbobPitch = 0;
    this.stepDist = 0; this.nextStep = 1;
    this.sprintTap = 0; this.jumpTap = 0; this.prevForwardKey = false; this.prevJumpKey = false;
    this.useItem = null; this.useTime = 0; this.useMax = 0;
    this.sleeping = false; this.sleepTimer = 0; this.bedPos = null;
    this.hurtDir = 0;
    this.equip = 1; this.pequip = 1; this.lastHeld = null; this.lastSelected = 0;
    this.eyeOffset = 0; this.peyeOffset = 0;
    this.portalCooldown = 0;
    this.attackCooldown = 0;
    this.stats = { blocksMined: 0, distance: 0, mobsKilled: 0, deaths: 0, playTime: 0, jumps: 0, itemsCrafted: 0, damageTaken: 0 };
    this.discovered = { biomes: {}, mobs: {}, items: {}, structures: {} };
    this.achievements = {};
    this.lastBiome = -1;
    this.riding = null; this.fishHook = null; this.pendingMount = null; this.prevSneakKey = false;
    this.enchantSeed = (Math.random() * 2147483647) | 0;
  }
  get creative() { return this.gameMode === 'creative'; }
  get survivalLike() { return this.gameMode === 'survival' || this.gameMode === 'hardcore'; }
  get eyeHeight() { return this.sneaking && !this.flying ? 1.54 : 1.62; }

  setGameMode(m) {
    this.gameMode = m;
    if (m !== 'creative') this.flying = false;
    this.invulnerable = m === 'creative';
  }

  // ---------------------------------------------------------------- per tick
  tick(input) {
    this.baseTick();
    if (this.sleeping) { this.forward = 0; this.strafe = 0; this.jumping = false; }
    else this.applyInput(input);
    this.pdistWalked = this.distWalked; this.pbob = this.bob; this.pbobPitch = this.bobPitch;
    this.peyeOffset = this.eyeOffset;
    const target = this.sneaking && !this.flying ? -0.08 : 0;
    this.eyeOffset += (target - this.eyeOffset) * 0.5;
    const ox = this.x, oz = this.z, oy = this.y;
    this.livingTick();
    // walking stats, view bobbing, footsteps
    const dx = this.x - ox, dz = this.z - oz, hd = Math.sqrt(dx * dx + dz * dz);
    this.distWalked += hd * 0.6;
    let bt = (this.onGround && !this.dead && !this.flying && !this.riding) ? Math.min(0.1, hd) : 0;
    let pt = (this.onGround && !this.dead) ? 0 : Math.atan(-this.vy * 0.2) * 15;
    this.bob += (bt - this.bob) * 0.4;
    this.bobPitch += (pt - this.bobPitch) * 0.8;
    if (this.onGround && !this.sneaking && hd > 0.001 && !this.riding) {
      this.stepDist += hd;
      if (this.stepDist > this.nextStep) { this.nextStep = this.stepDist + 1.3; this.game.onFootstep(this); }
    }
    if (this.inWater && hd > 0.01 && this.age % 12 === 0) this.game.audio.play('swim', 0.15, 1 + (Math.random() - 0.5) * 0.4);
    this.stats.distance += Math.sqrt(dx * dx + dz * dz + (this.y - oy) * (this.y - oy));
    if (this.survivalLike && !this.riding) this.exhaust(this.sprinting ? 0.1 * hd : (this.inWater ? 0.015 * hd : 0.01 * hd));
    this.updateStats();
    this.updateUse(input);
    // equip animation when the held item changes
    this.pequip = this.equip;
    const held = this.inventory.held();
    const same = (this.lastHeld === held) && this.lastSelected === this.inventory.selected;
    this.equip += clamp((same ? 1 : 0) - this.equip, -0.4, 0.4);
    if (this.equip < 0.1) { this.lastHeld = held; this.lastSelected = this.inventory.selected; }
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.portalCooldown > 0) this.portalCooldown--;
    this.stats.playTime++;
    // discovery: biomes
    if (this.age % 20 === 0) {
      const b = this.world.biomeAt(Math.floor(this.x), Math.floor(this.z));
      if (b !== this.lastBiome) { this.lastBiome = b; this.game.onBiomeEnter(b); }
    }
  }

  applyInput(inp) {
    const g = this.game;
    const k = (n) => inp.isDown(KEYS[n]);
    let fwd = 0, str = 0;
    if (k('forward')) fwd += 1; if (k('back')) fwd -= 1;
    if (k('right')) str += 1; if (k('left')) str -= 1;
    if (g.touch && g.touch.active) { fwd = g.touch.forward; str = g.touch.strafe; }
    let wantSneak = k('sneak') || (g.touch && g.touch.sneak);
    const jumpKey = k('jump') || (g.touch && g.touch.jump);
    if (this.riding) {
      // sneak hops out of a boat
      if (wantSneak && !this.prevSneakKey) { this.prevSneakKey = true; this.riding.dismount(); if (g.touch) g.touch.sneak = false; }
      this.prevSneakKey = wantSneak;
      this.forward = fwd * 0.98; this.strafe = str * 0.98;
      this.jumping = false; this.sprinting = false; this.sneaking = false; this.flying = false;
      return;
    }
    this.prevSneakKey = wantSneak;
    // creative flight toggle (double-tap jump)
    if (jumpKey && !this.prevJumpKey) {
      if (this.creative) {
        if (this.jumpTap > 0) { this.flying = !this.flying; this.jumpTap = 0; if (this.flying) this.vy = 0; }
        else this.jumpTap = 7;
      }
    }
    if (this.jumpTap > 0) this.jumpTap--;
    this.prevJumpKey = jumpKey;
    if (this.flying && this.onGround && !jumpKey) this.flying = false;
    // sprinting (ctrl or double-tap forward)
    const fwdKey = fwd > 0.5;
    if (fwdKey && !this.prevForwardKey) {
      if (this.sprintTap > 0 && this.canSprint()) this.sprinting = true;
      this.sprintTap = 7;
    }
    if (this.sprintTap > 0) this.sprintTap--;
    this.prevForwardKey = fwdKey;
    if ((k('sprint') || (g.touch && g.touch.sprint)) && fwdKey && this.canSprint()) this.sprinting = true;
    if (!fwdKey || this.collidedH || wantSneak || !this.canSprint() || this.useItem) this.sprinting = false;
    this.sneaking = wantSneak && !this.flying;
    if (this.sneaking) { fwd *= 0.3; str *= 0.3; }
    if (this.useItem) { fwd *= 0.2; str *= 0.2; }
    this.forward = fwd * 0.98; this.strafe = str * 0.98;
    this.jumping = jumpKey;
    if (this.flying) {
      this.jumping = false;
      if (wantSneak || (g.touch && g.touch.flyDown)) this.vy -= this.flySpeed * 3;
      if (jumpKey) this.vy += this.flySpeed * 3;
    }
    // auto-jump (touch): step up one-block ledges while walking forward
    if (g.settings.autoJump && this.onGround && fwd > 0.1 && !this.sneaking && !this.flying && !this.inWater) {
      const yaw = this.yaw;
      const ax = this.x - Math.sin(yaw) * 0.55, az = this.z - Math.cos(yaw) * 0.55;
      const by = Math.floor(this.y + 0.01);
      const a = this.world.getBlock(Math.floor(ax), by, Math.floor(az));
      const top = this.world.getBlock(Math.floor(ax), by + 1, Math.floor(az));
      const head = this.world.getBlock(Math.floor(this.x), by + 2, Math.floor(this.z));
      if (BT.solid[a] && !BT.solid[top] && !BT.solid[head] && this.jumpTicks === 0 && a !== B.FENCE && a !== B.FENCE_GATE) {
        const coll = []; blockCollisionBoxes(this.world, Math.floor(ax), by, Math.floor(az), a, this.world.getMeta(Math.floor(ax), by, Math.floor(az)), coll);
        const h = coll.reduce((m, b) => Math.max(m, b.y1), 0) - this.y;
        if (h > 0.6 && h <= 1.05) this.jumping = true;
      }
    }
  }
  canSprint() { return !this.survivalLike || this.food > 6 || this.flying; }
  onJump() {
    this.stats.jumps++;
    if (this.survivalLike) this.exhaust(this.sprinting ? 0.8 : 0.2);
  }
  exhaust(n) { if (this.survivalLike) this.exhaustion = Math.min(40, this.exhaustion + n); }
  onLand(dist) {
    if (this.creative || this.flying) return;
    const below = this.world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z));
    let d = Math.ceil(dist - 3);
    if (below === B.HAY_BALE) d = Math.ceil(d * 0.2);
    if (this.inWater) d = 0;
    if (d > 0) {
      this.hurt(d, { type: 'fall' });
      this.game.audio.play(d > 4 ? 'fall_big' : 'fall_small', 0.8);
    }
    if (dist > 1.5 && d <= 0 && below) this.game.onFootstep(this, true);
  }
  updateStats() {
    if (!this.survivalLike || this.dead) { this.air = 300; return; }
    const diff = this.world.difficulty;
    // hunger
    if (this.exhaustion > 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else if (diff > 0) this.food = Math.max(0, this.food - 1);
    }
    if (diff === 0 && this.age % 20 === 0) { if (this.health < this.maxHealth) this.heal(1); if (this.food < 20) this.food++; }
    if (this.food >= 18 && this.health < this.maxHealth && this.health > 0) {
      if (++this.foodTimer >= 80) { this.heal(1); this.exhaust(3); this.foodTimer = 0; }
    } else if (this.food <= 0) {
      if (++this.foodTimer >= 80) {
        if (this.health > 10 || diff >= 3 || (this.health > 1 && diff === 2)) this.hurt(1, { type: 'starve' });
        this.foodTimer = 0;
      }
    } else this.foodTimer = 0;
    // air
    if (this.headInWater) {
      const resp = Enchant.level(this.inventory.armor.items[0], 'respiration');
      if (!(resp > 0 && Math.random() < resp / (resp + 1))) this.air--;
      if (this.air <= -20) { this.air = 0; this.hurt(2, { type: 'drown' }); }
    } else this.air = 300;
    if (this.effects.poison && this.age % 25 === 0 && this.health > 1) this.hurt(1, { type: 'magic' });
    if (this.effects.hunger) this.exhaust(0.025);
    if (this.effects.regen && this.age % 50 === 0) this.heal(1);
  }
  addXP(n) {
    this.score += n; this.xpTotal += n;
    let cap = xpBarCap(this.xpLevel);
    this.xp += n / cap;
    while (this.xp >= 1) { this.xp = (this.xp - 1) * cap; this.xpLevel++; cap = xpBarCap(this.xpLevel); this.xp /= cap; if (this.xpLevel % 5 === 0) this.game.audio.play('levelup', 0.75); }
  }
  // spend whole levels (enchanting)
  removeLevels(n) {
    this.xpLevel = Math.max(0, this.xpLevel - n);
    if (this.xpLevel === 0) this.xp = 0;
  }
  addFood(hunger, sat) {
    this.food = Math.min(20, this.food + hunger);
    this.saturation = Math.min(this.food, this.saturation + hunger * sat * 2);
  }
  onHurt(amount, src) {
    this.stats.damageTaken += amount;
    // thorns: attackers sometimes get hurt back
    const att = src && src.entity;
    if (att && att !== this && att.hurt && src.type !== 'thorns') {
      for (const a of this.inventory.armor.items) {
        const t = Enchant.level(a, 'thorns');
        if (t && Math.random() < 0.15 * t) { att.hurt(1 + Math.floor(Math.random() * 4), { type: 'thorns', entity: this, knockback: 0.2 }); a.dmg = Math.min(maxDamageOf(a.id) - 1, a.dmg + 2); break; }
      }
    }
    if (att && att !== this) rallyWolves(this.game, att);
    if (src.entity) this.hurtDir = Math.atan2(src.entity.z - this.z, src.entity.x - this.x) * 180 / Math.PI - this.yaw * 180 / Math.PI;
    else this.hurtDir = 0;
    this.exhaust(0.3);
    this.game.audio.play('hurt', 1, 1 + (Math.random() - 0.5) * 0.2);
    if (this.sleeping) this.game.wakeUp();
  }
  // protection enchantments on top of the armour itself
  enchantReduction(src) { return Enchant.protection(this.inventory.armor.items, src); }
  damageArmor(amount) {
    const n = Math.max(1, Math.floor(amount / 4));
    for (let i = 0; i < 4; i++) {
      const a = this.inventory.armor.items[i];
      if (!a || !Enchant.wears(a, true)) continue;
      a.dmg += n;
      if (a.dmg >= maxDamageOf(a.id)) { this.inventory.armor.items[i] = null; this.game.audio.play('break_tool', 0.8); }
    }
    this.inventory.armor.changed();
  }
  armorValue() {
    let v = 0;
    for (const a of this.inventory.armor.items) { if (!a) continue; const d = armorOf(a.id); if (d) v += d.points; }
    return v;
  }
  onDeath(src) {
    this.stats.deaths++;
    this.sprinting = false;
    this.game.onPlayerDeath(src);
  }
  onToolBreak(stack) {
    this.game.audio.play('break_tool', 0.8, 0.8 + Math.random() * 0.4);
    this.game.spawnItemParticles(stack, 6);
  }
  onSplash() {
    const sp = Math.min(1, Math.sqrt(this.vx * this.vx * 0.2 + this.vy * this.vy + this.vz * this.vz * 0.2) * 0.2);
    if (this.age > 20) this.game.audio.play('splash', Math.min(1, 0.2 + sp), 1 + (Math.random() - 0.5) * 0.4);
    this.game.particles.splash(this.x, Math.floor(this.y) + 1, this.z);
  }

  // ---------------------------------------------------------------- item use (eating, bows, ...)
  startUse(stack) {
    const f = foodOf(stack.id);
    const def = ITEMS[stack.id];
    if (f) {
      if (!this.survivalLike && !f.always) { /* creative players can still eat */ }
      if (this.food >= 20 && !f.always && this.survivalLike) return false;
      this.useItem = stack; this.useTime = 32; this.useMax = 32; return true;
    }
    if (def && def.drink) { this.useItem = stack; this.useTime = 32; this.useMax = 32; return true; }
    if (stack.id === ITEM_IDS.bow) {
      if (!this.creative && this.inventory.main.count(ITEM_IDS.arrow) === 0) return false;
      this.useItem = stack; this.useTime = 72000; this.useMax = 72000; return true;
    }
    return false;
  }
  updateUse(inp) {
    if (!this.useItem) return;
    const held = this.inventory.held();
    if (held !== this.useItem) { this.useItem = null; return; }
    const holding = this.game.useHeld();
    if (this.useItem.id === ITEM_IDS.bow) {
      if (!holding) { this.game.releaseBow(this, this.useMax - this.useTime); this.useItem = null; return; }
      this.useTime--;
      return;
    }
    if (!holding) { this.useItem = null; return; }
    this.useTime--;
    if (this.useTime % 4 === 0 && this.useTime > 0 && this.useTime < 26) {
      this.game.audio.play(ITEMS[this.useItem.id] && ITEMS[this.useItem.id].drink ? 'drink' : 'eat', 0.5, 0.9 + Math.random() * 0.2);
      if (!(ITEMS[this.useItem.id] && ITEMS[this.useItem.id].drink)) this.game.spawnItemParticles(this.useItem, 3, true);
    }
    if (this.useTime <= 0) { this.finishUse(); this.useItem = null; }
  }
  finishUse() {
    const s = this.useItem;
    const f = foodOf(s.id);
    const def = ITEMS[s.id];
    if (f) {
      this.addFood(f.hunger, f.sat);
      if (f.hungerChance && Math.random() < f.hungerChance) this.effects.hunger = f.hungerTicks || 600;
      if (f.poisonChance && Math.random() < f.poisonChance) this.effects.poison = f.poisonTicks || 100;
      if (f.regen) this.effects.regen = 100;
      if (f.nightVision) this.effects.nightVision = Math.max(this.effects.nightVision || 0, f.nightVision === 1 ? 3600 : f.nightVision);
      this.game.audio.play('burp', 0.5, 0.9 + Math.random() * 0.1);
      this.game.onAte(s);
    }
    if (def && def.drink && s.id === ITEM_IDS.milk_bucket) this.effects = {};
    if (!this.creative) {
      if (def && def.container) {
        const cont = new ItemStack(ITEM_IDS[def.container], 1, 0);
        if (s.count <= 1) this.inventory.setHeld(cont);
        else { this.inventory.decrementHeld(1); this.game.giveItem(cont); }
      } else this.inventory.decrementHeld(1);
    }
  }

  save() {
    const v = this.riding;
    return {
      x: this.x, y: v ? v.y + v.h + 0.01 : this.y, z: this.z, yaw: this.yaw, mount: v ? { x: v.x, y: v.y, z: v.z } : undefined, pitch: this.pitch, health: this.health, food: this.food, saturation: this.saturation,
      exhaustion: this.exhaustion, air: this.air, xpLevel: this.xpLevel, xp: this.xp, xpTotal: this.xpTotal, score: this.score,
      gameMode: this.gameMode, flying: this.flying, inventory: this.inventory.toJSON(), spawnPoint: this.spawnPoint, fire: this.fire,
      fallDistance: this.fallDistance, stats: this.stats, discovered: this.discovered, achievements: this.achievements, effects: this.effects,
      enchantSeed: this.enchantSeed,
    };
  }
  load(d) {
    if (!d) return;
    this.setPos(d.x, d.y, d.z);
    this.yaw = d.yaw || 0; this.pitch = d.pitch || 0;
    this.health = d.health === undefined ? 20 : d.health;
    this.food = d.food === undefined ? 20 : d.food; this.saturation = d.saturation === undefined ? 5 : d.saturation;
    this.exhaustion = d.exhaustion || 0; this.air = d.air === undefined ? 300 : d.air;
    this.xpLevel = d.xpLevel || 0; this.xp = d.xp || 0; this.xpTotal = d.xpTotal || 0; this.score = d.score || 0;
    this.setGameMode(d.gameMode || 'survival');
    this.flying = !!d.flying && this.creative;
    this.inventory.load(d.inventory);
    this.spawnPoint = d.spawnPoint || null;
    this.fire = d.fire || 0; this.fallDistance = d.fallDistance || 0;
    if (d.stats) Object.assign(this.stats, d.stats);
    if (d.discovered) this.discovered = Object.assign({ biomes: {}, mobs: {}, items: {}, structures: {} }, d.discovered);
    if (d.achievements) this.achievements = d.achievements;
    if (d.effects) this.effects = d.effects;
    if (d.enchantSeed !== undefined) this.enchantSeed = d.enchantSeed;
    this.pendingMount = d.mount ? { x: d.mount.x, y: d.mount.y, z: d.mount.z, t: 200 } : null;
  }
}
