'use strict';
// ---------------------------------------------------------------------------
// The Starwyrm: a serpent of the void, long as a river, scaled in night and
// flecked with stars. It circles the Great Isle drinking from the star
// crystals on the spires; swoops on you and spits starbolts; coils round the
// Star Well to breathe starfire across the isle; and when it has been hurt
// badly enough it rises, roars, and calls the sky down on you.
//
// The body is a chain of segments laid along the path its head has flown, so
// it really does coil and wind. Every segment can be struck (each one is a
// small invisible part entity standing in for it), but its scales turn most
// of a blow: aim for the head.
// ---------------------------------------------------------------------------
MOB_TYPES.push({
  key: 'starwyrm', name: 'Starwyrm', egg: ['#14123a', '#fff0b8'], cat: 'boss', noEgg: true,
  lore: 'A serpent of the void, long as a river, scaled in night and flecked with stars. It circles the spires of the Great Isle drinking from the star crystals, coils round the Star Well to breathe starfire, and when it is badly hurt it calls the sky down. Strike at its head: its scales turn most of a blow.',
});
MOB_TYPES.forEach((m, i) => { if (m) { m.index = i; MOB_INDEX[m.key] = m; } });

const WYRM_SEGS = 18;
// drawing scale of each segment (model pixels, so 8px * 2.7 / 16 = 1.35 blocks across), tapering to the tail
const WYRM_SIZE = (i) => 2.7 - 1.3 * Math.pow(i / (WYRM_SEGS - 1), 1.3);
const WYRM_HEAD_SCALE = 2.7;
// distance from one segment to the next (a little less than a segment's length, so the body reads as one)
const WYRM_GAP = (i) => 0.55 * WYRM_SIZE(i) + 0.1;
const WYRM_NECK = 1.75;
// what it cannot smash its way through
const WYRM_PROOF = new Set([B.BEDROCK, B.OBSIDIAN, B.STARSTONE, B.STARSTONE_BRICKS, B.IRON_BARS, B.RIFT, B.RIFT_FRAME, B.STAR_GATEWAY, B.WYRM_EGG, B.TORCH, B.FIRE].filter((id) => id !== undefined));

// one struck-at piece of the Starwyrm: the head (idx 0) or a body segment
class WyrmPart extends Entity {
  constructor(world, wyrm, idx, size) {
    super(world);
    this.type = 'wyrm_part';
    this.wyrm = wyrm; this.idx = idx;
    this.w = size; this.h = size;
    this.noGravity = true; this.noClip = true;
  }
  tick() { if (!this.wyrm || this.wyrm.removed) this.removed = true; }
  hurt(amount, src) { return this.wyrm && !this.wyrm.removed ? this.wyrm.damage(this, amount, src) : false; }
  render() {}
  save() { return null; }
}

class Starwyrm extends Mob {
  constructor(world) {
    super(world, 'starwyrm');
    this.category = 'boss';
    this.maxHealth = this.health = 260;
    // its own box is a pinprick: blows land on its parts instead
    this.w = 0.05; this.h = 0.05; this.eye = 0;
    this.noClip = true; this.noGravity = true; this.fireImmune = true;
    this.keepLoaded = true;
    this.xpValue = 0;
    this.talkInterval = 260;
    this.dir = [1, 0, 0]; this.speed = 0.4; this.speedTarget = 0.5;
    this.goal = null;
    this.phase = 'circle'; this.phaseT = 0; this.nextMove = 200 + this.rnd(200);
    this.circleA = Math.random() * TAU; this.circleR = 32; this.circleDir = Math.random() < 0.5 ? 1 : -1;
    this.coilCool = 900 + this.rnd(600); this.coilA = 0; this.dmgSinceCoil = 0;
    this.starfalls = 0; this.bolts = 0; this.boltCool = 0;
    this.healer = null; this.healT = 0;
    this.jaw = 0; this.pjaw = 0; this.roarT = 0;
    this.deathT = 0;
    this.buffetT = 0;
    this.trail = [];
    this.segs = [];
    for (let i = 0; i < WYRM_SEGS; i++) this.segs.push({ x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, yaw: 0, pitch: 0, pyaw: 0, ppitch: 0, hidden: false });
    this.parts = [];
    this.center = [0, 60, 0];
  }
  // ---------------------------------------------------------------- body
  // lay the body out straight behind the head (on spawning)
  layOut() {
    const d = this.dir;
    this.trail = [];
    for (let k = 0; k < 120; k++) this.trail.push([this.x - d[0] * k * 0.5, this.y - d[1] * k * 0.5, this.z - d[2] * k * 0.5]);
    this.placeBody();
    for (const s of this.segs) { s.px = s.x; s.py = s.y; s.pz = s.z; s.pyaw = s.yaw; s.ppitch = s.pitch; }
  }
  recordTrail() {
    const t = this.trail;
    if (t.length && Math.abs(t[0][0] - this.x) + Math.abs(t[0][1] - this.y) + Math.abs(t[0][2] - this.z) < 0.04) return;
    t.unshift([this.x, this.y, this.z]);
    if (t.length > 900) t.length = 900;
  }
  // each segment sits on the path the head has flown, one gap behind the last
  placeBody() {
    const t = this.trail, segs = this.segs, N = segs.length;
    let n = 0, target = WYRM_NECK, acc = 0, ax = this.x, ay = this.y, az = this.z;
    for (let k = 0; k < t.length && n < N; k++) {
      const bx = t[k][0], by = t[k][1], bz = t[k][2];
      const L = Math.hypot(bx - ax, by - ay, bz - az);
      while (n < N && L > 1e-6 && acc + L >= target) {
        const f = (target - acc) / L, s = segs[n];
        s.x = ax + (bx - ax) * f; s.y = ay + (by - ay) * f; s.z = az + (bz - az) * f;
        n++; target += WYRM_GAP(n - 1);
      }
      acc += L; ax = bx; ay = by; az = bz;
    }
    // past the end of the remembered path: carry on straight
    let lx = -this.dir[0], ly = -this.dir[1], lz = -this.dir[2];
    if (n >= 2) { const a = segs[n - 2], b = segs[n - 1], l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1; lx = (b.x - a.x) / l; ly = (b.y - a.y) / l; lz = (b.z - a.z) / l; }
    while (n < N) {
      const s = segs[n], extra = target - acc;
      s.x = ax + lx * extra; s.y = ay + ly * extra; s.z = az + lz * extra;
      n++; target += WYRM_GAP(n - 1);
    }
    // each faces the one before it
    for (let i = 0; i < N; i++) {
      const s = segs[i], a = i === 0 ? [this.x, this.y, this.z] : [segs[i - 1].x, segs[i - 1].y, segs[i - 1].z], b = i + 1 < N ? segs[i + 1] : s;
      const fx = a[0] - b.x, fy = a[1] - b.y, fz = a[2] - b.z, l = Math.hypot(fx, fy, fz) || 1;
      s.yaw = Math.atan2(-fx, -fz); s.pitch = Math.asin(clamp(fy / l, -1, 1));
    }
  }
  // keep the struck-at parts where the body is
  syncParts() {
    const w = this.world;
    if (this.parts.length !== WYRM_SEGS + 1 || this.parts.some((p) => p.removed)) {
      for (const p of this.parts) p.removed = true;
      this.parts = [new WyrmPart(w, this, 0, 1.9)];
      for (let i = 0; i < WYRM_SEGS; i++) this.parts.push(new WyrmPart(w, this, i + 1, 0.5 * WYRM_SIZE(i) + 0.25));
      for (const p of this.parts) w.addEntity(p);
    }
    const put = (p, x, y, z) => { p.px = p.x; p.py = p.y; p.pz = p.z; p.x = x; p.y = y - p.h / 2; p.z = z; p.updateBox(); };
    // the head's middle is a little forward of its neck joint
    put(this.parts[0], this.x + this.dir[0] * 0.9, this.y + this.dir[1] * 0.9, this.z + this.dir[2] * 0.9);
    for (let i = 0; i < WYRM_SEGS; i++) {
      const s = this.segs[i], p = this.parts[i + 1];
      if (s.hidden) { p.x = p.y = p.z = 0; p.y = -500; p.updateBox(); continue; }
      put(p, s.x, s.y, s.z);
    }
  }
  // ---------------------------------------------------------------- harm
  hurt(amount, src) { return src && (src.type === 'void' || src.type === 'command') ? super.hurt(amount, src) : false; }
  damage(part, amount, src) {
    if (this.dead || !src) return false;
    const t = src.type;
    if (t === 'explosion' || t === 'fire' || t === 'lava' || t === 'drown' || t === 'fall' || t === 'suffocate' || t === 'magic' || t === 'cactus') return false;
    if (src.entity === this) return false;
    const head = part.idx === 0;
    const dmg = head ? amount : amount * 0.25 + 1;
    const before = this.health;
    const ok = Mob.prototype.hurt.call(this, dmg, src);
    if (ok) {
      this.dmgSinceCoil += before - this.health;
      const g = this.game;
      if (g.settings.particles !== 'minimal') g.particles.sparkle(part.x, part.y + part.h / 2, part.z, head ? 1 : 0.75, head ? 0.95 : 0.7, 1, head ? 14 : 6, part.w);
      if (head && this.phase === 'coil' && Math.random() < 0.3) this.roar(g);
    }
    return ok;
  }
  knockback() {}
  onRevenge(e) { if (e && e.type === 'player' && e.survivalLike && this.phase === 'circle' && Math.random() < 0.25) this.setPhase('dive'); }
  onHurt(amount, src) {
    if (!this.dead && this.health > 0) this.game.audio.play('wyrm_hurt', 3, 0.85 + Math.random() * 0.25, this.x, this.y, this.z);
    if (src && src.entity && src.entity !== this && this.onRevenge) this.onRevenge(src.entity);
  }
  onDeath() {
    const g = this.game;
    g.audio.play('wyrm_death', 6, 1, this.x, this.y, this.z);
    this.deathT = 0; this.phase = 'dying'; this.speedTarget = 0.06;
    if (this.healer) { this.healer.beamTo = null; this.healer = null; }
  }
  roar(g) { if (this.roarT > 0) return; this.roarT = 50; g.audio.play('wyrm_roar', 6, 0.9 + Math.random() * 0.15, this.x, this.y, this.z); }
  // ---------------------------------------------------------------- the tick
  tick(game) {
    this.px = this.x; this.py = this.y; this.pz = this.z; this.pyaw = this.yaw; this.ppitch = this.pitch;
    this.pbodyYaw = this.bodyYaw; this.pheadYaw = this.headYaw;
    this.age++;
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.hurtResist > 0) this.hurtResist--;
    if (this.recentlyHit > 0) this.recentlyHit--;
    if (this.roarT > 0) this.roarT--;
    if (this.buffetT > 0) this.buffetT--;
    this.pjaw = this.jaw;
    if (!this.trail.length) this.layOut();
    for (const s of this.segs) { s.px = s.x; s.py = s.y; s.pz = s.z; s.pyaw = s.yaw; s.ppitch = s.pitch; }
    if (this.dead) this.dying(game);
    else { this.think(game); this.feed(game); if (this.age % 2 === 0) this.crush(game); this.buffet(game); this.ambient(game); }
    this.steer(this.turn || 0.06);
    this.recordTrail();
    this.placeBody();
    this.syncParts();
    // a slow pulse of light runs down its back
    if (game.settings.particles !== 'minimal' && this.age % 3 === 0 && !this.dead) {
      const s = this.segs[this.rnd(WYRM_SEGS)];
      if (!s.hidden) game.particles.sparkle(s.x, s.y + WYRM_SIZE(0) * 0.25, s.z, 0.75, 0.7, 1, 1, 1.2);
    }
    const jawWant = this.breathT > 0 || this.roarT > 30 ? 1 : this.phase === 'dive' ? 0.45 : 0.08 + Math.max(0, Math.sin(this.age * 0.05)) * 0.12;
    this.jaw += (jawWant - this.jaw) * 0.25;
  }
  steer(turn) {
    const g = this.goal;
    if (g) {
      let tx = g[0] - this.x, ty = g[1] - this.y, tz = g[2] - this.z;
      const tl = Math.hypot(tx, ty, tz);
      if (tl > 0.01) {
        tx /= tl; ty /= tl; tz /= tl;
        const d = this.dir;
        // dead behind: swing round to one side rather than through itself
        if (d[0] * tx + d[1] * ty + d[2] * tz < -0.85) { tx += -d[2] * 0.6; tz += d[0] * 0.6; }
        d[0] += (tx - d[0]) * turn; d[1] += (ty - d[1]) * turn; d[2] += (tz - d[2]) * turn;
        d[1] = clamp(d[1], -0.8, 0.8);
        const l = Math.hypot(d[0], d[1], d[2]) || 1; d[0] /= l; d[1] /= l; d[2] /= l;
      }
    }
    this.speed += clamp(this.speedTarget - this.speed, -0.025, 0.025);
    const d = this.dir;
    this.x += d[0] * this.speed; this.y += d[1] * this.speed; this.z += d[2] * this.speed;
    this.yaw = Math.atan2(-d[0], -d[2]); this.pitch = Math.asin(d[1]);
    this.bodyYaw = this.headYaw = this.yaw;
    this.updateBox();
  }
  setPhase(p) {
    this.phase = p; this.phaseT = 0; this.turn = 0.06;
    if (p === 'circle') { this.circleA = Math.atan2(this.z - this.center[2], this.x - this.center[0]); this.nextMove = 160 + this.rnd(240); if (Math.random() < 0.3) this.circleDir = -this.circleDir; this.circleR = Math.random() < 0.75 ? 26 + this.rnd(10) : 56 + this.rnd(10); }
    if (p === 'strafe') { this.bolts = 2 + this.rnd(2); this.boltCool = 20; }
    if (p === 'coil') { this.coilA = Math.atan2(this.z - this.center[2], this.x - this.center[0]); this.dmgSinceCoil = 0; this.coilDown = false; }
  }
  think(game) {
    const p = game.player, [cx, cy, cz] = this.center, w = this.world;
    const prey = p && !p.dead && p.survivalLike && w.difficulty > 0 && (p.x - cx) ** 2 + (p.z - cz) ** 2 < 170 * 170 ? p : null;
    this.phaseT++;
    if (this.coilCool > 0) this.coilCool--;
    if (this.boltCool > 0) this.boltCool--;
    if (this.breathT > 0) this.breathT--;
    // badly hurt: it calls the sky down (at half its strength, and again near the end)
    const f = this.health / this.maxHealth;
    if (prey && this.phase !== 'starfall' && this.phase !== 'coil' && ((this.starfalls === 0 && f < 0.5) || (this.starfalls === 1 && f < 0.2))) { this.starfalls++; this.setPhase('starfall'); }
    switch (this.phase) {
      case 'circle': {
        // a wide ring round the isle, weaving up and down
        this.circleA += this.circleDir * (0.42 / this.circleR) * (this.speed / 0.5);
        const ga = this.circleA + this.circleDir * 0.5, R = this.circleR + Math.sin(this.age * 0.013) * 4;
        this.goal = [cx + Math.cos(ga) * R, cy + 26 + Math.sin(this.age * 0.021) * 7, cz + Math.sin(ga) * R];
        this.speedTarget = 0.5; this.turn = 0.07;
        if (prey && this.phaseT > this.nextMove) {
          if (this.coilCool <= 0) this.setPhase('coil');
          else { const r = Math.random(); this.setPhase(r < 0.5 ? 'strafe' : r < 0.78 ? 'dive' : 'circle'); }
        }
        break;
      }
      case 'strafe': {
        // come round at you from above and loose a few starbolts, then sweep away
        if (!prey || this.phaseT > 420) { this.setPhase('circle'); break; }
        const dx = prey.x - this.x, dz = prey.z - this.z, hd = Math.hypot(dx, dz) || 1;
        this.goal = [prey.x - dx / hd * 6, prey.y + 16, prey.z - dz / hd * 6];
        this.speedTarget = 0.55; this.turn = 0.08;
        const d = Math.hypot(dx, prey.y - this.y, dz);
        if (d < 44 && this.boltCool <= 0 && this.bolts > 0 && this.facing(prey, 0.75)) {
          this.spit(game, prey); this.bolts--; this.boltCool = 14;
          if (this.bolts <= 0) this.phaseT = Math.max(this.phaseT, 360);
        }
        if (d < 10) this.setPhase('rise');
        break;
      }
      case 'dive': {
        // straight at you
        if (!prey || this.phaseT > 170) { this.setPhase('rise'); break; }
        this.goal = [prey.x, prey.y + 1.2, prey.z];
        this.speedTarget = 0.85; this.turn = this.phaseT < 30 ? 0.06 : 0.11;
        if (this.phaseT === 20) this.roar(game);
        if (Math.hypot(prey.x - this.x, prey.y + 1 - this.y, prey.z - this.z) < 2.5 || this.y < prey.y - 2) this.setPhase('rise');
        break;
      }
      case 'rise': {
        // pull up and away
        this.goal = [this.x + this.dir[0] * 30, Math.max(this.y + 18, cy + 30), this.z + this.dir[2] * 30];
        this.speedTarget = 0.6; this.turn = 0.07;
        if (this.phaseT > 50) this.setPhase('circle');
        break;
      }
      case 'coil': {
        // down to the Star Well, to wind round its pillar and breathe starfire across the isle
        const r = 4.6, top = cy + 3;
        if (!this.coilDown) {
          this.coilA += 0.035;
          this.goal = [cx + Math.cos(this.coilA) * 10, top + 18, cz + Math.sin(this.coilA) * 10];
          this.speedTarget = 0.45; this.turn = 0.1;
          if (Math.hypot(this.x - cx, this.z - cz) < 13 && this.y < top + 24) this.coilDown = true;
          if (this.phaseT > 600) { this.setPhase('rise'); this.coilCool = 600; }
          break;
        }
        this.coilA += 0.075;
        // spiralling down round the pillar, then winding up and down it as it circles
        const h = Math.max(top - 0.5 + 2.4 * (1 + Math.sin(this.phaseT * 0.03)), top + 16 - (this.phaseT - 40) * 0.12);
        this.goal = [cx + Math.cos(this.coilA) * r, h, cz + Math.sin(this.coilA) * r];
        this.speedTarget = 0.36; this.turn = 0.3;
        if (prey && this.y < top + 7 && this.phaseT % 80 === 40 && Math.hypot(prey.x - cx, prey.z - cz) < 30) this.breathe(game, prey);
        if (this.phaseT > 520 || this.dmgSinceCoil >= 45) { this.setPhase('rise'); this.coilCool = 900 + this.rnd(700); this.roar(game); }
        break;
      }
      case 'starfall': {
        // up above the isle, a roar, and the stars begin to fall
        this.goal = [cx + Math.cos(this.age * 0.03) * 9, cy + 64, cz + Math.sin(this.age * 0.03) * 9];
        this.speedTarget = 0.42; this.turn = 0.1;
        if (this.phaseT === 70) { this.roar(game); if (typeof Wyrm !== 'undefined') Wyrm.eclipse(game, 420); }
        if (prey && this.phaseT > 100 && this.phaseT < 400 && this.phaseT % 12 === 0) this.callStar(game, prey);
        if (this.phaseT > 430 || (!prey && this.phaseT > 120)) this.setPhase('circle');
        break;
      }
    }
  }
  facing(e, dot) {
    const dx = e.x - this.x, dy = e.y + 1 - this.y, dz = e.z - this.z, l = Math.hypot(dx, dy, dz) || 1;
    return (dx * this.dir[0] + dy * this.dir[1] + dz * this.dir[2]) / l > dot;
  }
  // drinking from the nearest star crystal
  feed(game) {
    const h = this.healer;
    if (h && (h.removed || h.distanceSq(this.x, this.y, this.z) > 48 * 48)) { h.beamTo = null; this.healer = null; }
    if (!this.healer && this.age % 10 === 0) {
      let best = null, bd = 34 * 34;
      for (const e of this.world.entities) {
        if (e.type !== 'star_crystal' || e.removed || e.ritual) continue;
        const d2 = e.distanceSq(this.x, this.y, this.z);
        if (d2 < bd) { bd = d2; best = e; }
      }
      this.healer = best;
    }
    if (this.healer) {
      this.healer.beamTo = [this.x, this.y, this.z];
      if (this.age % 10 === 0 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + 1);
    }
  }
  // ---------------------------------------------------------------- attacks
  mouth() { const d = this.dir; return [this.x + d[0] * 2.6, this.y + d[1] * 2.6 - 0.3, this.z + d[2] * 2.6]; }
  spit(game, prey) {
    const [mx, my, mz] = this.mouth();
    // lead the target a little
    const t = Math.hypot(prey.x - mx, prey.y - my, prey.z - mz) / 1.1;
    const tx = prey.x + prey.vx * t * 0.6, ty = prey.y + 0.9, tz = prey.z + prey.vz * t * 0.6;
    game.spawnEntity(new Starbolt(this.world, this, mx, my, mz, tx - mx, ty - my, tz - mz));
    game.audio.play('wyrm_spit', 4, 0.9 + Math.random() * 0.2, mx, my, mz);
    this.breathT = 8;
  }
  // a cone of starfire rolling out from the Well toward you, settling into burning clouds
  breathe(game, prey) {
    const [mx, my, mz] = this.mouth();
    game.audio.play('wyrm_breath', 5, 0.9 + Math.random() * 0.15, mx, my, mz);
    this.breathT = 40;
    const dx = prey.x - mx, dz = prey.z - mz, hd = Math.hypot(dx, dz) || 1;
    for (let k = 1; k <= 4; k++) {
      const dist = Math.min(hd + 2, k * 5.5), x = mx + dx / hd * dist + (Math.random() - 0.5) * 2, z = mz + dz / hd * dist + (Math.random() - 0.5) * 2;
      const y = this.groundBelow(x, my + 2, z);
      if (y === null) continue;
      game.spawnEntity(new StarCloud(this.world, x, y, z, 2.2 + k * 0.35, 120 + k * 20, this));
    }
    if (game.settings.particles !== 'minimal') {
      const L = game.particles.layer('particle_glint');
      for (let i = 0; i < 70; i++) {
        const s = 0.3 + Math.random() * 0.5, sp = (Math.random() - 0.5) * 0.35;
        game.particles.add({ x: mx, y: my, z: mz, vx: (dx / hd + sp) * s, vy: -0.05 + Math.random() * 0.06, vz: (dz / hd - sp) * s, size: 0.12 + Math.random() * 0.1, life: 18 + this.rnd(20), layer: L, r: 0.75, g: 0.5, b: 1, collide: true, bright: true, fade: true });
      }
    }
  }
  groundBelow(x, y, z) {
    const w = this.world, bx = Math.floor(x), bz = Math.floor(z);
    for (let yy = Math.floor(y); yy > Math.floor(y) - 30 && yy > 1; yy--) if (BT.solid[w.getBlock(bx, yy - 1, bz)]) return yy;
    return null;
  }
  // a star called down out of the dark, aimed somewhere near you
  callStar(game, prey) {
    const tx = prey.x + (Math.random() - 0.5) * 18, tz = prey.z + (Math.random() - 0.5) * 18;
    const gy = this.groundBelow(tx, prey.y + 12, tz);
    if (gy === null) return;
    const a = Math.random() * TAU, sx = tx + Math.cos(a) * 26, sz = tz + Math.sin(a) * 26, sy = gy + 70;
    const n = Math.hypot(tx - sx, gy - sy, tz - sz), sp = 1.25;
    game.spawnEntity(new Meteor(this.world, sx, sy, sz, (tx - sx) / n * sp, (gy - sy) / n * sp, (tz - sz) / n * sp, [tx, gy, tz]));
  }
  // smash through anything soft in its path
  crush(game) {
    const w = this.world;
    if (!w.gameRules.mobGriefing) return;
    const pts = [[this.x + this.dir[0] * 0.9, this.y, this.z + this.dir[2] * 0.9, 1.3]];
    for (let i = 0; i < 6; i++) pts.push([this.segs[i].x, this.segs[i].y, this.segs[i].z, WYRM_SIZE(i) * 0.3]);
    let broke = 0;
    for (const [x, y, z, r] of pts) {
      for (let bx = Math.floor(x - r); bx <= Math.floor(x + r); bx++) for (let by = Math.floor(y - r); by <= Math.floor(y + r); by++) for (let bz = Math.floor(z - r); bz <= Math.floor(z + r); bz++) {
        const id = w.getBlock(bx, by, bz);
        if (!id || WYRM_PROOF.has(id) || BT.fluid[id] || !BLOCKS[id] || BLOCKS[id].hardness < 0) continue;
        if (broke < 6 && game.settings.particles !== 'minimal') game.particles.breakBlock(bx, by, bz, id, w.getMeta(bx, by, bz));
        w.setBlock(bx, by, bz, 0, 0);
        broke++;
      }
    }
    if (broke) game.audio.play('explode', 0.6, 1.3, this.x, this.y, this.z);
  }
  // anything in the way of its head or forebody is struck aside
  buffet(game) {
    if (this.buffetT > 0) return;
    const p = game.player;
    if (!p || p.dead || !p.survivalLike) return;
    const hits = [[this.parts[0], 7]];
    for (let i = 1; i < 6; i++) hits.push([this.parts[i], 4]);
    for (const [part, dmg] of hits) {
      if (!part) continue;
      const b = part.box;
      if (p.box.x1 < b.x0 - 0.3 || p.box.x0 > b.x1 + 0.3 || p.box.y1 < b.y0 - 0.3 || p.box.y0 > b.y1 + 0.3 || p.box.z1 < b.z0 - 0.3 || p.box.z0 > b.z1 + 0.3) continue;
      if (p.hurt(scaleMobDamage(this.world, dmg), { type: 'mob', entity: this, knockback: 0 })) {
        const dx = p.x - part.x, dz = p.z - part.z, l = Math.hypot(dx, dz) || 1;
        p.vx += dx / l * 1.1 + this.dir[0] * this.speed; p.vz += dz / l * 1.1 + this.dir[2] * this.speed; p.vy = Math.max(p.vy, 0.55);
      }
      this.buffetT = 12;
      return;
    }
  }
  ambient(game) {
    if (Math.random() * 1000 < this.ambientTimer++) {
      this.ambientTimer = -this.talkInterval;
      game.audio.play('wyrm_say', 4, 0.85 + Math.random() * 0.25, this.x, this.y, this.z);
    }
  }
  // ---------------------------------------------------------------- the end
  dying(game) {
    const t = ++this.deathT, w = this.world;
    this.goal = [this.x + this.dir[0] * 4, this.y + 2, this.z + this.dir[2] * 4];
    this.turn = 0.02;
    const pt = game.settings.particles !== 'minimal';
    // light breaks out of it, and it comes apart from the tail up, star by star
    if (pt && t % 2 === 0) for (let i = 0; i < 4; i++) {
      const s = this.segs[this.rnd(WYRM_SEGS)]; if (s.hidden) continue;
      const a = Math.random() * TAU, b = (Math.random() - 0.5) * Math.PI, v = 0.25 + Math.random() * 0.3;
      game.particles.add({ x: s.x, y: s.y, z: s.z, vx: Math.cos(a) * Math.cos(b) * v, vy: Math.sin(b) * v, vz: Math.sin(a) * Math.cos(b) * v, size: 0.15, life: 24, layer: game.particles.layer('particle_glint'), r: 1, g: 0.9, b: 0.7, collide: false, bright: true, fade: true });
    }
    if (t > 50 && t % 7 === 0) {
      const i = WYRM_SEGS - 1 - Math.floor((t - 50) / 7);
      if (i >= 0) {
        const s = this.segs[i]; s.hidden = true;
        if (pt) for (let k = 0; k < 30; k++) game.particles.sparkle(s.x, s.y, s.z, 0.85, 0.8, 1, 1, WYRM_SIZE(i) * 0.8);
        game.audio.play('wyrm_burst', 3, 0.8 + (WYRM_SEGS - i) * 0.03, s.x, s.y, s.z);
      }
    }
    // the last of it: a burst of light, and a fountain of experience
    const end = 50 + WYRM_SEGS * 7;
    if (t === end) {
      game.audio.play('wyrm_burst', 6, 0.6, this.x, this.y, this.z);
      if (pt) for (let k = 0; k < 120; k++) game.particles.sparkle(this.x, this.y, this.z, 1, 0.95, 0.8, 1, 4);
      if (game.particles.explosion) game.particles.explosion(this.x, this.y, this.z, 3);
    }
    if (t >= end && t < end + 60 && t % 3 === 0) {
      const first = typeof Wyrm !== 'undefined' ? Wyrm.firstKill(w) : true;
      game.spawnXP(this.x + (Math.random() - 0.5) * 2, this.y, this.z + (Math.random() - 0.5) * 2, first ? 150 : 30);
    }
    if (t >= end + 62) {
      this.removed = true;
      for (const p of this.parts) p.removed = true;
      if (typeof Wyrm !== 'undefined') Wyrm.slain(game, this);
    }
  }
  checkDespawn() {}
  save() { return null; }
  // ---------------------------------------------------------------- drawing
  render(er, rx, ry, rz, partial) {
    const [hx, hy, hz] = this.lerpPos(partial), ox = hx - rx, oy = hy - ry, oz = hz - rz;
    const col = er.entColor(this), t = this.age + partial;
    const light = (x, y, z) => { const [s, b] = er.lightAt(x, y, z); return [Math.max(s, 0.55), b]; };
    // the head
    if (!(this.dead && this.deathT > 50 + WYRM_SEGS * 7)) {
      const yaw = this.pyaw + wrapRadians(this.yaw - this.pyaw) * partial, pitch = this.ppitch + (this.pitch - this.ppitch) * partial;
      let m = M3.mul(M3.trans(rx, ry, rz), M3.ry(yaw));
      m = M3.mul(m, M3.rx(pitch));
      m = M3.mul(m, M3.scale(WYRM_HEAD_SCALE / 16, WYRM_HEAD_SCALE / 16, WYRM_HEAD_SCALE / 16));
      const jaw = this.pjaw + (this.jaw - this.pjaw) * partial;
      const sway = Math.sin(t * 0.09) * 0.12;
      const pose = { jaw: [-jaw * 0.75, 0, 0], barbelR: [Math.sin(t * 0.1) * 0.25, sway, 0], barbelL: [Math.sin(t * 0.1 + 1) * 0.25, -sway, 0] };
      const [sky, blk] = light(hx, hy, hz);
      er.drawModel(MODELS.wyrmHead, 'starwyrm_head', m, pose, col, sky, blk);
      er.drawModel(MODELS.wyrmHead, 'starwyrm_eyes', m, pose, [255, 255, 255, 255], -1, 0, { only: ['skull'], inflate: 0.05 });
      er.glow(rx + this.dir[0] * 0.3, ry + 0.25, rz + this.dir[2] * 0.3, 0.9, [140, 220, 255, 60]);
    }
    // the body, segment by segment
    for (let i = 0; i < WYRM_SEGS; i++) {
      const s = this.segs[i];
      if (s.hidden) continue;
      const x = s.px + (s.x - s.px) * partial, y = s.py + (s.y - s.py) * partial, z = s.pz + (s.z - s.pz) * partial;
      const yaw = s.pyaw + wrapRadians(s.yaw - s.pyaw) * partial, pitch = s.ppitch + (s.pitch - s.ppitch) * partial;
      const sc = WYRM_SIZE(i) / 16;
      let m = M3.mul(M3.trans(x - ox, y - oy, z - oz), M3.ry(yaw));
      m = M3.mul(m, M3.rx(pitch));
      // a ripple running down the body as it swims
      m = M3.mul(m, M3.rz(Math.sin(t * 0.12 - i * 0.5) * 0.12));
      m = M3.mul(m, M3.scale(sc, sc, sc));
      const [sky, blk] = light(x, y, z);
      er.drawModel(MODELS.wyrmSeg, 'starwyrm_body', m, {}, col, sky, blk);
      er.drawModel(MODELS.wyrmSeg, 'starwyrm_glow', m, {}, [255, 255, 255, 255], -1, 0, { only: ['body'], inflate: 0.04 });
      if (i === 2 || i === 8) {
        const flap = Math.sin(t * 0.14 - i * 0.4) * 0.45;
        const pose = { finR: [0, 0, -0.25 + flap], finL: [0, 0, 0.25 - flap] };
        er.drawModel(MODELS.wyrmFins, 'starwyrm_body', m, pose, col, sky, blk);
        er.drawModel(MODELS.wyrmFins, 'starwyrm_glow', m, pose, [255, 255, 255, 255], -1, 0, { inflate: 0.04 });
      }
      if (i === WYRM_SEGS - 1) er.drawModel(MODELS.wyrmTail, 'starwyrm_body', m, { fin: [0, Math.sin(t * 0.2) * 0.4, 0] }, col, sky, blk);
    }
  }
}
MOB_CLASSES.starwyrm = Starwyrm;

// ---------------------------------------------------------------------------
// A starbolt: a knot of starfire that bursts into a burning cloud. Strike it
// back the way it came and it will burn the Starwyrm instead.
// ---------------------------------------------------------------------------
class Starbolt extends Entity {
  constructor(world, shooter, x, y, z, dx, dy, dz) {
    super(world);
    this.type = 'starbolt';
    this.w = this.h = 0.7;
    this.shooter = shooter;
    this.noGravity = true;
    this.setPos(x, y - this.h / 2, z);
    const l = Math.hypot(dx, dy, dz) || 1;
    this.vx = dx / l * 1.0; this.vy = dy / l * 1.0; this.vz = dz / l * 1.0;
  }
  hurt(amount, src) {
    const e = src && src.entity;
    if (!e || e.type !== 'player') return false;
    const dx = -Math.sin(e.yaw) * Math.cos(e.pitch), dy = Math.sin(e.pitch), dz = -Math.cos(e.yaw) * Math.cos(e.pitch);
    this.vx = dx * 1.2; this.vy = dy * 1.2; this.vz = dz * 1.2;
    this.shooter = e; this.age = 0;
    this.game.audio.play('wyrm_spit', 1.5, 1.5, this.x, this.y, this.z);
    return true;
  }
  get game() { return this.world.game; }
  tick(game) {
    this.px = this.x; this.py = this.y; this.pz = this.z;
    this.age++;
    const w = this.world;
    if (this.age > 200 || this.y < -10 || this.y > CH_H + 40) { this.removed = true; return; }
    const len = Math.hypot(this.vx, this.vy, this.vz), cy = this.y + this.h / 2;
    const hit = raycastBlocks(w, this.x, cy, this.z, this.vx, this.vy, this.vz, len, { collision: true });
    let target = null, tb = hit ? hit.t : len;
    const reflected = this.shooter && this.shooter.type === 'player';
    for (const e of w.entities.concat(game.player && !game.player.dead ? [game.player] : [])) {
      if (e === this || e.removed || !e.hurt || e.dead || e.type === 'starbolt' || e.type === 'star_crystal') continue;
      if (!reflected && (e === this.shooter || e.type === 'wyrm_part')) continue;
      if (reflected && e === this.shooter && this.age < 10) continue;
      const b = e.box.copy(); b.x0 -= 0.35; b.y0 -= 0.35; b.z0 -= 0.35; b.x1 += 0.35; b.y1 += 0.35; b.z1 += 0.35;
      const h = rayBox(this.x, cy, this.z, this.vx / len, this.vy / len, this.vz / len, b);
      if (h && h.t < tb) { tb = h.t; target = e; }
    }
    if (target || hit) {
      const f = tb / len;
      this.x += this.vx * f; this.y += this.vy * f; this.z += this.vz * f;
      this.burst(game, target, hit);
      return;
    }
    this.x += this.vx; this.y += this.vy; this.z += this.vz;
    this.updateBox();
    if (game.settings.particles !== 'minimal') game.particles.sparkle(this.x, cy, this.z, 0.8, 0.6, 1, 2, 0.4);
  }
  burst(game, target, hit) {
    const w = this.world;
    this.removed = true;
    const cy = this.y + this.h / 2;
    if (target) target.hurt(target.type === 'wyrm_part' ? 12 : 6, { type: target.type === 'wyrm_part' ? 'starbolt' : 'magic', entity: this.shooter || this, knockback: 0.3 });
    game.audio.play('wyrm_bolt_burst', 2.5, 0.9 + Math.random() * 0.2, this.x, cy, this.z);
    if (game.settings.particles !== 'minimal') for (let i = 0; i < 30; i++) game.particles.sparkle(this.x, cy, this.z, 0.85, 0.6, 1, 1, 1.6);
    // the burning cloud settles on the ground where it struck
    let gy = null;
    for (let y = Math.floor(cy) + 1; y > Math.floor(cy) - 6 && y > 1; y--) if (BT.solid[w.getBlock(Math.floor(this.x), y - 1, Math.floor(this.z))] && !BT.solid[w.getBlock(Math.floor(this.x), y, Math.floor(this.z))]) { gy = y; break; }
    if (gy !== null && !(target && target.type === 'wyrm_part')) game.spawnEntity(new StarCloud(w, this.x, gy, this.z, 2.6, 110, this.shooter));
  }
  render(er, rx, ry, rz, partial) {
    const t = this.age + partial, cy = ry + this.h / 2;
    let m = M3.mul(M3.trans(rx, cy, rz), M3.ry(t * 0.3));
    m = M3.mul(m, M3.rx(t * 0.21));
    er.texBox(er.r.batch, m, [-0.22, -0.22, -0.22, 0.22, 0.22, 0.22], er.r.atlas.layer('star_crystal_core'), -1, 0, 1 / 0.44);
    er.glow(rx, cy, rz, 0.8 + Math.sin(t * 0.6) * 0.1, [190, 140, 255, 150]);
    er.glow(rx, cy, rz, 0.35, [255, 245, 255, 220]);
  }
  save() { return null; }
}

// ---------------------------------------------------------------------------
// Starfire left lying on the ground: a low, glittering cloud that burns
// whatever stands in it (but never the wyrm).
// ---------------------------------------------------------------------------
class StarCloud extends Entity {
  constructor(world, x, y, z, r, life, owner) {
    super(world);
    this.type = 'star_cloud';
    this.r = r; this.life = life; this.owner = owner || null;
    this.w = r * 2; this.h = 1.2;
    this.noGravity = true; this.noClip = true;
    this.setPos(x, y, z);
  }
  tick(game) {
    this.px = this.x; this.py = this.y; this.pz = this.z;
    this.age++;
    if (this.age > this.life) { this.removed = true; return; }
    const r = this.r * (1 - 0.35 * this.age / this.life);
    if (game.settings.particles !== 'minimal' && this.age % 2 === 0) {
      const L = game.particles.layer('particle_glint');
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r;
        game.particles.add({ x: this.x + Math.cos(a) * d, y: this.y + 0.05 + Math.random() * 0.4, z: this.z + Math.sin(a) * d, vx: 0, vy: 0.012 + Math.random() * 0.02, vz: 0, size: 0.1 + Math.random() * 0.08, life: 20 + Math.floor(Math.random() * 16), layer: L, r: 0.7, g: 0.45, b: 1, collide: false, bright: true, fade: true });
      }
    }
    if (this.age % 10 === 0) {
      const w = this.world;
      for (const e of w.entities.concat(game.player && !game.player.dead ? [game.player] : [])) {
        if (e.removed || e.dead || !e.hurt || !e.box || e.type === 'starwyrm' || e.type === 'wyrm_part' || e.type === 'star_crystal' || e.type === 'item' || e.type === 'xp' || e.type === 'star_cloud' || e.type === 'starbolt') continue;
        if ((e.x - this.x) ** 2 + (e.z - this.z) ** 2 > r * r || e.y > this.y + 1.4 || e.y + e.h < this.y - 0.5) continue;
        if (e.type === 'player' && !e.survivalLike) continue;
        e.hurt(3, { type: 'magic', entity: this.owner && !this.owner.removed ? this.owner : null, knockback: 0 });
      }
    }
  }
  render(er, rx, ry, rz) { er.glow(rx, ry + 0.3, rz, this.r * 0.9, [150, 90, 255, 40]); }
  save() { return null; }
}

// ---------------------------------------------------------------------------
// A falling star, called down by the Starwyrm: a glowing ring on the ground
// marks where it will land. Where it strikes it leaves star fragments.
// ---------------------------------------------------------------------------
class Meteor extends Entity {
  constructor(world, x, y, z, vx, vy, vz, target) {
    super(world);
    this.type = 'meteor';
    this.w = this.h = 0.9;
    this.noGravity = true; this.noClip = true;
    this.setPos(x, y, z);
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.target = target;
    this.whistled = false;
  }
  tick(game) {
    this.px = this.x; this.py = this.y; this.pz = this.z;
    this.age++;
    const w = this.world, [tx, ty, tz] = this.target;
    if (this.age > 300 || this.y < -20) { this.removed = true; return; }
    const pt = game.settings.particles !== 'minimal';
    // the warning ring where it will fall
    if (pt && this.age % 3 === 0) {
      const L = game.particles.layer('particle_glint');
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + this.age * 0.05; game.particles.add({ x: tx + Math.cos(a) * 2.2, y: ty + 0.1, z: tz + Math.sin(a) * 2.2, vx: 0, vy: 0.02, vz: 0, size: 0.1, life: 10, layer: L, r: 1, g: 0.8, b: 0.4, collide: false, bright: true, fade: true }); }
    }
    if (!this.whistled && game.player && game.player.distanceSq(tx, ty, tz) < 60 * 60) { this.whistled = true; game.audio.play('meteor_fall', 3, 0.9 + Math.random() * 0.2, this.x, this.y, this.z); }
    const len = Math.hypot(this.vx, this.vy, this.vz);
    const hit = raycastBlocks(w, this.x, this.y + 0.45, this.z, this.vx, this.vy, this.vz, len, { collision: true });
    if (hit || this.y + this.vy <= ty) {
      const f = hit ? hit.t / len : Math.max(0, (this.y - ty) / -this.vy);
      this.x += this.vx * f; this.y += this.vy * f; this.z += this.vz * f;
      this.land(game);
      return;
    }
    this.x += this.vx; this.y += this.vy; this.z += this.vz;
    this.updateBox();
    if (pt) {
      const L = game.particles.layer('particle_glint');
      for (let i = 0; i < 3; i++) game.particles.add({ x: this.x + (Math.random() - 0.5) * 0.5, y: this.y + 0.45 + (Math.random() - 0.5) * 0.5, z: this.z + (Math.random() - 0.5) * 0.5, vx: -this.vx * 0.05, vy: -this.vy * 0.05, vz: -this.vz * 0.05, size: 0.2, life: 16 + Math.floor(Math.random() * 10), layer: L, r: 1, g: 0.75 + Math.random() * 0.2, b: 0.45, collide: false, bright: true, fade: true });
      if (this.age % 2 === 0) game.particles.smoke(this.x, this.y + 0.45, this.z, 1, false);
    }
  }
  land(game) {
    const w = this.world;
    this.removed = true;
    Behaviors.explode(game, this.x, this.y + 0.5, this.z, 2, { type: 'meteor', entity: this }, false);
    game.audio.play('meteor_impact', 3, 0.85 + Math.random() * 0.2, this.x, this.y, this.z);
    if (game.settings.particles !== 'minimal') for (let i = 0; i < 40; i++) game.particles.sparkle(this.x, this.y + 0.6, this.z, 1, 0.85, 0.5, 1, 2.5);
    // what is left of it, still warm
    if (BT.solid[w.getBlock(Math.floor(this.x), Math.floor(this.y - 0.5), Math.floor(this.z))] || BT.solid[w.getBlock(Math.floor(this.x), Math.floor(this.y) - 1, Math.floor(this.z))]) {
      const n = 1 + (Math.random() < 0.45 ? 1 : 0);
      Behaviors.dropStack(game, this.x, this.y + 0.6, this.z, new ItemStack(ITEM_IDS.star_fragment, n, 0));
    }
  }
  render(er, rx, ry, rz, partial) {
    const t = this.age + partial, cy = ry + 0.45;
    let m = M3.mul(M3.trans(rx, cy, rz), M3.ry(t * 0.4));
    m = M3.mul(m, M3.rx(t * 0.33));
    er.texBox(er.r.batch, m, [-0.35, -0.35, -0.35, 0.35, 0.35, 0.35], er.r.atlas.layer('star_crystal_core'), -1, 0, 1 / 0.7);
    er.glow(rx, cy, rz, 1.6, [255, 200, 120, 140]);
    er.glow(rx, cy, rz, 0.6, [255, 250, 230, 230]);
  }
  save() { return null; }
}

// ---------------------------------------------------------------------------
// A star crystal's beam: to the wyrm drinking from it, or up into the sky
// while the Star Well calls the wyrm back
// ---------------------------------------------------------------------------
StarCrystal.prototype.beam = function (er, rx, cy, rz, partial) {
  const to = this.beamTo;
  if (!to) return;
  const cam = er.game.camera;
  const ax = rx, ay = cy, az = rz, bx = to[0] - cam.x, by = to[1] - cam.y, bz = to[2] - cam.z;
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
  if (len < 0.5) return;
  const ux = dx / len, uy = dy / len, uz = dz / len;
  // two crossed ribbons along the beam
  let p1 = [uz, 0, -ux]; if (Math.hypot(p1[0], p1[2]) < 0.1) p1 = [1, 0, 0];
  const pl = Math.hypot(p1[0], p1[1], p1[2]); p1 = [p1[0] / pl, p1[1] / pl, p1[2] / pl];
  const p2 = [uy * p1[2] - uz * p1[1], uz * p1[0] - ux * p1[2], ux * p1[1] - uy * p1[0]];
  const t = ((this.world.time + partial) % 40) / 40, L = er.r.atlas.layer('star_crystal_core'), b = er.r.batch, w = 0.16;
  for (const p of [p1, p2]) {
    const v = [[ax - p[0] * w, ay - p[1] * w, az - p[2] * w], [ax + p[0] * w, ay + p[1] * w, az + p[2] * w], [bx + p[0] * w, by + p[1] * w, bz + p[2] * w], [bx - p[0] * w, by - p[1] * w, bz - p[2] * w]];
    er.quadOut(b, v, [[0.4, -t], [0.6, -t], [0.6, len / 3 - t], [0.4, len / 3 - t]], L, [230, 200, 255, 255], -1, 0);
  }
};
