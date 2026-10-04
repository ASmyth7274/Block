'use strict';
// ---------------------------------------------------------------------------
// The explorer's map: a top-down record of every chunk you have been near.
// One byte per column (colour index * 4 + shade), stored in 32x32-chunk regions.
// ---------------------------------------------------------------------------
const MAP_COLORS = [
  null,                                   // 0 unexplored
  [127, 178, 56], [247, 233, 163], [112, 112, 112], [151, 109, 77], [143, 119, 72], [0, 124, 0],     // 1 grass 2 sand 3 stone 4 dirt 5 wood 6 foliage
  [64, 64, 255], [255, 0, 0], [255, 255, 255], [160, 160, 255], [164, 168, 184], [127, 63, 178],     // 7 water 8 fire 9 snow 10 ice 11 clay 12 mycelium
  [153, 51, 51], [229, 229, 51], [216, 127, 51], [153, 153, 153], [76, 76, 76], [255, 252, 245],     // 13 red 14 yellow 15 orange 16 light gray 17 dark gray 18 white quartz
  [102, 76, 51], [129, 86, 49], [125, 202, 69], [99, 64, 46], [167, 167, 167], [92, 219, 213],       // 19 brown 20 podzol 21 lime 22 terracotta 23 iron 24 diamond
  [74, 128, 255], [0, 217, 58], [178, 76, 216], [102, 153, 216], [242, 127, 165], [76, 127, 153],    // 25 lapis 26 emerald/jade 27 magenta 28 light blue 29 pink 30 cyan
  [127, 63, 178], [51, 76, 178], [102, 127, 51], [25, 25, 25], [250, 238, 77], [180, 140, 90],       // 31 purple 32 blue 33 green 34 black 35 gold 36 sandstone
  [130, 88, 62], [90, 120, 60],                                                                         // 37 redwood 38 dark foliage
];
const MAP_SHADE = [180, 220, 255, 135];
const MapColors = (() => {
  const T = new Uint8Array(256 * 16);
  const set = (id, c, meta) => { if (id === undefined) return; if (meta === undefined) for (let m = 0; m < 16; m++) T[id * 16 + m] = c; else T[id * 16 + meta] = c; };
  // sensible defaults from block properties
  for (let id = 1; id < 256; id++) {
    const d = BLOCKS[id]; if (!d) continue;
    let c = 3;
    if (d.sound === 'wood') c = 5; else if (d.sound === 'grass') c = 6; else if (d.sound === 'gravel') c = 4; else if (d.sound === 'sand') c = 2;
    else if (d.sound === 'cloth') c = 18; else if (d.sound === 'snow') c = 9; else if (d.sound === 'glass') c = 10; else if (d.sound === 'metal') c = 23;
    set(id, c);
  }
  set(B.GRASS, 1); set(B.SAND, 2, 0); set(B.SAND, 15, 1); set(B.GRAVEL, 3); set(B.DIRT, 4); set(B.FARMLAND, 4); set(B.PODZOL, 20);
  set(B.WATER, 7); set(B.LAVA, 8); set(B.FIRE, 8); set(B.SNOW, 9); set(B.SNOW_LAYER, 9); set(B.ICE, 10); set(B.PACKED_ICE, 10);
  set(B.CLAY, 11); set(B.MYCELIUM, 12); set(B.SANDSTONE, 36); set(B.RED_SANDSTONE, 15); set(B.TERRACOTTA, 22, 0);
  set(B.ASH, 16); set(B.BASALT, 17); set(B.POLISHED_BASALT, 17); set(B.SALT, 18); set(B.PEAT, 19); set(B.QUICKSAND, 36);
  set(B.HAY_BALE, 14); set(B.THATCH, 14); set(B.PUMPKIN, 15); set(B.MELON, 21); set(B.CACTUS, 6); set(B.OBSIDIAN, 34);
  set(B.GOLD_BLOCK, 35); set(B.IRON_BLOCK, 23); set(B.DIAMOND_BLOCK, 24); set(B.LAPIS_BLOCK, 25); set(B.JADE_BLOCK, 26); set(B.COBALT_BLOCK, 32);
  set(B.SCORCHED_STONE, 17); set(B.HUGE_MUSHROOM_RED, 13); set(B.HUGE_MUSHROOM_BROWN, 19); set(B.TNT, 8); set(B.BRICKS, 13);
  set(B.SLATE, 17); set(B.SLATE_BRICKS, 17); set(B.MARBLE, 18); set(B.MARBLE_BRICKS, 18); set(B.LEAF_LITTER, 15);
  // leaves by kind: oak, spruce, birch, jungle, maple, redwood, golden maple (+ flag bits)
  const leaf = [6, 38, 21, 6, 13, 38, 14, 6];
  for (let m = 0; m < 16; m++) set(B.LEAVES, leaf[m & 7], m);
  // logs by wood
  const logc = [5, 19, 18, 5, 4, 37];
  for (let m = 0; m < 16; m++) set(B.LOG, logc[m & 7] || 5, m);
  // dyed blocks
  const dye = [18, 15, 27, 28, 14, 21, 29, 17, 16, 30, 31, 32, 19, 33, 13, 34];
  for (let m = 0; m < 16; m++) { set(B.WOOL, dye[m], m); set(B.CARPET, dye[m], m); set(B.STAINED_GLASS, dye[m], m); if (m < 15) set(B.TERRACOTTA, dye[m], m + 1); }
  return T;
})();

class MapStore {
  constructor(game, worldId) {
    this.game = game;
    this.worldId = worldId;
    this.chunks = new Map();          // chunk key -> Uint8Array(256)
    this.dirtyRegions = new Set();
    this.version = 0;                 // bumps when anything changes (screens redraw)
    this.ready = false;
    this.radius = 5;
  }
  regionKey(cx, cz) { return (cx >> 5) + ',' + (cz >> 5); }
  load(storage) {
    return storage.keysWithPrefix('maps', this.worldId + ':').then((keys) => Promise.all(keys.map((k) => storage.get('maps', k).then((rec) => this.loadRegion(rec))))).then(() => { this.ready = true; this.version++; })
      .catch((e) => { console.warn('map data unavailable', e); this.ready = true; });
  }
  loadRegion(rec) {
    if (!rec || !rec.present) return;
    const present = rec.present instanceof Uint8Array ? rec.present : new Uint8Array(rec.present);
    const data = rec.data instanceof Uint8Array ? rec.data : new Uint8Array(rec.data);
    let o = 0;
    for (let i = 0; i < 1024; i++) {
      if (!present[i]) continue;
      const cx = rec.rx * 32 + (i & 31), cz = rec.rz * 32 + (i >> 5);
      this.chunks.set(ckey(cx, cz), data.slice(o, o + 256));
      o += 256;
    }
  }
  regionRecord(rx, rz) {
    const present = new Uint8Array(1024), parts = [];
    for (let i = 0; i < 1024; i++) {
      const d = this.chunks.get(ckey(rx * 32 + (i & 31), rz * 32 + (i >> 5)));
      if (d) { present[i] = 1; parts.push(d); }
    }
    const data = new Uint8Array(parts.length * 256);
    parts.forEach((p, k) => data.set(p, k * 256));
    return { rx, rz, present, data };
  }
  save(storage) {
    for (const r of this.dirtyRegions) {
      const [rx, rz] = r.split(',').map(Number);
      storage.queue('maps', this.worldId + ':' + r, this.regionRecord(rx, rz));
    }
    this.dirtyRegions.clear();
  }
  // sample one chunk into map bytes
  sample(c) {
    const w = this.game.world;
    const out = this.chunks.get(c.key) || new Uint8Array(256);
    const north = w.getChunk(c.cx, c.cz - 1);
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const i = (lz << 4) | lx;
      let y = c.heightmap[i] - 1;
      if (y < 0) { out[i] = 0; continue; }
      let id = c.blocks[(y << 8) | i], meta = c.meta[(y << 8) | i];
      let col = MapColors[id * 16 + (meta & 15)] || 3, shade = 1;
      const odd = ((lx + lz) & 1);
      if (id === B.WATER) {
        let depth = 0;
        while (y - depth > 0 && BT.fluid[c.blocks[((y - depth) << 8) | i]]) depth++;
        const d1 = depth * 0.1 + odd * 0.2;
        shade = d1 < 0.5 ? 2 : d1 > 0.9 ? 0 : 1;
      } else {
        const hn = lz > 0 ? c.heightmap[((lz - 1) << 4) | lx] : (north ? north.heightmap[(15 << 4) | lx] : c.heightmap[i]);
        const d1 = (c.heightmap[i] - hn) * 0.8 + (odd - 0.5) * 0.4;
        shade = d1 > 0.6 ? 2 : d1 < -0.6 ? 0 : 1;
      }
      out[i] = col * 4 + shade;
    }
    if (!this.chunks.has(c.key)) this.chunks.set(c.key, out);
    this.dirtyRegions.add(this.regionKey(c.cx, c.cz));
    this.version++;
    c.mapDirty = false;
    c.mapped = true;
  }
  tick() {
    const g = this.game, w = g.world, p = g.player;
    if (!w || !p || !this.ready) return;
    const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
    const R = Math.min(this.radius, g.settings.renderDistance);
    let n = 0;
    for (let dz = -R; dz <= R && n < 6; dz++) for (let dx = -R; dx <= R && n < 6; dx++) {
      if (dx * dx + dz * dz > R * R + 1) continue;
      const c = w.getChunk(pcx + dx, pcz + dz);
      if (!c || (c.mapped && !c.mapDirty)) continue;
      if (!c.mapped && this.chunks.has(c.key) && !c.mapDirty) { c.mapped = true; continue; }
      this.sample(c); n++;
    }
  }
  explored() { return this.chunks.size; }
  // export helpers
  allRegions() { const set = new Set(); for (const k of this.chunks.keys()) set.add(this.regionKey(ckeyX(k), ckeyZ(k))); return set; }
}
