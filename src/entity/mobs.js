'use strict';
// ---------------------------------------------------------------------------
// Creatures: monsters, animals, ambient life and the odd mystery.
// AI (A* pathfinding, targeting, wandering, breeding), drops & spawning rules.
// ---------------------------------------------------------------------------

// Index = spawn egg damage value. Append only (saved items refer to the index).
const MOB_TYPES = [
  { key: 'zombie', name: 'Zombie', egg: ['#2f9e8e', '#6f8f58'], cat: 'monster', lore: 'Shambles out of the dark and burns in the sun. Keep a door between you and it.' },
  { key: 'skeleton', name: 'Skeleton', egg: ['#c8c8c0', '#4a4a48'], cat: 'monster', lore: 'A rattling archer. Close the distance or use cover. Also burns in daylight.' },
  { key: 'spider', name: 'Spider', egg: ['#3a3029', '#b01818'], cat: 'monster', lore: 'Climbs walls and leaps. Leaves you be in daylight - unless you start it.' },
  { key: 'boomcap', name: 'Boomcap', egg: ['#b82020', '#f2f2f2'], cat: 'monster', lore: 'A walking toadstool full of volatile spores. When it starts to swell, run.' },
  { key: 'slime', name: 'Slime', egg: ['#5aa846', '#86c870'], cat: 'monster', lore: 'Bounces through swamps on dark nights and splits apart when struck.' },
  { key: 'mummy', name: 'Mummy', egg: ['#cbbb92', '#6a5a3a'], cat: 'monster', lore: 'A wrapped wanderer of the sands. Sunlight cannot stop it, and its touch leaves you starving.' },
  { key: 'wraith', name: 'Wraith', egg: ['#8aa0b8', '#2e3a48'], cat: 'monster', lore: 'A cold spirit that drifts over snow and moor after dark and fades at dawn. Snowballs sting it.' },
  { key: 'pig', name: 'Pig', egg: ['#f0a8a0', '#d86a64'], cat: 'creature', lore: 'Follows anyone holding a carrot or potato.' },
  { key: 'cow', name: 'Cow', egg: ['#4a3626', '#d8d8d8'], cat: 'creature', lore: 'Gives milk, beef and leather. Loves wheat.' },
  { key: 'sheep', name: 'Sheep', egg: ['#ececec', '#e0b8a8'], cat: 'creature', lore: 'Shear it for wool, then let it graze to grow more. Dye it any colour.' },
  { key: 'chicken', name: 'Chicken', egg: ['#d8d8d8', '#d82020'], cat: 'creature', lore: 'Lays eggs and flutters gently down from any height. Eats seeds.' },
  { key: 'deer', name: 'Deer', egg: ['#a07040', '#e8dcc8'], cat: 'creature', lore: 'Shy creatures of the woods. Sneak up slowly - and bring berries.' },
  { key: 'bat', name: 'Bat', egg: ['#4c3e30', '#141414'], cat: 'ambient', lore: 'Squeaks and flutters in the dark of caves. Harmless.' },
  { key: 'wisp', name: 'Wisp', egg: ['#8affee', '#2a6a64'], cat: 'ambient', lore: 'A drifting light over swamp and shore after dark. Follow it and it may lead you to buried treasure.' },
  { key: 'stranger', name: 'The Stranger', egg: null, cat: 'special', lore: 'Watching. Always at the edge of sight. Gone when you look closer.' },
  { key: 'wolf', name: 'Wolf', egg: ['#d2ccc3', '#8a7c6c'], cat: 'creature', lore: 'Hunts in packs through forest and taiga - strike one and the whole pack answers. Offer bones and it may become a loyal companion.' },
  { key: 'villager', name: 'Villager', egg: ['#5e3e2a', '#c08f72'], cat: 'creature', lore: 'Keeps a home in the villages of the plains, deserts and taiga. Bring jade and see what they will trade.' },
  { key: 'squid', name: 'Squid', egg: ['#2c3c5c', '#7a8aa8'], cat: 'water', lore: 'Pulses through rivers and seas. Startle it and it vanishes in a cloud of ink. Its ink sacs make black dye.' },
];
const MOB_INDEX = {};
MOB_TYPES.forEach((m, i) => { if (m) { m.index = i; MOB_INDEX[m.key] = m; } });

// ---------------------------------------------------------------- helpers
function lightBrightness(level) { const f = 1 - level / 15; return (1 - f) / (f * 3 + 1); }
function scaleMobDamage(world, dmg) {
  switch (world.difficulty) {
    case 0: return 0;
    case 1: return Math.min(dmg / 2 + 1, dmg);
    case 3: return dmg * 1.5;
    default: return dmg;
  }
}
function approachAngle(cur, target, max) { const d = wrapRadians(target - cur); return cur + clamp(d, -max, max); }
// Cheap line of sight through opaque blocks (DDA)
function lineOfSight(w, x0, y0, z0, x1, y1, z1) {
  let dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) return true;
  dx /= len; dy /= len; dz /= len;
  let x = Math.floor(x0), y = Math.floor(y0), z = Math.floor(z0);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
  let tmx = dx > 0 ? (x + 1 - x0) * tdx : (x0 - x) * tdx;
  let tmy = dy > 0 ? (y + 1 - y0) * tdy : (y0 - y) * tdy;
  let tmz = dz > 0 ? (z + 1 - z0) * tdz : (z0 - z) * tdz;
  if (!isFinite(tmx)) tmx = 1e9; if (!isFinite(tmy)) tmy = 1e9; if (!isFinite(tmz)) tmz = 1e9;
  for (let i = 0; i < 256; i++) {
    if (tmx < tmy && tmx < tmz) { if (tmx > len) return true; x += sx; tmx += tdx; }
    else if (tmy < tmz) { if (tmy > len) return true; y += sy; tmy += tdy; }
    else { if (tmz > len) return true; z += sz; tmz += tdz; }
    if (BT.opaque[w.getBlock(x, y, z)]) return false;
  }
  return true;
}

// ---------------------------------------------------------------- A* pathfinding on the block grid
const PathFinder = (() => {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // 0 open, 1 solid, 2 water, 3 dangerous, 4 tall solid (fences)
  let throughDoors = false;
  function kind(w, x, y, z) {
    if (y < 0) return 1;
    if (y >= CH_H) return 0;
    const id = w.getBlock(x, y, z);
    if (id === 0) return 0;
    switch (id) {
      case B.WATER: return 2;
      case B.LAVA: case B.FIRE: case B.CACTUS: case B.COBWEB: case B.QUICKSAND: case B.BRAMBLE: return 3;
      case B.FENCE: case B.FENCE_GATE: case B.BRIMSTONE_FENCE: return 4;
      case B.DOOR_WOOD: return (throughDoors || (w.getMeta(x, y, z) & 4)) ? 0 : 1;
      case B.DOOR_IRON: return (w.getMeta(x, y, z) & 4) ? 0 : 1;
      case B.LADDER: case B.VINE: case B.ROPE: return 0;
    }
    return BT.solid[id] ? 1 : 0;
  }
  function open(w, x, y, z, hb) {
    for (let i = 0; i < hb; i++) { const k = kind(w, x, y + i, z); if (k === 1 || k === 3 || k === 4) return false; }
    return true;
  }
  // a node is where the creature's feet can be
  function valid(w, x, y, z, hb) {
    const k = kind(w, x, y, z);
    if (k === 2) return kind(w, x, y + 1, z) !== 2 && open(w, x, y, z, hb);   // swimming at the surface
    if (k !== 0) return false;
    const below = kind(w, x, y - 1, z);
    if (below !== 1) return false;
    if (!open(w, x, y, z, hb)) return false;
    return true;
  }
  function find(w, mob, tx, ty, tz, range, maxNodes) {
    throughDoors = !!mob.opensDoors;
    try { return search(w, mob, tx, ty, tz, range, maxNodes); } finally { throughDoors = false; }
  }
  function search(w, mob, tx, ty, tz, range, maxNodes) {
    const hb = Math.max(1, Math.ceil(mob.h - 0.05));
    let sx = Math.floor(mob.x), sy = Math.floor(mob.y + 0.01), sz = Math.floor(mob.z);
    if (!valid(w, sx, sy, sz, hb)) {
      if (valid(w, sx, sy + 1, sz, hb)) sy++;
      else { let k = 0; while (k < 4 && !valid(w, sx, sy - 1, sz, hb) && sy > 1) { sy--; k++; } if (valid(w, sx, sy - 1, sz, hb)) sy--; }
    }
    tx = Math.floor(tx); ty = Math.floor(ty); tz = Math.floor(tz);
    const nodes = new Map();
    const heap = new MinHeap();
    const key = (x, y, z) => ((x - sx + 512) * 1024 + (z - sz + 512)) * 256 + y;
    const h = (x, y, z) => Math.sqrt((x - tx) * (x - tx) + (y - ty) * (y - ty) * 1.5 + (z - tz) * (z - tz));
    const start = { x: sx, y: sy, z: sz, g: 0, f: h(sx, sy, sz), parent: null, closed: false };
    nodes.set(key(sx, sy, sz), start);
    heap.push(start, start.f);
    let best = start, bestH = start.f, it = 0;
    const r2 = range * range;
    const add = (n, x, y, z, cost) => {
      if ((x - sx) * (x - sx) + (z - sz) * (z - sz) > r2) return;
      const k = key(x, y, z);
      const g = n.g + cost;
      let o = nodes.get(k);
      if (!o) { o = { x, y, z, g, f: g + h(x, y, z), parent: n, closed: false }; nodes.set(k, o); heap.push(o, o.f); }
      else if (!o.closed && g < o.g) { o.g = g; o.f = g + h(x, y, z); o.parent = n; heap.push(o, o.f); }
    };
    while (heap.size && it < maxNodes) {
      const n = heap.pop();
      if (n.closed) continue;
      n.closed = true; it++;
      const hn = n.f - n.g;
      if (hn < bestH) { bestH = hn; best = n; }
      if (n.x === tx && n.z === tz && Math.abs(n.y - ty) <= 1) { best = n; break; }
      const inWater = kind(w, n.x, n.y, n.z) === 2;
      for (const [dx, dz] of DIRS) {
        const nx = n.x + dx, nz = n.z + dz;
        if (valid(w, nx, n.y, nz, hb)) { add(n, nx, n.y, nz, kind(w, nx, n.y, nz) === 2 ? 4 : 1); continue; }
        const k = kind(w, nx, n.y, nz);
        if ((k === 1 || (inWater && k === 0)) && valid(w, nx, n.y + 1, nz, hb) && open(w, n.x, n.y + hb, n.z, 1)) { add(n, nx, n.y + 1, nz, 2); continue; }
        if (open(w, nx, n.y, nz, hb)) {
          for (let d = 1; d <= 3; d++) {
            const yy = n.y - d;
            if (yy < 1) break;
            const kk = kind(w, nx, yy, nz);
            if (kk === 1 || kk === 3 || kk === 4) break;
            if (valid(w, nx, yy, nz, hb)) { add(n, nx, yy, nz, 1 + d * 0.6); break; }
          }
        }
      }
    }
    if (best === start) return null;
    const path = [];
    for (let n = best; n && n !== start; n = n.parent) path.push([n.x, n.y, n.z]);
    path.reverse();
    return path;
  }
  return { find, valid, kind, open };
})();

// ---------------------------------------------------------------------------
// Base creature
// ---------------------------------------------------------------------------
class Mob extends Living {
  constructor(world, type) {
    super(world);
    this.type = type;
    this.def = MOB_INDEX[type];
    this.category = this.def ? this.def.cat : 'monster';
    this.baseSpeed = 0.25;
    this.aiSpeed = 0;
    this.target = null; this.unseen = 0; this.targetSearch = Math.floor(Math.random() * 10);
    this.path = null; this.pathIdx = 0; this.pathGoal = null; this.pathSpeed = 1; this.repath = 0;
    this.progressX = 0; this.progressZ = 0; this.progressTimer = 0;
    this.lookX = 0; this.lookY = 0; this.lookZ = 0; this.lookTimer = 0; this.looking = false;
    this.ambientTimer = -Math.floor(Math.random() * 200);
    this.talkInterval = 80;
    this.attackTimer = 0;
    this.recentlyHit = 0;
    this.xpValue = 5;
    this.hostile = false;
    this.growAge = 0;            // < 0: baby
    this.flipDeath = Math.random() < 0.5;
    this.idleTime = 0;
    this.swims = true;
  }
  get game() { return this.world.game; }
  get baby() { return this.growAge < 0; }
  moveSpeed() { return this.aiSpeed; }
  setMove(mult) { this.aiSpeed = this.baseSpeed * mult; this.forward = this.aiSpeed; }
  stopMoving() { this.aiSpeed = 0; this.forward = 0; this.strafe = 0; }
  eyePos() { return [this.x, this.y + this.eye, this.z]; }
  canSee(e) { return lineOfSight(this.world, this.x, this.y + this.eye, this.z, e.x, e.y + (e.eye || e.h * 0.85), e.z); }
  distSqTo(e) { return this.distanceSq(e.x, e.y, e.z); }

  // ---------------------------------------------------------------- looking
  lookAtPoint(x, y, z, ticks) { this.lookX = x; this.lookY = y; this.lookZ = z; this.lookTimer = ticks || 2; }
  lookAtEntity(e, ticks) { this.lookAtPoint(e.x, e.y + (e.eye || e.h * 0.85), e.z, ticks || 2); }
  updateLook() {
    if (this.lookTimer > 0) {
      this.lookTimer--;
      const dx = this.lookX - this.x, dy = this.lookY - (this.y + this.eye), dz = this.lookZ - this.z;
      const hd = Math.sqrt(dx * dx + dz * dz);
      const ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, hd);
      this.headYawTarget = approachAngle(this.headYawTarget === undefined ? this.yaw : this.headYawTarget, ty, 10 * DEG);
      this.pitchTarget = approachAngle(this.pitchTarget || 0, tp, 10 * DEG);
      this.looking = true;
    } else {
      this.headYawTarget = approachAngle(this.headYawTarget === undefined ? this.yaw : this.headYawTarget, this.yaw, 10 * DEG);
      this.pitchTarget = approachAngle(this.pitchTarget || 0, 0, 10 * DEG);
      this.looking = false;
    }
  }

  // ---------------------------------------------------------------- navigation
  navigateTo(x, y, z, speed, range) {
    const p = PathFinder.find(this.world, this, x, y, z, range || 24, this.pathNodes || 260);
    this.pathSpeed = speed;
    this.pathGoal = [x, y, z];
    if (!p || !p.length) { this.path = null; return false; }
    this.path = p; this.pathIdx = 0;
    this.progressTimer = 0; this.progressX = this.x; this.progressZ = this.z;
    return true;
  }
  clearPath() { this.path = null; this.pathGoal = null; }
  get pathDone() { return !this.path || this.pathIdx >= this.path.length; }
  steerTo(x, y, z, speed) {
    const dx = x - this.x, dz = z - this.z;
    const ty = Math.atan2(-dx, -dz);
    this.yaw = approachAngle(this.yaw, ty, 30 * DEG);
    this.setMove(speed);
    const hd = dx * dx + dz * dz;
    if (y > this.y + 0.6 && hd < 2.25 && this.onGround) this.jumping = true;
  }
  followPath() {
    if (!this.path) return false;
    if (this.pathIdx >= this.path.length) { this.path = null; return false; }
    // skip ahead while the next nodes are on our level and reachable in a straight line
    while (this.pathIdx < this.path.length - 1) {
      const n = this.path[this.pathIdx];
      const dx = n[0] + 0.5 - this.x, dz = n[2] + 0.5 - this.z;
      const reach = Math.max(0.45, this.w * 0.75);
      if (dx * dx + dz * dz < reach * reach && Math.abs(n[1] - this.y) < 1.2) this.pathIdx++;
      else break;
    }
    const n = this.path[this.pathIdx];
    const dx = n[0] + 0.5 - this.x, dz = n[2] + 0.5 - this.z;
    const reach = Math.max(0.45, this.w * 0.75);
    if (dx * dx + dz * dz < reach * reach && Math.abs(n[1] - this.y) < 1.2) { this.pathIdx++; if (this.pathIdx >= this.path.length) { this.path = null; this.stopMoving(); return false; } }
    const m = this.path[this.pathIdx];
    this.steerTo(m[0] + 0.5, m[1], m[2] + 0.5, this.pathSpeed);
    // stuck detection
    if (++this.progressTimer >= 50) {
      const mx = this.x - this.progressX, mz = this.z - this.progressZ;
      if (mx * mx + mz * mz < 0.5) { this.path = null; this.stopMoving(); this.jumping = this.onGround; return false; }
      this.progressTimer = 0; this.progressX = this.x; this.progressZ = this.z;
    }
    return true;
  }
  findRandomTarget(range, yr, weightFn) {
    let best = null, bw = -1e9;
    const hb = Math.max(1, Math.ceil(this.h - 0.05));
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(this.x) + Math.floor(Math.random() * (range * 2 + 1)) - range;
      const z = Math.floor(this.z) + Math.floor(Math.random() * (range * 2 + 1)) - range;
      if (!this.world.isLoaded(x, z)) continue;
      const y0 = Math.floor(this.y);
      for (let dy = yr; dy >= -yr; dy--) {
        const y = y0 + dy;
        if (y < 1 || y >= CH_H - 2) continue;
        if (PathFinder.valid(this.world, x, y, z, hb)) {
          const wgt = weightFn ? weightFn(x, y, z) : 0;
          if (wgt > bw) { bw = wgt; best = [x, y, z]; }
          break;
        }
      }
    }
    return best;
  }
  wander(range, yr, speed, weightFn) {
    const t = this.findRandomTarget(range, yr, weightFn);
    if (t) this.navigateTo(t[0], t[1], t[2], speed, range + 4);
  }
  // pathing weight for wandering
  pathWeight(x, y, z) { return lightBrightness(this.world.getLightLevel(x, y, z)) - 0.5; }

  // ---------------------------------------------------------------- per tick
  tick(game) {
    this.baseTick();
    if (this.removed) return;
    if (!this.dead) {
      this.stopMoving();
      this.jumping = false;
      if (this.attackTimer > 0) this.attackTimer--;
      if (this.recentlyHit > 0) this.recentlyHit--;
      this.aiTick(game);
      this.followPath();
      if (this.collidedH && this.onGround && this.aiSpeed > 0) this.jumping = true;
      if ((this.inWater || this.inLava) && this.swims && Math.random() < 0.8) this.jumping = true;
      if (!this.path && this.aiSpeed === 0 && this.lookTimer > 0) this.yaw = approachAngle(this.yaw, this.headYawTarget === undefined ? this.yaw : this.headYawTarget, 10 * DEG);
      this.updateLook();
    }
    this.livingTick();
    if (!this.dead) {
      // the head may turn further than the body (clamped)
      const hy = this.headYawTarget === undefined ? this.yaw : this.headYawTarget;
      this.headYaw = this.bodyYaw + clamp(wrapRadians(hy - this.bodyYaw), -75 * DEG, 75 * DEG);
      this.pitch = this.pitchTarget || 0;
      if (this.growAge < 0) { if (++this.growAge === 0) this.applySize(); }
      else if (this.growAge > 0) this.growAge--;
      this.ambient(game);
      this.mobTick(game);
    } else if (this.deathTime >= 20) {
      this.removed = true;
      game.particles.smoke(this.x, this.y + this.h / 2, this.z, 12, true);
    }
  }
  aiTick() {}
  mobTick() {}
  ambient(game) {
    if (Math.random() * 1000 < this.ambientTimer++) {
      this.ambientTimer = -this.talkInterval;
      const s = this.saySound();
      if (s) game.audio.play(s, this.soundVolume(), this.soundPitch(), this.x, this.y + this.eye, this.z);
    }
  }
  saySound() { return SOUND_DEFS[this.type + '_say'] ? this.type + '_say' : null; }
  hurtSound() { return SOUND_DEFS[this.type + '_hurt'] ? this.type + '_hurt' : this.saySound(); }
  deathSound() { return SOUND_DEFS[this.type + '_death'] ? this.type + '_death' : this.hurtSound(); }
  soundVolume() { return 1; }
  soundPitch() { return (Math.random() - Math.random()) * 0.2 + (this.baby ? 1.5 : 1); }

  // ---------------------------------------------------------------- combat
  hurt(amount, src) {
    if (src && src.entity && src.entity.type === 'player') { this.recentlyHit = 100; this.lastPlayer = src.entity; }
    return super.hurt(amount, src);
  }
  onHurt(amount, src) {
    this.ambientTimer = -this.talkInterval;
    if (!this.dead && this.health > 0) { const s = this.hurtSound(); if (s) this.game.audio.play(s, this.soundVolume(), this.soundPitch(), this.x, this.y + this.eye, this.z); }
    if (src && src.entity && src.entity !== this && this.onRevenge) this.onRevenge(src.entity);
  }
  attackEntity(e, dmg, extra) {
    this.swing();
    const d = e.type === 'player' ? scaleMobDamage(this.world, dmg) : dmg;
    if (d <= 0) return false;
    const ok = e.hurt(d, Object.assign({ type: 'mob', entity: this, knockback: 0.4 }, extra || {}));
    if (ok && this.fire > 0 && Math.random() < 0.3 * this.world.difficulty) e.fire = Math.max(e.fire, 40 * this.world.difficulty);
    return ok;
  }
  onDeath(src) {
    const game = this.game;
    const byPlayer = this.recentlyHit > 0;
    const s = this.deathSound();
    if (s) game.audio.play(s, this.soundVolume(), this.soundPitch(), this.x, this.y + this.eye, this.z);
    this.looting = 0;
    if (byPlayer && src && src.entity && src.entity.type === 'player' && src.entity.inventory) this.looting = Enchant.level(src.entity.inventory.held(), 'looting');
    if (game.world.gameRules.doMobLoot !== false) this.dropLoot(game, byPlayer, src);
    if (byPlayer && this.xpValue > 0 && !this.baby) {
      const n = typeof this.xpValue === 'function' ? this.xpValue() : this.xpValue;
      game.spawnXP(this.x, this.y + this.h / 2, this.z, n);
    }
    if (byPlayer && game.onMobKilled) game.onMobKilled(this, src);
  }
  dropLoot() {}
  drop(id, count, dmg) {
    if (this.looting > 0 && id >= 256) count += Math.floor(Math.random() * (this.looting + 1));
    if (count <= 0) return;
    Behaviors.dropStack(this.game, this.x, this.y + 0.5, this.z, new ItemStack(id, count, dmg || 0));
  }
  rnd(n) { return Math.floor(Math.random() * n); }

  // ---------------------------------------------------------------- targeting
  playerTarget(game, range) {
    const p = game.player;
    if (!p || p.dead || !p.survivalLike || this.world.difficulty === 0) return null;
    let r = range;
    if (p.sneaking) r *= 0.8;
    if (this.distSqTo(p) > r * r) return null;
    if (!this.canSee(p)) return null;
    return p;
  }
  updateTarget(game, range, follow) {
    const t = this.target;
    if (t) {
      if (t.dead || t.removed || (t.type === 'player' && (!t.survivalLike || this.world.difficulty === 0)) || this.distSqTo(t) > follow * follow) { this.target = null; this.clearPath(); }
      else if (!this.canSee(t)) { if (++this.unseen > 60) { this.target = null; this.clearPath(); } }
      else this.unseen = 0;
    }
    if (!this.target && ++this.targetSearch % 10 === 0) { this.target = this.playerTarget(game, range); this.unseen = 0; }
    if (!this.target && this.attackedBy && !this.attackedBy.dead && this.attackedBy.type === 'player' && this.attackedBy.survivalLike) this.target = this.attackedBy;
  }
  chase(speed) {
    const t = this.target;
    this.lookAtEntity(t, 2);
    const d2 = this.distanceSq(t.x, t.y, t.z);
    if (--this.repath <= 0 || !this.path) {
      this.repath = 4 + this.rnd(7) + (d2 > 1024 ? 10 : d2 > 256 ? 5 : 0);
      if (!this.navigateTo(t.x, t.y + 0.01, t.z, speed, 40)) { this.steerTo(t.x, t.y, t.z, speed); }
    }
    return d2;
  }
  meleeReach(t) { const r = this.w * 2; return r * r + t.w; }
  tryMelee(t, d2, dmg, extra) {
    if (this.attackTimer > 0 || d2 > this.meleeReach(t)) return false;
    if (!this.canSee(t)) return false;
    this.attackTimer = 20;
    return this.attackEntity(t, dmg, extra);
  }
  idleLook(game) {
    const p = game.player;
    if (this.lookTimer > 0) return;
    if (p && !p.dead && this.distSqTo(p) < 64 && Math.random() < 0.02) { this.lookAtEntity(p, 40 + this.rnd(40)); this.watching = p; return; }
    if (Math.random() < 0.02) {
      const a = Math.random() * TAU;
      this.lookAtPoint(this.x - Math.sin(a) * 4, this.y + this.eye, this.z - Math.cos(a) * 4, 20 + this.rnd(20));
      this.watching = null;
    }
  }
  keepWatching() { if (this.watching && this.lookTimer > 0) { const p = this.watching; this.lookX = p.x; this.lookY = p.y + p.eye; this.lookZ = p.z; } }
  burnInDaylight() {
    const w = this.world;
    if (!w.isDaytime() || this.inWater) return;
    const bx = Math.floor(this.x), by = Math.floor(this.y + 0.5), bz = Math.floor(this.z);
    const b = lightBrightness(w.getLightLevel(bx, by, bz));
    if (b > 0.5 && Math.random() * 30 < (b - 0.4) * 2 && w.canSeeSky(bx, Math.floor(this.y + this.eye), bz) && !w.isRainingAt(bx, by, bz)) {
      const helmet = this.armor && this.armor[0];
      if (helmet) { helmet.dmg += this.rnd(2); if (helmet.dmg >= maxDamageOf(helmet.id)) this.armor[0] = null; return; }
      this.fire = Math.max(this.fire, 160);
    }
  }
  checkDespawn(game) {
    if (this.persistent || this.dead) return;
    const p = game.player;
    if (!p) return;
    const d2 = this.distSqTo(p);
    if (d2 > 128 * 128) { this.removed = true; return; }
    if (d2 < 32 * 32) this.idleTime = 0;
    else if (++this.idleTime > 600 && Math.random() < 1 / 800) this.removed = true;
    if (this.hostile && this.world.difficulty === 0) this.removed = true;
  }

  // ---------------------------------------------------------------- persistence
  save() {
    const d = super.save();
    d.health = this.health; d.growAge = this.growAge; d.persistent = this.persistent;
    if (this.fire) d.fire = this.fire;
    return d;
  }
  load(d) {
    super.load(d);
    if (d.health !== undefined) this.health = d.health;
    this.growAge = d.growAge || 0;
    if (d.persistent !== undefined) this.persistent = d.persistent;
    this.fire = d.fire || 0;
    this.bodyYaw = this.pbodyYaw = this.headYaw = this.pheadYaw = this.yaw;
    this.onSpawn(false);
  }
  onSpawn() {}
  setBaby() { this.growAge = -24000; this.applySize(); }
  applySize() {}

  // ---------------------------------------------------------------- render helpers
  quadPose(partial) {
    const swing = this.limbSwing - this.limbAmount * (1 - partial);
    const amt = clamp(this.prevLimbAmount + (this.limbAmount - this.prevLimbAmount) * partial, 0, 1);
    const bodyYaw = this.pbodyYaw + wrapRadians(this.bodyYaw - this.pbodyYaw) * partial;
    const headYaw = this.pheadYaw + wrapRadians(this.headYaw - this.pheadYaw) * partial;
    const pitch = this.ppitch + (this.pitch - this.ppitch) * partial;
    const a = Math.cos(swing * 0.6662) * 1.4 * amt, b = Math.cos(swing * 0.6662 + Math.PI) * 1.4 * amt;
    const head = [pitch, wrapRadians(headYaw - bodyYaw), 0];
    return { head: this.baby ? { rot: head, scale: 1.5 } : head, leg0: [a, 0, 0], leg3: [a, 0, 0], leg1: [b, 0, 0], leg2: [b, 0, 0] };
  }
}

// ---------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------
class Monster extends Mob {
  constructor(world, type) {
    super(world, type);
    this.hostile = true; this.category = 'monster';
    this.followRange = 32; this.spotRange = 20;
    this.damage = 3;
  }
  pathWeight(x, y, z) { return 0.5 - lightBrightness(this.world.getLightLevel(x, y, z)); }
  aiTick(game) {
    this.updateTarget(game, this.spotRange, this.followRange);
    const t = this.target;
    if (t) {
      const d2 = this.chase(1.0);
      this.tryMelee(t, d2, this.damage);
      return;
    }
    if (this.pathDone && Math.random() < 1 / 120) this.wander(10, 4, 1.0, (x, y, z) => this.pathWeight(x, y, z));
    this.idleLook(game); this.keepWatching();
  }
  onRevenge(e) { if ((e.type === 'player' && e.survivalLike) || e.type === 'wolf') { this.target = e; this.unseen = 0; } }
  maybeEquip() {
    const d = this.world.difficulty;
    if (Math.random() < [0, 0.01, 0.025, 0.05][d]) {
      const mat = ['leather', 'gold', 'iron', 'iron', 'leather'][this.rnd(5)];
      const n = 1 + this.rnd(4);
      for (let s = 0; s < n; s++) {
        const id = ITEM_IDS[mat + '_' + ARMOR_SLOTS[s]];
        if (id) this.armor[s] = new ItemStack(id, 1, Math.floor(maxDamageOf(id) * (0.2 + Math.random() * 0.6)));
      }
    }
    this.armorItems = this.armor;
  }
  dropEquipment(byPlayer) {
    for (let s = 0; s < 4; s++) if (this.armor[s] && byPlayer && Math.random() < 0.085) Behaviors.dropStack(this.game, this.x, this.y + 0.5, this.z, this.armor[s]);
  }
}

class Zombie extends Monster {
  constructor(world, type) {
    super(world, type || 'zombie');
    this.undead = true;
    this.maxHealth = this.health = 20;
    this.baseSpeed = 0.23; this.damage = 3;
    this.w = 0.6; this.h = 1.95; this.eye = 1.74;
  }
  onSpawn(fresh) {
    if (fresh) {
      this.maybeEquip();
      if (Math.random() < 0.01 * this.world.difficulty) this.held = new ItemStack(Math.random() < 0.33 ? ITEM_IDS.iron_sword : ITEM_IDS.iron_shovel, 1, 0);
    } else this.armorItems = this.armor;
  }
  armorValue() { return 2 + super.armorValue(); }
  mobTick() { if (this.burns !== false) this.burnInDaylight(); }
  attackEntity(e, dmg, extra) {
    let d = dmg;
    if (this.held) { const t = toolOf(this.held.id); if (t) d = t.attack; }
    return super.attackEntity(e, d, extra);
  }
  dropLoot(game, byPlayer) {
    this.drop(ITEM_IDS.rotten_flesh, this.rnd(3));
    if (byPlayer && Math.random() < 0.025) this.drop([ITEM_IDS.iron_ingot, ITEM_IDS.carrot, ITEM_IDS.potato][this.rnd(3)], 1);
    if (this.held && byPlayer && Math.random() < 0.085) this.drop(this.held.id, 1, Math.floor(maxDamageOf(this.held.id) * Math.random() * 0.8));
    this.dropEquipment(byPlayer);
  }
  render(er, rx, ry, rz, partial) { er.drawHumanoid(this, rx, ry, rz, partial, 'zombie', 'zombie'); }
  save() { const d = super.save(); if (this.held) d.held = this.held.toJSON(); d.armor = this.armor.map((a) => a ? a.toJSON() : null); return d; }
  load(d) { super.load(d); if (d.held) this.held = ItemStack.fromJSON(d.held); if (d.armor) this.armor = d.armor.map((a) => a ? ItemStack.fromJSON(a) : null); this.armorItems = this.armor; }
}

class Mummy extends Zombie {
  constructor(world) { super(world, 'mummy'); this.burns = false; this.baseSpeed = 0.22; }
  saySound() { return 'zombie_say'; }
  hurtSound() { return 'zombie_hurt'; }
  deathSound() { return 'zombie_death'; }
  soundPitch() { return (Math.random() - Math.random()) * 0.2 + 0.75; }
  attackEntity(e, dmg, extra) {
    const ok = super.attackEntity(e, dmg, extra);
    if (ok && e.effects) e.effects.hunger = Math.max(e.effects.hunger || 0, 140 * Math.max(1, this.world.difficulty));
    return ok;
  }
  dropLoot(game, byPlayer) {
    this.drop(ITEM_IDS.rotten_flesh, this.rnd(3));
    this.drop(ITEM_IDS.paper, this.rnd(2));
    if (byPlayer && Math.random() < 0.03) this.drop(ITEM_IDS.gold_nugget, 1 + this.rnd(3));
    this.dropEquipment(byPlayer);
  }
  render(er, rx, ry, rz, partial) { er.drawHumanoid(this, rx, ry, rz, partial, 'mummy', 'mummy'); }
}

class Skeleton extends Monster {
  constructor(world) {
    super(world, 'skeleton');
    this.undead = true;
    this.maxHealth = this.health = 20;
    this.baseSpeed = 0.25;
    this.w = 0.6; this.h = 1.99; this.eye = 1.74;
    this.held = new ItemStack(ITEM_IDS.bow, 1, 0);
    this.seeTime = 0; this.shootTimer = -1; this.aiming = false;
  }
  onSpawn(fresh) { if (fresh) this.maybeEquip(); else this.armorItems = this.armor; }
  mobTick() { this.burnInDaylight(); }
  aiTick(game) {
    this.updateTarget(game, 16, this.followRange);
    const t = this.target;
    this.aiming = false;
    if (!t) {
      this.seeTime = 0; this.shootTimer = -1;
      if (this.pathDone && Math.random() < 1 / 120) this.wander(10, 4, 1.0, (x, y, z) => this.pathWeight(x, y, z));
      this.idleLook(game); this.keepWatching();
      return;
    }
    const d2 = this.distanceSq(t.x, t.y, t.z);
    const see = this.canSee(t);
    this.seeTime = see ? this.seeTime + 1 : 0;
    const maxD = 15;
    if (d2 <= maxD * maxD && this.seeTime >= 20) this.clearPath();
    else if (--this.repath <= 0 || !this.path) { this.repath = 10 + this.rnd(10); this.navigateTo(t.x, t.y + 0.01, t.z, 1.0, 40); }
    this.lookAtEntity(t, 2);
    if (see) this.aiming = true;
    if (this.pathDone) this.yaw = approachAngle(this.yaw, Math.atan2(-(t.x - this.x), -(t.z - this.z)), 30 * DEG);
    const d = Math.sqrt(d2);
    if (--this.shootTimer === 0) {
      if (d2 > maxD * maxD || !see) return;
      const f = clamp(d / maxD, 0.1, 1);
      this.shoot(t, f);
      this.shootTimer = Math.floor(f * 40 + 20);
    } else if (this.shootTimer < 0) {
      this.shootTimer = Math.floor(clamp(d / maxD, 0.1, 1) * 40 + 20);
    }
  }
  shoot(t, f) {
    const game = this.game, w = this.world;
    const a = new Arrow(w, this, 1.6, 0);
    const dx = t.x - a.x, dy = t.y + t.h / 3 - a.y, dz = t.z - a.z;
    const hd = Math.sqrt(dx * dx + dz * dz);
    a.shoot(dx, dy + hd * 0.2, dz, 1.6, 14 - w.difficulty * 4);
    a.damage = f * 2 + (Math.random() + Math.random() - 1) * 0.25 + w.difficulty * 0.11;
    if (this.fire > 0) a.fire = true;
    game.spawnEntity(a);
    game.audio.play('bow', 1, 1 / (Math.random() * 0.4 + 0.8), this.x, this.y + this.eye, this.z);
    this.swing();
  }
  dropLoot(game, byPlayer) {
    this.drop(ITEM_IDS.arrow, this.rnd(3));
    this.drop(ITEM_IDS.bone, this.rnd(3));
    if (byPlayer && Math.random() < 0.085) this.drop(ITEM_IDS.bow, 1, Math.floor(maxDamageOf(ITEM_IDS.bow) * Math.random() * 0.8));
    this.dropEquipment(byPlayer);
  }
  render(er, rx, ry, rz, partial) { er.drawHumanoid(this, rx, ry, rz, partial, 'skeleton', 'skeleton'); }
  save() { const d = super.save(); d.armor = this.armor.map((a) => a ? a.toJSON() : null); return d; }
  load(d) { super.load(d); if (d.armor) this.armor = d.armor.map((a) => a ? ItemStack.fromJSON(a) : null); this.armorItems = this.armor; }
}

class Spider extends Monster {
  constructor(world) {
    super(world, 'spider');
    this.arthropod = true;
    this.maxHealth = this.health = 16;
    this.baseSpeed = 0.3; this.damage = 2;
    this.w = 1.4; this.h = 0.9; this.eye = 0.65;
    this.pathNodes = 200;
  }
  onLadder() { return this.collidedH; }
  brightHere() { return lightBrightness(this.world.getLightLevel(Math.floor(this.x), Math.floor(this.y + 0.5), Math.floor(this.z))); }
  aiTick(game) {
    const bright = this.brightHere() > 0.5;
    if (bright && this.target && this.target !== this.attackedBy && Math.random() < 0.01) { this.target = null; this.clearPath(); }
    if (bright && !this.target) {
      // calm in daylight unless provoked
      if (this.attackedBy && this.attackedBy.type === 'player' && this.attackedBy.survivalLike) this.target = this.attackedBy;
    } else this.updateTarget(game, 16, this.followRange);
    const t = this.target;
    if (t) {
      const d2 = this.chase(1.0);
      if (this.onGround && d2 >= 4 && d2 <= 16 && Math.random() < 0.2 && this.canSee(t)) {
        const dx = t.x - this.x, dz = t.z - this.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
        this.vx += dx / d * 0.4 + this.vx * 0.2; this.vz += dz / d * 0.4 + this.vz * 0.2; this.vy = 0.4;
      }
      this.tryMelee(t, d2, this.damage);
      return;
    }
    if (this.pathDone && Math.random() < 1 / 120) this.wander(10, 4, 0.8);
    this.idleLook(game); this.keepWatching();
  }
  dropLoot(game, byPlayer) {
    this.drop(ITEM_IDS.string, this.rnd(3));
    if (byPlayer && Math.random() < 0.33) this.drop(ITEM_IDS.spider_eye, 1);
  }
  render(er, rx, ry, rz, partial) {
    const [sky, blk] = er.lightAt(this.x, this.y + 0.5, this.z);
    const swing = this.limbSwing - this.limbAmount * (1 - partial);
    const amt = clamp(this.prevLimbAmount + (this.limbAmount - this.prevLimbAmount) * partial, 0, 1);
    const bodyYaw = this.pbodyYaw + wrapRadians(this.bodyYaw - this.pbodyYaw) * partial;
    const headYaw = this.pheadYaw + wrapRadians(this.headYaw - this.pheadYaw) * partial;
    const pitch = this.ppitch + (this.pitch - this.ppitch) * partial;
    const pose = { head: [pitch, wrapRadians(headYaw - bodyYaw), 0] };
    const q = Math.PI / 4, e8 = Math.PI / 8;
    const zr = [q, q * 0.74, q * 0.74, q];            // rear -> front tilt
    const yr = [2 * e8, e8, -e8, -2 * e8];           // fan out
    const ph = [0, Math.PI, Math.PI / 2, Math.PI * 1.5];
    for (let i = 0; i < 4; i++) {
      const sy = -Math.cos(swing * 0.6662 * 2 + ph[i]) * 0.4 * amt;
      const sz = Math.abs(Math.sin(swing * 0.6662 + ph[i]) * 0.4) * amt;
      pose['leg' + (i * 2)] = [0, -yr[i] + sy, -zr[i] + sz];      // right side
      pose['leg' + (i * 2 + 1)] = [0, yr[i] - sy, zr[i] - sz];    // left side
    }
    const base = er.baseMatrix(this, rx, ry, rz, partial);
    er.drawModel(MODELS.spider, 'spider', base, pose, er.entColor(this), sky, blk);
    // glowing eyes
    er.drawModel(MODELS.spider, 'spider_eyes', base, pose, [255, 255, 255, 255], -1, 0, { only: ['head'], inflate: 0.02 });
  }
}

class Boomcap extends Monster {
  constructor(world) {
    super(world, 'boomcap');
    this.maxHealth = this.health = 20;
    this.baseSpeed = 0.25;
    this.w = 0.6; this.h = 1.1; this.eye = 0.9;
    this.fuse = 0; this.pfuse = 0; this.fuseTime = 30; this.fuseState = -1; this.power = 3;
  }
  aiTick(game) {
    this.updateTarget(game, 16, this.followRange);
    const t = this.target;
    if (t) {
      const d2 = this.distanceSq(t.x, t.y, t.z);
      if (this.fuseState > 0 || d2 < 9) {
        this.clearPath(); this.lookAtEntity(t, 2);
        this.fuseState = (d2 > 49 || !this.canSee(t)) ? -1 : 1;
      } else { this.fuseState = -1; this.chase(1.0); }
      return;
    }
    this.fuseState = -1;
    if (this.pathDone && Math.random() < 1 / 120) this.wander(10, 4, 0.8, (x, y, z) => this.pathWeight(x, y, z));
    this.idleLook(game); this.keepWatching();
  }
  mobTick(game) {
    this.pfuse = this.fuse;
    if (this.fuseState > 0 && this.fuse === 0) game.audio.play('fuse', 1, 0.5, this.x, this.y, this.z);
    this.fuse = clamp(this.fuse + this.fuseState, 0, this.fuseTime);
    if (this.fuse >= this.fuseTime) this.explode(game);
  }
  explode(game) {
    this.removed = true; this.dead = true;
    const w = this.world;
    Behaviors.explode(game, this.x, this.y + 0.5, this.z, this.power, { type: 'boomcap', entity: this }, false);
    // scatter spores: a few mushrooms sprout in the blast area
    if (w.gameRules.mobGriefing) {
      for (let i = 0; i < 10; i++) {
        const x = Math.floor(this.x + (Math.random() - 0.5) * 8), z = Math.floor(this.z + (Math.random() - 0.5) * 8);
        for (let y = Math.floor(this.y) + 2; y > Math.floor(this.y) - 4; y--) {
          if (w.getBlock(x, y, z) === 0 && BT.opaque[w.getBlock(x, y - 1, z)] && w.getLightLevel(x, y, z) < 13) {
            if (Math.random() < 0.5) w.setBlock(x, y, z, Math.random() < 0.6 ? B.MUSHROOM_RED : B.MUSHROOM_BROWN, 0);
            break;
          }
        }
      }
    }
  }
  dropLoot() { this.drop(ITEM_IDS.gunpowder, this.rnd(3)); if (Math.random() < 0.2) this.drop(B.MUSHROOM_RED, 1); }
  render(er, rx, ry, rz, partial) {
    const [sky, blk] = er.lightAt(this.x, this.y + 0.8, this.z);
    let f = clamp((this.pfuse + (this.fuse - this.pfuse) * partial) / (this.fuseTime - 2), 0, 1);
    const wob = 1 + Math.sin(f * 100) * f * 0.01;
    let k = f * f; k *= k;
    const sxz = (1 + k * 0.4) * wob, sy = (1 + k * 0.1) / wob;
    const base = M3.mul(er.baseMatrix(this, rx, ry, rz, partial), M3.scale(sxz, sy, sxz));
    const swing = this.limbSwing - this.limbAmount * (1 - partial);
    const amt = clamp(this.prevLimbAmount + (this.limbAmount - this.prevLimbAmount) * partial, 0, 1);
    const a = Math.cos(swing * 0.6662) * 1.4 * amt, b = Math.cos(swing * 0.6662 + Math.PI) * 1.4 * amt;
    const t = this.age + partial;
    const pose = { leg0: [a, 0, 0], leg3: [a, 0, 0], leg1: [b, 0, 0], leg2: [b, 0, 0], cap: [Math.sin(t * 0.1) * 0.03, 0, Math.cos(t * 0.13) * 0.03] };
    const flash = (Math.floor(f * 10) % 2 === 1) ? 0.25 + f * 0.4 : 0;
    er.drawModel(MODELS.boomcap, 'boomcap', base, pose, er.entColor(this), sky, blk, { flash });
  }
}

class Slime extends Monster {
  constructor(world) {
    super(world, 'slime');
    this.size = 1; this.squish = 0; this.psquish = 0; this.squishTarget = 0; this.jumpDelay = 0;
    this.wasOnGround = false; this.slimeYaw = Math.random() * TAU;
    this.setSize(1 << Math.floor(Math.random() * 3));
    this.talkInterval = 1e9;
  }
  setSize(s) {
    this.size = s;
    this.w = this.h = 0.51 * s; this.eye = 0.625 * this.h;
    this.maxHealth = this.health = s * s;
    this.baseSpeed = 0.2 + 0.1 * s;
    this.xpValue = s;
    this.updateBox();
  }
  aiTick(game) {
    this.updateTarget(game, 16, 24);
    const t = this.target;
    if (t) { this.slimeYaw = Math.atan2(-(t.x - this.x), -(t.z - this.z)); this.lookAtEntity(t, 2); }
    else if (Math.random() < 0.02) this.slimeYaw = Math.random() * TAU;
    this.yaw = approachAngle(this.yaw, this.slimeYaw, 10 * DEG);
    if (this.onGround) {
      if (this.jumpDelay-- <= 0) {
        this.jumpDelay = this.rnd(20) + 10;
        if (t) this.jumpDelay = Math.floor(this.jumpDelay / 3);
        this.jumping = true;
        this.game.audio.play('slime', 0.4 * Math.min(2, this.size), ((Math.random() - Math.random()) * 0.2 + 1) * (this.size === 1 ? 1.3 : this.size === 2 ? 1 : 0.7), this.x, this.y, this.z);
        this.setMove(1);
      } else this.stopMoving();
    } else this.setMove(1);
    if (this.inWater || this.inLava) this.jumping = true;
    // squash contact damage
    if (t && this.size > 1 && this.attackTimer <= 0) {
      const r = 0.6 * this.size + 0.3;
      if (this.distSqTo(t) < r * r && this.canSee(t)) { this.attackTimer = 10; this.attackEntity(t, this.size); }
    }
  }
  jump() { this.vy = 0.42; }
  mobTick(game) {
    this.psquish = this.squish;
    this.squish += (this.squishTarget - this.squish) * 0.5;
    if (this.onGround && !this.wasOnGround) {
      this.squishTarget = -0.5;
      const L = game.particles.layer('slimeball');
      for (let i = 0; i < this.size * 8; i++) {
        const a = Math.random() * TAU, r = Math.random() * 0.5 + 0.5;
        game.particles.add({ x: this.x + Math.sin(a) * this.size * 0.5 * r, y: this.y + 0.1, z: this.z + Math.cos(a) * this.size * 0.5 * r, vx: 0, vy: 0.05, vz: 0, size: 0.07, life: 8 + this.rnd(6), gravity: 0.04, layer: L, u0: 0.3, v0: 0.3, u1: 0.6, v1: 0.6, lit: true });
      }
    } else if (!this.onGround && this.wasOnGround) this.squishTarget = 1;
    this.squishTarget *= 0.6;
    this.wasOnGround = this.onGround;
  }
  onDeath(src) {
    super.onDeath(src);
    if (this.size > 1) {
      const n = 2 + this.rnd(3);
      for (let i = 0; i < n; i++) {
        const s = new Slime(this.world);
        s.setSize(this.size / 2);
        s.setPos(this.x + ((i % 2) - 0.5) * this.size / 4, this.y + 0.5, this.z + ((i >> 1) - 0.5) * this.size / 4);
        s.yaw = Math.random() * TAU;
        this.game.spawnEntity(s);
      }
    }
  }
  dropLoot() { if (this.size === 1) this.drop(ITEM_IDS.slimeball, this.rnd(3)); }
  hurtSound() { return 'slime'; }
  deathSound() { return 'slime'; }
  render(er, rx, ry, rz, partial) {
    const s = this.size;
    const sq = (this.psquish + (this.squish - this.psquish) * partial) / (s * 0.5 + 1);
    const f3 = 1 / (sq + 1);
    const base = M3.mul(er.baseMatrix(this, rx, ry, rz, partial), M3.scale(f3 * s, (1 / f3) * s, f3 * s));
    const [sky, blk] = er.lightAt(this.x, this.y + this.h / 2, this.z);
    const col = er.entColor(this);
    er.drawModel(MODELS.slime, 'slime', base, {}, col, sky, blk, { only: ['inner'] });
    er.later(() => er.drawModel(MODELS.slime, 'slime', base, {}, col, sky, blk, { only: ['outer'] }));
  }
  save() { const d = super.save(); d.size = this.size; return d; }
  load(d) { super.load(d); this.setSize(d.size || 1); if (d.health !== undefined) this.health = d.health; }
}

// A cold night spirit that flies
class Wraith extends Monster {
  constructor(world) {
    super(world, 'wraith');
    this.undead = true;
    this.maxHealth = this.health = 14;
    this.w = 0.6; this.h = 1.8; this.eye = 1.6;
    this.noGravity = true; this.swims = false;
    this.damage = 4;
    this.mode = 'circle'; this.modeTimer = 0;
    this.anchor = null; this.circleAng = Math.random() * TAU;
    this.talkInterval = 120;
    this.fireImmune = false;
  }
  travel() {
    this.move(this.vx, this.vy, this.vz);
    this.vx *= 0.91; this.vy *= 0.91; this.vz *= 0.91;
    this.fallDistance = 0;
  }
  aiTick(game) {
    const w = this.world;
    if (!this.anchor) this.anchor = [this.x, this.y, this.z];
    this.updateTarget(game, 28, 40);
    const t = this.target;
    let goal;
    if (t) {
      this.lookAtEntity(t, 2);
      if (this.mode === 'swoop') {
        goal = [t.x, t.y + 1, t.z];
        const d2 = this.distanceSq(t.x, t.y + 0.5, t.z);
        if (d2 < 2.2 && this.attackTimer <= 0) {
          this.attackTimer = 20;
          if (this.attackEntity(t, this.damage) && t.effects) t.effects.slow = Math.max(t.effects.slow || 0, 60 + 40 * w.difficulty);
          this.mode = 'retreat'; this.modeTimer = 40;
        }
        if (--this.modeTimer <= 0) { this.mode = 'retreat'; this.modeTimer = 30; }
      } else if (this.mode === 'retreat') {
        goal = [this.x + (this.x - t.x), t.y + 7, this.z + (this.z - t.z)];
        if (--this.modeTimer <= 0) { this.mode = 'circle'; this.modeTimer = 60 + this.rnd(80); }
      } else {
        this.circleAng += 0.04;
        goal = [t.x + Math.sin(this.circleAng) * 9, t.y + 5 + Math.sin(this.age * 0.05), t.z + Math.cos(this.circleAng) * 9];
        if (--this.modeTimer <= 0 && this.canSee(t)) { this.mode = 'swoop'; this.modeTimer = 80; game.audio.play('wraith_say', 1.2, 0.8, this.x, this.y, this.z); }
      }
    } else {
      this.circleAng += 0.015;
      const ground = w.topSolidY(Math.floor(this.anchor[0]), Math.floor(this.anchor[2]));
      goal = [this.anchor[0] + Math.sin(this.circleAng) * 6, Math.max(ground + 4, this.anchor[1]), this.anchor[2] + Math.cos(this.circleAng) * 6];
      this.idleLook(game);
    }
    const dx = goal[0] - this.x, dy = goal[1] - this.y, dz = goal[2] - this.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const acc = this.mode === 'swoop' && t ? 0.05 : 0.025;
    this.vx += dx / d * acc; this.vy += dy / d * acc; this.vz += dz / d * acc;
    const sp = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
    if (sp > 0.01) this.yaw = approachAngle(this.yaw, Math.atan2(-this.vx, -this.vz), 15 * DEG);
  }
  mobTick(game) {
    // fades at dawn
    if (this.world.isDaytime() && this.world.canSeeSky(Math.floor(this.x), Math.floor(this.y + 1), Math.floor(this.z))) {
      if (Math.random() < 0.05) { game.particles.sparkle(this.x, this.y + 1, this.z, 0.7, 0.85, 1, 12, 1.2); this.removed = true; }
    }
    if (this.age % 3 === 0) game.particles.sparkle(this.x, this.y + 0.3, this.z, 0.6, 0.75, 0.9, 1, 0.5);
  }
  hurt(amount, src) { if (src && src.type === 'fall') return false; return super.hurt(amount, src); }
  dropLoot(game, byPlayer) { this.drop(ITEM_IDS.string, 1 + this.rnd(2)); if (byPlayer && Math.random() < 0.15) this.drop(ITEM_IDS.lumite_shard, 1); }
  soundPitch() { return (Math.random() - Math.random()) * 0.15 + 0.9; }
  render(er, rx, ry, rz, partial) {
    const bob = Math.sin((this.age + partial) * 0.08) * 0.08;
    er.later(() => er.drawHumanoid(this, rx, ry, rz, partial, 'wraith', 'wraith', { yOff: bob, alpha: 215 }));
  }
}

// ---------------------------------------------------------------------------
// Animals
// ---------------------------------------------------------------------------
class Animal extends Mob {
  constructor(world, type) {
    super(world, type);
    this.category = 'creature'; this.persistent = true;
    this.xpValue = () => 1 + this.rnd(3);
    this.love = 0; this.loveCooldown = 0; this.breedTimer = 0; this.mate = null;
    this.panic = 0; this.panicSpeed = 1.25; this.temptSpeed = 1.2;
    this.tempting = false;
  }
  isBreedItem() { return false; }
  isTemptItem(s) { return this.isBreedItem(s); }
  pathWeight(x, y, z) { return this.world.getBlock(x, y - 1, z) === B.GRASS ? 10 : lightBrightness(this.world.getLightLevel(x, y, z)) - 0.5; }
  onRevenge() { this.panic = 60 + this.rnd(60); this.clearPath(); }
  applySize() { if (this.adultW === undefined) { this.adultW = this.w; this.adultH = this.h; this.adultEye = this.eye; } const k = this.baby ? 0.5 : 1; this.w = this.adultW * k; this.h = this.adultH * k; this.eye = this.adultEye * k; this.updateBox(); }
  interact(player, held) {
    if (held && this.isBreedItem(held)) {
      const game = this.game;
      if (this.baby) {
        this.growAge = Math.min(0, this.growAge + Math.floor(-this.growAge / 10));
        if (!player.creative) player.inventory.decrementHeld(1);
        game.particles.happy(this.x, this.y + this.h, this.z);
        return true;
      }
      if (this.love <= 0 && this.loveCooldown <= 0) {
        this.love = 600;
        if (!player.creative) player.inventory.decrementHeld(1);
        game.particles.hearts(this.x, this.y + this.h, this.z, 6);
        return true;
      }
    }
    return false;
  }
  aiTick(game) {
    const p = game.player;
    if (this.loveCooldown > 0) this.loveCooldown--;
    if (this.fire > 0 && this.panic <= 0 && !this.brave) this.panic = 40;
    // panic
    if (this.panic > 0) {
      this.panic--;
      if (this.pathDone) this.wander(5, 4, this.panicSpeed);
      return;
    }
    // breeding
    if (this.love > 0) {
      this.love--;
      if (this.age % 10 === 0) game.particles.hearts(this.x, this.y + this.h, this.z, 1);
      if (!this.mate || this.mate.removed || this.mate.dead || this.mate.love <= 0) {
        this.mate = null;
        let best = null, bd = 64;
        for (const e of this.world.entitiesInBox(this.x - 8, this.y - 4, this.z - 8, this.x + 8, this.y + 4, this.z + 8)) {
          if (e === this || e.type !== this.type || e.love <= 0 || e.baby || e.dead) continue;
          const d = this.distSqTo(e); if (d < bd) { bd = d; best = e; }
        }
        this.mate = best;
      }
      if (this.mate) {
        const m = this.mate;
        this.lookAtEntity(m, 2);
        const d2 = this.distSqTo(m);
        if (d2 > 4 && (--this.repath <= 0 || this.pathDone)) { this.repath = 10; this.navigateTo(m.x, m.y, m.z, 1.0, 12); }
        if (d2 < 9 && ++this.breedTimer >= 60) this.breed(game, m);
        return;
      }
    }
    // tempted by food in the player's hand
    this.tempting = false;
    if (p && !p.dead) {
      const h = p.inventory.held();
      if (h && this.isTemptItem(h) && this.distSqTo(p) < 100) {
        this.tempting = true;
        this.lookAtEntity(p, 2);
        if (this.distSqTo(p) > 6.25) { if (--this.repath <= 0 || this.pathDone) { this.repath = 10; this.navigateTo(p.x, p.y, p.z, this.temptSpeed, 14); } }
        else this.clearPath();
        return;
      }
    }
    if (this.special && this.special(game)) return;
    // babies follow a parent
    if (this.baby && this.age % 20 === 0) {
      let best = null, bd = 64;
      for (const e of this.world.entitiesInBox(this.x - 8, this.y - 4, this.z - 8, this.x + 8, this.y + 4, this.z + 8)) {
        if (e === this || e.type !== this.type || e.baby) continue;
        const d = this.distSqTo(e); if (d < bd) { bd = d; best = e; }
      }
      if (best && bd > 9) this.navigateTo(best.x, best.y, best.z, 1.1, 12);
    }
    if (this.pathDone && Math.random() < 1 / 120) this.wander(10, 7, 1.0, (x, y, z) => this.pathWeight(x, y, z));
    this.idleLook(game); this.keepWatching();
  }
  breed(game, m) {
    this.breedTimer = 0; m.breedTimer = 0;
    this.love = 0; m.love = 0; this.loveCooldown = 6000; m.loveCooldown = 6000;
    this.mate = null; m.mate = null;
    const baby = createMob(this.type, this.world);
    if (baby.inheritFrom) baby.inheritFrom(this, m);
    baby.setBaby();
    baby.setPos(this.x, this.y, this.z);
    baby.yaw = Math.random() * TAU;
    game.spawnEntity(baby);
    game.particles.hearts(this.x, this.y + this.h, this.z, 7);
    game.spawnXP(this.x, this.y + 0.5, this.z, 1 + this.rnd(7));
    if (game.onBred) game.onBred(this);
  }
  cooked(raw, cooked) { return this.fire > 0 ? cooked : raw; }
  save() { const d = super.save(); if (this.loveCooldown) d.loveCooldown = this.loveCooldown; return d; }
  load(d) { super.load(d); this.loveCooldown = d.loveCooldown || 0; this.applySize(); }
}

class Pig extends Animal {
  constructor(world) { super(world, 'pig'); this.maxHealth = this.health = 10; this.baseSpeed = 0.25; this.w = 0.9; this.h = 0.9; this.eye = 0.75; this.applySize(); }
  isBreedItem(s) { return s.id === ITEM_IDS.carrot || s.id === ITEM_IDS.potato; }
  dropLoot() { if (!this.baby) this.drop(this.cooked(ITEM_IDS.porkchop, ITEM_IDS.cooked_porkchop), 1 + this.rnd(3)); }
  render(er, rx, ry, rz, partial) {
    const [sky, blk] = er.lightAt(this.x, this.y + 0.5, this.z);
    er.drawModel(MODELS.quadPig, 'pig', er.baseMatrix(this, rx, ry, rz, partial, this.baby ? 0.5 : 1), this.quadPose(partial), er.entColor(this), sky, blk);
  }
}

class Cow extends Animal {
  constructor(world) { super(world, 'cow'); this.maxHealth = this.health = 10; this.baseSpeed = 0.2; this.panicSpeed = 2.0; this.temptSpeed = 1.25; this.w = 0.9; this.h = 1.3; this.eye = 1.2; this.talkInterval = 120; this.applySize(); }
  isBreedItem(s) { return s.id === ITEM_IDS.wheat; }
  interact(player, held) {
    if (held && held.id === ITEM_IDS.bucket && !this.baby) {
      const milk = new ItemStack(ITEM_IDS.milk_bucket, 1, 0);
      if (player.creative) { /* keep bucket */ }
      else if (held.count <= 1) player.inventory.setHeld(milk);
      else { player.inventory.decrementHeld(1); this.game.giveItem(milk); }
      this.game.audio.play('bucket_fill', 0.8);
      return true;
    }
    return super.interact(player, held);
  }
  dropLoot() { if (this.baby) return; this.drop(ITEM_IDS.leather, this.rnd(3)); this.drop(this.cooked(ITEM_IDS.beef, ITEM_IDS.steak), 1 + this.rnd(3)); }
  soundVolume() { return 0.4; }
  render(er, rx, ry, rz, partial) {
    const [sky, blk] = er.lightAt(this.x, this.y + 0.7, this.z);
    er.drawModel(MODELS.quadCow, 'cow', er.baseMatrix(this, rx, ry, rz, partial, this.baby ? 0.5 : 1), this.quadPose(partial), er.entColor(this), sky, blk);
  }
}

class Sheep extends Animal {
  constructor(world) {
    super(world, 'sheep'); this.maxHealth = this.health = 8; this.baseSpeed = 0.23; this.temptSpeed = 1.1;
    this.w = 0.9; this.h = 1.3; this.eye = 1.1;
    this.color = 0; this.sheared = false; this.eatTimer = 0;
    this.applySize();
  }
  onSpawn(fresh, extra) {
    if (fresh) {
      if (extra && extra.color !== undefined) this.color = extra.color;
      else { const r = this.rnd(100); this.color = r < 81 ? 0 : r < 86 ? 7 : r < 91 ? 8 : r < 96 ? 15 : r < 99 ? 12 : 6; }
    }
  }
  inheritFrom(a, b) { this.color = Math.random() < 0.5 ? a.color : b.color; }
  isBreedItem(s) { return s.id === ITEM_IDS.wheat; }
  interact(player, held) {
    const game = this.game;
    if (held && held.id === ITEM_IDS.shears && !this.sheared && !this.baby) {
      this.sheared = true;
      const n = 1 + this.rnd(3);
      for (let i = 0; i < n; i++) {
        const e = new ItemEntity(this.world, this.x, this.y + 1, this.z, new ItemStack(B.WOOL, 1, this.color));
        e.vy += Math.random() * 0.05; e.vx += (Math.random() - Math.random()) * 0.1; e.vz += (Math.random() - Math.random()) * 0.1;
        game.spawnEntity(e);
      }
      if (!player.creative) player.inventory.damageHeld(player, 1);
      game.audio.play('cloth_break', 1, 1, this.x, this.y, this.z);
      return true;
    }
    if (held && held.id === ITEM_IDS.dye && !this.sheared) {
      if (held.dmg !== this.color) { this.color = held.dmg; if (!player.creative) player.inventory.decrementHeld(1); return true; }
      return false;
    }
    return super.interact(player, held);
  }
  special(game) {
    // graze
    if (this.eatTimer > 0) {
      this.eatTimer--;
      this.clearPath();
      if (this.eatTimer === 4) {
        const x = Math.floor(this.x), y = Math.floor(this.y), z = Math.floor(this.z);
        const w = this.world;
        if (w.getBlock(x, y, z) === B.TALL_GRASS) { if (w.gameRules.mobGriefing) w.setBlock(x, y, z, 0, 0); this.ateGrass(); }
        else if (w.getBlock(x, y - 1, z) === B.GRASS) { game.particles.breakBlock(x, y - 1, z, B.GRASS, 0); if (w.gameRules.mobGriefing) w.setBlock(x, y - 1, z, B.DIRT, 0); this.ateGrass(); }
      }
      return true;
    }
    if (Math.random() < (this.baby ? 1 / 50 : 1 / 1000)) {
      const x = Math.floor(this.x), y = Math.floor(this.y), z = Math.floor(this.z);
      if (this.world.getBlock(x, y, z) === B.TALL_GRASS || this.world.getBlock(x, y - 1, z) === B.GRASS) { this.eatTimer = 40; return true; }
    }
    return false;
  }
  ateGrass() { this.sheared = false; if (this.baby) this.growAge = Math.min(0, this.growAge + 60 * 20); }
  dropLoot() { if (!this.sheared && !this.baby) this.drop(B.WOOL, 1, this.color); if (!this.baby) this.drop(this.cooked(ITEM_IDS.mutton, ITEM_IDS.cooked_mutton), 1 + this.rnd(2)); }
  soundVolume() { return 0.4; }
  render(er, rx, ry, rz, partial) {
    const [sky, blk] = er.lightAt(this.x, this.y + 0.7, this.z);
    const pose = this.quadPose(partial);
    // grazing: head dips to the ground
    if (this.eatTimer > 0) {
      const t = this.eatTimer - partial;
      const k = t > 4 && t <= 36 ? 1 : (t <= 0 ? 0 : (t < 4 ? t / 4 : (40 - t) / 4));
      const hp = k * 0.9 + (t > 4 && t <= 36 ? Math.sin(t * 0.7) * 0.15 : 0);
      const h = Array.isArray(pose.head) ? pose.head : pose.head.rot;
      h[0] = -hp * 1.2;
      const off = [0, -k * 5, 0];
      pose.head = { rot: h, off, scale: this.baby ? 1.5 : undefined };
    }
    const base = er.baseMatrix(this, rx, ry, rz, partial, this.baby ? 0.5 : 1);
    const col = er.entColor(this);
    er.drawModel(MODELS.quadSheep, 'sheep', base, pose, col, sky, blk);
    if (!this.sheared) {
      const c = hexToRgb(COLOR_RGB[this.color] || '#ffffff');
      const wc = [c[0] * col[0] / 255, c[1] * col[1] / 255, c[2] * col[2] / 255, 255];
      er.drawModel(MODELS.quadSheep, 'sheep_wool', base, pose, wc, sky, blk, { only: ['body'], inflate: 1.75 });
      er.drawModel(MODELS.quadSheep, 'sheep_wool', base, pose, wc, sky, blk, { only: ['head'], inflate: 0.6 });
      er.drawModel(MODELS.quadSheep, 'sheep_wool', base, pose, wc, sky, blk, { only: ['leg0', 'leg1', 'leg2', 'leg3'], inflate: 0.5 });
    }
  }
  save() { const d = super.save(); d.color = this.color; d.sheared = this.sheared; return d; }
  load(d) { super.load(d); this.color = d.color || 0; this.sheared = !!d.sheared; }
}

class Chicken extends Animal {
  constructor(world) {
    super(world, 'chicken'); this.maxHealth = this.health = 4; this.baseSpeed = 0.25; this.panicSpeed = 1.4; this.temptSpeed = 1.0;
    this.w = 0.4; this.h = 0.7; this.eye = 0.6;
    this.eggTimer = 6000 + this.rnd(6000);
    this.flap = 0; this.pflap = 0; this.flapAmt = 0; this.pflapAmt = 0;
    this.applySize();
  }
  isBreedItem(s) { return s.id === ITEM_IDS.seeds; }
  mobTick(game) {
    this.pflap = this.flap; this.pflapAmt = this.flapAmt;
    this.flapAmt = clamp(this.flapAmt + (this.onGround ? -0.3 : 1.2), 0, 1);
    if (!this.onGround) this.flap += 1.6;
    if (!this.onGround && this.vy < 0) this.vy *= 0.6;
    this.fallDistance = 0;
    if (!this.baby && --this.eggTimer <= 0) {
      game.audio.play('chicken_hurt', 0.6, (Math.random() - Math.random()) * 0.2 + 1.2, this.x, this.y, this.z);
      this.drop(ITEM_IDS.egg, 1);
      this.eggTimer = 6000 + this.rnd(6000);
    }
  }
  xpValue() { return 1 + this.rnd(3); }
  dropLoot() { if (this.baby) return; this.drop(ITEM_IDS.feather, this.rnd(3)); this.drop(this.cooked(ITEM_IDS.chicken, ITEM_IDS.cooked_chicken), 1); }
  render(er, rx, ry, rz, partial) {
    const [sky, blk] = er.lightAt(this.x, this.y + 0.4, this.z);
    const swing = this.limbSwing - this.limbAmount * (1 - partial);
    const amt = clamp(this.prevLimbAmount + (this.limbAmount - this.prevLimbAmount) * partial, 0, 1);
    const bodyYaw = this.pbodyYaw + wrapRadians(this.bodyYaw - this.pbodyYaw) * partial;
    const headYaw = this.pheadYaw + wrapRadians(this.headYaw - this.pheadYaw) * partial;
    const pitch = this.ppitch + (this.pitch - this.ppitch) * partial;
    const fl = this.pflap + (this.flap - this.pflap) * partial;
    const fa = this.pflapAmt + (this.flapAmt - this.pflapAmt) * partial;
    const wing = (Math.sin(fl) + 1) * fa;
    const head = [pitch, wrapRadians(headYaw - bodyYaw), 0];
    const pose = {
      head: this.baby ? { rot: head, scale: 1.4 } : head,
      rleg: [Math.cos(swing * 0.6662) * 1.4 * amt, 0, 0], lleg: [Math.cos(swing * 0.6662 + Math.PI) * 1.4 * amt, 0, 0],
      rwing: [0, 0, wing], lwing: [0, 0, -wing],
    };
    er.drawModel(MODELS.chicken, 'chicken', er.baseMatrix(this, rx, ry, rz, partial, this.baby ? 0.5 : 1), pose, er.entColor(this), sky, blk);
  }
  save() { const d = super.save(); d.eggTimer = this.eggTimer; return d; }
  load(d) { super.load(d); if (d.eggTimer) this.eggTimer = d.eggTimer; }
}

class Deer extends Animal {
  constructor(world) {
    super(world, 'deer'); this.maxHealth = this.health = 10; this.baseSpeed = 0.28; this.panicSpeed = 1.7; this.temptSpeed = 0.9;
    this.w = 0.8; this.h = 1.4; this.eye = 1.3;
    this.male = Math.random() < 0.5;
    this.flee = 0;
    this.talkInterval = 200;
    this.applySize();
  }
  isBreedItem(s) { return s.id === ITEM_IDS.berries || s.id === ITEM_IDS.apple; }
  special(game) {
    const p = game.player;
    if (!p || p.dead || p.creative) return false;
    if (this.flee > 0) { this.flee--; if (this.pathDone) this.fleeFrom(p); return true; }
    const d2 = this.distSqTo(p);
    const wary = p.sneaking ? 9 : (p.sprinting ? 144 : 49);
    if (d2 < wary && this.canSee(p)) { this.flee = 40 + this.rnd(40); this.fleeFrom(p); return true; }
    return false;
  }
  fleeFrom(p) {
    const dx = this.x - p.x, dz = this.z - p.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    const tx = this.x + dx / d * 10 + (Math.random() - 0.5) * 6, tz = this.z + dz / d * 10 + (Math.random() - 0.5) * 6;
    for (let dy = 4; dy >= -4; dy--) {
      const y = Math.floor(this.y) + dy;
      if (PathFinder.valid(this.world, Math.floor(tx), y, Math.floor(tz), 2)) { this.navigateTo(tx, y, tz, this.panicSpeed, 16); return; }
    }
    this.wander(8, 4, this.panicSpeed);
  }
  onRevenge(e) { super.onRevenge(e); this.flee = 100; }
  dropLoot() { if (this.baby) return; this.drop(ITEM_IDS.leather, this.rnd(2)); this.drop(this.cooked(ITEM_IDS.venison, ITEM_IDS.cooked_venison), 1 + this.rnd(3)); }
  soundVolume() { return 0.5; }
  render(er, rx, ry, rz, partial) {
    const [sky, blk] = er.lightAt(this.x, this.y + 0.7, this.z);
    const pose = this.quadPose(partial);
    const t = this.age + partial;
    pose.tail = [Math.sin(t * 0.3) * 0.15, 0, 0];
    er.drawModel(MODELS.deer, 'deer', er.baseMatrix(this, rx, ry, rz, partial, this.baby ? 0.5 : 1), pose, er.entColor(this), sky, blk, { antlers: this.male && !this.baby });
  }
  save() { const d = super.save(); d.male = this.male; return d; }
  load(d) { super.load(d); this.male = !!d.male; }
}

// ---------------------------------------------------------------------------
// Wolves: packs in the woods; tame one with bones and it stays by your side
// ---------------------------------------------------------------------------
const WOLF_MEAT = ['porkchop', 'cooked_porkchop', 'beef', 'steak', 'chicken', 'cooked_chicken', 'mutton', 'cooked_mutton', 'rotten_flesh', 'venison', 'cooked_venison', 'jerky'];
class Wolf extends Animal {
  constructor(world) {
    super(world, 'wolf');
    this.maxHealth = this.health = 8;
    this.baseSpeed = 0.3; this.temptSpeed = 1.0; this.brave = true;
    this.w = 0.6; this.h = 0.85; this.eye = 0.68;
    this.tamed = false; this.sitting = false; this.angry = false; this.collar = 14;
    this.following = false; this.begging = false;
    this.interest = 0; this.pinterest = 0;
    this.wet = false; this.shaking = false; this.shakeT = 0; this.pshakeT = 0;
    this.talkInterval = 80;
    this.applySize();
  }
  setTamed(t) { this.tamed = t; this.maxHealth = t ? 20 : 8; if (this.health > this.maxHealth) this.health = this.maxHealth; }
  setTarget(e) { this.target = e; this.unseen = 0; this.angry = !!e && !this.tamed; if (!e) this.clearPath(); }
  isMeat(s) { return WOLF_MEAT.some((k) => ITEM_IDS[k] === s.id); }
  isBreedItem(s) { return this.tamed && this.isMeat(s); }
  isTemptItem() { return false; }
  // tamed wolves are never a threat to their owner; mobs only bite half as hard
  hurt(amount, src) {
    if (src && src.entity && src.entity.type !== 'player' && src.type !== 'arrow') amount = (amount + 1) / 2;
    const ok = super.hurt(amount, src);
    if (ok) this.sitting = false;
    return ok;
  }
  onRevenge(e) {
    if (!e || e === this || e.dead) return;
    if (e.type === 'player' && (this.tamed || !e.survivalLike)) return;
    if (e.type === 'wolf' && e.tamed && this.tamed) return;
    this.setTarget(e);
    // the pack answers
    for (const o of this.world.entitiesInBox(this.x - 16, this.y - 10, this.z - 16, this.x + 16, this.y + 10, this.z + 16)) {
      if (o !== this && o.type === 'wolf' && !o.dead && !o.target && o.tamed === this.tamed && !o.sitting) o.setTarget(e);
    }
  }
  interact(player, held) {
    const g = this.game;
    if (this.tamed) {
      if (held && this.isMeat(held) && this.health < this.maxHealth) {
        this.heal(foodOf(held.id).hunger);
        if (!player.creative) player.inventory.decrementHeld(1);
        g.audio.play('eat', 0.5, 1.2, this.x, this.y + this.eye, this.z);
        return true;
      }
      if (held && held.id === ITEM_IDS.dye) {
        if ((held.dmg & 15) !== this.collar) { this.collar = held.dmg & 15; if (!player.creative) player.inventory.decrementHeld(1); return true; }
        return false;
      }
      if (held && this.isBreedItem(held)) return super.interact(player, held);
      this.sitting = !this.sitting;
      this.jumping = false; this.following = false;
      this.setTarget(null);
      return true;
    }
    if (held && held.id === ITEM_IDS.bone && !this.angry) {
      if (!player.creative) player.inventory.decrementHeld(1);
      if (Math.random() < 1 / 3) {
        this.setTamed(true);
        this.health = this.maxHealth;
        this.sitting = true;
        this.setTarget(null);
        g.particles.hearts(this.x, this.y + this.h, this.z, 7);
        g.achieve('tame');
      } else g.particles.smoke(this.x, this.y + this.h, this.z, 7);
      return true;
    }
    return false;
  }
  inheritFrom(a, b) { this.setTamed(true); this.health = this.maxHealth; this.collar = Math.random() < 0.5 ? a.collar : b.collar; }
  // keep up with the owner: hop to a free spot next to them when too far behind
  teleportTo(p) {
    if (this.riding) return false;
    const w = this.world, bx = Math.floor(p.x) - 2, bz = Math.floor(p.z) - 2, by = Math.floor(p.y);
    for (let l = 0; l <= 4; l++) for (let m = 0; m <= 4; m++) {
      if (l >= 1 && m >= 1 && l <= 3 && m <= 3) continue;
      const x = bx + l, z = bz + m;
      const below = w.getBlock(x, by - 1, z);
      if (!BT.solid[below] || !BT.opaque[below] || BT.solid[w.getBlock(x, by, z)] || BT.solid[w.getBlock(x, by + 1, z)] || BT.fluid[w.getBlock(x, by, z)]) continue;
      this.setPos(x + 0.5, by, z + 0.5);
      this.clearPath(); this.vx = this.vy = this.vz = 0; this.fallDistance = 0;
      return true;
    }
    return false;
  }
  findTarget() {
    const w = this.world;
    const near = (type, r, pred) => {
      let best = null, bd = r * r;
      for (const e of w.entitiesInBox(this.x - r, this.y - 4, this.z - r, this.x + r, this.y + 4, this.z + r)) {
        if (e.type !== type || e.dead || (pred && !pred(e))) continue;
        const d = this.distSqTo(e); if (d < bd && this.canSee(e)) { bd = d; best = e; }
      }
      return best;
    };
    if (!this.tamed && Math.random() < 1 / 40) { const s = near('sheep', 12); if (s) { this.setTarget(s); return; } }
    if (Math.random() < 1 / 20) { const s = near('skeleton', 16); if (s) this.setTarget(s); }
  }
  aiTick(game) {
    const p = game.player;
    const t0 = this.target;
    if (t0 && (t0.dead || t0.removed || this.distSqTo(t0) > 16 * 16 || (t0.type === 'player' && (this.tamed || !t0.survivalLike)))) this.setTarget(null);
    // begging: a bone (or meat, for a tame wolf) in your hand gets its full attention
    const held = p && !p.dead ? p.inventory.held() : null;
    this.begging = !!(held && (held.id === ITEM_IDS.bone || (this.tamed && this.isMeat(held))) && this.distSqTo(p) < 64 && !this.target && this.love <= 0);
    if (this.sitting) {
      this.clearPath(); this.following = false;
      if (this.target) this.setTarget(null);
      if (this.begging) this.lookAtEntity(p, 2); else { this.idleLook(game); this.keepWatching(); }
      return;
    }
    if (!this.target) this.findTarget(game);
    const t = this.target;
    if (t) {
      const d2 = this.chase(1.0);
      if (this.onGround && d2 >= 4 && d2 <= 16 && Math.random() < 0.2 && this.canSee(t)) {
        const dx = t.x - this.x, dz = t.z - this.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
        this.vx += dx / d * 0.4 + this.vx * 0.2; this.vz += dz / d * 0.4 + this.vz * 0.2; this.vy = 0.4;
      }
      this.tryMelee(t, d2, 4);
      return;
    }
    if (this.tamed && p && !p.dead) {
      const d2 = this.distSqTo(p);
      if (d2 >= 144 && !p.riding && this.teleportTo(p)) return;
      if (d2 > 100 || (this.following && d2 > 4)) {
        this.following = true;
        this.lookAtEntity(p, 2);
        if (--this.repath <= 0 || this.pathDone) { this.repath = 10; if (!this.navigateTo(p.x, p.y, p.z, 1.0, 24)) this.steerTo(p.x, p.y, p.z, 1.0); }
        return;
      }
      if (this.following) { this.following = false; this.clearPath(); }
    }
    if (this.begging) { this.lookAtEntity(p, 2); this.clearPath(); return; }
    super.aiTick(game);
  }
  mobTick(game) {
    // wet fur (from water or rain) gets shaken off on dry land
    const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    if (this.inWater || this.world.isRainingAt(bx, by + 1, bz)) { this.wet = true; this.shaking = false; this.shakeT = this.pshakeT = 0; }
    else if (this.wet && !this.shaking && this.onGround && this.pathDone) { this.shaking = true; this.shakeT = this.pshakeT = 0; }
    if (this.shaking) {
      if (this.shakeT === 0) game.audio.play('wolf_shake', 0.4, this.soundPitch(), this.x, this.y + this.eye, this.z);
      this.pshakeT = this.shakeT; this.shakeT += 0.05;
      if (this.pshakeT >= 2) { this.wet = false; this.shaking = false; this.shakeT = this.pshakeT = 0; }
      else if (this.shakeT > 0.4) { const n = Math.floor(Math.sin((this.shakeT - 0.4) * Math.PI) * 7); if (n > 0) game.particles.shakeDrops(this.x, this.y + 0.8, this.z, this.w, n); }
    }
    this.pinterest = this.interest;
    this.interest += ((this.begging ? 1 : 0) - this.interest) * 0.4;
    // a lone howl on dark nights
    if (!this.tamed && this.world.skyDarken() >= 8 && Math.random() < 1 / 4000) game.audio.play('wolf_howl', 3, 0.9 + Math.random() * 0.2, this.x, this.y + this.eye, this.z);
  }
  saySound() {
    if (this.angry) return 'wolf_growl';
    if (Math.random() < 1 / 3) return this.tamed && this.health < 10 ? 'wolf_whine' : 'wolf_pant';
    return 'wolf_bark';
  }
  hurtSound() { return 'wolf_hurt'; }
  deathSound() { return 'wolf_death'; }
  soundVolume() { return 0.4; }
  dropLoot() {}
  shakeAngle(partial, off) {
    if (!this.shaking) return 0;
    const f = clamp((this.pshakeT + (this.shakeT - this.pshakeT) * partial + off) / 1.8, 0, 1);
    return Math.sin(f * Math.PI) * Math.sin(f * Math.PI * 11) * 0.15 * Math.PI;
  }
  tailAngle() { return this.angry ? 1.54 : this.tamed ? (0.55 - (20 - this.health) * 0.02) * Math.PI : Math.PI / 5; }
  render(er, rx, ry, rz, partial) {
    const [sky, blk] = er.lightAt(this.x, this.y + 0.5, this.z);
    const pose = this.quadPose(partial);
    const head = this.baby ? pose.head.rot : pose.head;
    head[2] = (this.pinterest + (this.interest - this.pinterest) * partial) * 0.15 * Math.PI + this.shakeAngle(partial, 0);
    const swing = this.limbSwing - this.limbAmount * (1 - partial);
    const amt = clamp(this.prevLimbAmount + (this.limbAmount - this.prevLimbAmount) * partial, 0, 1);
    const wag = this.angry ? 0 : Math.cos(swing * 0.6662) * 1.4 * amt;
    const tail = [-this.tailAngle(), wag, this.shakeAngle(partial, -0.2)];
    pose.mane = [0, 0, this.shakeAngle(partial, -0.08)];
    pose.body = [0, 0, this.shakeAngle(partial, -0.16)];
    pose.tail = tail;
    if (this.sitting) {
      pose.mane = { rot: [0.31, 0, pose.mane[2]], off: [0, -2, 0.15] };
      pose.body = { rot: [Math.PI / 4, 0, pose.body[2]], off: [0, -5.8, -2.7] };
      pose.tail = { rot: [-Math.max(this.tailAngle(), 1.2), 0, tail[2]], off: [0, -9, -2] };
      pose.leg0 = { rot: [Math.PI / 2, 0, 0], off: [0, -6, -5] };
      pose.leg1 = { rot: [Math.PI / 2, 0, 0], off: [0, -6, -5] };
      pose.leg2 = { rot: [0.47, 0, 0], off: [0, -1, 0] };
      pose.leg3 = { rot: [0.47, 0, 0], off: [0, -1, 0] };
    }
    let col = er.entColor(this);
    if (this.wet) { const f = 0.75 + (this.pshakeT + (this.shakeT - this.pshakeT) * partial) / 2 * 0.25; col = [col[0] * f, col[1] * f, col[2] * f, col[3]]; }
    const base = er.baseMatrix(this, rx, ry, rz, partial, this.baby ? 0.5 : 1);
    er.drawModel(MODELS.wolf, this.tamed ? 'wolf_tame' : this.angry ? 'wolf_angry' : 'wolf', base, pose, col, sky, blk);
    if (this.tamed) {
      const c = hexToRgb(COLOR_RGB[this.collar] || '#b02e26');
      er.drawModel(MODELS.wolf, 'wolf_collar', base, pose, [c[0] * col[0] / 255, c[1] * col[1] / 255, c[2] * col[2] / 255, 255], sky, blk, { only: ['collar'], inflate: 0.3 });
    }
  }
  save() { const d = super.save(); d.tamed = this.tamed; d.sitting = this.sitting; d.collar = this.collar; return d; }
  load(d) { super.load(d); this.setTamed(!!d.tamed); if (d.health !== undefined) this.health = Math.min(d.health, this.maxHealth); this.sitting = !!d.sitting; if (d.collar !== undefined) this.collar = d.collar; }
}
// ---------------------------------------------------------------------------
// Villagers: they live in villages, open their doors, flee the undead and
// trade for jade. Each new trade unlocks more of what they have to offer.
// ---------------------------------------------------------------------------
const VILLAGER_PROFS = { farmer: 'Farmer', fisher: 'Fisherman', librarian: 'Librarian', cleric: 'Cleric', smith: 'Smith', butcher: 'Butcher' };
// [buy item, count range, (second buy), sell item, count range] - J = jade
const VILLAGER_TRADES = (() => {
  const J = 'jade';
  const t = (buy, bn, sell, sn, buy2, b2n, ench) => ({ buy, bn, sell, sn, buy2, b2n, ench });
  return {
    farmer: [
      [t('wheat', [18, 22], J, [1, 1]), t(J, [1, 1], 'bread', [2, 4])],
      [t('potato', [15, 19], J, [1, 1]), t('carrot', [15, 19], J, [1, 1])],
      [t('block:pumpkin', [8, 13], J, [1, 1]), t(J, [1, 1], 'pumpkin_pie', [2, 3])],
      [t('melon_slice', [7, 12], J, [1, 1]), t(J, [1, 1], 'apple', [5, 7])],
      [t(J, [1, 1], 'cookie', [6, 10]), t(J, [1, 2], 'berry_pie', [1, 2])],
    ],
    fisher: [
      [t('string', [15, 20], J, [1, 1]), t('coal', [16, 24], J, [1, 1])],
      [t('fish', [6, 6], 'cooked_fish', [6, 6], J, [1, 1]), t(J, [1, 1], 'cooked_salmon', [3, 5])],
      [t(J, [7, 8], 'fishing_rod', [1, 1], null, null, true), t(J, [2, 3], 'message_bottle', [1, 1])],
    ],
    librarian: [
      [t('paper', [24, 36], J, [1, 1]), t(J, [3, 4], 'block:bookshelf', [1, 1])],
      [t('book', [8, 10], J, [1, 1]), t(J, [10, 12], 'compass', [1, 1])],
      [t(J, [1, 1], 'block:glass', [3, 5]), t(J, [10, 12], 'clock', [1, 1])],
      [t(J, [2, 4], 'message_bottle', [1, 1]), t(J, [8, 11], 'wayfinder', [1, 1])],
    ],
    cleric: [
      [t('rotten_flesh', [36, 40], J, [1, 1]), t('gold_ingot', [8, 10], J, [1, 1])],
      [t(J, [1, 1], 'ember_dust', [1, 4]), t(J, [1, 2], 'dye:11', [1, 2])],
      [t(J, [1, 1], 'lumite_shard', [1, 3]), t(J, [6, 9], 'wisp_essence', [1, 1])],
      [t(J, [9, 12], 'golden_apple', [1, 1])],
    ],
    smith: [
      [t('coal', [16, 24], J, [1, 1]), t('iron_ingot', [7, 9], J, [1, 1])],
      [t(J, [2, 3], 'iron_sword', [1, 1]), t(J, [2, 4], 'iron_helmet', [1, 1]), t(J, [4, 6], 'iron_chestplate', [1, 1])],
      [t('diamond', [3, 4], J, [1, 1]), t(J, [7, 8], 'iron_pickaxe', [1, 1], null, null, true)],
      [t(J, [12, 15], 'diamond_sword', [1, 1], null, null, true), t(J, [16, 19], 'diamond_chestplate', [1, 1], null, null, true)],
    ],
    butcher: [
      [t('porkchop', [14, 18], J, [1, 1]), t('chicken', [14, 18], J, [1, 1])],
      [t('coal', [16, 24], J, [1, 1]), t(J, [1, 1], 'cooked_porkchop', [5, 7]), t(J, [1, 1], 'cooked_chicken', [6, 8])],
      [t('leather', [9, 12], J, [1, 1]), t(J, [1, 1], 'jerky', [3, 5])],
    ],
  };
})();
function tradeStack(name, n) {
  if (name.startsWith('block:')) return new ItemStack(B[name.slice(6).toUpperCase()], n, 0);
  if (name.startsWith('dye:')) return new ItemStack(ITEM_IDS.dye, n, +name.slice(4));
  return new ItemStack(ITEM_IDS[name], n, 0);
}
class Villager extends Mob {
  constructor(world) {
    super(world, 'villager');
    this.category = 'creature'; this.persistent = true;
    this.maxHealth = this.health = 20;
    this.baseSpeed = 0.22;
    this.w = 0.6; this.h = 1.95; this.eye = 1.62;
    this.prof = 'farmer'; this.home = null;
    this.offers = null; this.tier = 0; this.unlockIn = 0;
    this.customer = null; this.flee = 0;
    this.opensDoors = true; this.doors = [];
    this.xpValue = 0; this.talkInterval = 80;
  }
  onSpawn(fresh, extra) {
    if (!fresh) return;
    const profs = Object.keys(VILLAGER_PROFS);
    this.prof = (extra && extra.prof && VILLAGER_PROFS[extra.prof]) ? extra.prof : profs[this.rnd(profs.length)];
    if (extra && extra.home) this.home = extra.home.slice();
  }
  get title() { return VILLAGER_PROFS[this.prof] || 'Villager'; }
  // ------------------------------------------------ trading
  ensureOffers() { if (!this.offers) { this.offers = []; this.unlockTier(); } }
  unlockTier() {
    const tiers = VILLAGER_TRADES[this.prof] || VILLAGER_TRADES.farmer;
    if (this.tier >= tiers.length) return false;
    const r = (a) => a[0] + this.rnd(a[1] - a[0] + 1);
    for (const d of tiers[this.tier]) {
      const o = { buy: tradeStack(d.buy, r(d.bn)), buy2: d.buy2 ? tradeStack(d.buy2, r(d.b2n)) : null, sell: tradeStack(d.sell, r(d.sn)), uses: 0, max: 7 };
      if (d.ench) Enchant.apply(o.sell, Enchant.roll(new Noise.Random((Math.random() * 2147483647) | 0), o.sell, 5 + this.rnd(15)));
      if (!Enchant.list(o.sell).length) delete o.sell.tag;
      this.offers.push(o);
    }
    this.tier++;
    return true;
  }
  // a finished trade: sometimes the villager has learned something new
  traded(game, o) {
    o.uses++;
    this.ambientTimer = -this.talkInterval;
    game.audio.play('villager_yes', 0.8, this.soundPitch(), this.x, this.y + this.eye, this.z);
    game.spawnXP(this.x, this.y + 0.5, this.z, 3 + this.rnd(4));
    if (o === this.offers[this.offers.length - 1] && o.uses === 1 && !this.unlockIn) this.unlockIn = 40;
    else if (o.uses === 1 && Math.random() < 0.2 && !this.unlockIn) this.unlockIn = 40;
  }
  interact(player, held) {
    const g = this.game;
    if (held && held.id === ITEM_IDS.spawn_egg) return false;
    if (this.dead || this.baby) return false;
    this.ensureOffers();
    this.customer = player;
    this.clearPath();
    g.audio.play('villager_say', 0.9, this.soundPitch(), this.x, this.y + this.eye, this.z);
    g.openScreen(new MerchantScreen(g, this));
    return true;
  }
  // ------------------------------------------------ behaviour
  aiTick(game) {
    const p = game.player, w = this.world;
    if (this.customer && (game.screen === null || !(game.screen instanceof MerchantScreen) || game.screen.v !== this)) this.customer = null;
    if (this.customer) { this.lookAtEntity(this.customer, 2); this.clearPath(); return; }
    // keep away from the undead
    if (this.flee > 0) { this.flee--; if (this.pathDone) this.wander(8, 3, 1.25); return; }
    if (this.age % 10 === 0) {
      for (const e of w.entitiesInBox(this.x - 8, this.y - 3, this.z - 8, this.x + 8, this.y + 3, this.z + 8)) {
        if (!e.dead && (e.type === 'zombie' || e.type === 'mummy' || e.type === 'wraith')) {
          const dx = this.x - e.x, dz = this.z - e.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
          this.navigateTo(this.x + dx / d * 10, this.y, this.z + dz / d * 10, 1.25, 14);
          this.flee = 40;
          return;
        }
      }
    }
    // home before dark
    const night = w.skyDarken() >= 6;
    if (this.home) {
      const hx = this.home[0] + 0.5, hz = this.home[1] + 0.5, d2 = (this.x - hx) ** 2 + (this.z - hz) ** 2;
      if ((d2 > 40 * 40 || (night && d2 > 10 * 10)) && this.pathDone && Math.random() < 0.05) {
        const ty = this.world.topSolidY ? this.world.topSolidY(Math.floor(hx), Math.floor(hz)) + 1 : this.y;
        this.navigateTo(hx, ty, hz, 0.9, 48);
        return;
      }
      if (night && d2 <= 10 * 10) { this.idleLook(game); this.keepWatching(); return; }
    }
    if (this.pathDone && Math.random() < 1 / 100) this.wander(10, 4, 0.8, (x, y, z) => (this.home ? -Math.hypot(x - this.home[0], z - this.home[1]) / 8 : 0));
    // gossip: two villagers stop and look at each other
    if (this.pathDone && Math.random() < 0.01) {
      const o = w.entitiesInBox(this.x - 4, this.y - 2, this.z - 4, this.x + 4, this.y + 2, this.z + 4).find((e) => e !== this && e.type === 'villager');
      if (o) { this.lookAtEntity(o, 40); return; }
    }
    this.idleLook(game); this.keepWatching();
  }
  onRevenge(e) { this.flee = 60; this.clearPath(); if (e) { const dx = this.x - e.x, dz = this.z - e.z, d = Math.sqrt(dx * dx + dz * dz) || 1; this.navigateTo(this.x + dx / d * 8, this.y, this.z + dz / d * 8, 1.25, 12); } }
  mobTick(game) {
    const w = this.world;
    // new trades arrive with a sparkle
    if (this.unlockIn > 0 && --this.unlockIn === 0) {
      if (this.unlockTier()) game.particles.happy(this.x, this.y + this.h, this.z);
      for (const o of this.offers) if (o.uses >= o.max) o.max += 2 + this.rnd(6);
    }
    // open wooden doors in the way, close them behind
    if (this.path || this.flee > 0) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      for (const d of [0.3, 0.9]) {
        const bx = Math.floor(this.x + fx * d), by = Math.floor(this.y + 0.1), bz = Math.floor(this.z + fz * d);
        if (w.getBlock(bx, by, bz) !== B.DOOR_WOOD) continue;
        const lower = (w.getMeta(bx, by, bz) & 8) ? by - 1 : by;
        const lm = w.getMeta(bx, lower, bz);
        if (!(lm & 4)) {
          w.setBlock(bx, lower, bz, B.DOOR_WOOD, lm | 4, 4); w.setBlock(bx, lower + 1, bz, B.DOOR_WOOD, (lm | 4) | 8, 4);
          game.audio.play('door_open', 0.6, 0.9 + Math.random() * 0.1, bx + 0.5, lower + 0.5, bz + 0.5);
          this.doors.push({ x: bx, y: lower, z: bz, t: 20 });
        }
      }
    }
    for (let i = this.doors.length - 1; i >= 0; i--) {
      const d = this.doors[i];
      if (--d.t > 0 || this.distanceSq(d.x + 0.5, d.y, d.z + 0.5) < 2.5) continue;
      this.doors.splice(i, 1);
      if (w.getBlock(d.x, d.y, d.z) !== B.DOOR_WOOD) continue;
      const lm = w.getMeta(d.x, d.y, d.z);
      if (lm & 4) {
        w.setBlock(d.x, d.y, d.z, B.DOOR_WOOD, lm & ~4, 4); w.setBlock(d.x, d.y + 1, d.z, B.DOOR_WOOD, (lm & ~4) | 8, 4);
        game.audio.play('door_close', 0.6, 0.9 + Math.random() * 0.1, d.x + 0.5, d.y + 0.5, d.z + 0.5);
      }
    }
  }
  saySound() { return this.customer ? null : 'villager_say'; }
  hurtSound() { return 'villager_hurt'; }
  deathSound() { return 'villager_death'; }
  dropLoot() {}
  render(er, rx, ry, rz, partial) {
    const [sky, blk] = er.lightAt(this.x, this.y + 1, this.z);
    const pose = this.quadPose(partial);
    const head = this.baby ? pose.head.rot : pose.head;
    const swing = this.limbSwing - this.limbAmount * (1 - partial);
    const amt = clamp(this.prevLimbAmount + (this.limbAmount - this.prevLimbAmount) * partial, 0, 1);
    const sway = Math.cos(swing * 0.6662) * 0.06 * amt;
    const p = { head, body: [0, 0, sway], arms: [0, 0, sway] };
    er.drawModel(MODELS.villager, 'villager_' + this.prof, er.baseMatrix(this, rx, ry, rz, partial, this.baby ? 0.5 : 1), p, er.entColor(this), sky, blk);
  }
  save() {
    const d = super.save();
    d.prof = this.prof; d.home = this.home; d.tier = this.tier;
    if (this.unlockIn) d.unlockIn = this.unlockIn;
    if (this.offers) d.offers = this.offers.map((o) => ({ buy: o.buy.toJSON(), buy2: o.buy2 ? o.buy2.toJSON() : null, sell: o.sell.toJSON(), uses: o.uses, max: o.max }));
    return d;
  }
  load(d) {
    super.load(d);
    if (d.prof && VILLAGER_PROFS[d.prof]) this.prof = d.prof;
    this.home = d.home || null; this.tier = d.tier || 0; this.unlockIn = d.unlockIn || 0;
    if (d.offers) this.offers = d.offers.map((o) => ({ buy: ItemStack.fromJSON(o.buy), buy2: o.buy2 ? ItemStack.fromJSON(o.buy2) : null, sell: ItemStack.fromJSON(o.sell), uses: o.uses || 0, max: o.max || 7 })).filter((o) => o.buy && o.sell);
  }
}

// tamed wolves defend their owner and join in when the owner attacks
function rallyWolves(game, foe) {
  const p = game.player, w = game.world;
  if (!p || !w || !foe || foe === p || foe.dead || !foe.hurt || foe.type === 'player' || foe.type === 'boomcap' || (foe.type === 'wolf' && foe.tamed)) return;
  for (const e of w.entities) if (e.type === 'wolf' && e.tamed && !e.sitting && !e.dead && e !== foe && e.distSqTo(p) < 24 * 24) e.setTarget(foe);
}

// ---------------------------------------------------------------------------
// Water creatures
// ---------------------------------------------------------------------------
class Squid extends Mob {
  constructor(world) {
    super(world, 'squid');
    this.category = 'water';
    this.maxHealth = this.health = 10;
    this.w = 0.95; this.h = 0.95; this.eye = 0.47;
    this.swims = false;
    this.xpValue = () => 1 + this.rnd(3);
    this.spin = 0; this.spinSpeed = 1 / (Math.random() + 1) * 0.2;
    this.tentacle = 0; this.ptentacle = 0;
    this.sPitch = 0; this.psPitch = 0; this.sRoll = 0; this.psRoll = 0;
    this.swimSpeed = 0; this.rollSpeed = 0;
    this.mvx = 0; this.mvy = 0; this.mvz = 0;
    this.air = 300; this.inkCooldown = 0; this.flee = 0;
  }
  aiTick() {
    if (this.flee > 0) { this.flee--; return; }
    if (this.idleTime > 100) { this.mvx = this.mvy = this.mvz = 0; return; }
    if (Math.random() < 1 / 50 || !this.inWater || (!this.mvx && !this.mvy && !this.mvz)) {
      const a = Math.random() * TAU;
      this.mvx = Math.cos(a) * 0.2; this.mvy = -0.1 + Math.random() * 0.2; this.mvz = Math.sin(a) * 0.2;
    }
  }
  // the classic squid: a pulse of the tentacles drives each burst of speed
  travel() {
    this.ptentacle = this.tentacle; this.psPitch = this.sPitch; this.psRoll = this.sRoll;
    this.spin += this.spinSpeed;
    if (this.spin > TAU) { this.spin -= TAU; if (Math.random() < 0.1) this.spinSpeed = 1 / (Math.random() + 1) * 0.2; }
    if (this.inWater) {
      if (this.spin < Math.PI) {
        const f = this.spin / Math.PI;
        this.tentacle = Math.sin(f * f * Math.PI) * Math.PI * 0.25;
        if (f > 0.75) { this.swimSpeed = 1; this.rollSpeed = 1; } else this.rollSpeed *= 0.8;
      } else { this.tentacle = 0; this.swimSpeed *= 0.9; this.rollSpeed *= 0.99; }
      const k = this.flee > 0 ? 2.2 : 1;
      this.vx = this.mvx * this.swimSpeed * k; this.vy = this.mvy * this.swimSpeed * k; this.vz = this.mvz * this.swimSpeed * k;
      this.move(this.vx, this.vy, this.vz);
      const hs = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
      if (hs > 0.001) this.yaw += wrapRadians(Math.atan2(-this.vx, -this.vz) - this.yaw) * 0.1;
      this.bodyYaw = this.yaw;
      this.sRoll += 0.0822 * this.rollSpeed;
      if (hs > 0.0001 || Math.abs(this.vy) > 0.0001) this.sPitch += (-Math.atan2(hs, this.vy) - this.sPitch) * 0.1;
      this.fallDistance = 0;
    } else {
      this.tentacle = Math.abs(Math.sin(this.spin)) * Math.PI * 0.25;
      this.vx = 0; this.vz = 0;
      this.vy -= 0.08; this.vy *= 0.98;
      this.move(this.vx, this.vy, this.vz);
      this.sPitch += (-Math.PI / 2 - this.sPitch) * 0.02;
    }
  }
  mobTick() {
    if (this.inkCooldown > 0) this.inkCooldown--;
    // out of the water a squid slowly suffocates
    if (!this.inWater) { if (--this.air === -20) { this.air = 0; this.hurt(2, { type: 'drown' }); } }
    else this.air = 300;
  }
  onHurt(amount, src) {
    super.onHurt(amount, src);
    if (!this.inWater || this.dead || this.health <= 0) return;
    if (this.inkCooldown <= 0) {
      this.game.particles.ink(this.x, this.y + 0.5, this.z, 24);
      this.game.audio.play('swim', 0.5, 0.7, this.x, this.y, this.z);
      this.inkCooldown = 40;
    }
    // dart away from whatever hurt it
    const a = src && src.entity;
    if (a) {
      const dx = this.x - a.x, dy = this.y - a.y, dz = this.z - a.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      this.mvx = dx / d * 0.25; this.mvy = Math.max(-0.1, dy / d * 0.25); this.mvz = dz / d * 0.25;
      this.flee = 30; this.swimSpeed = 1; this.spin = Math.PI * 0.8;
    }
  }
  knockback(dx, dz, strength) { if (!this.inWater) super.knockback(dx, dz, strength); }
  dropLoot() { this.drop(ITEM_IDS.dye, 1 + this.rnd(3), 15); }
  render(er, rx, ry, rz, partial) {
    const [sky, blk] = er.lightAt(this.x, this.y + 0.5, this.z);
    const yaw = this.pbodyYaw + wrapRadians(this.bodyYaw - this.pbodyYaw) * partial;
    const pitch = this.psPitch + (this.sPitch - this.psPitch) * partial;
    const roll = this.psRoll + (this.sRoll - this.psRoll) * partial;
    let m = M3.trans(rx, ry + 0.5, rz);
    m = M3.mul(m, M3.ry(yaw));
    m = M3.mul(m, M3.rx(pitch));
    m = M3.mul(m, M3.ry(roll));
    if (this.dead && this.deathTime > 0) m = M3.mul(m, M3.rz(Math.min(1, Math.sqrt((this.deathTime + partial - 1) / 20 * 1.6)) * Math.PI / 2));
    m = M3.mul(m, M3.scale(1 / 16, 1 / 16, 1 / 16));
    const ta = this.ptentacle + (this.tentacle - this.ptentacle) * partial;
    const pose = {};
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; pose['t' + i] = [ta, Math.atan2(-Math.cos(a), -Math.sin(a)), 0]; }
    const fin = Math.sin((this.age + partial) * 0.25) * 0.25;
    pose.finR = [0, 0, -fin]; pose.finL = [0, 0, fin];
    er.drawModel(MODELS.squid, 'squid', m, pose, er.entColor(this), sky, blk);
  }
  save() { const d = super.save(); d.air = this.air; return d; }
  load(d) { super.load(d); if (d.air !== undefined) this.air = d.air; }
}

// ---------------------------------------------------------------------------
// Ambient creatures
// ---------------------------------------------------------------------------
class Bat extends Mob {
  constructor(world) {
    super(world, 'bat');
    this.category = 'ambient';
    this.maxHealth = this.health = 6;
    this.w = 0.5; this.h = 0.9; this.eye = 0.45;
    this.noGravity = true; this.swims = false;
    this.hanging = false; this.dest = null;
    this.xpValue = 0;
    this.talkInterval = 60;
  }
  travel() { this.move(this.vx, this.vy, this.vz); this.vx *= 0.91; this.vz *= 0.91; this.vy *= 0.6; this.fallDistance = 0; }
  aiTick(game) {
    const w = this.world, p = game.player;
    const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    if (this.hanging) {
      this.vx = this.vy = this.vz = 0;
      if (!BT.opaque[w.getBlock(bx, Math.floor(this.y + this.h + 0.1), bz)]) { this.hanging = false; return; }
      if (Math.random() < 0.005 || (p && !p.dead && this.distSqTo(p) < 16 && !p.sneaking)) { this.hanging = false; this.vy = 0.1; }
      return;
    }
    if (!this.dest || this.distanceSq(this.dest[0] + 0.5, this.dest[1] + 0.1, this.dest[2] + 0.5) < 4 || Math.random() < 1 / 30 || BT.solid[w.getBlock(this.dest[0], this.dest[1], this.dest[2])]) {
      this.dest = [bx + this.rnd(7) - this.rnd(7), by + this.rnd(6) - 2, bz + this.rnd(7) - this.rnd(7)];
    }
    const dx = this.dest[0] + 0.5 - this.x, dy = this.dest[1] + 0.1 - this.y, dz = this.dest[2] + 0.5 - this.z;
    this.vx += (Math.sign(dx) * 0.5 - this.vx) * 0.1;
    this.vy += (Math.sign(dy) * 0.7 - this.vy) * 0.1;
    this.vz += (Math.sign(dz) * 0.5 - this.vz) * 0.1;
    this.yaw = approachAngle(this.yaw, Math.atan2(-this.vx, -this.vz), 25 * DEG);
    if (Math.random() < 0.01 && BT.opaque[w.getBlock(bx, Math.floor(this.y + this.h + 0.1), bz)]) { this.hanging = true; this.vx = this.vy = this.vz = 0; }
  }
  soundVolume() { return 0.1; }
  soundPitch() { return (Math.random() - Math.random()) * 0.2 + 0.95; }
  render(er, rx, ry, rz, partial) {
    const [sky, blk] = er.lightAt(this.x, this.y + 0.5, this.z);
    const t = this.age + partial;
    let base;
    const pose = {};
    if (this.hanging) {
      base = M3.mul(er.baseMatrix(this, rx, ry + this.h - 0.05, rz, partial, 0.35), M3.rz(Math.PI));
      pose.rwing = [0, -0.3, 1.4]; pose.lwing = [0, 0.3, -1.4];
    } else {
      base = er.baseMatrix(this, rx, ry + 0.3 + Math.cos(t * 0.3) * 0.1, rz, partial, 0.35);
      const f = Math.cos(t * 1.3) * Math.PI * 0.25;
      pose.rwing = [0, 0, f]; pose.lwing = [0, 0, -f];
      pose.body = [Math.PI / 4 + Math.cos(t * 0.1) * 0.15, 0, 0];
    }
    er.drawModel(MODELS.bat, 'bat', base, pose, er.entColor(this), sky, blk);
  }
}

// Drifting lights that lead the curious to buried treasure
class Wisp extends Mob {
  constructor(world) {
    super(world, 'wisp');
    this.category = 'ambient';
    this.maxHealth = this.health = 1;
    this.w = 0.4; this.h = 0.4; this.eye = 0.2;
    this.noGravity = true; this.swims = false; this.fireImmune = true;
    this.goal = null; this.home = null; this.state = 'idle'; this.fade = 0;
    this.xpValue = 2;
    this.talkInterval = 160;
    this.guided = false;   // released from wisp essence: always leads
  }
  travel() { this.noClip = true; this.move(this.vx, this.vy, this.vz); this.vx *= 0.9; this.vy *= 0.9; this.vz *= 0.9; this.fallDistance = 0; }
  aiTick(game) {
    const p = game.player, w = this.world;
    if (!this.home) this.home = [this.x, this.y, this.z];
    if (!this.goal && this.age % 40 === 1) this.goal = game.nearestTreasure ? game.nearestTreasure(this.x, this.z, this.guided ? 160 : 96) : null;
    if (this.goal && game.isTreasureOpen && game.isTreasureOpen(this.goal)) this.goal = null;
    let tx = this.home[0] + Math.sin(this.age * 0.02) * 2, ty = this.home[1] + Math.sin(this.age * 0.05) * 0.5, tz = this.home[2] + Math.cos(this.age * 0.02) * 2, sp = 0.01;
    const pd2 = p && !p.dead ? this.distSqTo(p) : 1e9;
    if (this.goal) {
      const gx = this.goal.x + 0.5, gz = this.goal.z + 0.5;
      const gy = Math.max(this.goal.y + 1, w.topSolidY(this.goal.x, this.goal.z) + 1) + 1.2;
      const atGoal = (this.x - gx) * (this.x - gx) + (this.z - gz) * (this.z - gz) < 4;
      if (this.state === 'lead' || pd2 < 100 || this.guided) {
        if (this.state !== 'lead') { this.state = 'lead'; game.audio.play('wisp', 0.6, 1.2, this.x, this.y, this.z); }
        if (atGoal) {
          tx = gx; ty = gy + Math.sin(this.age * 0.1) * 0.3; tz = gz; sp = 0.02;
          if (pd2 < 16) this.vanish(game, true);
        } else if (pd2 > 196) { tx = this.x; ty = this.y; tz = this.z; sp = 0; }       // wait for the player
        else {
          const dx = gx - this.x, dz = gz - this.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
          tx = this.x + dx / d * 3; tz = this.z + dz / d * 3;
          ty = Math.max(w.topSolidY(Math.floor(tx), Math.floor(tz)) + 2.2, Math.min(this.y, 120));
          sp = pd2 < 36 ? 0.035 : 0.022;
        }
      }
    }
    const dx = tx - this.x, dy = ty - this.y, dz = tz - this.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    if (sp > 0) { this.vx += dx / d * sp; this.vy += dy / d * sp; this.vz += dz / d * sp; }
    this.vy += Math.sin(this.age * 0.15) * 0.003;
    // shy: fades away in daylight (unless guided by essence)
    if (!this.guided && w.isDaytime() && Math.random() < 0.01) this.vanish(game, false);
    if (!this.goal && !this.guided && this.age > 2400 && Math.random() < 0.002) this.vanish(game, false);
    if (this.guided && !this.goal && this.age > 200) this.vanish(game, false);
  }
  vanish(game, arrived) {
    if (this.removed) return;
    this.removed = true;
    game.particles.sparkle(this.x, this.y, this.z, 0.6, 1, 0.95, arrived ? 40 : 15, arrived ? 1.5 : 0.8);
    game.audio.play('chime', 0.8, arrived ? 1.4 : 1, this.x, this.y, this.z);
    if (arrived && this.goal) game.markTreasure && game.markTreasure(this.goal);
  }
  mobTick(game) {
    game.particles.wisp(this.x, this.y + 0.2, this.z);
    if (this.age % 4 === 0) game.particles.sparkle(this.x, this.y + 0.2, this.z, 0.5, 1, 0.9, 1, 0.2);
  }
  saySound() { return 'wisp'; }
  hurtSound() { return 'chime'; }
  deathSound() { return 'chime'; }
  soundVolume() { return 0.5; }
  dropLoot() { this.drop(ITEM_IDS.wisp_essence, 1); }
  checkDespawn(game) { if (this.guided) return; super.checkDespawn(game); }
  render() {}
}

// The Stranger: seen in the distance, never up close
class Stranger extends Mob {
  constructor(world) {
    super(world, 'stranger');
    this.category = 'special';
    this.maxHealth = this.health = 20;
    this.w = 0.6; this.h = 1.8; this.eye = 1.62;
    this.seen = 0; this.life = 600 + this.rnd(600);
    this.talkInterval = 1e9;
    this.invulnerable = true;
  }
  hurt(amount, src) { if (src && src.type === 'void') { this.removed = true; return false; } this.vanish(this.game); return false; }
  aiTick(game) {
    const p = game.player;
    if (!p || p.dead) return;
    this.lookAtEntity(p, 2);
    this.yaw = approachAngle(this.yaw, Math.atan2(-(p.x - this.x), -(p.z - this.z)), 10 * DEG);
    const d2 = this.distSqTo(p);
    if (d2 < 144 || --this.life <= 0) { this.vanish(game); return; }
    // is the player looking right at us?
    const eye = [p.x, p.y + p.eye, p.z];
    const dx = this.x - eye[0], dy = this.y + 1.5 - eye[1], dz = this.z - eye[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const lx = -Math.sin(p.yaw) * Math.cos(p.pitch), ly = Math.sin(p.pitch), lz = -Math.cos(p.yaw) * Math.cos(p.pitch);
    const dot = (dx * lx + dy * ly + dz * lz) / d;
    if (dot > 0.985 && lineOfSight(this.world, eye[0], eye[1], eye[2], this.x, this.y + 1.5, this.z)) {
      if (++this.seen === 1 && game.onStrangerSeen) game.onStrangerSeen(this);
      if (this.seen > 25) this.vanish(game);
    }
  }
  vanish(game) {
    if (this.removed) return;
    this.removed = true;
    game.particles.smoke(this.x, this.y + 1, this.z, 10, true);
    const p = game.player;
    if (p && this.distSqTo(p) < 48 * 48) game.audio.play('stranger', 0.35, 0.8);
  }
  checkDespawn() {}
  render(er, rx, ry, rz, partial) { er.drawHumanoid(this, rx, ry, rz, partial, 'stranger', 'biped'); }
  save() { return null; }
}

// ---------------------------------------------------------------------------
// Registry, creation & persistence
// ---------------------------------------------------------------------------
const MOB_CLASSES = { zombie: Zombie, skeleton: Skeleton, spider: Spider, boomcap: Boomcap, slime: Slime, mummy: Mummy, wraith: Wraith, pig: Pig, cow: Cow, sheep: Sheep, chicken: Chicken, deer: Deer, bat: Bat, wisp: Wisp, stranger: Stranger, wolf: Wolf, squid: Squid, villager: Villager };
function createMob(type, world, extra) {
  const C = MOB_CLASSES[type];
  if (!C) return null;
  const m = new C(world);
  m.onSpawn(true, extra);
  return m;
}
function entityFromData(world, d) {
  if (!d || !d.type) return null;
  let e = null;
  if (d.type === 'item') { const s = ItemStack.fromJSON(d.stack); if (!s) return null; e = new ItemEntity(world, d.x, d.y, d.z, s); }
  else if (d.type === 'xp') e = new XPOrb(world, d.x, d.y, d.z, d.value || 1);
  else if (d.type === 'boat') e = new Boat(world, d.x, d.y, d.z, d.wood || 0);
  else if (d.type === 'minecart') e = new Minecart(world, d.x, d.y, d.z, d.kind || 0);
  else if (d.type === 'painting') e = new Painting(world, d.bx | 0, d.by | 0, d.bz | 0, d.facing || 0, d.art);
  else if (MOB_CLASSES[d.type]) e = new MOB_CLASSES[d.type](world);
  if (!e) return null;
  e.load(d);
  return e.removed ? null : e;
}

// ---------------------------------------------------------------------------
// Natural spawning (rules loosely modelled on the classic algorithm)
// ---------------------------------------------------------------------------
class MobSpawner {
  constructor(game) { this.game = game; this.counts = { monster: 0, creature: 0, ambient: 0, wisp: 0, special: 0 }; this.t = 0; }
  count() {
    const c = this.counts; c.monster = 0; c.creature = 0; c.ambient = 0; c.wisp = 0; c.special = 0; c.bat = 0; c.wraith = 0; c.water = 0;
    for (const e of this.game.world.entities) {
      if (e.removed || !e.category) continue;
      c[e.category] = (c[e.category] || 0) + 1;
      if (e.type === 'wisp') c.wisp++;
      if (e.type === 'bat') c.bat++;
      if (e.type === 'wraith') c.wraith++;
    }
  }
  tick() {
    const g = this.game, w = g.world, p = g.player;
    if (!w || !p || w.menu) return;
    this.t++;
    if (this.t % 20 === 1) this.count();
    if (!w.gameRules.doMobSpawning) return;
    const rd = Math.min(g.settings.renderDistance, 6);
    const area = (rd * 2 + 1) * (rd * 2 + 1);
    if (w.dim) { if (this.tickUnder) this.tickUnder(rd, area); return; }
    const capMonster = Math.max(8, Math.round(48 * area / 169));
    if (w.difficulty > 0 && this.counts.monster < capMonster) {
      for (let i = 0; i < 2; i++) if (this.spawnMonsterPack(rd)) { this.counts.monster += 1; }
    }
    if (this.t % 20 === 7 && this.counts.bat < 5) this.spawnBat();
    if (this.t % 40 === 19 && this.counts.water < Math.max(4, Math.round(6 * area / 169))) this.spawnSquid(rd);
    if (this.t % 400 === 13 && this.counts.creature < Math.round(14 * area / 169) + 4) this.spawnAnimals(rd);
    if (this.t % 100 === 31 && this.counts.wisp < 3) this.spawnWisp();
    if (this.t % 200 === 53 && this.counts.wraith < 2 && w.difficulty > 0) this.spawnWraith();
    if (this.t % 600 === 77 && this.counts.special === 0) this.spawnStranger();
  }
  rnd(n) { return Math.floor(Math.random() * n); }
  validMonsterLight(x, y, z) {
    const w = this.game.world;
    const raw = w.getLightRaw(x, y, z);
    const sky = raw >> 4;
    if (sky > this.rnd(32)) return false;
    const darken = w.thundering ? Math.max(10, w.skyDarken()) : w.skyDarken();
    const light = Math.max(sky - darken, raw & 15);
    return light <= this.rnd(8);
  }
  canStand(x, y, z, hb) {
    const w = this.game.world;
    const below = w.getBlock(x, y - 1, z);
    if (!BT.opaque[below] || !BT.solid[below] || below === B.BEDROCK) return false;
    for (let i = 0; i < hb; i++) { const id = w.getBlock(x, y + i, z); if (BT.solid[id] || BT.fluid[id]) return false; }
    return true;
  }
  pickMonster(x, y, z) {
    const w = this.game.world;
    const b = BIOMES[w.biomeAt(x, z)];
    const key = b ? b.key : 'plains';
    if (key === 'mushroom_island') return null;
    const table = [['zombie', 95], ['skeleton', 100], ['spider', 100], ['boomcap', 90]];
    if (key === 'desert' || key === 'canyon' || key === 'salt_flats') { table[0][1] = 20; table.push(['mummy', 80]); }
    const surface = y >= w.heightAt(x, z) - 1;
    if (key === 'swamp' && surface && y > 50 && y < 75 && w.moonPhase() !== 4) table.push(['slime', 100]);
    if (y < 40 && this.isSlimeChunk(x >> 4, z >> 4)) table.push(['slime', 100]);
    let total = 0; for (const t of table) total += t[1];
    let r = Math.random() * total;
    for (const t of table) { r -= t[1]; if (r < 0) return t[0]; }
    return table[0][0];
  }
  isSlimeChunk(cx, cz) { return Noise.seedHash(this.game.world.seed, cx, cz, 0x5113) % 10 === 0; }
  spawnMonsterPack(rd) {
    const g = this.game, w = g.world, p = g.player;
    const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
    const cx = pcx + this.rnd(rd * 2 + 1) - rd, cz = pcz + this.rnd(rd * 2 + 1) - rd;
    const c = w.getChunk(cx, cz); if (!c) return false;
    const lx = this.rnd(16), lz = this.rnd(16);
    const top = c.heightmap[(lz << 4) | lx];
    const x0 = cx * 16 + lx, z0 = cz * 16 + lz, y0 = this.rnd(Math.min(CH_H - 2, top + 2));
    if (BT.solid[w.getBlock(x0, y0, z0)]) return false;
    let type = null, n = 0;
    for (let k = 0; k < 3; k++) {
      let x = x0, z = z0;
      for (let j = 0; j < 4; j++) {
        x += this.rnd(6) - this.rnd(6); z += this.rnd(6) - this.rnd(6);
        const dx = x + 0.5 - p.x, dz = z + 0.5 - p.z, dy = y0 - p.y;
        if (dx * dx + dy * dy + dz * dz < 24 * 24) continue;
        if (!w.isLoaded(x, z)) continue;
        if (!type) { type = this.pickMonster(x, y0, z); if (!type) return false; }
        const hb = type === 'spider' ? 1 : 2;
        if (!this.canStand(x, y0, z, hb)) continue;
        if (!this.validMonsterLight(x, y0, z)) continue;
        if (type === 'spider' && !this.canStand(x + 1, y0, z, 1)) continue;
        g.spawnMob(type, x + 0.5, y0, z + 0.5);
        if (++n >= (type === 'boomcap' || type === 'slime' ? 2 : 4)) return true;
      }
    }
    return n > 0;
  }
  spawnAnimals(rd) {
    const g = this.game, w = g.world, p = g.player;
    const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
    const cx = pcx + this.rnd(rd * 2 + 1) - rd, cz = pcz + this.rnd(rd * 2 + 1) - rd;
    const c = w.getChunk(cx, cz); if (!c) return;
    const x0 = cx * 16 + 4 + this.rnd(8), z0 = cz * 16 + 4 + this.rnd(8);
    const b = BIOMES[w.biomeAt(x0, z0)];
    if (!b || !b.animals || !b.animals.length) return;
    let total = 0; for (const a of b.animals) total += a[1];
    let r = Math.random() * total, type = b.animals[0][0];
    for (const a of b.animals) { r -= a[1]; if (r < 0) { type = a[0]; break; } }
    const n = 2 + this.rnd(3);
    for (let i = 0; i < n; i++) {
      const x = x0 + this.rnd(5) - 2, z = z0 + this.rnd(5) - 2;
      const y = w.heightAt(x, z);
      if ((x + 0.5 - p.x) ** 2 + (z + 0.5 - p.z) ** 2 < 24 * 24) continue;
      const g2 = w.getBlock(x, y - 1, z);
      if (g2 !== B.GRASS && g2 !== B.PODZOL && g2 !== B.MYCELIUM && g2 !== B.SNOW) continue;
      if (!this.canStand(x, y, z, 2) || w.getLightLevel(x, y, z) < 9) continue;
      g.spawnMob(type, x + 0.5, y, z + 0.5);
    }
  }
  // squid shoals: anywhere the water is at least two deep, between y 46 and the sea surface
  spawnSquid(rd) {
    const g = this.game, w = g.world, p = g.player;
    const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
    const cx = pcx + this.rnd(rd * 2 + 1) - rd, cz = pcz + this.rnd(rd * 2 + 1) - rd;
    if (!w.getChunk(cx, cz)) return;
    const x0 = cx * 16 + this.rnd(16), z0 = cz * 16 + this.rnd(16), y0 = 46 + this.rnd(SEA_LEVEL - 46);
    if (w.getBlock(x0, y0, z0) !== B.WATER) return;
    for (let i = 0; i < 4; i++) {
      const x = x0 + this.rnd(5) - 2, z = z0 + this.rnd(5) - 2, y = y0 + this.rnd(3) - 1;
      if ((x + 0.5 - p.x) ** 2 + (y - p.y) ** 2 + (z + 0.5 - p.z) ** 2 < 24 * 24 || !w.isLoaded(x, z)) continue;
      if (y < 46 || y >= SEA_LEVEL || w.getBlock(x, y, z) !== B.WATER || w.getBlock(x, y - 1, z) !== B.WATER) continue;
      const up = w.getBlock(x, y + 1, z);
      if (up !== B.WATER && up !== 0) continue;
      g.spawnMob('squid', x + 0.5, y, z + 0.5);
    }
  }
  spawnBat() {
    const g = this.game, w = g.world, p = g.player;
    const x = Math.floor(p.x) + this.rnd(33) - 16, z = Math.floor(p.z) + this.rnd(33) - 16, y = Math.floor(p.y) + this.rnd(17) - 8;
    if (y >= SEA_LEVEL || y < 4 || !w.isLoaded(x, z)) return;
    if ((x - p.x) ** 2 + (z - p.z) ** 2 < 64) return;
    if (w.getBlock(x, y, z) !== 0 || w.getBlock(x, y + 1, z) !== 0) return;
    const raw = w.getLightRaw(x, y, z);
    if ((raw >> 4) > 0 || (raw & 15) > this.rnd(4)) return;
    g.spawnMob('bat', x + 0.5, y, z + 0.5);
  }
  spawnWisp() {
    const g = this.game, w = g.world, p = g.player;
    if (w.skyDarken() < 7) return;
    const t = g.nearestTreasure ? g.nearestTreasure(p.x, p.z, 80) : null;
    let x, z;
    if (t && Math.random() < 0.5) {
      const a = Math.random() * TAU, r = 10 + Math.random() * 10;
      x = Math.floor(t.x + Math.sin(a) * r); z = Math.floor(t.z + Math.cos(a) * r);
    } else {
      x = Math.floor(p.x) + this.rnd(65) - 32; z = Math.floor(p.z) + this.rnd(65) - 32;
      const b = BIOMES[w.biomeAt(x, z)];
      if (!b || (b.key !== 'swamp' && b.key !== 'beach') || Math.random() < 0.6) return;
    }
    if (!w.isLoaded(x, z) || (x - p.x) ** 2 + (z - p.z) ** 2 < 16 * 16) return;
    const y = w.topSolidY(x, z) + 2;
    if (y < 2) return;
    g.spawnMob('wisp', x + 0.5, y, z + 0.5);
  }
  spawnWraith() {
    const g = this.game, w = g.world, p = g.player;
    if (w.skyDarken() < 8 || Math.random() < 0.6) return;
    const a = Math.random() * TAU, r = 24 + Math.random() * 16;
    const x = Math.floor(p.x + Math.sin(a) * r), z = Math.floor(p.z + Math.cos(a) * r);
    if (!w.isLoaded(x, z)) return;
    const b = BIOMES[w.biomeAt(x, z)];
    if (!b || !['snowy_tundra', 'snowy_taiga', 'moors', 'mountains', 'taiga'].includes(b.key)) return;
    const y = w.heightAt(x, z) + 3 + this.rnd(4);
    if (w.getLightLevel(x, y, z) > 7) return;
    g.spawnMob('wraith', x + 0.5, y, z + 0.5);
  }
  spawnStranger() {
    const g = this.game, w = g.world, p = g.player;
    if (!p.survivalLike || p.stats.playTime < 20 * 60 * 8 || Math.random() > 0.06) return;
    const dark = w.skyDarken() >= 6 || p.y < 50;
    const b = BIOMES[w.biomeAt(Math.floor(p.x), Math.floor(p.z))];
    if (!dark && !(b && b.key === 'moors')) return;
    for (let i = 0; i < 12; i++) {
      const a = p.yaw + (Math.random() - 0.5) * 1.6, r = 22 + Math.random() * 16;
      const x = Math.floor(p.x - Math.sin(a) * r), z = Math.floor(p.z - Math.cos(a) * r);
      if (!w.isLoaded(x, z)) continue;
      for (let dy = 6; dy >= -6; dy--) {
        const y = Math.floor(p.y) + dy;
        if (!this.canStand(x, y, z, 2)) continue;
        if (!lineOfSight(w, p.x, p.y + p.eye, p.z, x + 0.5, y + 1.6, z + 0.5)) break;
        g.spawnMob('stranger', x + 0.5, y, z + 0.5);
        return;
      }
    }
  }
}
