'use strict';
// ---------------------------------------------------------------------------
// Minecarts, rolling by the classic rules: they hug the track, coast down
// slopes, take a shove from a powered booster rail and brake on an unpowered
// one, trip detector rails and scoop up any creature they bump into.
// A chest minecart carries 27 slots of cargo.
// ---------------------------------------------------------------------------
class Minecart extends Entity {
  constructor(world, x, y, z, kind) {
    super(world);
    this.type = 'minecart';
    this.kind = kind || 0;             // 0 rideable, 1 chest
    this.w = 0.98; this.h = 0.7;
    this.setPos(x, y, z);
    this.rider = null;
    this.damage = 0; this.hitTime = 0; this.hitDir = 1;
    this.persistent = true;
    this.reverse = false;
    this.items = this.kind === 1 ? new Array(27).fill(null) : null;
    this.rumble = 0; this.lastCell = '';
  }
  get speed() { return Math.sqrt(this.vx * this.vx + this.vz * this.vz); }
  seat() { return [this.x, this.y - 0.5, this.z]; }
  tick(game) {
    this.baseTick();
    if (this.hitTime > 0) this.hitTime--;
    if (this.damage > 0) this.damage = Math.max(0, this.damage - 1);
    if (this.y < -64) { this.removed = true; return; }
    const w = this.world;
    const r = this.rider;
    if (r && (r.removed || r.dead || r.riding !== this)) this.rider = null;
    this.vy -= 0.04;
    const bx = Math.floor(this.x), bz = Math.floor(this.z);
    let by = Math.floor(this.y);
    if (Rails.isRail(w.getBlock(bx, by - 1, bz))) by--;
    const id = w.getBlock(bx, by, bz);
    if (Rails.isRail(id)) {
      this.onRail(game, bx, by, bz, id, w.getMeta(bx, by, bz));
      if (id === B.DETECTOR_RAIL) Rails.detect(w, bx, by, bz);
    } else this.offRail();
    // face the way it rolls (a cart is the same at both ends)
    const dx = this.px - this.x, dz = this.pz - this.z;
    if (dx * dx + dz * dz > 0.001) { this.yaw = Math.atan2(dz, dx); if (this.reverse) this.yaw += Math.PI; }
    const d = wrapRadians(this.yaw - this.pyaw);
    if (d < -170 * DEG || d >= 170 * DEG) { this.yaw += Math.PI; this.reverse = !this.reverse; }
    this.bump(game);
    if (this.rider) {
      const [sx, sy, sz] = this.seat(), rr = this.rider;
      rr.x = sx; rr.y = sy; rr.z = sz; rr.updateBox();
      rr.vx = rr.vy = rr.vz = 0; rr.fallDistance = 0; rr.onGround = true;
    }
    // the rumble of wheels on iron
    const sp = this.speed;
    if (sp > 0.03 && Rails.isRail(id)) {
      const cell = bx + ',' + bz;
      if (cell !== this.lastCell) { this.lastCell = cell; game.audio.play('rail_clack', Math.min(0.6, sp * 1.4), 0.9 + sp * 0.4, this.x, this.y, this.z); }
      if (--this.rumble <= 0) { this.rumble = 9; game.audio.play('minecart_roll', Math.min(0.7, sp * 1.6), 0.7 + sp * 0.8, this.x, this.y, this.z); }
    }
  }
  // classic rail following
  onRail(game, bx, by, bz, id, m) {
    const w = this.world;
    this.fallDistance = 0;
    const before = Rails.posOnTrack(w, this.x, this.y, this.z);
    this.y = by;
    let boost = false, brake = false;
    if (id === B.BOOSTER_RAIL) { boost = (m & 8) !== 0; brake = !boost; }
    const shape = Rails.shapeOf(id, m);
    const slope = 0.0078125;
    switch (shape) {
      case 2: this.vx -= slope; this.y++; break;
      case 3: this.vx += slope; this.y++; break;
      case 4: this.vz += slope; this.y++; break;
      case 5: this.vz -= slope; this.y++; break;
    }
    const t = Rails.TRACK[shape];
    let lx = t[1][0] - t[0][0], lz = t[1][2] - t[0][2];
    const ll = Math.sqrt(lx * lx + lz * lz);
    if (this.vx * lx + this.vz * lz < 0) { lx = -lx; lz = -lz; }
    let sp = this.speed;
    if (sp > 2) sp = 2;
    this.vx = sp * lx / ll; this.vz = sp * lz / ll;
    // a rider can nudge a stopped cart along
    const r = this.rider;
    if (r && r.forward > 0 && this.vx * this.vx + this.vz * this.vz < 0.01) {
      this.vx += -Math.sin(r.yaw) * 0.1; this.vz += -Math.cos(r.yaw) * 0.1;
      brake = false;
    }
    if (brake) {
      if (this.speed < 0.03) { this.vx = 0; this.vy = 0; this.vz = 0; }
      else { this.vx *= 0.5; this.vy = 0; this.vz *= 0.5; }
    }
    // snap onto the line of the rail
    const x0 = bx + 0.5 + t[0][0] * 0.5, z0 = bz + 0.5 + t[0][2] * 0.5, x1 = bx + 0.5 + t[1][0] * 0.5, z1 = bz + 0.5 + t[1][2] * 0.5;
    const ax = x1 - x0, az = z1 - z0;
    let f;
    if (ax === 0) { this.x = bx + 0.5; f = this.z - bz; }
    else if (az === 0) { this.z = bz + 0.5; f = this.x - bx; }
    else f = ((this.x - x0) * ax + (this.z - z0) * az) * 2;
    this.x = x0 + ax * f; this.z = z0 + az * f;
    this.updateBox();
    let mx = this.vx, mz = this.vz;
    if (this.rider) { mx *= 0.75; mz *= 0.75; }
    mx = clamp(mx, -0.4, 0.4); mz = clamp(mz, -0.4, 0.4);
    const keepX = this.vx, keepZ = this.vz;
    this.move(mx, 0, mz);
    if (!this.collidedH) { this.vx = keepX; this.vz = keepZ; }
    if (t[0][1] !== 0 && Math.floor(this.x) - bx === t[0][0] && Math.floor(this.z) - bz === t[0][2]) { this.y += t[0][1]; this.updateBox(); }
    else if (t[1][1] !== 0 && Math.floor(this.x) - bx === t[1][0] && Math.floor(this.z) - bz === t[1][2]) { this.y += t[1][1]; this.updateBox(); }
    const drag = this.rider ? 0.997 : 0.96;
    this.vx *= drag; this.vy = 0; this.vz *= drag;
    const after = Rails.posOnTrack(w, this.x, this.y, this.z);
    if (after && before) {
      // rolling downhill speeds a cart up, uphill slows it
      const dy = (before[1] - after[1]) * 0.05, s = this.speed;
      if (s > 0) { this.vx = this.vx / s * (s + dy); this.vz = this.vz / s * (s + dy); }
      this.y = after[1]; this.updateBox();
    }
    const nx = Math.floor(this.x), nz = Math.floor(this.z);
    if (nx !== bx || nz !== bz) { const s = this.speed; this.vx = s * (nx - bx); this.vz = s * (nz - bz); }
    if (boost) {
      const s = this.speed;
      if (s > 0.01) { this.vx += this.vx / s * 0.06; this.vz += this.vz / s * 0.06; }
      else if (shape === 1) { if (BT.opaque[w.getBlock(bx - 1, by, bz)]) this.vx = 0.02; else if (BT.opaque[w.getBlock(bx + 1, by, bz)]) this.vx = -0.02; }
      else if (shape === 0) { if (BT.opaque[w.getBlock(bx, by, bz - 1)]) this.vz = 0.02; else if (BT.opaque[w.getBlock(bx, by, bz + 1)]) this.vz = -0.02; }
    }
  }
  offRail() {
    this.vx = clamp(this.vx, -0.4, 0.4); this.vz = clamp(this.vz, -0.4, 0.4);
    if (this.onGround) { this.vx *= 0.5; this.vy *= 0.5; this.vz *= 0.5; }
    if (this.inWater) { this.vy *= 0.6; this.vy += 0.02; }
    this.move(this.vx, this.vy, this.vz);
    if (!this.onGround) { this.vx *= 0.95; this.vy *= 0.95; this.vz *= 0.95; }
  }
  // an empty rolling cart scoops up a creature it runs into; carts nudge carts
  bump(game) {
    const w = this.world, b = this.box;
    for (const e of w.entitiesInBox(b.x0 - 0.2, b.y0, b.z0 - 0.2, b.x1 + 0.2, b.y1, b.z1 + 0.2)) {
      if (e === this || e === this.rider || e.removed || e.dead) continue;
      if (this.kind === 0 && !this.rider && !e.riding && e.category && e.category !== 'ambient' && e.category !== 'water' && e.type !== 'wisp' && e.type !== 'stranger' && this.vx * this.vx + this.vz * this.vz > 0.01) { this.mount(e); continue; }
      if (e.type === 'minecart') {
        let dx = e.x - this.x, dz = e.z - this.z;
        const dd = dx * dx + dz * dz;
        if (dd < 1e-4) continue;
        const l = Math.sqrt(dd); dx /= l; dz /= l;
        const k = Math.min(1, 1 / l) * 0.05;
        // trade momentum, roughly like the classic carts do
        const avx = (this.vx + e.vx) / 2, avz = (this.vz + e.vz) / 2;
        this.vx = avx - dx * k; this.vz = avz - dz * k;
        e.vx = avx + dx * k; e.vz = avz + dz * k;
      }
    }
  }
  mount(e) {
    if (this.rider || e.riding || this.kind !== 0) return false;
    this.rider = e; e.riding = this;
    e.sprinting = false; e.sneaking = false;
    if (e.clearPath) e.clearPath();
    const [sx, sy, sz] = this.seat();
    e.setPos(sx, sy, sz);
    return true;
  }
  dismount() {
    const p = this.rider;
    if (!p) return;
    this.rider = null; p.riding = null;
    p.setPos(this.x, this.y + this.h + 0.01, this.z);
    p.vx = p.vy = p.vz = 0;
  }
  interact(p) {
    if (this.kind === 1) {
      p.game.openScreen(new CartChestScreen(p.game, this));
      if (this.relic) { this.relic = false; p.game.achieve('mineshaft'); }
      return true;
    }
    if (p.riding === this || p.sneaking) return false;
    if (this.rider) return false;
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
    if (this.items) for (const s of this.items) if (s) Behaviors.dropStack(game, this.x, this.y + 0.3, this.z, s);
    if (drop) {
      Behaviors.dropStack(game, this.x, this.y + 0.3, this.z, new ItemStack(ITEM_IDS.minecart, 1, 0));
      if (this.kind === 1) Behaviors.dropStack(game, this.x, this.y + 0.3, this.z, new ItemStack(B.CHEST, 1, 0));
    }
  }
  save() {
    const d = super.save();
    d.kind = this.kind;
    if (this.relic) d.relic = true;
    if (this.items) d.items = this.items.map((s) => s ? s.toJSON() : null);
    return d;
  }
  load(d) {
    super.load(d);
    this.kind = d.kind || 0; this.pyaw = this.yaw; this.relic = !!d.relic;
    if (this.kind === 1) this.items = (d.items || []).concat(new Array(27).fill(null)).slice(0, 27).map((s) => s ? ItemStack.fromJSON(s) : null);
  }
}
