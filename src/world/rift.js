'use strict';
// ---------------------------------------------------------------------------
// The rift: twelve frames round a pool of lava, deep in a Vault. Set a
// Seeker's Eye in every one and the rift opens onto the Far Isles.
// A thrown Seeker's Eye drifts off toward the nearest Vault, then falls back
// to earth (or, now and then, crumbles away).
// ---------------------------------------------------------------------------
const Rift = (() => {
  // the twelve frame positions round a 3x3 rift centred at (cx, cz)
  function ring(cx, cz) {
    const out = [];
    for (let d = -1; d <= 1; d++) out.push([cx + d, cz - 2], [cx + d, cz + 2], [cx - 2, cz + d], [cx + 2, cz + d]);
    return out;
  }
  function complete(w, cx, y, cz) {
    for (const [x, z] of ring(cx, cz)) if (w.getBlock(x, y, z) !== B.RIFT_FRAME || !(w.getMeta(x, y, z) & 4)) return false;
    return true;
  }
  // set an eye into a frame; returns true if it took
  function insertEye(game, x, y, z) {
    const w = game.world, m = w.getMeta(x, y, z);
    if (w.getBlock(x, y, z) !== B.RIFT_FRAME || (m & 4)) return false;
    w.setBlock(x, y, z, B.RIFT_FRAME, m | 4);
    game.audio.play('eye_set', 0.8, 0.9 + Math.random() * 0.2, x + 0.5, y + 0.5, z + 0.5);
    for (let i = 0; i < 12; i++) game.particles.sparkle(x + 0.5 + (Math.random() - 0.5) * 0.6, y + 1, z + 0.5 + (Math.random() - 0.5) * 0.6, 0.4, 1, 0.85, 1, 0.8);
    // does this complete a ring?
    for (let cx = x - 2; cx <= x + 2; cx++) for (let cz = z - 2; cz <= z + 2; cz++) {
      if (!complete(w, cx, y, cz)) continue;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) w.setBlock(cx + dx, y, cz + dz, B.RIFT, 0);
      game.audio.play('rift_open', 1.5, 1, cx + 0.5, y + 0.5, cz + 0.5);
      game.achieve('rift');
      return true;
    }
    return true;
  }
  return { ring, complete, insertEye };
})();

class SeekerEye extends Entity {
  constructor(world, x, y, z, tx, tz) {
    super(world);
    this.type = 'seeker_eye';
    this.w = this.h = 0.25;
    this.setPos(x, y, z);
    // head for the vault, or at most twelve blocks toward it
    const dx = tx - x, dz = tz - z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    if (d > 12) { this.tx = x + dx / d * 12; this.tz = z + dz / d * 12; this.ty = y + 8; }
    else { this.tx = tx; this.tz = tz; this.ty = y; }
    this.life = 0;
    this.shatter = Math.random() < 0.2;
  }
  tick(game) {
    this.px = this.x; this.py = this.y; this.pz = this.z;
    this.age++;
    const dx = this.tx - this.x, dz = this.tz - this.z, hd = Math.sqrt(dx * dx + dz * dz);
    let sp = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
    const ang = Math.atan2(dz, dx);
    sp = sp + (hd > 1 ? 0.0025 : -0.0025) * 10; if (sp > hd * 0.04) sp = hd * 0.04; if (sp < 0) sp = 0;
    this.vx = Math.cos(ang) * sp; this.vz = Math.sin(ang) * sp;
    this.vy += ((this.y < this.ty ? 1 : -1) * 0.015 - this.vy) * 0.1;
    this.x += this.vx; this.y += this.vy; this.z += this.vz;
    this.updateBox();
    if (this.age % 2 === 0) game.particles.sparkle(this.x - this.vx * 0.5, this.y - 0.1, this.z - this.vz * 0.5, 0.4, 0.95, 0.85, 1, 0.5);
    if (++this.life > 80) {
      this.removed = true;
      game.audio.play('eye_drop', 0.8, 1, this.x, this.y, this.z);
      if (this.shatter) { for (let i = 0; i < 16; i++) game.particles.sparkle(this.x, this.y, this.z, 0.4, 1, 0.85, 1, 1.2); }
      else Behaviors.dropStack(game, this.x, this.y, this.z, new ItemStack(ITEM_IDS.seeker_eye, 1, 0));
    }
  }
  render(er, rx, ry, rz) {
    const cam = er.game.camera;
    let m = M3.trans(rx, ry, rz);
    m = M3.mul(m, M3.ry(cam.yaw));
    m = M3.mul(m, M3.scale(0.5, 0.5, 0.5));
    m = M3.mul(m, M3.trans(-0.5, -0.5, 0));
    er.drawItem(new ItemStack(ITEM_IDS.seeker_eye, 1, 0), m, 1, 1, 255, true);
    er.glow(rx, ry, rz, 0.4, [120, 255, 220, 90]);
  }
  save() { return null; }
}
