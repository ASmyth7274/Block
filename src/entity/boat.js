'use strict';
// ---------------------------------------------------------------------------
// Boats, in the classic style: they float half-submerged, pick up speed while
// you keep rowing, steer toward where you look and crack up in a hard crash.
// Every wood makes its own boat.
// ---------------------------------------------------------------------------
class Boat extends Entity {
  constructor(world, x, y, z, wood) {
    super(world);
    this.type = 'boat';
    this.wood = wood || 0;
    this.w = 1.5; this.h = 0.6;
    this.setPos(x, y, z);
    this.rider = null;
    this.speedMult = 0.07;
    this.damage = 0; this.hitTime = 0; this.hitDir = 1;
    this.persistent = true;
    this.blocksPlacement = true;
    this.solid = true;
  }
  // classic rider seat: a little behind the middle, low in the hull
  seat() { return [this.x + Math.sin(this.yaw) * 0.4, this.y - 0.65, this.z + Math.cos(this.yaw) * 0.4]; }
  waterFraction() {
    const w = this.world, b = this.box;
    let n = 0;
    for (let j = 0; j < 5; j++) {
      const y0 = b.y0 + (b.y1 - b.y0) * j / 5 - 0.125, y1 = b.y0 + (b.y1 - b.y0) * (j + 1) / 5 - 0.125;
      let hit = false;
      for (let by = Math.floor(y0); by <= Math.floor(y1) && !hit; by++) {
        for (let x = Math.floor(b.x0); x <= Math.floor(b.x1 - 1e-7) && !hit; x++) for (let z = Math.floor(b.z0); z <= Math.floor(b.z1 - 1e-7) && !hit; z++) {
          if (w.getBlock(x, by, z) === B.WATER && by + 1 - fluidHeightFrac(w.getMeta(x, by, z)) >= y0) hit = true;
        }
      }
      if (hit) n += 0.2;
    }
    return n;
  }
  tick(game) {
    this.baseTick();
    if (this.hitTime > 0) this.hitTime--;
    if (this.damage > 0) this.damage = Math.max(0, this.damage - 1);
    const w = this.world;
    const r = this.rider;
    if (r && (r.removed || r.dead || r.riding !== this)) this.rider = null;
    const water = this.waterFraction();
    const sp0 = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
    if (sp0 > 0.2975) {
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
      for (let i = 0; i < 1 + sp0 * 60 * game.particles.density(); i++) {
        const f = Math.random() * 2 - 1, g = (Math.floor(Math.random() * 2) * 2 - 1) * 0.7;
        const px = this.x - s * f * 0.8 + c * g, pz = this.z - c * f * 0.8 - s * g;
        game.particles.wake(px, this.y + 0.125, pz, this.vx * 0.5, this.vz * 0.5);
      }
    }
    if (water < 1) this.vy += 0.04 * (water * 2 - 1);
    else { if (this.vy < 0) this.vy /= 2; this.vy += 0.007; }
    if (this.rider) {
      // the boat goes where its rider looks (forward/back with strafing bending the course)
      const rr = this.rider;
      const dir = rr.yaw - rr.strafe * Math.PI / 2;
      this.vx += -Math.sin(dir) * this.speedMult * rr.forward * 0.05;
      this.vz += -Math.cos(dir) * this.speedMult * rr.forward * 0.05;
    }
    let sp = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
    if (sp > 0.35) { const k = 0.35 / sp; this.vx *= k; this.vz *= k; sp = 0.35; }
    if (sp > sp0 && this.speedMult < 0.35) this.speedMult = Math.min(0.35, this.speedMult + (0.35 - this.speedMult) / 35);
    else this.speedMult = Math.max(0.07, this.speedMult - (this.speedMult - 0.07) / 35);
    // boats crush snow and lily pads they run over
    for (let i = 0; i < 4; i++) {
      const bx = Math.floor(this.x + ((i % 2) - 0.5) * 0.8), bz = Math.floor(this.z + ((i >> 1) - 0.5) * 0.8);
      for (let j = 0; j < 2; j++) {
        const by = Math.floor(this.y) + j, id = w.getBlock(bx, by, bz);
        if (id === B.SNOW_LAYER) w.setBlock(bx, by, bz, 0);
        else if (id === B.LILY_PAD) { w.setBlock(bx, by, bz, 0); game.particles.breakBlock(bx, by, bz, id, 0); Behaviors.dropStack(game, bx + 0.5, by + 0.5, bz + 0.5, new ItemStack(B.LILY_PAD, 1, 0)); }
      }
    }
    if (this.onGround) { this.vx *= 0.5; this.vy *= 0.5; this.vz *= 0.5; }
    this.move(this.vx, this.vy, this.vz);
    if (this.collidedH && sp0 > 0.3) {
      // a hard crash splinters the boat (you keep it though)
      game.audio.playBlock('wood', 'break', this.x, this.y, this.z);
      this.breakApart(game, true);
      return;
    }
    this.vx *= 0.99; this.vy *= 0.95; this.vz *= 0.99;
    // turn toward the direction of travel, at most 20 degrees a tick
    const dx = this.x - this.px, dz = this.z - this.pz;
    if (dx * dx + dz * dz > 0.001) {
      const target = Math.atan2(-dx, -dz);
      let d = wrapRadians(target - this.yaw);
      // a boat is the same at both ends: never spin round to reverse
      if (d > Math.PI / 2) d -= Math.PI; else if (d < -Math.PI / 2) d += Math.PI;
      this.yaw += clamp(d, -20 * DEG, 20 * DEG);
    }
    if (this.rider) {
      const [sx, sy, sz] = this.seat();
      const rr = this.rider;
      rr.x = sx; rr.y = sy; rr.z = sz; rr.updateBox();
      rr.vx = rr.vy = rr.vz = 0; rr.fallDistance = 0; rr.onGround = true;
    }
  }
  mount(p) {
    if (this.rider || p.riding) return false;
    this.rider = p; p.riding = this;
    p.sprinting = false; p.sneaking = false;
    const [sx, sy, sz] = this.seat();
    p.setPos(sx, sy, sz);
    return true;
  }
  dismount() {
    const p = this.rider;
    if (!p) return;
    this.rider = null; p.riding = null;
    // classic: you hop out on top of the boat
    p.setPos(this.x, this.y + this.h + 0.01, this.z);
    p.vx = p.vy = p.vz = 0;
  }
  interact(p) {
    if (p.riding === this) return false;
    if (this.rider) return false;
    if (p.sneaking) return false;
    return this.mount(p);
  }
  hurt(amount, src) {
    if (this.removed) return false;
    const g = this.world.game;
    if (src && src.entity && src.entity === this.rider) return false;
    this.hitDir = -this.hitDir;
    this.hitTime = 10;
    this.damage += (amount || 1) * 10;
    const creative = src && src.entity && src.entity.type === 'player' && src.entity.creative;
    if (creative || this.damage > 40 || (src && (src.type === 'explosion' || src.type === 'lava'))) {
      if (g) this.breakApart(g, !creative);
    }
    return true;
  }
  breakApart(game, drop) {
    if (this.removed) return;
    if (this.rider) this.dismount();
    this.removed = true;
    if (drop) Behaviors.dropStack(game, this.x, this.y + 0.3, this.z, new ItemStack(ITEM_IDS.boat, 1, this.wood));
  }
  save() { const d = super.save(); d.wood = this.wood; return d; }
  load(d) { super.load(d); this.wood = d.wood || 0; this.pyaw = this.yaw; }
}
