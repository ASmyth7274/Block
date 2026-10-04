'use strict';
// ---------------------------------------------------------------------------
// World generation. Self-contained factory (no outer references) so it can be
// stringified into the generation Web Worker. Generation is stateless and
// deterministic per chunk: features that cross chunk borders are re-derived
// from neighbouring chunks' terrain, so only player-modified chunks need saving.
// ---------------------------------------------------------------------------
function WorldGenFactory(Noise, TAB) {
  const B = TAB.ids;
  const I = TAB.items;
  const OPAQUE = TAB.opaque, SOLID = TAB.solid, REPL = TAB.replaceable;
  const { Random, Octaves, seedHash } = Noise;
  const H = 128, SEA = 62;
  const IDX = (x, y, z) => (y << 8) | (z << 4) | x;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ------------------------------------------------------------------ biomes
  const BIOMES = [];
  function biome(id, key, name, o) {
    const b = Object.assign({
      id, key, name, temp: 0.6, rain: 0.5, depth: 0.1, scale: 0.2,
      top: B.GRASS, topMeta: 0, filler: B.DIRT, fillerMeta: 0, under: B.DIRT,
      grass: '#79c05a', foliage: '#59ae30', water: '#ffffff',
      trees: 0, treeKinds: [['oak', 1]], tallGrass: 2, ferns: 0, flowers: 1, flowerKinds: [0, 1],
      deadBush: 0, cactus: 0, cane: 1, pumpkins: true, mushrooms: 0, animals: [['pig', 1], ['cow', 1], ['sheep', 1], ['chicken', 1]],
      structures: [],
    }, o);
    BIOMES[id] = b;
    return b;
  }
  const BI = {};
  BI.OCEAN = biome(0, 'ocean', 'Ocean', { depth: -1.0, scale: 0.1, top: B.GRAVEL, filler: B.GRAVEL, under: B.GRAVEL, tallGrass: 0, flowers: 0, cane: 0, pumpkins: false, animals: [], structures: ['ruins'] });
  BI.DEEP_OCEAN = biome(1, 'deep_ocean', 'Deep Ocean', { depth: -1.8, scale: 0.1, top: B.GRAVEL, filler: B.GRAVEL, under: B.GRAVEL, tallGrass: 0, flowers: 0, cane: 0, pumpkins: false, animals: [], structures: ['ruins'] });
  BI.PLAINS = biome(2, 'plains', 'Plains', { temp: 0.8, rain: 0.4, depth: 0.125, scale: 0.05, grass: '#91bd59', foliage: '#77ab2f', trees: 0.1, treeKinds: [['oak', 9], ['big_oak', 1]], tallGrass: 14, flowers: 3, flowerKinds: [0, 1, 3], animals: [['cow', 2], ['pig', 2], ['sheep', 3], ['chicken', 2]], structures: ['tower', 'camp', 'crater'] });
  BI.DESERT = biome(3, 'desert', 'Desert', { temp: 2.0, rain: 0, depth: 0.125, scale: 0.05, top: B.SAND, filler: B.SAND, under: B.SAND, grass: '#bfb755', foliage: '#aea42a', tallGrass: 0, flowers: 0, deadBush: 2, cactus: 10, cane: 50, pumpkins: false, animals: [], structures: ['well', 'crater', 'quicksand'] });
  BI.MOUNTAINS = biome(4, 'mountains', 'Mountains', { temp: 0.2, rain: 0.3, depth: 1.0, scale: 0.5, grass: '#8ab689', foliage: '#6da36b', trees: 0.6, treeKinds: [['spruce', 2], ['oak', 1]], tallGrass: 3, flowers: 0.5, animals: [['sheep', 3], ['deer', 1]], structures: ['tower'], jade: true });
  BI.FOREST = biome(5, 'forest', 'Forest', { temp: 0.7, rain: 0.8, depth: 0.1, scale: 0.2, grass: '#79c05a', foliage: '#59ae30', trees: 10, treeKinds: [['oak', 12], ['big_oak', 2], ['birch', 4]], tallGrass: 3, flowers: 2, flowerKinds: [0, 1, 3, 2], mushrooms: 1, animals: [['pig', 2], ['chicken', 2], ['deer', 2], ['cow', 1], ['wolf', 1]], bramble: 1, logs: 0.3, structures: ['camp', 'hut', 'tower'] });
  BI.BIRCH_FOREST = biome(6, 'birch_forest', 'Birch Forest', { temp: 0.6, rain: 0.6, depth: 0.1, scale: 0.2, grass: '#88bb67', foliage: '#6ba941', trees: 10, treeKinds: [['birch', 1]], tallGrass: 3, flowers: 2, flowerKinds: [2, 3, 0], animals: [['deer', 2], ['chicken', 1], ['pig', 1]], logs: 0.2, structures: ['camp', 'hut'] });
  BI.TAIGA = biome(7, 'taiga', 'Taiga', { temp: 0.25, rain: 0.8, depth: 0.2, scale: 0.2, grass: '#86b783', foliage: '#68a464', trees: 10, treeKinds: [['spruce', 3], ['pine', 1]], tallGrass: 1, ferns: 4, flowers: 0.3, mushrooms: 1, podzol: true, animals: [['deer', 3], ['pig', 1], ['sheep', 1], ['wolf', 2]], bramble: 2, logs: 0.4, structures: ['camp', 'hut', 'tower'] });
  BI.SNOWY_TUNDRA = biome(8, 'snowy_tundra', 'Snowy Tundra', { temp: 0.0, rain: 0.5, depth: 0.125, scale: 0.05, grass: '#80b497', foliage: '#60a17b', trees: 0.3, treeKinds: [['spruce', 1]], tallGrass: 1, flowers: 0.2, flowerKinds: [6], cane: 0, pumpkins: false, animals: [['deer', 1], ['sheep', 1]], structures: ['tower', 'crater'] });
  BI.SNOWY_TAIGA = biome(9, 'snowy_taiga', 'Snowy Taiga', { temp: -0.5, rain: 0.4, depth: 0.2, scale: 0.2, grass: '#80b497', foliage: '#60a17b', trees: 8, treeKinds: [['spruce', 3], ['pine', 1]], tallGrass: 1, ferns: 2, flowers: 0.2, flowerKinds: [6], cane: 0, pumpkins: false, animals: [['deer', 2], ['wolf', 2]], structures: ['camp', 'hut'] });
  BI.SWAMP = biome(10, 'swamp', 'Swampland', { temp: 0.8, rain: 0.9, depth: -0.2, scale: 0.1, under: B.CLAY, grass: '#6a7039', foliage: '#6a7039', water: '#a8c890', trees: 2, treeKinds: [['swamp_oak', 1]], tallGrass: 5, flowers: 1, flowerKinds: [2], mushrooms: 8, lily: 4, cattails: 6, cane: 10, animals: [['chicken', 1], ['pig', 1]], structures: ['treasure', 'hut'] });
  BI.JUNGLE = biome(11, 'jungle', 'Jungle', { temp: 0.95, rain: 0.9, depth: 0.1, scale: 0.2, grass: '#59c93c', foliage: '#30bb0b', trees: 40, treeKinds: [['jungle_bush', 10], ['jungle', 6], ['mega_jungle', 2], ['big_oak', 1]], tallGrass: 25, ferns: 6, flowers: 4, flowerKinds: [0, 5], melons: true, animals: [['chicken', 3], ['pig', 1]], structures: [] });
  BI.MUSHROOM = biome(12, 'mushroom_island', 'Mushroom Isle', { temp: 0.9, rain: 1.0, depth: 0.2, scale: 0.3, top: B.MYCELIUM, grass: '#55c93f', foliage: '#2bbb0f', trees: 1, treeKinds: [['huge_mushroom', 1]], tallGrass: 0, flowers: 0, mushrooms: 8, cane: 0, pumpkins: false, animals: [['cow', 1]], structures: [] });
  BI.BEACH = biome(13, 'beach', 'Beach', { temp: 0.8, rain: 0.4, depth: 0.0, scale: 0.025, top: B.SAND, filler: B.SAND, under: B.SAND, grass: '#91bd59', foliage: '#77ab2f', tallGrass: 0, flowers: 0, cane: 4, pumpkins: false, animals: [], structures: ['treasure'] });
  BI.RIVER = biome(14, 'river', 'River', { temp: 0.5, rain: 0.5, depth: -0.5, scale: 0.0, top: B.SAND, filler: B.SAND, under: B.SAND, tallGrass: 0, flowers: 0, cane: 8, cattails: 2, pumpkins: false, animals: [] });
  BI.AUTUMN = biome(15, 'autumn_forest', 'Autumn Woods', { temp: 0.6, rain: 0.6, depth: 0.15, scale: 0.25, grass: '#a3a64f', foliage: '#c4782a', trees: 7, treeKinds: [['maple', 5], ['gold_maple', 4], ['oak', 2], ['birch', 1]], tallGrass: 4, flowers: 1, flowerKinds: [5, 1], mushrooms: 1, litter: 18, pumpkins: true, pumpkinBoost: 4, animals: [['deer', 3], ['pig', 1], ['chicken', 1]], bramble: 2, logs: 0.4, structures: ['camp', 'hut'] });
  BI.REDWOOD = biome(16, 'redwood_grove', 'Redwood Grove', { temp: 0.45, rain: 0.9, depth: 0.25, scale: 0.25, grass: '#6fa860', foliage: '#4a8a3c', trees: 5, treeKinds: [['redwood', 4], ['spruce', 3], ['small_redwood', 3]], tallGrass: 2, ferns: 10, flowers: 0.3, podzol: true, mushrooms: 2, animals: [['deer', 4], ['wolf', 1]], bramble: 1, logs: 0.6, structures: ['camp', 'hut'] });
  BI.MOORS = biome(17, 'moors', 'Moorland', { temp: 0.35, rain: 0.7, depth: 0.35, scale: 0.3, grass: '#8a9a5a', foliage: '#7a8a4a', trees: 0.15, treeKinds: [['oak', 2], ['dead', 1]], tallGrass: 8, flowers: 6, flowerKinds: [4, 4, 4, 1], peat: true, boulders: 0.6, animals: [['sheep', 4], ['deer', 1]], structures: ['circle', 'tower'], jade: true });
  BI.ASHEN = biome(18, 'ashen_wastes', 'Ashen Wastes', { temp: 1.6, rain: 0, depth: 0.25, scale: 0.4, top: B.ASH, filler: B.BASALT, under: B.ASH, grass: '#8a8a5a', foliage: '#7a7a4a', trees: 0.5, treeKinds: [['dead', 1]], tallGrass: 0, flowers: 0.15, flowerKinds: [7], deadBush: 3, cane: 0, pumpkins: false, lavaPools: true, animals: [], structures: ['crater'] });
  BI.SALT_FLATS = biome(19, 'salt_flats', 'Salt Flats', { temp: 1.4, rain: 0.1, depth: 0.02, scale: 0.0, top: B.SALT, filler: B.SAND, under: B.SAND, grass: '#b8b070', foliage: '#a8a050', tallGrass: 0, flowers: 0, deadBush: 0.5, cane: 0, pumpkins: false, animals: [], structures: ['crater'] });
  BI.MEADOW = biome(20, 'meadow', 'Wildflower Meadow', { temp: 0.7, rain: 0.7, depth: 0.2, scale: 0.12, grass: '#83c95a', foliage: '#5fb83a', trees: 0.25, treeKinds: [['oak', 2], ['birch', 1], ['maple', 1]], tallGrass: 10, flowers: 22, flowerKinds: [0, 1, 2, 3, 5, 7], animals: [['sheep', 2], ['cow', 2], ['chicken', 1]], structures: ['camp', 'tower'] });
  BI.CANYON = biome(21, 'canyon', 'Red Canyon', { temp: 2.0, rain: 0, depth: 0.9, scale: 0.3, top: B.SAND, topMeta: 1, filler: B.TERRACOTTA, under: B.SAND, grass: '#90814d', foliage: '#9e814d', tallGrass: 0, flowers: 0, deadBush: 3, cane: 4, pumpkins: false, animals: [], structures: ['crater'], jade: true, terrace: true });
  BI.STONE_SHORE = biome(22, 'stone_shore', 'Stone Shore', { temp: 0.2, rain: 0.3, depth: 0.1, scale: 0.8, top: B.STONE, filler: B.STONE, under: B.GRAVEL, tallGrass: 0, flowers: 0, cane: 0, pumpkins: false, animals: [], structures: [], jade: true });

  const LAND_TOP_OK = new Uint8Array(256);
  for (const id of [B.GRASS, B.DIRT, B.PODZOL, B.MYCELIUM]) LAND_TOP_OK[id] = 1;

  // ------------------------------------------------------------ helpers
  function pickWeighted(rng, list) {
    let tot = 0; for (const e of list) tot += e[1];
    let r = rng.nextFloat() * tot;
    for (const e of list) { r -= e[1]; if (r <= 0) return e[0]; }
    return list[list.length - 1][0];
  }

  // ------------------------------------------------------------ generator
  class Generator {
    constructor(seed, opts) {
      this.seed = seed | 0;
      this.opts = opts || {};
      this.type = this.opts.type || 'default';
      this.structuresOn = this.opts.structures !== false;
      this.bs = this.type === 'large' ? 4 : 1;
      const r = new Random(seedHash(this.seed, 1, 2));
      this.nCont = new Octaves(r, 5); this.nTemp = new Octaves(r, 4); this.nHum = new Octaves(r, 4);
      this.nWeird = new Octaves(r, 3); this.nMount = new Octaves(r, 4); this.nRiver = new Octaves(r, 4);
      this.nWarpX = new Octaves(r, 3); this.nWarpZ = new Octaves(r, 3);
      this.nHill = new Octaves(r, 4);
      this.nDens = new Octaves(r, 6); this.nDens2 = new Octaves(r, 4);
      this.nSurf = new Octaves(r, 4); this.nPatch = new Octaves(r, 3); this.nGlow = new Octaves(r, 3);
      this.nBand = new Octaves(r, 2);
      this.terrainCache = new Map();
      this.planCache = new Map();
      this.clim = { c: 0, t: 0, h: 0, w: 0, m: 0, r: 0 };
      // canyon terracotta band colours (by y), like the layered cliffs of the badlands
      const br = new Random(seedHash(this.seed, 77, 88));
      this.bands = new Uint8Array(64);
      const bandCols = [0, 0, 0, 2, 2, 5, 13, 15, 9, 0, 0, 13];
      for (let i = 0; i < 64; i++) this.bands[i] = bandCols[br.nextInt(bandCols.length)];
    }

    // ---- climate & biome ----
    climate(x, z, out) {
      const s = this.bs;
      const wx = x + this.nWarpX.noise2(x / 300 / s, z / 300 / s) * 110 * s;
      const wz = z + this.nWarpZ.noise2(x / 300 / s, z / 300 / s) * 110 * s;
      let c = this.nCont.noise2(wx / 1600 / s, wz / 1600 / s) + 0.1;
      if (this.type === 'islands') c = this.nCont.noise2(wx / 520, wz / 520) - 0.22;
      out.c = c;
      out.t = this.nTemp.noise2(wx / 1100 / s, wz / 1100 / s);
      out.h = this.nHum.noise2(wx / 900 / s + 37.7, wz / 900 / s - 12.3);
      out.w = this.nWeird.noise2(wx / 480 / s, wz / 480 / s);
      out.m = this.nMount.noise2(wx / 700 / s, wz / 700 / s);
      out.r = Math.abs(this.nRiver.noise2(wx / 560 / s, wz / 560 / s)) * s;
      return out;
    }
    pickBiome(cl) {
      const c = cl.c, t = cl.t, h = cl.h, w = cl.w, m = cl.m;
      if (this.type === 'flat') return BI.PLAINS.id;
      // thresholds are tuned against the measured spread of the climate noise (std ~0.23)
      if (c < -0.22) return (w > 0.33 && h > 0.12) ? BI.MUSHROOM.id : BI.DEEP_OCEAN.id;
      if (c < -0.04) return BI.OCEAN.id;
      if (m > 0.3 && c > 0.0) return BI.MOUNTAINS.id;
      if (c < -0.022) return m > 0.2 ? BI.STONE_SHORE.id : BI.BEACH.id;
      if (t < -0.29) return h > 0.0 ? BI.SNOWY_TAIGA.id : BI.SNOWY_TUNDRA.id;
      if (t < -0.12) {
        if (h > 0.12) return w > 0.0 ? BI.REDWOOD.id : BI.TAIGA.id;
        if (h < -0.15) return BI.MOORS.id;
        return BI.TAIGA.id;
      }
      if (t < 0.12) {
        if (w > 0.3) return BI.MEADOW.id;
        if (w < -0.3) return BI.AUTUMN.id;
        if (h < -0.2) return BI.PLAINS.id;
        if (h > 0.2) return w > 0.05 ? BI.BIRCH_FOREST.id : BI.FOREST.id;
        return h > 0.0 ? BI.FOREST.id : BI.PLAINS.id;
      }
      if (t < 0.25) {
        if (h > 0.2) return BI.SWAMP.id;
        if (w < -0.3) return BI.AUTUMN.id;
        if (h > 0.05) return BI.FOREST.id;
        if (w > 0.3) return BI.MEADOW.id;
        return BI.PLAINS.id;
      }
      if (h > 0.2) return BI.JUNGLE.id;
      if (w < -0.28) return BI.ASHEN.id;
      if (w > 0.28) return BI.CANYON.id;
      if (h < -0.2 && w > 0.05) return BI.SALT_FLATS.id;
      return BI.DESERT.id;
    }
    biomeAt(x, z) {
      const cl = this.climate(x, z, this.clim);
      let b = this.pickBiome(cl);
      if (this.isRiver(cl, b)) b = BI.RIVER.id;
      return b;
    }
    riverFactor(cl) { return 1 - smooth(0.012, 0.05, cl.r); }
    isRiver(cl, b) {
      if (this.type === 'flat') return false;
      const bd = BIOMES[b];
      if (bd.depth < -0.4 || b === BI.BEACH.id || b === BI.STONE_SHORE.id) return false;
      return cl.r < 0.018;
    }
    // effective temperature (cools with altitude)
    tempAt(b, y) { return BIOMES[b].temp - Math.max(0, y - 64) * 0.05 / 18; }

    // ---- terrain (stage 1 + caves = stage 2), cached ----
    terrain(cx, cz) {
      const key = (cx + 32768) * 65536 + (cz + 32768);
      let t = this.terrainCache.get(key);
      if (t) { this.terrainCache.delete(key); this.terrainCache.set(key, t); return t; }
      t = this.genTerrain(cx, cz);
      this.terrainCache.set(key, t);
      if (this.terrainCache.size > 600) {
        const first = this.terrainCache.keys().next().value;
        this.terrainCache.delete(first);
      }
      return t;
    }

    genTerrain(cx, cz) {
      const blocks = new Uint8Array(16 * 16 * H);
      const meta = new Uint8Array(16 * 16 * H);
      const biomes = new Uint8Array(256);
      const height = new Uint8Array(256);
      const x0 = cx * 16, z0 = cz * 16;
      const cl = this.clim;

      // per-column biomes
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        this.climate(x0 + x, z0 + z, cl);
        let b = this.pickBiome(cl);
        if (this.isRiver(cl, b)) b = BI.RIVER.id;
        biomes[z * 16 + x] = b;
      }

      if (this.type === 'flat') {
        for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
          blocks[IDX(x, 0, z)] = B.BEDROCK; blocks[IDX(x, 1, z)] = B.DIRT; blocks[IDX(x, 2, z)] = B.DIRT; blocks[IDX(x, 3, z)] = B.GRASS;
          height[z * 16 + x] = 3;
        }
        return { blocks, meta, biomes, height, cx, cz };
      }

      // biome parameter grid (4-block spacing, margin of 3)
      const GN = 11, GO = 3;
      const gDepth = new Float32Array(GN * GN), gScale = new Float32Array(GN * GN), gRiver = new Float32Array(GN * GN), gTer = new Float32Array(GN * GN);
      for (let gz = 0; gz < GN; gz++) for (let gx = 0; gx < GN; gx++) {
        const wx = x0 + (gx - GO) * 4, wz = z0 + (gz - GO) * 4;
        this.climate(wx, wz, cl);
        const b = BIOMES[this.pickBiome(cl)];
        let d = b.depth, s = b.scale;
        if (b === BI.MOUNTAINS) { const e = smooth(0.36, 0.7, cl.m); d += e * 0.6; s += e * 0.2; }
        gDepth[gz * GN + gx] = d; gScale[gz * GN + gx] = s;
        gRiver[gz * GN + gx] = (b.depth > -0.4 && b !== BI.BEACH) ? this.riverFactor(cl) : 0;
        gTer[gz * GN + gx] = b.terrace ? 1 : 0;
      }
      // density grid 5 x 17 x 5
      const dens = new Float32Array(5 * 17 * 5);
      for (let gz = 0; gz < 5; gz++) for (let gx = 0; gx < 5; gx++) {
        const ci = (gz + GO) * GN + (gx + GO);
        const cDepth = gDepth[ci];
        let sd = 0, ss = 0, sw = 0, st = 0;
        for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
          const ni = (gz + GO + dz) * GN + (gx + GO + dx);
          let wgt = 10 / Math.sqrt(dx * dx + dz * dz + 0.2);
          const nd = gDepth[ni];
          if (nd > cDepth) wgt *= 0.5;
          sd += nd * wgt; ss += gScale[ni] * wgt; st += gTer[ni] * wgt; sw += wgt;
        }
        let depth = sd / sw, scale = ss / sw;
        const ter = st / sw;
        const wx = x0 + gx * 4, wz = z0 + gz * 4;
        let targetY = 64 + depth * 17 + this.nHill.noise2(wx / 220, wz / 220) * (2 + scale * 12);
        let amp = 2 + scale * 56;
        const rf = gRiver[ci];
        if (rf > 0 && targetY > SEA - 4) { targetY -= (targetY - (SEA - 4)) * rf; amp = lerp(amp, 1.2, rf); }
        for (let gy = 0; gy < 17; gy++) {
          const y = gy * 8;
          const n = this.nDens.noise3(wx / 110, y / 80, wz / 110) * 0.75 + this.nDens2.noise3(wx / 42, y / 30, wz / 42) * 0.3;
          let surf = targetY + n * amp;
          if (ter > 0.01) { // mesa terraces
            const step = 7, base = 66;
            const k = (surf - base) / step;
            const fl = Math.floor(k), fr = k - fl;
            const terr = base + (fl + smooth(0.55, 0.95, fr)) * step;
            surf = lerp(surf, terr, ter);
          }
          let d = surf - y;
          if (y > 116) d -= (y - 116) * 1.5;
          if (y < 8) d += (8 - y) * 3;
          dens[(gz * 5 + gx) * 17 + gy] = d;
        }
      }
      // interpolate densities into blocks
      for (let z = 0; z < 16; z++) {
        const gz = z >> 2, tz = (z & 3) / 4;
        for (let x = 0; x < 16; x++) {
          const gx = x >> 2, tx = (x & 3) / 4;
          const a = (gz * 5 + gx) * 17, b2 = (gz * 5 + gx + 1) * 17, c2 = ((gz + 1) * 5 + gx) * 17, d2 = ((gz + 1) * 5 + gx + 1) * 17;
          for (let y = 0; y < H; y++) {
            const gy = y >> 3, ty = (y & 7) / 8;
            const v00 = dens[a + gy] + (dens[a + gy + 1] - dens[a + gy]) * ty;
            const v10 = dens[b2 + gy] + (dens[b2 + gy + 1] - dens[b2 + gy]) * ty;
            const v01 = dens[c2 + gy] + (dens[c2 + gy + 1] - dens[c2 + gy]) * ty;
            const v11 = dens[d2 + gy] + (dens[d2 + gy + 1] - dens[d2 + gy]) * ty;
            const v0 = v00 + (v10 - v00) * tx, v1 = v01 + (v11 - v01) * tx;
            const v = v0 + (v1 - v0) * tz;
            const i = IDX(x, y, z);
            if (v > 0) blocks[i] = B.STONE;
            else if (y <= SEA) blocks[i] = B.WATER;
          }
        }
      }
      this.surface(cx, cz, blocks, meta, biomes);
      this.carveCaves(cx, cz, blocks, meta);
      this.carveRavines(cx, cz, blocks, meta);
      // heightmap: highest non-air, non-liquid block
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        let y = H - 1;
        while (y > 0) { const id = blocks[IDX(x, y, z)]; if (id !== 0 && id !== B.WATER && id !== B.LAVA) break; y--; }
        height[z * 16 + x] = y;
      }
      return { blocks, meta, biomes, height, cx, cz };
    }

    surface(cx, cz, blocks, meta, biomes) {
      const rng = new Random(seedHash(this.seed, cx, cz, 0x5EAF));
      const x0 = cx * 16, z0 = cz * 16;
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const bid = biomes[z * 16 + x], b = BIOMES[bid];
        const wx = x0 + x, wz = z0 + z;
        const sn = this.nSurf.noise2(wx / 16, wz / 16);
        const depth = Math.floor(sn * 2.5 + 3 + rng.nextFloat() * 0.25);
        const patch = this.nPatch.noise2(wx / 24, wz / 24);
        let run = -1;
        let top = b.top, topMeta = b.topMeta, fill = b.filler, fillMeta = b.fillerMeta;
        if (b === BI.MOUNTAINS && sn > 0.45) { top = B.STONE; fill = B.STONE; }
        else if (b === BI.MOUNTAINS && sn < -0.55) { top = B.GRAVEL; fill = B.GRAVEL; }
        if (b.podzol && patch > 0.3) top = B.PODZOL;
        if ((b === BI.FOREST || b === BI.REDWOOD) && patch < -0.55) { top = B.DIRT; topMeta = 1; }
        if (b === BI.ASHEN) { if (patch > 0.42) { top = B.BASALT; } else if (patch < -0.5) { top = B.SCORCHED_STONE; } }
        if (b === BI.MOORS && patch > 0.38) { top = B.PEAT; fill = B.PEAT; }
        if (b === BI.MOORS && patch < -0.5) { top = B.DIRT; topMeta = 1; }
        if (b === BI.DESERT && patch > 0.62 && sn > 0.3) { top = B.QUICKSAND; fill = B.QUICKSAND; }
        for (let y = H - 1; y >= 0; y--) {
          const i = IDX(x, y, z);
          if (y <= rng.nextInt(5)) { blocks[i] = B.BEDROCK; continue; }
          const id = blocks[i];
          if (id === 0 || id === B.WATER) { run = -1; continue; }
          if (id !== B.STONE) continue;
          if (run === -1) {
            if (depth <= 0) { run = 0; continue; }
            run = depth;
            if (b === BI.CANYON) {
              // terracotta bands; red sand on flat tops
              if (y >= SEA - 1 && y > 70 && blocks[IDX(x, y + 1, z)] === 0 && sn > -0.2) { blocks[i] = B.SAND; meta[i] = 1; run = 1; }
              else { blocks[i] = B.TERRACOTTA; meta[i] = this.bandAt(wx, y, wz); }
              continue;
            }
            if (y >= SEA - 1) {
              blocks[i] = top; meta[i] = topMeta;
              // beaches & shallow banks
              if ((b === BI.RIVER || b === BI.BEACH) && y <= SEA + 1) { blocks[i] = B.SAND; meta[i] = 0; }
            } else {
              let u = b.under;
              if (b === BI.OCEAN || b === BI.DEEP_OCEAN) u = (y > SEA - 9) ? B.SAND : (patch > 0.45 ? B.CLAY : B.GRAVEL);
              if (b === BI.RIVER) u = patch > 0.4 ? B.GRAVEL : patch < -0.45 ? B.CLAY : B.SAND;
              if (u === B.GRASS || u === B.MYCELIUM) u = B.DIRT;
              blocks[i] = u; meta[i] = 0;
            }
          } else if (run > 0) {
            run--;
            if (b === BI.CANYON) { blocks[i] = B.TERRACOTTA; meta[i] = this.bandAt(wx, y, wz); if (run === 0) run = 40; continue; }
            if (y < SEA - 1 && (b === BI.OCEAN || b === BI.DEEP_OCEAN)) { blocks[i] = blocks[i + 256] === B.SAND ? B.SAND : B.GRAVEL; continue; }
            blocks[i] = fill; meta[i] = fillMeta;
            if (fill === B.SAND && run === 0 && b !== BI.SALT_FLATS) { run = rng.nextInt(4); fill = B.SANDSTONE; }
          }
        }
      }
    }
    bandAt(x, y, z) {
      const off = Math.round(this.nBand.noise2(x / 120, z / 120) * 3);
      const c = this.bands[(y + off + 64) & 63];
      return c; // 0 = plain terracotta, otherwise colour+1
    }

    // ---- classic worm caves ----
    carveCaves(cx, cz, blocks, meta) {
      const R = 8;
      for (let sx = cx - R; sx <= cx + R; sx++) for (let sz = cz - R; sz <= cz + R; sz++) {
        const rng = new Random(seedHash(this.seed, sx, sz, 0xCA7E));
        let n = rng.nextInt(rng.nextInt(rng.nextInt(15) + 1) + 1);
        if (rng.nextInt(7) !== 0) n = 0;
        for (let i = 0; i < n; i++) {
          const x = sx * 16 + rng.nextInt(16), y = rng.nextInt(rng.nextInt(120) + 8), z = sz * 16 + rng.nextInt(16);
          let tunnels = 1;
          if (rng.nextInt(4) === 0) {
            this.tunnel(cx, cz, blocks, meta, rng.nextSeed(), x, y, z, 1 + rng.nextFloat() * 6, 0, 0, -1, -1, 0.5);
            tunnels += rng.nextInt(4);
          }
          for (let j = 0; j < tunnels; j++) {
            const yaw = rng.nextFloat() * Math.PI * 2;
            const pitch = (rng.nextFloat() - 0.5) * 2 / 8;
            let width = rng.nextFloat() * 2 + rng.nextFloat();
            if (rng.nextInt(10) === 0) width *= rng.nextFloat() * rng.nextFloat() * 3 + 1;
            this.tunnel(cx, cz, blocks, meta, rng.nextSeed(), x, y, z, width, yaw, pitch, 0, 0, 1.0);
          }
        }
      }
    }
    tunnel(cx, cz, blocks, meta, seed, x, y, z, width, yaw, pitch, start, end, vScale) {
      const ccx = cx * 16 + 8, ccz = cz * 16 + 8;
      let yawV = 0, pitchV = 0;
      const rng = new Random(seed);
      if (end <= 0) { const max = 8 * 16 - 16; end = max - rng.nextInt(max / 4 | 0); }
      let room = false;
      if (start === -1) { start = end / 2 | 0; room = true; }
      const split = rng.nextInt(end / 2 | 0) + (end / 4 | 0);
      const steep = rng.nextInt(6) === 0;
      for (; start < end; start++) {
        const hr = 1.5 + Math.sin(start * Math.PI / end) * width;
        const vr = hr * vScale;
        const cp = Math.cos(pitch), sp = Math.sin(pitch);
        x += Math.cos(yaw) * cp; y += sp; z += Math.sin(yaw) * cp;
        pitch *= steep ? 0.92 : 0.7;
        pitch += pitchV * 0.1; yaw += yawV * 0.1;
        pitchV *= 0.9; yawV *= 0.75;
        pitchV += (rng.nextFloat() - rng.nextFloat()) * rng.nextFloat() * 2;
        yawV += (rng.nextFloat() - rng.nextFloat()) * rng.nextFloat() * 4;
        if (!room && start === split && width > 1 && end > 0) {
          const s1 = rng.nextSeed(), s2 = rng.nextSeed(), w1 = rng.nextFloat() * 0.5 + 0.5, w2 = rng.nextFloat() * 0.5 + 0.5;
          this.tunnel(cx, cz, blocks, meta, s1, x, y, z, w1, yaw - Math.PI / 2, pitch / 3, start, end, 1.0);
          this.tunnel(cx, cz, blocks, meta, s2, x, y, z, w2, yaw + Math.PI / 2, pitch / 3, start, end, 1.0);
          return;
        }
        if (room || rng.nextInt(4) !== 0) {
          const dx = x - ccx, dz = z - ccz, rem = end - start, maxR = width + 2 + 16;
          if (dx * dx + dz * dz - rem * rem > maxR * maxR) return;
          if (x >= ccx - 16 - hr * 2 && z >= ccz - 16 - hr * 2 && x <= ccx + 16 + hr * 2 && z <= ccz + 16 + hr * 2) {
            this.carveBlob(cx, cz, blocks, meta, x, y, z, hr, vr, false, null);
            if (room) break;
          }
        }
      }
    }
    carveBlob(cx, cz, blocks, meta, x, y, z, hr, vr, ravine, wallR) {
      const bx0 = cx * 16, bz0 = cz * 16;
      const xa = Math.max(0, Math.floor(x - hr) - bx0 - 1), xb = Math.min(16, Math.floor(x + hr) - bx0 + 1);
      const ya = Math.max(1, Math.floor(y - vr) - 1), yb = Math.min(H - 8, Math.floor(y + vr) + 1);
      const za = Math.max(0, Math.floor(z - hr) - bz0 - 1), zb = Math.min(16, Math.floor(z + hr) - bz0 + 1);
      if (xa >= xb || za >= zb || ya >= yb) return;
      // never breach oceans / lakes
      for (let bx = xa; bx < xb; bx++) for (let bz = za; bz < zb; bz++) {
        for (let by = yb + 1; by >= ya - 1; by--) {
          if (by < 0 || by >= H) continue;
          if (blocks[IDX(bx, by, bz)] === B.WATER) return;
          if (by !== ya - 1 && bx !== xa && bx !== xb - 1 && bz !== za && bz !== zb - 1) by = ya;
        }
      }
      for (let bx = xa; bx < xb; bx++) {
        const ddx = (bx + bx0 + 0.5 - x) / hr;
        for (let bz = za; bz < zb; bz++) {
          const ddz = (bz + bz0 + 0.5 - z) / hr;
          if (!ravine && ddx * ddx + ddz * ddz >= 1) continue;
          let foundTop = false;
          for (let by = yb - 1; by >= ya; by--) {
            const ddy = (by + 0.5 - y) / vr;
            let inside;
            if (ravine) inside = (ddx * ddx + ddz * ddz) * wallR[by] + ddy * ddy / 6 < 1;
            else inside = ddy > -0.7 && ddx * ddx + ddy * ddy + ddz * ddz < 1;
            if (!inside) continue;
            const i = IDX(bx, by, bz);
            const id = blocks[i];
            if (id === B.GRASS || id === B.MYCELIUM || id === B.PODZOL) foundTop = true;
            if (id === B.STONE || id === B.DIRT || id === B.GRASS || id === B.SAND || id === B.GRAVEL || id === B.SANDSTONE ||
              id === B.TERRACOTTA || id === B.PODZOL || id === B.MYCELIUM || id === B.ASH || id === B.BASALT || id === B.PEAT ||
              id === B.SCORCHED_STONE || id === B.SALT || id === B.CLAY || id === B.QUICKSAND) {
              if ((id === B.SAND || id === B.GRAVEL) && by > SEA - 3) { /* keep sand roofs near surface from floating */ if (blocks[i + 256] === 0) continue; }
              if (by < 11) { blocks[i] = B.LAVA; meta[i] = 0; }
              else {
                blocks[i] = 0; meta[i] = 0;
                if (foundTop && by > 0 && blocks[i - 256] === B.DIRT) blocks[i - 256] = B.GRASS;
              }
            }
          }
        }
      }
    }
    carveRavines(cx, cz, blocks, meta) {
      const R = 8;
      for (let sx = cx - R; sx <= cx + R; sx++) for (let sz = cz - R; sz <= cz + R; sz++) {
        const rng = new Random(seedHash(this.seed, sx, sz, 0x2A71));
        if (rng.nextInt(60) !== 0) continue;
        const x = sx * 16 + rng.nextInt(16), y = rng.nextInt(rng.nextInt(40) + 8) + 20, z = sz * 16 + rng.nextInt(16);
        const yaw = rng.nextFloat() * Math.PI * 2, pitch = (rng.nextFloat() - 0.5) * 2 / 8;
        const width = (rng.nextFloat() * 2 + rng.nextFloat()) * 2;
        this.ravine(cx, cz, blocks, meta, rng.nextSeed(), x, y, z, width, yaw, pitch, 3.0);
      }
    }
    ravine(cx, cz, blocks, meta, seed, x, y, z, width, yaw, pitch, vScale) {
      const rng = new Random(seed);
      const ccx = cx * 16 + 8, ccz = cz * 16 + 8;
      let yawV = 0, pitchV = 0;
      const end = 112 - rng.nextInt(28);
      const wallR = new Float32Array(H);
      let f = 1;
      for (let i = 0; i < H; i++) { if (i === 0 || rng.nextInt(3) === 0) f = 1 + rng.nextFloat() * rng.nextFloat(); wallR[i] = f * f; }
      for (let s = 0; s < end; s++) {
        let hr = 1.5 + Math.sin(s * Math.PI / end) * width;
        let vr = hr * vScale;
        hr *= rng.nextFloat() * 0.25 + 0.75; vr *= rng.nextFloat() * 0.25 + 0.75;
        const cp = Math.cos(pitch), sp = Math.sin(pitch);
        x += Math.cos(yaw) * cp; y += sp; z += Math.sin(yaw) * cp;
        pitch *= 0.7; pitch += pitchV * 0.05; yaw += yawV * 0.05;
        pitchV *= 0.8; yawV *= 0.5;
        pitchV += (rng.nextFloat() - rng.nextFloat()) * rng.nextFloat() * 2;
        yawV += (rng.nextFloat() - rng.nextFloat()) * rng.nextFloat() * 4;
        if (rng.nextInt(4) === 0) continue;
        const dx = x - ccx, dz = z - ccz, rem = end - s, maxR = width + 2 + 16;
        if (dx * dx + dz * dz - rem * rem > maxR * maxR) return;
        if (x >= ccx - 16 - hr * 2 && z >= ccz - 16 - hr * 2 && x <= ccx + 16 + hr * 2 && z <= ccz + 16 + hr * 2) {
          this.carveBlob(cx, cz, blocks, meta, x, y, z, hr, vr, true, wallR);
        }
      }
    }

    // ---- full chunk ----
    generate(cx, cz) {
      const t = this.terrain(cx, cz);
      const blocks = t.blocks.slice(), meta = t.meta.slice(), biomes = t.biomes.slice();
      const out = { cx, cz, blocks, meta, biomes, entities: [], tiles: [], ticks: [] };
      if (this.type === 'flat') { this.spawnAnimals(out, t); return out; }
      this.ores(cx, cz, blocks, meta, biomes);
      const plan = this.plan(cx, cz);
      // local structures (fully inside this chunk)
      for (const s of plan.local) this.buildLocal(out, s);
      this.decorate(cx, cz, blocks, meta, biomes, t, plan);
      // cross-chunk features from the 3x3 neighbourhood, in absolute order
      const W = new Writer(cx, cz, blocks, meta);
      for (let phase = 0; phase < 2; phase++) {
        for (let nz = cz - 1; nz <= cz + 1; nz++) for (let nx = cx - 1; nx <= cx + 1; nx++) {
          const p = (nx === cx && nz === cz) ? plan : this.plan(nx, nz);
          for (const f of p.features) if (f.phase === phase) this.placeFeature(W, f);
        }
      }
      this.springs(cx, cz, blocks, meta, out);
      this.freeze(cx, cz, blocks, meta, biomes);
      this.spawnAnimals(out, t);
      return out;
    }

    // ---- ores & stone variety ----
    vein(blocks, meta, rng, x, y, z, size, ore, oreMeta, test) {
      const angle = rng.nextFloat() * Math.PI;
      const sx = Math.sin(angle) * size / 8, sz = Math.cos(angle) * size / 8;
      const x1 = x + sx, x2 = x - sx, z1 = z + sz, z2 = z - sz;
      const y1 = y + rng.nextInt(3) - 2, y2 = y + rng.nextInt(3) - 2;
      for (let i = 0; i <= size; i++) {
        const px = x1 + (x2 - x1) * i / size, py = y1 + (y2 - y1) * i / size, pz = z1 + (z2 - z1) * i / size;
        const r = rng.nextFloat() * size / 16;
        const rad = ((Math.sin(i * Math.PI / size) + 1) * r + 1) / 2;
        const xa = Math.floor(px - rad), xb = Math.floor(px + rad), ya = Math.floor(py - rad), yb = Math.floor(py + rad), za = Math.floor(pz - rad), zb = Math.floor(pz + rad);
        for (let bx = xa; bx <= xb; bx++) {
          if (bx < 0 || bx > 15) continue;
          const dx = (bx + 0.5 - px) / rad; if (dx * dx >= 1) continue;
          for (let by = ya; by <= yb; by++) {
            if (by < 1 || by >= H) continue;
            const dy = (by + 0.5 - py) / rad; if (dx * dx + dy * dy >= 1) continue;
            for (let bz = za; bz <= zb; bz++) {
              if (bz < 0 || bz > 15) continue;
              const dz = (bz + 0.5 - pz) / rad; if (dx * dx + dy * dy + dz * dz >= 1) continue;
              const idx = IDX(bx, by, bz);
              if (test(blocks[idx])) { blocks[idx] = ore; meta[idx] = oreMeta || 0; }
            }
          }
        }
      }
    }
    ores(cx, cz, blocks, meta, biomes) {
      const rng = new Random(seedHash(this.seed, cx, cz, 0x04E5));
      const stone = (id) => id === B.STONE;
      const stoneOrSlate = (id) => id === B.STONE || id === B.SLATE;
      const b = BIOMES[biomes[136]];
      const run = (count, size, ore, ymin, ymax, test, oreMeta) => {
        for (let i = 0; i < count; i++) this.vein(blocks, meta, rng, rng.nextInt(16), ymin + rng.nextInt(Math.max(1, ymax - ymin)), rng.nextInt(16), size, ore, oreMeta, test || stone);
      };
      run(10, 33, B.DIRT, 0, 128);
      run(8, 33, B.GRAVEL, 0, 128);
      run(8, 33, B.SLATE, 0, 48);
      run(b === BI.MOUNTAINS || b === BI.STONE_SHORE ? 10 : 5, 33, B.MARBLE, 24, 100);
      if (b === BI.ASHEN) run(12, 33, B.BASALT, 20, 100);
      run(20, 17, B.COAL_ORE, 0, 128);
      run(20, 9, B.IRON_ORE, 0, 64, stoneOrSlate);
      run(2, 9, B.GOLD_ORE, 0, 32, stoneOrSlate);
      if (b === BI.CANYON) run(14, 9, B.GOLD_ORE, 32, 90, (id) => id === B.STONE || id === B.TERRACOTTA);
      run(8, 8, B.EMBER_ORE, 0, 16, stoneOrSlate);
      run(1, 8, B.DIAMOND_ORE, 0, 16, stoneOrSlate);
      for (let i = 0; i < 1; i++) this.vein(blocks, meta, rng, rng.nextInt(16), rng.nextInt(16) + rng.nextInt(16), rng.nextInt(16), 7, B.LAPIS_ORE, 0, stone);
      run(3, 6, B.COBALT_ORE, 0, 26, stoneOrSlate);
      run(4, 4, B.COBALT_ORE, 0, 40, (id) => id === B.SLATE);
      run(5, 8, B.SULFUR_ORE, 0, 22, stoneOrSlate);
      if (b === BI.ASHEN) run(14, 10, B.SULFUR_ORE, 30, 100, (id) => id === B.STONE || id === B.BASALT);
      if (b.jade) run(7, 4, B.JADE_ORE, 4, 70, stone);
    }

    // ---- planning: deterministic per chunk from its terrain ----
    plan(cx, cz) {
      const key = (cx + 32768) * 65536 + (cz + 32768);
      let p = this.planCache.get(key);
      if (p) return p;
      p = this.makePlan(cx, cz);
      this.planCache.set(key, p);
      if (this.planCache.size > 900) this.planCache.delete(this.planCache.keys().next().value);
      return p;
    }
    makePlan(cx, cz) {
      const t = this.terrain(cx, cz);
      const rng = new Random(seedHash(this.seed, cx, cz, 0xFEA7));
      const features = [], local = [];
      const x0 = cx * 16, z0 = cz * 16;
      const center = BIOMES[t.biomes[8 * 16 + 8]];
      const occupied = new Uint8Array(256);
      const surf = (x, z) => t.height[z * 16 + x];
      const topId = (x, z) => t.blocks[IDX(x, t.height[z * 16 + x], z)];
      const isDry = (x, z) => { const y = t.height[z * 16 + x]; return t.blocks[IDX(x, y + 1, z)] === 0; };
      const mark = (x0l, z0l, w, d) => { for (let z = Math.max(0, z0l); z < Math.min(16, z0l + d); z++) for (let x = Math.max(0, x0l); x < Math.min(16, x0l + w); x++) occupied[z * 16 + x] = 1; };

      // ---- structures ----
      if (this.structuresOn) {
        const sr = new Random(seedHash(this.seed, cx, cz, 0x57C7));
        const roll = sr.nextFloat();
        const kinds = center.structures;
        // dungeons are underground and independent of biome
        for (let a = 0; a < 6; a++) {
          const dx = 4 + sr.nextInt(8), dz = 4 + sr.nextInt(8), dy = 12 + sr.nextInt(40);
          if (this.dungeonValid(t, dx, dy, dz)) { local.push({ type: 'dungeon', x: dx, y: dy, z: dz, seed: sr.nextSeed() }); break; }
        }
        if (kinds.length) {
          const kind = kinds[sr.nextInt(kinds.length)];
          const lx = 4 + sr.nextInt(8), lz = 4 + sr.nextInt(8);
          const y = surf(lx, lz);
          const dry = isDry(lx, lz);
          const flatEnough = (r) => { let lo = 999, hi = 0; for (let z = lz - r; z <= lz + r; z++) for (let x = lx - r; x <= lx + r; x++) { const h = surf(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); } return hi - lo <= 2; };
          const seed = sr.nextSeed();
          if (kind === 'tower' && roll < 0.012 && dry && y > SEA && flatEnough(2)) { local.push({ type: 'tower', x: lx, y, z: lz, seed }); mark(lx - 3, lz - 3, 7, 7); }
          else if (kind === 'camp' && roll < 0.014 && dry && y > SEA && flatEnough(3)) { local.push({ type: 'camp', x: lx, y, z: lz, seed }); mark(lx - 4, lz - 4, 9, 9); }
          else if (kind === 'hut' && roll < 0.008 && dry && y > SEA && flatEnough(3)) { local.push({ type: 'hut', x: lx, y, z: lz, seed }); mark(lx - 4, lz - 4, 9, 9); }
          else if (kind === 'well' && roll < 0.01 && dry && y > SEA && flatEnough(2)) { local.push({ type: 'well', x: lx, y, z: lz, seed }); mark(lx - 3, lz - 3, 6, 6); }
          else if (kind === 'treasure' && roll < 0.02 && y >= SEA - 3) { local.push({ type: 'treasure', x: lx, y, z: lz, seed }); }
          else if (kind === 'ruins' && roll < 0.012 && y < SEA - 4) { local.push({ type: 'ruins', x: lx, y, z: lz, seed }); }
          else if (kind === 'quicksand' && roll < 0.05 && dry) { local.push({ type: 'quickpit', x: lx, y, z: lz, seed }); }
          else if (kind === 'crater' && roll < 0.0045 && dry && y > SEA) {
            const ax = x0 + lx, az = z0 + lz;
            features.push({ phase: 0, type: 'crater', x: ax, y, z: az, seed, r: 5 + sr.nextInt(5) }); mark(lx - 6, lz - 6, 13, 13);
          }
          else if (kind === 'circle' && roll < 0.03 && dry && y > SEA && flatEnough(3)) {
            features.push({ phase: 0, type: 'circle', x: x0 + lx, y, z: z0 + lz, seed, r: 5 + sr.nextInt(3) }); mark(lx - 7, lz - 7, 15, 15);
          }
        }
      }

      // ---- trees ----
      let count = Math.floor(center.trees);
      if (rng.nextFloat() < center.trees - count) count++;
      if (center.trees > 0 && rng.nextInt(10) === 0) count++;
      for (let i = 0; i < count; i++) {
        const lx = rng.nextInt(16), lz = rng.nextInt(16);
        const seed = rng.nextSeed();
        const b = BIOMES[t.biomes[lz * 16 + lx]];
        if (!b.trees || occupied[lz * 16 + lx]) continue;
        const kind = pickWeighted(rng, b.treeKinds);
        const y = surf(lx, lz);
        if (y >= 116) continue;
        const tb = topId(lx, lz);
        const above = t.blocks[IDX(lx, y + 1, lz)];
        if (kind === 'huge_mushroom') { if (tb !== B.MYCELIUM && tb !== B.GRASS) continue; }
        else if (!LAND_TOP_OK[tb] && !(kind === 'dead' && (tb === B.ASH || tb === B.BASALT || tb === B.SCORCHED_STONE))) continue;
        if (above !== 0 && !(kind === 'swamp_oak' && above === B.WATER && t.blocks[IDX(lx, y + 2, lz)] === 0)) continue;
        features.push({ phase: 1, type: 'tree', kind, x: x0 + lx, y: y + 1, z: z0 + lz, seed });
      }
      // ---- boulders & fallen logs ----
      if (center.boulders && rng.nextFloat() < center.boulders) {
        const lx = rng.nextInt(16), lz = rng.nextInt(16), y = surf(lx, lz);
        if (!occupied[lz * 16 + lx] && LAND_TOP_OK[topId(lx, lz)] && isDry(lx, lz)) features.push({ phase: 1, type: 'boulder', x: x0 + lx, y, z: z0 + lz, seed: rng.nextSeed() });
      }
      if (center.logs && rng.nextFloat() < center.logs) {
        const lx = rng.nextInt(16), lz = rng.nextInt(16), y = surf(lx, lz);
        const kind = pickWeighted(rng, center.treeKinds);
        const wood = { oak: 0, big_oak: 0, birch: 2, spruce: 1, pine: 1, maple: 4, gold_maple: 4, redwood: 5, small_redwood: 5, jungle: 3 }[kind] || 0;
        const alongX = rng.nextBool();
        let len = 0;
        const want = 3 + rng.nextInt(4);
        while (len < want) {
          const ax = lx + (alongX ? len : 0), az = lz + (alongX ? 0 : len);
          if (ax > 15 || az > 15 || occupied[az * 16 + ax] || surf(ax, az) !== y || !LAND_TOP_OK[topId(ax, az)] || !isDry(ax, az)) break;
          len++;
        }
        if (len >= 3) features.push({ phase: 1, type: 'log', wood, len, alongX, x: x0 + lx, y: y + 1, z: z0 + lz, seed: rng.nextSeed() });
      }
      return { features, local, occupied };
    }

    dungeonValid(t, x, y, z) {
      let openings = 0;
      for (let dx = -3; dx <= 3; dx++) for (let dy = -1; dy <= 4; dy++) for (let dz = -3; dz <= 3; dz++) {
        const id = t.blocks[IDX(x + dx, y + dy, z + dz)];
        const solid = id !== 0 && id !== B.WATER && id !== B.LAVA;
        if ((dy === -1 || dy === 4) && !solid) return false;
        if (id === B.WATER || id === B.LAVA) return false;
        if ((Math.abs(dx) === 3 || Math.abs(dz) === 3) && dy === 0 && id === 0 && t.blocks[IDX(x + dx, y + 1, z + dz)] === 0) openings++;
      }
      return openings >= 1 && openings <= 5;
    }

    // ---- local structures ----
    buildLocal(out, s) {
      const { blocks, meta } = out;
      const rng = new Random(s.seed);
      const set = (x, y, z, id, m) => { if (x < 0 || x > 15 || z < 0 || z > 15 || y < 1 || y >= H) return; const i = IDX(x, y, z); blocks[i] = id; meta[i] = m || 0; };
      const get = (x, y, z) => (x < 0 || x > 15 || z < 0 || z > 15 || y < 0 || y >= H) ? 0 : blocks[IDX(x, y, z)];
      const wx = out.cx * 16, wz = out.cz * 16;
      const chest = (x, y, z, table, facing) => { set(x, y, z, B.CHEST, facing || 0); out.tiles.push({ type: 'chest', x: wx + x, y, z: wz + z, items: this.loot(rng, table) }); };
      const fillDown = (x, y, z, id, m) => { while (y > 0 && (get(x, y, z) === 0 || get(x, y, z) === B.WATER || REPL[get(x, y, z)])) { set(x, y, z, id, m); y--; } };
      switch (s.type) {
        case 'dungeon': {
          const { x, y, z } = s;
          for (let dx = -3; dx <= 3; dx++) for (let dy = -1; dy <= 4; dy++) for (let dz = -3; dz <= 3; dz++) {
            const wall = Math.abs(dx) === 3 || Math.abs(dz) === 3 || dy === -1 || dy === 4;
            const cur = get(x + dx, y + dy, z + dz);
            if (!wall) { set(x + dx, y + dy, z + dz, 0); continue; }
            if (dy === -1) set(x + dx, y + dy, z + dz, rng.nextInt(4) === 0 ? B.COBBLESTONE : B.MOSSY_COBBLESTONE);
            else if (cur !== 0 || dy === 4) set(x + dx, y + dy, z + dz, (dy === 4 || rng.nextInt(3)) ? B.COBBLESTONE : B.MOSSY_COBBLESTONE);
          }
          set(x, y, z, B.MOB_SPAWNER);
          out.tiles.push({ type: 'spawner', x: wx + x, y, z: wz + z, mob: ['zombie', 'zombie', 'skeleton', 'spider'][rng.nextInt(4)] });
          let chests = 0;
          for (let a = 0; a < 8 && chests < 2; a++) {
            const cxl = x + rng.nextInt(5) - 2, czl = z + rng.nextInt(5) - 2;
            if (cxl === x && czl === z) continue;
            let walls = 0;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (OPAQUE[get(cxl + dx, y, czl + dz)]) walls++;
            if (walls === 1) { chest(cxl, y, czl, 'dungeon', rng.nextInt(4)); chests++; }
          }
          break;
        }
        case 'tower': {
          const { x, z } = s; let y = s.y;
          const h = 9 + rng.nextInt(6);
          for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) fillDown(x + dx, y, z + dz, B.COBBLESTONE);
          for (let dy = 1; dy <= h; dy++) {
            for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
              const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
              const broken = dy > h - 3 - rng.nextInt(4) && rng.nextInt(3) === 0;
              if (edge && !broken) {
                const window = dy % 4 === 2 && (dx === 0 || dz === 0);
                set(x + dx, y + dy, z + dz, window ? 0 : B.STONE_BRICKS, window ? 0 : [0, 0, 1, 2][rng.nextInt(4)]);
              } else if (!edge) set(x + dx, y + dy, z + dz, (dy % 5 === 0 && !(dx === -1 && dz === -1)) ? B.PLANKS : 0, 1);
            }
          }
          set(x, y + 1, z + 2, 0); set(x, y + 2, z + 2, 0); // doorway (south)
          for (let dy = 1; dy <= h; dy++) if (get(x - 1, y + dy, z - 1) === 0) set(x - 1, y + dy, z - 1, B.LADDER, 1);
          chest(x + 1, y + 1, z - 1, 'tower', 1);
          if (rng.nextBool()) chest(x + 1, y + 1 + 5 * (1 + rng.nextInt(Math.max(1, Math.floor(h / 5) - 1))), z + 1, 'tower', 0);
          set(x - 1, y + 3, z + 1, B.TORCH, 1);
          break;
        }
        case 'camp': {
          const { x, z } = s; const y = s.y;
          const col = [14, 11, 13, 1, 4][rng.nextInt(5)];
          // A-frame tent (wool) along x
          for (let dx = -2; dx <= 2; dx++) {
            fillDown(x + dx, y, z - 2, B.DIRT); fillDown(x + dx, y, z + 2, B.DIRT);
            set(x + dx, y + 1, z - 2, B.WOOL, col); set(x + dx, y + 1, z + 2, B.WOOL, col);
            set(x + dx, y + 2, z - 1, B.WOOL, col); set(x + dx, y + 2, z + 1, B.WOOL, col);
            set(x + dx, y + 3, z, B.WOOL, col);
            set(x + dx, y + 1, z - 1, 0); set(x + dx, y + 1, z, 0); set(x + dx, y + 1, z + 1, 0); set(x + dx, y + 2, z, 0);
          }
          set(x - 2, y + 1, z, B.LOG, 0); set(x - 2, y + 2, z, B.LOG, 0);
          chest(x + 1, y + 1, z - 1, 'camp', 1);
          set(x - 1, y + 1, z + 1, B.CRAFTING_TABLE);
          // fire pit
          const fx = x + 3 < 15 ? x + 3 : x - 4;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) set(fx + dx, y + 1, z + dz, B.COBBLESTONE);
          set(fx, y, z, B.LOG, 0); set(fx, y + 1, z, B.TORCH, 0);
          break;
        }
        case 'hut': {
          const { x, z } = s; const y = s.y;
          const wood = rng.nextInt(3);
          for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
            fillDown(x + dx, y, z + dz, B.COBBLESTONE);
            for (let dy = 1; dy <= 4; dy++) {
              const edge = Math.abs(dx) === 3 || Math.abs(dz) === 3;
              const corner = Math.abs(dx) === 3 && Math.abs(dz) === 3;
              if (dy === 4) { set(x + dx, y + dy, z + dz, B.PLANKS, wood); continue; }
              if (corner) set(x + dx, y + dy, z + dz, B.LOG, wood);
              else if (edge) set(x + dx, y + dy, z + dz, (dy === 2 && (dx === 0 || dz === 0)) ? B.GLASS_PANE : B.PLANKS, wood);
              else set(x + dx, y + dy, z + dz, 0);
            }
          }
          for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) set(x + dx, y + 5, z + dz, B.SLAB, wood);
          set(x, y + 1, z + 3, B.DOOR_WOOD, 0); set(x, y + 2, z + 3, B.DOOR_WOOD, 8);
          set(x - 2, y + 1, z - 2, B.CRAFTING_TABLE); set(x - 1, y + 1, z - 2, B.FURNACE, 1);
          chest(x + 2, y + 1, z - 2, 'hut', 1);
          set(x + 2, y + 1, z + 1, B.BED, 0 | 0); set(x + 2, y + 1, z, B.BED, 0 | 4);
          set(x - 2, y + 3, z, B.TORCH, 1);
          set(x - 2, y + 1, z + 1, B.BOOKSHELF);
          break;
        }
        case 'well': {
          const { x, z } = s; const y = s.y;
          for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
            fillDown(x + dx, y, z + dz, B.SANDSTONE);
            set(x + dx, y + 1, z + dz, (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) ? B.SANDSTONE : B.SLAB, 10);
            set(x + dx, y + 1, z + dz, (Math.abs(dx) === 2 || Math.abs(dz) === 2) ? B.SLAB : B.SANDSTONE, 10);
          }
          set(x, y + 1, z, B.WATER); set(x, y, z, B.SANDSTONE);
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) set(x + dx, y + 1, z + dz, B.WATER);
          for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { set(x + dx, y + 2, z + dz, B.SANDSTONE); set(x + dx, y + 3, z + dz, B.SANDSTONE); }
          for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(x + dx, y + 4, z + dz, B.SLAB, 10);
          set(x, y + 4, z, B.SANDSTONE);
          break;
        }
        case 'treasure': {
          const { x, z } = s; const y = Math.max(5, s.y - 3 - rng.nextInt(2));
          chest(x, y, z, 'treasure', rng.nextInt(4));
          out.tiles[out.tiles.length - 1].buried = true;
          break;
        }
        case 'ruins': {
          const { x, z } = s; const y = s.y;
          for (let k = 0; k < 6; k++) {
            const px = x - 3 + rng.nextInt(7), pz = z - 3 + rng.nextInt(7), ph = 1 + rng.nextInt(5);
            for (let dy = 1; dy <= ph; dy++) set(px, y + dy, pz, B.STONE_BRICKS, rng.nextInt(3) === 0 ? 1 : (rng.nextBool() ? 2 : 0));
          }
          for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (rng.nextInt(3)) set(x + dx, y, z + dz, B.STONE_BRICKS, rng.nextInt(3));
          chest(x, y + 1, z, 'ruins', rng.nextInt(4));
          break;
        }
        case 'quickpit': {
          const { x, z } = s;
          const r = 2 + rng.nextInt(2);
          for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
            if (dx * dx + dz * dz > r * r + 1) continue;
            for (let dy = 0; dy < 3; dy++) { const yy = s.y - dy; if (get(x + dx, yy, z + dz) === B.SAND || get(x + dx, yy, z + dz) === B.SANDSTONE) set(x + dx, yy, z + dz, B.QUICKSAND); }
          }
          break;
        }
      }
    }

    loot(rng, table) {
      const T = {
        dungeon: [[I.bread, 1, 3, 10], [I.wheat, 1, 4, 10], [I.iron_ingot, 1, 4, 10], [I.gold_ingot, 1, 3, 5], [I.ember_dust, 1, 4, 10], [I.string, 1, 4, 10], [I.gunpowder, 1, 4, 10], [I.bucket, 1, 1, 10], [I.apple, 1, 2, 8], [I.golden_apple, 1, 1, 1], [I.jade, 1, 2, 3], [I.lumite_shard, 2, 5, 6], [I.bone, 2, 6, 8], [I.prospector_rod, 1, 1, 2], [I.diamond, 1, 1, 2]],
        tower: [[I.arrow, 4, 12, 10], [I.bow, 1, 1, 4], [I.iron_ingot, 1, 4, 8], [I.coal, 2, 8, 10], [B.TORCH, 4, 12, 8], [I.bread, 1, 3, 8], [I.jade, 1, 2, 4], [I.cobalt_ingot, 1, 2, 3], [I.wayfinder, 1, 1, 2], [I.iron_sword, 1, 1, 3], [I.compass, 1, 1, 3], [I.book, 1, 3, 5]],
        camp: [[I.bread, 1, 4, 10], [I.apple, 1, 3, 10], [B.TORCH, 3, 10, 10], [I.coal, 1, 6, 8], [I.string, 1, 4, 8], [I.leather, 1, 3, 6], [B.WOOL, 1, 3, 5], [I.cooked_venison, 1, 3, 6], [B.ROPE, 4, 10, 8], [I.berries, 2, 6, 8], [I.stone_axe, 1, 1, 4], [I.flint_and_steel, 1, 1, 2]],
        hut: [[I.book, 1, 3, 8], [I.paper, 2, 6, 8], [I.seeds, 2, 8, 10], [I.carrot, 1, 4, 8], [I.potato, 1, 4, 8], [B.SAPLING, 1, 3, 8], [I.dye, 2, 6, 6], [I.jerky, 1, 4, 8], [I.compass, 1, 1, 3], [I.clock, 1, 1, 3], [I.salt, 2, 6, 6], [I.berry_pie, 1, 2, 4]],
        treasure: [[I.gold_ingot, 2, 6, 10], [I.diamond, 1, 3, 6], [I.jade, 2, 5, 8], [I.golden_apple, 1, 1, 3], [I.cobalt_ingot, 1, 4, 6], [I.starmetal_ingot, 1, 1, 1], [I.gold_nugget, 4, 12, 8], [I.wisp_essence, 1, 2, 4], [I.iron_ingot, 2, 5, 8]],
        ruins: [[I.gold_nugget, 3, 10, 10], [I.fish, 1, 4, 8], [I.jade, 1, 3, 5], [I.diamond, 1, 1, 2], [I.iron_ingot, 1, 3, 6], [I.lumite_shard, 1, 4, 6]],
      }[table] || [];
      const items = [];
      const n = 3 + rng.nextInt(5);
      let tot = 0; for (const e of T) tot += e[3];
      for (let i = 0; i < n; i++) {
        let r = rng.nextFloat() * tot, pick = T[0];
        for (const e of T) { r -= e[3]; if (r <= 0) { pick = e; break; } }
        if (!pick) continue;
        const count = pick[1] + rng.nextInt(pick[2] - pick[1] + 1);
        let dmg = 0;
        if (pick[0] === I.dye) dmg = rng.nextInt(16);
        if (pick[0] === B.WOOL) dmg = rng.nextInt(16);
        if (pick[0] === B.SAPLING) dmg = rng.nextInt(7);
        items.push({ slot: rng.nextInt(27), id: pick[0], c: count, d: dmg });
      }
      return items;
    }

    // ---- decorations (local to this chunk) ----
    decorate(cx, cz, blocks, meta, biomes, t, plan) {
      const rng = new Random(seedHash(this.seed, cx, cz, 0xDEC0));
      const x0 = cx * 16, z0 = cz * 16;
      const top = (x, z) => { let y = H - 2; while (y > 0 && blocks[IDX(x, y, z)] === 0) y--; return y; };
      const get = (x, y, z) => (x < 0 || x > 15 || z < 0 || z > 15 || y < 0 || y >= H) ? -1 : blocks[IDX(x, y, z)];
      const set = (x, y, z, id, m) => { const i = IDX(x, y, z); blocks[i] = id; meta[i] = m || 0; };
      const center = BIOMES[biomes[136]];
      const grassy = (id) => id === B.GRASS || id === B.PODZOL || id === B.DIRT;
      const plant = (x, z, id, m, need) => {
        const y = top(x, z);
        if (y >= H - 2) return false;
        const below = blocks[IDX(x, y, z)];
        if (!(need ? need(below) : grassy(below))) return false;
        if (blocks[IDX(x, y + 1, z)] !== 0) return false;
        set(x, y + 1, z, id, m); return true;
      };
      const colB = (x, z) => BIOMES[biomes[z * 16 + x]];
      // tall grass & ferns
      for (let i = 0; i < center.tallGrass + center.ferns; i++) {
        const x = rng.nextInt(16), z = rng.nextInt(16), b = colB(x, z);
        if (!b.tallGrass && !b.ferns) continue;
        const fern = rng.nextInt(b.tallGrass + b.ferns) >= b.tallGrass;
        plant(x, z, B.TALL_GRASS, fern ? 2 : 1);
      }
      // flower patches
      let fc = Math.floor(center.flowers); if (rng.nextFloat() < center.flowers - fc) fc++;
      for (let i = 0; i < fc; i++) {
        const cxl = rng.nextInt(16), czl = rng.nextInt(16), b = colB(cxl, czl);
        if (!b.flowers) continue;
        const kind = b.flowerKinds[rng.nextInt(b.flowerKinds.length)];
        for (let k = 0; k < 8; k++) {
          const x = cxl + rng.nextInt(5) - 2, z = czl + rng.nextInt(5) - 2;
          if (x < 0 || x > 15 || z < 0 || z > 15) continue;
          plant(x, z, B.FLOWER, kind === 7 && b === BI.ASHEN ? 7 : kind, (id) => id === B.GRASS || (b === BI.ASHEN && id === B.ASH));
        }
      }
      // dead bushes
      for (let i = 0; i < center.deadBush; i++) {
        const x = rng.nextInt(16), z = rng.nextInt(16);
        plant(x, z, B.DEAD_BUSH, 0, (id) => id === B.SAND || id === B.TERRACOTTA || id === B.ASH || id === B.SALT || id === B.DIRT);
      }
      // cacti
      for (let i = 0; i < center.cactus; i++) {
        const x = rng.nextInt(16), z = rng.nextInt(16);
        if (colB(x, z) !== BI.DESERT) continue;
        const y = top(x, z);
        if (blocks[IDX(x, y, z)] !== B.SAND || blocks[IDX(x, y + 1, z)] !== 0) continue;
        let ok = true;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = get(x + dx, y + 1, z + dz); if (n !== 0 && n !== -1) ok = false; }
        if (!ok) continue;
        const h = 1 + rng.nextInt(rng.nextInt(3) + 1);
        for (let k = 1; k <= h; k++) set(x, y + k, z, B.CACTUS);
      }
      // sugar cane near water
      for (let i = 0; i < center.cane; i++) {
        const x = rng.nextInt(16), z = rng.nextInt(16);
        const y = top(x, z);
        const g = blocks[IDX(x, y, z)];
        if (!(g === B.GRASS || g === B.DIRT || g === B.SAND) || blocks[IDX(x, y + 1, z)] !== 0) continue;
        let water = false;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (get(x + dx, y, z + dz) === B.WATER) water = true;
        if (!water) continue;
        const h = 1 + rng.nextInt(3);
        for (let k = 1; k <= h; k++) set(x, y + k, z, B.SUGAR_CANE);
      }
      // pumpkins
      if (center.pumpkins && rng.nextInt(center.pumpkinBoost ? 6 : 32) === 0) {
        const cxl = rng.nextInt(16), czl = rng.nextInt(16);
        for (let k = 0; k < 6; k++) { const x = clamp(cxl + rng.nextInt(5) - 2, 0, 15), z = clamp(czl + rng.nextInt(5) - 2, 0, 15); plant(x, z, B.PUMPKIN, rng.nextInt(4), (id) => id === B.GRASS); }
      }
      // melons
      if (center.melons) for (let k = 0; k < 4; k++) { const x = rng.nextInt(16), z = rng.nextInt(16); if (rng.nextInt(3) === 0) plant(x, z, B.MELON, 0, (id) => id === B.GRASS); }
      // mushrooms in shade
      for (let i = 0; i < center.mushrooms; i++) {
        const x = rng.nextInt(16), z = rng.nextInt(16);
        plant(x, z, rng.nextBool() ? B.MUSHROOM_BROWN : B.MUSHROOM_RED, 0, (id) => id === B.GRASS || id === B.MYCELIUM || id === B.PODZOL || id === B.DIRT);
      }
      // brambles
      if (center.bramble) for (let i = 0; i < center.bramble; i++) if (rng.nextInt(3) === 0) { const x = rng.nextInt(16), z = rng.nextInt(16); plant(x, z, B.BRAMBLE, rng.nextInt(4)); }
      // leaf litter
      if (center.litter) for (let i = 0; i < center.litter; i++) { const x = rng.nextInt(16), z = rng.nextInt(16); plant(x, z, B.LEAF_LITTER, 0); }
      // swamp/river: lily pads & cattails
      if (center.lily) for (let i = 0; i < center.lily; i++) {
        const x = rng.nextInt(16), z = rng.nextInt(16);
        let y = H - 2; while (y > 0 && blocks[IDX(x, y, z)] === 0) y--;
        if (blocks[IDX(x, y, z)] === B.WATER && blocks[IDX(x, y + 1, z)] === 0) set(x, y + 1, z, B.LILY_PAD);
      }
      if (center.cattails) for (let i = 0; i < center.cattails; i++) {
        const x = rng.nextInt(16), z = rng.nextInt(16);
        const y = top(x, z);
        const g = blocks[IDX(x, y, z)];
        if ((g === B.GRASS || g === B.DIRT || g === B.SAND || g === B.CLAY) && blocks[IDX(x, y + 1, z)] === 0) {
          let water = false;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (get(x + dx, y, z + dz) === B.WATER) water = true;
          if (water) set(x, y + 1, z, B.CATTAIL);
        }
      }
      // surface lava pools in ashen wastes
      if (center.lavaPools && rng.nextInt(3) === 0) {
        const cxl = 3 + rng.nextInt(10), czl = 3 + rng.nextInt(10), r = 1 + rng.nextInt(3);
        const y = top(cxl, czl);
        if (y > SEA) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dz * dz > r * r) continue;
          const x = cxl + dx, z = czl + dz;
          const yy = top(x, z);
          if (Math.abs(yy - y) > 2) continue;
          for (let k = yy; k > y - 2; k--) set(x, k, z, B.LAVA);
          set(x, y - 2, z, B.BASALT);
          for (let k = yy + 1; k < yy + 4; k++) if (blocks[IDX(x, k, z)] !== 0) set(x, k, z, 0);
        }
      }
      // salt flats: shallow brine pools
      if (center === BI.SALT_FLATS && rng.nextInt(4) === 0) {
        const cxl = 3 + rng.nextInt(10), czl = 3 + rng.nextInt(10), r = 2 + rng.nextInt(2);
        const y = top(cxl, czl);
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dz * dz > r * r) continue;
          const x = cxl + dx, z = czl + dz;
          if (top(x, z) === y && blocks[IDX(x, y, z)] === B.SALT) set(x, y, z, B.WATER);
        }
      }
      // glow caves: luminous growth deep underground
      for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
        for (let y = 12; y < 52; y++) {
          const i = IDX(x, y, z);
          if (blocks[i] !== 0) continue;
          const g = this.nGlow.noise3((x0 + x) / 40, y / 28, (z0 + z) / 40);
          if (g < 0.32) continue;
          const below = blocks[i - 256], above = blocks[i + 256];
          if ((below === B.STONE || below === B.SLATE || below === B.DIRT) ) {
            const r = rng.nextInt(100);
            if (r < 9) set(x, y, z, B.GLOWSHROOM);
            else if (r < 13) set(x, y, z, B.LUMITE_CRYSTAL);
            else if (r < 30 && below === B.STONE) set(x, y - 1, z, B.MOSSY_COBBLESTONE);
          } else if ((above === B.STONE || above === B.SLATE) && rng.nextInt(100) < 4) set(x, y, z, B.LUMITE_CRYSTAL);
        }
      }
      // rare lumite crystals in ordinary deep caves
      for (let k = 0; k < 3; k++) {
        const x = rng.nextInt(16), z = rng.nextInt(16), y = 5 + rng.nextInt(30);
        const i = IDX(x, y, z);
        if (blocks[i] === 0 && SOLID[blocks[i - 256]] && OPAQUE[blocks[i - 256]]) set(x, y, z, B.LUMITE_CRYSTAL);
      }
    }

    // ---- cross-chunk features ----
    placeFeature(W, f) {
      const rng = new Random(f.seed);
      switch (f.type) {
        case 'tree': this.tree(W, rng, f.kind, f.x, f.y, f.z); break;
        case 'boulder': {
          const r = 1 + rng.nextInt(2);
          for (let dx = -r; dx <= r; dx++) for (let dy = -1; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
            if (dx * dx + dy * dy * 1.3 + dz * dz > r * r + 0.8) continue;
            W.set(f.x + dx, f.y + dy, f.z + dz, rng.nextInt(3) ? B.MOSSY_COBBLESTONE : B.STONE, 0, 2);
          }
          break;
        }
        case 'log': {
          for (let k = 0; k < f.len; k++) {
            const x = f.x + (f.alongX ? k : 0), z = f.z + (f.alongX ? 0 : k);
            W.set(x, f.y, z, B.LOG, f.wood | ((f.alongX ? 1 : 2) << 3), 3);
            if (rng.nextInt(4) === 0) W.set(x, f.y + 1, z, B.MUSHROOM_BROWN, 0, 1);
          }
          break;
        }
        case 'crater': this.crater(W, rng, f); break;
        case 'circle': this.circle(W, rng, f); break;
      }
    }
    crater(W, rng, f) {
      const r = f.r, cx = f.x, cz = f.z, cy = f.y;
      for (let dx = -r - 2; dx <= r + 2; dx++) for (let dz = -r - 2; dz <= r + 2; dz++) {
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > r + 2) continue;
        const depth = d < r ? Math.round(Math.sqrt(r * r - d * d) * 0.6) : 0;
        const x = cx + dx, z = cz + dz;
        if (!W.inside(x, z)) continue;
        // carve bowl
        for (let y = cy - depth + 1; y <= cy + 8; y++) W.set(x, y, z, 0, 0, 0);
        if (d < r) {
          W.set(x, cy - depth, z, rng.nextInt(5) === 0 ? B.OBSIDIAN : B.SCORCHED_STONE, 0, 0);
          W.set(x, cy - depth - 1, z, B.SCORCHED_STONE, 0, 0);
          if (rng.nextInt(9) === 0) W.set(x, cy - depth + 1, z, B.FIRE, 0, 1);
        } else if (d <= r + 2 && rng.nextInt(3) === 0) {
          // ejecta rim
          W.set(x, cy + 1, z, B.SCORCHED_STONE, 0, 1);
        }
      }
      // meteorite core
      const coreY = cy - Math.round(r * 0.6) + 1;
      for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy <= 2; dy++) for (let dz = -1; dz <= 1; dz++) {
        if (Math.abs(dx) + Math.abs(dy - 1) + Math.abs(dz) > 2) continue;
        W.set(cx + dx, coreY + dy, cz + dz, rng.nextInt(3) ? B.STARMETAL_ORE : B.OBSIDIAN, 0, 0);
      }
    }
    circle(W, rng, f) {
      const n = 8 + rng.nextInt(4);
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2;
        const x = Math.round(f.x + Math.cos(a) * f.r), z = Math.round(f.z + Math.sin(a) * f.r);
        if (!W.inside(x, z)) continue;
        let y = W.top(x, z);
        const h = 2 + rng.nextInt(3);
        for (let dy = 0; dy <= h; dy++) W.set(x, y + dy, z, dy === h && rng.nextBool() ? B.SLAB : (rng.nextInt(3) ? B.STONE : B.MOSSY_COBBLESTONE), dy === h ? 6 : 0, 0);
      }
      if (W.inside(f.x, f.z)) {
        const y = W.top(f.x, f.z);
        W.set(f.x, y, f.z, B.RUNESTONE, 0, 0);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) W.set(f.x + dx, y, f.z + dz, B.STONE_BRICKS, 3, 0);
      }
    }

    tree(W, rng, kind, x, y, z) {
      const LOG = B.LOG, LEAF = B.LEAVES;
      const leafBlob = (cx, cy, cz, r, leafMeta, flat) => {
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
          const ry = flat ? dy * 1.8 : dy;
          if (dx * dx + ry * ry + dz * dz > r * r + 0.5) continue;
          if (rng.nextInt(10) === 0 && dx * dx + dz * dz >= r * r - 1) continue;
          W.set(cx + dx, cy + dy, cz + dz, LEAF, leafMeta, 1);
        }
      };
      const trunk = (h, wood) => { for (let k = 0; k < h; k++) W.set(x, y + k, z, LOG, wood, 3); W.setIf(x, y - 1, z, B.DIRT, 0, B.GRASS); };
      switch (kind) {
        case 'oak': case 'birch': case 'maple': case 'gold_maple': {
          const wood = kind === 'birch' ? 2 : (kind === 'oak' ? 0 : 4);
          const leaf = kind === 'birch' ? 2 : kind === 'oak' ? 0 : kind === 'maple' ? 4 : 6;
          const h = (kind === 'birch' ? 5 : 4) + rng.nextInt(3);
          trunk(h, wood);
          if (kind === 'maple' || kind === 'gold_maple') {
            leafBlob(x, y + h - 1, z, 2, leaf, false);
            leafBlob(x, y + h - 2, z, 3, leaf, true);
            W.set(x, y + h, z, LEAF, leaf, 1);
          } else {
            for (let yy = y + h - 3; yy <= y + h; yy++) {
              const rel = yy - (y + h);
              const r = 1 - Math.trunc(rel / 2);
              for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
                if (Math.abs(dx) === r && Math.abs(dz) === r && (rng.nextInt(2) === 0 || rel === 0)) continue;
                W.set(x + dx, yy, z + dz, LEAF, leaf, 1);
              }
            }
          }
          break;
        }
        case 'swamp_oak': {
          const h = 5 + rng.nextInt(3);
          trunk(h, 0);
          for (let yy = y + h - 3; yy <= y + h; yy++) {
            const rel = yy - (y + h);
            const r = 2 - Math.trunc(rel / 2);
            for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
              if (Math.abs(dx) === r && Math.abs(dz) === r && (rng.nextInt(2) === 0 || rel === 0)) continue;
              W.set(x + dx, yy, z + dz, LEAF, 0, 1);
              // hanging vines from the canopy edge
              if ((Math.abs(dx) === r || Math.abs(dz) === r) && rel === -3 && rng.nextInt(3) === 0) {
                let ox = 0, oz = 0;
                if (Math.abs(dx) === r) ox = Math.sign(dx); else oz = Math.sign(dz);
                const vm = ox > 0 ? 2 : ox < 0 ? 8 : oz > 0 ? 4 : 1;
                const len = 1 + rng.nextInt(4);
                for (let k = 0; k < len; k++) W.set(x + dx + ox, yy - k, z + dz + oz, B.VINE, vm, 1);
              }
            }
          }
          break;
        }
        case 'big_oak': {
          const h = 7 + rng.nextInt(5);
          trunk(h, 0);
          leafBlob(x, y + h, z, 2, 0, true);
          const branches = 2 + rng.nextInt(3);
          for (let b = 0; b < branches; b++) {
            const a = rng.nextFloat() * Math.PI * 2, by = y + Math.floor(h * 0.5) + rng.nextInt(Math.max(1, Math.floor(h * 0.4)));
            const len = 2 + rng.nextInt(3);
            let bx = x, bz = z, yy = by;
            for (let k = 1; k <= len; k++) {
              bx = Math.round(x + Math.cos(a) * k); bz = Math.round(z + Math.sin(a) * k); yy = by + Math.floor(k / 2);
              const ax = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? 1 : 2;
              W.set(bx, yy, bz, LOG, 0 | (ax << 3), 3);
            }
            leafBlob(bx, yy + 1, bz, 2, 0, true);
          }
          break;
        }
        case 'spruce': {
          const h = 6 + rng.nextInt(5);
          const bare = 1 + rng.nextInt(2);
          trunk(h - 1, 1);
          let r = 0, maxR = 2 + rng.nextInt(2), grow = 1;
          for (let yy = y + h; yy >= y + bare; yy--) {
            for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
              if (Math.abs(dx) === r && Math.abs(dz) === r && r > 0) continue;
              W.set(x + dx, yy, z + dz, LEAF, 1, 1);
            }
            if (r >= grow) { r = (yy % 2 === 0) ? 1 : 0; grow = Math.min(maxR, grow + 1); } else r++;
          }
          break;
        }
        case 'pine': {
          const h = 8 + rng.nextInt(5);
          trunk(h - 1, 1);
          for (let yy = y + h; yy >= y + h - 4; yy--) {
            const r = (yy === y + h) ? 0 : (yy % 2 === 0 ? 2 : 1);
            for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
              if (Math.abs(dx) === r && Math.abs(dz) === r && r > 0) continue;
              W.set(x + dx, yy, z + dz, LEAF, 1, 1);
            }
          }
          break;
        }
        case 'jungle_bush': {
          W.set(x, y, z, LOG, 3, 3);
          for (let dy = 0; dy <= 2; dy++) {
            const r = 2 - dy;
            for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
              if (Math.abs(dx) === r && Math.abs(dz) === r && rng.nextBool() && r > 0) continue;
              W.set(x + dx, y + dy, z + dz, LEAF, 0, 1);
            }
          }
          break;
        }
        case 'jungle': {
          const h = 6 + rng.nextInt(6);
          trunk(h, 3);
          for (let yy = y + h - 3; yy <= y + h; yy++) {
            const rel = yy - (y + h);
            const r = 2 - Math.trunc(rel / 2);
            for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
              if (Math.abs(dx) === r && Math.abs(dz) === r && rng.nextBool()) continue;
              W.set(x + dx, yy, z + dz, LEAF, 3, 1);
            }
          }
          for (let k = 0; k < h - 1; k++) for (const [dx, dz, vm] of [[1, 0, 2], [-1, 0, 8], [0, 1, 4], [0, -1, 1]]) if (rng.nextInt(3) === 0) W.set(x + dx, y + k, z + dz, B.VINE, vm, 1);
          break;
        }
        case 'mega_jungle': {
          const h = 14 + rng.nextInt(10);
          for (let k = 0; k < h; k++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) W.set(x + dx, y + k, z + dz, LOG, 3, 3);
          leafBlob(x, y + h, z, 3, 3, true); leafBlob(x + 1, y + h + 1, z + 1, 2, 3, true);
          for (let b = 0; b < 4; b++) {
            const by = y + Math.floor(h * 0.5) + rng.nextInt(Math.floor(h * 0.4));
            const a = rng.nextFloat() * Math.PI * 2;
            const bx = Math.round(x + Math.cos(a) * 3), bz = Math.round(z + Math.sin(a) * 3);
            W.set(Math.round(x + Math.cos(a) * 1.5), by, Math.round(z + Math.sin(a) * 1.5), LOG, 3, 3);
            leafBlob(bx, by + 1, bz, 2, 3, true);
          }
          for (let k = 0; k < h; k++) for (const [dx, dz, vm] of [[2, 0, 2], [-1, 0, 8], [0, 2, 4], [0, -1, 1], [2, 1, 2], [-1, 1, 8], [1, 2, 4], [1, -1, 1]]) if (rng.nextInt(3) === 0) W.set(x + dx, y + k, z + dz, B.VINE, vm, 1);
          break;
        }
        case 'redwood': {
          const h = 22 + rng.nextInt(12);
          for (let k = -1; k < h; k++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) W.set(x + dx, y + k, z + dz, LOG, 5, 3);
          const start = Math.floor(h * 0.45);
          for (let yy = y + h + 1; yy >= y + start; yy--) {
            const fromTop = y + h + 1 - yy;
            let r = Math.min(5, 1 + Math.floor(fromTop / 3.2));
            if ((yy - y) % 3 === 0) r = Math.max(1, r - 2);
            for (let dx = -r; dx <= r + 1; dx++) for (let dz = -r; dz <= r + 1; dz++) {
              const ddx = dx - 0.5, ddz = dz - 0.5;
              if (ddx * ddx + ddz * ddz > (r + 0.5) * (r + 0.5)) continue;
              if (rng.nextInt(7) === 0) continue;
              W.set(x + dx, yy, z + dz, LEAF, 5, 1);
            }
          }
          break;
        }
        case 'small_redwood': {
          const h = 10 + rng.nextInt(7);
          trunk(h, 5);
          for (let yy = y + h + 1; yy >= y + Math.floor(h * 0.4); yy--) {
            const fromTop = y + h + 1 - yy;
            const r = Math.min(3, Math.floor(fromTop / 3) + ((yy % 2) ? 0 : 1));
            for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
              if (Math.abs(dx) === r && Math.abs(dz) === r && r > 0) continue;
              W.set(x + dx, yy, z + dz, LEAF, 5, 1);
            }
          }
          break;
        }
        case 'dead': {
          const h = 3 + rng.nextInt(4);
          for (let k = 0; k < h; k++) W.set(x, y + k, z, LOG, 1, 3);
          const nb = rng.nextInt(3);
          for (let b = 0; b < nb; b++) {
            const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][rng.nextInt(4)];
            const by = y + 1 + rng.nextInt(h - 1);
            W.set(x + dx, by, z + dz, LOG, 1 | ((dx ? 1 : 2) << 3), 3);
            if (rng.nextBool()) W.set(x + dx * 2, by + 1, z + dz * 2, LOG, 1, 3);
          }
          break;
        }
        case 'huge_mushroom': {
          const red = rng.nextBool();
          const h = 4 + rng.nextInt(3);
          for (let k = 0; k < h; k++) W.set(x, y + k, z, red ? B.HUGE_MUSHROOM_RED : B.HUGE_MUSHROOM_BROWN, 1, 3);
          const cap = red ? B.HUGE_MUSHROOM_RED : B.HUGE_MUSHROOM_BROWN;
          if (red) {
            for (let dy = -3; dy <= 0; dy++) {
              const r = dy === 0 ? 1 : 2;
              for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
                const edge = Math.abs(dx) === r || Math.abs(dz) === r;
                if (dy < 0 && !edge) continue;
                if (dy < 0 && Math.abs(dx) === r && Math.abs(dz) === r) continue;
                W.set(x + dx, y + h + dy, z + dz, cap, 0, 1);
              }
            }
          } else {
            for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
              if (Math.abs(dx) === 3 && Math.abs(dz) === 3) continue;
              W.set(x + dx, y + h, z + dz, cap, 0, 1);
            }
          }
          break;
        }
      }
    }

    // underground springs (classic waterfalls & lavafalls in cave walls)
    springs(cx, cz, blocks, meta, out) {
      const rng = new Random(seedHash(this.seed, cx, cz, 0x5791));
      const tryAt = (id, x, y, z) => {
        const i = IDX(x, y, z);
        if (blocks[i] !== B.STONE || blocks[i + 256] !== B.STONE || blocks[i - 256] !== B.STONE) return;
        let air = 0, stone = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nx > 15 || nz < 0 || nz > 15) return;
          const n = blocks[IDX(nx, y, nz)];
          if (n === 0) air++; else if (n === B.STONE) stone++;
        }
        if (stone === 3 && air === 1) { blocks[i] = id; meta[i] = 0; out.ticks.push([cx * 16 + x, y, cz * 16 + z]); }
      };
      for (let k = 0; k < 20; k++) tryAt(B.WATER, rng.nextInt(16), 8 + rng.nextInt(rng.nextInt(110) + 1), rng.nextInt(16));
      for (let k = 0; k < 8; k++) tryAt(B.LAVA, rng.nextInt(16), 8 + rng.nextInt(rng.nextInt(rng.nextInt(100) + 8) + 1), rng.nextInt(16));
    }

    freeze(cx, cz, blocks, meta, biomes) {
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const b = biomes[z * 16 + x];
        let y = H - 2;
        while (y > 0 && blocks[IDX(x, y, z)] === 0) y--;
        if (this.tempAt(b, y) >= 0.15) continue;
        const i = IDX(x, y, z), id = blocks[i];
        if (id === B.WATER && meta[i] === 0) { blocks[i] = B.ICE; continue; }
        if ((OPAQUE[id] || id === B.LEAVES) && id !== B.ICE && id !== B.PACKED_ICE && y < H - 1 && blocks[i + 256] === 0) { blocks[i + 256] = B.SNOW_LAYER; meta[i + 256] = 0; }
        else if ((id === B.TALL_GRASS || id === B.FLOWER) && blocks[i - 256] === B.GRASS) { blocks[i] = B.SNOW_LAYER; meta[i] = 0; }
      }
    }

    spawnAnimals(out, t) {
      const rng = new Random(seedHash(this.seed, out.cx, out.cz, 0xA417));
      if (rng.nextInt(10) !== 0) return;
      const b = BIOMES[out.biomes[136]];
      if (!b.animals || !b.animals.length) return;
      const type = pickWeighted(rng, b.animals);
      const n = 2 + rng.nextInt(3);
      const cxl = 4 + rng.nextInt(8), czl = 4 + rng.nextInt(8);
      for (let k = 0; k < n; k++) {
        const x = clamp(cxl + rng.nextInt(7) - 3, 0, 15), z = clamp(czl + rng.nextInt(7) - 3, 0, 15);
        let y = H - 2;
        while (y > 0 && out.blocks[IDX(x, y, z)] === 0) y--;
        const g = out.blocks[IDX(x, y, z)];
        if (g !== B.GRASS && g !== B.SNOW_LAYER && g !== B.PODZOL && g !== B.MYCELIUM) continue;
        if (g === B.SNOW_LAYER) y--;
        const extra = {};
        if (type === 'sheep') { const r = rng.nextInt(100); extra.color = r < 81 ? 0 : r < 86 ? 7 : r < 91 ? 8 : r < 96 ? 15 : r < 99 ? 12 : 6; }
        out.entities.push({ type, x: out.cx * 16 + x + 0.5, y: y + 1, z: out.cz * 16 + z + 0.5, extra });
      }
    }

    findSpawn() {
      const good = new Set([BI.PLAINS.id, BI.FOREST.id, BI.BIRCH_FOREST.id, BI.TAIGA.id, BI.MEADOW.id, BI.AUTUMN.id, BI.REDWOOD.id, BI.MOORS.id]);
      let best = null;
      for (let r = 0; r < 4000; r += 24) {
        const steps = Math.max(1, Math.floor(r * 2 * Math.PI / 24));
        for (let s = 0; s < steps; s++) {
          const a = s / steps * Math.PI * 2;
          const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
          const b = this.biomeAt(x, z);
          if (good.has(b)) return { x, z };
          if (!best && BIOMES[b].depth > -0.4 && b !== BI.RIVER.id) best = { x, z };
        }
        if (best && r > 1500) return best;
      }
      return best || { x: 0, z: 0 };
    }
  }

  // Writer that clips feature writes to one chunk.
  // mode: 0 = force, 1 = replace air/plants/leaves only (leaves), 2 = replace air & plants (boulders), 3 = log (replace air, leaves, plants)
  class Writer {
    constructor(cx, cz, blocks, meta) { this.cx = cx; this.cz = cz; this.x0 = cx * 16; this.z0 = cz * 16; this.blocks = blocks; this.meta = meta; }
    inside(x, z) { return x >= this.x0 && x < this.x0 + 16 && z >= this.z0 && z < this.z0 + 16; }
    get(x, y, z) { if (!this.inside(x, z) || y < 0 || y >= H) return -1; return this.blocks[IDX(x - this.x0, y, z - this.z0)]; }
    isAirOrPlant(x, y, z) { const id = this.get(x, y, z); return id === 0 || (id > 0 && REPL[id] && id !== B.WATER); }
    top(x, z) { let y = H - 2; while (y > 0 && (this.get(x, y, z) === 0 || REPL[this.get(x, y, z)])) y--; return y + 1; }
    set(x, y, z, id, m, mode) {
      if (!this.inside(x, z) || y < 1 || y >= H) return;
      const i = IDX(x - this.x0, y, z - this.z0);
      const cur = this.blocks[i];
      if (mode === 1) { if (!(cur === 0 || (REPL[cur] && cur !== B.WATER && cur !== B.LAVA) || cur === B.LEAF_LITTER)) return; }
      else if (mode === 2) { if (!(cur === 0 || REPL[cur] || cur === B.TALL_GRASS || cur === B.FLOWER)) return; }
      else if (mode === 3) { if (!(cur === 0 || cur === B.LEAVES || REPL[cur] || cur === B.FLOWER || cur === B.SAPLING || cur === B.SNOW_LAYER || cur === B.MUSHROOM_BROWN || cur === B.MUSHROOM_RED || cur === B.BRAMBLE)) return; }
      this.blocks[i] = id; this.meta[i] = m || 0;
    }
    setIf(x, y, z, id, m, ifId) { if (this.get(x, y, z) === ifId) this.set(x, y, z, id, m, 0); }
  }

  return { BIOMES, BI, Generator, SEA, H };
}
