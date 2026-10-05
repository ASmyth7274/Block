'use strict';
// ---------------------------------------------------------------------------
// Artwork for farming and machines: melon and pumpkin stems and their seeds,
// the hopper's iron funnel, and the faces of the dropper and the dispenser.
// ---------------------------------------------------------------------------
(function () {
  const { Img, T, reg, sprite, rngFor, noiseImg, C } = TexGen;
  // stems, growing from a sprout to a long stalk turning yellow
  const STEM = [
    { h: 4, c: ['#4e8a2a', '#5e9c34'] }, { h: 8, c: ['#5a9430', '#6aa63a'] }, { h: 12, c: ['#7a9a2e', '#8aaa38'] }, { h: 15, c: ['#a09a2a', '#b8b03a'] },
  ];
  STEM.forEach((st, k) => {
    const img = new Img(), rng = rngFor('stem_' + k);
    for (let y = 16 - st.h; y < 16; y++) {
      const x = 7 + ((y >> 2) % 2 === 0 ? 0 : 1);
      img.set(x, y, C(st.c[(y + k) % 2]));
      if (y % 4 === 1 && y < 14) { const lx = x + (rng.nextBool() ? 1 : -1); img.set(lx, y, C(st.c[0])); img.set(lx + (lx > x ? 1 : -1), y - 1, C(st.c[1])); }
    }
    reg('stem_' + k, img);
  });
  // a full-grown stem bent over to hold its fruit (the fruit is to the right)
  reg('stem_attached', (() => {
    const img = new Img(), a = C('#a09a2a'), b = C('#b8b03a'), l = C('#8a9a30');
    const path = [[7, 15], [7, 14], [7, 13], [8, 12], [8, 11], [8, 10], [9, 9], [10, 8], [11, 8], [12, 7], [13, 7], [14, 7], [15, 7]];
    path.forEach(([x, y], i) => { img.set(x, y, i % 2 ? a : b); if (i > 3 && i < 9) img.set(x, y + 1, a); });
    for (const [x, y] of [[6, 12], [5, 11], [9, 12], [10, 13], [12, 6], [11, 5], [13, 9]]) img.set(x, y, l);
    return img;
  })());
  sprite('melon_seeds', [
    '................', '................', '................', '....b...........', '...bb.....b.....', '...b.....bb.....', '.........b......', '......b.........',
    '.....bb.....b...', '.....b.....bb...', '...........b....', '...b............', '..bb.....b......', '..b.....bb......', '........b.......', '................'],
    { b: '#2a2018' });
  sprite('pumpkin_seeds', [
    '................', '................', '................', '....p...........', '...pP.....p.....', '...p.....pP.....', '.........p......', '......p.........',
    '.....pP.....p...', '.....p.....pP...', '...........p....', '...p............', '..pP.....p......', '..p.....pP......', '........p.......', '................'],
    { p: '#d8c890', P: '#f0e6b8' });
  // the hopper: dark iron plate, riveted
  reg('hopper_outside', (() => {
    const img = noiseImg('hopper_outside', ['#3a3a3e', '#424246', '#4a4a4e', '#525256'], { scales: [4, 2], weights: [0.5, 0.5] });
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#606066')); img.set(0, i, C('#5a5a60')); img.set(i, 15, C('#28282c')); img.set(15, i, C('#2c2c30')); }
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) img.set(x, y, C('#76767c'));
    return img;
  })());
  reg('hopper_inside', (() => {
    const img = noiseImg('hopper_inside', ['#1e1e22', '#242428', '#2a2a2e'], { scales: [4, 2], weights: [0.5, 0.5] });
    for (let i = 4; i < 12; i++) for (let j = 4; j < 12; j++) img.set(i, j, C('#141418'));
    return img;
  })());
  sprite('item_hopper', [
    '................', '..oooooooooooo..', '..oHHHHHHHHHHo..', '..oHddddddddHo..', '..oHddddddddHo..', '..oHHHHHHHHHHo..', '...ooHHHHHHoo...', '.....oHHHHo.....',
    '.....oHHHHo.....', '.....oHHHHo.....', '......oHHo......', '......oHHo......', '......oooo......', '................', '................', '................'],
    { o: '#2a2a2e', H: '#6a6a72', d: '#1c1c20' });
  // a dropper's mouth: a plain square slot; a dispenser's: a round port set in a bow-shaped frame
  const face = (name, hole, frame, vertical) => {
    const img = (vertical ? T.furnace_top : T.furnace_side).copy();
    for (const [x, y] of frame) img.set(x, y, C('#5a5a5e'));
    for (const [x, y] of hole) img.set(x, y, C('#141414'));
    reg(name, img);
  };
  const sq = (x0, y0, x1, y1) => { const a = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a.push([x, y]); return a; };
  const ring = (cx, cy, r0, r1) => { const a = []; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - cx, y - cy); if (d >= r0 && d < r1) a.push([x, y]); } return a; };
  face('dropper_front', sq(5, 5, 10, 10), sq(4, 4, 11, 11).filter(([x, y]) => x === 4 || x === 11 || y === 4 || y === 11), false);
  face('dropper_front_vertical', sq(5, 5, 10, 10), sq(4, 4, 11, 11).filter(([x, y]) => x === 4 || x === 11 || y === 4 || y === 11), true);
  face('dispenser_front', ring(7.5, 7.5, 0, 2.6), ring(7.5, 7.5, 2.6, 3.8).concat([[3, 3], [12, 3], [2, 2], [13, 2], [3, 12], [12, 12], [2, 13], [13, 13]]), false);
  face('dispenser_front_vertical', ring(7.5, 7.5, 0, 2.6), ring(7.5, 7.5, 2.6, 3.8), true);
})();
