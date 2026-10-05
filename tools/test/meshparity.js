// Mesh workers and the main thread must agree. Run: node tools/test/run.js tools/test/meshparity.js <out dir>
// the same sections meshed on a worker and on the main thread come out identical, byte for byte: for
// natural terrain, and for every kind of block in several states (spaced out, and packed together so
// that fences, panes, wires and the like join up), with fancy graphics and with fast
module.exports = async ({ page, wait, shot, eval: ev, log, until }) => {
  await until(() => window.game && game.menuCam && game.menuCam.ready, 30000);
  log('pool ready', await until(() => game.renderer.pool.ready, 20000));
  await ev(() => { game.settings.renderDistance = 4; });
  await ev(() => game.createWorld({ name: 'Parity', seed: 777, gameMode: 'creative', worldType: 'default', structures: true, cheats: true, difficulty: 0 }));
  await until(() => game.player && !game.loading, 90000);
  log('placed', await ev(() => {
    const w = game.world, p = game.player, x0 = Math.floor(p.x) - 48, z0 = Math.floor(p.z) - 28, y0 = 160;
    const ids = [...new Set(Object.values(B))].filter((id) => id > 0 && BLOCKS[id]).sort((a, b) => a - b);
    let k = 0, failed = 0;
    for (const id of ids) for (const meta of [0, 1, 2, 3, 5, 8, 12]) {
      const gx = k % 48, gz = Math.floor(k / 48); k++;
      try { w.setBlock(x0 + gx * 2, y0, z0 + gz * 2, id, meta); w.setBlock(x0 + gx, y0 - 12, z0 + gz, id, meta); } catch (e) { failed++; }
    }
    // grass under snow, and grass open to the sky
    w.setBlock(x0, y0 + 6, z0, B.GRASS, 0); w.setBlock(x0, y0 + 7, z0, B.SNOW_LAYER, 0);
    w.setBlock(x0 + 3, y0 + 6, z0, B.GRASS, 0);
    window.__G = { x0, z0, y0, pairs: k, ids: ids.length, failed };
    return JSON.stringify(window.__G);
  }));
  await wait(3000);
  const compare = (label) => ev(async (label) => {
    const r = game.renderer, w = game.world, wk = r.pool.workers[0];
    const waiters = new Map(), orig = wk.onmessage;
    wk.onmessage = (e) => { const m = e.data, f = waiters.get(m.id); if (f) { waiters.delete(m.id); f(m); } else orig(e); };
    const p = game.player, pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
    let id = 1e9;
    const jobs = [];
    for (const c of w.chunks.values()) {
      if (Math.abs(c.cx - pcx) > 4 || Math.abs(c.cz - pcz) > 4 || !r.neighborsLoaded(w, c)) continue;
      r.prepareChunk(w, c);
      for (let sy = 0; sy < CH_SECTIONS; sy++) {
        if (!r.mesher.hasBlocks(c, sy)) continue;
        r.mesher.fill(w, c, sy);
        const ids = r.mesher.ids.slice(), metas = r.mesher.metas.slice(), lts = r.mesher.lts.slice();
        const main = r.mesher.buildFilled(c, sy);
        const mine = { p: [0, 1, 2].map((i) => (main && main[i] ? main[i].slice() : null)), gates: main && main.gates ? JSON.stringify(main.gates) : null };
        const jid = ++id;
        jobs.push(new Promise((res) => waiters.set(jid, (m) => res({ c, sy, mine, m }))));
        wk.postMessage({ type: 'mesh', id: jid, cx: c.cx, cz: c.cz, sy, ids, metas, lts, tints: c.tints }, [ids.buffer, metas.buffer, lts.buffer]);
      }
    }
    // (a worker that has died answers nothing: give up after a minute and say so)
    const out = await Promise.race([Promise.all(jobs), new Promise((res) => setTimeout(() => res(null), 60000))]);
    wk.onmessage = orig;
    if (!out) return label + ': FAILED, the worker stopped answering (' + waiters.size + ' of ' + jobs.length + ' sections outstanding)';
    let sections = 0, quads = 0;
    const bad = [];
    for (const { c, sy, mine, m } of out) {
      sections++;
      for (let i = 0; i < 3; i++) {
        const a = mine.p[i], b = m['p' + i], la = a ? a.length : 0, lb = b ? b.length : 0;
        quads += la / 12;
        let at = la !== lb ? 0 : -1;
        if (at < 0) for (let j = 0; j < la; j++) if (a[j] !== b[j]) { at = j; break; }
        if (at >= 0) bad.push({ cx: c.cx, cz: c.cz, sy, pass: i, la, lb, at });
      }
      if (mine.gates !== (m.gates ? JSON.stringify(m.gates) : null)) bad.push({ cx: c.cx, cz: c.cz, sy, gates: true });
    }
    // the kinds of block in the first sections that differ
    const names = bad.slice(0, 3).map((b) => { const c = w.getChunk(b.cx, b.cz), s = new Set(); for (let i = b.sy << 12, e = i + 4096; i < e; i++) if (c.blocks[i]) s.add(BLOCKS[c.blocks[i]].key); return [...s].slice(0, 14).join(' '); });
    return label + ': sections=' + sections + ' quads=' + quads + ' mismatched=' + bad.length + (bad.length ? ' ' + JSON.stringify(bad.slice(0, 6)) + ' blocks: ' + names.join(' | ') : '');
  }, label);
  log(await compare('fancy'));
  await ev(() => { game.settings.graphics = 'fast'; game.settings.smoothLighting = false; game.applyVideo(); });
  await wait(500);
  log(await compare('fast'));
  await ev(() => { game.settings.graphics = 'fancy'; game.settings.smoothLighting = true; game.applyVideo(); });
  // the grid, from the side
  await ev(() => { const p = game.player, G = __G; p.flying = true; p.onGround = false; p.setPos(G.x0 + 48, G.y0 + 2, G.z0 - 14); p.yaw = Math.PI; p.pitch = -0.35; game.world.dayTime = 6000; });
  await wait(4000);
  await shot('parity_grid');
};
