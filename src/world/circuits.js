'use strict';
// ---------------------------------------------------------------------------
// Ember circuits: the classic redstone rules with an ember twist.
//  - Ember wire (ember dust on the ground) carries power 15..0, losing one
//    level per block; it climbs and descends single steps.
//  - Sources: levers, buttons, pressure plates, ember torches (inverters,
//    which burn out if they flicker too fast), blocks of ember and relays.
//  - A source attached to an opaque block "strongly" powers it: the block
//    then feeds wire and machines next to it. Wire running into a block (or
//    lying on it) powers machines next to that block, but not other wire.
//  - Machines: ember lamps, doors, trapdoors, fence gates, TNT, note blocks.
// One redstone tick is two game ticks, as in the classic game.
// ---------------------------------------------------------------------------
// a block (or piston head) sliding between two cells: purely visual, the
// world holds a moving-block placeholder until it arrives. It shoves
// creatures out of the way as it goes.
class MovingBlock extends Entity {
  constructor(world, id, meta, fx, fy, fz, tx, ty, tz, noShove) {
    super(world);
    this.type = 'moving_block';
    this.noShove = !!noShove;
    this.block = id; this.meta = meta;
    this.from = [fx, fy, fz]; this.to = [tx, ty, tz];
    this.w = 1; this.h = 1; this.noGravity = true;
    this.setPos(fx + 0.5, fy, fz + 0.5);
    this.t = 0;
  }
  tick(game) {
    this.px = this.x; this.py = this.y; this.pz = this.z;
    this.t++;
    const k = Math.min(1, this.t / 2), f = this.from, to = this.to;
    this.x = f[0] + (to[0] - f[0]) * k + 0.5; this.y = f[1] + (to[1] - f[1]) * k; this.z = f[2] + (to[2] - f[2]) * k + 0.5;
    this.updateBox();
    if (this.t <= 2 && !this.noShove) {
      const dx = (to[0] - f[0]) * 0.5, dy = (to[1] - f[1]) * 0.5, dz = (to[2] - f[2]) * 0.5;
      const b = this.box;
      const shove = (e) => { e.updateBox(); if (e.box.intersects(b)) { e.move(dx, dy > 0 ? dy + 0.01 : dy, dz); if (dy > 0) { e.vy = Math.max(e.vy, 0); e.fallDistance = 0; } } };
      for (const e of this.world.entities) if (!e.removed && e !== this && e.type !== 'moving_block' && e.type !== 'painting' && e.type !== 'fishhook') shove(e);
      if (game.player && !game.player.dead && !game.player.riding) shove(game.player);
    }
    if (this.t >= 4) this.removed = true;
  }
  save() { return null; }
}

const Circuits = (() => {
  const H = [[0, -1], [0, 1], [-1, 0], [1, 0]];          // N S W E
  const TORCH_ATT = [[0, -1, 0], [-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1]];
  const ATT = CIRCUIT_ATT;
  const IS = new Uint8Array(256), SOURCE = new Uint8Array(256), MACHINE = new Uint8Array(256), CONNECT = new Uint8Array(256);
  for (const id of [B.EMBER_WIRE, B.EMBER_TORCH, B.EMBER_TORCH_OFF, B.LEVER, B.STONE_BUTTON, B.WOOD_BUTTON, B.STONE_PLATE, B.WOOD_PLATE,
    B.EMBER_LAMP, B.EMBER_LAMP_ON, B.RELAY, B.RELAY_ON, B.NOTE_BLOCK, B.EMBER_BLOCK, B.DOOR_WOOD, B.DOOR_IRON, B.TRAPDOOR, B.FENCE_GATE, B.TNT, B.BOOSTER_RAIL, B.DETECTOR_RAIL, B.HUSH_SENSOR]) IS[id] = 1;
  for (const id of [B.EMBER_TORCH, B.LEVER, B.STONE_BUTTON, B.WOOD_BUTTON, B.STONE_PLATE, B.WOOD_PLATE, B.RELAY_ON, B.EMBER_BLOCK, B.DETECTOR_RAIL, B.HUSH_SENSOR]) SOURCE[id] = 1;
  for (const id of [B.EMBER_LAMP, B.EMBER_LAMP_ON, B.NOTE_BLOCK, B.DOOR_WOOD, B.DOOR_IRON, B.TRAPDOOR, B.FENCE_GATE, B.TNT, B.EMBER_TORCH, B.EMBER_TORCH_OFF, B.RELAY, B.RELAY_ON, B.BOOSTER_RAIL]) MACHINE[id] = 1;
  for (const id of [B.EMBER_WIRE, B.EMBER_TORCH, B.EMBER_TORCH_OFF, B.LEVER, B.STONE_BUTTON, B.WOOD_BUTTON, B.STONE_PLATE, B.WOOD_PLATE, B.EMBER_BLOCK, B.DETECTOR_RAIL, B.HUSH_SENSOR]) CONNECT[id] = 1;
  for (const id of [B.PISTON, B.STICKY_PISTON, B.PISTON_HEAD]) { IS[id] = 1; MACHINE[id] = 1; }
  // blocks a piston crushes (dropping them) rather than pushes
  const BREAKS = new Uint8Array(256);
  for (const id of [B.DOOR_WOOD, B.DOOR_IRON, B.BED, B.CACTUS, B.RELAY, B.RELAY_ON, B.LADDER, B.TRAPDOOR, B.LILY_PAD, B.COBWEB, B.PUMPKIN, B.JACK_O_LANTERN, B.MELON]) BREAKS[id] = 1;

  // ------------------------------------------------------------ power queries
  // power the source at s gives to the neighbour in direction (dx,dy,dz)
  function sourcePower(id, meta, dx, dy, dz) {
    switch (id) {
      case B.EMBER_BLOCK: return 15;
      case B.LEVER: case B.STONE_BUTTON: case B.WOOD_BUTTON: return (meta & 8) ? 15 : 0;
      case B.STONE_PLATE: case B.WOOD_PLATE: return (meta & 1) ? 15 : 0;
      case B.DETECTOR_RAIL: return (meta & 8) ? 15 : 0;
      case B.HUSH_SENSOR: return (meta & 1) ? 15 : 0;
      case B.EMBER_TORCH: { const a = TORCH_ATT[meta] || TORCH_ATT[0]; return (dx === a[0] && dy === a[1] && dz === a[2]) ? 0 : 15; }
      case B.RELAY_ON: { const f = HFACE_DIR[meta & 3]; return (dy === 0 && dx === f[0] && dz === f[1]) ? 15 : 0; }
    }
    return 0;
  }
  // power given to an opaque block by sources attached to it
  function strongPower(w, x, y, z) {
    for (let f = 0; f < 6; f++) {
      const d = FACE_DIR[f], sx = x + d[0], sy = y + d[1], sz = z + d[2];
      const id = w.getBlock(sx, sy, sz);
      if (!SOURCE[id]) continue;
      const m = w.getMeta(sx, sy, sz);
      switch (id) {
        case B.LEVER: case B.STONE_BUTTON: case B.WOOD_BUTTON: { const a = ATT[m & 7] || ATT[0]; if ((m & 8) && a[0] === -d[0] && a[1] === -d[1] && a[2] === -d[2]) return 15; break; }
        case B.STONE_PLATE: case B.WOOD_PLATE: if ((m & 1) && d[1] === 1) return 15; break;
        case B.DETECTOR_RAIL: if ((m & 8) && d[1] === 1) return 15; break;
        case B.HUSH_SENSOR: if ((m & 1) && d[1] === 1) return 15; break;
        case B.EMBER_TORCH: if (d[1] === -1) return 15; break;
        case B.RELAY_ON: { const fd = HFACE_DIR[m & 3]; if (d[1] === 0 && fd[0] === -d[0] && fd[1] === -d[2]) return 15; break; }
      }
    }
    return 0;
  }
  // which horizontal sides wire at (x,y,z) connects to: bit k for H[k]
  function wireConns(w, x, y, z) {
    let c = 0;
    const upOpen = !BT.opaque[w.getBlock(x, y + 1, z)];
    for (let k = 0; k < 4; k++) {
      const nx = x + H[k][0], nz = z + H[k][1];
      const n = w.getBlock(nx, y, nz);
      if (CONNECT[n]) c |= 1 << k;
      else if (n === B.RELAY || n === B.RELAY_ON) { if ((w.getMeta(nx, y, nz) & 3) >> 1 === k >> 1) c |= 1 << k; }
      else if (!BT.opaque[n] && w.getBlock(nx, y - 1, nz) === B.EMBER_WIRE) c |= 1 << k;
      else if (upOpen && BT.opaque[n] && w.getBlock(nx, y + 1, nz) === B.EMBER_WIRE) c |= 1 << k;
    }
    return c;
  }
  // does wire at (x,y,z) send power sideways into direction index k?
  function wirePoints(w, x, y, z, k) {
    const c = wireConns(w, x, y, z);
    if (c === 0) return true;
    const perp = k < 2 ? 0b1100 : 0b0011;
    return !!(c & (1 << (k ^ 1))) && !(c & perp);
  }
  // weak power an opaque block receives from wire pointing into it or lying on it
  function wireInto(w, x, y, z) {
    let p = 0;
    if (w.getBlock(x, y + 1, z) === B.EMBER_WIRE) p = w.getMeta(x, y + 1, z);
    for (let k = 0; k < 4; k++) {
      const sx = x + H[k][0], sz = z + H[k][1];
      if (w.getBlock(sx, y, sz) !== B.EMBER_WIRE) continue;
      const m = w.getMeta(sx, y, sz);
      if (m > p && wirePoints(w, sx, y, sz, k ^ 1)) p = m;
    }
    return p;
  }
  // power reaching a machine / torch input at (x,y,z) from neighbour direction f
  function powerFrom(w, x, y, z, f) {
    const d = FACE_DIR[f], nx = x + d[0], ny = y + d[1], nz = z + d[2];
    const id = w.getBlock(nx, ny, nz);
    if (SOURCE[id]) return sourcePower(id, w.getMeta(nx, ny, nz), -d[0], -d[1], -d[2]);
    if (id === B.EMBER_WIRE) {
      if (d[1] === 1) return 0;                      // wire doesn't power the block above it
      if (d[1] === -1) return 0;
      const k = [-1, -1, 0, 1, 2, 3][f];
      return wirePoints(w, nx, ny, nz, k ^ 1) ? w.getMeta(nx, ny, nz) : 0;
    }
    if (BT.opaque[id]) return Math.max(strongPower(w, nx, ny, nz), wireInto(w, nx, ny, nz));
    return 0;
  }
  function machinePower(w, x, y, z) {
    let p = 0;
    for (let f = 0; f < 6; f++) { const v = powerFrom(w, x, y, z, f); if (v > p) { p = v; if (p >= 15) break; } }
    // wire lying on top of a machine powers it too
    if (w.getBlock(x, y + 1, z) === B.EMBER_WIRE) p = Math.max(p, w.getMeta(x, y + 1, z));
    return p;
  }
  // power entering a wire from things other than wire
  function wireSource(w, x, y, z) {
    let p = 0;
    for (let f = 0; f < 6; f++) {
      const d = FACE_DIR[f], nx = x + d[0], ny = y + d[1], nz = z + d[2];
      const id = w.getBlock(nx, ny, nz);
      let v = 0;
      if (SOURCE[id]) v = sourcePower(id, w.getMeta(nx, ny, nz), -d[0], -d[1], -d[2]);
      else if (BT.opaque[id]) v = strongPower(w, nx, ny, nz);
      if (v > p) { p = v; if (p >= 15) return 15; }
    }
    return p;
  }
  function wireNeighbours(w, x, y, z, out) {
    out.length = 0;
    const upOpen = !BT.opaque[w.getBlock(x, y + 1, z)];
    for (const [dx, dz] of H) {
      const nx = x + dx, nz = z + dz, n = w.getBlock(nx, y, nz);
      if (n === B.EMBER_WIRE) out.push(nx, y, nz);
      else {
        if (!BT.opaque[n] && w.getBlock(nx, y - 1, nz) === B.EMBER_WIRE) out.push(nx, y - 1, nz);
        if (upOpen && BT.opaque[n] && w.getBlock(nx, y + 1, nz) === B.EMBER_WIRE) out.push(nx, y + 1, nz);
      }
    }
    return out;
  }

  // ------------------------------------------------------------ wire networks
  const nbBuf = [];
  function solveWires(w, starts, changedOut) {
    const seen = new Map();
    const stack = starts.slice();
    while (stack.length && seen.size < 4096) {
      const z = stack.pop(), y = stack.pop(), x = stack.pop();
      const k = x + ',' + y + ',' + z;
      if (seen.has(k) || w.getBlock(x, y, z) !== B.EMBER_WIRE) continue;
      seen.set(k, [x, y, z, 0]);
      const nb = wireNeighbours(w, x, y, z, nbBuf);
      for (let i = 0; i < nb.length; i += 3) stack.push(nb[i], nb[i + 1], nb[i + 2]);
    }
    const buckets = []; for (let i = 0; i < 16; i++) buckets.push([]);
    for (const [k, v] of seen) { v[3] = wireSource(w, v[0], v[1], v[2]); if (v[3] > 0) buckets[v[3]].push(k); }
    for (let lv = 15; lv > 1; lv--) {
      for (const k of buckets[lv]) {
        const v = seen.get(k);
        if (v[3] !== lv) continue;
        const nb = wireNeighbours(w, v[0], v[1], v[2], []);
        for (let i = 0; i < nb.length; i += 3) {
          const nk = nb[i] + ',' + nb[i + 1] + ',' + nb[i + 2], n = seen.get(nk);
          if (n && n[3] < lv - 1) { n[3] = lv - 1; buckets[lv - 1].push(nk); }
        }
      }
    }
    for (const v of seen.values()) {
      if (w.getMeta(v[0], v[1], v[2]) !== v[3]) { w.setBlock(v[0], v[1], v[2], B.EMBER_WIRE, v[3], 2 | 4); changedOut.push(v[0], v[1], v[2]); }
    }
  }

  // ------------------------------------------------------------ updates
  const queue = [];
  let busy = false;
  function changed(w, x, y, z) {
    queue.push(x, y, z);
    if (busy) return;
    busy = true;
    let guard = 0;
    try {
      while (queue.length && guard++ < 512) {
        const z0 = queue.pop(), y0 = queue.pop(), x0 = queue.pop();
        const wires = [], machines = [];
        for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 3) continue;
          const bx = x0 + dx, by = y0 + dy, bz = z0 + dz;
          if (by < 0 || by >= CH_H) continue;
          const id = w.getBlock(bx, by, bz);
          if (id === B.EMBER_WIRE) wires.push(bx, by, bz);
          else if (MACHINE[id]) machines.push(bx, by, bz, id);
        }
        if (wires.length) {
          const ch = [];
          solveWires(w, wires, ch);
          for (let i = 0; i < ch.length; i += 3) queue.push(ch[i], ch[i + 1], ch[i + 2]);
        }
        for (let i = 0; i < machines.length; i += 4) {
          if (w.getBlock(machines[i], machines[i + 1], machines[i + 2]) === machines[i + 3]) evaluate(w, machines[i], machines[i + 1], machines[i + 2], machines[i + 3]);
        }
      }
    } finally { busy = false; queue.length = 0; }
  }
  // a machine looks at its inputs
  function evaluate(w, x, y, z, id) {
    const m = w.getMeta(x, y, z);
    const g = w.game;
    switch (id) {
      case B.EMBER_LAMP:
        if (machinePower(w, x, y, z) > 0) {
          w.setBlock(x, y, z, B.EMBER_LAMP_ON, 0);
          if (g && g.player && g.player.distanceSq(x + 0.5, y + 0.5, z + 0.5) < 400) g.achieve('lamp');
        }
        break;
      case B.EMBER_LAMP_ON: if (machinePower(w, x, y, z) === 0) w.scheduleTick(x, y, z, 4); break;
      case B.EMBER_TORCH: case B.EMBER_TORCH_OFF: {
        const a = TORCH_ATT[m] || TORCH_ATT[0];
        const ax = x + a[0], ay = y + a[1], az = z + a[2];
        const att = w.getBlock(ax, ay, az);
        const powered = BT.opaque[att] ? Math.max(strongPower(w, ax, ay, az), wireInto(w, ax, ay, az)) > 0 : false;
        if (powered === (id === B.EMBER_TORCH)) w.scheduleTick(x, y, z, 2);
        break;
      }
      case B.RELAY: case B.RELAY_ON: {
        const on = relayInput(w, x, y, z, m) > 0;
        if (on !== (id === B.RELAY_ON)) w.scheduleTick(x, y, z, (((m >> 2) & 3) + 1) * 2);
        break;
      }
      case B.NOTE_BLOCK: {
        const p = machinePower(w, x, y, z) > 0, was = (m & 32) !== 0;
        if (p !== was) { w.setBlock(x, y, z, id, (m & 31) | (p ? 32 : 0), 4); if (p && g) playNote(g, x, y, z, m & 31); }
        break;
      }
      case B.BOOSTER_RAIL: Rails.updateBooster(w, x, y, z); break;
      case B.TNT: if (machinePower(w, x, y, z) > 0 && g) { w.setBlock(x, y, z, 0, 0); g.spawnEntity(new TNTEntity(w, x + 0.5, y, z + 0.5, 80)); } break;
      case B.DOOR_WOOD: case B.DOOR_IRON: {
        const lower = (m & 8) ? y - 1 : y;
        if (w.getBlock(x, lower, z) !== id || w.getBlock(x, lower + 1, z) !== id) break;
        const lm = w.getMeta(x, lower, z);
        const p = machinePower(w, x, lower, z) > 0 || machinePower(w, x, lower + 1, z) > 0, was = (lm & 32) !== 0;
        if (p === was) break;
        const nm = (lm & ~(32 | 4)) | (p ? 32 | 4 : 0);
        w.setBlock(x, lower, z, id, nm, 4); w.setBlock(x, lower + 1, z, id, (nm & ~32) | 8, 4);
        if (g && ((lm & 4) !== 0) !== p) g.audio.play(p ? 'door_open' : 'door_close', 0.9, 0.9 + Math.random() * 0.1, x + 0.5, lower + 1, z + 0.5);
        break;
      }
      case B.PISTON: case B.STICKY_PISTON: {
        let p = false;
        for (let f = 0; f < 6 && !p; f++) if (f !== (m & 7) && powerFrom(w, x, y, z, f) > 0) p = true;
        if (p && !(m & 8)) { if (g) extend(g, w, x, y, z, id, m); }
        else if (!p && (m & 8)) { if (g) retract(g, w, x, y, z, id, m); }
        else if ((m & 8)) {
          // lost its head (an explosion?): fall back to the retracted state
          const d = FACE_DIR[m & 7], h = w.getBlock(x + d[0], y + d[1], z + d[2]);
          if (h !== B.PISTON_HEAD && h !== B.PISTON_MOVING) w.setBlock(x, y, z, id, m & ~8);
        }
        break;
      }
      case B.PISTON_HEAD: {
        const d = FACE_DIR[m & 7], bx = x - d[0], by = y - d[1], bz = z - d[2];
        const b = w.getBlock(bx, by, bz), bm = w.getMeta(bx, by, bz);
        if ((b !== B.PISTON && b !== B.STICKY_PISTON) || !(bm & 8) || (bm & 7) !== (m & 7)) w.setBlock(x, y, z, 0, 0);
        break;
      }
      case B.TRAPDOOR: case B.FENCE_GATE: {
        const bit = id === B.TRAPDOOR ? 16 : 8;
        const p = machinePower(w, x, y, z) > 0, was = (m & bit) !== 0;
        if (p === was) break;
        const nm = (m & ~(bit | 4)) | (p ? bit | 4 : 0);
        w.setBlock(x, y, z, id, nm, 4);
        if (g && ((m & 4) !== 0) !== p) g.audio.play(p ? 'door_open' : 'door_close', 0.9, id === B.TRAPDOOR ? 1.1 : 1.05, x + 0.5, y + 0.5, z + 0.5);
        break;
      }
    }
  }
  // ------------------------------------------------------------ pistons
  function moveType(w, x, y, z) {
    if (y < 0 || y >= CH_H) return 'block';
    const id = w.getBlock(x, y, z);
    if (id === 0) return 'air';
    if (BT.fluid[id] || id === B.FIRE) return 'break';
    const d = BLOCKS[id];
    if (!d || d.hardness < 0 || d.tileEntity || id === B.OBSIDIAN || id === B.RUNESTONE || id === B.PISTON_HEAD) return 'block';
    if ((id === B.PISTON || id === B.STICKY_PISTON) && (w.getMeta(x, y, z) & 8)) return 'block';
    if (!BT.solid[id] || BT.replaceable[id] || BREAKS[id]) return 'break';
    return 'push';
  }
  function placeMoving(game, w, x, y, z, id, meta, fx, fy, fz, noShove) {
    w.setBlock(x, y, z, B.PISTON_MOVING, 0);
    const te = w.getTile(x, y, z);
    if (te) { te.id = id; te.meta = meta; }
    w.scheduleTick(x, y, z, 2, B.PISTON_MOVING);
    game.spawnEntity(new MovingBlock(w, id, meta, fx, fy, fz, x, y, z, noShove));
  }
  function extend(game, w, x, y, z, id, m) {
    const f = m & 7, d = FACE_DIR[f];
    const line = [];
    let cx = x + d[0], cy = y + d[1], cz = z + d[2];
    for (let i = 0; ; i++) {
      const t = moveType(w, cx, cy, cz);
      if (t === 'air' || t === 'break') break;
      if (t === 'block' || i >= 12) return false;
      line.push([cx, cy, cz, w.getBlock(cx, cy, cz), w.getMeta(cx, cy, cz)]);
      cx += d[0]; cy += d[1]; cz += d[2];
    }
    const endId = w.getBlock(cx, cy, cz);
    if (endId !== 0 && !BT.fluid[endId]) Behaviors.dropBlock(game, cx, cy, cz, endId, w.getMeta(cx, cy, cz), null);
    w.setBlock(x, y, z, id, m | 8);
    for (let i = line.length - 1; i >= 0; i--) {
      const [sx, sy, sz, bid, bm] = line[i];
      placeMoving(game, w, sx + d[0], sy + d[1], sz + d[2], bid, bm, sx, sy, sz);
    }
    placeMoving(game, w, x + d[0], y + d[1], z + d[2], B.PISTON_HEAD, f | (id === B.STICKY_PISTON ? 8 : 0), x, y, z);
    game.audio.play('piston_out', 0.5, 0.75 + Math.random() * 0.25, x + 0.5, y + 0.5, z + 0.5);
    return true;
  }
  function retract(game, w, x, y, z, id, m) {
    const f = m & 7, d = FACE_DIR[f];
    const hx = x + d[0], hy = y + d[1], hz = z + d[2];
    w.setBlock(x, y, z, id, m & ~8);
    const h = w.getBlock(hx, hy, hz);
    if (h === B.PISTON_HEAD || h === B.PISTON_MOVING) w.setBlock(hx, hy, hz, 0, 0);
    game.spawnEntity(new MovingBlock(w, B.PISTON_HEAD, f | (id === B.STICKY_PISTON ? 8 : 0), hx, hy, hz, x, y, z, true));
    if (id === B.STICKY_PISTON) {
      const px = hx + d[0], py = hy + d[1], pz = hz + d[2];
      if (moveType(w, px, py, pz) === 'push') {
        const bid = w.getBlock(px, py, pz), bm = w.getMeta(px, py, pz);
        w.setBlock(px, py, pz, 0, 0);
        placeMoving(game, w, hx, hy, hz, bid, bm, px, py, pz, true);
      }
    }
    game.audio.play('piston_in', 0.5, 0.65 + Math.random() * 0.25, x + 0.5, y + 0.5, z + 0.5);
  }
  function relayInput(w, x, y, z, m) {
    const f = HFACE_DIR[m & 3];
    const bx = x - f[0], bz = z - f[1];
    const id = w.getBlock(bx, y, bz);
    if (id === B.EMBER_WIRE) return w.getMeta(bx, y, bz);
    if (SOURCE[id]) return sourcePower(id, w.getMeta(bx, y, bz), f[0], 0, f[1]);
    if (BT.opaque[id]) return Math.max(strongPower(w, bx, y, bz), wireInto(w, bx, y, bz));
    return 0;
  }

  // ------------------------------------------------------------ delayed updates
  const burnout = new Map();
  function circuitTick(w, x, y, z, id) {
    const m = w.getMeta(x, y, z);
    const g = w.game;
    switch (id) {
      case B.EMBER_LAMP_ON: if (machinePower(w, x, y, z) === 0) w.setBlock(x, y, z, B.EMBER_LAMP, 0); break;
      case B.EMBER_TORCH: case B.EMBER_TORCH_OFF: {
        const a = TORCH_ATT[m] || TORCH_ATT[0];
        const ax = x + a[0], ay = y + a[1], az = z + a[2];
        const powered = BT.opaque[w.getBlock(ax, ay, az)] ? Math.max(strongPower(w, ax, ay, az), wireInto(w, ax, ay, az)) > 0 : false;
        const key = x + ',' + y + ',' + z;
        if (id === B.EMBER_TORCH && powered) {
          // flickering too fast burns the torch out for a while
          const list = (burnout.get(key) || []).filter((t) => w.time - t < 60);
          list.push(w.time); burnout.set(key, list);
          w.setBlock(x, y, z, B.EMBER_TORCH_OFF, m);
          if (list.length >= 8 && g) {
            g.audio.play('fizz', 0.5, 2.6 + Math.random() * 0.8, x + 0.5, y + 0.5, z + 0.5);
            for (let i = 0; i < 5; i++) g.particles.smoke(x + 0.3 + Math.random() * 0.4, y + 0.6, z + 0.3 + Math.random() * 0.4, 1);
            w.scheduleTick(x, y, z, 160, B.EMBER_TORCH_OFF);
          }
        } else if (id === B.EMBER_TORCH_OFF && !powered) {
          const list = (burnout.get(key) || []).filter((t) => w.time - t < 60);
          if (list.length >= 8) { burnout.set(key, list); w.scheduleTick(x, y, z, 20, B.EMBER_TORCH_OFF); break; }
          w.setBlock(x, y, z, B.EMBER_TORCH, m);
        }
        break;
      }
      case B.RELAY: case B.RELAY_ON: {
        const on = relayInput(w, x, y, z, m) > 0;
        if (on && id === B.RELAY) w.setBlock(x, y, z, B.RELAY_ON, m);
        else if (!on && id === B.RELAY_ON) w.setBlock(x, y, z, B.RELAY, m);
        break;
      }
      case B.STONE_BUTTON: case B.WOOD_BUTTON:
        if (m & 8) { w.setBlock(x, y, z, id, m & ~8); if (g) g.audio.play('click', 0.3, 0.5, x + 0.5, y + 0.5, z + 0.5); }
        break;
      case B.PISTON_MOVING: {
        const te = w.getTile(x, y, z);
        const nid = te ? te.id : 0, nm = te ? te.meta : 0;
        w.setBlock(x, y, z, nid, nm);
        // a sticky head pulling back left nothing behind; heads re-check their piston
        break;
      }
      // a sensor's glow fades a couple of seconds after it last heard something
      case B.HUSH_SENSOR: if (m & 1) w.setBlock(x, y, z, id, m & ~1); break;
      case B.STONE_PLATE: case B.WOOD_PLATE:
        if (m & 1) {
          if (plateOccupied(w, x, y, z, id)) w.scheduleTick(x, y, z, 20, id);
          else { w.setBlock(x, y, z, id, 0); if (g) g.audio.play('click', 0.3, 0.5, x + 0.5, y + 0.1, z + 0.5); }
        }
        break;
    }
  }

  // ------------------------------------------------------------ interaction
  function use(game, x, y, z, id) {
    const w = game.world, m = w.getMeta(x, y, z);
    switch (id) {
      case B.LEVER:
        w.setBlock(x, y, z, id, m ^ 8);
        game.audio.play('click', 0.3, (m & 8) ? 0.5 : 0.6, x + 0.5, y + 0.5, z + 0.5);
        return true;
      case B.STONE_BUTTON: case B.WOOD_BUTTON:
        if (m & 8) return true;
        w.setBlock(x, y, z, id, m | 8);
        w.scheduleTick(x, y, z, id === B.STONE_BUTTON ? 20 : 30, id);
        game.audio.play('click', 0.3, 0.6, x + 0.5, y + 0.5, z + 0.5);
        return true;
      case B.RELAY: case B.RELAY_ON:
        w.setBlock(x, y, z, id, (m & 3) | ((((m >> 2) & 3) + 1) & 3) << 2);
        game.audio.play('click', 0.2, 0.9, x + 0.5, y + 0.2, z + 0.5);
        return true;
      case B.NOTE_BLOCK: {
        const pitch = ((m & 31) + 1) % 25;
        w.setBlock(x, y, z, id, pitch | (m & 32), 4);
        playNote(game, x, y, z, pitch);
        return true;
      }
    }
    return false;
  }
  // note blocks: two octaves from F#, the instrument depends on what's underneath
  function playNote(game, x, y, z, pitch) {
    const w = game.world;
    if (w.getBlock(x, y + 1, z) !== 0) return;
    const below = BLOCKS[w.getBlock(x, y - 1, z)];
    const snd = below ? below.sound : 'stone';
    const midi = 54 + pitch;
    let inst = 'harp';
    if (snd === 'wood') inst = 'bass';
    else if (snd === 'sand' || snd === 'gravel') inst = 'snare';
    else if (snd === 'glass') inst = 'hat';
    else if (snd === 'stone' && below && below.id !== B.DIRT) inst = 'drum';
    game.audio.playNote(inst, midi, x + 0.5, y + 0.5, z + 0.5);
    const c = pitch / 24;
    game.particles.add({ x: x + 0.5, y: y + 1.2, z: z + 0.5, vx: 0, vy: 0.02, vz: 0, size: 0.12, life: 14, layer: game.particles.layer('particle_note'),
      r: Math.max(0, Math.sin((c + 0) * TAU) * 0.65 + 0.35), g: Math.max(0, Math.sin((c + 1 / 3) * TAU) * 0.65 + 0.35), b: Math.max(0, Math.sin((c + 2 / 3) * TAU) * 0.65 + 0.35), collide: false, drag: 0.66, bright: true });
  }
  // pressure plates notice creatures (stone) or anything at all (wood)
  function plateOccupied(w, x, y, z, id) {
    const g = w.game;
    const test = (e) => !e.removed && !e.dead && (id === B.WOOD_PLATE || e.category || e.type === 'player') && e.type !== 'wisp' && e.type !== 'fishhook' && e.type !== 'painting';
    const box = [x + 0.0625, y, z + 0.0625, x + 0.9375, y + 0.25, z + 0.9375];
    const hit = (e) => { e.updateBox(); const b = e.box; return b.x1 > box[0] && b.x0 < box[3] && b.z1 > box[2] && b.z0 < box[5] && b.y0 < box[4] && b.y1 > box[1]; };
    if (g && g.player && test(g.player) && hit(g.player)) return true;
    for (const e of w.entitiesInBox(x - 1, y - 1, z - 1, x + 2, y + 2, z + 2)) if (test(e) && hit(e)) return true;
    return false;
  }
  function tickPlates(game) {
    const w = game.world;
    const check = (e) => {
      const bx = Math.floor(e.x), by = Math.floor(e.y + 0.05), bz = Math.floor(e.z);
      const id = w.getBlock(bx, by, bz);
      if (id !== B.STONE_PLATE && id !== B.WOOD_PLATE) return;
      if (w.getMeta(bx, by, bz) & 1) return;
      if (!plateOccupied(w, bx, by, bz, id)) return;
      w.setBlock(bx, by, bz, id, 1);
      w.scheduleTick(bx, by, bz, 20, id);
      game.audio.play('click', 0.3, 0.6, bx + 0.5, by + 0.1, bz + 0.5);
    };
    if (game.player && !game.player.dead) check(game.player);
    for (const e of w.entities) if (!e.removed && (e.category || e.type === 'item' || e.type === 'arrow' || e.type === 'boat')) check(e);
  }

  // ------------------------------------------------------------ hooks
  for (const id of [B.EMBER_LAMP_ON, B.EMBER_TORCH, B.EMBER_TORCH_OFF, B.RELAY, B.RELAY_ON, B.STONE_BUTTON, B.WOOD_BUTTON, B.STONE_PLATE, B.WOOD_PLATE, B.PISTON_MOVING, B.HUSH_SENSOR]) BLOCKS[id].circuitTick = (w, x, y, z) => circuitTick(w, x, y, z, id);
  // meta-only changes (lever flips, wire levels) and neighbour edits nearby
  function blockChanged(w, x, y, z, oldId, newId) {
    if (w.menu) return;
    if (IS[oldId] || IS[newId]) { changed(w, x, y, z); return; }
    // an ordinary block changed: does it touch anything electrical?
    for (let dy = -2; dy <= 2; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (IS[w.getBlock(x + dx, y + dy, z + dz)]) { changed(w, x, y, z); return; }
    }
  }
  BLOCKS[B.NOTE_BLOCK].onPunch = (w, x, y, z) => { if (w.game) playNote(w.game, x, y, z, w.getMeta(x, y, z) & 31); };
  return { changed, blockChanged, use, tickPlates, machinePower, wireConns, playNote, IS };
})();
