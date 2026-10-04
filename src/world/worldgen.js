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

  // ------------------------------------------------------------ villages
  const VILLAGE_STYLE = { plains: 'plains', meadow: 'plains', desert: 'desert', taiga: 'taiga' };
  // building templates: layers from y = -1 (foundation) up; rows run front (road side) to back, left to right seen from the road
  //  # foundation  P planks  L log  l log lying across  C wall stone  G glass pane  D/E door (lower/upper)  F fence  p wooden plate
  //  > < ^ v stairs climbing right/left/back/front   _ slab   - top slab   t torch on the wall behind it  B bookshelf  K crafting table
  //  O furnace  H chest  W water  f farmland  c crops  h thatch  Y hay  w wool  x lava  * } ladder on the wall behind / to the right
  //  j k torch on the wall to the left / right  R/Q bed foot/head (head towards the back)  . air
  const VB = {
    house: { w: 5, d: 5, folk: 1, layers: [
      '#####|#####|#####|#####|#####',
      'LPDPL|P...P|P...P|PF..P|LPPPL',
      'LGEGL|G...G|P...P|Pp.tP|LPGPL',
      'LPPPL|P...P|P...P|P...P|LPPPL',
      '>PPP<|>PPP<|>PPP<|>PPP<|>PPP<',
      '.>P<.|.>P<.|.>P<.|.>P<.|.>P<.',
      '.._..|.._..|.._..|.._..|.._..'] },
    hut: { w: 5, d: 5, folk: 1, layers: [
      '#####|#####|#####|#####|#####',
      'CCDCC|C...C|CR..C|CQ..C|CCCCC',
      'PPEPP|G...G|P...P|P..tP|PPGPP',
      'hhhhh|h...h|h...h|h...h|hhhhh',
      '.....|.hhh.|.hhh.|.hhh.|.....',
      '.....|.....|..h..|.....|.....'] },
    big_house: { w: 9, d: 7, folk: 2, layers: [
      '#########|#########|#########|#########|#########|#########|#########',
      'LPPPDPPPL|P.......P|P.......P|P.......P|PR.....RP|PQK...YQP|LPPPPPPPL',
      'LPGPEPGPL|P.......P|G.......G|P.......P|G.......G|P..t.t..P|LPGPPPGPL',
      'LPPPPPPPL|P.......P|P.......P|P.......P|P.......P|P.......P|LPPPPPPPL',
      '>PPPPPPP<|>PPPPPPP<|>PPPPPPP<|>PPPPPPP<|>PPPPPPP<|>PPPPPPP<|>PPPPPPP<',
      '.>PPPPP<.|.>.....<.|.>.....<.|.>.....<.|.>.....<.|.>.....<.|.>PPPPP<.',
      '..>PPP<..|..>...<..|..>...<..|..>...<..|..>...<..|..>...<..|..>PPP<..',
      '...>P<...|...>P<...|...>P<...|...>P<...|...>P<...|...>P<...|...>P<...',
      '...._....|...._....|...._....|...._....|...._....|...._....|...._....'] },
    smithy: { w: 7, d: 7, folk: 1, prof: 'smith', loot: 'smithy', stoneRoof: true, layers: [
      '#######|#######|#######|#xx####|#xx####|#######|#######',
      'L.....L|C....OC|CFF..OC|C..F..C|C..F..C|CFF.HKC|CCCCCCC',
      'L.....L|C.....C|C.....C|G.....G|C.....C|C.....C|CCCCCCC',
      'L.....L|C.....C|Cj...kC|C.....C|C.....C|C.....C|CCCCCCC',
      '_______|_______|_______|_______|_______|_______|_______'] },
    library: { w: 7, d: 9, folk: 1, prof: 'librarian', layers: [
      '#######|#######|#######|#######|#######|#######|#######|#######|#######',
      'LCCDCCL|CB...BC|CB...BC|C.....C|C.....C|C.....C|C..K..C|CBBBBBC|LCCCCCL',
      'LPGEGPL|PB...BP|PB...BP|G.....G|P.....P|G.....G|Pj...kP|PBBBBBP|LPGGGPL',
      'LPPPPPL|PB...BP|PB...BP|P.....P|P.....P|P.....P|P.....P|PBBBBBP|LPPPPPL',
      '>PPPPP<|>PPPPP<|>PPPPP<|>PPPPP<|>PPPPP<|>PPPPP<|>PPPPP<|>PPPPP<|>PPPPP<',
      '.>PPP<.|.>...<.|.>...<.|.>...<.|.>...<.|.>...<.|.>...<.|.>...<.|.>PPP<.',
      '..>P<..|..>P<..|..>P<..|..>P<..|..>P<..|..>P<..|..>P<..|..>P<..|..>P<..',
      '..._...|..._...|..._...|..._...|..._...|..._...|..._...|..._...|..._...'] },
    chapel: { w: 5, d: 9, folk: 1, prof: 'cleric', layers: [
      '#####|#####|#####|#####|#####|#####|#####|#####|#####',
      'CCDCC|C...C|C...C|C...C|C...C|C...C|C...C|C^^^C|CCCCC',
      'CCECC|G...G|C...C|G...G|C...C|G...G|C...C|C...C|CCCCC',
      'CCCCC|C...C|Cj.kC|C...C|C...C|C...C|C..}C|C...C|CCCCC',
      'CCCCC|CCCCC|CCCCC|CCCCC|CCCCC|CCCCC|C..}C|C...C|CCCCC',
      '.....|.....|.....|.....|.....|.....|C..}C|C...C|CCCCC',
      '.....|.....|.....|.....|.....|.....|C..}C|G...G|CCGCC',
      '.....|.....|.....|.....|.....|.....|C..}C|C...C|CCCCC',
      '.....|.....|.....|.....|.....|.....|CCC.C|CCCCC|CCCCC',
      '.....|.....|.....|.....|.....|.....|F...F|.....|F...F'] },
    farm: { w: 9, d: 7, ground: true, layers: [
      'LLLLLLLLL|LfffWfffL|LfffWfffL|LfffWfffL|LfffWfffL|LfffWfffL|LLLLLLLLL',
      '.........|.ccc.ccc.|.ccc.ccc.|.ccc.ccc.|.ccc.ccc.|.ccc.ccc.|.........'] },
    lamp: { w: 1, d: 1, ground: true, layers: ['.', 'F', 'F', 'F', 'w'] },
    well: { w: 6, d: 6, ground: true, stoneRoof: true, layers: [
      '######|######|##WW##|##WW##|######|######',
      '......|.CCCC.|.C..C.|.C..C.|.CCCC.|......',
      '......|.F..F.|......|......|.F..F.|......',
      '......|.F..F.|......|......|.F..F.|......',
      '......|.____.|.____.|.____.|.____.|......'] },
  };

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
      if (this.structuresOn) this.mineshafts(out);
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
      if (this.structuresOn) this.villages(out);
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

      const vmask = this.structuresOn && this.type !== 'flat' ? this.villageMask(cx, cz) : null;
      // ---- structures ----
      if (this.structuresOn && !vmask) {
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

      // villages keep their streets and plots clear of trees
      if (vmask) for (let i = 0; i < 256; i++) if (vmask[i]) occupied[i] = 1;
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

    // ---- abandoned mineshafts: laid out from a start chunk, built chunk by chunk ----
    mineshaftAt(sx, sz) {
      const key = (sx + 32768) * 65536 + (sz + 32768);
      if (!this.shaftCache) this.shaftCache = new Map();
      if (this.shaftCache.has(key)) return this.shaftCache.get(key);
      const r = new Random(seedHash(this.seed, sx, sz, 0x3195));
      let L = null;
      if (r.nextFloat() < 0.005 && r.nextInt(24) < Math.max(Math.abs(sx), Math.abs(sz))) L = this.mineshaftLayout(sx, sz);
      this.shaftCache.set(key, L);
      if (this.shaftCache.size > 4096) this.shaftCache.delete(this.shaftCache.keys().next().value);
      return L;
    }
    mineshaftLayout(sx, sz) {
      const rng = new Random(seedHash(this.seed, sx, sz, 0x3196));
      const ox = sx * 16 + 2, oz = sz * 16 + 2;
      const room = { t: 'room', b: [ox, 50, oz, ox + 7 + rng.nextInt(6), 54 + rng.nextInt(6), oz + 7 + rng.nextInt(6)], links: [], depth: 0, seed: rng.nextInt(0x7fffffff) };
      const pieces = [room], pending = [];
      const hits = (b) => pieces.some((p) => b[0] <= p.b[3] && b[3] >= p.b[0] && b[1] <= p.b[4] && b[4] >= p.b[1] && b[2] <= p.b[5] && b[5] >= p.b[2]);
      // f: 0 north (-z), 1 east (+x), 2 south (+z), 3 west (-x)
      const next = (x, y, z, f, depth) => {
        if (depth > 8 || Math.abs(x - ox) > 80 || Math.abs(z - oz) > 80) return null;
        const roll = rng.nextInt(100);
        let p = null;
        if (roll >= 80) {
          const b = [x, y, z, x, y + 2, z];
          if (rng.nextInt(4) === 0) b[4] += 4;
          if (f === 0) { b[0] = x - 1; b[3] = x + 3; b[2] = z - 4; }
          else if (f === 2) { b[0] = x - 1; b[3] = x + 3; b[5] = z + 4; }
          else if (f === 3) { b[0] = x - 4; b[2] = z - 1; b[5] = z + 3; }
          else { b[3] = x + 4; b[2] = z - 1; b[5] = z + 3; }
          if (!hits(b)) p = { t: 'cross', b, f, floors: b[4] - b[1] > 3 };
        } else if (roll >= 70) {
          const b = [x, y - 5, z, x, y + 2, z];
          if (f === 0) { b[3] = x + 2; b[2] = z - 8; } else if (f === 2) { b[3] = x + 2; b[5] = z + 8; }
          else if (f === 3) { b[0] = x - 8; b[5] = z + 2; } else { b[3] = x + 8; b[5] = z + 2; }
          if (!hits(b)) p = { t: 'stairs', b, f };
        } else {
          for (let i = rng.nextInt(3) + 2; i > 0; i--) {
            const j = i * 5, b = [x, y, z, x, y + 2, z];
            if (f === 0) { b[3] = x + 2; b[2] = z - (j - 1); } else if (f === 2) { b[3] = x + 2; b[5] = z + (j - 1); }
            else if (f === 3) { b[0] = x - (j - 1); b[5] = z + 2; } else { b[3] = x + (j - 1); b[5] = z + 2; }
            if (!hits(b)) { p = { t: 'corridor', b, f, sections: i }; break; }
          }
          if (p) { p.rails = rng.nextInt(3) === 0; p.spiders = !p.rails && rng.nextInt(23) === 0; }
        }
        if (!p) return null;
        p.depth = depth; p.seed = rng.nextInt(0x7fffffff);
        pieces.push(p); pending.push(p);
        return p;
      };
      // exits all round the room
      const rb = room.b, yr = Math.max(1, rb[4] - rb[1] - 4), xs = rb[3] - rb[0] + 1, zs = rb[5] - rb[2] + 1;
      for (let k = 0; k < xs; k += 4) { k += rng.nextInt(xs); if (k + 3 > xs) break; const p = next(rb[0] + k, rb[1] + rng.nextInt(yr) + 1, rb[2] - 1, 0, 1); if (p) room.links.push([p.b[0], p.b[1], rb[2], p.b[3], p.b[4], rb[2] + 1]); }
      for (let k = 0; k < xs; k += 4) { k += rng.nextInt(xs); if (k + 3 > xs) break; const p = next(rb[0] + k, rb[1] + rng.nextInt(yr) + 1, rb[5] + 1, 2, 1); if (p) room.links.push([p.b[0], p.b[1], rb[5] - 1, p.b[3], p.b[4], rb[5]]); }
      for (let k = 0; k < zs; k += 4) { k += rng.nextInt(zs); if (k + 3 > zs) break; const p = next(rb[0] - 1, rb[1] + rng.nextInt(yr) + 1, rb[2] + k, 3, 1); if (p) room.links.push([rb[0], p.b[1], p.b[2], rb[0] + 1, p.b[4], p.b[5]]); }
      for (let k = 0; k < zs; k += 4) { k += rng.nextInt(zs); if (k + 3 > zs) break; const p = next(rb[3] + 1, rb[1] + rng.nextInt(yr) + 1, rb[2] + k, 1, 1); if (p) room.links.push([rb[3] - 1, p.b[1], p.b[2], rb[3], p.b[4], p.b[5]]); }
      // grow the tunnels outward (in random order, like the classic generator)
      while (pending.length) {
        const p = pending.splice(rng.nextInt(pending.length), 1)[0], b = p.b, d = p.depth;
        if (p.t === 'corridor') {
          const j = rng.nextInt(4), yy = () => b[1] - 1 + rng.nextInt(3);
          if (p.f === 0) { if (j <= 1) next(b[0], yy(), b[2] - 1, 0, d + 1); else if (j === 2) next(b[0] - 1, yy(), b[2], 3, d + 1); else next(b[3] + 1, yy(), b[2], 1, d + 1); }
          else if (p.f === 2) { if (j <= 1) next(b[0], yy(), b[5] + 1, 2, d + 1); else if (j === 2) next(b[0] - 1, yy(), b[5] - 3, 3, d + 1); else next(b[3] + 1, yy(), b[5] - 3, 1, d + 1); }
          else if (p.f === 3) { if (j <= 1) next(b[0] - 1, yy(), b[2], 3, d + 1); else if (j === 2) next(b[0], yy(), b[2] - 1, 0, d + 1); else next(b[0], yy(), b[5] + 1, 2, d + 1); }
          else { if (j <= 1) next(b[3] + 1, yy(), b[2], 1, d + 1); else if (j === 2) next(b[3] - 3, yy(), b[2] - 1, 0, d + 1); else next(b[3] - 3, yy(), b[5] + 1, 2, d + 1); }
          if (d < 8) {
            if (p.f === 0 || p.f === 2) { for (let k = b[2] + 3; k + 3 <= b[5]; k += 5) { const l = rng.nextInt(5); if (l === 0) next(b[0] - 1, b[1], k, 3, d + 1); else if (l === 1) next(b[3] + 1, b[1], k, 1, d + 1); } }
            else { for (let k = b[0] + 3; k + 3 <= b[3]; k += 5) { const l = rng.nextInt(5); if (l === 0) next(k, b[1], b[2] - 1, 0, d + 1); else if (l === 1) next(k, b[1], b[5] + 1, 2, d + 1); } }
          }
        } else if (p.t === 'cross') {
          if (p.f === 0) { next(b[0] + 1, b[1], b[2] - 1, 0, d + 1); next(b[0] - 1, b[1], b[2] + 1, 3, d + 1); next(b[3] + 1, b[1], b[2] + 1, 1, d + 1); }
          else if (p.f === 2) { next(b[0] + 1, b[1], b[5] + 1, 2, d + 1); next(b[0] - 1, b[1], b[2] + 1, 3, d + 1); next(b[3] + 1, b[1], b[2] + 1, 1, d + 1); }
          else if (p.f === 3) { next(b[0] + 1, b[1], b[2] - 1, 0, d + 1); next(b[0] + 1, b[1], b[5] + 1, 2, d + 1); next(b[0] - 1, b[1], b[2] + 1, 3, d + 1); }
          else { next(b[0] + 1, b[1], b[2] - 1, 0, d + 1); next(b[0] + 1, b[1], b[5] + 1, 2, d + 1); next(b[3] + 1, b[1], b[2] + 1, 1, d + 1); }
          if (p.floors) {
            if (rng.nextBool()) next(b[0] + 1, b[1] + 4, b[2] - 1, 0, d + 1);
            if (rng.nextBool()) next(b[0] - 1, b[1] + 4, b[2] + 1, 3, d + 1);
            if (rng.nextBool()) next(b[3] + 1, b[1] + 4, b[2] + 1, 1, d + 1);
            if (rng.nextBool()) next(b[0] + 1, b[1] + 4, b[5] + 1, 2, d + 1);
          }
        } else if (p.t === 'stairs') {
          if (p.f === 0) next(b[0], b[1], b[2] - 1, 0, d + 1); else if (p.f === 2) next(b[0], b[1], b[5] + 1, 2, d + 1);
          else if (p.f === 3) next(b[0] - 1, b[1], b[2], 3, d + 1); else next(b[3] + 1, b[1], b[2], 1, d + 1);
        }
      }
      // sink the whole thing below sea level
      let ylo = 999, yhi = -999, xlo = 1e9, xhi = -1e9, zlo = 1e9, zhi = -1e9;
      for (const p of pieces) { ylo = Math.min(ylo, p.b[1]); yhi = Math.max(yhi, p.b[4]); xlo = Math.min(xlo, p.b[0]); xhi = Math.max(xhi, p.b[3]); zlo = Math.min(zlo, p.b[2]); zhi = Math.max(zhi, p.b[5]); }
      const top = SEA - 10;
      let j = yhi - ylo + 2;
      if (j < top) j += rng.nextInt(top - j);
      let k = j - yhi;
      if (ylo + k < 4) k = 4 - ylo;
      for (const p of pieces) { p.b[1] += k; p.b[4] += k; }
      for (const l of room.links) { l[1] += k; l[4] += k; }
      return { pieces, box: [xlo - 1, ylo + k - 1, zlo - 1, xhi + 1, yhi + k + 1, zhi + 1] };
    }
    mineshafts(out) {
      const cx = out.cx, cz = out.cz, x0 = cx * 16, z0 = cz * 16;
      for (let sx = cx - 6; sx <= cx + 6; sx++) for (let sz = cz - 6; sz <= cz + 6; sz++) {
        const L = this.mineshaftAt(sx, sz);
        if (!L || L.box[3] < x0 || L.box[0] > x0 + 15 || L.box[5] < z0 || L.box[2] > z0 + 15) continue;
        for (const p of L.pieces) {
          const b = p.b;
          if (b[3] + 1 < x0 || b[0] - 1 > x0 + 15 || b[5] + 1 < z0 || b[2] - 1 > z0 + 15) continue;
          this.shaftPiece(out, p);
        }
      }
    }
    shaftPiece(out, p) {
      const { blocks, meta } = out, x0 = out.cx * 16, z0 = out.cz * 16, b = p.b;
      const inC = (x, z) => x >= x0 && x < x0 + 16 && z >= z0 && z < z0 + 16;
      const get = (x, y, z) => (!inC(x, z) || y < 0 || y >= H) ? -1 : blocks[IDX(x - x0, y, z - z0)];
      const set = (x, y, z, id, m) => { if (!inC(x, z) || y < 1 || y >= H) return; const i = IDX(x - x0, y, z - z0); blocks[i] = id; meta[i] = m || 0; };
      // like the classic pieces: nothing is built where it would break into water or lava
      for (let x = Math.max(b[0] - 1, x0); x <= Math.min(b[3] + 1, x0 + 15); x++) for (let z = Math.max(b[2] - 1, z0); z <= Math.min(b[5] + 1, z0 + 15); z++) {
        for (let y = b[1] - 1; y <= b[4] + 1; y++) { const id = get(x, y, z); if (id === B.WATER || id === B.LAVA) return; }
      }
      const fill = (xa, ya, za, xb, yb, zb, id, m) => { for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) for (let z = za; z <= zb; z++) set(x, y, z, id, m); };
      const rng = new Random(p.seed);
      const P = B.PLANKS, F = B.FENCE, AIR = 0;
      if (p.t === 'room') {
        fill(b[0], b[1], b[2], b[3], b[1], b[5], B.DIRT);
        fill(b[0], b[1] + 1, b[2], b[3], Math.min(b[1] + 3, b[4]), b[5], AIR);
        for (const l of p.links) fill(l[0], l[4] - 2, l[2], l[3], l[4], l[5], AIR);
        // a domed roof
        const ya = b[1] + 4, fx = b[3] - b[0] + 1, fy = b[4] - ya + 1, fz = b[5] - b[2] + 1, mx = b[0] + fx / 2, mz = b[2] + fz / 2;
        for (let y = ya; y <= b[4]; y++) {
          const ey = (y - ya) / fy;
          for (let x = b[0]; x <= b[3]; x++) { const ex = (x - mx) / (fx * 0.5); for (let z = b[2]; z <= b[5]; z++) { const ez = (z - mz) / (fz * 0.5); if (ex * ex + ey * ey + ez * ez <= 1.05) set(x, y, z, AIR); } }
        }
        return;
      }
      if (p.t === 'cross') {
        if (p.floors) {
          fill(b[0] + 1, b[1], b[2], b[3] - 1, b[1] + 2, b[5], AIR);
          fill(b[0], b[1], b[2] + 1, b[3], b[1] + 2, b[5] - 1, AIR);
          fill(b[0] + 1, b[4] - 2, b[2], b[3] - 1, b[4], b[5], AIR);
          fill(b[0], b[4] - 2, b[2] + 1, b[3], b[4], b[5] - 1, AIR);
          fill(b[0] + 1, b[1] + 3, b[2] + 1, b[3] - 1, b[1] + 3, b[5] - 1, P);
        } else {
          fill(b[0] + 1, b[1], b[2], b[3] - 1, b[4], b[5], AIR);
          fill(b[0], b[1], b[2] + 1, b[3], b[4], b[5] - 1, AIR);
        }
        fill(b[0] + 1, b[1], b[2] + 1, b[0] + 1, b[4], b[2] + 1, P);
        fill(b[0] + 1, b[1], b[5] - 1, b[0] + 1, b[4], b[5] - 1, P);
        fill(b[3] - 1, b[1], b[2] + 1, b[3] - 1, b[4], b[2] + 1, P);
        fill(b[3] - 1, b[1], b[5] - 1, b[3] - 1, b[4], b[5] - 1, P);
        for (let x = b[0]; x <= b[3]; x++) for (let z = b[2]; z <= b[5]; z++) if (get(x, b[1] - 1, z) === 0) set(x, b[1] - 1, z, P);
        return;
      }
      // corridors and stairs use coordinates along the tunnel: rx across, rz along from the entrance
      const f = p.f;
      const wx = (rx, rz) => (f === 0 || f === 2) ? b[0] + rx : f === 3 ? b[3] - rz : b[0] + rz;
      const wz = (rx, rz) => f === 0 ? b[5] - rz : f === 2 ? b[2] + rz : b[2] + rx;
      const S = (rx, ry, rz, id, m) => set(wx(rx, rz), b[1] + ry, wz(rx, rz), id, m);
      const G = (rx, ry, rz) => get(wx(rx, rz), b[1] + ry, wz(rx, rz));
      if (p.t === 'stairs') {
        for (let rx = 0; rx <= 2; rx++) {
          for (let ry = 5; ry <= 7; ry++) for (let rz = 0; rz <= 1; rz++) S(rx, ry, rz, AIR);
          for (let ry = 0; ry <= 2; ry++) for (let rz = 7; rz <= 8; rz++) S(rx, ry, rz, AIR);
          for (let i = 0; i < 5; i++) for (let ry = 5 - i - (i < 4 ? 1 : 0); ry <= 7 - i; ry++) S(rx, ry, 2 + i, AIR);
        }
        return;
      }
      const L = p.sections * 5 - 1;
      for (let rz = 0; rz <= L; rz++) for (let rx = 0; rx <= 2; rx++) { S(rx, 0, rz, AIR); S(rx, 1, rz, AIR); }
      for (let rz = 0; rz <= L; rz++) for (let rx = 0; rx <= 2; rx++) if (rng.nextFloat() <= 0.8) S(rx, 2, rz, AIR);
      if (p.spiders) for (let ry = 0; ry <= 1; ry++) for (let rx = 0; rx <= 2; rx++) for (let rz = 0; rz <= L; rz++) if (rng.nextFloat() <= 0.6) S(rx, ry, rz, B.COBWEB);
      // torches hang off the middle of a beam (meta: which side the support is on)
      const towardBeam = [3, 2, 4, 1][f], backToBeam = [4, 1, 3, 2][f];
      let spawner = false;
      for (let s = 0; s < p.sections; s++) {
        const k = 2 + s * 5;
        S(0, 0, k, F); S(0, 1, k, F); S(2, 0, k, F); S(2, 1, k, F);
        if (rng.nextInt(4) === 0) { S(0, 2, k, P); S(2, 2, k, P); } else { S(0, 2, k, P); S(1, 2, k, P); S(2, 2, k, P); }
        for (const [rx, rz, c] of [[0, k - 1, 0.1], [2, k - 1, 0.1], [0, k + 1, 0.1], [2, k + 1, 0.1], [0, k - 2, 0.05], [2, k - 2, 0.05], [0, k + 2, 0.05], [2, k + 2, 0.05]]) if (rng.nextFloat() < c) S(rx, 2, rz, B.COBWEB);
        if (rng.nextFloat() < 0.05 && G(1, 2, k) === P) S(1, 2, k - 1, B.TORCH, towardBeam);
        if (rng.nextFloat() < 0.05 && G(1, 2, k) === P) S(1, 2, k + 1, B.TORCH, backToBeam);
        // chest minecarts on a scrap of rail
        for (const [rx, rz] of [[2, k - 1], [0, k + 1]]) {
          if (rng.nextInt(100) !== 0) continue;
          const lr = new Random(seedHash(this.seed, wx(rx, rz), b[1], wz(rx, rz) + 0x5EED));
          const x = wx(rx, rz), z = wz(rx, rz), y = b[1];
          if (!inC(x, z) || get(x, y, z) !== 0 || !OPAQUE[get(x, y - 1, z)]) continue;
          set(x, y, z, B.RAIL, (f === 0 || f === 2) ? 0 : 1);
          out.entities.push({ type: 'minecart', x: x + 0.5, y: y + 0.0625, z: z + 0.5, kind: 1, items: this.loot(lr, 'mineshaft') });
        }
        if (p.spiders && !spawner) {
          const rz = k - 1 + rng.nextInt(3), x = wx(1, rz), z = wz(1, rz);
          if (inC(x, z)) { spawner = true; set(x, b[1], z, B.MOB_SPAWNER); out.tiles.push({ type: 'spawner', x, y: b[1], z, mob: 'spider' }); }
        }
      }
      // bridges over gaps and the odd stretch of track
      for (let rx = 0; rx <= 2; rx++) for (let rz = 0; rz <= L; rz++) if (G(rx, -1, rz) === 0) S(rx, -1, rz, P);
      if (p.rails) for (let rz = 0; rz <= L; rz++) { const below = G(1, -1, rz); if (rng.nextFloat() < 0.7 && below > 0 && OPAQUE[below] && G(1, 0, rz) === 0) S(1, 0, rz, B.RAIL, (f === 0 || f === 2) ? 0 : 1); }
    }

    // ---- villages: a well, roads of gravel and houses that sit on the land ----
    villageAt(rx, rz) {
      const key = (rx + 32768) * 65536 + (rz + 32768);
      if (!this.villageCache) this.villageCache = new Map();
      if (this.villageCache.has(key)) return this.villageCache.get(key);
      let V = null;
      const r = new Random(seedHash(this.seed, rx, rz, 0x7A11E5));
      const cx = rx * 20 + 2 + r.nextInt(14), cz = rz * 20 + 2 + r.nextInt(14);
      const t = this.terrain(cx, cz);
      const b = BIOMES[t.biomes[136]];
      const style = b && VILLAGE_STYLE[b.key];
      const vseed = r.nextInt(0x7fffffff);
      if (style && r.nextInt(100) < 55 && t.height[136] > SEA && t.blocks[IDX(8, t.height[136] + 1, 8)] !== B.WATER) V = this.villageLayout(cx, cz, style, vseed);
      this.villageCache.set(key, V);
      if (this.villageCache.size > 256) this.villageCache.delete(this.villageCache.keys().next().value);
      return V;
    }
    // cells of a chunk taken by a village's roads and buildings (with some elbow room)
    villageMask(cx, cz) {
      const x0 = cx * 16, z0 = cz * 16;
      let mask = null;
      for (let rx = Math.floor((cx - 6) / 20); rx <= Math.floor((cx + 6) / 20); rx++) for (let rz = Math.floor((cz - 6) / 20); rz <= Math.floor((cz + 6) / 20); rz++) {
        const V = this.villageAt(rx, rz);
        if (!V || V.box[2] + 4 < x0 || V.box[0] - 4 > x0 + 15 || V.box[3] + 4 < z0 || V.box[1] - 4 > z0 + 15) continue;
        const mark = (r, m) => {
          for (let x = Math.max(r[0] - m, x0); x <= Math.min(r[2] + m, x0 + 15); x++) for (let z = Math.max(r[1] - m, z0); z <= Math.min(r[3] + m, z0 + 15); z++) {
            if (!mask) mask = new Uint8Array(256);
            mask[((z - z0) << 4) | (x - x0)] = 1;
          }
        };
        for (const r of V.roads) mark(r.rect, 1);
        for (const p of V.pieces) mark(p.rect, 3);
      }
      return mask;
    }
    groundAt(x, z) { const t = this.terrain(x >> 4, z >> 4); return t.height[((z & 15) << 4) | (x & 15)]; }
    villageLayout(cx, cz, style, seed) {
      const rng = new Random(seed);
      const x0 = cx * 16 + 8, z0 = cz * 16 + 8;
      const pieces = [], roads = [];
      // buildings keep a block apart; anything may run right up to a road
      const clash = (r, m) => pieces.some((p) => r[0] - m <= p.rect[2] && r[2] + m >= p.rect[0] && r[1] - m <= p.rect[3] && r[3] + m >= p.rect[1])
        || roads.some((q) => r[0] <= q.rect[2] && r[2] >= q.rect[0] && r[1] <= q.rect[3] && r[3] >= q.rect[1]);
      pieces.push({ t: 'well', rect: [x0 - 3, z0 - 3, x0 + 2, z0 + 2], f: 2, seed: rng.nextInt(0x7fffffff) });
      const counts = {};
      const KINDS = [['house', 6, 6], ['hut', 4, 5], ['big_house', 2, 2], ['smithy', 2, 1], ['library', 2, 1], ['chapel', 2, 1], ['farm', 5, 4]];
      const DIR = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const pickKind = () => {
        const opts = KINDS.filter((k) => (counts[k[0]] || 0) < k[2]);
        if (!opts.length) return null;
        let tot = 0; for (const k of opts) tot += k[1];
        let v = rng.nextInt(tot);
        for (const k of opts) { v -= k[1]; if (v < 0) return k[0]; }
        return opts[0][0];
      };
      const queue = [];
      for (let d = 0; d < 4; d++) {
        const [dx, dz] = DIR[d];
        queue.push({ x: x0 + dx * 4 - (dx === 1 ? 1 : 0), z: z0 + dz * 4 - (dz === 1 ? 1 : 0), d, depth: 0 });
      }
      while (queue.length) {
        const q = queue.shift();
        const [fx, fz] = DIR[q.d], lx = fz, lz = -fx;   // left of travel
        let len = q.depth === 0 ? 14 + rng.nextInt(16) : 8 + rng.nextInt(14);
        // shorten until the road is clear and stays near the middle
        const rect = (n) => { const ex = q.x + fx * (n - 1), ez = q.z + fz * (n - 1); return [Math.min(q.x, ex) - Math.abs(lx), Math.min(q.z, ez) - Math.abs(lz), Math.max(q.x, ex) + Math.abs(lx), Math.max(q.z, ez) + Math.abs(lz)]; };
        while (len >= 5 && (clash(rect(len), 0) || Math.abs(q.x + fx * len - x0) > 72 || Math.abs(q.z + fz * len - z0) > 72)) len--;
        if (len < 5) continue;
        roads.push({ rect: rect(len), x: q.x, z: q.z, d: q.d, len });
        // buildings down both sides, their fronts on the road
        for (const side of [1, -1]) {
          let s = 1 + rng.nextInt(3);
          while (s < len - 2) {
            const kind = rng.nextInt(9) === 0 ? 'lamp' : pickKind();
            if (!kind) break;
            const T = VB[kind], W = T.w, D = T.d;
            const sx = lx * side, sz = lz * side;
            // building corner nearest the road start, then its extent along the road and away from it
            const ax = q.x + fx * s + sx * 2, az = q.z + fz * s + sz * 2;
            const bx = ax + fx * (W - 1) + sx * (D - 1), bz = az + fz * (W - 1) + sz * (D - 1);
            const r = [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
            const far = Math.max(Math.abs(r[0] - x0), Math.abs(r[2] - x0), Math.abs(r[1] - z0), Math.abs(r[3] - z0)) > 80;
            if (s + W <= len + 1 && !far && !clash(r, 1)) {
              // which way the front faces (towards the road)
              const face = sx === 0 ? (sz > 0 ? 0 : 2) : (sx > 0 ? 3 : 1);
              pieces.push({ t: kind, rect: r, f: face, seed: rng.nextInt(0x7fffffff) });
              if (kind !== 'lamp') counts[kind] = (counts[kind] || 0) + 1;
              s += W + 1 + rng.nextInt(2);
            } else s += 2;
          }
        }
        // branch off at the end of the road, and now and then from its side
        if (q.depth < 2) {
          // a square where the road ends, with new roads leading off it
          const jx = q.x + fx * (len + 1), jz = q.z + fz * (len + 1), J = [jx - 1, jz - 1, jx + 1, jz + 1];
          if (!clash(J, 0)) {
            roads.push({ rect: J });
            if (rng.nextInt(4) !== 0) queue.push({ x: jx + lx * 2, z: jz + lz * 2, d: (q.d + 3) & 3, depth: q.depth + 1 });
            if (rng.nextInt(4) !== 0) queue.push({ x: jx - lx * 2, z: jz - lz * 2, d: (q.d + 1) & 3, depth: q.depth + 1 });
            if (rng.nextInt(3) === 0) queue.push({ x: jx + fx * 2, z: jz + fz * 2, d: q.d, depth: q.depth + 1 });
          }
        }
      }
      let xa = 1e9, xb = -1e9, za = 1e9, zb = -1e9;
      for (const p of pieces.concat(roads)) { xa = Math.min(xa, p.rect[0]); xb = Math.max(xb, p.rect[2]); za = Math.min(za, p.rect[1]); zb = Math.max(zb, p.rect[3]); }
      return { x: x0, z: z0, style, pieces, roads, box: [xa - 1, za - 1, xb + 1, zb + 1] };
    }
    villages(out) {
      const cx = out.cx, cz = out.cz, x0 = cx * 16, z0 = cz * 16;
      const rx0 = Math.floor((cx - 6) / 20), rx1 = Math.floor((cx + 6) / 20), rz0 = Math.floor((cz - 6) / 20), rz1 = Math.floor((cz + 6) / 20);
      for (let rx = rx0; rx <= rx1; rx++) for (let rz = rz0; rz <= rz1; rz++) {
        const V = this.villageAt(rx, rz);
        if (!V || V.box[2] < x0 || V.box[0] > x0 + 15 || V.box[3] < z0 || V.box[1] > z0 + 15) continue;
        for (const r of V.roads) if (!(r.rect[2] < x0 || r.rect[0] > x0 + 15 || r.rect[3] < z0 || r.rect[1] > z0 + 15)) this.villageRoad(out, V, r);
        for (const p of V.pieces) if (!(p.rect[2] + 1 < x0 || p.rect[0] - 1 > x0 + 15 || p.rect[3] + 1 < z0 || p.rect[1] - 1 > z0 + 15)) this.villagePiece(out, V, p);
      }
    }
    villagePalette(style) {
      if (style === 'desert') return { P: [B.SANDSTONE, 2], L: [B.SANDSTONE, 1], C: [B.SANDSTONE, 0], '#': [B.SANDSTONE, 0], stairs: 10, slab: 10, roofSlab: 10, path: [B.SANDSTONE, 0], wood: 0 };
      if (style === 'taiga') return { P: [B.PLANKS, 1], L: [B.LOG, 1], C: [B.COBBLESTONE, 0], '#': [B.COBBLESTONE, 0], stairs: 1, slab: 7, roofSlab: 1, path: [B.GRAVEL, 0], wood: 1 };
      return { P: [B.PLANKS, 0], L: [B.LOG, 0], C: [B.COBBLESTONE, 0], '#': [B.COBBLESTONE, 0], stairs: 0, slab: 7, roofSlab: 0, path: [B.GRAVEL, 0], wood: 0 };
    }
    villageRoad(out, V, r) {
      const { blocks, meta } = out, x0 = out.cx * 16, z0 = out.cz * 16;
      const pal = this.villagePalette(V.style);
      for (let x = Math.max(r.rect[0], x0); x <= Math.min(r.rect[2], x0 + 15); x++) for (let z = Math.max(r.rect[1], z0); z <= Math.min(r.rect[3], z0 + 15); z++) {
        const lx = x - x0, lz = z - z0;
        let y = H - 2;
        // look past plants, snow and leaves to the ground (or water) beneath
        while (y > 1) { const id = blocks[IDX(lx, y, lz)]; if (id !== 0 && (OPAQUE[id] || id === B.WATER) && id !== B.LEAVES && id !== B.LOG) break; y--; }
        const id = blocks[IDX(lx, y, lz)];
        if (id === B.WATER) { blocks[IDX(lx, y, lz)] = B.PLANKS; meta[IDX(lx, y, lz)] = pal.wood; }
        else if (id === B.GRASS || id === B.DIRT || id === B.SAND || id === B.PODZOL || id === B.SNOW || id === B.GRAVEL || id === B.STONE || id === B.SANDSTONE) { blocks[IDX(lx, y, lz)] = pal.path[0]; meta[IDX(lx, y, lz)] = pal.path[1]; }
        for (let k = 1; k <= 3; k++) { const a = blocks[IDX(lx, y + k, lz)]; if (a !== 0 && !OPAQUE[a] && a !== B.WATER && (REPL[a] || a === B.FLOWER || a === B.TALL_GRASS || a === B.SNOW_LAYER || a === B.LEAF_LITTER || a === B.LEAVES)) blocks[IDX(lx, y + k, lz)] = 0; }
      }
    }
    villagePiece(out, V, p) {
      const { blocks, meta } = out, x0 = out.cx * 16, z0 = out.cz * 16;
      const inC = (x, z) => x >= x0 && x < x0 + 16 && z >= z0 && z < z0 + 16;
      const get = (x, y, z) => (!inC(x, z) || y < 0 || y >= H) ? -1 : blocks[IDX(x - x0, y, z - z0)];
      const set = (x, y, z, id, m) => { if (!inC(x, z) || y < 1 || y >= H) return; const i = IDX(x - x0, y, z - z0); blocks[i] = id; meta[i] = m || 0; };
      const T = VB[p.t], pal = this.villagePalette(V.style);
      const [ra, rb, rc, rd] = p.rect, f = p.f;
      // the floor sits on the average ground under the footprint (from the base terrain, so every chunk agrees)
      if (p.y === undefined) {
        let sum = 0, n = 0;
        for (let x = ra; x <= rc; x++) for (let z = rb; z <= rd; z++) { sum += this.groundAt(x, z); n++; }
        p.y = Math.round(sum / n) + (T.ground ? 0 : 1);
      }
      const y0 = p.y;
      // local (x across the front, z from front to back) -> world
      const wx = (lx, lz) => f === 2 ? ra + lx : f === 0 ? rc - lx : f === 1 ? rc - lz : ra + lz;
      const wz = (lx, lz) => f === 2 ? rd - lz : f === 0 ? rb + lz : f === 1 ? rd - lx : rb + lx;
      // local directions -> world face index (0 N, 1 S, 2 W, 3 E): front, back, left, right
      const FRONT = [0, 3, 1, 2][f], BACK = [1, 2, 0, 3][f], LEFT = [3, 1, 2, 0][f], RIGHT = [2, 0, 3, 1][f];
      const HF = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      const torchMeta = (face) => [3, 4, 1, 2][face];          // support lies towards face
      const ladderMeta = (face) => [1, 0, 3, 2][face];
      const stairs = (face, mat) => (mat << 3) | face;
      const acrossAxis = (f === 0 || f === 2) ? 1 : 2;           // logs lying across the front
      const rng = new Random(p.seed);
      const W = T.w, D = T.d, NL = T.layers.length;
      // clear the space above and prop the lowest layer up on stone down to the ground
      const base = T.ground ? y0 : y0 - 1;
      for (let lx = 0; lx < W; lx++) for (let lz = 0; lz < D; lz++) {
        const x = wx(lx, lz), z = wz(lx, lz);
        if (!inC(x, z)) continue;
        for (let y = base + 1; y < base + NL + 2; y++) set(x, y, z, 0);
        let y = base - 1;
        while (y > 1) { const id = get(x, y, z); if (id > 0 && OPAQUE[id] && id !== B.LEAVES && id !== B.LOG) break; set(x, y, z, pal['#'][0], pal['#'][1]); y--; }
      }
      const spawns = [];
      for (let li = 0; li < NL; li++) {
        const rows = T.layers[li].split('|');
        const y = y0 + li - (T.ground ? 0 : 1);
        for (let lz = 0; lz < D; lz++) {
          const row = rows[lz] || '';
          for (let lx = 0; lx < W; lx++) {
            const ch = row[lx] || '.';
            const x = wx(lx, lz), z = wz(lx, lz);
            if (!inC(x, z)) continue;
            switch (ch) {
              case '.': set(x, y, z, 0); break;
              case '#': case 'P': case 'L': case 'C': set(x, y, z, pal[ch][0], pal[ch][1]); break;
              case 'l': set(x, y, z, pal.L[0], pal.L[0] === B.LOG ? (pal.L[1] | (acrossAxis << 3)) : pal.L[1]); break;
              case 'G': set(x, y, z, B.GLASS_PANE); break;
              case 'D': set(x, y, z, B.DOOR_WOOD, FRONT); break;
              case 'E': set(x, y, z, B.DOOR_WOOD, FRONT | 8); break;
              case 'F': set(x, y, z, B.FENCE); break;
              case 'p': set(x, y, z, B.WOOD_PLATE); break;
              case '>': set(x, y, z, B.STAIRS, stairs(RIGHT, pal.stairs)); break;
              case '<': set(x, y, z, B.STAIRS, stairs(LEFT, pal.stairs)); break;
              case '^': set(x, y, z, B.STAIRS, stairs(BACK, pal.stairs)); break;
              case 'v': set(x, y, z, B.STAIRS, stairs(FRONT, pal.stairs)); break;
              case '_': set(x, y, z, B.SLAB, (T.stoneRoof ? pal.slab : pal.roofSlab)); break;
              case '-': set(x, y, z, B.SLAB, pal.slab | 32); break;
              case 't': set(x, y, z, B.TORCH, torchMeta(BACK)); break;
              case 'j': set(x, y, z, B.TORCH, torchMeta(LEFT)); break;
              case 'k': set(x, y, z, B.TORCH, torchMeta(RIGHT)); break;
              case '*': set(x, y, z, B.LADDER, ladderMeta(BACK)); break;
              case '}': set(x, y, z, B.LADDER, ladderMeta(RIGHT)); break;
              case 'B': set(x, y, z, B.BOOKSHELF); break;
              case 'K': set(x, y, z, B.CRAFTING_TABLE); break;
              case 'O': set(x, y, z, B.FURNACE, FRONT); break;
              case 'H': set(x, y, z, B.CHEST, FRONT); out.tiles.push({ type: 'chest', x, y, z, items: this.loot(rng, T.loot || 'smithy') }); break;
              case 'W': set(x, y, z, B.WATER); if (T.ground) { set(x, y - 1, z, B.WATER); set(x, y - 2, z, B.WATER); set(x, y - 3, z, pal['#'][0], pal['#'][1]); } break;
              case 'f': set(x, y, z, B.FARMLAND, 7); break;
              case 'c': { const k = rng.nextInt(4); set(x, y, z, k < 2 ? B.WHEAT : k === 2 ? B.CARROTS : B.POTATOES, 2 + rng.nextInt(6)); break; }
              case 'h': set(x, y, z, B.THATCH); break;
              case 'Y': set(x, y, z, B.HAY_BALE); break;
              case 'w': set(x, y, z, B.WOOL, 15); break;
              case 'x': set(x, y, z, B.LAVA); break;
              case 'R': set(x, y, z, B.BED, BACK); break;
              case 'Q': set(x, y, z, B.BED, BACK | 4); break;
            }
          }
        }
      }
      // a lamp post: four torches round the wool
      if (p.t === 'lamp') {
        const x = wx(0, 0), z = wz(0, 0), y = y0 + 4;
        for (let k = 0; k < 4; k++) { const d = HF[k]; set(x + d[0], y, z + d[1], B.TORCH, torchMeta(k ^ 1)); }
      }
      // villagers live in the houses (spawned once, by the chunk holding the doorway)
      if (T.folk) {
        const dx = wx(W >> 1, 1), dz = wz(W >> 1, 1);
        if (inC(dx, dz)) {
          const PROF = ['farmer', 'farmer', 'fisher', 'butcher', 'librarian', 'cleric', 'smith'];
          for (let i = 0; i < T.folk; i++) {
            if (!T.prof && rng.nextInt(10) < 4) continue;
            const prof = T.prof || PROF[rng.nextInt(PROF.length)];
            out.entities.push({ type: 'villager', x: dx + 0.5, y: y0, z: dz + 0.5, extra: { prof, home: [V.x, V.z] } });
          }
        }
      }
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
        smithy: [[I.diamond, 1, 3, 3], [I.iron_ingot, 1, 5, 10], [I.gold_ingot, 1, 3, 5], [I.bread, 1, 3, 15], [I.apple, 1, 3, 15], [I.iron_pickaxe, 1, 1, 5], [I.iron_sword, 1, 1, 5],
          [I.iron_chestplate, 1, 1, 5], [I.iron_helmet, 1, 1, 5], [I.iron_leggings, 1, 1, 5], [I.iron_boots, 1, 1, 5], [B.OBSIDIAN, 3, 7, 5], [B.SAPLING, 3, 7, 5], [I.jade, 1, 3, 4]],
        fortress: [[I.gold_ingot, 1, 3, 15], [I.iron_ingot, 1, 5, 6], [I.diamond, 1, 3, 5], [I.gold_sword, 1, 1, 5], [I.gold_chestplate, 1, 1, 5], [I.gold_pickaxe, 1, 1, 3], [I.flint_and_steel, 1, 1, 5],
          [I.bloodcap, 3, 7, 5], [B.OBSIDIAN, 2, 4, 2], [I.sunstone_dust, 2, 6, 6], [I.smoky_quartz, 2, 8, 6], [I.fire_charge, 1, 3, 4], [I.gold_nugget, 3, 9, 8]],
        mineshaft: [[I.iron_ingot, 1, 5, 10], [I.gold_ingot, 1, 3, 5], [I.ember_dust, 4, 9, 5], [I.dye, 4, 9, 5, 11], [I.diamond, 1, 2, 3], [I.coal, 3, 8, 10], [I.bread, 1, 3, 15],
          [I.iron_pickaxe, 1, 1, 1], [B.RAIL, 4, 8, 1], [I.seeds, 2, 4, 10], [I.cobalt_ingot, 1, 2, 3], [I.lumite_shard, 2, 5, 4], [B.TORCH, 4, 10, 6], [I.prospector_rod, 1, 1, 1]],
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
        if (pick[4] !== undefined) dmg = pick[4];
        else if (pick[0] === I.dye) dmg = rng.nextInt(16);
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

  // ------------------------------------------------------------------ the Underworld
  // A cavern world between a bedrock floor and roof: lava seas at y 31, brimstone
  // cliffs and islands, sunstone hanging from the ceilings. Four regions:
  // the Brimstone Depths, the Bone Shoals, the Cinder Hollows and the rare
  // Glimmering Grottos.
  const LAVA_SEA = 31;
  const ubiome = (id, key, name, fog, o) => biome(id, key, name, Object.assign({
    dim: 1, temp: 2.0, rain: 0, top: B.BRIMSTONE, filler: B.BRIMSTONE, under: B.BRIMSTONE, grass: '#9a5a3a', foliage: '#9a5a3a', water: '#ffffff',
    tallGrass: 0, flowers: 0, cane: 0, pumpkins: false, animals: [], structures: [], fog,
  }, o));
  BI.U_DEPTHS = ubiome(40, 'brimstone_depths', 'Brimstone Depths', [0.2, 0.03, 0.03], { umobs: [['charred', 100], ['wailer', 30], ['magma_slime', 12]] });
  BI.U_BONE = ubiome(41, 'bone_shoals', 'Bone Shoals', [0.24, 0.14, 0.07], { umobs: [['charred', 40], ['wailer', 45], ['skeleton', 30]] });
  BI.U_CINDER = ubiome(42, 'cinder_hollows', 'Cinder Hollows', [0.15, 0.12, 0.15], { umobs: [['magma_slime', 60], ['charred', 25], ['wailer', 10]] });
  BI.U_GROTTO = ubiome(43, 'glimmering_grotto', 'Glimmering Grotto', [0.26, 0.16, 0.04], { umobs: [['charred', 60], ['magma_slime', 20]] });

  class UnderGenerator extends Generator {
    constructor(seed, opts) {
      super(seed, opts);
      const r = new Random(seedHash(this.seed, 13, 666));
      this.uA = new Octaves(r, 5); this.uB = new Octaves(r, 4); this.uShelf = new Octaves(r, 3);
      this.uReg = new Octaves(r, 3); this.uReg2 = new Octaves(r, 3);
      this.uPatch = new Octaves(r, 3); this.uPatch2 = new Octaves(r, 3);
    }
    villageAt() { return null; }
    mineshaftAt() { return null; }
    findSpawn() { return { x: 0, z: 0 }; }
    tempAt() { return 2; }
    biomeAt(x, z) {
      const r1 = this.uReg.noise2(x / 260, z / 260), r2 = this.uReg2.noise2(x / 170 + 31.7, z / 170 - 12.3);
      if (r1 > 0.27) return BI.U_BONE.id;
      if (r1 < -0.27) return BI.U_CINDER.id;
      if (r2 > 0.34) return BI.U_GROTTO.id;
      return BI.U_DEPTHS.id;
    }
    // positive = rock
    density(wx, y, wz) {
      let d = this.uA.noise3(wx / 90, y / 52, wz / 90) * 2.4 + this.uB.noise3(wx / 26, y / 18, wz / 26) * 0.75;
      d += Math.cos(y * Math.PI * 7 / 128) * 0.12 + this.uShelf.noise2(wx / 60, wz / 60) * 0.25;
      if (y < 22) d += (22 - y) / 22 * 2.6;
      if (y > 92) d += (y - 92) / 34 * 3.4;
      return d + 0.02;
    }
    generate(cx, cz) {
      const blocks = new Uint8Array(16 * 16 * H), meta = new Uint8Array(16 * 16 * H), biomes = new Uint8Array(256);
      const out = { cx, cz, blocks, meta, biomes, entities: [], tiles: [], ticks: [] };
      const x0 = cx * 16, z0 = cz * 16;
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) biomes[z * 16 + x] = this.biomeAt(x0 + x, z0 + z);
      // density on a 4 x 8 x 4 lattice, interpolated
      const dens = new Float32Array(5 * 17 * 5);
      for (let gz = 0; gz < 5; gz++) for (let gx = 0; gx < 5; gx++) for (let gy = 0; gy < 17; gy++) dens[(gz * 5 + gx) * 17 + gy] = this.density(x0 + gx * 4, gy * 8, z0 + gz * 4);
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
            const v = (v00 + (v10 - v00) * tx) * (1 - tz) + (v01 + (v11 - v01) * tx) * tz;
            blocks[IDX(x, y, z)] = v > 0 ? B.BRIMSTONE : (y <= LAVA_SEA ? B.LAVA : 0);
          }
        }
      }
      // bedrock floor and roof, ragged like the classics
      const br = new Random(seedHash(this.seed, cx, cz, 0xBED));
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        blocks[IDX(x, 0, z)] = B.BEDROCK; blocks[IDX(x, H - 1, z)] = B.BEDROCK;
        for (let k = 1; k < 5; k++) { if (br.nextInt(5) >= k) blocks[IDX(x, k, z)] = B.BEDROCK; if (br.nextInt(5) >= k) blocks[IDX(x, H - 1 - k, z)] = B.BEDROCK; }
      }
      this.uSurface(out);
      this.uOres(out);
      this.uFeatures(out);
      if (this.structuresOn) this.fortresses(out);
      return out;
    }
    // floors and ceilings take on their region's look
    uSurface(out) {
      const { blocks, meta, biomes } = out, x0 = out.cx * 16, z0 = out.cz * 16;
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const b = biomes[z * 16 + x], wx = x0 + x, wz = z0 + z;
        const p1 = this.uPatch.noise2(wx / 22, wz / 22), p2 = this.uPatch2.noise2(wx / 18 + 9.1, wz / 18 - 4.4);
        for (let y = 5; y < H - 5; y++) {
          const i = IDX(x, y, z);
          if (blocks[i] !== B.BRIMSTONE || blocks[i + 256] !== 0) continue;
          // a floor: air above rock
          if (b === BI.U_BONE.id) {
            const depth = 2 + (p1 > 0 ? 1 : 0);
            for (let k = 0; k < depth && blocks[i - k * 256] === B.BRIMSTONE; k++) blocks[i - k * 256] = B.BONESAND;
          } else if (b === BI.U_CINDER.id) {
            blocks[i] = (p2 > 0.3) ? B.SCORCHED_STONE : B.ASH;
            for (let k = 1; k < 3 && blocks[i - k * 256] === B.BRIMSTONE; k++) blocks[i - k * 256] = B.BASALT;
          } else if (y >= LAVA_SEA && y <= LAVA_SEA + 2 && p2 > -0.1) {
            blocks[i] = B.GRAVEL;        // dark beaches along the lava seas
          } else if (p1 > 0.32) {
            blocks[i] = B.BONESAND; if (blocks[i - 256] === B.BRIMSTONE) blocks[i - 256] = B.BONESAND;
          } else if (p2 > 0.4 && y > LAVA_SEA + 2) {
            blocks[i] = B.GRAVEL;
          }
          // ash and gravel need something under them
          if ((blocks[i] === B.ASH || blocks[i] === B.GRAVEL) && blocks[i - 256] === 0) blocks[i] = B.BRIMSTONE;
        }
      }
    }
    uOres(out) {
      const { blocks, meta, biomes } = out;
      const rng = new Random(seedHash(this.seed, out.cx, out.cz, 0x0A12));
      const brim = (id) => id === B.BRIMSTONE;
      const grotto = biomes[136] === BI.U_GROTTO.id;
      for (let i = 0, n = grotto ? 36 : 14; i < n; i++) this.vein(blocks, meta, rng, rng.nextInt(16), 10 + rng.nextInt(108), rng.nextInt(16), 13, B.QUARTZ_ORE, 0, brim);
      // hidden pockets of lava sealed in the rock
      for (let i = 0; i < 8; i++) {
        const x = 1 + rng.nextInt(14), y = 8 + rng.nextInt(110), z = 1 + rng.nextInt(14), k = IDX(x, y, z);
        if (blocks[k] !== B.BRIMSTONE) continue;
        let sealed = true;
        for (const o of [1, -1, 16, -16, 256, -256]) if (blocks[k + o] === 0) sealed = false;
        if (sealed) blocks[k] = B.LAVA;
      }
    }
    uFeatures(out) {
      const { blocks, meta, biomes, cx, cz } = out, X0 = cx * 16, Z0 = cz * 16;
      const rng = new Random(seedHash(this.seed, cx, cz, 0xF00D));
      const reg = biomes[136];
      const get = (x, y, z) => (x < 0 || x > 15 || z < 0 || z > 15 || y < 0 || y >= H) ? -1 : blocks[IDX(x, y, z)];
      const set = (x, y, z, id, m) => { if (x < 0 || x > 15 || z < 0 || z > 15 || y < 1 || y >= H - 1) return; const i = IDX(x, y, z); blocks[i] = id; meta[i] = m || 0; };
      const solid = (id) => id > 0 && SOLID[id] && id !== B.LAVA;
      // ---- sunstone clusters hanging from the roof ----
      const clusters = reg === BI.U_GROTTO.id ? 14 : reg === BI.U_DEPTHS.id ? 6 : 3;
      for (let c = 0; c < clusters; c++) {
        const sx = 3 + rng.nextInt(10), sz = 3 + rng.nextInt(10);
        let sy = 40 + rng.nextInt(80);
        while (sy < H - 6 && get(sx, sy, sz) !== 0) sy++;
        while (sy < H - 6 && get(sx, sy + 1, sz) === 0) sy++;
        if (!solid(get(sx, sy + 1, sz)) || get(sx, sy, sz) !== 0) continue;
        set(sx, sy, sz, B.SUNSTONE);
        for (let k = 0; k < 140; k++) {
          const x = sx + rng.nextInt(7) - 3, y = sy - rng.nextInt(9), z = sz + rng.nextInt(7) - 3;
          if (get(x, y, z) !== 0) continue;
          let n = 0;
          for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (get(x + dx, y + dy, z + dz) === B.SUNSTONE) n++;
          if (n === 1) set(x, y, z, B.SUNSTONE);
        }
      }
      // ---- lava falls spilling from the walls ----
      for (let k = 0; k < 6; k++) {
        const x = 1 + rng.nextInt(14), y = 36 + rng.nextInt(80), z = 1 + rng.nextInt(14);
        if (get(x, y, z) !== B.BRIMSTONE || get(x, y + 1, z) !== B.BRIMSTONE || get(x, y - 1, z) !== B.BRIMSTONE) continue;
        let air = 0, rock = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = get(x + dx, y, z + dz); if (n === 0) air++; else if (solid(n)) rock++; }
        if (air === 1 && rock === 3) { set(x, y, z, B.LAVA); out.ticks.push([X0 + x, y, Z0 + z]); }
      }
      // floor positions helper
      const floorAt = (x, z, ylo, yhi) => {
        for (let t = 0; t < 6; t++) {
          const y = ylo + rng.nextInt(Math.max(1, yhi - ylo));
          let yy = y;
          while (yy > ylo && get(x, yy, z) === 0) yy--;
          if (solid(get(x, yy, z)) && get(x, yy + 1, z) === 0 && get(x, yy + 2, z) === 0) return yy + 1;
        }
        return -1;
      };
      // ---- eternal fires and dark mushrooms ----
      if (reg !== BI.U_GROTTO.id) for (let k = 0; k < (reg === BI.U_CINDER.id ? 8 : 4); k++) {
        const x = rng.nextInt(16), z = rng.nextInt(16), y = floorAt(x, z, LAVA_SEA + 1, 120);
        if (y < 0) continue;
        const below = get(x, y - 1, z);
        if (below === B.BRIMSTONE || below === B.ASH || below === B.SCORCHED_STONE) for (let j = 0; j < 4; j++) { const fx = x + rng.nextInt(3) - 1, fz = z + rng.nextInt(3) - 1; const fb = get(fx, y - 1, fz); if (get(fx, y, fz) === 0 && (fb === B.BRIMSTONE || fb === B.ASH || fb === B.SCORCHED_STONE)) set(fx, y, fz, B.FIRE); }
      }
      for (let k = 0; k < 2; k++) {
        const x = rng.nextInt(16), z = rng.nextInt(16), y = floorAt(x, z, LAVA_SEA + 1, 120);
        if (y > 0 && get(x, y - 1, z) !== B.BONESAND) set(x, y, z, rng.nextBool() ? B.MUSHROOM_BROWN : B.MUSHROOM_RED);
      }
      // ---- region features ----
      if (reg === BI.U_BONE.id) {
        // wild bloodcap in the bone sand
        if (rng.nextInt(3) === 0) for (let k = 0; k < 6; k++) {
          const x = rng.nextInt(16), z = rng.nextInt(16), y = floorAt(x, z, LAVA_SEA + 1, 110);
          if (y > 0 && get(x, y - 1, z) === B.BONESAND) set(x, y, z, B.BLOODCAP, 2 + rng.nextInt(2));
        }
        // the ribs of something enormous
        if (rng.nextInt(4) === 0) this.uRibcage(out, rng, get, set, floorAt);
      } else if (reg === BI.U_CINDER.id) {
        // basalt columns, floor to roof
        for (let k = 0; k < 3; k++) {
          const x = 2 + rng.nextInt(12), z = 2 + rng.nextInt(12), y = floorAt(x, z, LAVA_SEA + 1, 100);
          if (y < 0) continue;
          const w = rng.nextInt(3) === 0 ? 2 : 1;
          let top = y; while (top < H - 6 && get(x, top, z) === 0) top++;
          if (top - y > 40) continue;
          for (let yy = y; yy < top; yy++) for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < w; dz++) if (get(x + dx, yy, z + dz) === 0) set(x + dx, yy, z + dz, B.BASALT);
        }
        // smouldering vents: a ring of scorched stone round a lava eye
        if (rng.nextInt(2) === 0) {
          const x = 2 + rng.nextInt(12), z = 2 + rng.nextInt(12), y = floorAt(x, z, LAVA_SEA + 2, 100);
          if (y > 0) {
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (get(x + dx, y, z + dz) === 0) set(x + dx, y, z + dz, B.SCORCHED_STONE);
            set(x, y - 1, z, B.LAVA); out.ticks.push([X0 + x, y - 1, Z0 + z]);
          }
        }
      } else if (reg === BI.U_GROTTO.id) {
        // smoky quartz spires rising from the floor and hanging from the roof
        for (let k = 0; k < 5; k++) {
          const x = 1 + rng.nextInt(14), z = 1 + rng.nextInt(14), y = floorAt(x, z, LAVA_SEA + 1, 110);
          if (y < 0) continue;
          const h = 2 + rng.nextInt(4);
          for (let j = 0; j < h && get(x, y + j, z) === 0; j++) set(x, y + j, z, B.QUARTZ_BLOCK, 2);
          if (get(x, y + h, z) === 0 && rng.nextBool()) set(x, y + h, z, B.SUNSTONE);
        }
        for (let k = 0; k < 4; k++) {
          const x = 1 + rng.nextInt(14), z = 1 + rng.nextInt(14);
          let y = 60 + rng.nextInt(60);
          while (y < H - 6 && get(x, y, z) === 0) y++;
          if (!solid(get(x, y, z))) continue;
          for (let j = 1; j <= 1 + rng.nextInt(4) && get(x, y - j, z) === 0; j++) set(x, y - j, z, B.QUARTZ_BLOCK, 2);
        }
      }
    }
    // ---- fortresses: brimstone-brick bridges and halls laid out on a 7-block grid ----
    fortressAt(rx, rz) {
      const key = (rx + 32768) * 65536 + (rz + 32768);
      if (!this.fortCache) this.fortCache = new Map();
      if (this.fortCache.has(key)) return this.fortCache.get(key);
      const r = new Random(seedHash(this.seed, rx, rz, 0xF047));
      let L = null;
      if (this.structuresOn && r.nextFloat() < 0.55) {
        const sx = (rx * 16 + 4 + r.nextInt(8)) * 16 + 8, sz = (rz * 16 + 4 + r.nextInt(8)) * 16 + 8;
        L = this.fortressLayout(sx, sz, 56 + r.nextInt(18), new Random(seedHash(this.seed, rx, rz, 0xF048)));
      }
      this.fortCache.set(key, L);
      if (this.fortCache.size > 256) this.fortCache.delete(this.fortCache.keys().next().value);
      return L;
    }
    // the fortress (if any) whose bounds hold this point
    fortressNear(x, z) {
      const rx = Math.floor(x / 256), rz = Math.floor(z / 256);
      for (let i = rx - 1; i <= rx + 1; i++) for (let j = rz - 1; j <= rz + 1; j++) {
        const L = this.fortressAt(i, j);
        if (L && x >= L.box[0] && x <= L.box[3] && z >= L.box[2] && z <= L.box[5]) return L;
      }
      return null;
    }
    fortressLayout(sx, sz, F, rng) {
      const DIR = [[0, -1], [0, 1], [-1, 0], [1, 0]], OPP = [1, 0, 3, 2];
      const cells = new Map(), K = (i, j) => i + ',' + j;
      const put = (i, j, kind) => { const c = { i, j, kind, l: [0, 0, 0, 0], seed: rng.nextInt(0x7fffffff) }; cells.set(K(i, j), c); return c; };
      const link = (a, b, d) => { a.l[d] = 1; b.l[OPP[d]] = 1; };
      const free = (i, j) => Math.abs(i) <= 7 && Math.abs(j) <= 7 && !cells.has(K(i, j));
      const start = put(0, 0, 'plaza');
      const open = [];
      for (let d = 0; d < 4; d++) if (d === 0 || rng.nextInt(10) < 8) open.push({ c: start, d, depth: 0 });
      let rooms = 0;
      while (open.length && cells.size < 70) {
        const { c, d, depth } = open.splice(rng.nextInt(open.length), 1)[0];
        const style = depth === 0 || rng.nextBool() ? 'bridge' : 'hall';
        let prev = c, n = 2 + rng.nextInt(4);
        for (let k = 0; k < n; k++) {
          const i = prev.i + DIR[d][0], j = prev.j + DIR[d][1];
          if (!free(i, j)) break;
          const nc = put(i, j, style); link(prev, nc, d); prev = nc;
        }
        if (prev === c) continue;
        // what lies at the end of the run
        const i = prev.i + DIR[d][0], j = prev.j + DIR[d][1];
        if (!free(i, j)) continue;
        if (depth < 3 && rng.nextInt(10) < 6) {
          const jc = put(i, j, style === 'bridge' ? 'plaza' : 'hallx'); link(prev, jc, d);
          for (let nd = 0; nd < 4; nd++) if (nd !== OPP[d] && rng.nextInt(10) < 6) open.push({ c: jc, d: nd, depth: depth + 1 });
        } else {
          const roll = rng.nextInt(10);
          const spawners = [...cells.values()].filter((q) => q.kind === 'spawner').length;
          const kind = rooms === 0 ? 'spawner' : rooms === 1 ? 'treasury' : roll < 3 ? 'garden' : roll < 6 ? 'treasury' : (roll < 8 && spawners < 2) ? 'spawner' : 'end';
          rooms++;
          const rc = put(i, j, kind); link(prev, rc, d);
        }
      }
      // one Flare spawner at least
      if (![...cells.values()].some((c) => c.kind === 'spawner')) { const ends = [...cells.values()].filter((c) => c.kind === 'end'); if (ends.length) ends[0].kind = 'spawner'; }
      const list = [...cells.values()];
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const c of list) { x0 = Math.min(x0, sx + c.i * 7 - 3); x1 = Math.max(x1, sx + c.i * 7 + 3); z0 = Math.min(z0, sz + c.j * 7 - 3); z1 = Math.max(z1, sz + c.j * 7 + 3); }
      return { sx, sz, F, cells: list, box: [x0 - 1, 1, z0 - 1, x1 + 1, F + 7, z1 + 1] };
    }
    fortresses(out) {
      const x0 = out.cx * 16, z0 = out.cz * 16;
      const rx = Math.floor(x0 / 256), rz = Math.floor(z0 / 256);
      for (let i = rx - 1; i <= rx + 1; i++) for (let j = rz - 1; j <= rz + 1; j++) {
        const L = this.fortressAt(i, j);
        if (!L || L.box[3] < x0 || L.box[0] > x0 + 15 || L.box[5] < z0 || L.box[2] > z0 + 15) continue;
        for (const c of L.cells) {
          const cx0 = L.sx + c.i * 7 - 3, cz0 = L.sz + c.j * 7 - 3;
          if (cx0 + 7 < x0 || cx0 - 1 > x0 + 15 || cz0 + 7 < z0 || cz0 - 1 > z0 + 15) continue;
          this.fortressCell(out, L, c, cx0, cz0);
        }
      }
    }
    fortressCell(out, L, c, ox, oz) {
      const { blocks, meta } = out, X0 = out.cx * 16, Z0 = out.cz * 16, F = L.F;
      const inC = (x, z) => x >= X0 && x < X0 + 16 && z >= Z0 && z < Z0 + 16;
      const get = (x, y, z) => (!inC(x, z) || y < 0 || y >= H) ? -1 : blocks[IDX(x - X0, y, z - Z0)];
      const set = (x, y, z, id, m) => { if (!inC(x, z) || y < 1 || y >= H - 1) return; const i = IDX(x - X0, y, z - Z0); blocks[i] = id; meta[i] = m || 0; };
      const BR = B.BRIMSTONE_BRICKS, FE = B.BRIMSTONE_FENCE;
      const rng = new Random(c.seed);
      const enclosed = c.kind === 'hall' || c.kind === 'hallx' || c.kind === 'garden' || c.kind === 'treasury';
      const floor = (u, v) => {
        if (u < 0 || v < 0 || u > 6 || v > 6) return false;
        if (u >= 1 && u <= 5 && v >= 1 && v <= 5) return true;
        if (v >= 1 && v <= 5) return (u === 0 && c.l[2]) || (u === 6 && c.l[3]);
        if (u >= 1 && u <= 5) return (v === 0 && c.l[0]) || (v === 6 && c.l[1]);
        return false;
      };
      const edge = (u, v) => floor(u, v) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([du, dv]) => { const nu = u + du, nv = v + dv; return nu >= 0 && nv >= 0 && nu <= 6 && nv <= 6 && !floor(nu, nv); });
      const top = enclosed ? F + 5 : F + 3;
      for (let u = 0; u <= 6; u++) for (let v = 0; v <= 6; v++) {
        if (!floor(u, v)) continue;
        const x = ox + u, z = oz + v;
        if (!inC(x, z)) continue;
        set(x, F, z, BR);
        set(x, F - 1, z, BR);
        for (let y = F + 1; y <= top; y++) set(x, y, z, 0);
        if (edge(u, v)) {
          if (enclosed) {
            const corner = [[1, 0], [-1, 0]].every(([du]) => floor(u + du, v)) === false && [[0, 1], [0, -1]].every(([, dv]) => floor(u, v + dv)) === false;
            for (let y = F + 1; y <= F + 4; y++) {
              const win = !corner && (y === F + 2 || y === F + 3) && ((u + v) & 1) === 0;
              set(x, y, z, win ? FE : BR);
            }
          } else { set(x, F + 1, z, BR); set(x, F + 2, z, FE); }
        }
        if (enclosed) set(x, F + 5, z, BR);
      }
      // the central pier, down to solid ground (or into the lava)
      const px = ox + 3, pz = oz + 3;
      if (inC(px, pz)) {
        for (let y = F - 2; y >= 1; y--) {
          const id = get(px, y, pz);
          if (id !== 0 && id !== B.LAVA && id !== B.FIRE && SOLID[id] && y < F - 3) break;
          set(px, y, pz, BR);
        }
        // a buttress either side of the pier, flaring out under the floor like an arch
        for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ax = px + du, az = pz + dv;
          if (get(ax, F - 2, az) === 0 || get(ax, F - 2, az) === B.LAVA) set(ax, F - 2, az, BR);
          const bx = px + du * 2, bz = pz + dv * 2;
          if (get(bx, F - 2, bz) === 0) set(bx, F - 2, bz, B.STAIRS, (17 << 3) | [1, 0, 3, 2][[[0, -1], [0, 1], [-1, 0], [1, 0]].findIndex(([a, b]) => a === du && b === dv)] | 4);
        }
      }
      // ---- what the cell holds ----
      if (c.kind === 'spawner') {
        // the flare spawner on a brick plinth, fence posts at its corners
        set(ox + 3, F + 1, oz + 3, B.MOB_SPAWNER);
        if (inC(ox + 3, oz + 3)) out.tiles.push({ type: 'spawner', x: ox + 3, y: F + 1, z: oz + 3, mob: 'flare' });
        for (const [u, v] of [[2, 2], [4, 2], [2, 4], [4, 4]]) { set(ox + u, F + 1, oz + v, BR); set(ox + u, F + 2, oz + v, FE); }
      } else if (c.kind === 'garden') {
        // bloodcap beds in bone sand, lit by sunstone in the ceiling
        const alongX = c.l[2] || c.l[3];
        for (let u = 2; u <= 4; u++) for (const v of [2, 4]) {
          const x = ox + (alongX ? u : v), z = oz + (alongX ? v : u);
          set(x, F, z, B.BONESAND); set(x, F + 1, z, B.BLOODCAP, 1 + rng.nextInt(3));
        }
        set(ox + 3, F + 5, oz + 3, B.SUNSTONE);
      } else if (c.kind === 'treasury') {
        const alongX = c.l[2] || c.l[3];
        const x = ox + (alongX ? 3 : 2), z = oz + (alongX ? 2 : 3);
        set(x, F + 1, z, B.CHEST, alongX ? 1 : 3);
        if (inC(x, z)) out.tiles.push({ type: 'chest', x, y: F + 1, z, items: this.loot(rng, 'fortress') });
        set(ox + 3, F + 5, oz + 3, B.SUNSTONE);
      } else if (c.kind === 'plaza' && rng.nextInt(3) === 0) {
        // a fire pit at the crossing
        set(ox + 3, F, oz + 3, B.BRIMSTONE); set(ox + 3, F + 1, oz + 3, B.FIRE);
      } else if (c.kind === 'hall' && rng.nextInt(4) === 0) {
        set(ox + 3, F + 5, oz + 3, B.SUNSTONE);
      }
    }
    // a giant rib cage: a spine with curved ribs arching down to the floor
    uRibcage(out, rng, get, set, floorAt) {
      const alongX = rng.nextBool(), len = 7 + rng.nextInt(4), half = 3;
      const cx = 8, cz = 8;
      const y = floorAt(cx, cz, LAVA_SEA + 2, 100);
      if (y < 0) return;
      const top = y + 6 + rng.nextInt(3);
      const at = (u, v) => alongX ? [cx - (len >> 1) + u, cz + v] : [cx + v, cz - (len >> 1) + u];
      const axisM = alongX ? 4 : 8;      // bone block axis along the spine
      for (let u = 0; u < len; u++) { const [x, z] = at(u, 0); if (get(x, top, z) === 0) set(x, top, z, B.BONE_BLOCK, axisM); }
      for (let u = 1; u < len - 1; u += 2) {
        for (const side of [-1, 1]) {
          // a rib: out from the spine, then curving down
          const prof = [[1, 0], [2, -1], [3, -2], [3, -3], [3, -4], [3, -5], [2, -6], [2, -7]];
          for (const [o, dy] of prof) {
            const yy = top + dy;
            if (yy < y) break;
            const [x, z] = at(u, o * side);
            if (get(x, yy, z) === 0) set(x, yy, z, B.BONE_BLOCK, dy === 0 ? (alongX ? 8 : 4) : 0);
          }
        }
      }
      // a fallen skull's worth of bone sand round the base
      for (let k = 0; k < 10; k++) { const x = cx + rng.nextInt(9) - 4, z = cz + rng.nextInt(9) - 4; if (get(x, y - 1, z) === B.BRIMSTONE) set(x, y - 1, z, B.BONESAND); }
    }
  }
  function makeGenerator(seed, opts) { return (opts && opts.dim === 1) ? new UnderGenerator(seed, opts) : new Generator(seed, opts); }

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

  return { BIOMES, BI, Generator, UnderGenerator, makeGenerator, SEA, H, LAVA_SEA };
}
