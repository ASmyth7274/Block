'use strict';
// ---------------------------------------------------------------------------
// Artwork for the Sift, where lost things go: grey sift sand and the banded
// siltstone beneath it, siltstone bricks, pale sift glass, dune grass, and
// the odds and ends found there (lost letters, the wayback compass, sifter
// scales, silent boots).
// ---------------------------------------------------------------------------
(function () {
  const { Img, T, reg, sprite, rngFor, noiseImg, C, stoneBricks, normalize, fnoise, pal, pick } = TexGen;
  // fine grey sand with a faint lavender cast, the odd grain catching the light
  reg('sift_sand', (() => {
    const img = noiseImg('sift_sand', ['#8c8898', '#94909f', '#9b97a6', '#a29eac', '#aaa6b4'], { scales: [4, 2, 1], weights: [0.25, 0.35, 0.4], jitter: 0.2 });
    const rng = rngFor('sift_sand2');
    for (let k = 0; k < 9; k++) img.set(rng.nextInt(16), rng.nextInt(16), C('#7a7686'));
    for (let k = 0; k < 5; k++) img.set(rng.nextInt(16), rng.nextInt(16), C('#e6e2ee'));
    return img;
  })());
  // siltstone: the sand pressed down into thin grey-violet layers
  const BANDS = ['#6e6878', '#76707f', '#655f6e', '#7c7686', '#6a6474', '#726c7b', '#5f5968', '#78727f'];
  reg('siltstone', (() => {
    const img = new Img(), rng = rngFor('siltstone');
    const n = normalize(fnoise(rng, 16, 16, [4, 2], [0.5, 0.5]));
    for (let y = 0; y < 16; y++) {
      const base = C(BANDS[(y >> 1) % BANDS.length]);
      for (let x = 0; x < 16; x++) { const k = 0.9 + n[y * 16 + x] * 0.2; img.set(x, y, [base[0] * k, base[1] * k, base[2] * k]); }
    }
    for (let k = 0; k < 4; k++) { const x = rng.nextInt(14), y = rng.nextInt(16); img.set(x, y, C('#58525f')); img.set(x + 1, y, C('#58525f')); }
    return img;
  })());
  reg('siltstone_top', noiseImg('siltstone_top', ['#625c6c', '#6a6474', '#716b7b', '#78727f', '#7e7886'], { scales: [4, 2, 1], weights: [0.3, 0.4, 0.3] }));
  reg('siltstone_bricks', stoneBricks('siltbrick', ['#6c6676', '#736d7c', '#7a7483', '#807a89'], '#504a58', '#8e8898'));
  reg('siltstone_polished', (() => {
    const img = noiseImg('siltpol', ['#7a7484', '#7e7888', '#827c8c', '#86808f'], { scales: [8, 4], weights: [0.5, 0.5] });
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#948ea0')); img.set(0, i, C('#948ea0')); img.set(i, 15, C('#5c5664')); img.set(15, i, C('#5c5664')); }
    return img;
  })());
  // carved: a sun sinking into a line of dunes, the Sift's old sign
  reg('siltstone_carved', (() => {
    const img = T.siltstone_polished.copy(), D = C('#4c4654'), L = C('#a49eb0');
    for (let y = 3; y <= 9; y++) for (let x = 3; x <= 12; x++) { const d = Math.hypot(x - 7.5, y - 9); if (d < 4.6 && d > 3.4) img.set(x, y, D); }
    for (const [x, y] of [[7, 2], [8, 2], [3, 4], [12, 4], [1, 7], [14, 7]]) img.set(x, y, L);
    for (let x = 2; x <= 13; x++) img.set(x, 10, D);
    for (let x = 2; x <= 13; x++) img.set(x, 12 + ((x >> 2) & 1), D);
    return img;
  })());
  reg('siltstone_cracked', (() => {
    const img = T.siltstone_bricks.copy(), D = C('#423c4a');
    for (const [x, y] of [[3, 1], [4, 2], [4, 3], [5, 4], [5, 5], [11, 9], [10, 10], [10, 11], [9, 12], [9, 13], [13, 3], [12, 4]]) img.set(x, y, D);
    return img;
  })());
  // sift glass: sand that met the gate's light and turned to pale glass
  reg('sift_glass', (() => {
    const img = new Img(), rng = rngFor('sift_glass');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      const streak = (x + y * 2 + Math.floor(rng.nextFloat() * 2)) % 9 === 0;
      img.set(x, y, edge ? C('#e8e4f8') : streak ? C('#f4f2ff') : C('#c8c2e6'), edge ? 200 : streak ? 170 : 80);
    }
    return img;
  })());
  sprite('dune_grass', [
    '................', '................', '......w.........', '......w...w.....', '..w...w..w......', '...w..w.ww......', '...w.ww.w...w...', '....wwg.w..w....',
    '.w..wgg.g.w.....', '..w.gg.gg.w.....', '..wwg..g.ww.....', '...gg..ggw......', '...g...gg.......', '..gg..gg........', '..g...g.........', '................'],
    { w: '#c8c4d0', g: '#8e8a9a' });
  // ---- items ----
  sprite('lost_letter', [
    '................', '................', '................', '..pppppppppppp..', '..pPPPPPPPPPPp..', '..ppPPPPPPPPpp..', '..pPpPPPPPPpPp..', '..pPPpPPPPpPPp..',
    '..pPPPpPPpPPPp..', '..pPPPPrrPPPPp..', '..pPPPrRRrPPPp..', '..pPPPPrrPPPPp..', '..pppppppppppp..', '................', '................', '................'],
    { p: '#9a8e72', P: '#e2d8bc', r: '#7a1a1a', R: '#b8302a' });
  sprite('wayback_compass', [
    '................', '................', '.....oooooo.....', '....oggggggo....', '...oggcccccgo...', '..ogcccccccccgo.', '..ogccccncccgo..', '..ogcccnncccgo..',
    '..ogcccnnccccgo.', '..ogccccccccgo..', '...ogccccccgo...', '....oggggggo....', '.....oooooo.....', '................', '................', '................'],
    { o: '#2a2632', g: '#8a84a0', c: '#cfc8e6', n: '#3fe0d6' });
  sprite('sift_scale', [
    '................', '................', '......oooo......', '....ooSSSSoo....', '...oSSsSSsSSo...', '..oSSsSSSSsSSo..', '..oSsSSllSSsSo..', '..oSSSSllSSSSo..',
    '..oSsSSSSSSsSo..', '...oSSsSSsSSo...', '....oSSSSSSo....', '.....oSSSSo.....', '......oSSo......', '.......oo.......', '................', '................'],
    { o: '#3c3846', S: '#9a94ae', s: '#7a748c', l: '#d8d2ec' });
  sprite('silent_boots', [
    '................', '................', '................', '................', '..oooo....oooo..', '..oLLo....oLLo..', '..oLLo....oLLo..', '..oLLo....oLLo..',
    '..oLLo....oLLo..', '.ooLLo...ooLLo..', 'oLLLLo..oLLLLo..', 'oSSSSo..oSSSSo..', 'oooooo..oooooo..', '................', '................', '................'],
    { o: '#2a2632', L: '#6a5a4a', S: '#9a94ae' });
})();
