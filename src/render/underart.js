'use strict';
// ---------------------------------------------------------------------------
// Underworld artwork: brimstone, bone sand, sunstone, smoky quartz, the
// fortress bricks, bloodcap crops, the swirling portal sheet and the items
// found down there.
// ---------------------------------------------------------------------------
(function () {
  const { Img, T, ANIM, reg, sprite, rngFor, fnoise, normalize, noiseImg, pal, pick, mul, mix, C, stone, ore, stoneBricks } = TexGen;

  // ---------------- brimstone: lumpy, smouldering red rock ----------------
  reg('brimstone', (() => {
    const rng = rngFor('brimstone');
    const img = new Img();
    const n = normalize(fnoise(rng, 16, 16, [4, 2, 1], [0.35, 0.35, 0.3]));
    const p = pal(['#4c1a19', '#5a201e', '#682624', '#752d2a', '#823431', '#8e3c38', '#99443f']);
    for (let i = 0; i < 256; i++) img.set(i & 15, i >> 4, pick(p, n[i]));
    // dark seams between the lumps
    for (let k = 0; k < 9; k++) {
      let x = rng.nextInt(16), y = rng.nextInt(16);
      for (let j = 0, len = 2 + rng.nextInt(3); j < len; j++) { img.setw(x, y, C('#3a1212')); if (rng.nextBool()) x++; else y++; }
    }
    // a few specks of sulphur and ember
    for (let k = 0; k < 3; k++) img.set(rng.nextInt(16), rng.nextInt(16), C(k ? '#a8482a' : '#c89a3a'));
    return img;
  })());

  // ---------------- bone sand: grit full of old bones ----------------
  reg('bonesand', (() => {
    const img = noiseImg('bonesand', ['#3a2e26', '#45372d', '#504034', '#5b4a3c', '#665445'], { scales: [4, 2, 1], weights: [0.3, 0.3, 0.4] });
    const rng = rngFor('bonesand2');
    const L = C('#d6ceb8'), M = C('#b3a88e'), D = C('#7d725e');
    // little bone shards
    for (let k = 0; k < 4; k++) {
      const x = rng.nextInt(13), y = rng.nextInt(14);
      if (rng.nextBool()) { img.set(x, y, M); img.set(x + 1, y, L); img.set(x + 2, y, L); img.set(x + 3, y, M); img.set(x + 1, y + 1, D); img.set(x + 2, y + 1, D); }
      else { img.set(x, y, M); img.set(x, y + 1, L); img.set(x, y + 2, M); img.set(x + 1, y + 1, D); }
    }
    // and one tiny skull peering out
    const sx = 9, sy = 9;
    for (const [dx, dy, c] of [[0, 0, M], [1, 0, L], [2, 0, L], [3, 0, M], [0, 1, L], [1, 1, D], [2, 1, L], [3, 1, D], [0, 2, M], [1, 2, L], [2, 2, L], [3, 2, M], [1, 3, M], [2, 3, D]]) img.set(sx + dx, sy + dy, c);
    return img;
  })());

  // ---------------- sunstone: glowing amber facets ----------------
  reg('sunstone', (() => {
    const rng = rngFor('sunstone');
    const img = new Img();
    const pts = [];
    for (let i = 0; i < 9; i++) pts.push([rng.nextFloat() * 16, rng.nextFloat() * 16, rng.nextFloat()]);
    const p = pal(['#9a6416', '#b47e1e', '#cc982a', '#e2b23c', '#f2c852', '#fcdc78', '#fff2b8']);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      // nearest two seeds (wrapping) make crystal cells with darker borders
      let d1 = 1e9, d2 = 1e9, v = 0;
      for (const [px, py, pv] of pts) {
        let dx = Math.abs(x + 0.5 - px), dy = Math.abs(y + 0.5 - py);
        if (dx > 8) dx = 16 - dx; if (dy > 8) dy = 16 - dy;
        const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; v = pv; } else if (d < d2) d2 = d;
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      let t = 0.3 + v * 0.55 - Math.sqrt(d1) * 0.04;
      if (edge < 0.7) t -= 0.22;
      img.set(x, y, pick(p, Math.max(0, Math.min(0.999, t))));
    }
    for (let k = 0; k < 6; k++) img.set(rng.nextInt(16), rng.nextInt(16), C('#fff8d8'));
    return img;
  })());

  // ---------------- smoky quartz ----------------
  reg('quartz_ore', ore('quartz_ore', T.brimstone, ['#857d78', '#c4bcb5', '#efe8e1'], { clusters: 6, outline: true }));
  const quartzBase = (name) => {
    const img = noiseImg(name, ['#aaa29b', '#b2aaa3', '#b9b2ab', '#c0b9b2', '#c6c0b9'], { scales: [8, 4, 2], weights: [0.4, 0.4, 0.2] });
    const rng = rngFor(name + '_smoke');
    // a faint wisp of smoke trapped in the stone
    let x = rng.nextInt(16), y = rng.nextInt(16);
    for (let j = 0; j < 9; j++) { img.setw(x, y, mul(img.get(x, y), 0.9)); x++; if (rng.nextInt(3) === 0) y++; }
    return img;
  };
  reg('quartz_side', (() => {
    const img = quartzBase('quartz_side');
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#d2ccc6')); img.set(i, 15, C('#968e87')); }
    return img;
  })());
  reg('quartz_top', (() => {
    const img = quartzBase('quartz_top');
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#d2ccc6')); img.set(0, i, C('#d2ccc6')); img.set(i, 15, C('#968e87')); img.set(15, i, C('#968e87')); }
    return img;
  })());
  reg('quartz_chiseled', (() => {
    const img = quartzBase('quartz_chis');
    const L = C('#d6d0ca'), D = C('#8a827b');
    for (let i = 0; i < 16; i++) { img.set(i, 0, L); img.set(i, 15, D); img.set(i, 3, D); img.set(i, 4, L); img.set(i, 11, D); img.set(i, 12, L); }
    // a carved diamond band
    for (let i = 0; i < 4; i++) { img.set(3 + i, 7 - i, D); img.set(3 + i, 8 + i, D); img.set(12 - i, 7 - i, D); img.set(12 - i, 8 + i, D); }
    img.rect(7, 7, 2, 2, D);
    return img;
  })());
  reg('quartz_chiseled_top', (() => {
    const img = quartzBase('quartz_chist');
    const L = C('#d6d0ca'), D = C('#8a827b');
    for (let i = 1; i < 15; i++) { img.set(i, 1, L); img.set(1, i, L); img.set(i, 14, D); img.set(14, i, D); }
    for (let i = 4; i < 12; i++) { img.set(i, 4, D); img.set(4, i, D); img.set(i, 11, L); img.set(11, i, L); }
    return img;
  })());
  reg('quartz_pillar', (() => {
    const img = quartzBase('quartz_pil');
    for (let y = 0; y < 16; y++) { img.set(0, y, C('#d2ccc6')); img.set(15, y, C('#8e867f')); img.set(5, y, C('#9c948d')); img.set(10, y, C('#9c948d')); img.set(6, y, C('#ccc6c0')); img.set(11, y, C('#ccc6c0')); }
    return img;
  })());
  reg('quartz_pillar_top', (() => {
    const img = quartzBase('quartz_pilt');
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#8e867f')); img.set(0, i, C('#8e867f')); img.set(i, 15, C('#8e867f')); img.set(15, i, C('#8e867f')); }
    for (let i = 3; i < 13; i++) { img.set(i, 3, C('#9c948d')); img.set(3, i, C('#9c948d')); img.set(i, 12, C('#ccc6c0')); img.set(12, i, C('#ccc6c0')); }
    return img;
  })());

  // ---------------- brimstone bricks: small dark fortress bricks ----------------
  reg('brimstone_bricks', (() => {
    const rng = rngFor('brimbricks');
    const img = new Img().fill(C('#1c0708'));
    const P = pal(['#3a1012', '#421316', '#4a161a', '#52191d', '#5a1c20']);
    for (let row = 0; row < 4; row++) {
      const off = (row % 2) * 3;
      for (let bx = -1; bx < 4; bx++) {
        const x0 = bx * 6 + off, tone = rng.nextFloat() * 0.5;
        for (let y = row * 4; y < row * 4 + 3; y++) for (let x = x0; x < x0 + 5; x++) {
          if (x < 0 || x >= 16) continue;
          let v = tone + rng.nextFloat() * 0.45;
          if (y === row * 4) v += 0.2;
          img.set(x, y, pick(P, Math.min(0.999, v)));
        }
      }
    }
    return img;
  })());

  // ---------------- bone block ----------------
  reg('bone_block_side', (() => {
    const img = noiseImg('bone_side', ['#d0c9b4', '#d8d1bd', '#dfd9c6', '#e6e0ce'], { scales: [8, 2, 1], weights: [0.3, 0.3, 0.4] });
    for (let x = 0; x < 16; x++) for (const y of [3, 4, 11, 12]) img.set(x, y, C(y === 3 || y === 11 ? '#b8b09a' : '#ece6d6'));
    return img;
  })());
  reg('bone_block_top', (() => {
    const img = noiseImg('bone_top', ['#d0c9b4', '#d8d1bd', '#dfd9c6', '#e6e0ce'], { scales: [4, 2, 1], weights: [0.3, 0.3, 0.4] });
    // three marrow holes
    for (const [x, y] of [[3, 3], [10, 5], [5, 11]]) { img.rect(x, y, 3, 3, C('#a89f86')); img.set(x + 1, y + 1, C('#7d745e')); }
    return img;
  })());

  // ---------------- bloodcap: a blood-red fungus farmed on bone sand ----------------
  const BC = { s: '#6e2a1c', S: '#8c3a26', r: '#7a0e14', R: '#b0161e', h: '#e0464a', w: '#f0d8c8' };
  sprite('bloodcap_0', [
    '................', '................', '................', '................', '................', '................',
    '................', '................', '................', '................', '................', '................',
    '..r.......R.....', '..Rr...r..r..R..', '..s...rR..s..s..', '..s...s...s..s..'], BC);
  sprite('bloodcap_1', [
    '................', '................', '................', '................', '................', '................',
    '................', '................', '................', '..rR........r...', '.rRRr...rR..Rr..', '..ss...rRRr.Rh..',
    '..sS....sS...s..', '..sS....sS...s..', '..sS....sS...s..', '..sS....sS...s..'], BC);
  sprite('bloodcap_2', [
    '................', '................', '................', '................', '................', '.........rRr....',
    '..rRr..........r', '.rRhRr..rRRRr.rR', '.rRRRr..rRhRRr.R', '...S....rRRRr..s', '...S.....sS....s',
    '...S.....sS...rR', '..sS.....sS..rRh', '..sS.....sS...sS', '..sS.....sS...sS', '..sS.....sS...sS'], BC);
  sprite('bloodcap_3', [
    '................', '........rRRr....', '..rRRr.rRhwRr...', '.rRwhRrrRRRRRr..', '.rRRRRRrrRRRRr..', '..rrrr...rsSr...',
    '...sS.....sS..rR', '...sS..rRr.sSrRh', '...sS.rRwRrsSrRR', '..sSS.rRRRr.sS.s', '..sS...sS...sS.s',
    '..sS...sS..sSS.s', '.sSS...sS..sS..s', '.sS....sS..sS.sS', '.sS...sSS..sS.sS', '.sS...sS...sS.sS'], BC);

  // ---------------- the portal sheet: two slow, opposed swirls ----------------
  function PortalAnim() {
    let t = 0;
    this.step = function () { t++; };
    this.render = function (img) {
      const ph = t / 40 * Math.PI * 2;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        let s = 0;
        for (let k = 0; k < 2; k++) {
          const cx = k ? 11.5 : 3.5, cy = k ? 3.5 : 11.5;
          const dx = ((x + 0.5 - cx + 24) % 16) - 8, dy = ((y + 0.5 - cy + 24) % 16) - 8;
          const d = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx);
          const f = Math.max(0, 1 - d / 8);
          s += Math.sin(a * 3 * (k ? 1 : -1) + d * 1.1 - ph * (k ? 1 : -1)) * f * f;
        }
        s += Math.sin((x + y) * 0.785 + ph * 0.5) * 0.15;
        const v = Math.max(0, Math.min(1, 0.45 + s * 0.6));
        const i = (y * 16 + x) * 4;
        img.d[i] = 60 + v * v * 160; img.d[i + 1] = 10 + v * v * v * 150; img.d[i + 2] = 120 + v * 135; img.d[i + 3] = 150 + v * 90;
      }
    };
  }
  ANIM.portal = new PortalAnim();
  { const img = new Img(); ANIM.portal.render(img); reg('portal', img); }

  // ---------------- items ----------------
  sprite('sunstone_dust', [
    '................', '................', '................', '................', '................', '.......c........',
    '......cbc...c...', '.....cbbbc.cbc..', '....cbbabbcbbc..', '...cbbaabbbabc..', '..cbbaaaabbaabc.', '.cbaaoaaaaaaaabc',
    '.baaooaaoaaoaaab', '..aooooooooooaa.', '................', '................'],
    { o: '#8a5a10', a: '#d29a30', b: '#f0c45a', c: '#fff2b8' });
  sprite('smoky_quartz', [
    '................', '................', '........o.......', '.......oco......', '......ocbao.....', '.....ocbbaao....',
    '....ocbbbaao....', '....obbbaaao....', '...ocbbaaaao.o..', '...obbbaaao.oco.', '..ocbbaaaao.obao',
    '..obbbaaaoo.obao', '..oaaaaaoo..oaao', '...ooooo.....oo.', '................', '................'],
    { o: '#4a4440', a: '#8f8780', b: '#bdb5ae', c: '#efe9e3' });
  sprite('brimstone_brick', [
    '................', '................', '................', '................', '................', '..oooooooooooo..',
    '.ocbbbbbbbbbbbo.', '.obbbabbbbabbao.', '.obaaaaaaaaaaao.', '.oaaaaaaaaaaaao.', '..oooooooooooo..',
    '................', '................', '................', '................', '................'],
    { o: '#1a0606', a: '#4a161a', b: '#62202a', c: '#7e3238' });
  sprite('wailer_tear', [
    '................', '................', '.......o........', '.......o........', '......oco.......', '......oco.......',
    '.....ocbbo......', '.....obbbo......', '....ocbbbao.....', '....obbbbao.....', '....obbbaao.....', '....oabaaao.....',
    '.....oaaao......', '......ooo.......', '................', '................'],
    { o: '#5a6a78', a: '#a8c4d8', b: '#d8ecf8', c: '#ffffff' });
  sprite('flare_rod', [
    '................', '.............oo.', '............ocbo', '...........ocbao', '..........ocbao.', '.........ocbao..',
    '........ocbao...', '.......ocbao....', '......ocbao.....', '.....ocbao......', '....ocbao.......', '...ocbao........',
    '..ocbao.........', '.obbao..........', '.oaao...........', '..oo............'],
    { o: '#6a2a00', a: '#e07a10', b: '#ffb82a', c: '#fff4a0' });
  sprite('flare_powder', [
    '................', '................', '................', '................', '................', '.......c.....c..',
    '......cbc...cbc.', '.....cbbbc.cbbc.', '....cbbabbcbbbc.', '...cbbaabbbbabc.', '..cbbaaaabbaaabc', '.cbaaoaaaaaaaaab',
    '.baaooaaoaaoaaab', '..aooooooooooaa.', '................', '................'],
    { o: '#8a2a00', a: '#e06a10', b: '#ffa42a', c: '#ffe890' });
  sprite('magma_cream', [
    '................', '................', '................', '.....oooooo.....', '....oabbbbao....', '...oabccbbbao...',
    '...obcyybbbbo...', '...obbyybbabo...', '...obbbbbbaao...', '...oabbbabaao...', '....oaaaaaao....', '.....oooooo.....',
    '................', '................', '................', '................'],
    { o: '#1a0a06', a: '#5a1a0a', b: '#c84a12', c: '#ff8a2a', y: '#ffd860' });
  sprite('item_bloodcap', [
    '................', '................', '................', '.....oooooo.....', '....orRRhRro....', '...orRwhRRRro...',
    '...oRRRRRRwRo...', '...orRRRRRRro...', '....oooSsooo....', '......oSso......', '......oSso......', '.....oSSso......',
    '.....oSsso......', '......ooo.......', '................', '................'],
    { o: '#2a0606', r: '#7a0e14', R: '#b0161e', h: '#e0464a', w: '#f0d8c8', s: '#6e2a1c', S: '#8c3a26' });
  sprite('fire_charge', [
    '................', '................', '................', '.....oooooo.....', '....oaabbaao....', '...oabccbbbao...',
    '...obcyybaabo...', '...oaybaaccao...', '...oabaaacyao...', '...oaabccbbao...', '....oaabaaao....', '.....oooooo.....',
    '................', '................', '................', '................'],
    { o: '#100808', a: '#2a1a14', b: '#4a2a1a', c: '#e05a10', y: '#ffc040' });
})();
