'use strict';
// ---------------------------------------------------------------------------
// Animated item textures: the compass needle swings towards the world spawn
// and the clock dial turns with the sun, in the hotbar, the hand and on the
// ground alike (the shared texture layer is rewritten in place).
// ---------------------------------------------------------------------------
const DynamicItems = (() => {
  let compassBase = null, clockBase = null;
  let angle = 0, delta = 0, lastC = null, lastK = null, clockSpin = 0;
  function bases() {
    if (compassBase) return;
    // compass: iron rim, pale face, small cardinal ticks
    compassBase = new TexGen.Img();
    clockBase = new TexGen.Img();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d < 4.6) compassBase.set(x, y, [222, 214, 196]);
      else if (d < 5.7) compassBase.set(x, y, (x + y) % 5 === 0 ? [150, 150, 150] : [120, 120, 124]);
      else if (d < 6.6) compassBase.set(x, y, [44, 44, 48]);
      if (d >= 4.6 && d < 5.7) clockBase.set(x, y, (x * 3 + y) % 4 === 0 ? [255, 236, 120] : [230, 186, 40]);
      else if (d >= 5.7 && d < 6.6) clockBase.set(x, y, [82, 62, 6]);
    }
    for (const [x, y] of [[7, 3], [8, 3], [12, 7], [12, 8], [7, 12], [8, 12], [3, 7], [3, 8]]) compassBase.set(x, y, [150, 140, 120]);
  }
  function drawCompass(img, a) {
    img.d.set(compassBase.d);
    const s = Math.sin(a), c = Math.cos(a);
    // dark tail
    for (let k = 0; k <= 12; k++) { const t = k / 12 * 3.2; img.set(Math.round(7.5 - s * t), Math.round(7.5 + c * t), [70, 70, 76]); }
    // red point
    for (let k = 0; k <= 16; k++) { const t = k / 16 * 4.2; img.set(Math.round(7.5 + s * t), Math.round(7.5 - c * t), k > 13 ? [255, 90, 80] : [210, 30, 30]); }
    img.set(7, 7, [40, 40, 40]); img.set(8, 8, [40, 40, 40]);
  }
  function drawClock(img, f) {
    img.d.set(clockBase.d);
    const phi = f * Math.PI * 2;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy);
      if (d >= 4.6) continue;
      const a = Math.atan2(dx, -dy) - phi;
      const day = Math.cos(a) > 0;
      let col = day ? [104, 170, 240] : [22, 32, 72];
      // sun and moon sit opposite each other on the dial
      const sx = Math.sin(phi) * 2.6, sy = -Math.cos(phi) * 2.6;
      if (Math.hypot(dx - sx, dy - sy) < 1.3) col = [255, 226, 70];
      if (Math.hypot(dx + sx, dy + sy) < 1.1) col = [236, 236, 230];
      if (!day && ((x * 7 + y * 3) % 11 === 0)) col = [200, 210, 255];
      img.set(x, y, col);
    }
    // fixed pointer at the top
    img.set(7, 2, [60, 40, 0]); img.set(8, 2, [60, 40, 0]); img.set(7, 3, [40, 28, 0]); img.set(8, 3, [40, 28, 0]);
  }
  function invalidate(game, id) {
    const icons = game.gui.icons, pre = id + ':';
    for (const k of [...icons.cache.keys()]) if (k.startsWith(pre)) icons.cache.delete(k);
  }
  function update(game) {
    const p = game.player, w = game.world;
    if (!p || !w || w.menu) return;
    bases();
    const atlas = game.renderer.atlas;
    // compass: springy needle like the classic one
    const sp = w.spawn || { x: 0, z: 0 };
    const dx = sp.x + 0.5 - p.x, dz = sp.z + 0.5 - p.z;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    // below, the needle wanders aimlessly
    const target = w.dim ? angle + (Math.random() - 0.5) * 6 : (dx * dx + dz * dz < 0.5) ? angle + 0.3 : Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    let d2 = wrapRadians(target - angle);
    d2 = clamp(d2, -1, 1);
    delta += d2 * 0.1; delta *= 0.8; angle = wrapRadians(angle + delta);
    const cq = Math.round(angle / (Math.PI * 2) * 64);
    if (cq !== lastC) {
      lastC = cq;
      const img = TexGen.T.compass;
      drawCompass(img, cq / 64 * Math.PI * 2);
      atlas.upload(atlas.layer('compass'), img);
      invalidate(game, ITEM_IDS.compass);
    }
    // clock: dial follows the sun
    if (w.dim) { clockSpin = (clockSpin + (Math.random() - 0.3) * 0.08 + 1) % 1; }
    const kq = Math.round((w.dim ? clockSpin : w.celestialAngle(0)) * 64) % 64;
    if (kq !== lastK) {
      lastK = kq;
      const img = TexGen.T.clock;
      drawClock(img, kq / 64);
      atlas.upload(atlas.layer('clock'), img);
      invalidate(game, ITEM_IDS.clock);
    }
  }
  return { update };
})();
