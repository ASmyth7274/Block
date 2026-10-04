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
  sprite('star_crystal', [
    '................', '.......ww.......', '......wccw......', '.....wcwwcw.....', '....wcwssscw....', '...wcwsSSSscw...',
    '..wcwsSSWSSscw..', '.wcwsSSWWWSSscw.', '.wcwsSSWWWSSscw.', '..wcwsSSWSSscw..', '...wcwsSSSscw...', '....wcwssscw....',
    '.....wcwwcw.....', '......wccw......', '.......ww.......', '................'],
    { w: '#efe6ff', c: '#b89cf0', s: '#5a2a9a', S: '#a070e0', W: '#ffffff' });
})();
