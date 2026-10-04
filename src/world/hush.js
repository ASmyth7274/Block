'use strict';
// ---------------------------------------------------------------------------
// The Hush: the listening dark deep under the world. Everything you do makes
// a little noise - footsteps (unless you sneak), digging, building, doors,
// arrows landing, explosions. Hush sensors hear it within eight blocks, glow,
// and power any ember circuit beside them. Shriekers grown wild in the Hush
// cry out when they hear you, dimming your sight and raising the warning
// level; at the fourth warning, the Listener digs its way up to find you.
// Wool muffles everything.
// ---------------------------------------------------------------------------
const Hush = (() => {
  const LOUDNESS = { step: 6, land: 10, break: 14, place: 12, use: 10, projectile: 8, explode: 40, eat: 6, drop: 4, fork: 16, hit: 10 };
  const muffled = (w, x0, y0, z0, x1, y1, z1) => {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) * 2);
    for (let i = 1; i < n; i++) {
      const id = w.getBlock(Math.floor(x0 + dx * i / n), Math.floor(y0 + dy * i / n), Math.floor(z0 + dz * i / n));
      if (id === B.WOOL || id === B.CARPET) return true;
    }
    return false;
  };
  // which loaded chunks hold sensors or shriekers, and how many Listeners are about:
  // refreshed every couple of seconds so wandering creatures can skip the work
  let hot = new Set(), listeners = 0;
  const ckey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
  function scan(w) {
    hot = new Set(); listeners = 0;
    for (const c of w.chunks.values()) {
      if (!c.tiles.size) continue;
      for (const te of c.tiles.values()) if (te.type === 'sensor' || te.type === 'shrieker') { hot.add(ckey(c.cx, c.cz)); break; }
    }
    for (const e of w.entities) if (e.type === 'listener' && !e.removed) listeners++;
  }
  // something made a sound at (x,y,z); src is whoever made it (a player, a creature, or null)
  function vibrate(game, x, y, z, kind, src) {
    const w = game.world;
    if (!w || w.menu || w.dim || !game.player) return;
    if (src && src.type === 'player' && (src.gameMode === 'spectator' || src.dead)) return;
    const loud = LOUDNESS[kind] || 8;
    const cx = Math.floor(x) >> 4, cz = Math.floor(z) >> 4;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = w.getChunk(cx + dx, cz + dz);
      if (!c || !c.tiles.size) continue;
      for (const te of c.tiles.values()) {
        if (te.type !== 'sensor' && te.type !== 'shrieker') continue;
        const d2 = (te.x + 0.5 - x) ** 2 + (te.y + 0.5 - y) ** 2 + (te.z + 0.5 - z) ** 2;
        if (d2 > 64 || muffled(w, x, y + 0.3, z, te.x + 0.5, te.y + 0.5, te.z + 0.5)) continue;
        if (te.type === 'sensor') sense(game, te, x, y, z, src);
        else if (src && src.type === 'player') shriek(game, te, src);
      }
    }
    if (listeners) for (const e of w.entities) if (e.type === 'listener' && e !== src && !e.dead && !e.removed && e.distanceSq(x, y, z) < (loud + 10) ** 2) e.hear(game, x, y, z, loud, src);
  }
  // creatures' footsteps: only worth listening for near sensors or a Listener
  function step(game, e) {
    if ((!listeners && !hot.size) || !e.onGround || e.type === 'listener') return;
    const dx = e.x - e.px, dz = e.z - e.pz;
    if (dx === 0 && dz === 0) return;
    e.stepAcc = (e.stepAcc || 0) + Math.sqrt(dx * dx + dz * dz);
    if (e.stepAcc < 1.8) return;
    e.stepAcc = 0;
    const id = game.world.getBlock(Math.floor(e.x), Math.floor(e.y - 0.2), Math.floor(e.z));
    if (id === B.WOOL || id === B.CARPET) return;
    const cx = Math.floor(e.x) >> 4, cz = Math.floor(e.z) >> 4;
    let near = listeners > 0;
    for (let i = -1; i <= 1 && !near; i++) for (let j = -1; j <= 1 && !near; j++) if (hot.has(ckey(cx + i, cz + j))) near = true;
    if (near) vibrate(game, e.x, e.y, e.z, 'step', e);
  }
  function sense(game, te, x, y, z, src) {
    const w = game.world;
    if (te.cool > w.time) return;
    te.cool = w.time + 10;
    if (w.getBlock(te.x, te.y, te.z) !== B.HUSH_SENSOR) return;
    w.setBlock(te.x, te.y, te.z, B.HUSH_SENSOR, 1);
    const c = w.getChunkAt(te.x, te.z);
    if (c) c.tiles.set((te.y << 8) | ((te.z & 15) << 4) | (te.x & 15), te);
    w.scheduleTick(te.x, te.y, te.z, 40, B.HUSH_SENSOR);
    game.audio.play('hush_click', 0.8, 0.9 + Math.random() * 0.2, te.x + 0.5, te.y + 0.5, te.z + 0.5);
    // a ripple runs from the sound to the sensor
    if (game.settings.particles !== 'minimal') {
      const L = game.particles.layer('particle_glint');
      for (let i = 0; i < 10; i++) {
        const f = i / 9;
        game.particles.add({ x: x + (te.x + 0.5 - x) * f, y: y + 0.4 + (te.y + 0.7 - y - 0.4) * f, z: z + (te.z + 0.5 - z) * f, vx: 0, vy: 0, vz: 0, size: 0.07, life: 6 + i, layer: L, r: 0.25, g: 0.9, b: 0.85, collide: false, bright: true, fade: true });
      }
    }
    // the wild shriekers nearby take up the cry
    if (src && src.type === 'player') {
      const cx = te.x >> 4, cz = te.z >> 4;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const cc = w.getChunk(cx + dx, cz + dz); if (!cc) continue;
        for (const s of cc.tiles.values()) if (s.type === 'shrieker' && (s.x - te.x) ** 2 + (s.y - te.y) ** 2 + (s.z - te.z) ** 2 <= 64) shriek(game, s, src);
      }
    }
  }
  function state(info) { if (!info.hush) info.hush = { level: 0, t: 0 }; return info.hush; }
  function shriek(game, te, player) {
    const w = game.world;
    if (!player || player.dead || !player.survivalLike || w.getBlock(te.x, te.y, te.z) !== B.HUSH_SHRIEKER) return;
    const st = state(w.info);
    if (te.cool > w.time || st.cool > w.time) return;
    te.cool = w.time + 200; st.cool = w.time + 120;
    game.audio.play('hush_shriek', 2.2, 0.9 + Math.random() * 0.15, te.x + 0.5, te.y + 0.5, te.z + 0.5);
    if (game.settings.particles !== 'minimal') {
      const L = game.particles.layer('particle_glint');
      for (let r = 0; r < 4; r++) for (let i = 0; i < 16; i++) {
        const a = i / 16 * TAU;
        game.particles.add({ x: te.x + 0.5 + Math.cos(a) * 0.3, y: te.y + 0.6 + r * 0.25, z: te.z + 0.5 + Math.sin(a) * 0.3, vx: Math.cos(a) * 0.05, vy: 0.08, vz: Math.sin(a) * 0.05, size: 0.08, life: 18 + r * 4, layer: L, r: 0.3, g: 0.95, b: 0.9, collide: false, bright: true, fade: true });
      }
    }
    if (!te.wild) return;
    // the dark closes in, and the warnings mount
    for (const p of [game.player]) if (p && !p.dead && p.distanceSq(te.x, te.y, te.z) < 40 * 40) Brewing.addEffect(p, 'darkness', 260, 0);
    if (w.time - st.t > 12000) st.level = 0;
    st.level = Math.min(4, st.level + 1); st.t = w.time;
    const msg = ['', '§3Something stirs below...', '§3It is coming closer.', '§3It can hear you.', '§3It is here.'][st.level];
    if (msg) game.hud.showAction(msg);
    if (st.level >= 4) { summon(game, te.x, te.y, te.z, player); st.level = 2; }
  }
  // the Listener digs its way up near where the cry rang out
  function summon(game, x, y, z, player) {
    const w = game.world;
    for (const e of w.entities) if (e.type === 'listener' && !e.removed && e.distanceSq(x, y, z) < 48 * 48) { e.hear(game, player.x, player.y, player.z, 20, player); return; }
    for (let i = 0; i < 30; i++) {
      const sx = Math.floor(x + (Math.random() - 0.5) * 10), sz = Math.floor(z + (Math.random() - 0.5) * 10);
      for (let sy = Math.floor(y) + 3; sy > Math.floor(y) - 6; sy--) {
        if (!BT.solid[w.getBlock(sx, sy - 1, sz)]) continue;
        let ok = true;
        for (let k = 0; k < 3; k++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const id = w.getBlock(sx + dx, sy + k, sz + dz); if (BT.solid[id] || BT.fluid[id]) ok = false; }
        if (!ok) continue;
        const m = game.spawnMob('listener', sx + 1, sy, sz + 1);
        if (m) { listeners++; m.emerge = 60; m.suspect(player, 60); game.audio.play('listener_emerge', 2.5, 1, sx + 1, sy, sz + 1); }
        return;
      }
    }
  }
  // the keystone: set an Echo Heart in it and the gate wakes
  function useKeystone(game, player, x, y, z) {
    const w = game.world, held = player.inventory.held();
    if (w.getMeta(x, y, z) & 1) return false;
    if (!held || held.id !== ITEM_IDS.echo_heart) { game.hud.showAction('§7The keystone is hollow, as if something once beat inside it.'); return true; }
    if (!player.creative) player.inventory.decrementHeld(1);
    w.setBlock(x, y, z, B.GATE_KEYSTONE, 1);
    openGate(game, x, y, z);
    return true;
  }
  // find the frame behind the keystone and fill it with the Sift's grey light
  function openGate(game, kx, ky, kz) {
    const w = game.world;
    let fz = null;
    for (let dz = 1; dz <= 8 && fz === null; dz++) if (w.getBlock(kx, ky, kz - dz) === B.REINFORCED_DEEPSTONE) fz = kz - dz;
    if (fz === null) return false;
    // the frame: rise to the top bar, then walk out to the sides
    let top = ky; while (top < ky + 24 && w.getBlock(kx, top + 1, fz) !== B.REINFORCED_DEEPSTONE) top++;
    let x0 = kx; while (x0 > kx - 16 && w.getBlock(x0 - 1, ky + 1, fz) !== B.REINFORCED_DEEPSTONE) x0--;
    let x1 = kx; while (x1 < kx + 16 && w.getBlock(x1 + 1, ky + 1, fz) !== B.REINFORCED_DEEPSTONE) x1++;
    for (let x = x0; x <= x1; x++) for (let y = ky + 1; y <= top; y++) if (w.getBlock(x, y, fz) === 0) w.setBlock(x, y, fz, B.SIFT_GATE, 0);
    game.audio.play('sift_gate_open', 3, 1, kx + 0.5, ky + 8, fz + 0.5);
    game.achieve('gate');
    return true;
  }
  // each game tick: the sensors' glow fades, warnings fade, the darkness pulses
  function tick(game) {
    const w = game.world;
    if (!w || w.dim) return;
    if (w.time % 40 === 3) scan(w);
    const st = w.info.hush;
    if (st && st.level > 0 && w.time - st.t > 12000) { st.level--; st.t = w.time; }
  }
  return { vibrate, step, sense, shriek, summon, useKeystone, openGate, tick, state, LOUDNESS, muffled, noteListener: () => { listeners++; } };
})();
