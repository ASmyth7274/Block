'use strict';
// ---------------------------------------------------------------------------
// Rails, laid by the classic rules: a new rail links to the rails around it
// (straights, curves and slopes), T-junctions switch with an ember signal,
// booster rails pass their power along up to eight rails, detector rails
// switch on while a cart rolls over them. Also the track geometry carts use.
// ---------------------------------------------------------------------------
const Rails = (() => {
  // shape -> the two neighbours it links to [dx, dy, dz] (dy 1: that end climbs)
  const LINKS = [
    [[0, 0, -1], [0, 0, 1]], [[-1, 0, 0], [1, 0, 0]],
    [[-1, 0, 0], [1, 1, 0]], [[-1, 1, 0], [1, 0, 0]], [[0, 1, -1], [0, 0, 1]], [[0, 0, -1], [0, 1, 1]],
    [[0, 0, 1], [1, 0, 0]], [[0, 0, 1], [-1, 0, 0]], [[0, 0, -1], [-1, 0, 0]], [[0, 0, -1], [1, 0, 0]],
  ];
  // the classic cart track matrix (a slope's low end at -1)
  const TRACK = [
    [[0, 0, -1], [0, 0, 1]], [[-1, 0, 0], [1, 0, 0]],
    [[-1, -1, 0], [1, 0, 0]], [[-1, 0, 0], [1, -1, 0]], [[0, 0, -1], [0, -1, 1]], [[0, -1, -1], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0]], [[0, 0, 1], [-1, 0, 0]], [[0, 0, -1], [-1, 0, 0]], [[0, 0, -1], [1, 0, 0]],
  ];
  const isRail = (id) => id === B.RAIL || id === B.BOOSTER_RAIL || id === B.DETECTOR_RAIL;
  const shapeOf = (id, m) => id === B.RAIL ? (m & 15) : (m & 7);
  const ascending = (s) => s >= 2 && s <= 5;

  // a rail with its links, like the classic helper
  class Track {
    constructor(w, x, y, z) {
      this.w = w; this.x = x; this.y = y; this.z = z;
      this.id = w.getBlock(x, y, z); this.meta = w.getMeta(x, y, z);
      this.straight = this.id !== B.RAIL;
      this.shape = shapeOf(this.id, this.meta);
      this.links = LINKS[this.shape].map((d) => [x + d[0], y + d[1], z + d[2]]);
    }
    hasLinkXZ(x, z) { return this.links.some((l) => l[0] === x && l[2] === z); }
    connectsTo(t) { return this.hasLinkXZ(t.x, t.z); }
    // keep only links that lead to a rail which links back
    prune() {
      const out = [];
      for (const l of this.links) { const r = trackAt(this.w, l[0], l[1], l[2]); if (r && r.connectsTo(this)) out.push([r.x, r.y, r.z]); }
      this.links = out;
    }
    canTake(t) { return this.connectsTo(t) || this.links.length !== 2; }
    canConnectAt(x, y, z) { const r = trackAt(this.w, x, y, z); if (!r) return false; r.prune(); return r.canTake(this); }
    slope(shape) {
      const { w, x, y, z } = this;
      if (shape === 0) { if (isRail(w.getBlock(x, y + 1, z - 1))) shape = 4; if (isRail(w.getBlock(x, y + 1, z + 1))) shape = 5; }
      if (shape === 1) { if (isRail(w.getBlock(x + 1, y + 1, z))) shape = 2; if (isRail(w.getBlock(x - 1, y + 1, z))) shape = 3; }
      return shape;
    }
    setShape(shape) {
      this.shape = shape;
      this.links = LINKS[shape].map((d) => [this.x + d[0], this.y + d[1], this.z + d[2]]);
      this.meta = this.id === B.RAIL ? shape : (this.meta & 8) | shape;
      this.w.setBlock(this.x, this.y, this.z, this.id, this.meta);
    }
    // choose a shape from the rails around (the classic placement rule)
    place(powered, initial) {
      const { x, y, z } = this;
      const n = this.canConnectAt(x, y, z - 1), s = this.canConnectAt(x, y, z + 1), we = this.canConnectAt(x - 1, y, z), e = this.canConnectAt(x + 1, y, z);
      let shape = -1;
      if ((n || s) && !we && !e) shape = 0;
      if ((we || e) && !n && !s) shape = 1;
      if (!this.straight) {
        if (s && e && !n && !we) shape = 6;
        if (s && we && !n && !e) shape = 7;
        if (n && we && !s && !e) shape = 8;
        if (n && e && !s && !we) shape = 9;
      }
      if (shape === -1) {
        if (n || s) shape = 0;
        if (we || e) shape = 1;
        if (!this.straight) {
          if (powered) { if (s && e) shape = 6; if (we && s) shape = 7; if (e && n) shape = 9; if (n && we) shape = 8; }
          else { if (n && we) shape = 8; if (e && n) shape = 9; if (we && s) shape = 7; if (s && e) shape = 6; }
        }
      }
      shape = this.slope(shape);
      if (shape === -1) shape = this.shape;
      if (!initial && shape === this.shape) return;
      this.setShape(shape);
      for (const l of this.links) {
        const r = trackAt(this.w, l[0], l[1], l[2]);
        if (!r) continue;
        r.prune();
        if (r.canTake(this)) r.connect(this);
      }
    }
    // a neighbour asks to be linked in
    connect(t) {
      if (!this.connectsTo(t)) this.links.push([t.x, t.y, t.z]);
      const { x, z } = this;
      const n = this.hasLinkXZ(x, z - 1), s = this.hasLinkXZ(x, z + 1), we = this.hasLinkXZ(x - 1, z), e = this.hasLinkXZ(x + 1, z);
      let shape = -1;
      if (n || s) shape = 0;
      if (we || e) shape = 1;
      if (!this.straight) {
        if (s && e && !n && !we) shape = 6;
        if (s && we && !n && !e) shape = 7;
        if (n && we && !s && !e) shape = 8;
        if (n && e && !s && !we) shape = 9;
      }
      shape = this.slope(shape);
      if (shape === -1) shape = this.shape;
      this.setShape(shape);
    }
  }
  // the rail at a spot, or one block above or below it
  function trackAt(w, x, y, z) {
    if (isRail(w.getBlock(x, y, z))) return new Track(w, x, y, z);
    if (isRail(w.getBlock(x, y + 1, z))) return new Track(w, x, y + 1, z);
    if (isRail(w.getBlock(x, y - 1, z))) return new Track(w, x, y - 1, z);
    return null;
  }
  function adjacentRails(w, x, y, z) {
    let n = 0;
    for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) if (trackAt(w, x + dx, y, z + dz)) n++;
    return n;
  }
  const signal = (w, x, y, z) => typeof Circuits !== 'undefined' && Circuits.machinePower(w, x, y, z) > 0;
  // a freshly placed rail links up with its neighbours
  function placed(w, x, y, z) {
    const t = new Track(w, x, y, z);
    t.place(signal(w, x, y, z), true);
    if (t.id === B.BOOSTER_RAIL) updateBooster(w, x, y, z);
  }
  // T-junctions flip their curve when the power beside them changes
  const junctionPower = new Map();
  function neighbourChanged(w, x, y, z, id) {
    if (id !== B.RAIL) return;
    if (adjacentRails(w, x, y, z) !== 3) return;
    const p = signal(w, x, y, z), key = x + ',' + y + ',' + z;
    if (junctionPower.get(key) === p) return;
    junctionPower.set(key, p);
    if (junctionPower.size > 512) junctionPower.delete(junctionPower.keys().next().value);
    new Track(w, x, y, z).place(p, false);
  }
  // support: rails need a solid top beneath (and a slope something to lean on)
  function canStay(w, x, y, z, id, meta) {
    if (!Behaviors.isSolidTop(w, x, y - 1, z)) return false;
    const s = shapeOf(id, meta);
    if (ascending(s)) {
      const d = [[1, 0], [-1, 0], [0, -1], [0, 1]][s - 2];
      if (!Behaviors.isSolidTop(w, x + d[0], y, z + d[1])) return false;
    }
    return true;
  }

  // ------------------------------------------------------------ booster rails
  // follow the line of booster rails looking for one fed by a signal
  function chainFrom(w, x, y, z, m, forward, depth) {
    if (depth >= 8) return false;
    let i = x, j = y, k = z, flat = true, shape = m & 7;
    switch (shape) {
      case 0: if (forward) k++; else k--; break;
      case 1: if (forward) i--; else i++; break;
      case 2: if (forward) i--; else { i++; j++; flat = false; } shape = 1; break;
      case 3: if (forward) { i--; j++; flat = false; } else i++; shape = 1; break;
      case 4: if (forward) k++; else { k--; j++; flat = false; } shape = 0; break;
      case 5: if (forward) { k++; j++; flat = false; } else k--; shape = 0; break;
    }
    return chainAt(w, i, j, k, forward, depth, shape) || (flat && chainAt(w, i, j - 1, k, forward, depth, shape));
  }
  function chainAt(w, x, y, z, forward, depth, shape) {
    if (w.getBlock(x, y, z) !== B.BOOSTER_RAIL) return false;
    const m = w.getMeta(x, y, z), o = m & 7;
    if (shape === 1 && (o === 0 || o === 4 || o === 5)) return false;
    if (shape === 0 && (o === 1 || o === 2 || o === 3)) return false;
    if (!(m & 8)) return false;
    return signal(w, x, y, z) || chainFrom(w, x, y, z, m, forward, depth + 1);
  }
  function updateBooster(w, x, y, z) {
    if (w.getBlock(x, y, z) !== B.BOOSTER_RAIL) return;
    const m = w.getMeta(x, y, z), was = (m & 8) !== 0;
    const now = signal(w, x, y, z) || chainFrom(w, x, y, z, m, true, 0) || chainFrom(w, x, y, z, m, false, 0);
    if (now !== was) w.setBlock(x, y, z, B.BOOSTER_RAIL, (m & 7) | (now ? 8 : 0));
  }

  // ------------------------------------------------------------ detector rails
  function cartOn(w, x, y, z) {
    for (const e of w.entitiesInBox(x - 0.5, y - 0.5, z - 0.5, x + 1.5, y + 1.5, z + 1.5)) {
      if (e.type !== 'minecart' || e.removed) continue;
      if (e.x > x + 0.125 && e.x < x + 0.875 && e.z > z + 0.125 && e.z < z + 0.875 && e.y >= y - 0.5 && e.y < y + 1.2) return true;
    }
    return false;
  }
  function detect(w, x, y, z) {
    const m = w.getMeta(x, y, z);
    if (!(m & 8)) { w.setBlock(x, y, z, B.DETECTOR_RAIL, m | 8); w.scheduleTick(x, y, z, 20, B.DETECTOR_RAIL); }
  }
  BLOCKS[B.DETECTOR_RAIL].circuitTick = (w, x, y, z) => {
    const m = w.getMeta(x, y, z);
    if (!(m & 8)) return;
    if (cartOn(w, x, y, z)) w.scheduleTick(x, y, z, 20, B.DETECTOR_RAIL);
    else w.setBlock(x, y, z, B.DETECTOR_RAIL, m & 7);
  };

  // ------------------------------------------------------------ the track carts ride
  // the point on the rail nearest (x, y, z), or null
  function posOnTrack(w, x, y, z) {
    const i = Math.floor(x); let j = Math.floor(y); const k = Math.floor(z);
    if (isRail(w.getBlock(i, j - 1, k))) j--;
    const id = w.getBlock(i, j, k);
    if (!isRail(id)) return null;
    const t = TRACK[shapeOf(id, w.getMeta(i, j, k))];
    const x0 = i + 0.5 + t[0][0] * 0.5, y0 = j + 0.0625 + t[0][1] * 0.5, z0 = k + 0.5 + t[0][2] * 0.5;
    const x1 = i + 0.5 + t[1][0] * 0.5, y1 = j + 0.0625 + t[1][1] * 0.5, z1 = k + 0.5 + t[1][2] * 0.5;
    const dx = x1 - x0, dy = (y1 - y0) * 2, dz = z1 - z0;
    let f;
    if (dx === 0) { x = i + 0.5; f = z - k; }
    else if (dz === 0) { z = k + 0.5; f = x - i; }
    else f = ((x - x0) * dx + (z - z0) * dz) * 2;
    x = x0 + dx * f; y = y0 + dy * f; z = z0 + dz * f;
    if (dy < 0) y += 1;
    if (dy > 0) y += 0.5;
    return [x, y, z];
  }
  // the same, moved d along the track
  function posOffset(w, x, y, z, d) {
    const i = Math.floor(x); let j = Math.floor(y); const k = Math.floor(z);
    if (isRail(w.getBlock(i, j - 1, k))) j--;
    const id = w.getBlock(i, j, k);
    if (!isRail(id)) return null;
    const s = shapeOf(id, w.getMeta(i, j, k));
    y = j;
    if (ascending(s)) y = j + 1;
    const t = TRACK[s];
    let dx = t[1][0] - t[0][0], dz = t[1][2] - t[0][2];
    const len = Math.sqrt(dx * dx + dz * dz);
    dx /= len; dz /= len;
    x += dx * d; z += dz * d;
    if (t[0][1] !== 0 && Math.floor(x) - i === t[0][0] && Math.floor(z) - k === t[0][2]) y += t[0][1];
    else if (t[1][1] !== 0 && Math.floor(x) - i === t[1][0] && Math.floor(z) - k === t[1][2]) y += t[1][1];
    return posOnTrack(w, x, y, z);
  }
  return { LINKS, TRACK, isRail, shapeOf, ascending, Track, trackAt, placed, neighbourChanged, canStay, updateBooster, cartOn, detect, posOnTrack, posOffset };
})();
