'use strict';
// ---------------------------------------------------------------------------
// Artwork for the Far Isles: the star crystal's cage of light and its core,
// starstone bricks, and the odd things found out among the isles.
// ---------------------------------------------------------------------------
(function () {
  const { Img, T, reg, sprite, C, mix } = TexGen;
  // a star crystal's frame: bright struts and braces, empty between
  reg('star_crystal_glass', (() => {
    const img = new Img();
    const edge = C('#efe6ff'), brace = C('#b89cf0'), dim = C('#8a6ad0');
    for (let i = 0; i < 16; i++) {
      img.set(i, 0, edge); img.set(i, 15, edge); img.set(0, i, edge); img.set(15, i, edge);
      if (i > 1 && i < 14) { img.set(i, i, (i % 3) ? brace : dim); img.set(15 - i, i, (i % 3) ? brace : dim); }
    }
    for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) img.set(x, y, C('#ffffff'));
    return img;
  })());
  // its heart: a small white star burning in violet
  reg('star_crystal_core', (() => {
    const img = new Img();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy), ray = Math.min(Math.abs(dx), Math.abs(dy));
      let c = mix(C('#5a2a9a'), C('#2a0e4a'), Math.min(1, d / 10));
      if (ray < 1.2 && d < 7.5) c = mix(C('#ffffff'), C('#c8a0ff'), d / 7.5);
      if (d < 2.6) c = C('#ffffff');
      else if (d < 4) c = mix(C('#f0e0ff'), c, (d - 2.6) / 1.4);
      img.set(x, y, c);
    }
    return img;
  })());
  // dressed starstone
  reg('starstone_bricks', (() => {
    const img = T.starstone.copy();
    const mortar = C('#a8a47e'), hi = C('#f2f0d0');
    for (let x = 0; x < 16; x++) { img.set(x, 7, mortar); img.set(x, 15, mortar); img.set(x, 0, hi); img.set(x, 8, hi); }
    for (let y = 0; y < 7; y++) { img.set(7, y, mortar); img.set(8, y, hi); }
    for (let y = 8; y < 15; y++) { img.set(15, y, mortar); img.set(0, y, hi); }
    return img;
  })());
  // a star gateway: deep violet night with gold and white stars wheeling slowly round its heart
  function GatewayAnim() {
    const rng = new Noise.Random(9171);
    const stars = Array.from({ length: 22 }, (_, i) => [rng.nextFloat() * TAU, 1.5 + rng.nextFloat() * 9, rng.nextFloat(), i % 3]);
    let t = 0;
    this.step = function () { t++; };
    this.render = function (img) {
      for (let i = 0; i < 256; i++) {
        const x = i & 15, y = i >> 4, d = Math.hypot(x - 7.5, y - 7.5);
        const swirl = Math.sin(Math.atan2(y - 7.5, x - 7.5) * 3 + d * 0.7 - t * 0.05) * 0.5 + 0.5;
        const v = 10 + swirl * 14 * Math.max(0, 1 - d / 11);
        img.d[i * 4] = v * 1.3; img.d[i * 4 + 1] = v * 0.55; img.d[i * 4 + 2] = v * 2.4 + 12; img.d[i * 4 + 3] = 255;
      }
      const cols = [[255, 226, 140], [255, 255, 255], [200, 160, 255]];
      for (const [a0, r, ph, k] of stars) {
        const a = a0 + t * (0.012 + 0.03 / r), x = Math.floor(7.5 + Math.cos(a) * r), y = Math.floor(7.5 + Math.sin(a) * r);
        if (x < 0 || y < 0 || x > 15 || y > 15) continue;
        const tw = 0.55 + 0.45 * Math.sin(t * 0.2 + ph * 30), c = cols[k], i = (y * 16 + x) * 4;
        img.d[i] = Math.max(img.d[i], c[0] * tw); img.d[i + 1] = Math.max(img.d[i + 1], c[1] * tw); img.d[i + 2] = Math.max(img.d[i + 2], c[2] * tw);
      }
    };
  }
  TexGen.ANIM.star_gateway = new GatewayAnim();
  { const img = new Img(); TexGen.ANIM.star_gateway.render(img); reg('star_gateway', img); }
  // the wyrm's egg: a shell of night, flecked with stars, with a seam of warm light
  reg('wyrm_egg', (() => {
    const img = new Img(), rng = new Noise.Random(5150);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = 0.85 + rng.nextFloat() * 0.3, band = Math.sin(x * 0.9 + y * 0.35) * 0.5 + 0.5;
      img.set(x, y, mix(C('#140f2a'), C('#2e2456'), band * 0.6 * k));
    }
    for (let i = 0; i < 9; i++) img.set(rng.nextInt(16), rng.nextInt(16), rng.nextInt(3) ? C('#c8b8ff') : C('#fff4c8'));
    // the seam, glowing faintly
    for (let x = 0; x < 16; x++) { const y = 9 + Math.round(Math.sin(x * 0.8) * 1.5); img.set(x, y, C('#e0a040')); if (x % 3 === 0) img.set(x, y - 1, C('#7a4a20')); }
    return img;
  })());
  reg('wyrm_egg_top', (() => {
    const img = new Img(), rng = new Noise.Random(5151);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, mix(C('#1a1434'), C('#2a2250'), rng.nextFloat() * 0.5));
    for (let i = 0; i < 6; i++) img.set(rng.nextInt(16), rng.nextInt(16), C('#c8b8ff'));
    return img;
  })());
  sprite('star_fragment', [
    '................', '................', '.......o........', '......oYo.......', '......oYo.......', '..oo.oYWYo.oo...', '..oYooYWWYooYo..', '...oYYWWWWYYo...',
    '....oYWWWWYo....', '...oYYWWWYYYo...', '..oYooYWWYooYo..', '..oo.oYWYo.oo...', '......oYo.......', '......oYo.......', '.......o........', '................'],
    { o: '#6a4a8a', Y: '#ffd860', W: '#fffbe8' });
  sprite('star_crystal', [
    '................', '.......ww.......', '......wccw......', '.....wcwwcw.....', '....wcwssscw....', '...wcwsSSSscw...',
    '..wcwsSSWSSscw..', '.wcwsSSWWWSSscw.', '.wcwsSSWWWSSscw.', '..wcwsSSWSSscw..', '...wcwsSSSscw...', '....wcwssscw....',
    '.....wcwwcw.....', '......wccw......', '.......ww.......', '................'],
    { w: '#efe6ff', c: '#b89cf0', s: '#5a2a9a', S: '#a070e0', W: '#ffffff' });
})();
