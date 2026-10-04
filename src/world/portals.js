'use strict';
// ---------------------------------------------------------------------------
// Underworld portals. An obsidian frame (2x3 to 21x21 inside, corners
// optional) lit with fire fills with a swirling portal sheet. Stand in it a
// few seconds and you cross over: every block below is eight above.
// Portals are remembered in the world info so a crossing can come out of the
// portal it is linked to; when there is none near, a new one is built.
// ---------------------------------------------------------------------------
const Portals = (() => {
  const SCALE = 8;
  const inside = (id) => id === 0 || id === B.FIRE || id === B.PORTAL;
  // the frame around (x, y, z) in one plane; axis 0 spans x, 1 spans z
  function detect(w, x, y, z, axis) {
    const dx = axis ? 0 : 1, dz = axis ? 1 : 0;
    if (!inside(w.getBlock(x, y, z))) return null;
    let by = y;
    for (let i = 0; i < 21 && by > 1 && inside(w.getBlock(x, by - 1, z)); i++) by--;
    if (w.getBlock(x, by - 1, z) !== B.OBSIDIAN) return null;
    let bx = x, bz = z;
    for (let i = 0; i < 21 && inside(w.getBlock(bx - dx, by, bz - dz)) && w.getBlock(bx - dx, by - 1, bz - dz) === B.OBSIDIAN; i++) { bx -= dx; bz -= dz; }
    if (w.getBlock(bx - dx, by, bz - dz) !== B.OBSIDIAN) return null;
    let wd = 0;
    while (wd < 22 && inside(w.getBlock(bx + dx * wd, by, bz + dz * wd)) && w.getBlock(bx + dx * wd, by - 1, bz + dz * wd) === B.OBSIDIAN) wd++;
    if (wd < 2 || wd > 21 || w.getBlock(bx + dx * wd, by, bz + dz * wd) !== B.OBSIDIAN) return null;
    let h = 0;
    rows: for (; h < 22; h++) {
      for (let i = 0; i < wd; i++) if (!inside(w.getBlock(bx + dx * i, by + h, bz + dz * i))) break rows;
      if (w.getBlock(bx - dx, by + h, bz - dz) !== B.OBSIDIAN || w.getBlock(bx + dx * wd, by + h, bz + dz * wd) !== B.OBSIDIAN) return null;
    }
    if (h < 3 || h > 21) return null;
    for (let i = 0; i < wd; i++) if (w.getBlock(bx + dx * i, by + h, bz + dz * i) !== B.OBSIDIAN) return null;
    return { x: bx, y: by, z: bz, axis, w: wd, h };
  }
  function fill(w, f) {
    const dx = f.axis ? 0 : 1, dz = f.axis ? 1 : 0;
    for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) w.setBlock(f.x + dx * i, f.y + j, f.z + dz * i, B.PORTAL, f.axis, 0);
  }
  function tryLight(w, x, y, z) {
    if (w.menu || w.dim === 2) return false;   // no Underworld portal will catch in the Far Isles
    const f = detect(w, x, y, z, 0) || detect(w, x, y, z, 1);
    if (!f) return false;
    fill(w, f);
    remember(w.info, w.dim, f.x, f.y, f.z);
    const g = w.game;
    if (g) {
      g.audio.play('portal_open', 0.9, 1, x + 0.5, y + 0.5, z + 0.5);
      g.achieve('portal');
    }
    return true;
  }
  // a sheet block survives only while framed by portal or obsidian in its plane
  function intact(w, x, y, z, m) {
    const dx = (m & 1) ? 0 : 1, dz = (m & 1) ? 1 : 0;
    const ok = (id) => id === B.PORTAL || id === B.OBSIDIAN;
    return ok(w.getBlock(x, y - 1, z)) && ok(w.getBlock(x, y + 1, z)) && ok(w.getBlock(x - dx, y, z - dz)) && ok(w.getBlock(x + dx, y, z + dz));
  }
  // ---- the registry of known portals: [dim, x, y, z] (bottom corner inside the frame) ----
  function remember(info, dim, x, y, z) {
    const list = info.portals || (info.portals = []);
    for (const p of list) if (p[0] === dim && Math.abs(p[1] - x) <= 21 && Math.abs(p[3] - z) <= 21 && Math.abs(p[2] - y) <= 21) { p[1] = x; p[2] = y; p[3] = z; return; }
    list.push([dim, x, y, z]);
    if (list.length > 256) list.shift();
  }
  function forget(info, p) { const list = info.portals || []; const i = list.indexOf(p); if (i >= 0) list.splice(i, 1); }
  function nearest(info, dim, x, z, range) {
    let best = null, bd = range * range;
    for (const p of info.portals || []) {
      if (p[0] !== dim) continue;
      const d = (p[1] + 0.5 - x) ** 2 + (p[3] + 0.5 - z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  // where a crossing from (x, z) in one dimension comes out in the other
  function target(fromDim, x, z) { const s = fromDim === 0 ? 1 / SCALE : SCALE; return [x * s, z * s]; }
  // ---- building a portal at the far side ----
  function freeSpot(w, x, y, z, axis) {
    // a 4 x 5 frame (with a step-off ledge either side) on solid ground
    const dx = axis ? 0 : 1, dz = axis ? 1 : 0, px = axis ? 1 : 0, pz = axis ? 0 : 1;
    for (let i = -1; i <= 4; i++) for (const s of [-1, 0, 1]) {
      const bx = x + dx * (i - 1) + px * s, bz = z + dz * (i - 1) + pz * s;
      const fl = w.getBlock(bx, y - 1, bz);
      if (!BT.solid[fl] || BT.fluid[fl] || fl === B.FIRE) return false;
      for (let j = 0; j < 5; j++) { const id = w.getBlock(bx, y + j, bz); if (id !== 0 && !(BT.replaceable[id] && !BT.fluid[id])) return false; }
    }
    return true;
  }
  function findSite(w, x, y, z) {
    const top = w.dim === 1 ? CH_H - 10 : CH_H - 8, lo = w.dim === 1 ? WG.LAVA_SEA + 2 : 4;
    let best = null, bd = Infinity;
    for (let r = 0; r <= 16; r++) {
      for (let ox = -r; ox <= r; ox++) for (let oz = -r; oz <= r; oz++) {
        if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
        const bx = x + ox, bz = z + oz;
        if (!w.isLoaded(bx, bz)) continue;
        for (let by = top; by >= lo; by--) {
          if (w.getBlock(bx, by, bz) !== 0 || !BT.solid[w.getBlock(bx, by - 1, bz)]) continue;
          for (const axis of [0, 1]) {
            if (!freeSpot(w, bx, by, bz, axis)) continue;
            const d = ox * ox + oz * oz + (by - y) * (by - y) * 0.5;
            if (d < bd) { bd = d; best = { x: bx, y: by, z: bz, axis }; }
          }
        }
      }
      if (best && r >= 4) break;
    }
    return best;
  }
  // build a 2x3 portal (plus frame) with its bottom-left inside corner at (x, y, z)
  function build(w, x, y, z, axis, platform) {
    const dx = axis ? 0 : 1, dz = axis ? 1 : 0, px = axis ? 1 : 0, pz = axis ? 0 : 1;
    if (platform) {
      // carve a pocket and lay an obsidian floor to step out onto
      for (let i = -1; i <= 2; i++) for (const s of [-1, 0, 1]) {
        const bx = x + dx * i + px * s, bz = z + dz * i + pz * s;
        w.setBlock(bx, y - 1, bz, B.OBSIDIAN, 0);
        for (let j = 0; j < 4; j++) if (s !== 0) w.setBlock(bx, y + j, bz, 0, 0);
      }
    }
    for (let i = -1; i <= 2; i++) for (let j = -1; j <= 3; j++) {
      const bx = x + dx * i, bz = z + dz * i;
      const edge = i === -1 || i === 2 || j === -1 || j === 3;
      w.setBlock(bx, y + j, bz, edge ? B.OBSIDIAN : 0, 0, edge ? 1 : 0);
    }
    fill(w, { x, y, z, axis, w: 2, h: 3 });
    remember(w.info, w.dim, x, y, z);
    return { x, y, z, axis };
  }
  // the portal block the player should appear in, at (x, y, z) of the arrival dimension
  function arrive(w, travel) {
    if (travel.link) {
      const [, lx, ly, lz] = travel.link;
      if (w.getBlock(lx, ly, lz) === B.PORTAL) {
        const axis = w.getMeta(lx, ly, lz) & 1;
        return { x: lx, y: ly, z: lz, axis };
      }
      forget(w.info, travel.link);
    }
    const x = Math.floor(travel.x), z = Math.floor(travel.z);
    let y = clamp(Math.floor(travel.y), w.dim === 1 ? WG.LAVA_SEA + 4 : 8, w.dim === 1 ? CH_H - 16 : CH_H - 10);
    const site = findSite(w, x, y, z);
    if (site) return build(w, site.x, site.y, site.z, site.axis, false);
    if (w.dim === 1) y = clamp(y, 70, 100);
    return build(w, x, y, z, 0, true);
  }
  return { detect, fill, tryLight, intact, remember, forget, nearest, target, arrive, findSite, build, SCALE };
})();
