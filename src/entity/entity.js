'use strict';
// ---------------------------------------------------------------------------
// Entities: base physics & living-entity logic (20 ticks per second)
// Yaw convention: yaw 0 looks toward -Z; forward = (-sin yaw, 0, -cos yaw)
// ---------------------------------------------------------------------------
class AABB {
  constructor(x0, y0, z0, x1, y1, z1) { this.x0 = x0; this.y0 = y0; this.z0 = z0; this.x1 = x1; this.y1 = y1; this.z1 = z1; }
  set(x0, y0, z0, x1, y1, z1) { this.x0 = x0; this.y0 = y0; this.z0 = z0; this.x1 = x1; this.y1 = y1; this.z1 = z1; return this; }
  copy() { return new AABB(this.x0, this.y0, this.z0, this.x1, this.y1, this.z1); }
  offset(x, y, z) { this.x0 += x; this.x1 += x; this.y0 += y; this.y1 += y; this.z0 += z; this.z1 += z; return this; }
  intersects(b) { return this.x1 > b.x0 && this.x0 < b.x1 && this.y1 > b.y0 && this.y0 < b.y1 && this.z1 > b.z0 && this.z0 < b.z1; }
  clipX(b, d) {
    if (this.y1 <= b.y0 || this.y0 >= b.y1 || this.z1 <= b.z0 || this.z0 >= b.z1) return d;
    if (d > 0 && this.x1 <= b.x0) { const m = b.x0 - this.x1; if (m < d) d = m; }
    else if (d < 0 && this.x0 >= b.x1) { const m = b.x1 - this.x0; if (m > d) d = m; }
    return d;
  }
  clipY(b, d) {
    if (this.x1 <= b.x0 || this.x0 >= b.x1 || this.z1 <= b.z0 || this.z0 >= b.z1) return d;
    if (d > 0 && this.y1 <= b.y0) { const m = b.y0 - this.y1; if (m < d) d = m; }
    else if (d < 0 && this.y0 >= b.y1) { const m = b.y1 - this.y0; if (m > d) d = m; }
    return d;
  }
  clipZ(b, d) {
    if (this.x1 <= b.x0 || this.x0 >= b.x1 || this.y1 <= b.y0 || this.y0 >= b.y1) return d;
    if (d > 0 && this.z1 <= b.z0) { const m = b.z0 - this.z1; if (m < d) d = m; }
    else if (d < 0 && this.z0 >= b.z1) { const m = b.z1 - this.z0; if (m > d) d = m; }
    return d;
  }
}

// Block collision shapes (some depend on neighbours, e.g. fences)
function blockCollisionBoxes(world, x, y, z, id, meta, out) {
  const d = BLOCKS[id];
  if (!d || !d.solid) return;
  if (id === B.FENCE || id === B.BRIMSTONE_FENCE) {
    const conn = id === B.FENCE ? (nx, nz) => { const n = world.getBlock(nx, y, nz); return n === B.FENCE || n === B.FENCE_GATE || BT.opaque[n]; }
      : (nx, nz) => { const n = world.getBlock(nx, y, nz); return n === B.BRIMSTONE_FENCE || BT.opaque[n]; };
    let x0 = 0.375, x1 = 0.625, z0 = 0.375, z1 = 0.625;
    if (conn(x - 1, z)) x0 = 0; if (conn(x + 1, z)) x1 = 1; if (conn(x, z - 1)) z0 = 0; if (conn(x, z + 1)) z1 = 1;
    out.push(new AABB(x + x0, y, z + 0.375, x + x1, y + 1.5, z + 0.625));
    out.push(new AABB(x + 0.375, y, z + z0, x + 0.625, y + 1.5, z + z1));
    return;
  }
  if (id === B.GLASS_PANE || id === B.IRON_BARS) {
    const conn = id === B.IRON_BARS ? (nx, nz) => { const n = world.getBlock(nx, y, nz); return n === B.IRON_BARS || BT.opaque[n]; }
      : (nx, nz) => { const n = world.getBlock(nx, y, nz); return n === B.GLASS_PANE || n === B.GLASS || BT.opaque[n]; };
    const n = conn(x, z - 1), s = conn(x, z + 1), w = conn(x - 1, z), e = conn(x + 1, z);
    if (!n && !s && !w && !e) { out.push(new AABB(x, y, z + 0.4375, x + 1, y + 1, z + 0.5625)); out.push(new AABB(x + 0.4375, y, z, x + 0.5625, y + 1, z + 1)); return; }
    if (n || s) out.push(new AABB(x + 0.4375, y, z + (n ? 0 : 0.4375), x + 0.5625, y + 1, z + (s ? 1 : 0.5625)));
    if (w || e) out.push(new AABB(x + (w ? 0 : 0.4375), y, z + 0.4375, x + (e ? 1 : 0.5625), y + 1, z + 0.5625));
    return;
  }
  if (d.collide) {
    const bs = d.collide(meta, world, x, y, z);
    for (const b of bs) out.push(new AABB(x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]));
    return;
  }
  out.push(new AABB(x, y, z, x + 1, y + 1, z + 1));
}
function collectBoxes(world, box, out) {
  out.length = 0;
  const x0 = Math.floor(box.x0), x1 = Math.floor(box.x1 + 1e-7), y0 = Math.floor(box.y0) - 1, y1 = Math.floor(box.y1 + 1e-7), z0 = Math.floor(box.z0), z1 = Math.floor(box.z1 + 1e-7);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const loaded = world.isLoaded(x, z);
    for (let y = y0; y <= y1; y++) {
      if (!loaded) { if (y >= 0 && y < CH_H) out.push(new AABB(x, y, z, x + 1, y + 1, z + 1)); continue; }
      if (y < 0 || y >= CH_H) continue;
      const id = world.getBlock(x, y, z);
      if (!BT.solid[id]) continue;
      const n0 = out.length;
      blockCollisionBoxes(world, x, y, z, id, world.getMeta(x, y, z), out);
      // drop boxes not touching the query region
      for (let i = out.length - 1; i >= n0; i--) if (!out[i].intersects(box)) out.splice(i, 1);
    }
  }
  return out;
}

const _boxes = [];
let ENTITY_TYPES = {};

class Entity {
  constructor(world) {
    this.world = world;
    this.id = 0;
    this.type = 'entity';
    this.x = 0; this.y = 0; this.z = 0;
    this.px = 0; this.py = 0; this.pz = 0;   // previous tick position
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0; this.pyaw = 0; this.ppitch = 0;
    this.w = 0.6; this.h = 1.8; this.eye = 1.62;
    this.stepHeight = 0;
    this.onGround = false; this.collidedH = false; this.collidedV = false;
    this.inWater = false; this.inLava = false; this.headInWater = false;
    this.fallDistance = 0;
    this.noClip = false; this.noGravity = false;
    this.age = 0;
    this.removed = false;
    this.fire = 0;
    this.inWeb = false; this.inQuicksand = false; this.onBoneSand = false;
    this.persistent = false;
    this.box = new AABB(0, 0, 0, 0, 0, 0);
  }
  setPos(x, y, z) { this.x = x; this.y = y; this.z = z; this.px = x; this.py = y; this.pz = z; this.updateBox(); }
  updateBox() { const hw = this.w / 2; this.box.set(this.x - hw, this.y, this.z - hw, this.x + hw, this.y + this.h, this.z + hw); }
  lerpPos(t) { return [this.px + (this.x - this.px) * t, this.py + (this.y - this.py) * t, this.pz + (this.z - this.pz) * t]; }
  lerpYaw(t) { return this.pyaw + wrapRadians(this.yaw - this.pyaw) * t; }
  distanceTo(e) { const dx = e.x - this.x, dy = e.y - this.y, dz = e.z - this.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  distanceSq(x, y, z) { const dx = x - this.x, dy = y - this.y, dz = z - this.z; return dx * dx + dy * dy + dz * dz; }
  blockBelow() { return this.world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z)); }

  baseTick() {
    this.px = this.x; this.py = this.y; this.pz = this.z;
    this.pyaw = this.yaw; this.ppitch = this.pitch;
    this.age++;
    this.updateFluids();
    if (this.fireImmune) this.fire = 0;
    if (this.fire > 0) {
      if (this.inWater || this.world.isRainingAt(Math.floor(this.x), Math.floor(this.y + this.h), Math.floor(this.z))) this.fire = 0;
      else { if (this.fire % 20 === 0 && this.hurt) this.hurt(1, { type: 'fire' }); this.fire--; }
    }
    if (this.inLava && !this.fireImmune) { if (this.hurt) this.hurt(4, { type: 'lava' }); this.fire = Math.max(this.fire, 300); this.fallDistance *= 0.5; }
    if (this.y < -64 && this.hurt) this.hurt(4, { type: 'void' });
  }
  updateFluids() {
    const w = this.world;
    const b = this.box;
    const x0 = Math.floor(b.x0 + 0.001), x1 = Math.floor(b.x1 - 0.001), z0 = Math.floor(b.z0 + 0.001), z1 = Math.floor(b.z1 - 0.001);
    const y0 = Math.floor(b.y0 + 0.4), y1 = Math.floor(b.y1 - 0.4);
    let water = false, lava = false, web = false, quick = false;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = Math.floor(b.y0); y <= Math.floor(b.y1 - 0.001); y++) {
      const id = w.getBlock(x, y, z);
      if (id === B.COBWEB) web = true;
      if (id === B.QUICKSAND) quick = true;
      if (y < y0 || y > y1) continue;
      if (id === B.WATER) {
        const top = y + 1 - fluidHeightFrac(w.getMeta(x, y, z));
        if (b.y0 + 0.4 <= y + 1 && b.y1 - 0.4 >= top - 0.4) water = true;
      } else if (id === B.LAVA) lava = true;
    }
    if (this.riding && this.riding.type === 'boat') water = false;
    if (water && !this.inWater) { this.fallDistance = 0; if (this.onSplash) this.onSplash(); }
    this.inWater = water;
    this.inLava = lava;
    this.inWeb = web;
    this.inQuicksand = quick;
    this.onBoneSand = w.getBlock(Math.floor(this.x), Math.floor(this.y + 0.01), Math.floor(this.z)) === B.BONESAND;
    const ey = this.y + this.eye;
    const hid = w.getBlock(Math.floor(this.x), Math.floor(ey), Math.floor(this.z));
    if (hid === B.WATER) {
      const fy = Math.floor(ey) + 1 - fluidHeightFrac(w.getMeta(Math.floor(this.x), Math.floor(ey), Math.floor(this.z))) - 0.11;
      this.headInWater = ey < fy;
    } else this.headInWater = false;
    if (water) this.fire = 0;
  }

  // Move with collision (classic axis-separated sweep with step-up)
  move(dx, dy, dz) {
    if (this.noClip) { this.x += dx; this.y += dy; this.z += dz; this.updateBox(); return; }
    if (this.inWeb) { dx *= 0.25; dy *= 0.05; dz *= 0.25; this.vx = 0; this.vy = 0; this.vz = 0; }
    if (this.inQuicksand) { dx *= 0.35; dz *= 0.35; if (dy > 0) dy *= 0.3; else dy *= 0.12; this.vy = Math.min(this.vy, 0); this.fallDistance = 0; }
    if (this.onBoneSand && this.onGround) { dx *= 0.4; dz *= 0.4; }
    const ox = dx, oy = dy, oz = dz;
    const w = this.world;
    this.updateBox();
    let box = this.box.copy();
    // sneaking: don't walk off edges
    if (this.onGround && this.sneaking) {
      const step = 0.05;
      const free = (ax, az) => { const t = box.copy().offset(ax, -1, az); collectBoxes(w, t, _boxes); return _boxes.length === 0; };
      while (dx !== 0 && free(dx, 0)) { if (Math.abs(dx) < step) dx = 0; else dx -= step * Math.sign(dx); }
      while (dz !== 0 && free(0, dz)) { if (Math.abs(dz) < step) dz = 0; else dz -= step * Math.sign(dz); }
      while (dx !== 0 && dz !== 0 && free(dx, dz)) {
        if (Math.abs(dx) < step) dx = 0; else dx -= step * Math.sign(dx);
        if (Math.abs(dz) < step) dz = 0; else dz -= step * Math.sign(dz);
      }
    }
    const sx0 = dx, sz0 = dz;
    const query = box.copy();
    if (dx < 0) query.x0 += dx; else query.x1 += dx;
    if (dy < 0) query.y0 += dy; else query.y1 += dy;
    if (dz < 0) query.z0 += dz; else query.z1 += dz;
    const boxes = collectBoxes(w, query, []);
    // boats are platforms you can stand on (and ride up and down with)
    if (w.solids && w.solids.length) {
      for (const s of w.solids) {
        if (s === this || s === this.riding || s.removed || s.rider === this) continue;
        const sb = s.box;
        if (box.x1 <= sb.x0 || box.x0 >= sb.x1 || box.z1 <= sb.z0 || box.z0 >= sb.z1) continue;
        if (box.y0 < sb.y1 - 0.15 || box.y0 > sb.y1 + Math.max(0, -dy) + 0.01) continue;
        if (box.y0 < sb.y1) box.offset(0, sb.y1 - box.y0, 0);
        boxes.push(new AABB(sb.x0, sb.y1 - 0.01, sb.z0, sb.x1, sb.y1, sb.z1));
      }
    }
    for (const b of boxes) dy = box.clipY(b, dy);
    box.offset(0, dy, 0);
    const grounded = this.onGround || (oy !== dy && oy < 0);
    for (const b of boxes) dx = box.clipX(b, dx);
    box.offset(dx, 0, 0);
    for (const b of boxes) dz = box.clipZ(b, dz);
    box.offset(0, 0, dz);
    if (this.stepHeight > 0 && grounded && (sx0 !== dx || sz0 !== dz)) {
      const sh = this.stepHeight;
      let a2 = this.box.copy();
      const q2 = a2.copy();
      if (sx0 < 0) q2.x0 += sx0; else q2.x1 += sx0;
      q2.y1 += sh;
      if (sz0 < 0) q2.z0 += sz0; else q2.z1 += sz0;
      const bx2 = collectBoxes(w, q2, []);
      let sy = sh;
      for (const b of bx2) sy = a2.clipY(b, sy);
      a2.offset(0, sy, 0);
      let sx = sx0; for (const b of bx2) sx = a2.clipX(b, sx); a2.offset(sx, 0, 0);
      let sz = sz0; for (const b of bx2) sz = a2.clipZ(b, sz); a2.offset(0, 0, sz);
      let down = -sy;
      for (const b of bx2) down = a2.clipY(b, down);
      a2.offset(0, down, 0);
      if (sx * sx + sz * sz > dx * dx + dz * dz + 1e-9) { dx = sx; dz = sz; dy = sy + down; box = a2; }
    }
    this.x = (box.x0 + box.x1) / 2; this.y = box.y0; this.z = (box.z0 + box.z1) / 2;
    this.updateBox();
    this.collidedH = sx0 !== dx || sz0 !== dz;
    this.collidedV = oy !== dy;
    const wasOnGround = this.onGround;
    this.onGround = oy !== dy && oy < 0;
    if (sx0 !== dx) this.vx = 0;
    if (sz0 !== dz) this.vz = 0;
    if (oy !== dy) this.vy = 0;
    if (this.onGround) {
      if (this.fallDistance > 0) { this.onLand(this.fallDistance); }
      this.fallDistance = 0;
    } else if (dy < 0) this.fallDistance -= dy;
    if (this.onGround && !wasOnGround && this.onHitGround) this.onHitGround();
  }
  onLand(dist) {}
  pushOutOfBlocks() {
    // nudge entities that end up inside a solid block
    const bx = Math.floor(this.x), by = Math.floor(this.y + 0.5), bz = Math.floor(this.z);
    const id = this.world.getBlock(bx, by, bz);
    if (!BT.opaque[id]) return;
    const fx = this.x - bx, fz = this.z - bz;
    const dirs = [[-1, 0, fx], [1, 0, 1 - fx], [0, -1, fz], [0, 1, 1 - fz]];
    dirs.sort((a, b) => a[2] - b[2]);
    for (const [dx, dz] of dirs) {
      if (!BT.opaque[this.world.getBlock(bx + dx, by, bz + dz)]) { this.vx += dx * 0.1; this.vz += dz * 0.1; return; }
    }
    this.vy = 0.1;
  }
  save() { return { type: this.type, x: this.x, y: this.y, z: this.z, vx: this.vx, vy: this.vy, vz: this.vz, yaw: this.yaw, age: this.age }; }
  load(d) { this.setPos(d.x, d.y, d.z); this.vx = d.vx || 0; this.vy = d.vy || 0; this.vz = d.vz || 0; this.yaw = d.yaw || 0; this.age = d.age || 0; }
}

function fluidHeightFrac(meta) {
  // fraction of the block that is *empty* above the fluid surface
  if (meta >= 8) meta = 0;
  return (meta + 1) / 9;
}

class Living extends Entity {
  constructor(world) {
    super(world);
    this.maxHealth = 20; this.health = 20;
    this.hurtTime = 0; this.hurtResist = 0; this.lastDamage = 0;
    this.deathTime = 0; this.dead = false;
    this.stepHeight = 0.6;
    this.forward = 0; this.strafe = 0; this.jumping = false; this.jumpTicks = 0;
    this.landSpeed = 0.1; this.airSpeed = 0.02;
    this.sprinting = false; this.sneaking = false;
    this.limbSwing = 0; this.limbAmount = 0; this.prevLimbAmount = 0;
    this.bodyYaw = 0; this.pbodyYaw = 0; this.headYaw = 0; this.pheadYaw = 0;
    this.swingProgress = 0; this.pswing = 0; this.swingTicks = 0; this.swinging = false;
    this.attackedBy = null; this.revengeTimer = 0;
    this.armor = [null, null, null, null];
    this.held = null;
    this.effects = {};
  }
  get alive() { return !this.dead && this.health > 0; }
  armorValue() {
    let v = 0;
    for (const a of this.armor) { if (!a) continue; const d = armorOf(a.id); if (d) v += d.points; }
    return v;
  }
  hurt(amount, src) {
    if (this.dead || this.removed) return false;
    if (this.invulnerable && src.type !== 'void') return false;
    if ((src.type === 'fire' || src.type === 'lava') && (this.fireImmune || this.effects.fireRes)) return false;
    if (this.hurtResist > 10) {
      if (amount <= this.lastDamage) return false;
      this.applyDamage(amount - this.lastDamage, src);
      this.lastDamage = amount;
      return true;
    }
    this.lastDamage = amount;
    this.hurtResist = 20;
    this.hurtTime = 10;
    this.applyDamage(amount, src);
    if (src.entity) {
      const dx = src.entity.x - this.x, dz = src.entity.z - this.z;
      this.knockback(dx, dz, src.knockback || 0.4);
      this.attackedBy = src.entity; this.revengeTimer = 100;
    }
    if (this.onHurt) this.onHurt(amount, src);
    if (this.health <= 0) this.die(src);
    return true;
  }
  applyDamage(amount, src) {
    if (src.type !== 'fire' && src.type !== 'lava' && src.type !== 'void' && src.type !== 'starve' && src.type !== 'drown' && src.type !== 'fall' && src.type !== 'magic' && src.type !== 'sonic') {
      const armor = this.armorValue();
      amount = amount * (25 - Math.min(20, armor)) / 25;
      if (this.damageArmor) this.damageArmor(amount);
    }
    if (this.enchantReduction) amount *= 1 - this.enchantReduction(src);
    this.health = Math.max(0, this.health - amount);
  }
  knockback(dx, dz, strength) {
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    this.vx /= 2; this.vy /= 2; this.vz /= 2;
    this.vx -= dx / d * strength; this.vz -= dz / d * strength;
    this.vy += strength;
    if (this.vy > 0.4) this.vy = 0.4;
  }
  heal(n) { if (!this.dead) this.health = Math.min(this.maxHealth, this.health + n); }
  die(src) {
    if (this.dead) return;
    this.dead = true;
    this.health = 0;
    if (this.onDeath) this.onDeath(src);
  }
  swing() {
    if (!this.swinging || this.swingTicks >= 3 || this.swingTicks < 0) { this.swingTicks = -1; this.swinging = true; }
  }
  updateSwing() {
    this.pswing = this.swingProgress;
    if (this.swinging) { this.swingTicks++; if (this.swingTicks >= 6) { this.swingTicks = 0; this.swinging = false; } }
    else this.swingTicks = 0;
    this.swingProgress = this.swingTicks / 6;
  }
  slipperiness() {
    const id = this.world.getBlock(Math.floor(this.x), Math.floor(this.box.y0 - 0.5), Math.floor(this.z));
    const d = BLOCKS[id];
    return d ? d.slip : 0.6;
  }
  onLadder() {
    const id = this.world.getBlock(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
    return BLOCKS[id] && BLOCKS[id].climbable;
  }
  moveFlying(strafe, forward, friction) {
    let f = strafe * strafe + forward * forward;
    if (f < 1e-4) return;
    f = Math.sqrt(f);
    if (f < 1) f = 1;
    f = friction / f;
    strafe *= f; forward *= f;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.vx += -forward * s + strafe * c;
    this.vz += -forward * c - strafe * s;
  }
  travel(strafe, forward) {
    if (this.flying) {
      this.moveFlying(strafe, forward, this.flySpeed * (this.sprinting ? 2 : 1));
      this.move(this.vx, this.vy, this.vz);
      this.vx *= 0.91; this.vz *= 0.91; this.vy *= 0.6;
      return;
    }
    if (this.inWater) {
      const y0 = this.y;
      this.moveFlying(strafe, forward, 0.02);
      this.move(this.vx, this.vy, this.vz);
      this.vx *= 0.8; this.vy *= 0.8; this.vz *= 0.8;
      this.vy -= 0.02;
      if (this.collidedH && this.isFreeOffset(this.vx, this.vy + 0.6 - this.y + y0, this.vz)) this.vy = 0.3;
      return;
    }
    if (this.inLava) {
      const y0 = this.y;
      this.moveFlying(strafe, forward, 0.02);
      this.move(this.vx, this.vy, this.vz);
      this.vx *= 0.5; this.vy *= 0.5; this.vz *= 0.5;
      this.vy -= 0.02;
      if (this.collidedH && this.isFreeOffset(this.vx, this.vy + 0.6 - this.y + y0, this.vz)) this.vy = 0.3;
      return;
    }
    let f4 = 0.91;
    if (this.onGround) f4 = this.slipperiness() * 0.91;
    const f = 0.16277136 / (f4 * f4 * f4);
    const accel = this.onGround ? this.moveSpeed() * f : (this.sprinting ? this.airSpeed * 1.3 : this.airSpeed);
    this.moveFlying(strafe, forward, accel);
    f4 = 0.91;
    if (this.onGround) f4 = this.slipperiness() * 0.91;
    const ladder = this.onLadder();
    if (ladder) {
      this.vx = clamp(this.vx, -0.15, 0.15); this.vz = clamp(this.vz, -0.15, 0.15);
      this.fallDistance = 0;
      if (this.vy < -0.15) this.vy = -0.15;
      if (this.sneaking && this.vy < 0) this.vy = 0;
    }
    this.move(this.vx, this.vy, this.vz);
    if (this.collidedH && ladder) this.vy = 0.2;
    if (!this.noGravity) this.vy -= 0.08;
    this.vy *= 0.98;
    this.vx *= f4; this.vz *= f4;
  }
  moveSpeed() { let s = this.landSpeed; if (this.sprinting) s *= 1.3; if (this.effects.slow) s *= 1 - 0.15 * Brewing.level(this, 'slow') - 0.15; if (this.effects.speed) s *= 1 + 0.2 * Brewing.level(this, 'speed'); return s; }
  isFreeOffset(dx, dy, dz) {
    const b = this.box.copy().offset(dx, dy, dz);
    collectBoxes(this.world, b, _boxes);
    if (_boxes.length) return false;
    // also must not be in liquid
    for (let x = Math.floor(b.x0); x <= Math.floor(b.x1); x++) for (let y = Math.floor(b.y0); y <= Math.floor(b.y1); y++) for (let z = Math.floor(b.z0); z <= Math.floor(b.z1); z++) {
      if (BT.fluid[this.world.getBlock(x, y, z)]) return false;
    }
    return true;
  }
  jump() {
    this.vy = 0.42;
    if (this.effects.jump) this.vy += 0.1 * Brewing.level(this, 'jump');
    if (this.sprinting) { this.vx -= Math.sin(this.yaw) * 0.2; this.vz -= Math.cos(this.yaw) * 0.2; }
    if (this.onJump) this.onJump();
  }
  livingTick() {
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.hurtResist > 0) this.hurtResist--;
    if (this.revengeTimer > 0 && --this.revengeTimer === 0) this.attackedBy = null;
    if (this.dead) { this.deathTime++; this.vx *= 0.5; this.vz *= 0.5; }
    if (this.riding) {
      // carried by a vehicle: it sets our position
      this.vx = this.vy = this.vz = 0; this.fallDistance = 0; this.jumpTicks = 0;
    } else {
      // jumping / swimming
      if (this.jumpTicks > 0) this.jumpTicks--;
      if (this.jumping && !this.dead) {
        if (this.inWater || this.inLava) this.vy += 0.04;
        else if (this.onGround && this.jumpTicks === 0) { this.jump(); this.jumpTicks = 10; }
      } else this.jumpTicks = 0;
      let strafe = this.strafe, forward = this.forward;
      if (this.dead) { strafe = 0; forward = 0; }
      if (Math.abs(this.vx) < 0.003) this.vx = 0;
      if (Math.abs(this.vy) < 0.003) this.vy = 0;
      if (Math.abs(this.vz) < 0.003) this.vz = 0;
      this.travel(strafe, forward);
      this.pushOutOfBlocks();
    }
    // limb animation
    this.prevLimbAmount = this.limbAmount;
    const dx = this.x - this.px, dz = this.z - this.pz;
    let dist = this.riding ? 0 : Math.sqrt(dx * dx + dz * dz) * 4;
    if (dist > 1) dist = 1;
    this.limbAmount += (dist - this.limbAmount) * 0.4;
    this.limbSwing += this.limbAmount;
    // body follows movement direction
    this.pbodyYaw = this.bodyYaw; this.pheadYaw = this.headYaw;
    if (dx * dx + dz * dz > 0.0025 && !this.riding) {
      const target = Math.atan2(-dx, -dz);
      this.bodyYaw += wrapRadians(target - this.bodyYaw) * 0.3;
    }
    let diff = wrapRadians(this.yaw - this.bodyYaw);
    if (diff > 1.3) this.bodyYaw += diff - 1.3; else if (diff < -1.3) this.bodyYaw += diff + 1.3;
    this.headYaw = this.yaw;
    this.updateSwing();
    const ef = this.effects;
    if (ef.poison && !this.undead && !this.dead && this.age % Math.max(1, 25 >> Brewing.amp(this, 'poison')) === 0 && this.health > 1) this.hurt(1, { type: 'magic' });
    if (ef.regen && !this.undead && !this.dead && this.age % Math.max(1, 50 >> Brewing.amp(this, 'regen')) === 0) this.heal(1);
    for (const k in ef) { if (--ef[k] <= 0) { delete ef[k]; if (this.effectAmp) delete this.effectAmp[k]; } }
  }
}
