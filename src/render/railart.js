'use strict';
// ---------------------------------------------------------------------------
// Textures for rails and minecarts: iron rails on wooden sleepers, a curve,
// booster rails with an ember strip, detector rails with a pressure plate,
// and the riveted iron of the carts themselves.
// ---------------------------------------------------------------------------
(function () {
  const { Img, reg, pal, rngFor, sprite, C } = TexGen;
  const IRON = pal(['#4a4a4a', '#7a7a7a', '#a8a8a8', '#d0d0d0']);
  const GOLD = pal(['#6a4a08', '#b88a18', '#e8c040', '#fff090']);
  const WOOD = pal(['#3a2810', '#5a4020', '#6e5028', '#86643a']);
  // sleepers across the track every few pixels
  const sleepers = (img, rng) => {
    for (const y0 of [1, 5, 9, 13]) for (let y = y0; y < y0 + 2; y++) for (let x = 1; x < 15; x++) {
      const c = WOOD[(y === y0 ? 2 : 1) + (rng.nextInt(5) === 0 ? 1 : 0) - (x === 1 || x === 14 ? 1 : 0)];
      img.set(x, y, c);
    }
  };
  // two rails running along v (top to bottom)
  const railsAlong = (img, P) => {
    for (let y = 0; y < 16; y++) for (const x0 of [2, 12]) {
      img.set(x0, y, P[1]); img.set(x0 + 1, y, (y % 4 === 1) ? P[3] : P[2]);
      if (y % 8 === 3) img.set(x0, y, P[0]);
    }
  };
  const straight = (name, P, mid) => {
    const img = new Img(), rng = rngFor(name);
    sleepers(img, rng);
    if (mid) for (let y = 0; y < 16; y++) for (let x = 6; x < 10; x++) { const c = mid(x, y); if (c) img.set(x, y, c); }
    railsAlong(img, P);
    return reg(name, img);
  };
  straight('rail', IRON);
  // booster rail: gold rails over an ember strip that glows when powered
  straight('booster_rail', GOLD, (x, y) => (x === 6 || x === 9) ? null : ((y + x) % 3 === 0 ? C('#4a1a10') : C('#3a120a')));
  straight('booster_rail_on', GOLD, (x, y) => (x === 6 || x === 9) ? null : ((y + x) % 3 === 0 ? C('#ffb060') : C('#ff6a20')));
  // detector rail: a little stone plate between the rails
  straight('detector_rail', IRON, (x, y) => (y >= 3 && y <= 12) ? ((x === 6 || x === 9 || y === 3 || y === 12) ? C('#5a5a5a') : C('#8a8a8a')) : null);
  straight('detector_rail_on', IRON, (x, y) => (y >= 3 && y <= 12) ? ((x === 6 || x === 9 || y === 3 || y === 12) ? C('#5a5a5a') : ((x + y) % 2 ? C('#ff7a30') : C('#d8501c'))) : null);
  // the curve: joins the bottom edge (v = 16) to the right edge (u = 16)
  (() => {
    const name = 'rail_turn', img = new Img(), rng = rngFor(name);
    // sleepers fanning round the bend
    for (let k = 0; k < 4; k++) {
      const a = (k + 0.5) / 4 * Math.PI / 2;
      for (let r = 1.5; r < 15.5; r += 0.25) {
        for (const da of [-0.06, 0.06]) {
          const x = Math.floor(16 - Math.cos(a + da) * r), y = Math.floor(16 - Math.sin(a + da) * r);
          if (x >= 0 && y >= 0 && x < 16 && y < 16) img.set(x, y, WOOD[1 + (rng.nextInt(5) === 0 ? 1 : 0)]);
        }
      }
    }
    // the two rails (inner and outer)
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const r = Math.hypot(16 - (x + 0.5), 16 - (y + 0.5));
      if ((r >= 2.6 && r < 4.4) || (r >= 12.6 && r < 14.4)) {
        const outer = (r >= 3.5 && r < 4.4) || (r >= 13.5);
        img.set(x, y, outer ? IRON[2] : IRON[1]);
      }
    }
    reg(name, img);
  })();
  // minecart hull plates
  const plate = (name, P, rivets) => {
    const img = new Img(), rng = rngFor(name);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      let c = P[edge ? 0 : 1 + (rng.nextInt(6) === 0 ? 1 : 0)];
      if (rivets && (x === 2 || x === 13) && (y === 2 || y === 13)) c = P[3];
      if (!edge && (y === 7 || y === 8) && rng.nextInt(4) === 0) c = P[0];
      img.set(x, y, c);
    }
    return reg(name, img);
  };
  plate('minecart_hull', pal(['#3e3e44', '#6a6a72', '#7e7e86', '#b8b8c0']), true);
  plate('minecart_floor', pal(['#2a2a2e', '#424248', '#4a4a50', '#6a6a70']), false);
  // inventory sprites
  sprite('minecart', [
    '................', '................', '................', '................', '................', 'o..............o',
    'oaoooooooooooaao', 'oabbbbbbbbbbbbao', 'oabcbbbbbbbbcbao', 'oabbbbbbbbbbbbao', '.oaaaaaaaaaaaao.', '..oooooooooooo..',
    '...ooo....ooo...', '..oddo....oddo..', '...oo......oo...', '................'],
    { o: '#202024', a: '#5a5a62', b: '#7e7e86', c: '#b8b8c0', d: '#3a3a40' });
  sprite('chest_minecart', [
    '................', '................', '.....oooooo.....', '....ohhhhhho....', '....ohkkkkho....', 'o...ohhghhho...o',
    'oaoooooooooooaao', 'oabbbbbbbbbbbbao', 'oabcbbbbbbbbcbao', 'oabbbbbbbbbbbbao', '.oaaaaaaaaaaaao.', '..oooooooooooo..',
    '...ooo....ooo...', '..oddo....oddo..', '...oo......oo...', '................'],
    { o: '#202024', a: '#5a5a62', b: '#7e7e86', c: '#b8b8c0', d: '#3a3a40', h: '#8a5e28', k: '#6a4420', g: '#d8c040' });
})();
