'use strict';
// ---------------------------------------------------------------------------
// World: chunk storage & streaming, block access, lighting, ticking hooks.
// ---------------------------------------------------------------------------

// Shared world-gen definitions on the main thread (biomes etc.)
const GEN_TAB = (() => { const t = workerBlockTable(); t.items = ITEM_IDS; return t; })();
const WG = WorldGenFactory(Noise, GEN_TAB);
const BIOMES = WG.BIOMES;
const BIOME_TINTS = BIOMES.map((b) => b ? { grass: hexToRgb(b.grass), foliage: hexToRgb(b.foliage), water: hexToRgb(b.water) } : null);

// Dimensions share one save: the Underworld's and the Far Isles' chunk and
// entity records are stored under keys offset by dim * DIM_KEY (exact doubles,
// so keys stay unique).
const DIM_KEY = 4294967296;
const DIM_OVERWORLD = 0, DIM_UNDERWORLD = 1, DIM_ISLES = 2;
function dimKeys(keys, dim) {
  const out = new Set(), lo = dim * DIM_KEY, hi = lo + DIM_KEY;
  for (const k of keys) if (k >= lo && k < hi) out.add(k - lo);
  return out;
}

// Generation runs in Web Workers built from the very same source functions.
class GenPool {
  constructor(seed, opts, onChunk) {
    this.onChunk = onChunk;
    this.workers = [];
    this.pending = 0;
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
    const src = [
      NoiseLib.toString(), WorldGenFactory.toString(),
      'const Noise = NoiseLib();',
      'const TAB = ' + JSON.stringify(GEN_TAB) + ';',
      'const WG = WorldGenFactory(Noise, TAB);',
      'let gen = null;',
      `onmessage = function (e) {
        const m = e.data;
        if (m.type === 'init') { gen = WG.makeGenerator(m.seed, m.opts); }
        else if (m.type === 'gen') {
          const o = gen.generate(m.cx, m.cz);
          postMessage({ type: 'chunk', cx: o.cx, cz: o.cz, blocks: o.blocks, meta: o.meta, biomes: o.biomes, entities: o.entities, tiles: o.tiles, ticks: o.ticks }, [o.blocks.buffer, o.meta.buffer, o.biomes.buffer]);
        } else if (m.type === 'spawn') { postMessage({ type: 'spawn', pos: gen.findSpawn(), id: m.id }); }
      };`,
    ].join('\n');
    let url = null;
    try { url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' })); } catch (e) { url = null; }
    for (let i = 0; i < n && url; i++) {
      try {
        const w = new Worker(url);
        w.jobs = 0;
        w.onmessage = (e) => this.handle(w, e.data);
        w.onerror = (e) => { console.error('worldgen worker error', e.message || e); };
        w.postMessage({ type: 'init', seed, opts });
        this.workers.push(w);
      } catch (e) { console.warn('Worker unavailable, generating on main thread', e); break; }
    }
    if (!this.workers.length) {
      // Fallback: generate on the main thread, one chunk per macrotask
      this.local = WG.makeGenerator(seed, opts);
      this.localQueue = [];
    }
    this.spawnCallbacks = new Map();
  }
  handle(w, m) {
    if (m.type === 'chunk') { w.jobs--; this.pending--; this.onChunk(m); }
    else if (m.type === 'spawn') { const cb = this.spawnCallbacks.get(m.id); if (cb) { this.spawnCallbacks.delete(m.id); cb(m.pos); } }
  }
  request(cx, cz) {
    this.pending++;
    if (this.workers.length) {
      let best = this.workers[0];
      for (const w of this.workers) if (w.jobs < best.jobs) best = w;
      best.jobs++;
      best.postMessage({ type: 'gen', cx, cz });
    } else {
      this.localQueue.push([cx, cz]);
      if (this.localQueue.length === 1) this.pumpLocal();
    }
  }
  pumpLocal() {
    setTimeout(() => {
      const job = this.localQueue.shift();
      if (!job) return;
      const o = this.local.generate(job[0], job[1]);
      this.pending--;
      this.onChunk(o);
      if (this.localQueue.length) this.pumpLocal();
    }, 0);
  }
  findSpawn(cb) {
    if (this.workers.length) {
      const id = Math.random();
      this.spawnCallbacks.set(id, cb);
      this.workers[0].postMessage({ type: 'spawn', id });
    } else cb(this.local.findSpawn());
  }
  terminate() { for (const w of this.workers) w.terminate(); this.workers = []; if (this.localQueue) this.localQueue.length = 0; }
}

class World {
  constructor(game, info, opts) {
    opts = opts || {};
    this.game = game;
    this.info = info;
    this.seed = info.seed | 0;
    this.menu = !!opts.menu;       // title-screen panorama world (never saved)
    this.dim = opts.dim || 0;       // 0 the overworld, 1 the Underworld, 2 the Far Isles
    this.keyBase = this.dim * DIM_KEY;
    this.chunks = new Map();
    this.light = new LightEngine(this);
    this.genOpts = { type: info.worldType || 'default', structures: info.structures !== false, dim: this.dim };
    this.gen = new GenPool(this.seed, this.genOpts, (m) => this.onGenerated(m));
    this.localGen = WG.makeGenerator(this.seed, this.genOpts);   // main-thread queries (biomes)
    this.requested = new Map();
    this.time = info.time || 0;           // total ticks
    this.dayTime = info.dayTime !== undefined ? info.dayTime : 1000;
    this.rain = info.rain || 0; this.thunder = info.thunder || 0;
    this.lightningFlash = 0;
    this.rainTime = info.rainTime || (12000 + Math.floor(Math.random() * 168000));
    this.thunderTime = info.thunderTime || (12000 + Math.floor(Math.random() * 168000));
    this.raining = !!info.raining; this.thundering = !!info.thundering;
    this.rainStrength = this.raining && !this.dim ? 1 : 0; this.thunderStrength = this.thundering && !this.dim ? 1 : 0;
    this.prevRainStrength = this.rainStrength; this.prevThunderStrength = this.thunderStrength;
    this.entities = [];
    this.entityMap = new Map();
    this.nextEntityId = 1;
    this.tickQueue = new MinHeap();
    this.tickPending = new Set();
    this.rng = new Noise.Random();
    this.entityInit = new Set(info.entityInit || []);
    this.savedKeys = dimKeys(info.savedKeys || [], this.dim);
    this.storage = opts.storage || null;
    this.loadRadius = 6;
    this._lastChunk = null;
    this.spawn = info.spawn || null;
    this.offsetCache = new Map();
    this.particlesQueue = [];
    this.difficulty = info.difficulty === undefined ? 2 : info.difficulty;
    this.gameRules = Object.assign({ doDaylightCycle: true, doMobSpawning: true, keepInventory: false, doFireTick: true, mobGriefing: true }, info.gameRules || {});
    this.unloadQueue = [];
    this.chunksLoadedCount = 0;
  }

  // ------------------------------------------------------------ chunk access
  getChunk(cx, cz) {
    const lc = this._lastChunk;
    if (lc && lc.cx === cx && lc.cz === cz) return lc;
    const c = this.chunks.get((cx + 32768) * 65536 + (cz + 32768));
    if (c) this._lastChunk = c;
    return c || null;
  }
  getChunkAt(x, z) { return this.getChunk(x >> 4, z >> 4); }
  isLoaded(x, z) { return !!this.getChunk(x >> 4, z >> 4); }
  getBlock(x, y, z) {
    if (y < 0 || y >= CH_H) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    return c ? c.blocks[(y << 8) | ((z & 15) << 4) | (x & 15)] : 0;
  }
  getMeta(x, y, z) {
    if (y < 0 || y >= CH_H) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    return c ? c.meta[(y << 8) | ((z & 15) << 4) | (x & 15)] : 0;
  }
  getLightRaw(x, y, z) {
    if (y >= CH_H) return 0xF0;
    if (y < 0) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    return c ? c.light[(y << 8) | ((z & 15) << 4) | (x & 15)] : 0xF0;
  }
  getSkyLight(x, y, z) { return this.getLightRaw(x, y, z) >> 4; }
  getBlockLight(x, y, z) { return this.getLightRaw(x, y, z) & 15; }
  // effective light level for game logic (sky darkened at night)
  getLightLevel(x, y, z) {
    const l = this.getLightRaw(x, y, z);
    return Math.max((l >> 4) - this.skyDarken(), l & 15);
  }
  skyDarken() {
    if (this.dim) return 11;   // no sun reaches the Underworld or the Far Isles
    // 0 at noon, 11 at midnight (rain/thunder darken further)
    const a = this.celestialAngle(1);
    let f = 1 - (Math.cos(a * TAU) * 2 + 0.5);
    f = clamp(f, 0, 1);
    f = 1 - f;
    f *= 1 - this.rainStrength * 5 / 16;
    f *= 1 - this.thunderStrength * 5 / 16;
    f = 1 - f;
    return Math.round(f * 11);
  }
  heightAt(x, z) {
    const c = this.getChunk(x >> 4, z >> 4);
    return c ? c.heightmap[((z & 15) << 4) | (x & 15)] : 0;
  }
  topSolidY(x, z) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return -1;
    for (let y = CH_H - 1; y >= 0; y--) { const id = c.blocks[(y << 8) | ((z & 15) << 4) | (x & 15)]; if (BT.solid[id] || BT.fluid[id]) return y; }
    return -1;
  }
  biomeAt(x, z) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (c) return c.biomes[((z & 15) << 4) | (x & 15)];
    return this.localGen.biomeAt(x, z);
  }
  canSeeSky(x, y, z) { return y >= this.heightAt(x, z); }
  isRainingAt(x, y, z) {
    if (this.rainStrength < 0.2) return false;
    if (!this.canSeeSky(x, y, z)) return false;
    const b = BIOMES[this.biomeAt(x, z)];
    if (!b || b.rain <= 0 || b.temp > 1.0) return false;
    return true;
  }
  isSnowingAt(x, y, z) {
    const b = this.biomeAt(x, z);
    return this.localGen.tempAt(b, y) < 0.15;
  }
  markChunkSectionDirty(cx, cz, y) {
    const c = this.getChunk(cx, cz);
    if (c) { c.dirty[y >> 4] = 1; c.anyDirty = true; }
  }
  markBlockDirty(x, y, z) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (c) this.light.dirtyAt(c, x & 15, y, z & 15);
  }

  // ------------------------------------------------------------ block writes
  // flags: 1 = notify neighbours, 2 = skip light, 4 = silent (no callbacks), 8 = don't mark modified
  setBlock(x, y, z, id, meta, flags) {
    if (y < 0 || y >= CH_H) return false;
    flags = flags === undefined ? 1 : flags;
    meta = meta | 0;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return false;
    const i = (y << 8) | ((z & 15) << 4) | (x & 15);
    const old = c.blocks[i], oldMeta = c.meta[i];
    if (old === id && oldMeta === meta) return false;
    c.blocks[i] = id; c.meta[i] = meta;
    if (!(flags & 8)) c.modified = true;
    c.mapDirty = true;
    // heightmap
    const hi = ((z & 15) << 4) | (x & 15);
    const h = c.heightmap[hi];
    if (BT.opacity[id] > 0) { if (y >= h) c.heightmap[hi] = y + 1; }
    else if (y === h - 1) { let yy = y; while (yy >= 0 && BT.opacity[c.blocks[(yy << 8) | ((z & 15) << 4) | (x & 15)]] === 0) yy--; c.heightmap[hi] = yy + 1; }
    // tile entities
    if (old !== id) {
      const ot = c.tiles.get(i);
      if (ot) { if (!(flags & 4) && this.onTileRemoved) this.onTileRemoved(ot, x, y, z); c.tiles.delete(i); }
      const td = BLOCKS[id] && BLOCKS[id].tileEntity;
      if (td) c.tiles.set(i, makeTileEntity(td, x, y, z));
    }
    // light
    if (!(flags & 2) && (BT.opacity[old] !== BT.opacity[id] || BT.light[old] !== BT.light[id])) this.light.update(x, y, z);
    this.light.dirtyAt(c, x & 15, y, z & 15);
    if (!(flags & 4)) {
      if (old !== id) {
        const od = BLOCKS[old]; if (od && od.onRemoved) od.onRemoved(this, x, y, z, oldMeta, id);
        const nd = BLOCKS[id]; if (nd && nd.onPlaced) nd.onPlaced(this, x, y, z, meta, old);
      }
      if (flags & 1) this.notifyNeighbors(x, y, z, id);
      if (!this.menu && typeof Circuits !== 'undefined') Circuits.blockChanged(this, x, y, z, old, id);
    }
    return true;
  }
  setMeta(x, y, z, meta, flags) { return this.setBlock(x, y, z, this.getBlock(x, y, z), meta, flags); }
  notifyNeighbors(x, y, z, srcId) {
    for (let f = 0; f < 6; f++) {
      const d = FACE_DIR[f];
      const nx = x + d[0], ny = y + d[1], nz = z + d[2];
      if (ny < 0 || ny >= CH_H) continue;
      const nid = this.getBlock(nx, ny, nz);
      const nd = BLOCKS[nid];
      if (nd && nd.onNeighborChange) nd.onNeighborChange(this, nx, ny, nz, this.getMeta(nx, ny, nz), x, y, z, srcId);
    }
  }
  scheduleTick(x, y, z, delay, id) {
    const key = x + ',' + y + ',' + z + ',' + (id === undefined ? this.getBlock(x, y, z) : id);
    if (this.tickPending.has(key)) return;
    this.tickPending.add(key);
    this.tickQueue.push({ x, y, z, id: id === undefined ? this.getBlock(x, y, z) : id, key }, this.time + Math.max(1, delay | 0));
  }

  // ------------------------------------------------------------ tile entities
  getTile(x, y, z) {
    const c = this.getChunk(x >> 4, z >> 4);
    return c ? c.tiles.get((y << 8) | ((z & 15) << 4) | (x & 15)) || null : null;
  }
  markTileChanged(x, z) { const c = this.getChunk(x >> 4, z >> 4); if (c) c.modified = true; }

  // ------------------------------------------------------------ streaming
  spiralOffsets(r) {
    let list = this.offsetCache.get(r);
    if (list) return list;
    list = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) list.push([dx, dz, dx * dx + dz * dz]);
    list.sort((a, b) => a[2] - b[2]);
    this.offsetCache.set(r, list);
    return list;
  }
  updateStreaming(px, pz, renderDistance) {
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    const R = renderDistance + 1;
    this.loadRadius = R;
    const maxInFlight = 8;
    let inFlight = this.gen.pending + this.storageLoads();
    for (const [dx, dz, d2] of this.spiralOffsets(R)) {
      if (inFlight >= maxInFlight) break;
      if (d2 > (R + 0.5) * (R + 0.5)) continue;
      const cx = pcx + dx, cz = pcz + dz;
      const key = ckey(cx, cz);
      if (this.chunks.has(key) || this.requested.has(key)) continue;
      this.requestChunk(cx, cz, key);
      inFlight++;
    }
    // unload far chunks
    const U = R + 2;
    for (const c of this.chunks.values()) {
      if (Math.abs(c.cx - pcx) > U || Math.abs(c.cz - pcz) > U) this.unloadChunk(c);
    }
  }
  storageLoads() { let n = 0; for (const v of this.requested.values()) if (v === 'load') n++; return n; }
  requestChunk(cx, cz, key) {
    if (this.storage && this.savedKeys.has(key)) {
      this.requested.set(key, 'load');
      this.storage.loadChunk(this.info.id, key + this.keyBase).then((rec) => {
        if (!this.requested.has(key)) return;
        if (rec) { this.requested.delete(key); this.installChunk(rec, true); }
        else { this.requested.set(key, 'gen'); this.gen.request(cx, cz); }
      }).catch((e) => { console.error(e); this.requested.set(key, 'gen'); this.gen.request(cx, cz); });
    } else {
      this.requested.set(key, 'gen');
      this.gen.request(cx, cz);
    }
  }
  onGenerated(m) {
    const key = ckey(m.cx, m.cz);
    if (this.requested.get(key) !== 'gen') return;    // no longer wanted
    this.requested.delete(key);
    if (this.chunks.has(key)) return;
    this.installChunk(m, false);
  }
  installChunk(m, fromSave) {
    const c = new Chunk(m.cx, m.cz);
    c.blocks = m.blocks instanceof Uint8Array ? m.blocks : new Uint8Array(m.blocks);
    c.meta = m.meta instanceof Uint8Array ? m.meta : new Uint8Array(m.meta);
    c.biomes = m.biomes instanceof Uint8Array ? m.biomes : new Uint8Array(m.biomes);
    c.modified = !!fromSave;
    this.chunks.set(c.key, c);
    this._lastChunk = null;
    // tile entities
    if (m.tiles) for (const t of m.tiles) {
      const te = tileEntityFromData(t);
      if (te) c.tiles.set((te.y << 8) | ((te.z & 15) << 4) | (te.x & 15), te);
    }
    // ensure every tile block has its entity
    this.light.initChunk(c);
    c.markAllDirty();
    // neighbours' meshes may now see this chunk
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.getChunk(c.cx + dx, c.cz + dz);
      if (n && n !== c) { n.anyDirty = true; n.dirty.fill(1); }
    }
    if (m.ticks) for (const t of m.ticks) this.scheduleTick(t[0], t[1], t[2], 2 + this.rng.nextInt(20));
    // initial creatures
    if (!this.menu && this.onChunkEntities) this.onChunkEntities(c, m, fromSave);
    this.chunksLoadedCount++;
    if (this.onChunkLoaded) this.onChunkLoaded(c);
  }
  unloadChunk(c) {
    if (this.onChunkUnload) this.onChunkUnload(c);
    if (c.modified && !this.menu && this.storage) { this.saveChunk(c); }
    if (c.render && this.game && this.game.renderer) this.game.renderer.freeChunk(c);
    this.chunks.delete(c.key);
    this._lastChunk = null;
  }
  saveChunk(c) {
    if (!this.storage || this.menu) return;
    const rec = serializeChunk(c);
    this.savedKeys.add(c.key);
    c.modified = false;
    this.storage.saveChunk(this.info.id, c.key + this.keyBase, rec);
  }
  saveAll() {
    for (const c of this.chunks.values()) if (c.modified) this.saveChunk(c);
  }
  dispose() {
    this.gen.terminate();
    if (this.game && this.game.renderer) for (const c of this.chunks.values()) this.game.renderer.freeChunk(c);
    this.chunks.clear();
  }

  // ------------------------------------------------------------ time
  celestialAngle(partial) {
    const t = (this.dayTime % 24000) + (partial || 0);
    let f = t / 24000 - 0.25;
    if (f < 0) f += 1; if (f > 1) f -= 1;
    const f1 = f;
    f = 1 - (Math.cos(f * Math.PI) + 1) / 2;
    return f1 + (f - f1) / 3;
  }
  moonPhase() { return Math.floor(this.dayTime / 24000) % 8; }
  sunBrightness(partial) {
    const a = this.celestialAngle(partial);
    let f = 1 - (Math.cos(a * TAU) * 2 + 0.2);
    f = clamp(f, 0, 1);
    f = 1 - f;
    f *= 1 - this.rainStrength * 5 / 16;
    f *= 1 - this.thunderStrength * 5 / 16;
    return f * 0.8 + 0.2;
  }
  isDaytime() { return !this.dim && this.skyDarken() < 4; }

  // ------------------------------------------------------------ entities
  addEntity(e) {
    e.id = this.nextEntityId++;
    e.world = this;
    this.entities.push(e);
    this.entityMap.set(e.id, e);
    if (e.onAdded) e.onAdded();
    return e;
  }
  removeEntity(e) { e.removed = true; }
  entitiesInBox(x0, y0, z0, x1, y1, z1, filter) {
    const out = [];
    for (const e of this.entities) {
      if (e.removed) continue;
      if (e.x + e.w / 2 < x0 || e.x - e.w / 2 > x1 || e.y + e.h < y0 || e.y > y1 || e.z + e.w / 2 < z0 || e.z - e.w / 2 > z1) continue;
      if (filter && !filter(e)) continue;
      out.push(e);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Chunk (de)serialisation for saving
// ---------------------------------------------------------------------------
function serializeChunk(c) {
  const tiles = [];
  for (const te of c.tiles.values()) { const d = te.save ? te.save() : null; if (d) tiles.push(d); }
  return {
    cx: c.cx, cz: c.cz, v: 1,
    blocks: rleEncode(c.blocks), meta: rleEncode(c.meta), biomes: c.biomes.slice(),
    tiles,
  };
}
function deserializeChunk(rec) {
  return {
    cx: rec.cx, cz: rec.cz,
    blocks: rleDecode(rec.blocks instanceof Uint8Array ? rec.blocks : new Uint8Array(rec.blocks), 32768),
    meta: rleDecode(rec.meta instanceof Uint8Array ? rec.meta : new Uint8Array(rec.meta), 32768),
    biomes: rec.biomes instanceof Uint8Array ? rec.biomes : new Uint8Array(rec.biomes),
    tiles: rec.tiles || [],
    entities: [],
  };
}
