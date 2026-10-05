'use strict';
// ---------------------------------------------------------------------------
// Chunk meshing on worker threads. The main thread copies each dirty section,
// with a one-block border of its neighbours, and hands it to a worker, which
// builds the vertex data and hands it back; the main thread only uploads the
// result. Streaming terrain in then costs the frame almost nothing, and a
// machine with cores to spare (or a phone) keeps its frame rate while flying.
// Where workers cannot be had (an old browser, or the separate source files
// opened straight from disk) meshing carries on, budgeted, on the main thread.
// ---------------------------------------------------------------------------
const MESH_WORKER_MAIN = `
let mesher = null;
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    const face = m.face, index = m.index;
    // the atlas as the mesher sees it: the texture of each block face, textures by name, and the
    // handful of layers it keeps to hand (the grass side overlay and the like)
    const atlas = Object.assign({ face: (id, meta, f) => face[((id << 8) | (meta & 255)) * 6 + f], layer: (n) => (index[n] === undefined ? 0 : index[n]) }, m.consts);
    mesher = new Mesher(atlas);
    mesher.fancy = m.fancy; mesher.smooth = m.smooth;
  } else if (m.type === 'opts') {
    if (mesher) { mesher.fancy = m.fancy; mesher.smooth = m.smooth; }
  } else if (m.type === 'mesh') {
    mesher.ids.set(m.ids); mesher.metas.set(m.metas); mesher.lts.set(m.lts);
    const res = mesher.buildFilled({ cx: m.cx, cz: m.cz, tints: m.tints }, m.sy);
    const tr = [];
    for (let p = 0; p < 3; p++) if (res[p]) tr.push(res[p].buffer);
    self.postMessage({ type: 'done', id: m.id, p0: res[0], p1: res[1], p2: res[2], gates: res.gates || null }, tr);
  }
};
`;

class MeshPool {
  constructor(renderer) {
    this.r = renderer;
    this.workers = []; this.ready = false; this.seq = 0;
    this.inflight = new Map();     // job id -> { c, sy, gen, w, world }
    this.uploads = new Set();      // chunks with freshly built sections to upload
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined') return;
    MeshPool.source((src) => { if (src) this.start(src); });
  }
  // the scripts a mesher needs, read out of this very page
  static source(cb) {
    const files = ['src/core/util.js', 'src/core/blocks.js', 'src/render/mesher.js'];
    // the single-file build: one inline script, each file after a "// ---- path" marker (a file ends
    // where the next file's marker begins, not at a comment of its own that happens to look similar)
    for (const s of document.scripts) {
      const t = s.textContent;
      if (!t || t.indexOf('// ---- src/render/mesher.js') < 0) continue;
      const part = (f) => {
        const a = t.indexOf('\n// ---- ' + f + '\n');
        if (a < 0) return null;
        const next = /\n\/\/ ---- [\w./-]+\.js\n/g;
        next.lastIndex = a + 1;
        const b = next.exec(t);
        return t.slice(a, b ? b.index : t.length);
      };
      const parts = files.map(part);
      cb(parts.every(Boolean) ? parts.join('\n') : null);
      return;
    }
    // the separate files (served over http, or a browser that lets a page read its own folder)
    const parts = []; let left = files.length, failed = false;
    const settle = () => { if (--left === 0) cb(failed ? null : parts.join('\n')); };
    files.forEach((f, i) => {
      try {
        const x = new XMLHttpRequest();
        x.onload = () => { if ((x.status === 200 || x.status === 0) && x.responseText) parts[i] = x.responseText.replace(/^'use strict';\s*/, ''); else failed = true; settle(); };
        x.onerror = () => { failed = true; settle(); };
        x.open('GET', f); x.send();
      } catch (e) { failed = true; settle(); }
    });
  }
  start(src) {
    const r = this.r, atlas = r.atlas;
    // leave a core for the game itself and some for world generation
    const n = Math.max(1, Math.min(IS_MOBILE ? 2 : 4, (navigator.hardwareConcurrency || 4) - 2));
    let url = null;
    try { url = URL.createObjectURL(new Blob(["'use strict';\n" + src + '\n' + MESH_WORKER_MAIN], { type: 'application/javascript' })); } catch (e) { return; }
    const index = {}, consts = {};
    for (const k in atlas.index) index[k] = atlas.index[k];
    for (const k of Object.keys(atlas)) if (/^L_/.test(k) && typeof atlas[k] === 'number') consts[k] = atlas[k];
    for (let i = 0; i < n; i++) {
      try {
        const w = new Worker(url);
        w.load = 0;
        w.onmessage = (e) => this.done(w, e.data);
        w.onerror = (e) => { console.warn('mesh worker failed, meshing on the main thread instead:', e.message || e); this.fail(); };
        w.postMessage({ type: 'init', face: atlas.faceTex, index, consts, fancy: r.mesher.fancy, smooth: r.mesher.smooth });
        this.workers.push(w);
      } catch (e) { break; }
    }
    this.ready = this.workers.length > 0;
  }
  // a worker broke: everything goes back to the main thread, and nothing in flight is lost
  fail() {
    for (const w of this.workers) w.terminate();
    this.workers = []; this.ready = false;
    for (const j of this.inflight.values()) { j.c.dirty[j.sy] = 1; j.c.anyDirty = true; j.c.meshPending = 0; }
    this.inflight.clear();
  }
  setOptions(fancy, smooth) { for (const w of this.workers) w.postMessage({ type: 'opts', fancy, smooth }); }
  // once a frame: put finished sections in place, then hand out more work
  update(world, budgetMs) {
    const r = this.r, t0 = performance.now();
    for (const c of this.uploads) r.finishChunk(c);
    this.uploads.clear();
    const cap = this.workers.length * (IS_MOBILE ? 3 : 4);
    if (this.inflight.size >= cap) return 0;
    const pcx = Math.floor(r.camX) >> 4, pcz = Math.floor(r.camZ) >> 4, rd = r.game.settings.renderDistance;
    const list = [];
    for (const c of world.chunks.values()) {
      if (!c.anyDirty) continue;
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (Math.abs(dx) > rd || Math.abs(dz) > rd) continue;
      if (!r.neighborsLoaded(world, c)) continue;
      list.push([c, dx * dx + dz * dz]);
    }
    list.sort((a, b) => a[1] - b[1]);
    let sent = 0;
    for (const [c] of list) {
      r.prepareChunk(world, c);
      for (let sy = 0; sy < CH_SECTIONS; sy++) {
        if (!c.dirty[sy]) continue;
        if (this.inflight.size >= cap || (sent > 0 && performance.now() - t0 > budgetMs)) return sent;
        c.dirty[sy] = 0;
        const gen = ++c.meshGen[sy];
        r.sectionVis(c, sy, c.render.vis, sy * 6);
        r.visEpoch++;
        // an empty section needs no worker
        if (!r.mesher.hasBlocks(c, sy)) { this.apply(c, sy, null); continue; }
        r.mesher.fill(world, c, sy);
        let w = this.workers[0];
        for (const o of this.workers) if (o.load < w.load) w = o;
        const id = ++this.seq;
        w.load++; c.meshPending = (c.meshPending || 0) + 1;
        this.inflight.set(id, { c, sy, gen, w, world });
        const ids = r.mesher.ids.slice(), metas = r.mesher.metas.slice(), lts = r.mesher.lts.slice();
        w.postMessage({ type: 'mesh', id, cx: c.cx, cz: c.cz, sy, ids, metas, lts, tints: c.tints }, [ids.buffer, metas.buffer, lts.buffer]);
        sent++;
      }
      c.anyDirty = false;
    }
    return sent;
  }
  done(w, m) {
    if (m.type !== 'done') return;
    w.load = Math.max(0, w.load - 1);
    const j = this.inflight.get(m.id);
    if (!j) return;
    this.inflight.delete(m.id);
    const c = j.c;
    c.meshPending = Math.max(0, (c.meshPending || 1) - 1);
    // stale: the chunk has gone, or the section has changed again since
    if (!c.render || j.world.getChunk(c.cx, c.cz) !== c || c.meshGen[j.sy] !== j.gen) return;
    let res = null;
    if (m.p0 || m.p1 || m.p2) { res = [m.p0, m.p1, m.p2]; if (m.gates) res.gates = m.gates; }
    this.apply(c, j.sy, res);
  }
  apply(c, sy, res) {
    const r = c.render, old = r.sect[sy];
    r.sect[sy] = res;
    if (!c.touched) c.touched = [false, false, false];
    for (let p = 0; p < 3; p++) if ((old && old[p]) || (res && res[p])) c.touched[p] = true;
    this.uploads.add(c);
  }
}
