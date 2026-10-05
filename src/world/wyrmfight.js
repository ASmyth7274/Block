'use strict';
// ---------------------------------------------------------------------------
// The fight for the Great Isle, and what comes after it. While the Starwyrm
// lives the Star Well is dry, and there is no way home but to fall. When it
// dies the Well fills with light; the first time, its egg is left on the
// Well's pillar; and a star gateway opens out at the isle's edge, across the
// gulf to the Drift Isles (one more for every time it falls). Set four star
// crystals round the Well's rim and the crystals on the spires return, and
// so does the wyrm.
// ---------------------------------------------------------------------------
const Wyrm = (() => {
  const GATES = 20, GATE_R = 96;
  let bar = null;
  const st = (w) => Isles.state(w.info);
  const wellY = (w) => (w.localGen && w.localGen.wellTop ? w.localGen.wellTop() : 60);
  const gateY = (w) => wellY(w) + 13;
  function find(w) { for (const e of w.entities) if (e.type === 'starwyrm' && !e.removed) return e; return null; }
  function firstKill(w) { return !st(w).kills; }

  function tick(game) {
    const w = game.world;
    bar = null;
    if (!w || w.menu) return;
    // an eclipse comes on slowly and lifts more slowly still
    const want = w.eclipseUntil && w.time < w.eclipseUntil ? 1 : 0, k = w.eclipseK || 0;
    w.eclipseK = k + (want - k) * (want ? 0.02 : 0.008);
    if (w.dim !== DIM_ISLES) return;
    const s = st(w), p = game.player, e = find(w);
    if (e && p && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < 230 * 230) bar = { name: 'Starwyrm', frac: e.health / e.maxHealth, dying: !!e.dead };
    if (w.time % 10) return;
    if (e && !e.dead) s.wyrm = { health: Math.ceil(e.health) };
    if (!s.ritual) Isles.setWell(w, !!s.wyrmDead);
    if (!s.wyrmDead && !e && !s.ritual && p && !p.dead && w.isLoaded(0, 0) && p.x * p.x + p.z * p.z < 260 * 260) spawn(game, false);
    if (s.ritual) ritualTick(game, s);
    buildPending(game, s);
  }
  function spawn(game, rising) {
    const w = game.world, s = st(w), y = wellY(w), e = new Starwyrm(w), a = Math.random() * TAU;
    e.center = [0.5, y, 0.5];
    if (rising) {
      // up out of the void beside the isle
      e.setPos(Math.cos(a) * 105, y - 45, Math.sin(a) * 105);
      e.dir = [-Math.cos(a) * 0.45, 0.8, -Math.sin(a) * 0.45];
      e.speed = 0.6;
      e.setPhase('rise');
    } else {
      e.setPos(Math.cos(a) * 75, y + 36, Math.sin(a) * 75);
      e.dir = [-Math.sin(a), 0, Math.cos(a)];
      e.setPhase('circle');
      if (s.wyrm && s.wyrm.health > 0) e.health = Math.min(e.maxHealth, s.wyrm.health);
      game.hud.showAction('§dSomething vast is circling the spires...');
    }
    const l = Math.hypot(e.dir[0], e.dir[1], e.dir[2]); e.dir = e.dir.map((v) => v / l);
    w.addEntity(e);
    return e;
  }
  function eclipse(game, ticks) { const w = game.world; w.eclipseUntil = w.time + ticks; }

  // ---------------------------------------------------------------- its fall
  function slain(game, e) {
    const w = game.world, s = st(w), first = !s.kills;
    s.wyrmDead = true; s.kills = (s.kills || 0) + 1; s.wyrm = null;
    w.eclipseUntil = 0;
    Isles.setWell(w, true);
    // the first time, it leaves its egg on the Well's pillar
    const y = wellY(w) + 5;
    if (first && w.getBlock(0, y, 0) === 0) w.setBlock(0, y, 0, B.WYRM_EGG, 0);
    openGateway(game);
    game.achieve('wyrm');
    game.hud.showTitle('§dThe Starwyrm falls', 'The Star Well fills with light');
    void e;
  }
  // a crystal broke: if the wyrm was drinking from it, the backlash burns it
  function crystalLost(game, crystal, src) {
    const w = game.world;
    if (!w) return;
    const e = find(w);
    if (e && !e.dead && e.healer === crystal) {
      e.healer = null;
      const by = src && src.entity && src.entity.type === 'player' ? src.entity : null;
      e.damage(e.parts[0] || { idx: 0, x: e.x, y: e.y, z: e.z, h: 1, w: 1 }, 10, { type: 'crystal', entity: by });
      e.roar(game);
    }
    const s = w.dim === DIM_ISLES ? st(w) : null;
    if (s && s.ritual && crystal.ritual) {
      s.ritual = null;
      for (const c of rimCrystals(w)) { c.ritual = false; c.beamTo = null; }
      game.hud.showAction('§7The light gutters out.');
    }
  }

  // ---------------------------------------------------------------- the gateways
  function order(w) {
    const o = []; for (let i = 0; i < GATES; i++) o.push(i);
    let h = ((w.seed | 0) ^ 0x5bd1e995) >>> 0;
    for (let i = GATES - 1; i > 0; i--) { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; const j = h % (i + 1); const t = o[i]; o[i] = o[j]; o[j] = t; }
    return o;
  }
  function innerSpot(w, k) { const a = TAU * k / GATES; return [Math.round(Math.cos(a) * GATE_R), gateY(w), Math.round(Math.sin(a) * GATE_R)]; }
  function exitSpot(w, k) { return w.localGen.exitGateSpot ? w.localGen.exitGateSpot(k, GATES) : [Math.round(Math.cos(TAU * k / GATES) * 880), 60, Math.round(Math.sin(TAU * k / GATES) * 880)]; }
  function openGateway(game) {
    const w = game.world, s = st(w);
    s.gateways = s.gateways || [];
    const k = order(w).find((i) => s.gateways.indexOf(i) < 0);
    if (k === undefined) return;
    s.gateways.push(k);
    queue(s, 'inner', k);
    const [x, y, z] = innerSpot(w, k);
    s.flare = { x, y, z, until: w.time + 200 };
    game.audio.play('gateway_open', 0.9, 1);
  }
  function queue(s, kind, k) { s.pending = s.pending || []; if (!s.pending.some((q) => q.kind === kind && q.k === k)) s.pending.push({ kind, k }); }
  function buildPending(game, s) {
    const w = game.world;
    if (s.flare && w.time < s.flare.until && game.settings.particles !== 'minimal') {
      // a column of light where a new gateway has opened
      const f = s.flare, L = game.particles.layer('particle_glint');
      for (let i = 0; i < 12; i++) game.particles.add({ x: f.x + 0.5 + (Math.random() - 0.5) * 0.6, y: f.y + Math.random() * 40, z: f.z + 0.5 + (Math.random() - 0.5) * 0.6, vx: 0, vy: 0.3, vz: 0, size: 0.18, life: 30, layer: L, r: 1, g: 0.85, b: 0.55, collide: false, bright: true, fade: true });
    }
    if (!s.pending || !s.pending.length) return;
    s.pending = s.pending.filter((q) => {
      const [x, y, z] = q.kind === 'inner' ? innerSpot(w, q.k) : exitSpot(w, q.k);
      for (const [dx, dz] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) if (!w.isLoaded(x + dx, z + dz)) return true;
      if (q.kind === 'inner') buildInner(w, x, y, z); else buildExit(w, x, y, z);
      return false;
    });
  }
  // out over the gulf at the isle's edge: a gateway on a little bedrock floor
  function buildInner(w, x, y, z) {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      w.setBlock(x + dx, y - 1, z + dz, B.BEDROCK, 0);
      for (let dy = 0; dy <= 2; dy++) if (dx || dz) { if (w.getBlock(x + dx, y + dy, z + dz) !== 0) w.setBlock(x + dx, y + dy, z + dz, 0, 0); }
    }
    w.setBlock(x, y, z, B.STAR_GATEWAY, 0);
    w.setBlock(x, y + 1, z, B.BEDROCK, 0);
  }
  // on the crown of a drift isle: a gateway you can walk into
  function buildExit(w, x, y, z) {
    w.setBlock(x, y - 1, z, B.BEDROCK, 0);
    w.setBlock(x, y, z, B.STAR_GATEWAY, 0);
    w.setBlock(x, y + 1, z, B.BEDROCK, 0);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let dy = 0; dy <= 1; dy++) if (w.getBlock(x + dx, y + dy, z + dz) !== 0) w.setBlock(x + dx, y + dy, z + dz, 0, 0);
  }
  // stepped into a gateway: across the gulf, one way or the other
  function travel(game, bx, by, bz) {
    const w = game.world, s = st(w);
    const a = Math.atan2(bz + 0.5, bx + 0.5), r = Math.hypot(bx + 0.5, bz + 0.5);
    const k = ((Math.round(a / TAU * GATES) % GATES) + GATES) % GATES;
    game.audio.play('gateway_travel', 0.9, 1);
    if (r < 400) {
      const [x, y, z] = exitSpot(w, k), ux = Math.cos(a), uz = Math.sin(a);
      queue(s, 'exit', k);
      game.holdPlayer(x + 0.5 + Math.round(ux * 2), y, z + 0.5 + Math.round(uz * 2), Math.atan2(-ux, -uz));
      game.achieve('gateway');
    } else {
      s.gateways = s.gateways || [];
      if (s.gateways.indexOf(k) < 0) s.gateways.push(k);
      queue(s, 'inner', k);
      const [x, y, z] = innerSpot(w, k), ka = TAU * k / GATES, ox = -Math.round(Math.cos(ka)), oz = -Math.round(Math.sin(ka));
      game.holdPlayer(x + ox + 0.5, y, z + oz + 0.5, Math.atan2(Math.cos(ka), Math.sin(ka)));
    }
    buildPending(game, s);
  }

  // ---------------------------------------------------------------- calling it back
  function rimCrystals(w) {
    const y = wellY(w);
    return w.entities.filter((e) => e.type === 'star_crystal' && !e.removed && Math.hypot(e.x - 0.5, e.z - 0.5) < 4.6 && Math.abs(e.y - (y + 2)) < 1.6);
  }
  function crystalPlaced(game) {
    const w = game.world;
    if (!w || w.dim !== DIM_ISLES) return;
    const s = st(w);
    if (!s.wyrmDead || s.ritual) return;
    const rim = rimCrystals(w);
    if (rim.length < 4) return;
    for (const c of rim) c.ritual = true;
    s.ritual = { t: 0 };
    game.hud.showAction('§dThe Star Well drinks the light of the crystals...');
    game.audio.play('wyrm_ritual', 1, 1);
  }
  function ritualTick(game, s) {
    const w = game.world, r = s.ritual, y = wellY(w);
    r.t += 10;
    const rim = rimCrystals(w);
    for (const c of rim) { c.ritual = true; c.beamTo = [0.5, y + 46, 0.5]; }
    // the crystals on the spires come back, one by one
    if (r.t >= 60 && r.t < 160) {
      const spires = w.localGen.spireList ? w.localGen.spireList() : [];
      const sp = spires[(r.t - 60) / 10];
      if (sp) restoreSpire(game, sp);
    }
    if (r.t === 160) eclipse(game, 200);
    if (r.t >= 230) {
      for (const c of rim) {
        c.removed = true;
        game.audio.play('crystal_break', 1.6, 1.1, c.x, c.y + 1, c.z);
        if (game.settings.particles !== 'minimal') for (let i = 0; i < 30; i++) game.particles.sparkle(c.x, c.y + 1, c.z, 0.85, 0.6, 1, 1, 2);
      }
      s.ritual = null; s.wyrmDead = false; s.wyrm = null;
      Isles.setWell(w, false);
      const e = spawn(game, true);
      e.roar(game);
      game.hud.showTitle('', '§dThe Starwyrm returns');
    }
  }
  function restoreSpire(game, sp) {
    const w = game.world;
    if (!w.isLoaded(sp.x, sp.z)) return;
    const cx = sp.x + 0.5, cz = sp.z + 0.5;
    if (w.getBlock(sp.x, sp.h, sp.z) !== B.BEDROCK) w.setBlock(sp.x, sp.h, sp.z, B.BEDROCK, 0);
    for (let yy = sp.h + 1; yy <= sp.h + 2; yy++) if (w.getBlock(sp.x, yy, sp.z) !== 0) w.setBlock(sp.x, yy, sp.z, 0, 0);
    if (sp.caged) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) === 2 || Math.abs(dz) === 2) for (let yy = sp.h; yy <= sp.h + 3; yy++) if (w.getBlock(sp.x + dx, yy, sp.z + dz) === 0) w.setBlock(sp.x + dx, yy, sp.z + dz, B.IRON_BARS, 0);
      if (w.getBlock(sp.x + dx, sp.h + 4, sp.z + dz) === 0) w.setBlock(sp.x + dx, sp.h + 4, sp.z + dz, B.IRON_BARS, 0);
    }
    if (!w.entities.some((e) => e.type === 'star_crystal' && !e.removed && Math.abs(e.x - cx) < 1 && Math.abs(e.z - cz) < 1 && Math.abs(e.y - (sp.h + 1)) < 2)) game.spawnEntity(new StarCrystal(w, cx, sp.h + 1, cz));
    game.audio.play('crystal_hum', 2, 1.3, cx, sp.h + 2, cz);
    if (game.settings.particles !== 'minimal') for (let i = 0; i < 24; i++) game.particles.sparkle(cx, sp.h + 2, cz, 0.85, 0.6, 1, 1, 2);
  }

  return {
    tick, spawn, slain, eclipse, crystalLost, crystalPlaced, travel, firstKill, find,
    bar: () => bar, fighting: () => !!bar && !bar.dying,
    GATES, innerSpot, exitSpot, order,
  };
})();
