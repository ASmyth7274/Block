'use strict';
// ---------------------------------------------------------------------------
// Creatures and wonders of the Far Isles: the gaunt, a long thin shadow that
// minds its own business until you meet its eyes, and the star crystals that
// crown the spires of the Great Isle.
// ---------------------------------------------------------------------------
MOB_TYPES.push(
  { key: 'gaunt', name: 'Gaunt', egg: ['#17121f', '#9a6ae0'], cat: 'monster', lore: 'A long, thin shadow speckled with starlight, at home on the Far Isles and seen now and then under our own night sky. It will let you pass. Just don\'t look it in the eye.' },
);
MOB_TYPES.forEach((m, i) => { if (m) { m.index = i; MOB_INDEX[m.key] = m; } });

// what a gaunt will pick up and wander off with
const GAUNT_CARRY = new Set([B.GRASS, B.DIRT, B.SAND, B.GRAVEL, B.FLOWER, B.MUSHROOM_BROWN, B.MUSHROOM_RED, B.CLAY, B.PUMPKIN, B.MELON, B.MYCELIUM, B.CACTUS, B.TNT, B.PODZOL].filter((id) => id !== undefined));

class Gaunt extends Monster {
  constructor(world) {
    super(world, 'gaunt');
    this.maxHealth = this.health = 40;
    this.w = 0.6; this.h = 2.9; this.eye = 2.55;
    this.baseSpeed = 0.3; this.damage = 7;
    this.hostile = false;
    this.anger = 0; this.shake = 0; this.warpCool = 0;
    this.carried = null;
    this.talkInterval = 200;
    this.followRange = 64;
    this.xpValue = 5;
  }
  get angry() { return this.anger > 0; }
  // is the player looking it in the face?
  isStaredAt(p) {
    if (!p || p.dead || (p.effects && p.effects.invisible)) return false;
    let dx = this.x - p.x, dy = this.y + this.eye - (p.y + p.eye), dz = this.z - p.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > 64 || d < 0.5) return false;
    dx /= d; dy /= d; dz /= d;
    const cp = Math.cos(p.pitch), lx = -Math.sin(p.yaw) * cp, ly = Math.sin(p.pitch), lz = -Math.cos(p.yaw) * cp;
    if (lx * dx + ly * dy + lz * dz <= 1 - 0.025 / d) return false;
    return this.canSee(p);
  }
  provoke(e, stare) {
    if (!e || e.type !== 'player' || !e.survivalLike || this.world.difficulty === 0) return;
    const was = this.anger > 0;
    this.anger = 600 + this.rnd(400);
    this.target = e; this.unseen = 0;
    if (!was) this.game.audio.play(stare ? 'gaunt_stare' : 'gaunt_say', stare ? 1.6 : 1.2, this.soundPitch(), this.x, this.y + this.eye, this.z);
    if (stare) this.shake = 30;
  }
  onRevenge(e) { this.provoke(e, false); }
  aiTick(game) {
    const w = this.world, p = game.player;
    if (this.warpCool > 0) this.warpCool--;
    if (this.shake > 0) this.shake--;
    if (this.anger <= 0 && p && p.survivalLike && this.age % 3 === 0 && this.isStaredAt(p)) this.provoke(p, true);
    if (this.anger > 0) {
      this.anger--;
      this.hostile = true;
      const t = this.target;
      if (t && !t.dead && t.survivalLike && w.difficulty > 0 && this.distSqTo(t) < 64 * 64) {
        const d2 = this.distanceSq(t.x, t.y, t.z);
        // far away, or stuck: step through the air toward its quarry
        if (this.warpCool <= 0 && ((d2 > 256 && Math.random() < 0.04) || (this.pathDone && d2 > 16 && Math.random() < 0.03))) { if (this.warpToward(t)) return; }
        const dd = this.chase(1.0);
        this.tryMelee(t, dd, this.damage);
        return;
      }
      this.target = null; this.anger = 0;
    } else { this.hostile = false; this.target = null; }
    if (this.pathDone && Math.random() < 1 / 100) this.wander(12, 4, 0.8);
    this.idleLook(game); this.keepWatching();
    if (w.gameRules.mobGriefing) this.fiddle();
  }
  mobTick(game) {
    const w = this.world;
    // water burns it, and it will not stand in the rain
    const wet = this.inWater || w.isRainingAt(Math.floor(this.x), Math.floor(this.y + this.h), Math.floor(this.z));
    if (wet) { if (this.age % 10 === 0) this.hurt(1, { type: 'drown' }); if (this.warpCool <= 0) this.teleportRandom(); }
    // in plain daylight it drifts away somewhere shadier
    if (!this.angry && w.isDaytime() && this.age % 20 === 0 && Math.random() < 0.15 && w.canSeeSky(Math.floor(this.x), Math.floor(this.y + 2), Math.floor(this.z))) this.teleportRandom();
    if (this.age % 4 === 0 && game.settings.particles !== 'minimal') {
      const a = Math.random() * TAU;
      game.particles.add({ x: this.x + Math.cos(a) * 0.4, y: this.y + Math.random() * this.h, z: this.z + Math.sin(a) * 0.4, vx: 0, vy: -0.02, vz: 0, size: 0.04, life: 20, layer: game.particles.layer('particle_glint'), r: 0.6, g: 0.35, b: 1, collide: false, bright: true, fade: true });
    }
  }
  hurt(amount, src) {
    // it is never where the arrow lands
    if (src && (src.type === 'arrow' || src.type === 'thrown')) { if (this.teleportRandom()) return false; }
    const ok = super.hurt(amount, src);
    if (ok && !this.dead && src && src.type === 'player' && Math.random() < 0.15) this.teleportRandom();
    return ok;
  }
  // ---- stepping through space ----
  teleportTo(x, y, z) {
    const w = this.world, bx = Math.floor(x), bz = Math.floor(z);
    let by = Math.min(CH_H - 4, Math.floor(y));
    if (!w.isLoaded(bx, bz) || by < 2) return false;
    while (by > 1 && !BT.solid[w.getBlock(bx, by - 1, bz)]) by--;
    const below = w.getBlock(bx, by - 1, bz);
    if (by <= 1 || BT.fluid[below] || !BT.solid[below]) return false;
    for (let k = 0; k < 3; k++) { const id = w.getBlock(bx, by + k, bz); if (BT.solid[id] || BT.fluid[id]) return false; }
    const ox = this.x, oy = this.y, oz = this.z, g = this.game;
    this.setPos(bx + 0.5, by, bz + 0.5);
    this.vx = this.vy = this.vz = 0; this.fallDistance = 0;
    this.clearPath();
    this.warpCool = 20;
    if (g.settings.particles !== 'minimal') {
      const L = g.particles.layer('particle_glint');
      for (let i = 0; i < 48; i++) {
        const f = i / 47;
        g.particles.add({ x: ox + (this.x - ox) * f + (Math.random() - 0.5) * 0.8, y: oy + (this.y - oy) * f + Math.random() * this.h, z: oz + (this.z - oz) * f + (Math.random() - 0.5) * 0.8,
          vx: (Math.random() - 0.5) * 0.04, vy: (Math.random() - 0.5) * 0.04, vz: (Math.random() - 0.5) * 0.04, size: 0.06, life: 16 + Math.floor(Math.random() * 16), layer: L, r: 0.65, g: 0.4, b: 1, collide: false, bright: true, fade: true });
      }
    }
    g.audio.play('gaunt_warp', 1, 1, ox, oy, oz);
    g.audio.play('gaunt_warp', 1, 1, this.x, this.y, this.z);
    return true;
  }
  teleportRandom() {
    for (let i = 0; i < 16; i++) if (this.teleportTo(this.x + (Math.random() - 0.5) * 64, this.y + Math.random() * 32 - 12, this.z + (Math.random() - 0.5) * 64)) return true;
    return false;
  }
  warpToward(t) {
    let dx = this.x - t.x, dy = this.y + this.eye - (t.y + t.eye), dz = this.z - t.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= d; dy /= d; dz /= d;
    for (let i = 0; i < 8; i++) {
      if (this.teleportTo(this.x + (Math.random() - 0.5) * 8 - dx * 16, this.y + Math.random() * 16 - 8 - dy * 16, this.z + (Math.random() - 0.5) * 8 - dz * 16)) return true;
    }
    return false;
  }
  // ---- idle hands ----
  fiddle() {
    const w = this.world;
    if (!this.carried) {
      if (Math.random() > 0.05) return;
      const x = Math.floor(this.x + Math.random() * 4 - 2), y = Math.floor(this.y + Math.random() * 3), z = Math.floor(this.z + Math.random() * 4 - 2);
      const id = w.getBlock(x, y, z);
      if (!GAUNT_CARRY.has(id) || w.getBlock(x, y + 1, z) === B.CACTUS) return;
      this.carried = [id === B.MYCELIUM || id === B.PODZOL ? B.DIRT : id, w.getMeta(x, y, z)];
      w.setBlock(x, y, z, 0, 0);
    } else {
      if (Math.random() > 0.0006) return;
      const x = Math.floor(this.x + Math.random() * 2 - 1), y = Math.floor(this.y + Math.random() * 2), z = Math.floor(this.z + Math.random() * 2 - 1);
      const below = w.getBlock(x, y - 1, z);
      if (w.getBlock(x, y, z) !== 0 || !BT.opaque[below] || below === B.BEDROCK) return;
      w.setBlock(x, y, z, this.carried[0], this.carried[1]);
      this.carried = null;
    }
  }
  dropLoot(game, byPlayer) {
    if (Math.random() < 0.5 + (byPlayer ? this.looting * 0.15 : 0)) this.drop(ITEM_IDS.wisp_essence, 1 + (byPlayer && this.looting ? this.rnd(this.looting + 1) : 0));
    if (this.carried) { this.drop(this.carried[0], 1, this.carried[0] === B.FLOWER ? this.carried[1] : 0); this.carried = null; }
  }
  saySound() { return this.angry ? 'gaunt_stare' : 'gaunt_say'; }
  hurtSound() { return 'gaunt_hurt'; }
  deathSound() { return 'gaunt_death'; }
  soundPitch() { return (Math.random() - Math.random()) * 0.1 + 1; }
  render(er, rx, ry, rz, partial) {
    const [sky, blk] = er.lightAt(this.x, this.y + 2, this.z);
    const pose = er.bipedPose(this, partial, 'biped');
    // long limbs move slowly; arms come up to carry a block
    pose.rarm[0] *= 0.5; pose.larm[0] *= 0.5; pose.rleg[0] *= 0.6; pose.lleg[0] *= 0.6;
    if (this.carried) { pose.rarm = [0.45, 0, -0.06]; pose.larm = [0.45, 0, 0.06]; }
    if (this.shake > 0 || this.angry) {
      const j = this.angry ? 0.6 : 1.2;
      pose.head = { rot: pose.head, off: [(Math.random() - 0.5) * j, (this.angry ? 2 : 0) + (Math.random() - 0.5) * j, (Math.random() - 0.5) * j] };
    }
    const base = er.baseMatrix(this, rx, ry, rz, partial);
    er.drawModel(MODELS.gaunt, 'gaunt', base, pose, er.entColor(this), sky, blk);
    er.drawModel(MODELS.gaunt, 'gaunt_eyes', base, pose, [255, 255, 255, 255], -1, 0, { only: ['head'], inflate: 0.03 });
    if (this.carried) {
      let m = M3.mul(base, M3.trans(0, 16, -10));
      m = M3.mul(m, M3.scale(10, 10, 10));
      m = M3.mul(m, M3.trans(-0.5, 0, -0.5));
      er.drawItem(new ItemStack(this.carried[0], 1, this.carried[1]), m, sky, blk, 255);
    }
  }
  save() { const d = super.save(); if (this.anger) d.anger = this.anger; if (this.carried) d.carried = this.carried; return d; }
  load(d) { super.load(d); this.anger = d.anger || 0; this.carried = d.carried || null; }
}
MOB_CLASSES.gaunt = Gaunt;

// ---------------------------------------------------------------------------
// A star crystal: a cage of light round a burning core, set on the spires.
// It feeds the Starwyrm while it stands; any blow shatters it, explosively.
// ---------------------------------------------------------------------------
class StarCrystal extends Entity {
  constructor(world, x, y, z) {
    super(world);
    this.type = 'star_crystal';
    this.w = 2; this.h = 2;
    this.noGravity = true;
    this.spin = Math.random() * 400;
    if (x !== undefined) this.setPos(x, y, z);
  }
  tick(game) {
    this.px = this.x; this.py = this.y; this.pz = this.z;
    this.age++; this.spin++;
    this.updateBox();
    if (this.age % 6 === 0 && game.settings.particles !== 'minimal' && game.player && game.player.distanceSq(this.x, this.y, this.z) < 48 * 48) {
      const a = Math.random() * TAU;
      game.particles.add({ x: this.x + Math.cos(a) * 0.9, y: this.y + 0.6 + Math.random() * 1.2, z: this.z + Math.sin(a) * 0.9, vx: 0, vy: 0.015, vz: 0, size: 0.05, life: 30, layer: game.particles.layer('particle_glint'), r: 0.8, g: 0.6, b: 1, collide: false, bright: true, fade: true });
    }
    if (this.age % 80 === 0 && game.player && game.player.distanceSq(this.x, this.y, this.z) < 20 * 20) game.audio.play('crystal_hum', 0.25, 0.9 + Math.random() * 0.2, this.x, this.y + 1, this.z);
  }
  hurt(amount, src) {
    if (this.removed || (src && src.type === 'void')) { this.removed = true; return false; }
    this.shatter(src);
    return true;
  }
  shatter(src) {
    const g = this.game || this.world.game;
    this.removed = true;
    g.audio.play('crystal_break', 1.6, 0.9 + Math.random() * 0.2, this.x, this.y + 1, this.z);
    for (let i = 0; i < 40; i++) g.particles.sparkle(this.x, this.y + 1, this.z, 0.85, 0.6, 1, 1, 2.2);
    Behaviors.explode(g, this.x, this.y + 1, this.z, 6, null, false);
    if (src && src.entity && src.entity.type === 'player') g.achieve('crystal');
    if (typeof Wyrm !== 'undefined') Wyrm.crystalLost(g, this, src);
  }
  render(er, rx, ry, rz, partial) {
    const t = this.spin + partial, b = er.r.batch;
    const bob = Math.sin(t * 0.2) / 2 + 0.5, lift = (bob * bob + bob) * 0.2;
    const glass = er.r.atlas.layer('star_crystal_glass'), core = er.r.atlas.layer('star_crystal_core');
    const cy = ry + 1.05 + lift;
    const tilt = M3.mul(M3.rx(Math.PI / 4), M3.rz(0.6155));
    let m = M3.mul(M3.trans(rx, cy, rz), M3.ry(t * 3 * DEG));
    // the outer cage, the inner cage turning the other way, and the core
    const m1 = M3.mul(m, tilt);
    er.texBox(b, m1, [-0.44, -0.44, -0.44, 0.44, 0.44, 0.44], glass, -1, 0, 1 / 0.88);
    const m2 = M3.mul(M3.mul(M3.mul(m, M3.ry(-t * 5 * DEG)), tilt), M3.scale(0.875, 0.875, 0.875));
    er.texBox(b, m2, [-0.44, -0.44, -0.44, 0.44, 0.44, 0.44], glass, -1, 0, 1 / 0.88);
    const m3 = M3.mul(M3.mul(M3.mul(m, M3.ry(t * 7 * DEG)), tilt), M3.scale(0.55, 0.55, 0.55));
    er.texBox(b, m3, [-0.44, -0.44, -0.44, 0.44, 0.44, 0.44], core, -1, 0, 1 / 0.88);
    er.glow(rx, cy, rz, 1.1 + Math.sin(t * 0.15) * 0.1, [190, 140, 255, 110]);
    if (this.beam) this.beam(er, rx, cy, rz, partial);
  }
  save() { return { type: 'star_crystal', x: this.x, y: this.y, z: this.z }; }
  load(d) { this.setPos(d.x, d.y, d.z); }
}

// ---------------------------------------------------------------------------
// Natural spawning on the Far Isles: gaunts, everywhere, at any hour
// ---------------------------------------------------------------------------
MobSpawner.prototype.tickIsles = function (rd, area) {
  const g = this.game, w = g.world, p = g.player;
  const cap = Math.max(6, Math.round(20 * area / 169));
  if (w.difficulty === 0 || this.counts.monster >= cap || this.t % 4) return;
  const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
  const cx = pcx + this.rnd(rd * 2 + 1) - rd, cz = pcz + this.rnd(rd * 2 + 1) - rd;
  if (!w.getChunk(cx, cz)) return;
  const x0 = cx * 16 + this.rnd(16), z0 = cz * 16 + this.rnd(16);
  let n = 0;
  for (let k = 0; k < 6 && n < 3; k++) {
    const x = x0 + this.rnd(7) - 3, z = z0 + this.rnd(7) - 3;
    if (!w.isLoaded(x, z)) continue;
    const y = w.topSolidY(x, z) + 1;
    const ground = w.getBlock(x, y - 1, z);
    if (y < 2 || (ground !== B.STARSTONE && ground !== B.STAR_MOSS)) continue;
    if ((x + 0.5 - p.x) ** 2 + (y - p.y) ** 2 + (z + 0.5 - p.z) ** 2 < 24 * 24) continue;
    if (!this.canStand(x, y, z, 3)) continue;
    g.spawnMob('gaunt', x + 0.5, y, z + 0.5);
    n++; this.counts.monster++;
  }
};
