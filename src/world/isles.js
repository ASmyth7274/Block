'use strict';
// ---------------------------------------------------------------------------
// The Far Isles: where you land, and what the place remembers of you (is the
// Starwyrm still alive, where have the gateways opened).
// ---------------------------------------------------------------------------
const Isles = (() => {
  const ARRIVE = WG.ISLES.ARRIVE;
  function state(info) {
    if (!info.isles) info.isles = { wyrmDead: false, kills: 0, gateways: [], wyrm: null };
    return info.isles;
  }
  // an obsidian platform out over the void, rebuilt and cleared on every arrival
  function platform(w) {
    const [px, py, pz] = ARRIVE;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      w.setBlock(px + dx, py, pz + dz, B.OBSIDIAN, 0);
      for (let y = 1; y <= 3; y++) w.setBlock(px + dx, py + y, pz + dz, 0, 0);
    }
    return [px + 0.5, py + 1, pz + 0.5];
  }
  // the Star Well's basin: a ring of bedrock round the pillar at the centre of the Great Isle
  function wellCells(w) {
    const y = w.localGen.wellTop ? w.localGen.wellTop() + 1 : 61, out = [];
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) { const d2 = x * x + z * z; if (d2 <= 6.5 && (x || z)) out.push([x, y, z]); }
    return out;
  }
  // fill the well with stars (the way home), or let it run dry
  function setWell(w, open) {
    if (!w.isLoaded(0, 0) || !w.isLoaded(-1, -1) || !w.isLoaded(-1, 0) || !w.isLoaded(0, -1)) return false;
    for (const [x, y, z] of wellCells(w)) {
      const id = w.getBlock(x, y, z);
      if (open && id === 0) w.setBlock(x, y, z, B.RIFT, 0);
      else if (!open && id === B.RIFT) w.setBlock(x, y, z, 0, 0);
    }
    return true;
  }
  return { ARRIVE, state, platform, wellCells, setWell };
})();
