'use strict';
// ---------------------------------------------------------------------------
// Things of the Drift Isles. The orrery sentinel: an old astronomer's
// machine that still keeps watch over its observatory, three brass rings
// turning round a burning core. It spins up when it sees you and looses
// drift motes, slow sparks that home in on you and, where they strike, lift
// you off your feet for a while (and what goes up must come down). Starfruit,
// or a featherfall potion, takes the sting out of that.
// ---------------------------------------------------------------------------
MOB_TYPES.push({
  key: 'orrery', name: 'Orrery Sentinel', egg: ['#b8862a', '#7ae8ff'], cat: 'monster',
  lore: 'An old astronomer\'s machine that still keeps watch over its observatory on the Drift Isles. When it sees you its rings spin up and it looses drift motes: slow sparks that follow you and lift you off your feet. What goes up must come down.',
});
MOB_TYPES.forEach((m, i) => { if (m) { m.index = i; MOB_INDEX[m.key] = m; } });

class OrrerySentinel extends Monster {
  constructor(world) {
    super(world, 'orrery');
    this.maxHealth = this.health = 24;
    this.w = 1.0; this.h = 1.0; this.eye = 0.5;
    this.noGravity = true; this.persistent = true; this.swims = false;
    this.home = null; this.fireCool = 30 + this.rnd(40); this.spin = this.rnd(400); this.awake = 0; this.pawake = 0;
    this.talkInterval = 200; this.xpValue = 6;
  }
  // it hangs where it was set, bobbing a little
  travel() {
    if (!this.home) this.home = [this.x, this.y, this.z];
    const ty = this.home[1] + Math.sin(this.age * 0.05) * 0.2;
    this.vx = (this.home[0] - this.x) * 0.1; this.vz = (this.home[2] - this.z) * 0.1; this.vy = (ty - this.y) * 0.1;
    this.move(this.vx, this.vy, this.vz);
    this.fallDistance = 0;
  }
  aiTick(game) {
    const p = game.player;
    this.spin += 1 + this.awake * 3;
    this.pawake = this.awake;
    if (this.fireCool > 0) this.fireCool--;
    const sees = p && !p.dead && p.survivalLike && this.world.difficulty > 0 && this.distSqTo(p) < 20 * 20 && this.canSee(p);
    this.awake += ((sees ? 1 : 0) - this.awake) * 0.08;
    if (sees) {
      this.lookAtEntity(p, 2);
      this.yaw = this.bodyYaw = Math.atan2(-(p.x - this.x), -(p.z - this.z));
      if (this.fireCool <= 0 && this.awake > 0.6) { this.loose(game, p); this.fireCool = 45 + this.rnd(40); }
    }
  }
  loose(game, p) {
    game.spawnEntity(new DriftMote(this.world, this, this.x, this.y + 0.5, this.z, p));
    game.audio.play('orrery_shoot', 1.2, 0.9 + Math.random() * 0.2, this.x, this.y + 0.5, this.z);
  }
  knockback() {}
  checkDespawn() {}
  onRevenge(e) { if (e && e.type === 'player') this.fireCool = Math.min(this.fireCool, 10); }
  dropLoot(game, byPlayer) {
    this.drop(ITEM_IDS.orrery_gear, 1 + this.rnd(2));
    if (Math.random() < 0.3) this.drop(ITEM_IDS.star_fragment, 1);
  }
  saySound() { return 'orrery_tick'; }
  soundVolume() { return 0.7; }
  render(er, rx, ry, rz, partial) {
    const [sky, blk] = er.lightAt(this.x, this.y + 0.5, this.z);
    const t = this.spin + partial * (1 + this.awake * 3), aw = this.pawake + (this.awake - this.pawake) * partial;
    const base = er.baseMatrix(this, rx, ry, rz, partial);
    const pose = { ringA: [t * 0.02, 0, 0.4], ringB: [0.3, t * 0.035, 0], ringC: [t * 0.05, 0, t * 0.03], arm: [-0.1 * aw, 0, 0], core: [t * 0.01, t * 0.013, 0] };
    er.drawModel(MODELS.orrery, 'orrery', base, pose, er.entColor(this), sky, blk, { only: ['ringA', 'ringB', 'ringC', 'arm'] });
    er.drawModel(MODELS.orrery, 'orrery_core', base, pose, [255, 255, 255, 255], -1, 0, { only: ['core'] });
    er.glow(rx, ry + 0.5, rz, 0.55 + aw * 0.35 + Math.sin(t * 0.2) * 0.05, [120, 230, 255, 70 + Math.round(aw * 80)]);
  }
  save() { const d = super.save(); if (this.home) d.home = this.home; return d; }
  load(d) { super.load(d); this.home = d.home || null; this.persistent = true; }
}
MOB_CLASSES.orrery = OrrerySentinel;

// ---------------------------------------------------------------------------
// A drift mote: a slow spark that follows its mark. Where it strikes you, you
// drift up off your feet for a few seconds. A blow scatters it.
// ---------------------------------------------------------------------------
class DriftMote extends Entity {
  constructor(world, shooter, x, y, z, target) {
    super(world);
    this.type = 'drift_mote';
    this.w = this.h = 0.45;
    this.noGravity = true; this.noClip = true;
    this.shooter = shooter; this.target = target;
    this.setPos(x, y - this.h / 2, z);
    const dx = target.x - x, dy = target.y + 1 - y, dz = target.z - z, l = Math.hypot(dx, dy, dz) || 1;
    this.dir = [dx / l, dy / l, dz / l];
  }
  get game() { return this.world.game; }
  hurt(amount, src) {
    if (!src || !src.entity || src.entity.type !== 'player') return false;
    this.pop(this.game, false);
    return true;
  }
  tick(game) {
    this.px = this.x; this.py = this.y; this.pz = this.z;
    this.age++;
    if (this.age > 180) { this.pop(game, false); return; }
    const t = this.target, cy = this.y + this.h / 2;
    // it bends toward its mark, but not quickly: you can step out of its way
    if (t && !t.dead && !t.removed) {
      let dx = t.x - this.x, dy = t.y + 1 - cy, dz = t.z - this.z;
      const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      const d = this.dir, k = 0.08;
      d[0] += (dx - d[0]) * k; d[1] += (dy - d[1]) * k; d[2] += (dz - d[2]) * k;
      const dl = Math.hypot(d[0], d[1], d[2]) || 1; d[0] /= dl; d[1] /= dl; d[2] /= dl;
    }
    const sp = 0.26, w = this.world;
    const hit = raycastBlocks(w, this.x, cy, this.z, this.dir[0], this.dir[1], this.dir[2], sp, { collision: true });
    if (hit) { this.pop(game, false); return; }
    this.x += this.dir[0] * sp; this.y += this.dir[1] * sp; this.z += this.dir[2] * sp;
    this.updateBox();
    for (const e of w.entities.concat(game.player && !game.player.dead ? [game.player] : [])) {
      if (e === this || e === this.shooter || e.removed || e.dead || !e.hurt || !e.effects || e.type === 'orrery' || e.type === 'drift_mote') continue;
      if (e.type === 'player' && !e.survivalLike) continue;
      if (!e.box.intersects(this.box)) continue;
      e.hurt(2, { type: 'magic', entity: this.shooter || this, knockback: 0 });
      Brewing.addEffect(e, 'drift', 90, 0);
      this.pop(game, true);
      return;
    }
    if (game.settings.particles !== 'minimal' && this.age % 2 === 0) game.particles.sparkle(this.x, cy, this.z, 0.5, 0.9, 1, 1, 0.3);
  }
  pop(game, struck) {
    this.removed = true;
    game.audio.play(struck ? 'mote_hit' : 'mote_pop', 0.9, 0.9 + Math.random() * 0.3, this.x, this.y, this.z);
    if (game.settings.particles !== 'minimal') for (let i = 0; i < 14; i++) game.particles.sparkle(this.x, this.y + this.h / 2, this.z, 0.5, 0.9, 1, 1, 0.8);
  }
  render(er, rx, ry, rz, partial) {
    const t = this.age + partial, cy = ry + this.h / 2;
    er.glow(rx, cy, rz, 0.42 + Math.sin(t * 0.5) * 0.06, [120, 230, 255, 170]);
    er.glow(rx, cy, rz, 0.18, [240, 255, 255, 255]);
  }
  save() { return null; }
}
