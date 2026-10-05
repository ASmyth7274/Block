'use strict';
// ---------------------------------------------------------------------------
// Golems. The iron keeper walks the lanes of a village and stands between its
// folk and the dark, flinging monsters into the air. A village raises keepers
// of its own wherever enough villagers live together - which is how an iron
// farm is made - and anyone can raise one by hand: four blocks of iron in a T,
// with a pumpkin set on top. The snowkin is two blocks of snow and a pumpkin;
// it pelts monsters with snowballs, leaves snow wherever it walks, and melts
// away in hot lands and in the rain.
// ---------------------------------------------------------------------------
MOB_TYPES.push(
  { key: 'iron_keeper', name: 'Iron Keeper', egg: ['#d6d0c5', '#4c7a28'], cat: 'golem', lore: 'A hulking guardian of riveted iron that walks the lanes of a village and flings monsters into the air. Villages raise their own wherever enough folk live together; you can raise one yourself from four blocks of iron in a T, with a pumpkin on top.' },
  { key: 'snowkin', name: 'Snowkin', egg: ['#f4f8ff', '#e08a24'], cat: 'golem', lore: 'Two blocks of snow and a pumpkin, brought to life. It pelts monsters with snowballs and leaves snow wherever it walks - but it melts in hot lands and in the rain.' },
);
MOB_TYPES.forEach((m, i) => { if (m) { m.index = i; MOB_INDEX[m.key] = m; } });

// a triangle wave, for the stomping walk and the overhead blow
function golemWave(t, p) { return (Math.abs(((t % p) + p) % p - p * 0.5) - p * 0.25) / (p * 0.25); }

class IronKeeper extends Mob {
  constructor(world) {
    super(world, 'iron_keeper');
    this.category = 'golem'; this.persistent = true;
    this.maxHealth = this.health = 100;
    this.w = 1.4; this.h = 2.7; this.eye = 2.3;
    this.baseSpeed = 0.25;
    this.playerMade = false;
    this.home = null;            // the middle of the village it watches over
    this.blowT = 0;              // the overhead blow, coming down
    this.flowerT = 0; this.flowerFor = null;
    this.xpValue = 0; this.swims = false; this.noFallDamage = true; this.noDrown = true;
    this.pathNodes = 300; this.stepAt = 0;
  }
  // nothing knocks it back, it cannot drown, and a fall does it no harm
  knockback() {}
  hurt(amount, src) {
    if (src && (src.type === 'fall' || src.type === 'drown' || src.type === 'suffocate')) return false;
    return super.hurt(amount, src);
  }
  setTarget(e) { this.target = e; this.unseen = 0; if (!e) this.clearPath(); }
  // monsters, but not the boomcaps (it lets those be)
  isFoe(e) { return !!e && e !== this && !e.dead && !e.removed && !!e.hurt && !!e.hostile && e.type !== 'boomcap' && e.category !== 'golem'; }
  findFoe() {
    const r = 16;
    let best = null, bd = r * r;
    for (const e of this.world.entitiesInBox(this.x - r, this.y - 6, this.z - r, this.x + r, this.y + 6, this.z + r)) {
      if (!this.isFoe(e)) continue;
      const d = this.distSqTo(e);
      if (d < bd && this.canSee(e)) { bd = d; best = e; }
    }
    return best;
  }
  // it answers a blow - unless a player who raised it struck it; and it remembers who harms its villagers
  onRevenge(e) {
    if (!e || e === this || e.dead) return;
    if (e.type === 'player') { if (this.playerMade || !e.survivalLike) return; }
    else if (e.category === 'golem' || e.type === 'villager') return;
    this.setTarget(e);
  }
  aiTick(game) {
    const w = this.world;
    const t0 = this.target;
    if (t0 && (t0.dead || t0.removed || this.distSqTo(t0) > 32 * 32 || (t0.type === 'player' && (!t0.survivalLike || this.playerMade)))) this.setTarget(null);
    if (this.target && !this.canSee(this.target) && ++this.unseen > 100) this.setTarget(null);
    if (!this.target && ++this.targetSearch % 10 === 0) { const f = this.findFoe(); if (f) this.setTarget(f); }
    const t = this.target;
    if (t) {
      this.flowerT = 0;
      const d2 = this.chase(1.0);
      if (this.attackTimer <= 0 && d2 <= this.meleeReach(t) && this.canSee(t)) this.strike(game, t);
      return;
    }
    // holding out a flower to a villager
    if (this.flowerT > 0) {
      this.clearPath();
      if (this.flowerFor && !this.flowerFor.dead) this.lookAtEntity(this.flowerFor, 2);
      return;
    }
    // it keeps to its village
    if (this.home && this.pathDone) {
      const hx = this.home[0] + 0.5, hz = this.home[1] + 0.5, d2 = (this.x - hx) ** 2 + (this.z - hz) ** 2;
      if (d2 > 24 * 24 && Math.random() < 0.05) { this.navigateTo(hx, this.home[2] !== undefined ? this.home[2] : this.y, hz, 0.6, 40); return; }
    }
    if (this.pathDone && Math.random() < 1 / 160) this.wander(10, 4, 0.6, (x, y, z) => (this.home ? -Math.hypot(x - this.home[0], z - this.home[1]) / 8 : 0));
    // now and then it offers a flower to a villager standing near
    if (this.pathDone && Math.random() < 1 / 2400) {
      const v = w.entitiesInBox(this.x - 6, this.y - 2, this.z - 6, this.x + 6, this.y + 3, this.z + 6).find((e) => e.type === 'villager' && !e.dead);
      if (v) { this.flowerT = 400; this.flowerFor = v; }
    }
    this.idleLook(game); this.keepWatching();
  }
  // the overhead blow: hard enough to send a zombie flying
  strike(game, t) {
    this.attackTimer = 20; this.blowT = 10;
    game.audio.play('keeper_attack', 1, 0.9 + Math.random() * 0.2, this.x, this.y + 1.5, this.z);
    if (this.attackEntity(t, 7 + this.rnd(15))) t.vy += 0.4;
  }
  mobTick(game) {
    if (this.blowT > 0) this.blowT--;
    if (this.flowerT > 0 && --this.flowerT === 0) this.flowerFor = null;
    // heavy, ringing footfalls
    if (this.onGround && this.limbAmount > 0.2) {
      const s = Math.floor(this.limbSwing / 6.5);
      if (s !== this.stepAt) { this.stepAt = s; game.audio.play('keeper_step', 0.55, 0.9 + Math.random() * 0.15, this.x, this.y, this.z); }
    }
  }
  saySound() { return null; }
  hurtSound() { return 'keeper_hurt'; }
  deathSound() { return 'keeper_death'; }
  dropLoot() {
    this.drop(B.FLOWER, this.rnd(3), 0);
    this.drop(ITEM_IDS.iron_ingot, 3 + this.rnd(3), 0);
  }
  render(er, rx, ry, rz, partial) {
    const [sky, blk] = er.lightAt(this.x, this.y + 1.5, this.z);
    const pose = this.quadPose(partial);
    const swing = this.limbSwing - this.limbAmount * (1 - partial);
    const amt = clamp(this.prevLimbAmount + (this.limbAmount - this.prevLimbAmount) * partial, 0, 1);
    const wv = golemWave(swing, 13);
    const p = { head: pose.head, rleg: [1.5 * wv * amt, 0, 0], lleg: [-1.5 * wv * amt, 0, 0], rarm: [(0.2 - 1.5 * wv) * amt, 0, 0], larm: [(0.2 + 1.5 * wv) * amt, 0, 0] };
    if (this.blowT > 0) { const a = 2.0 - 1.5 * golemWave(this.blowT - partial, 10); p.rarm = [a, 0, 0]; p.larm = [a, 0, 0]; }
    else if (this.flowerT > 0) { p.rarm = [0.8 - 0.025 * golemWave(this.flowerT - partial, 70), 0, 0]; p.larm = [0, 0, 0]; }
    const base = er.baseMatrix(this, rx, ry, rz, partial);
    er.drawModel(MODELS.iron_keeper, 'iron_keeper', base, p, er.entColor(this), sky, blk);
    // the flower, held up in the right hand
    if (this.flowerT > 0 && !this.dead) {
      const A = MODELS.iron_keeper.rarm.pivot, a = p.rarm[0];
      let m = M3.mul(base, M3.trans(A[0], A[1], A[2]));
      m = M3.mul(m, M3.rx(a));
      m = M3.mul(m, M3.trans(0, -26, -3));
      m = M3.mul(m, M3.rx(-a));
      m = M3.mul(m, M3.scale(12, 12, 12));
      m = M3.mul(m, M3.trans(-0.5, 0, 0));
      er.drawItem(new ItemStack(B.FLOWER, 1, 0), m, sky, blk);
    }
  }
  save() { const d = super.save(); d.playerMade = this.playerMade || undefined; if (this.home) d.home = this.home; return d; }
  load(d) { super.load(d); this.playerMade = !!d.playerMade; this.home = d.home || null; this.persistent = true; }
}

class Snowkin extends Mob {
  constructor(world) {
    super(world, 'snowkin');
    this.category = 'golem'; this.persistent = true;
    this.maxHealth = this.health = 4;
    this.w = 0.7; this.h = 1.9; this.eye = 1.7;
    this.baseSpeed = 0.2;
    this.xpValue = 0; this.noDrown = true;
    this.throwT = 0; this.seeT = 0;
  }
  setTarget(e) { this.target = e; this.unseen = 0; if (!e) this.clearPath(); }
  findFoe() {
    const r = 10;
    let best = null, bd = r * r;
    for (const e of this.world.entitiesInBox(this.x - r, this.y - 4, this.z - r, this.x + r, this.y + 4, this.z + r)) {
      if (e.dead || e.removed || !e.hurt || !e.hostile || e.category === 'golem') continue;
      const d = this.distSqTo(e);
      if (d < bd && this.canSee(e)) { bd = d; best = e; }
    }
    return best;
  }
  onRevenge(e) { if (e && e !== this && !e.dead && e.type !== 'player' && e.hostile) this.setTarget(e); }
  aiTick(game) {
    const t0 = this.target;
    if (t0 && (t0.dead || t0.removed || this.distSqTo(t0) > 16 * 16)) this.setTarget(null);
    if (!this.target && ++this.targetSearch % 10 === 0) { const f = this.findFoe(); if (f) this.setTarget(f); }
    const t = this.target;
    if (t) {
      this.lookAtEntity(t, 2);
      const d2 = this.distSqTo(t), see = this.canSee(t);
      this.seeT = see ? this.seeT + 1 : 0;
      if (d2 <= 100 && this.seeT >= 20) { this.clearPath(); this.stopMoving(); }
      else if (--this.repath <= 0 || this.pathDone) { this.repath = 10; if (!this.navigateTo(t.x, t.y, t.z, 1.25, 24)) this.steerTo(t.x, t.y, t.z, 1.25); }
      if (--this.throwT <= 0 && see && d2 <= 100) { this.throwT = 20; this.throwAt(game, t); }
      return;
    }
    if (this.pathDone && Math.random() < 1 / 120) this.wander(8, 3, 1.0);
    this.idleLook(game); this.keepWatching();
  }
  // a snowball, lobbed a little high so that it drops onto its mark
  throwAt(game, t) {
    const w = this.world, sb = new Thrown(w, this, 'snowball');
    const sx = this.x, sy = this.y + this.eye - 0.1, sz = this.z;
    sb.setPos(sx, sy, sz);
    const dx = t.x - sx, dz = t.z - sz, dy = t.y + (t.eye || t.h * 0.85) - 1.1 - sy;
    const lift = Math.sqrt(dx * dx + dz * dz) * 0.2;
    let vx = dx, vy = dy + lift, vz = dz;
    const l = Math.hypot(vx, vy, vz) || 1, sp = 1.6, spread = 12 * 0.0075;
    vx = vx / l + (Math.random() * 2 - 1) * spread; vy = vy / l + (Math.random() * 2 - 1) * spread; vz = vz / l + (Math.random() * 2 - 1) * spread;
    sb.vx = vx * sp; sb.vy = vy * sp; sb.vz = vz * sp;
    game.spawnEntity(sb);
    this.swing();
    game.audio.play('bow', 0.5, 1 / (Math.random() * 0.4 + 0.8), this.x, this.y + 1.5, this.z);
  }
  temperature() {
    const w = this.world;
    if (w.dim === 1) return 2;
    if (w.dim !== 0) return 0.5;
    const b = BIOMES[w.biomeAt(Math.floor(this.x), Math.floor(this.z))];
    return b ? b.temp : 0.5;
  }
  mobTick(game) {
    const w = this.world, temp = this.temperature();
    // the wet and the heat wear it away
    if (this.age % 10 === 0) {
      if (this.inWater || w.isRainingAt(Math.floor(this.x), Math.floor(this.y + 1), Math.floor(this.z))) this.hurt(1, { type: 'drown' });
      else if (temp > 1) this.hurt(1, { type: 'melt' });
    }
    // and in the cold it leaves a trail of snow
    if (temp < 0.8 && !this.dead) {
      for (let l = 0; l < 4; l++) {
        const x = Math.floor(this.x + ((l % 2) * 2 - 1) * 0.25), y = Math.floor(this.y), z = Math.floor(this.z + ((Math.floor(l / 2) % 2) * 2 - 1) * 0.25);
        if (w.getBlock(x, y, z) === 0 && Behaviors.canStay(w, x, y, z, B.SNOW_LAYER, 0) && BT.opaque[w.getBlock(x, y - 1, z)]) w.setBlock(x, y, z, B.SNOW_LAYER, 0);
      }
    }
  }
  saySound() { return null; }
  hurtSound() { return 'snowkin_hurt'; }
  deathSound() { return 'snowkin_hurt'; }
  dropLoot() { this.drop(ITEM_IDS.snowball, this.rnd(16), 0); }
  render(er, rx, ry, rz, partial) {
    const [sky, blk] = er.lightAt(this.x, this.y + 1, this.z);
    const pose = this.quadPose(partial);
    const hy = pose.head[1];
    // the body turns a little after the head, the arms swing with it
    const p = { head: pose.head, upper: [0, hy * 0.25, 0], rarm: [0, hy, 0], larm: [0, hy, 0] };
    er.drawModel(MODELS.snowkin, 'snowkin', er.baseMatrix(this, rx, ry, rz, partial), p, er.entColor(this), sky, blk);
  }
}
MOB_CLASSES.iron_keeper = IronKeeper;
MOB_CLASSES.snowkin = Snowkin;

const Golems = {
  // a village raises an iron keeper now and then, wherever enough villagers have gathered
  // (each cluster of three or more, within sixteen blocks of each other, counts as a village)
  tickVillages(game) {
    const w = game.world;
    if (!w || w.menu || w.dim !== 0 || w.time % 100 !== 37) return;
    const folk = w.entities.filter((e) => e.type === 'villager' && !e.dead && !e.removed);
    if (folk.length < 3) return;
    const seen = new Set();
    for (const v of folk) {
      if (seen.has(v)) continue;
      const near = folk.filter((o) => Math.abs(o.x - v.x) <= 16 && Math.abs(o.z - v.z) <= 16 && Math.abs(o.y - v.y) <= 8);
      for (const o of near) seen.add(o);
      if (near.length < 3) continue;
      let cx = 0, cy = 0, cz = 0;
      for (const o of near) { cx += o.x; cy += o.y; cz += o.z; }
      cx /= near.length; cy /= near.length; cz /= near.length;
      const keepers = w.entities.filter((e) => e.type === 'iron_keeper' && !e.dead && !e.removed && (e.x - cx) ** 2 + (e.z - cz) ** 2 < 32 * 32).length;
      if (keepers >= 1 + Math.floor(near.length / 8)) continue;
      if (Math.random() >= 1 / 50) continue;
      this.raiseKeeper(game, cx, cy, cz);
    }
  },
  raiseKeeper(game, cx, cy, cz) {
    const w = game.world;
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(cx + (Math.random() * 2 - 1) * 8), z = Math.floor(cz + (Math.random() * 2 - 1) * 8);
      for (let y = Math.floor(cy) + 6; y >= Math.floor(cy) - 6; y--) {
        if (!this.roomAt(w, x, y, z)) continue;
        const k = game.spawnMob('iron_keeper', x + 0.5, y, z + 0.5);
        if (k) k.home = [Math.floor(cx), Math.floor(cz), Math.floor(cy)];
        return k;
      }
    }
    return null;
  },
  // firm ground underfoot and a clear space three blocks high and three across
  roomAt(w, x, y, z) {
    if (y < 1 || y >= CH_H - 3 || !w.isLoaded(x - 1, z - 1) || !w.isLoaded(x + 1, z + 1)) return false;
    const below = w.getBlock(x, y - 1, z);
    if (!BT.solid[below] || !BT.opaque[below]) return false;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy < 3; dy++) {
      const id = w.getBlock(x + dx, y + dy, z + dz);
      if (BT.solid[id] || BT.fluid[id]) return false;
    }
    return true;
  },
  // homes for villagers near a spot: each bed is one, and so is every other door
  villageRoom(w, x, y, z) {
    let beds = 0, doors = 0, folk = 0;
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    for (let dx = -16; dx <= 16; dx++) for (let dz = -16; dz <= 16; dz++) {
      if (!w.isLoaded(X + dx, Z + dz)) continue;
      for (let dy = -8; dy <= 8; dy++) {
        const id = w.getBlock(X + dx, Y + dy, Z + dz);
        if (id === B.BED) { if (w.getMeta(X + dx, Y + dy, Z + dz) & 4) beds++; }
        else if (id === B.DOOR_WOOD && !(w.getMeta(X + dx, Y + dy, Z + dz) & 8)) doors++;
      }
    }
    for (const e of w.entitiesInBox(X - 16, Y - 8, Z - 16, X + 17, Y + 9, Z + 17)) if (e.type === 'villager' && !e.dead) folk++;
    return folk < beds + Math.floor(doors / 2);
  },
  // a pumpkin set on a body of iron or of snow: it wakes
  checkBuild(game, x, y, z) {
    const w = game.world, at = (xx, yy, zz) => w.getBlock(xx, yy, zz);
    const clear = (xx, yy, zz) => { const id = at(xx, yy, zz); return id === 0 || (BT.replaceable[id] && !BT.fluid[id]); };
    if (at(x, y - 1, z) === B.SNOW && at(x, y - 2, z) === B.SNOW) {
      for (let k = 0; k < 3; k++) this.crumble(game, x, y - k, z);
      const s = game.spawnMob('snowkin', x + 0.5, y - 2 + 0.05, z + 0.5);
      if (s) { s.persistent = true; game.achieve('snowkin'); }
      return true;
    }
    if (at(x, y - 1, z) !== B.IRON_BLOCK || at(x, y - 2, z) !== B.IRON_BLOCK) return false;
    for (const [ax, az] of [[1, 0], [0, 1]]) {
      if (at(x + ax, y - 1, z + az) !== B.IRON_BLOCK || at(x - ax, y - 1, z - az) !== B.IRON_BLOCK) continue;
      if (!clear(x + ax, y - 2, z + az) || !clear(x - ax, y - 2, z - az) || !clear(x + ax, y, z + az) || !clear(x - ax, y, z - az)) continue;
      for (const [bx, by, bz] of [[x, y, z], [x, y - 1, z], [x + ax, y - 1, z + az], [x - ax, y - 1, z - az], [x, y - 2, z]]) this.crumble(game, bx, by, bz);
      const k = game.spawnMob('iron_keeper', x + 0.5, y - 2 + 0.05, z + 0.5);
      if (k) {
        k.playerMade = true; k.persistent = true;
        // facing the way its arms were not: out of the T
        k.yaw = k.bodyYaw = k.pbodyYaw = k.headYaw = k.pheadYaw = k.pyaw = ax ? 0 : Math.PI / 2;
        game.audio.play('keeper_wake', 1, 1, x + 0.5, y - 1, z + 0.5);
        game.achieve('keeper');
      }
      return true;
    }
    return false;
  },
  crumble(game, x, y, z) {
    const w = game.world, id = w.getBlock(x, y, z), m = w.getMeta(x, y, z);
    w.setBlock(x, y, z, 0, 0);
    if (id && game.particles) game.particles.breakBlock(x, y, z, id, m);
  },
};
