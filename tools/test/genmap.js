// Renders a top-down map of generated terrain: node tools/test/genmap.js <seed> <out.png> [radiusChunks] [mode=biome|terrain]
const { load, writePNG } = require('./nodeenv');
const ctx = load(['src/core/util.js', 'src/core/noise.js', 'src/core/blocks.js', 'src/core/items.js', 'src/world/worldgen.js']);
const seed = +(process.argv[2] || 12345), out = process.argv[3] || 'map.png', R = +(process.argv[4] || 16), mode = process.argv[5] || 'terrain';
const vm = require('vm');
const res = vm.runInContext(`
  const TAB = workerBlockTable(); TAB.items = ITEM_IDS;
  const WG = WorldGenFactory(Noise, TAB);
  const gen = new WG.Generator(${seed}, { type: '${process.argv[6] || 'default'}' });
  ({ WG, gen, TAB });
`, ctx);
const { WG, gen } = res;
const B = vm.runInContext('B', ctx);
const N = R * 2 * 16;
const img = new Uint8Array(N * N * 4);
const colors = {};
const col = (id, meta) => {
  const tbl = { [B.GRASS]: [95, 159, 53], [B.SAND]: [219, 211, 160], [B.WATER]: [52, 90, 220], [B.STONE]: [125, 125, 125], [B.GRAVEL]: [130, 120, 118], [B.SNOW_LAYER]: [240, 250, 250], [B.ICE]: [150, 190, 250],
    [B.LEAVES]: [40, 110, 30], [B.LOG]: [100, 80, 50], [B.DIRT]: [134, 96, 67], [B.PODZOL]: [110, 80, 40], [B.MYCELIUM]: [120, 100, 120], [B.ASH]: [150, 148, 144], [B.BASALT]: [60, 60, 64], [B.SALT]: [240, 236, 236],
    [B.TERRACOTTA]: [160, 90, 60], [B.PEAT]: [60, 40, 30], [B.LAVA]: [230, 100, 20], [B.CACTUS]: [20, 130, 40], [B.CLAY]: [160, 165, 178], [B.SCORCHED_STONE]: [60, 50, 45], [B.TALL_GRASS]: [90, 170, 60], [B.FLOWER]: [200, 60, 160],
    [B.HUGE_MUSHROOM_RED]: [200, 30, 30], [B.HUGE_MUSHROOM_BROWN]: [140, 100, 70], [B.QUICKSAND]: [190, 170, 120], [B.MOSSY_COBBLESTONE]: [90, 110, 80], [B.COBBLESTONE]: [110, 110, 110], [B.WOOL]: [220, 220, 220] };
  if (id === B.LEAVES && (meta & 7) === 4) return [190, 60, 30];
  if (id === B.LEAVES && (meta & 7) === 6) return [220, 170, 50];
  return tbl[id] || [255, 0, 255];
};
const t0 = Date.now();
let chunks = 0;
const biomeCount = {};
for (let cz = -R; cz < R; cz++) for (let cx = -R; cx < R; cx++) {
  if (mode === 'biome') {
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = cx * 16 + x, wz = cz * 16 + z;
      const b = gen.biomeAt(wx, wz);
      biomeCount[WG.BIOMES[b].key] = (biomeCount[WG.BIOMES[b].key] || 0) + 1;
      const h = (b * 2654435761) >>> 0;
      const c = { 0: [30, 60, 160], 1: [20, 40, 120], 2: [140, 200, 90], 3: [230, 210, 140], 4: [120, 120, 120], 5: [40, 120, 40], 6: [100, 170, 90], 7: [50, 100, 80], 8: [240, 240, 255], 9: [180, 210, 220], 10: [80, 100, 60], 11: [20, 160, 20], 12: [160, 100, 160], 13: [250, 240, 180], 14: [60, 100, 230], 15: [210, 110, 40], 16: [140, 50, 40], 17: [150, 110, 160], 18: [70, 70, 70], 19: [255, 250, 250], 20: [230, 230, 80], 21: [200, 90, 40], 22: [90, 90, 100] }[b] || [h & 255, (h >> 8) & 255, (h >> 16) & 255];
      const px = ((cz + R) * 16 + z) * N + (cx + R) * 16 + x;
      img.set([...c, 255], px * 4);
    }
    continue;
  }
  const ch = gen.generate(cx, cz); chunks++;
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    let y = 127; while (y > 0 && ch.blocks[(y << 8) | (z << 4) | x] === 0) y--;
    const id = ch.blocks[(y << 8) | (z << 4) | x];
    let c = col(id, ch.meta[(y << 8) | (z << 4) | x]);
    const shade = 0.6 + (y - 50) / 70 * 0.5;
    c = c.map((v) => Math.max(0, Math.min(255, v * shade)));
    const px = ((cz + R) * 16 + z) * N + (cx + R) * 16 + x;
    img.set([...c, 255], px * 4);
  }
}
const dt = Date.now() - t0;
console.log(mode, 'chunks', chunks, 'ms', dt, chunks ? 'ms/chunk ' + (dt / chunks).toFixed(1) : '');
if (mode === 'biome') { const tot = Object.values(biomeCount).reduce((a, b) => a + b, 0); console.log(Object.entries(biomeCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + (100 * v / tot).toFixed(1) + '%').join(', ')); }
writePNG(out, N, N, img);
