'use strict';
// ---------------------------------------------------------------------------
// Creatures of the Vaults (and, beyond the rift, the Far Isles).
// ---------------------------------------------------------------------------
MOB_TYPES.push(
  { key: 'mite', name: 'Vault Mite', egg: ['#6e6e6e', '#3a3a3a'], cat: 'monster', lore: 'A grey burrowing thing that nests in the walls of the old Vaults. Strike one and the bricks around you start to wriggle.' },
);
MOB_TYPES.forEach((m, i) => { if (m) { m.index = i; MOB_INDEX[m.key] = m; } });

class Mite extends Monster {
  constructor(world) {
    super(world, 'mite');
    this.arthropod = true;
    this.maxHealth = this.health = 8;
    this.w = 0.4; this.h = 0.3; this.eye = 0.13;
    this.baseSpeed = 0.32; this.damage = 1;
    this.spotRange = 16; this.followRange = 24;
    this.callTimer = 0;
    this.xpValue = 5;
    this.pathNodes = 160;
  }
  meleeReach(t) { return 1.2 + t.w; }
  onRevenge(e) {
    super.onRevenge(e);
    // its kin wake up in the walls around it
    if (this.callTimer > 0 || !this.game) return;
    this.callTimer = 20;
    const w = this.world, bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    let n = 0;
    for (let dy = -2; dy <= 3 && n < 4; dy++) for (let dx = -5; dx <= 5 && n < 4; dx++) for (let dz = -5; dz <= 5 && n < 4; dz++) {
      if (w.getBlock(bx + dx, by + dy, bz + dz) !== B.INFESTED_BRICKS) continue;
      w.setBlock(bx + dx, by + dy, bz + dz, 0, 0);
      releaseMite(this.game, bx + dx, by + dy, bz + dz, e);
      n++;
    }
  }
  mobTick() { if (this.callTimer > 0) this.callTimer--; }
  soundVolume() { return 0.6; }
  dropLoot() {}
  render(er, rx, ry, rz, partial) {
    const [sky, blk] = er.lightAt(this.x, this.y + 0.2, this.z);
    const t = this.limbSwing - this.limbAmount * (1 - partial);
    const pose = {};
    for (let i = 0; i < 7; i++) pose['s' + i] = { rot: [0, Math.cos(t * 0.9 + i * 0.15 * Math.PI) * Math.PI * 0.05 * (1 + Math.abs(i - 2)), 0], off: [Math.sin(t * 0.9 + i * 0.15 * Math.PI) * Math.PI * 0.2 * Math.abs(i - 2), 0, 0] };
    er.drawModel(MODELS.mite, 'mite', er.baseMatrix(this, rx, ry, rz, partial), pose, er.entColor(this), sky, blk);
  }
}
// a mite bursts out of a broken (or disturbed) infested brick
function releaseMite(game, x, y, z, foe) {
  const m = game.spawnMob('mite', x + 0.5, y, z + 0.5);
  if (m && foe && foe.type === 'player') { m.target = foe; m.unseen = 0; }
  game.particles.burst(x + 0.5, y + 0.5, z + 0.5, 'stone_bricks', 10);
  return m;
}
MOB_CLASSES.mite = Mite;
