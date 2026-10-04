'use strict';
// ---------------------------------------------------------------------------
// Paintings hang on walls. Placing one picks a random canvas among those that
// fit the wall (as in the classic game, so you may need a few tries to get
// the one you want). They drop off when their wall is removed.
// facing: direction the picture faces (0 N -Z, 1 S +Z, 2 W -X, 3 E +X)
// ---------------------------------------------------------------------------
const PAINT_CCW = [2, 3, 1, 0];   // the classic rotateYCCW of each facing

class Painting extends Entity {
  constructor(world, bx, by, bz, facing, art) {
    super(world);
    this.type = 'painting';
    this.noGravity = true;
    this.persistent = true;
    this.set(bx, by, bz, facing, art || 'wisp');
  }
  get artDef() { return Paintings.byKey[this.art] || Paintings.ART[0]; }
  set(bx, by, bz, facing, art) {
    this.bx = bx; this.by = by; this.bz = bz; this.facing = facing; this.art = art;
    const a = this.artDef;
    const n = HFACE_DIR[facing], s = HFACE_DIR[PAINT_CCW[facing]];
    const sh = a.w % 2 === 0 ? 0.5 : 0, sv = a.h % 2 === 0 ? 0.5 : 0;
    const x = bx + 0.5 - n[0] * 0.46875 + s[0] * sh, z = bz + 0.5 - n[1] * 0.46875 + s[1] * sh, y = by + 0.5 + sv;
    this.cx = x; this.cy = y; this.cz = z;
    this.setPos(x, y - a.h / 2, z);
  }
  updateBox() {
    const a = this.artDef || { w: 1, h: 1 };
    const n = HFACE_DIR[this.facing || 0];
    const hw = a.w / 2 - 0.03125, hh = a.h / 2 - 0.03125, hd = 0.03125;
    const ex = n[0] ? hd : hw, ez = n[0] ? hw : hd;
    const cy = this.y + a.h / 2;
    this.box.set(this.x - ex, cy - hh, this.z - ez, this.x + ex, cy + hh, this.z + ez);
  }
  // the blocks (relative to the hanging block) that the canvas covers: [along, up]
  static cells(a) {
    const out = [];
    const c0 = -Math.floor((a.w - 1) / 2), r0 = -Math.floor((a.h - 1) / 2);
    for (let i = 0; i < a.w; i++) for (let j = 0; j < a.h; j++) out.push([c0 + i, r0 + j]);
    return out;
  }
  static fits(world, bx, by, bz, facing, a, self) {
    const n = HFACE_DIR[facing], s = HFACE_DIR[PAINT_CCW[facing]];
    for (const [i, j] of Painting.cells(a)) {
      const x = bx + s[0] * i, y = by + j, z = bz + s[1] * i;
      if (y < 1 || y >= CH_H) return false;
      const wall = world.getBlock(x - n[0], y, z - n[1]);
      if (!BT.solid[wall] || BLOCKS[wall].render !== R.CUBE) return false;
      const here = world.getBlock(x, y, z);
      if (BT.solid[here] || BT.fluid[here]) return false;
    }
    // no overlapping pictures
    const p = new Painting(world, bx, by, bz, facing, a.key);
    p.updateBox();
    for (const e of world.entities) {
      if (e.type !== 'painting' || e.removed || e === self) continue;
      e.updateBox();
      if (e.box.intersects(p.box)) return false;
    }
    return true;
  }
  // try to hang a painting against the clicked face; returns the entity or null
  static place(game, hit) {
    if (hit.face < 2) return null;
    const facing = [-1, -1, 0, 1, 2, 3][hit.face];
    const n = HFACE_DIR[facing];
    const bx = hit.x + n[0], by = hit.y, bz = hit.z + n[1];
    const w = game.world;
    const ok = Paintings.ART.filter((a) => Painting.fits(w, bx, by, bz, facing, a));
    if (!ok.length) return null;
    const a = ok[Math.floor(Math.random() * ok.length)];
    const p = new Painting(w, bx, by, bz, facing, a.key);
    game.spawnEntity(p);
    return p;
  }
  tick(game) {
    this.age++;
    if (this.age % 100 === 1 && !Painting.fits(this.world, this.bx, this.by, this.bz, this.facing, this.artDef, this)) this.drop(game, true);
  }
  drop(game, item) {
    if (this.removed) return;
    this.removed = true;
    game.audio.playBlock('wood', 'break', this.cx, this.cy, this.cz);
    if (item) Behaviors.dropStack(game, this.cx, this.cy, this.cz, new ItemStack(ITEM_IDS.painting, 1, 0));
  }
  hurt(amount, src) {
    if (this.removed) return false;
    const g = this.world.game;
    const creative = src && src.entity && src.entity.type === 'player' && src.entity.creative;
    if (g) this.drop(g, !creative);
    return true;
  }
  save() { return { type: 'painting', x: this.x, y: this.y, z: this.z, bx: this.bx, by: this.by, bz: this.bz, facing: this.facing, art: this.art }; }
  load(d) { this.set(d.bx, d.by, d.bz, d.facing || 0, Paintings.byKey[d.art] ? d.art : 'wisp'); }
}
