'use strict';
// ---------------------------------------------------------------------------
// Textures for ember circuits: wire, ember torches, lever, lamp, relay and
// the note block.
// ---------------------------------------------------------------------------
(function () {
  const { Img, reg, pal, rngFor, sprite, C } = TexGen;
  // wire: grey dust (tinted by power when drawn), a cross and a straight line
  const dust = (name, fn) => {
    const img = new Img(), rng = rngFor(name);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = fn(x, y);
      if (v <= 0) continue;
      if (rng.nextFloat() > v) continue;
      const g = 170 + rng.nextInt(86);
      img.set(x, y, [g, g, g]);
    }
    return reg(name, img);
  };
  dust('ember_wire_cross', (x, y) => {
    const cx = Math.abs(x - 7.5), cy = Math.abs(y - 7.5);
    if (cx < 3.2 && cy < 3.2) return 0.97;
    if ((cx < 2) || (cy < 2)) return cx < 1.1 || cy < 1.1 ? 0.97 : 0.75;
    return 0;
  });
  dust('ember_wire_line', (x, y) => { const d = Math.abs(x - 7.5); return d < 1.1 ? 0.97 : d < 2 ? 0.75 : 0; });
  // ember torches: a dark stick with a glowing (or dead) ember on top
  const etorch = (name, on) => {
    const img = new Img();
    const S = pal(['#4f3a22', '#6b5232', '#8a6b3e']);
    for (let y = 8; y < 16; y++) { img.set(7, y, S[1]); img.set(8, y, y % 3 === 0 ? S[2] : S[0]); }
    if (on) {
      img.set(7, 6, C('#ffd0a0')); img.set(8, 6, C('#ff7a30'));
      img.set(7, 7, C('#ff5a1a')); img.set(8, 7, C('#c8280c'));
      img.set(7, 5, C('#ffb080'), 150); img.set(8, 5, C('#ff7040'), 110);
      img.set(6, 6, C('#ff5020'), 90); img.set(9, 7, C('#ff5020'), 90);
    } else {
      img.set(7, 6, C('#6a2a1a')); img.set(8, 6, C('#4a1a10'));
      img.set(7, 7, C('#5a2014')); img.set(8, 7, C('#3a120a'));
    }
    return reg(name, img);
  };
  etorch('ember_torch_on', true);
  etorch('ember_torch_off', false);
  // lever handle (plain wood) and the inventory sprite
  reg('lever_stick', TexGen.noiseImg('lever_stick', ['#5e4320', '#6b5232', '#7a5e38', '#896c3d'], { scales: [4, 1], weights: [0.4, 0.6] }));
  sprite('item_lever', [
    '................', '................', '..........oo....', '.........ojo....', '........ojo.....', '.......ojo......',
    '......ojo.......', '.....oHo........', '....oHo.........', '...cccccccc.....', '..cdcccdcccc....', '..cccdccccdc....',
    '..cddccdcccd....', '..cccccccccc....', '................', '................'], { o: '#2e2010', j: '#896c3d', H: '#5e4320', c: '#7a7a7a', d: '#5a5a5a' });
  // ember lamp: a copper frame around dark glass that blazes when powered
  const lamp = (name, on) => {
    const img = new Img(), rng = rngFor(name);
    const F = pal(['#4a2a14', '#6e3e1c', '#9a5a2a']);
    const G = on ? pal(['#ff8a3a', '#ffb060', '#ffd890', '#fff0c8']) : pal(['#3a1a10', '#4e2414', '#5e2e1a', '#6e3a22']);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const frame = x < 2 || y < 2 || x > 13 || y > 13;
      const bar = x === 7 || x === 8 || y === 7 || y === 8;
      if (frame) img.set(x, y, F[(x === 0 || y === 0) ? 2 : (x === 15 || y === 15) ? 0 : 1]);
      else if (bar) img.set(x, y, on ? C('#c86a2a') : F[0]);
      else {
        const d = Math.min(Math.abs(x - 4), Math.abs(x - 11)) + Math.min(Math.abs(y - 4), Math.abs(y - 11));
        img.set(x, y, G[Math.max(0, Math.min(3, 3 - Math.floor(d / 1.5) + (rng.nextInt(3) === 0 ? -1 : 0)))]);
      }
    }
    return reg(name, img);
  };
  lamp('ember_lamp_off', false);
  lamp('ember_lamp_on', true);
  // relay top: smooth stone slab with an arrow of ember dust
  const relayTop = (name, on) => {
    const img = TexGen.T.stone_slab_top ? TexGen.T.stone_slab_top.copy() : new Img().fill([160, 160, 160]);
    const D = on ? C('#ff7a30') : C('#7a2a14');
    for (let y = 2; y < 15; y++) img.set(7, y, D), img.set(8, y, D);
    for (const [x, y] of [[6, 3], [9, 3], [5, 4], [10, 4]]) img.set(x, y, D);
    for (let x = 4; x < 12; x++) img.set(x, 15, C('#6a6a6a'));
    return reg(name, img);
  };
  relayTop('relay_top', false);
  relayTop('relay_top_on', true);
  sprite('item_relay', [
    '................', '................', '................', '................', '.....r....r.....', '....rRr..rRr....',
    '.....s....s.....', '.....s....s.....', '..oooooooooooo..', '..ogggdddggggo..', '..ogggggggggdo..', '..oaaaaaaaaaao..',
    '..oooooooooooo..', '................', '................', '................'], { o: '#3a3a3a', g: '#a8a8a8', d: '#c83a1a', a: '#7a7a7a', r: '#ff5a1a', R: '#ffd0a0', s: '#6b5232' });
  // gauge top: smooth stone, ember traces joining its three studs, and a little dial between them
  const gaugeTop = (name, on) => {
    const img = TexGen.T.stone_slab_top ? TexGen.T.stone_slab_top.copy() : new Img().fill([160, 160, 160]);
    const D = on ? C('#ff7a30') : C('#7a2a14'), rim = C('#5c5c5c');
    for (let y = 4; y <= 12; y++) { img.set(4, y, D); img.set(12, y, D); }
    for (let x = 4; x <= 12; x++) img.set(x, 4, D);
    for (let y = 2; y < 4; y++) { img.set(7, y, D); img.set(8, y, D); }
    for (const [x, y] of [[7, 7], [8, 7], [9, 7], [6, 8], [10, 8], [6, 9], [10, 9], [6, 10], [10, 10], [7, 11], [8, 11], [9, 11]]) img.set(x, y, rim);
    for (const [x, y] of on ? [[8, 10], [8, 9], [9, 8]] : [[8, 10], [8, 9], [7, 8]]) img.set(x, y, D);
    for (let x = 0; x < 16; x++) img.set(x, 15, C('#6a6a6a'));
    return reg(name, img);
  };
  gaugeTop('gauge_top', false);
  gaugeTop('gauge_top_on', true);
  sprite('item_gauge', [
    '................', '................', '................', '................', '...r.......r....', '..rRr.....rRr...',
    '...s...r...s....', '...s..rRr..s....', '..oooooooooooo..', '..ogggdddggggo..', '..ogdgggggdggo..', '..oaaaaaaaaaao..',
    '..oooooooooooo..', '................', '................', '................'], { o: '#3a3a3a', g: '#a8a8a8', d: '#c83a1a', a: '#7a7a7a', r: '#ff5a1a', R: '#ffd0a0', s: '#6b5232' });
  // pistons: a wooden face on a cobblestone body
  const cob = () => (TexGen.T.cobblestone ? TexGen.T.cobblestone.copy() : new Img().fill([110, 110, 110]));
  reg('piston_top', (() => {
    const img = TexGen.T.planks_oak.copy();
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#4f3a22')); img.set(0, i, C('#4f3a22')); img.set(i, 15, C('#3a2a16')); img.set(15, i, C('#3a2a16')); }
    return img;
  })());
  reg('piston_top_sticky', (() => {
    const img = TexGen.T.piston_top.copy(), rng = rngFor('sticky');
    const G = pal(['#4a9a3a', '#5fbf4a', '#7ad45a', '#a8e88a']);
    for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 5.5 + rng.nextFloat()) img.set(x, y, G[Math.min(3, Math.floor((6 - d) / 2 + rng.nextFloat()))]); }
    return img;
  })());
  reg('piston_side', (() => {
    const img = cob(), P = TexGen.T.planks_oak;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) img.set(x, y, P.get(x, y + 4));
    for (let x = 0; x < 16; x++) img.set(x, 4, C('#3a2a16'));
    for (let y = 5; y < 16; y++) { img.shade(6, y, 0.7); img.shade(9, y, 0.7); }
    return img;
  })());
  reg('piston_bottom', (() => {
    const img = cob();
    for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) img.shade(x, y, (x === 5 || y === 5 || x === 10 || y === 10) ? 0.6 : 0.4);
    return img;
  })());
  reg('piston_inner', (() => {
    const img = cob();
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) img.set(x, y, C('#1a1a1a'));
    for (let i = 5; i < 11; i++) { img.shade(i, 5, 0.6); img.shade(5, i, 0.6); }
    return img;
  })());
  // note block: dark wood with a sound hole
  reg('note_block', (() => {
    const img = TexGen.T.planks_jungle ? TexGen.T.planks_jungle.copy() : new Img().fill([120, 80, 50]);
    img.mapColors((r, g, b, a) => [r * 0.75, g * 0.7, b * 0.7, a]);
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#2a1810')); img.set(0, i, C('#2a1810')); img.set(i, 15, C('#2a1810')); img.set(15, i, C('#2a1810')); }
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 3.6) img.set(x, y, d < 2.4 ? C('#120a06') : C('#3a2414')); }
    return img;
  })());
})();

// ---------------------------------------------------------------------------
// Enchanting: the table, the floating book, the glint and the flying glyphs
// ---------------------------------------------------------------------------
(function () {
  const { Img, reg, pal, rngFor, sprite, C } = TexGen;
  const obsidian = (name) => {
    const img = new Img(), rng = rngFor(name);
    const P = pal(['#0d0a14', '#130f1e', '#1a1428', '#241c36', '#3a2c52']);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, P[Math.min(4, Math.floor(rng.nextFloat() * rng.nextFloat() * 5))]);
    return img;
  };
  reg('enchanting_bottom', obsidian('ench_bottom'));
  reg('enchanting_side', (() => {
    const img = obsidian('ench_side'), rng = rngFor('ench_side2');
    const R = pal(['#5a0c0c', '#7a1414', '#9a1e1e', '#b82a2a']);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 16; x++) img.set(x, y, y === 4 ? C('#e8b830') : R[Math.min(3, (x + y * 3 + rng.nextInt(2)) % 4)]);
    for (const x of [2, 7, 12]) { img.set(x, 5, R[1]); img.set(x + 1, 5, R[2]); img.set(x, 6, R[0]); }
    return img;
  })());
  reg('enchanting_top', (() => {
    const img = obsidian('ench_top'), rng = rngFor('ench_top2');
    const R = pal(['#6a1010', '#8a1818', '#a82222', '#c03030']);
    for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) img.set(x, y, R[(x * 3 + y * 5 + rng.nextInt(2)) % 4]);
    for (let i = 2; i < 14; i++) { img.set(i, 2, C('#e8b830')); img.set(i, 13, C('#a87818')); img.set(2, i, C('#e8b830')); img.set(13, i, C('#a87818')); }
    for (const [x, y] of [[0, 0], [14, 0], [0, 14], [14, 14]]) { img.set(x, y, C('#d5fffa')); img.set(x + 1, y, C('#5decf5')); img.set(x, y + 1, C('#5decf5')); img.set(x + 1, y + 1, C('#1fa8b0')); }
    return img;
  })());
  reg('book_cover', (() => {
    const img = TexGen.noiseImg('book_cover', ['#5a2a10', '#6e3416', '#7e3e1a', '#8e4a22'], { scales: [4, 1], weights: [0.4, 0.6] });
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#3a1a08')); img.set(i, 15, C('#3a1a08')); img.set(0, i, C('#3a1a08')); img.set(15, i, C('#3a1a08')); }
    for (let x = 5; x < 11; x++) { img.set(x, 6, C('#c8a040')); img.set(x, 9, C('#c8a040')); }
    return img;
  })());
  reg('book_pages', (() => {
    const img = new Img().fill(C('#ece4cc'));
    for (let y = 2; y < 15; y += 2) for (let x = 2; x < 14; x++) if ((x * 7 + y * 3) % 9 > 1) img.set(x, y, C('#b8ac90'));
    return img;
  })());
  // the shimmer that runs over enchanted things
  reg('enchant_glint', (() => {
    const img = new Img();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = ((x + y) % 16) / 16, band = Math.max(0, 1 - Math.abs(d - 0.5) * 3.2);
      const k = band * (0.7 + 0.3 * Math.sin((x - y) * 0.8));
      img.set(x, y, [Math.round(128 * k), Math.round(64 * k), Math.round(204 * k)], 255);
    }
    return img;
  })());
  // glyphs drifting from bookshelves into the table
  const GLYPH = [
    ['.#.', '#.#', '.#.', '.#.'], ['#.#', '.#.', '#.#'], ['###', '..#', '.#.', '#..'], ['#..', '###', '..#'],
    ['.#.', '###', '.#.'], ['##.', '#.#', '.##'], ['#.#', '#.#', '.#.'], ['.##', '#..', '.##'],
  ];
  GLYPH.forEach((rows, i) => {
    const pad = ['................', '................', '................', '................', '................', '................'];
    const full = pad.concat(rows.map((r) => '......' + r.replace(/#/g, 'o') + '.'.repeat(10 - r.length)));
    sprite('particle_glyph' + i, full, { o: [255, 255, 255] });
  });
})();
