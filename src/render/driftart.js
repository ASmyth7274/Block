'use strict';
// ---------------------------------------------------------------------------
// Artwork for the Drift Isles beyond the gulf: star moss on the starstone,
// glimmerwood leaves full of light, moonpetals, drift grass, starvines and
// their fruit; the drift glider and the orrery gear.
// ---------------------------------------------------------------------------
(function () {
  const { Img, T, reg, sprite, rngFor, noiseImg, C, mix } = TexGen;
  // star moss: a soft violet nap, flecked with pale points of light
  reg('star_moss_top', (() => {
    const img = noiseImg('star_moss_top', ['#4a3e78', '#544684', '#5e4e90', '#68589a', '#7262a4'], { scales: [4, 2, 1], weights: [0.3, 0.35, 0.35] });
    const rng = rngFor('star_moss_top2');
    for (let k = 0; k < 6; k++) img.set(rng.nextInt(16), rng.nextInt(16), C('#d8ccff'));
    for (let k = 0; k < 4; k++) img.set(rng.nextInt(16), rng.nextInt(16), C('#3a2e62'));
    return img;
  })());
  reg('star_moss_side', (() => {
    const img = T.starstone.copy(), top = T.star_moss_top, rng = rngFor('star_moss_side');
    for (let x = 0; x < 16; x++) {
      const h = 2 + rng.nextInt(3) + ((x * 7) % 3 === 0 ? 1 : 0);
      for (let y = 0; y < h; y++) { const i = (y * 16 + x) * 4; img.set(x, y, [top.d[i], top.d[i + 1], top.d[i + 2]]); }
    }
    return img;
  })());
  // glimmer leaves: deep blue-violet, full of small lights (not tinted by the biome)
  reg('glimmer_leaves', (() => {
    const img = new Img(), rng = rngFor('glimmer_leaves');
    const P = [C('#383478'), C('#433e88'), C('#4e4898'), C('#5a54a8'), C('#6a62bc')];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (rng.nextInt(5) === 0) { img.set(x, y, [0, 0, 0], 0); continue; }
      img.set(x, y, P[rng.nextInt(P.length)]);
    }
    for (let k = 0; k < 7; k++) { const x = rng.nextInt(16), y = rng.nextInt(16); img.set(x, y, k % 3 ? C('#b8e8ff') : C('#fff4c0')); }
    return img;
  })());
  reg('leaves_glimmer', T.glimmer_leaves.copy());
  sprite('moonpetal', [
    '................', '................', '.....w....w.....', '....wWw..wWw....', '.....wcwwcw.....', '...wwwcyycwww...', '..wWWwcyycwWWw..', '...wwwccccwww...',
    '.....wcwwcw.....', '....wWw.gwWw....', '.....w..g.w.....', '........g.......', '.......gg.......', '.......g.g......', '......g...g.....', '................'],
    { w: '#d8d4f8', W: '#ffffff', c: '#a8b8f0', y: '#fff0a8', g: '#5a6a8a' });
  sprite('drift_grass', [
    '................', '................', '................', '.......l........', '...l...l....l...', '...l..ll...l....', '....l.l...l..l..', '....lll..ll.l...',
    '..l..ll.l..ll...', '...l.dl.l.ld....', '....ddldlldd....', '.....ddddld.....', '......dddd......', '.......dd.......', '................', '................'],
    { l: '#b4a8e0', d: '#6c5ea8' });
  sprite('starvine', [
    '.......v........', '.......vv.......', '........v.......', '.......vv.......', '......vv..*.....', '......v.........', '.......v........', '.......vv.......',
    '........v.......', '...*...vv.......', '.......v........', '......vv........', '......v.........', '.......v...*....', '.......vv.......', '........v.......'],
    { v: '#7a6cc8', '*': '#e8f0ff' });
  sprite('starvine_fruit', [
    '.......v........', '.......vv.......', '........v.......', '.......vv.......', '......vv........', '......v.........', '.....ffff.......', '....fFFFFf......',
    '....fFwFFf......', '....fFFFFf......', '.....ffff.......', '......vv........', '......v.........', '.......v........', '.......vv.......', '........v.......'],
    { v: '#7a6cc8', f: '#d8a840', F: '#ffe080', w: '#fffbe8' });
  sprite('sapling_glimmer', [
    '................', '......b.........', '.....bBb..b.....', '....bB*Bbbb.....', '.....bBb.bBb....', '..b...bt.b*b....', '.bBb...t..b.....', '..b.b..t........',
    '....bBbt........', '....b*bt........', '.....b.t........', '.......t........', '.......t........', '.......t........', '................', '................'],
    { b: '#3e3e8c', B: '#5a58b0', '*': '#fff4c0', t: '#8c86ac' });
  // ---- items ----
  sprite('starfruit', [
    '................', '................', '.......s........', '......ss........', '.....oooo.......', '...ooYYYYoo.....', '..oYYWYYYYYo....', '..oYWWYYYYYo....',
    '..oYYYYYYYYo....', '..oYYYYYYYYo....', '...oYYYYYYo.....', '....ooYYoo......', '......oo........', '................', '................', '................'],
    { s: '#6c5ea8', o: '#a07818', Y: '#f0c848', W: '#fffbe0' });
  sprite('drift_glider', [
    '................', '..rr........rr..', '.rSSr......rSSr.', '.rSSSr....rSSSr.', '.rSsSSr..rSSsSr.', '.rSSsSSrrSSsSSr.', '.rSSSsSSSSsSSSr.', '.rSSSSsSSsSSSSr.',
    '.rSSSSSssSSSSSr.', '.rSSSSSSSSSSSSr.', '..rSSSSSSSSSSr..', '...rrSSSSSSrr...', '.....rrSSrr.....', '.......rr.......', '................', '................'],
    { r: '#4a4470', S: '#d8d2f0', s: '#8a82b8' });
  sprite('orrery_gear', [
    '................', '......oo........', '...o.oGGo.o.....', '..oGoGGGGoGo....', '...oGGggGGo.....', '.ooGGgccgGGoo...', '.oGGgcwwcgGGo...', '..oGgcwwcgGo....',
    '.oGGgcccggGGo...', '.ooGGgggGGGoo...', '...oGGGGGGo.....', '..oGo.GG.oGo....', '...o..oo..o.....', '................', '................', '................'],
    { o: '#5a3e14', G: '#c8962e', g: '#8a6420', c: '#3a2a10', w: '#fff0a0' });
  void mix;
})();
