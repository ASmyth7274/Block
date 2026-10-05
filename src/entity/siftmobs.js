'use strict';
// ---------------------------------------------------------------------------
// Creatures of the Sift. The gleaner: small, quick, all ears, gathering
// whatever it finds lying about (or digs up) and running off with it. The
// sifter: swims through the sand like water, a fin and a ripple the only
// sign of it, and hunts by sound - sneak, or keep to stone, and it loses you.
// ---------------------------------------------------------------------------
MOB_TYPES.push(
  { key: 'gleaner', name: 'Gleaner', egg: ['#7e735f', '#ffcf5a'], cat: 'creature', lore: 'A small, quick, big-eared scavenger of the Sift. It gathers anything it finds lying about - or digs up - and runs. It will not fight unless cornered. Whatever it carries, it drops when it falls.' },
  { key: 'sifter', name: 'Sifter', egg: ['#8a849c', '#3c3846'], cat: 'monster', lore: 'Swims through the sand of the Sift like water, with only a fin and a ripple to show where it is. It hunts by sound: sneak, or keep to stone, and it loses you. Its scales make the softest boots.' },
);
MOB_TYPES.forEach((m, i) => { if (m) { m.index = i; MOB_INDEX[m.key] = m; } });

// what a gleaner might dig out of the sand, when nothing lost is waiting to be found
// how far below the top of the sand a swimming sifter rides: deep enough that only its fin shows
const SIFTER_SUNK = 0.72, SIFTER_SCALE = 1.3;
const GLEANINGS = () => [[ITEM_IDS.gold_nugget, 1, 4], [ITEM_IDS.string, 1, 3], [ITEM_IDS.bone, 1, 2], [ITEM_IDS.coal, 1, 3], [ITEM_IDS.lost_letter, 1, 1], [ITEM_IDS.sift_scale, 1, 2], [ITEM_IDS.gold_ingot, 1, 1], [ITEM_IDS.jade, 1, 1], [ITEM_IDS.paper, 1, 3], [ITEM_IDS.arrow, 2, 6]];

class Gleaner extends Mob {
  constructor(world) {
    super(world, 'gleaner');
    this.category = 'creature'; this.noFallDamage = true;
    this.maxHealth = this.health = 8;
    this.w = 0.5; this.h = 0.9; this.eye = 0.75;
    this.baseSpeed = 0.32;
    this.carried = null;
    this.flee = 0; this.dig = 0; this.cornered = 0;
    this.talkInterval = 160;
    this.xpValue = 2;
  }
  aiTick(game) {
    const w = this.world, p = game.player;
    if (this.dig > 0) {
      // scrabbling in the sand
      this.dig--;
      if (this.age % 4 === 0) this.sandSpray(game, 3);
      if (this.dig === 0) this.finishDig(game);
      if (p && !p.dead && !p.creative && this.distSqTo(p) < 16) { this.dig = 0; this.flee = 60; } else return;
    }
    // a person coming close: off it runs, faster if it has something to lose
    if (p && !p.dead && !p.creative && p.gameMode !== 'spectator') {
      const d2 = this.distSqTo(p), wary = p.sneaking ? 9 : this.carried ? 100 : 49;
      if (d2 < wary) { this.flee = Math.max(this.flee, 30); if (d2 < 2.2 && this.cornered <= 0 && this.flee > 0 && this.pathDone) { this.tryMelee(p, d2, 2); this.cornered = 40; } }
    }
    if (this.cornered > 0) this.cornered--;
    if (this.flee > 0) {
      this.flee--;
      if (this.pathDone || this.age % 20 === 0) this.fleeFrom(p);
      return;
    }
    // something lying about? go and get it
    if (!this.carried && this.age % 10 === 0) {
      let best = null, bd = 14 * 14;
      for (const e of w.entitiesInBox(this.x - 14, this.y - 4, this.z - 14, this.x + 14, this.y + 4, this.z + 14, (e) => e.type === 'item' && !e.removed && e.pickupDelay <= 0)) {
        const d2 = this.distSqTo(e); if (d2 < bd) { bd = d2; best = e; }
      }
      this.goal = best;
    }
    const g = this.goal;
    if (g && !this.carried) {
      if (g.removed) { this.goal = null; return; }
      if (this.distSqTo(g) < 1.4) { this.carried = g.stack; g.removed = true; this.goal = null; game.audio.play('gleaner_say', 0.6, 1.3, this.x, this.y, this.z); this.flee = 40; return; }
      if (this.pathDone || this.age % 20 === 0) this.navigateTo(g.x, g.y, g.z, 1.2, 16);
      return;
    }
    // now and then it stops to dig
    if (!this.carried && this.pathDone && Math.random() < 1 / 300 && w.getBlock(Math.floor(this.x), Math.floor(this.y - 0.5), Math.floor(this.z)) === B.SIFT_SAND) { this.dig = 50 + this.rnd(40); this.clearPath(); return; }
    if (this.pathDone && Math.random() < 1 / 80) this.wander(10, 3, 0.9);
    this.idleLook(game);
  }
  finishDig(game) {
    if (Math.random() > 0.5) return;
    // sometimes it finds something of yours that sifted down; otherwise, some old bit of something
    const st = Sift.state(this.world.info);
    if (st.lost.length && Math.random() < 0.4) { this.carried = ItemStack.fromJSON(st.lost.shift()); }
    else { const pool = GLEANINGS(), e = pool[this.rnd(pool.length)]; if (e[0] !== undefined) this.carried = new ItemStack(e[0], e[1] + this.rnd(e[2] - e[1] + 1), e[0] === ITEM_IDS.lost_letter ? this.rnd(64) : 0); }
    if (this.carried) game.audio.play('gleaner_say', 0.7, 1.5, this.x, this.y, this.z);
  }
  sandSpray(game, n) {
    if (game.settings.particles === 'minimal') return;
    const tex = game.particles.blockTexture(B.SIFT_SAND, 0, 1), tint = game.particles.blockTint(B.SIFT_SAND, 0);
    for (let i = 0; i < n; i++) game.particles.digging(this.x + (Math.random() - 0.5) * 0.5, this.y + 0.1, this.z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.15, 0.15 + Math.random() * 0.15, (Math.random() - 0.5) * 0.15, tex, tint);
  }
  fleeFrom(p) {
    if (!p) { this.wander(10, 3, 1.6); return; }
    const dx = this.x - p.x, dz = this.z - p.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    const tx = this.x + dx / d * 12 + (Math.random() - 0.5) * 6, tz = this.z + dz / d * 12 + (Math.random() - 0.5) * 6;
    for (let dy = 4; dy >= -4; dy--) {
      const y = Math.floor(this.y) + dy;
      if (PathFinder.valid(this.world, Math.floor(tx), y, Math.floor(tz), 1)) { this.navigateTo(tx, y, tz, this.carried ? 1.9 : 1.6, 18); return; }
    }
    this.wander(8, 3, 1.6);
  }
  onRevenge() { this.flee = 100; this.clearPath(); }
  checkDespawn(game) {
    const p = game.player;
    if (p && this.distSqTo(p) > 128 * 128 && !this.carried) this.removed = true;
  }
  dropLoot(game, byPlayer) {
    if (this.carried) { this.drop(this.carried.id, this.carried.count, this.carried.dmg); this.carried = null; }
    if (Math.random() < 0.5) this.drop(ITEM_IDS.string, 1);
  }
  soundVolume() { return 0.6; }
  soundPitch() { return 1.1 + Math.random() * 0.3; }
  render(er, rx, ry, rz, partial) {
    const [sky, blk] = er.lightAt(this.x, this.y + 0.5, this.z);
    const pose = this.quadPose(partial);
    const t = this.age + partial;
    pose.tail = [Math.sin(t * 0.25) * 0.2 + (this.flee > 0 ? -0.4 : 0), Math.sin(t * 0.15) * 0.3, 0];
    if (this.dig > 0) { pose.leg2 = [Math.sin(t * 1.5) * 0.9, 0, 0]; pose.leg3 = [-Math.sin(t * 1.5) * 0.9, 0, 0]; pose.head = [0.5, pose.head[1] || 0, 0]; }
    const base = er.baseMatrix(this, rx, ry, rz, partial);
    er.drawModel(MODELS.gleaner, 'gleaner', base, pose, er.entColor(this), sky, blk);
    // what it is carrying, held in its teeth
    if (this.carried) {
      let m = M3.mul(base, M3.trans(0, 4, -10));
      m = M3.mul(m, M3.ry(Math.PI / 2));
      m = M3.mul(m, M3.scale(6, 6, 6));
      m = M3.mul(m, M3.trans(-0.5, 0, -0.03));
      er.drawItem(this.carried, m, sky, blk, 255);
    }
  }
  save() { const d = super.save(); if (this.carried) d.carried = this.carried.toJSON(); return d; }
  load(d) { super.load(d); this.carried = d.carried ? ItemStack.fromJSON(d.carried) : null; this.persistent = !!this.carried; }
}
MOB_CLASSES.gleaner = Gleaner;

class Sifter extends Monster {
  constructor(world) {
    super(world, 'sifter');
    this.noFallDamage = true; this.noDrown = true;
    this.maxHealth = this.health = 16;
    this.w = 0.8; this.h = 0.7; this.eye = 0.45;
    this.baseSpeed = 0.2; this.damage = 4;
    this.under = true; this.outT = 0; this.goalXZ = null; this.heardT = 0; this.prey = null; this.restT = 0;
    this.talkInterval = 260; this.xpValue = 5;
    this.swims = false;
  }
  // the top of the sand in a column, or -1 if there is no sand at the top to swim in
  sandTop(x, z) {
    const w = this.world, bx = Math.floor(x), bz = Math.floor(z);
    if (!w.isLoaded(bx, bz)) return -1;
    const y = w.topSolidY(bx, bz);
    return y > 1 && w.getBlock(bx, y, bz) === B.SIFT_SAND && w.getBlock(bx, y - 1, bz) === B.SIFT_SAND ? y : -1;
  }
  // it feels sound through the sand: steps on stone or wood never reach it, but a blast does
  hear(game, x, y, z, loud, src) {
    if (this.dead || this.distanceSq(x, y, z) > (loud + 6) ** 2) return;
    const id = this.world.getBlock(Math.floor(x), Math.floor(y - 0.2), Math.floor(z));
    if (loud < 30 && id !== B.SIFT_SAND && id !== B.SAND && id !== B.GRAVEL) return;
    this.goalXZ = [x, z]; this.heardT = 200;
    if (Sifter.isPrey(src)) this.prey = src;
  }
  static isPrey(e) { return !!e && !e.dead && !e.removed && (e.type === 'player' ? e.survivalLike : e.type === 'gleaner'); }
  travel(strafe, forward) {
    if (!this.under) { super.travel(strafe, forward); return; }
    // swimming through the sand: slide along just under its surface, never out of it
    const nx = this.x + this.vx, nz = this.z + this.vz;
    const top = this.sandTop(nx, nz);
    if (top < 0) { this.vx = this.vz = 0; this.goalXZ = null; return; }
    this.x = nx; this.z = nz;
    this.y += (top + 1 - SIFTER_SUNK - this.y) * 0.35;
    this.vy = 0; this.onGround = true; this.fallDistance = 0;
    this.updateBox();
  }
  pushOutOfBlocks() { if (!this.under) super.pushOutOfBlocks(); }
  aiTick(game) {
    const w = this.world, p = game.player;
    if (this.heardT > 0) this.heardT--; else this.prey = null;
    if (this.restT > 0) this.restT--;
    if (this.under) {
      // sand pours off its fin as it goes
      if (game.settings.particles !== 'minimal' && (this.vx || this.vz) && this.age % 3 === 0) {
        const tex = game.particles.blockTexture(B.SIFT_SAND, 0, 1), tint = game.particles.blockTint(B.SIFT_SAND, 0);
        game.particles.digging(this.x, this.y + SIFTER_SUNK + 0.05, this.z, (Math.random() - 0.5) * 0.1, 0.12, (Math.random() - 0.5) * 0.1, tex, tint);
      }
      let tx = null, tz = null;
      const prey = this.prey;
      if (Sifter.isPrey(prey) && this.distSqTo(prey) < 24 * 24) { tx = prey.x; tz = prey.z; }
      else if (this.goalXZ) { [tx, tz] = this.goalXZ; if ((tx - this.x) ** 2 + (tz - this.z) ** 2 < 2) this.goalXZ = null; }
      else if (this.age % 60 === 0 && Math.random() < 0.5) { const a = Math.random() * TAU; this.goalXZ = [this.x + Math.cos(a) * 8, this.z + Math.sin(a) * 8]; }
      if (tx !== null) {
        const dx = tx - this.x, dz = tz - this.z, d = Math.sqrt(dx * dx + dz * dz) || 1, sp = prey ? 0.21 : 0.12;
        this.vx = dx / d * sp; this.vz = dz / d * sp;
        this.yaw = this.bodyYaw = this.headYaw = Math.atan2(-dx, -dz);
        // close enough, and the prey standing on sand: out it bursts
        if (prey && this.restT <= 0 && d < 2.4 && Math.abs(prey.y - (this.y + SIFTER_SUNK)) < 2.5 && w.getBlock(Math.floor(prey.x), Math.floor(prey.y - 0.2), Math.floor(prey.z)) === B.SIFT_SAND) { this.surface(game, prey); return; }
      } else { this.vx *= 0.8; this.vz *= 0.8; }
      return;
    }
    // out of the sand: snap at whoever is near, then back under
    this.outT--;
    const t = this.prey;
    // one bite, a moment thrashing in the open (your chance to strike back), and it is gone again
    if (Sifter.isPrey(t)) { const dd = this.distSqTo(t); this.lookAtEntity(t, 2); if (this.onGround) this.steerTo(t.x, t.y, t.z, 1.2); if (this.tryMelee(t, dd, this.damage)) this.outT = Math.min(this.outT, 16); }
    if (this.outT <= 0 && (this.onGround || this.vy <= 0) && w.getBlock(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z)) === B.SIFT_SAND) this.dive(game);
    else if (this.outT < -200) this.dive(game);
  }
  surface(game, prey) {
    this.under = false; this.outT = 40;
    this.y = Math.floor(this.y) + 1.2;
    const dx = prey.x - this.x, dz = prey.z - this.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    this.vy = 0.55; this.vx = dx / d * 0.3; this.vz = dz / d * 0.3;
    this.attackTimer = 4;
    game.audio.play('sifter_lunge', 1.3, 0.9 + Math.random() * 0.2, this.x, this.y, this.z);
    if (game.settings.particles !== 'minimal') { const tex = game.particles.blockTexture(B.SIFT_SAND, 0, 1), tint = game.particles.blockTint(B.SIFT_SAND, 0); for (let i = 0; i < 24; i++) game.particles.digging(this.x + (Math.random() - 0.5), this.y, this.z + (Math.random() - 0.5), (Math.random() - 0.5) * 0.3, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3, tex, tint); }
  }
  dive(game) {
    const top = this.sandTop(this.x, this.z);
    if (top < 0) { this.outT = 20; return; }
    this.under = true; this.y = top + 1 - SIFTER_SUNK; this.vx = this.vy = this.vz = 0; this.clearPath();
    // back under, it has to hear you again before it strikes
    this.prey = null; this.goalXZ = null; this.heardT = 0; this.restT = 40;
    game.audio.play('sifter_dive', 1, 1, this.x, this.y + 1, this.z);
  }
  // under the sand nothing can reach it but a blast
  hurt(amount, src) { if (this.under && src && src.type !== 'explosion' && src.type !== 'void' && src.type !== 'command') return false; return super.hurt(amount, src); }
  checkDespawn(game) { super.checkDespawn(game); }
  dropLoot(game, byPlayer) { this.drop(ITEM_IDS.sift_scale, 1 + this.rnd(2)); if (Math.random() < 0.4) this.drop(ITEM_IDS.bone, 1); }
  saySound() { return this.under ? null : 'sifter_say'; }
  render(er, rx, ry, rz, partial) {
    const [sky, blk] = er.lightAt(this.x, this.y + (this.under ? SIFTER_SUNK + 0.3 : 0.4), this.z);
    const t = this.age + partial, ph = t * (this.under ? 0.35 : 0.5);
    const a1 = Math.sin(ph) * 0.15, a2 = Math.sin(ph - 0.9) * 0.3, a3 = Math.sin(ph - 1.8) * 0.45, a4 = Math.sin(ph - 2.7) * 0.6;
    const o2 = 6 * Math.sin(a1), o3 = o2 + 6 * Math.sin(a2), o4 = o3 + 6 * Math.sin(a3);
    const pose = { s1: [0, a1, 0], s2: { rot: [0, a2, 0], off: [o2, 0, 0] }, s3: { rot: [0, a3, 0], off: [o3, 0, 0] }, tailfin: { rot: [0, a4, 0], off: [o4, 0, 0] },
      jaw: [!this.under && this.outT > 30 ? 0.6 : Math.max(0, Math.sin(t * 0.08)) * 0.15, 0, 0], finR: [0, 0, Math.sin(ph) * 0.3], finL: [0, 0, -Math.sin(ph) * 0.3] };
    er.drawModel(MODELS.sifter, 'sifter', er.baseMatrix(this, rx, ry, rz, partial, SIFTER_SCALE), pose, er.entColor(this), sky, blk);
    // a low hump of sand rides along over it as it swims
    if (this.under && !this.dead) {
      const yaw = this.pbodyYaw + wrapRadians(this.bodyYaw - this.pbodyYaw) * partial, k = 1 + Math.sin(t * 0.3) * 0.08;
      let m = M3.mul(M3.trans(rx, ry + SIFTER_SUNK, rz), M3.ry(yaw));
      m = M3.mul(m, M3.trans(0, 0, -0.15));
      const sand = new ItemStack(B.SIFT_SAND, 1, 0);
      er.drawItem(sand, M3.mul(M3.mul(m, M3.trans(0, 0.02, 0)), M3.scale(0.9 * k, 0.1, 1.7 * k)), sky, blk, 255);
      er.drawItem(sand, M3.mul(M3.mul(m, M3.trans(0, 0.06, 0.1)), M3.scale(0.55 * k, 0.12, 1.1 * k)), sky, blk, 255);
    }
  }
  save() { const d = super.save(); d.under = this.under; return d; }
  load(d) { super.load(d); this.under = d.under !== false; }
}
MOB_CLASSES.sifter = Sifter;

// ---------------------------------------------------------------------------
// Natural spawning in the Sift: sifters under the open sand, gleaners about the
// relics and dunes
// ---------------------------------------------------------------------------
MobSpawner.prototype.tickSift = function (rd, area) {
  const g = this.game, w = g.world, p = g.player;
  if (this.t % 5) return;
  const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
  const cx = pcx + this.rnd(rd * 2 + 1) - rd, cz = pcz + this.rnd(rd * 2 + 1) - rd;
  if (!w.getChunk(cx, cz)) return;
  const x = cx * 16 + this.rnd(16), z = cz * 16 + this.rnd(16);
  if ((x + 0.5 - p.x) ** 2 + (z + 0.5 - p.z) ** 2 < 24 * 24 || x * x + z * z < 40 * 40) return;
  const y = w.topSolidY(x, z);
  if (y < 2 || w.getBlock(x, y, z) !== B.SIFT_SAND) return;
  const count = (type) => w.entities.reduce((n, e) => n + (e.type === type && !e.removed ? 1 : 0), 0);
  if (w.difficulty > 0 && Math.random() < 0.6) {
    if (count('sifter') >= Math.max(3, Math.round(6 * area / 169))) return;
    if (w.getBlock(x, y - 1, z) !== B.SIFT_SAND) return;
    const m = g.spawnMob('sifter', x + 0.5, y + 1 - SIFTER_SUNK, z + 0.5);
    if (m) m.under = true;
  } else {
    if (count('gleaner') >= Math.max(3, Math.round(5 * area / 169))) return;
    if (BT.solid[w.getBlock(x, y + 1, z)]) return;
    g.spawnMob('gleaner', x + 0.5, y + 1, z + 0.5);
  }
};
