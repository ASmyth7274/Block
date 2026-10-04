'use strict';
// ---------------------------------------------------------------------------
// World persistence (IndexedDB) and export / import
// ---------------------------------------------------------------------------
class WorldStorage {
  constructor() {
    this.db = null;
    this.mem = null;            // in-memory fallback
    this.pending = new Map();   // store -> Map(key -> value|null)
    this.flushTimer = null;
    this.ready = this.open();
  }
  open() {
    return new Promise((resolve) => {
      let req;
      try { req = indexedDB.open('blocklands', 2); } catch (e) { this.useMemory(); resolve(); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('worlds')) db.createObjectStore('worlds', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks');
        if (!db.objectStoreNames.contains('entities')) db.createObjectStore('entities');
        if (!db.objectStoreNames.contains('maps')) db.createObjectStore('maps');
      };
      req.onsuccess = () => { this.db = req.result; resolve(); };
      req.onerror = () => { console.warn('IndexedDB unavailable, worlds will not persist', req.error); this.useMemory(); resolve(); };
      req.onblocked = () => { console.warn('IndexedDB blocked'); };
    });
  }
  useMemory() { this.mem = { worlds: new Map(), chunks: new Map(), entities: new Map(), maps: new Map() }; this.persistent = false; }
  get isPersistent() { return !!this.db; }
  // ---------------------------------------------------------------- primitives
  tx(store, mode, fn) {
    return this.ready.then(() => new Promise((resolve, reject) => {
      if (this.mem) { try { resolve(fn(null, this.mem[store])); } catch (e) { reject(e); } return; }
      const t = this.db.transaction(store, mode);
      const s = t.objectStore(store);
      let result;
      const r = fn(s, null);
      if (r && typeof r.onsuccess !== 'undefined') r.onsuccess = () => { result = r.result; };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('transaction aborted'));
    }));
  }
  get(store, key) { return this.tx(store, 'readonly', (s, m) => m ? m.get(key) : s.get(key)); }
  put(store, value, key) { return this.tx(store, 'readwrite', (s, m) => { if (m) { m.set(key !== undefined ? key : value.id, value); return; } return key !== undefined ? s.put(value, key) : s.put(value); }); }
  del(store, key) { return this.tx(store, 'readwrite', (s, m) => m ? m.delete(key) : s.delete(key)); }
  keysWithPrefix(store, prefix) {
    return this.tx(store, 'readonly', (s, m) => {
      if (m) return [...m.keys()].filter((k) => String(k).startsWith(prefix));
      return s.getAllKeys(IDBKeyRange.bound(prefix, prefix + '￿'));
    });
  }
  deletePrefix(store, prefix) {
    return this.tx(store, 'readwrite', (s, m) => {
      if (m) { for (const k of [...m.keys()]) if (String(k).startsWith(prefix)) m.delete(k); return; }
      return s.delete(IDBKeyRange.bound(prefix, prefix + '￿'));
    });
  }
  // ---------------------------------------------------------------- worlds
  listWorlds() { return this.tx('worlds', 'readonly', (s, m) => m ? [...m.values()] : s.getAll()).then((r) => (r || []).map((w) => w)); }
  getWorld(id) { return this.get('worlds', id); }
  putWorld(info) { const copy = Object.assign({}, info); delete copy.savedKeys; delete copy.entityKeys; return this.put('worlds', copy); }
  renameWorld(id, name) { return this.getWorld(id).then((w) => { if (!w) return; w.name = name; return this.putWorld(w); }); }
  deleteWorld(id) {
    return Promise.all([this.del('worlds', id), this.deletePrefix('chunks', id + ':'), this.deletePrefix('entities', id + ':'), this.deletePrefix('maps', id + ':')]);
  }
  chunkKeys(id) { return this.keysWithPrefix('chunks', id + ':').then((ks) => new Set(ks.map((k) => Number(String(k).split(':')[1])))); }
  entityKeys(id) { return this.keysWithPrefix('entities', id + ':').then((ks) => new Set(ks.map((k) => Number(String(k).split(':')[1])))); }
  // ---------------------------------------------------------------- chunks (batched writes)
  queue(store, key, value) {
    if (!this.pending.has(store)) this.pending.set(store, new Map());
    this.pending.get(store).set(key, value);
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), 1500);
  }
  flush() {
    clearTimeout(this.flushTimer); this.flushTimer = null;
    const jobs = [];
    for (const [store, map] of this.pending) {
      if (!map.size) continue;
      const entries = [...map.entries()];
      map.clear();
      jobs.push(this.tx(store, 'readwrite', (s, m) => {
        for (const [k, v] of entries) {
          if (m) { if (v === null) m.delete(k); else m.set(k, v); }
          else if (v === null) s.delete(k); else s.put(v, k);
        }
      }).catch((e) => console.error('save failed', e)));
    }
    return Promise.all(jobs);
  }
  saveChunk(worldId, key, rec) { this.queue('chunks', worldId + ':' + key, rec); }
  loadChunk(worldId, key) {
    const k = worldId + ':' + key;
    const p = this.pending.get('chunks');
    if (p && p.has(k)) { const v = p.get(k); return Promise.resolve(v ? deserializeChunk(v) : null); }
    return this.get('chunks', k).then((r) => r ? deserializeChunk(r) : null);
  }
  saveEntities(worldId, key, list) { this.queue('entities', worldId + ':' + key, list); }
  loadEntities(worldId, key) {
    const k = worldId + ':' + key;
    const p = this.pending.get('entities');
    if (p && p.has(k)) return Promise.resolve(p.get(k));
    return this.get('entities', k);
  }

  // ---------------------------------------------------------------- export / import
  async exportWorld(id) {
    await this.flush();
    const info = await this.getWorld(id);
    if (!info) throw new Error('World not found');
    const keys = await this.keysWithPrefix('chunks', id + ':');
    const ekeys = await this.keysWithPrefix('entities', id + ':');
    const parts = [];
    let offset = 0;
    const chunks = [];
    for (const k of keys) {
      const rec = await this.get('chunks', k);
      if (!rec) continue;
      const bl = rec.blocks instanceof Uint8Array ? rec.blocks : new Uint8Array(rec.blocks);
      const mt = rec.meta instanceof Uint8Array ? rec.meta : new Uint8Array(rec.meta);
      const bi = rec.biomes instanceof Uint8Array ? rec.biomes : new Uint8Array(rec.biomes);
      chunks.push({ k: Number(String(k).split(':')[1]), cx: rec.cx, cz: rec.cz, o: offset, b: bl.length, m: mt.length, n: bi.length, t: rec.tiles || [] });
      parts.push(bl, mt, bi);
      offset += bl.length + mt.length + bi.length;
    }
    const entities = [];
    for (const k of ekeys) { const list = await this.get('entities', k); if (list) entities.push({ k: Number(String(k).split(':')[1]), l: list }); }
    // explorer's map regions
    const maps = [];
    for (const k of await this.keysWithPrefix('maps', id + ':')) {
      const rec = await this.get('maps', k);
      if (!rec || !rec.present) continue;
      const pr = rec.present instanceof Uint8Array ? rec.present : new Uint8Array(rec.present), da = rec.data instanceof Uint8Array ? rec.data : new Uint8Array(rec.data);
      maps.push({ rx: rec.rx, rz: rec.rz, o: offset, p: pr.length, d: da.length });
      parts.push(pr, da); offset += pr.length + da.length;
    }
    const meta = Object.assign({}, info); delete meta.id;
    const header = new TextEncoder().encode(JSON.stringify({ format: 'blocklands-world', version: 1, info: meta, chunks, entities, maps }));
    const head = new Uint8Array(12);
    head.set([66, 76, 75, 87]); // BLKW
    new DataView(head.buffer).setUint32(4, 1, true);
    new DataView(head.buffer).setUint32(8, header.length, true);
    const raw = new Blob([head, header, ...parts]);
    if (typeof CompressionStream !== 'undefined') {
      const cs = raw.stream().pipeThrough(new CompressionStream('gzip'));
      return await new Response(cs).blob();
    }
    return raw;
  }
  async importWorld(file) {
    let buf = new Uint8Array(await file.arrayBuffer());
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress world files');
      const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
      buf = new Uint8Array(await new Response(ds).arrayBuffer());
    }
    if (!(buf[0] === 66 && buf[1] === 76 && buf[2] === 75 && buf[3] === 87)) throw new Error('Not a Blocklands world file');
    const dv = new DataView(buf.buffer, buf.byteOffset);
    const hlen = dv.getUint32(8, true);
    const header = JSON.parse(new TextDecoder().decode(buf.subarray(12, 12 + hlen)));
    const base = 12 + hlen;
    const id = newWorldId();
    const info = Object.assign({}, header.info, { id, lastPlayed: Date.now() });
    const existing = await this.listWorlds();
    if (existing.some((w) => w.name === info.name)) info.name = info.name + ' (imported)';
    for (const c of header.chunks) {
      const o = base + c.o;
      const rec = { cx: c.cx, cz: c.cz, v: 1, blocks: buf.slice(o, o + c.b), meta: buf.slice(o + c.b, o + c.b + c.m), biomes: buf.slice(o + c.b + c.m, o + c.b + c.m + c.n), tiles: c.t || [] };
      this.queue('chunks', id + ':' + c.k, rec);
    }
    for (const e of header.entities || []) this.queue('entities', id + ':' + e.k, e.l);
    for (const m of header.maps || []) {
      const o = base + m.o;
      this.queue('maps', id + ':' + m.rx + ',' + m.rz, { rx: m.rx, rz: m.rz, present: buf.slice(o, o + m.p), data: buf.slice(o + m.p, o + m.p + m.d) });
    }
    await this.flush();
    await this.putWorld(info);
    return info;
  }
}
function newWorldId() { return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
