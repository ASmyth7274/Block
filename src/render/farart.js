'use strict';
// ---------------------------------------------------------------------------
// Artwork for the Vaults and the Far Isles: iron bars, the rift frame with its
// eye sockets, the rift itself (a slowly drifting field of stars), starstone,
// the Seeker's Eye and the wyrm's egg.
// ---------------------------------------------------------------------------
(function () {
  const { Img, T, ANIM, reg, sprite, rngFor, noiseImg, C, mix } = TexGen;
  reg('iron_bars', (() => {
    const img = new Img();
    const D = C('#4a4c50'), M = C('#8a8d92'), L = C('#c4c7cc');
    for (const x of [1, 6, 10, 14]) for (let y = 0; y < 16; y++) { img.set(x - 1, y, D); img.set(x, y, (y % 5 === 0) ? L : M); }
    for (const y of [3, 12]) for (let x = 0; x < 16; x++) { img.set(x, y, M); img.set(x, y + 1, D); }
    return img;
  })());
  reg('starstone', (() => {
    const img = noiseImg('starstone', ['#cfcfa6', '#d8d8b0', '#dedeb8', '#e4e4c0', '#ebebc8'], { scales: [4, 2, 1], weights: [0.3, 0.3, 0.4] });
    const rng = rngFor('starstone2');
    for (let k = 0; k < 7; k++) img.set(rng.nextInt(16), rng.nextInt(16), C('#b8b88e'));
    for (let k = 0; k < 3; k++) { const x = rng.nextInt(16), y = rng.nextInt(16); img.set(x, y, C('#fffbe0')); }
    return img;
  })());
  reg('rift_frame_side', (() => {
    const img = T.starstone.copy();
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) img.set(x, y, (x + y) % 3 ? C('#3c5a4a') : C('#2a443a'));
    for (let x = 0; x < 16; x++) img.set(x, 4, C('#9a9a78'));
    return img;
  })());
  reg('rift_frame_top', (() => {
    const img = new Img();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, (x * 3 + y * 5) % 7 === 0 ? C('#2a443a') : C('#3c5a4a'));
    // the empty socket
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) img.set(x, y, (x === 4 || y === 4) ? C('#122018') : C('#1a2c24'));
    for (let i = 0; i < 16; i++) { img.set(i, 0, C('#5a7a68')); img.set(0, i, C('#5a7a68')); img.set(i, 15, C('#1e3228')); img.set(15, i, C('#1e3228')); }
    return img;
  })());
  reg('rift_frame_eye', (() => {
    const img = new Img().fill(C('#2c8a7a'));
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      img.set(x, y, d < 2.5 ? C('#0a1a16') : d < 5 ? C('#46c8b0') : d < 7 ? C('#2c8a7a') : C('#1c5a50'));
    }
    return img;
  })());
  sprite('item_rift_frame', [
    '................', '................', '................', '................', '..oooooooooooo..', '.ogggggggggggggo',
    '.ogggoooooogggo.', '.oggo.....ogggo.', '.ogggoooooogggo.', '.ogggggggggggggo', '.ossssssssssssso', '.oSSSSSSSSSSSSSo',
    '.oSSSSSSSSSSSSSo', '.ooooooooooooooo', '................', '................'],
    { o: '#1e3228', g: '#3c5a4a', s: '#9a9a78', S: '#d8d8b0' });
  // the rift: three layers of stars drifting past at different speeds
  function RiftAnim() {
    const rng = new Noise.Random(4242);
    const layers = [0, 1, 2].map((k) => Array.from({ length: 5 + k * 3 }, () => [rng.nextFloat() * 16, rng.nextFloat() * 16, rng.nextFloat()]));
    let t = 0;
    this.step = function () { t++; };
    this.render = function (img) {
      for (let i = 0; i < 256; i++) {
        const x = i & 15, y = i >> 4;
        const v = 6 + ((x * 7 + y * 13 + (t >> 3)) % 5);
        img.d[i * 4] = v; img.d[i * 4 + 1] = v + 2; img.d[i * 4 + 2] = v * 2 + 10; img.d[i * 4 + 3] = 255;
      }
      const cols = [[120, 230, 210], [190, 170, 255], [255, 255, 255]];
      layers.forEach((stars, k) => {
        const sp = [0.03, 0.06, 0.11][k];
        for (const [sx, sy, ph] of stars) {
          const x = Math.floor(((sx + t * sp) % 16 + 16) % 16), y = Math.floor(((sy + t * sp * 0.6) % 16 + 16) % 16);
          const tw = 0.6 + 0.4 * Math.sin(t * 0.15 + ph * 20);
          const c = cols[k], i = (y * 16 + x) * 4;
          img.d[i] = Math.max(img.d[i], c[0] * tw); img.d[i + 1] = Math.max(img.d[i + 1], c[1] * tw); img.d[i + 2] = Math.max(img.d[i + 2], c[2] * tw);
        }
      });
    };
  }
  ANIM.rift = new RiftAnim();
  { const img = new Img(); ANIM.rift.render(img); reg('rift', img); }
  // the Seeker's Eye: a wisp of light caught in a ring of flare-brass
  sprite('seeker_eye', [
    '................', '................', '.....oooooo.....', '....obbbbbbo....', '...obccccccbo...', '..obccwwwwccbo..',
    '..obcwgggggcbo..', '..obcwgkkgwcbo..', '..obcwgkkgwcbo..', '..obcwgggggcbo..', '..obccwwwwccbo..', '...obccccccbo...',
    '....obbbbbbo....', '.....oooooo.....', '................', '................'],
    { o: '#4a2a10', b: '#c8842a', c: '#5ae0c8', w: '#c0fff0', g: '#2a9a8a', k: '#08201c' });
})();
