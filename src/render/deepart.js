'use strict';
// ---------------------------------------------------------------------------
// Artwork for the deep caves: deepstone and the dressed stone of the
// forgotten cities, cave moss and glow vines, the living hushmoss with its
// sensors and shriekers, pale lanterns, the gate keystone and the sifting
// light of the gate to the Sift.
// ---------------------------------------------------------------------------
(function () {
  const { Img, T, ANIM, reg, sprite, rngFor, noiseImg, fnoise, normalize, pal, pick, C, mix, stoneBricks } = TexGen;

  // ---- deepstone: dark, layered, cold ----
  reg('deepstone', (() => {
    const rng = rngFor('deepstone'), img = new Img();
    const n = normalize(fnoise(rng, 16, 16, [8, 4, 2, 1], [0.2, 0.3, 0.3, 0.2]));
    const p = pal(['#26292f', '#2c2f36', '#32363e', '#383c45', '#3f434c', '#474b55']);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { let v = n[y * 16 + x]; if (y % 4 === 1) v *= 0.7; img.set(x, y, pick(p, v)); }
    for (let k = 0; k < 6; k++) { const y = rng.nextInt(16), x = rng.nextInt(12); for (let j = 0; j < 2 + rng.nextInt(4); j++) img.setw(x + j, y, C('#1e2026')); }
    for (let k = 0; k < 4; k++) img.set(rng.nextInt(16), rng.nextInt(16), C('#5a5f6b'));
    return img;
  })());
  reg('deepstone_top', noiseImg('deepstone_top', ['#2a2d34', '#30333b', '#363a42', '#3d4149', '#454952'], { scales: [4, 2, 1], weights: [0.3, 0.4, 0.3] }));
  reg('deepstone_bricks', stoneBricks('dsbrick', ['#30333a', '#353840', '#3a3e46', '#40444d'], '#1f2227', '#4d515b'));
  reg('deepstone_tiles', (() => {
    const img = noiseImg('dstile', ['#30333a', '#353840', '#3a3e46', '#40444d'], { scales: [4, 1], weights: [0.4, 0.6] });
    for (let i = 0; i < 16; i++) for (const k of [0, 8]) { img.set(i, k, C('#4b4f59')); img.set(k, i, C('#4b4f59')); img.set(i, k + 7, C('#1d2025')); img.set(k + 7, i, C('#1d2025')); }
    return img;
  })());
  reg('deepstone_chiseled', (() => {
    const img = T.deepstone_bricks.copy().fill(C('#363a42'));
    const rng = rngFor('dschisel');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, pick(pal(['#31343c', '#363a42', '#3b3f47']), rng.nextFloat()));
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#4d515b')); img.set(0, i, C('#4d515b')); img.set(i, 15, C('#1d2025')); img.set(15, i, C('#1d2025')); }
    // an old sigil: an eye inside a ring, worn smooth
    for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 4.6 && d < 5.6) img.set(x, y, C('#24272d'));
      if (Math.abs(y - 7.5) < 1.2 && Math.abs(x - 7.5) < 3.2) img.set(x, y, C('#24272d'));
      if (d < 1.1) img.set(x, y, C('#2a8f8a'));
    }
    return img;
  })());
  reg('deepstone_cracked', (() => {
    const img = T.deepstone_bricks.copy(), rng = rngFor('dscrack');
    for (let k = 0; k < 3; k++) { let x = 2 + rng.nextInt(12), y = rng.nextInt(16); for (let j = 0; j < 7; j++) { img.setw(x, y, C('#15171b')); x += rng.nextInt(3) - 1; y++; } }
    return img;
  })());
  // reinforced deepstone: banded and riveted, a thread of cold light in the seams
  reg('deepstone_reinforced', (() => {
    const img = T.deepstone.copy();
    for (let x = 0; x < 16; x++) for (const y of [2, 13]) { img.set(x, y, C('#5d6370')); img.set(x, y + 1, C('#3a3e48')); }
    for (const [x, y] of [[1, 2], [7, 2], [14, 2], [1, 13], [7, 13], [14, 13]]) img.set(x, y, C('#9aa3b3'));
    for (let y = 4; y < 13; y++) { img.set(7, y, C('#0f3c3e')); img.set(8, y, (y % 3) ? C('#1b8f8a') : C('#2fd6cd')); }
    return img;
  })());
  reg('deepstone_reinforced_top', (() => {
    const img = T.deepstone_top.copy();
    for (let i = 1; i < 15; i++) { img.set(i, 1, C('#5d6370')); img.set(1, i, C('#5d6370')); img.set(i, 14, C('#3a3e48')); img.set(14, i, C('#3a3e48')); }
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) img.set(x, y, (x === 6 || y === 6) ? C('#1b8f8a') : C('#2fd6cd'));
    return img;
  })());

  // ---- the green caves ----
  reg('cave_moss', (() => {
    const img = noiseImg('cave_moss', ['#3e5f22', '#4a6b2a', '#567a30', '#628a36', '#6e9a3e', '#7aa846'], { scales: [4, 2, 1], weights: [0.3, 0.35, 0.35], jitter: 0.25 });
    const rng = rngFor('cave_moss2');
    for (let k = 0; k < 10; k++) img.set(rng.nextInt(16), rng.nextInt(16), C('#8cbc52'));
    return img;
  })());
  const vineRows = [
    '.......vv.......', '......vvl.......', '.......v........', '......lv........', '.....llv........', '.......vv.......', '........v.......', '........vll.....',
    '........v.......', '.......vv.......', '.......v........', '.....lvv........', '......lv........', '.......v........', '.......vv.......', '........v.......'];
  sprite('glow_vine', vineRows, { v: '#4f7a2e', l: '#6b9a3a' });
  const berryRows = vineRows.slice();
  berryRows[3] = '...ObO.lv.......'; berryRows[4] = '...bbbllv.......'; berryRows[5] = '....O..vvObO....';
  berryRows[6] = '........vbbb....'; berryRows[11] = '...ObOlvv.......'; berryRows[12] = '...bbb.lv.......';
  sprite('glow_vine_berries', berryRows, { v: '#4f7a2e', l: '#6b9a3a', b: '#ffd166', O: '#ff9e2c' });

  // ---- hushmoss: dark and alive, its specks pulsing slowly ----
  function HushAnim() {
    const rng = rngFor('hushmoss');
    const base = normalize(fnoise(rng, 16, 16, [4, 2, 1], [0.4, 0.35, 0.25]));
    const p = pal(['#071114', '#0a171b', '#0d1d22', '#102429', '#132b31']);
    const spots = Array.from({ length: 11 }, () => [rng.nextInt(16), rng.nextInt(16), rng.nextFloat() * 6.28, 0.04 + rng.nextFloat() * 0.05]);
    let t = 0;
    this.step = function () { t++; };
    this.render = function (img) {
      for (let i = 0; i < 256; i++) { const c = pick(p, base[i]); const k = i * 4; img.d[k] = c[0]; img.d[k + 1] = c[1]; img.d[k + 2] = c[2]; img.d[k + 3] = 255; }
      for (const [x, y, ph, sp] of spots) {
        const g = 0.35 + 0.65 * Math.max(0, Math.sin(t * sp + ph));
        const c = mix(C('#0e4a4a'), C('#5ff7ee'), g);
        img.set(x, y, c);
        if (g > 0.75) { img.set((x + 1) & 15, y, mix(c, C('#0e3438'), 0.5)); img.set(x, (y + 1) & 15, mix(c, C('#0e3438'), 0.5)); }
      }
    };
  }
  ANIM.hushmoss = new HushAnim();
  { const img = new Img(); ANIM.hushmoss.render(img); reg('hushmoss', img); }
  reg('hush_sensor_side', (() => {
    const img = new Img();
    for (let y = 8; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, (x + y) % 5 === 0 ? C('#16353a') : C('#0d2025'));
    for (let x = 0; x < 16; x++) img.set(x, 8, C('#2a6f70'));
    for (const x of [3, 7, 12]) img.set(x, 11, C('#3fe0d6'));
    return img;
  })());
  reg('hush_sensor_top', (() => {
    const img = new Img().fill(C('#0d2025'));
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d > 4 && d < 5.4) img.set(x, y, C('#2a6f70')); if (d < 2) img.set(x, y, C('#3fe0d6')); }
    return img;
  })());
  sprite('hush_tendril', [
    '................', '..c.........c...', '..c.........c...', '..cc.......cc...', '...c.......c....', '...c...c...c....', '...c...c..cc....', '...cc..c..c.....',
    '....c..cc.c.....', '....c...c.c.....', '....cc..c.c.....', '.....c..ccc.....', '.....c...c......', '.....cc..c......', '......cccc......', '.......cc.......'],
    { c: '#3fe0d6' });
  reg('hush_shrieker_side', (() => {
    const img = new Img();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, y < 8 ? (((x * 3 + y) % 4) ? C('#d6d0bd') : C('#bdb6a0')) : (((x + y) % 5) ? C('#0d2025') : C('#16353a')));
    for (let x = 0; x < 16; x++) img.set(x, 8, C('#8e8673'));
    return img;
  })());
  reg('hush_shrieker_top', (() => {
    const img = new Img().fill(C('#d6d0bd'));
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d < 5.2) img.set(x, y, d < 3 ? C('#05090a') : C('#0e2a2e'));
      if (d >= 3 && d < 4 && (x + y) % 2 === 0) img.set(x, y, C('#3fe0d6'));
    }
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#efe9d6')); img.set(0, i, C('#efe9d6')); img.set(i, 15, C('#a29b86')); img.set(15, i, C('#a29b86')); }
    return img;
  })());

  // ---- pale lantern: a cold flame behind dark iron ----
  // (the block's boxes map their faces onto fixed parts of this: the body's sides onto
  // columns 5-10, rows 9-15, the cap onto rows 7-8, tops and bottoms onto the dark corner)
  reg('pale_lantern', (() => {
    const img = new Img();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c = (x + y) % 5 === 0 ? C('#353943') : C('#2b2e35');
      if (y === 7) c = C('#4a4f5a');
      if (y >= 9 && x >= 5 && x <= 10) {
        if (x === 5 || x === 10 || y === 9) c = y === 9 ? C('#4a4f5a') : C('#2b2e35');
        else if (y === 15) c = C('#1b1d22');
        else { const d = Math.hypot(x - 7.5, (y - 12) * 0.9); c = d < 1.3 ? C('#f2fdff') : d < 2.3 ? C('#a8eef9') : C('#5fb4c8'); }
      }
      img.set(x, y, c);
    }
    return img;
  })());
  sprite('item_pale_lantern', [
    '................', '.......oo.......', '......o..o......', '.......oo.......', '.....oooooo.....', '....oiiiiiio....', '....oiggggio....', '....oigffgio....',
    '....oigffgio....', '....oiggggio....', '....oiiiiiio....', '....oooooooo....', '................', '................', '................', '................'],
    { o: '#2b2e35', i: '#4a4f5a', g: '#7fd2e2', f: '#f2fdff' });

  // ---- the gate keystone and the gate itself ----
  reg('gate_keystone_top', (() => {
    const img = T.deepstone_reinforced_top.copy();
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) img.set(x, y, (x === 4 || y === 4) ? C('#0b0d10') : C('#14171c'));
    return img;
  })());
  reg('gate_keystone_lit', (() => {
    const img = T.gate_keystone_top.copy();
    for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) { const d = Math.hypot(x - 7.5, y - 7.5); img.set(x, y, d < 1.6 ? C('#e8fffd') : d < 2.8 ? C('#5ff7ee') : C('#1b8f8a')); }
    return img;
  })());
  // the gate to the Sift is drawn by a shader of its own (see SHADERS.gateFS): this is only
  // what its dust looks like
  reg('sift_gate', (() => {
    const img = new Img(), rng = new Noise.Random(9090);
    for (let i = 0; i < 256; i++) { const v = 40 + rng.nextFloat() * 50; img.d[i * 4] = v; img.d[i * 4 + 1] = v; img.d[i * 4 + 2] = v + 14; img.d[i * 4 + 3] = 255; }
    for (let k = 0; k < 18; k++) { const i = Math.floor(rng.nextFloat() * 256) * 4; img.d[i] = img.d[i + 1] = 230; img.d[i + 2] = 240; }
    return img;
  })());

  // ---- items ----
  sprite('glowberry', [
    '................', '................', '.......v........', '......vv........', '.....v..v.......', '....oO...oO.....', '...obbO.obbO....', '...obwbOobwbO...',
    '...obbbOobbbO...', '....obbO.obbO...', '.....oO...oO....', '.........oO.....', '........obbO....', '........obbO....', '.........oO.....', '................'],
    { v: '#4f7a2e', o: '#c26a12', O: '#ff9e2c', b: '#ffd166', w: '#fff6c8' });
  sprite('hush_shard', [
    '................', '.........o......', '........oco.....', '.......occo.....', '......occwo.....', '.....occwco.....', '....occwcco.....', '....occccco.....',
    '...occcccdo.....', '...occccddo.....', '..occcddddo.....', '..occddddo......', '..odddddo.......', '...ooooo........', '................', '................'],
    { o: '#0a2a2c', c: '#3fe0d6', w: '#c8fffb', d: '#1b8f8a' });
  sprite('echo_heart', [
    '................', '................', '...ooo....ooo...', '..oddo...oddo...', '.oddddo.oddddo..', '.oddcccooocccdo.', '.odcccwwccccddo.', '.odccwwcccccddo.',
    '..odcccccccddo..', '...odcccccddo...', '....odcccddo....', '.....odcddo.....', '......oddo......', '.......oo.......', '................', '................'],
    { o: '#05090a', d: '#0e2a2e', c: '#2fd6cd', w: '#e8fffd' });
  sprite('echo_fork', ['................', '...........o....', '..........oco...', '.........oco.o..', '........oio.oco.', '.......oio.oco..', '......oiioolo...', '.......oiilo....',
    '......ohilo.....', '.....ohioo......', '....ohho........', '...ohho.........', '..ohho..........', '...oo...........', '................', '................'],
    { o: '#161a1e', i: '#aab4be', l: '#e4ecf2', c: '#5ff7ee', h: '#2c4a4c' });
})();
