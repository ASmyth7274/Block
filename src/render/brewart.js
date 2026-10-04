'use strict';
// ---------------------------------------------------------------------------
// Brewing artwork: round flasks for potions (tinted with what is inside),
// stoppered throwing flasks for splash potions, the brewing stand and the
// odd ingredients.
// ---------------------------------------------------------------------------
(function () {
  const { Img, reg, sprite, C, mix } = TexGen;
  // o outline, g glass, w glint, c cork, L liquid (tinted), D deep liquid, H liquid highlight
  const FLASK = [
    '................', '......occo......', '......occo......', '......oggo......', '.......og.......', '......oggo......',
    '.....ogLLgo.....', '....ogLHLLgo....', '...ogLHLLLLgo...', '...ogLLLLLLgo...', '...ogLLLLLDgo...', '...ogDLLLDDgo...',
    '....ogDDDDgo....', '.....oggggo.....', '......oooo......', '................'];
  const SPLASH = [
    '......cc........', '.....occo.......', '.....oggo.......', '....oggggo......', '...ogLLLLgo.....', '..ogLHLLLLgo....',
    '.ogLHLLLLLLgo...', '.ogLLLLLLLLgo...', 'oggLLLLLLLLggo..', '.ogLLLLLLLDgo...', '.ogDLLLLLDDgo...', '..ogDDDDDDgo....',
    '...oggggggo.....', '....oooooo......', '................', '................'];
  const paint = (name, rows, liquid) => {
    const L = C(liquid), D = mix(L, [0, 0, 0], 0.35), H = mix(L, [255, 255, 255], 0.45);
    const img = sprite(name, rows, { o: '#3a3a44', g: '#c8d4e4', w: '#ffffff', c: '#8a6440', L, D, H });
    // a hint of glass over the top of the liquid
    img.set(6, 6, C('#e8f0ff'));
    return img;
  };
  for (const p of POTIONS) { paint('potion_' + p.key, FLASK, p.color); paint('splash_' + p.key, SPLASH, p.color); }
  // the empty flask
  sprite('glass_bottle', FLASK.map((r) => r.replace(/[LDH]/g, '.')), { o: '#3a3a44', g: '#c8d4e4', c: '#8a6440' });
  sprite('fermented_spider_eye', [
    '................', '................', '.....oo.........', '....omoo..oo....', '...ommmooomo....', '...omrrmmmmo....',
    '..omrrRrrmmo....', '..omrRRRrmmo....', '..omrrRrrmo.....', '..ommrrrmmo.....', '...ommmmmo......', '....ooooo.......',
    '................', '................', '................', '................'],
    { o: '#2a1a14', m: '#6a4a2e', r: '#8a2a3a', R: '#c84a5a' });
  sprite('glistering_melon', [
    '................', '................', '..oo............', '..ogoo..........', '..ogyRoo........', '..ogRRyRoo......',
    '...ogRRRyRoo....', '...ogRyRRRRoo...', '....ogRRRyRRoo..', '....ogRRRRRRRo..', '.....ogyRRRRyo..', '......ogggggoo..',
    '.......oooooo...', '................', '................', '................'],
    { o: '#4a3a10', g: '#d8c040', y: '#fff6a0', R: '#e05a3a' });
  // the stand: a flare rod pillar with three dark stone pads
  reg('brewing_stand', (() => {
    const img = new Img();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, (y % 4 === 0) ? C('#a8481a') : (x % 3 === 0 ? C('#ffd060') : C('#ffb03a')));
    return img;
  })());
  reg('brewing_stand_base', (() => {
    const img = new Img();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, ((x * 7 + y * 3) % 5 === 0) ? C('#4a4a50') : C('#6a6a72'));
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#8a8a92')); img.set(0, i, C('#8a8a92')); }
    return img;
  })());
  reg('brewing_bottle', (() => {
    // a corked bottle half full of something blue, seen from the side
    const img = new Img();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c;
      if (y < 3) c = (x > 3 && x < 12) ? C('#8a6440') : null;
      else if (x === 0 || x === 15 || y === 15) c = C('#4a5262');
      else if (y < 8) c = (x === 2 || x === 3) ? C('#ffffff') : C('#d4e0ee');
      else c = (x === 2 && y < 12) ? C('#8aa4f0') : (y > 12 ? C('#2e4aa8') : C('#4a6ad0'));
      if (c) img.set(x, y, c);
    }
    return img;
  })());
  sprite('item_brewing_stand', [
    '.......oo.......', '.......yo.......', '.......yo.......', '...o...yo...o...', '..ogo..yo..ogo..', '..ogoooyooooogo.',
    '..ogo..yo..ogo..', '..ogo..yo..ogo..', '..ogo..yo..ogo..', '..ooo..yo..ooo..', '.......yo.......', '.......yo.......',
    '.sssss.yo.sssss.', '.sSSSSsoosSSSSs.', '.sssssssssssss..', '................'],
    { o: '#3a3a44', g: '#c8d4e4', y: '#ffb03a', s: '#4a4a50', S: '#7a7a82' });
})();
