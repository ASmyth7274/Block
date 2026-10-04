'use strict';
// ---------------------------------------------------------------------------
// Original paintings (16 pixels per block), painted procedurally with a small
// pixel-art toolkit (banded, dithered gradients; ridges; glows), plus the
// font used for sign text. Both are packed into the entity skin atlas.
// ---------------------------------------------------------------------------
const Paintings = (() => {
  const C = TexGen.C;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mulc = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
  const H = (s) => (typeof s === 'string' ? C(s) : s);

  // ------------------------------------------------------------ toolkit
  // colour along a list of [t, colour] stops, quantised into bands with ordered dithering
  function ramp(stops, t, x, y, steps) {
    steps = steps || 6;
    const q = Math.max(0, Math.min(1, t)) * (steps - 1);
    let k = Math.floor(q);
    if (q - k > bayer(x, y)) k++;
    const tt = k / (steps - 1);
    for (let i = 1; i < stops.length; i++) {
      if (tt <= stops[i][0] + 1e-6) { const a = stops[i - 1], b = stops[i]; return lerp(H(a[1]), H(b[1]), (tt - a[0]) / ((b[0] - a[0]) || 1)); }
    }
    return H(stops[stops.length - 1][1]);
  }
  function gradient(img, y0, y1, stops, steps, x0, x1) {
    x0 = x0 || 0; x1 = x1 === undefined ? img.w : x1;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) img.set(x, y, ramp(stops, (y - y0) / Math.max(1, y1 - y0 - 1), x, y, steps));
  }
  function rect(img, x0, y0, w, h, c) { c = H(c); for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) img.set(x, y, c); }
  function px(img, x, y, c) { img.set(Math.round(x), Math.round(y), H(c)); }
  function blend(img, x, y, c, a) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= img.w || y >= img.h || a <= 0) return;
    const o = img.get(x, y);
    img.set(x, y, lerp(o, H(c), Math.min(1, a)));
  }
  function disc(img, cx, cy, r, c) { c = H(c); for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) img.set(x, y, c); }
  // soft dithered glow
  function glow(img, cx, cy, r, c, k) {
    k = k === undefined ? 0.8 : k;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d >= 1) continue;
      const a = (1 - d) * (1 - d) * k;
      blend(img, x, y, c, a > bayer(x, y) * 0.5 ? a : a * 0.5);
    }
  }
  function line(img, x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) px(img, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, typeof c === 'function' ? c(i / n) : c);
  }
  function noise1(rng, n) {
    const v = []; for (let i = 0; i < n; i++) v.push(rng.nextFloat());
    return (x) => { const i = Math.floor(x), f = x - i, a = v[((i % n) + n) % n], b = v[(((i + 1) % n) + n) % n]; const s = f * f * (3 - 2 * f); return a + (b - a) * s; };
  }
  function fbm(rng) { const a = noise1(rng, 64), b = noise1(rng, 64), c = noise1(rng, 64); return (x) => a(x) * 0.6 + b(x * 2.13) * 0.28 + c(x * 4.37) * 0.12; }
  // a mountain / hill silhouette; returns the height map
  function ridge(img, rng, o) {
    const f = fbm(rng), hs = [];
    for (let x = 0; x < img.w; x++) {
      let v = f(x / o.scale + (o.off || 0));
      if (o.peaks) v = 1 - Math.abs(v * 2 - 1);
      hs.push(Math.round(o.base - o.amp * v));
    }
    const bottom = o.bottom === undefined ? img.h : o.bottom;
    for (let x = 0; x < img.w; x++) {
      const slope = (hs[Math.min(img.w - 1, x + 1)] - hs[Math.max(0, x - 1)]);
      for (let y = Math.max(0, hs[x]); y < bottom; y++) {
        let c = H(o.col);
        if (o.light && slope > 0 && y - hs[x] < (o.lightDepth || 99)) c = H(o.light);
        if (o.dark && slope < 0 && y - hs[x] < (o.lightDepth || 99)) c = H(o.dark);
        if (o.snow && y < o.snowLine + (bayer(x, y) * 3 | 0) && y - hs[x] < 4) c = H(o.snow);
        if (o.fade) c = lerp(c, H(o.fade[0]), Math.max(0, Math.min(1, (y - hs[x]) / o.fade[1])));
        img.set(x, y, c);
      }
    }
    return hs;
  }
  function stars(img, rng, n, ymax, cols) {
    cols = cols || ['#ffffff', '#fff4c0', '#c0d0ff'];
    for (let i = 0; i < n; i++) { const x = rng.nextInt(img.w), y = rng.nextInt(ymax); px(img, x, y, cols[rng.nextInt(cols.length)]); }
  }
  function pine(img, x, y, h, c, c2) {
    c = H(c); c2 = c2 ? H(c2) : mulc(c, 0.8);
    for (let k = 0; k < h; k++) { const r = Math.floor((k + 1) * 0.42); for (let dx = -r; dx <= r; dx++) img.set(x + dx, y - h + 1 + k, dx < 0 ? c2 : c); }
    img.set(x, y + 1, mulc(c, 0.6));
  }
  function roundTree(img, x, y, r, c, trunk, light) {
    rect(img, x, y - 1, 1, 3, trunk || '#3a2414');
    c = H(c);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + 0.5) continue;
      let cc = c;
      if (light && dx + dy < -r * 0.4 && bayer(x + dx, y + dy) < 0.6) cc = H(light);
      else if (dx + dy > r * 0.5) cc = mulc(c, 0.75);
      img.set(x + dx, y - r - 1 + dy, cc);
    }
  }
  function figure(img, x, y, body, head) {
    // a tiny standing person, 6px tall, feet at y
    rect(img, x, y - 1, 1, 2, body); rect(img, x + 1, y - 1, 1, 2, body);
    rect(img, x, y - 4, 2, 3, body);
    rect(img, x, y - 5, 2, 1, head || '#d8a880');
  }
  function frame(img) {
    const a = H('#2c1c0e'), b = H('#5a3c20');
    for (let x = 0; x < img.w; x++) { img.set(x, 0, b); img.set(x, img.h - 1, a); }
    for (let y = 0; y < img.h; y++) { img.set(0, y, b); img.set(img.w - 1, y, a); }
  }
  function water(img, y0, y1, stops, rng, glints) {
    gradient(img, y0, y1, stops, 5);
    for (let i = 0; i < (img.w * (y1 - y0)) / 18; i++) {
      const y = y0 + 1 + rng.nextInt(Math.max(1, y1 - y0 - 1)), x = rng.nextInt(img.w), l = 1 + rng.nextInt(3);
      for (let k = 0; k < l; k++) blend(img, x + k, y, glints || '#ffffff', 0.25);
    }
  }
  function cloud(img, x, y, w, c, sh) {
    c = H(c); sh = H(sh || mulc(c, 0.85));
    for (let k = 0; k < w; k++) {
      const hgt = Math.round(Math.sin(k / (w - 1) * Math.PI) * (w / 5 + 1));
      for (let j = 0; j < hgt; j++) img.set(x + k, y - j, j === 0 ? sh : c);
    }
  }

  // ------------------------------------------------------------ the paintings
  const ART = [];
  const def = (key, title, w, h, paint) => ART.push({ key, title, w, h, paint });

  def('wisp', "Will-o'-the-Wisp", 1, 1, (img, rng) => {
    gradient(img, 0, 11, [[0, '#070b1a'], [1, '#1b2c34']], 4);
    gradient(img, 11, 16, [[0, '#0e1c18'], [1, '#08100c']], 3);
    for (const x of [2, 3, 12, 13, 14]) { const h = 4 + rng.nextInt(4); for (let y = 12 - h; y < 13; y++) px(img, x + (y % 3 === 0 ? 0 : 0), y, '#030806'); }
    glow(img, 9, 6, 5, '#3ac8b8', 0.7);
    disc(img, 9, 6, 1.2, '#9ff8ec'); px(img, 9, 6, '#f0fffc'); px(img, 8, 6, '#e0fff8');
    px(img, 9, 13, '#3a9a90'); px(img, 8, 14, '#2a6a64'); px(img, 10, 14, '#2a6a64');
    stars(img, rng, 4, 6);
    frame(img);
  });
  def('standing_stone', 'Standing Stone', 1, 1, (img, rng) => {
    gradient(img, 0, 11, [[0, '#2a1a44'], [0.55, '#8a3a5a'], [1, '#f0904a']], 6);
    stars(img, rng, 3, 4);
    rect(img, 0, 11, 16, 5, '#2e3c22');
    for (let x = 0; x < 16; x++) if (rng.nextInt(3) === 0) px(img, x, 10, '#2e3c22');
    for (let y = 3; y < 13; y++) for (let x = 6; x < 10; x++) {
      if (y === 3 && (x === 6 || x === 9)) continue;
      px(img, x, y, x === 6 ? '#8a8a96' : x === 9 ? '#44444e' : '#66666f');
    }
    for (const [x, y] of [[7, 5], [8, 6], [7, 7], [8, 8], [7, 9], [8, 9]]) px(img, x, y, '#6cf2a8');
    glow(img, 7.5, 7, 3, '#5cf2a0', 0.25);
    frame(img);
  });
  def('still_life', 'Still Life', 1, 1, (img, rng) => {
    gradient(img, 0, 12, [[0, '#1e1610'], [1, '#3a2a1c']], 4);
    rect(img, 0, 12, 16, 4, '#5a3a20'); rect(img, 0, 12, 16, 1, '#7a5230');
    for (let y = 8; y < 13; y++) for (let x = 6; x < 10; x++) px(img, x, y, x === 6 ? '#6a8ad0' : x === 9 ? '#2a3a70' : '#3a5aa0');
    px(img, 6, 8, '#2a3a70'); px(img, 9, 8, '#2a3a70'); rect(img, 7, 7, 2, 1, '#3a5aa0');
    for (const [x, y, c] of [[5, 3, '#e83a3a'], [8, 2, '#f8e060'], [10, 4, '#f0f0f0'], [7, 4, '#e86ab8'], [11, 2, '#e83a3a'], [4, 5, '#f8e060']]) {
      line(img, x, y + 1, 7.5, 7, '#3a7a2a');
      px(img, x, y, c); px(img, x + 1, y, mulc(H(c), 0.8)); px(img, x, y - 1, mulc(H(c), 1.1)); px(img, x - 1, y, mulc(H(c), 0.9));
    }
    void rng;
    frame(img);
  });
  def('falling_star', 'Falling Star', 1, 1, (img, rng) => {
    gradient(img, 0, 16, [[0, '#04061a'], [1, '#1c2252']], 5);
    stars(img, rng, 9, 12);
    line(img, 13, 2, 4, 9, (t) => lerp(H('#202a6a'), H('#ffffff'), t));
    px(img, 4, 9, '#ffffff'); px(img, 3, 10, '#fff4c0'); glow(img, 4, 9, 2.5, '#c0d0ff', 0.6);
    const hs = []; for (let x = 0; x < 16; x++) hs.push(13 + Math.round(Math.sin(x * 0.5) * 1.2));
    for (let x = 0; x < 16; x++) for (let y = hs[x]; y < 16; y++) px(img, x, y, '#020308');
    frame(img);
  });
  def('hearth', 'The Hearth', 1, 1, (img, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const brick = ((y >> 2) & 1) ? (x + 2) >> 2 : x >> 2;
      const mortar = (y & 3) === 3 || ((((y >> 2) & 1) ? x + 2 : x) & 3) === 3;
      px(img, x, y, mortar ? '#3a3632' : mulc(H('#6e6a64'), 0.85 + ((brick * 7 + (y >> 2) * 3) % 5) * 0.06));
    }
    rect(img, 4, 7, 8, 7, '#140c08'); rect(img, 5, 6, 6, 1, '#140c08');
    for (let x = 5; x < 11; x++) { const h = 2 + rng.nextInt(4); for (let k = 0; k < h; k++) px(img, x, 13 - k, k === h - 1 ? '#ffe070' : k > h / 2 ? '#ffa020' : '#e05010'); }
    rect(img, 5, 13, 6, 1, '#3a2010');
    glow(img, 8, 11, 7, '#ff9030', 0.35);
    frame(img);
  });
  def('jade_gems', 'Jade', 1, 1, (img, rng) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(img, x, y, ramp([[0, '#2a1030'], [1, '#5a2a5a']], (Math.sin(x * 0.7 + y * 0.4) + 1) / 2, x, y, 4));
    const gem = (cx, cy, r) => {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        if (Math.abs(x) + Math.abs(y) > r) continue;
        px(img, cx + x, cy + y, x + y < -r / 2 ? '#b0f5cc' : x + y < 1 ? '#3fbf72' : '#1f7a46');
      }
      px(img, cx - 1, cy - 1, '#f0fff8');
    };
    gem(5, 9, 3); gem(11, 7, 3); gem(9, 12, 2);
    void rng;
    frame(img);
  });
  def('sea_sunset', 'Sunset Sea', 2, 1, (img, rng) => {
    gradient(img, 0, 10, [[0, '#3a2a6a'], [0.6, '#d05a6a'], [1, '#f8b048']], 7);
    disc(img, 21, 10, 4, '#ffd060'); disc(img, 21, 10, 2.5, '#fff0a0');
    water(img, 10, 16, [[0, '#4a3a7a'], [1, '#1a1c4a']], rng, '#ff9a6a');
    for (let y = 11; y < 16; y++) for (let k = 0; k < 6; k++) if (rng.nextInt(2)) px(img, 18 + rng.nextInt(7) - (y - 11) % 2, y, y < 13 ? '#ffd080' : '#e88a50');
    for (let x = 2; x < 9; x++) for (let y = 9 - Math.round(Math.sin((x - 2) / 6 * Math.PI) * 2); y < 10; y++) px(img, x, y, '#1a1028');
    cloud(img, 6, 4, 7, '#f0a0a0'); cloud(img, 25, 3, 5, '#f8b8a0');
    frame(img);
  });
  def('ember_vein', 'Ember Vein', 2, 1, (img, rng) => {
    const n = TexGen.normalize(TexGen.fnoise(rng, 32, 16, [8, 4, 2], [0.5, 0.3, 0.2]));
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) px(img, x, y, ramp([[0, '#1e1e22'], [1, '#5a5a62']], n[y * 32 + x], x, y, 4));
    for (let k = 0; k < 4; k++) {
      const cx = 12 + rng.nextInt(18), cy = 3 + rng.nextInt(10);
      glow(img, cx, cy, 4, '#ff5020', 0.35);
      for (let i = 0; i < 5; i++) px(img, cx + rng.nextInt(3) - 1, cy + rng.nextInt(3) - 1, rng.nextBool() ? '#d8401a' : '#ffb057');
    }
    rect(img, 4, 7, 1, 5, '#6a4a28'); px(img, 4, 6, '#ffd060'); px(img, 4, 5, '#ff8020'); glow(img, 4, 6, 6, '#ffb040', 0.35);
    rect(img, 0, 13, 32, 3, '#141416');
    frame(img);
  });
  def('dawn_boat', 'Dawn Crossing', 2, 1, (img, rng) => {
    gradient(img, 0, 9, [[0, '#a8bcd8'], [1, '#f0dcc8']], 5);
    ridge(img, rng, { base: 8, amp: 4, scale: 9, col: '#a0aec4', bottom: 9, peaks: true });
    water(img, 9, 16, [[0, '#b8c4d4'], [1, '#6a84a8']], rng, '#ffffff');
    rect(img, 12, 10, 9, 1, '#3a2614'); rect(img, 13, 11, 7, 1, '#2a1a0c');
    px(img, 12, 9, '#3a2614'); px(img, 20, 9, '#3a2614');
    rect(img, 16, 7, 2, 3, '#4a3a5a'); rect(img, 16, 6, 2, 1, '#d8a880');
    line(img, 14, 8, 11, 12, '#5a3a20');
    for (let x = 13; x < 20; x++) if (x % 2) px(img, x, 13, '#4a5a78');
    frame(img);
  });
  def('pasture', 'Green Pasture', 2, 1, (img, rng) => {
    gradient(img, 0, 9, [[0, '#5a90e0'], [1, '#a8d0f8']], 5);
    cloud(img, 3, 3, 8, '#ffffff', '#d8e4f0'); cloud(img, 20, 2, 6, '#ffffff', '#d8e4f0');
    ridge(img, rng, { base: 10, amp: 3, scale: 14, col: '#5aa040', light: '#78c050', lightDepth: 2 });
    for (let x = 1; x < 31; x++) { px(img, x, 12, '#8a6a3a'); if (x % 4 === 1) { px(img, x, 11, '#6a4a28'); px(img, x, 13, '#6a4a28'); } }
    const cow = (x, y) => { rect(img, x, y, 4, 2, '#f0f0f0'); px(img, x + 1, y, '#202020'); px(img, x + 3, y + 1, '#202020'); rect(img, x + 4, y - 1, 1, 2, '#202020'); px(img, x, y + 2, '#202020'); px(img, x + 3, y + 2, '#202020'); };
    const sheep = (x, y) => { rect(img, x, y, 3, 2, '#f4f4ec'); px(img, x - 1, y, '#d8c8b8'); px(img, x, y + 2, '#5a4a3a'); px(img, x + 2, y + 2, '#5a4a3a'); };
    cow(6, 13); sheep(18, 13); sheep(24, 14); cow(12, 9);
    frame(img);
  });
  def('waterfall', 'The Falls', 1, 2, (img, rng) => {
    gradient(img, 0, 6, [[0, '#6aa0e8'], [1, '#c0dcf8']], 4);
    for (let y = 4; y < 32; y++) for (let x = 0; x < 16; x++) {
      const left = x < 5 + Math.round(Math.sin(y * 0.4) * 1), right = x > 10 + Math.round(Math.cos(y * 0.35) * 1);
      if (left || right) px(img, x, y, ramp([[0, '#3a3a40'], [1, '#7a7a84']], ((x * 7 + y * 13) % 11) / 10, x, y, 4));
    }
    for (let x = 0; x < 16; x++) { px(img, x, 4, '#4a8a2a'); px(img, x, 5, x % 3 ? '#3a6a22' : '#4a8a2a'); }
    pine(img, 2, 3, 4, '#2a5a2a'); pine(img, 13, 3, 5, '#2a5a2a');
    for (let y = 6; y < 26; y++) for (let x = 5; x < 11; x++) {
      const l = 5 + Math.round(Math.sin(y * 0.4) * 1), r = 10 + Math.round(Math.cos(y * 0.35) * 1);
      if (x < l || x > r) continue;
      px(img, x, y, ((x * 5 + y * 3 + (x & 1) * 7) % 5) < 2 ? '#e8f4ff' : '#9cc8f0');
    }
    water(img, 26, 32, [[0, '#7ab0e0'], [1, '#2a5a9a']], rng, '#ffffff');
    for (let x = 3; x < 13; x++) if (rng.nextInt(2)) px(img, x, 26, '#ffffff');
    frame(img);
  });
  def('old_giant', 'The Old Giant', 1, 2, (img, rng) => {
    gradient(img, 0, 32, [[0, '#2a4a2a'], [0.5, '#4a6a3a'], [1, '#2a3a22']], 5);
    for (let k = 0; k < 6; k++) { const x = rng.nextInt(16); line(img, x, 0, x - 4, 31, (t) => t < 0.8 ? '#5a7a4a' : '#4a6a3a'); }
    for (let y = 6; y < 30; y++) for (let x = 5; x < 11; x++) {
      const bark = (x + (y >> 2)) % 3 === 0;
      px(img, x, y, x === 5 ? '#4a1c12' : x === 10 ? '#3a140c' : bark ? '#6e2c1f' : '#8c3a2a');
    }
    for (let x = 3; x < 13; x++) px(img, x, 29, '#3a140c');
    for (let y = 0; y < 9; y++) for (let x = 0; x < 16; x++) if (rng.nextInt(8) < 9 - y) px(img, x, y, rng.nextBool() ? '#2a5a2a' : '#1e4a20');
    for (let x = 0; x < 16; x++) for (let y = 29; y < 32; y++) px(img, x, y, (x + y) % 3 ? '#2e5a24' : '#3e7030');
    for (const x of [1, 3, 13, 14]) { px(img, x, 28, '#4a8a3a'); px(img, x - 1, 27, '#4a8a3a'); px(img, x + 1, 27, '#4a8a3a'); }
    figure(img, 12, 30, '#2a3a6a');
    frame(img);
  });
  def('stranger', 'The Stranger', 2, 2, (img, rng) => {
    gradient(img, 0, 32, [[0, '#0c1016'], [0.7, '#2a323c'], [1, '#48525c']], 6);
    const trunk = (x, w, c) => { for (let y = 0; y < 30; y++) for (let k = 0; k < w; k++) px(img, x + k, y, c); };
    for (const [x, w, c] of [[2, 2, '#1e242c'], [24, 2, '#1e242c'], [9, 1, '#262c34'], [28, 3, '#0e1218'], [5, 3, '#0a0e12'], [20, 2, '#141a20']]) trunk(x, w, c);
    for (let y = 24; y < 32; y++) for (let x = 0; x < 32; x++) blend(img, x, y, '#5a646e', (y - 24) / 14 * (0.5 + bayer(x, y) * 0.5));
    for (let y = 9; y < 29; y++) for (let x = 15; x < 18; x++) px(img, x, y, '#06070a');
    for (let y = 6; y < 9; y++) for (let x = 15; x < 18; x++) px(img, x, y, '#06070a');
    rect(img, 14, 10, 1, 8, '#06070a'); rect(img, 18, 10, 1, 8, '#06070a');
    px(img, 15, 7, '#ffffff'); px(img, 17, 7, '#ffffff');
    for (let x = 0; x < 32; x++) px(img, x, 30, '#0a0e10'), px(img, x, 31, '#080a0c');
    stars(img, rng, 5, 6, ['#a0a8b8']);
    frame(img);
  });
  def('autumn_woods', 'Autumn Woods', 2, 2, (img, rng) => {
    gradient(img, 0, 14, [[0, '#e8c890'], [1, '#f8e8c0']], 4);
    for (let y = 14; y < 32; y++) for (let x = 0; x < 32; x++) px(img, x, y, ramp([[0, '#8a7a3a'], [1, '#5a4a20']], (y - 14) / 18, x, y, 4));
    for (let y = 14; y < 32; y++) { const hw = 1 + (y - 14) * 0.45; for (let x = Math.round(16 - hw); x <= Math.round(16 + hw); x++) px(img, x, y, (x + y) % 5 ? '#c8a868' : '#b89858'); }
    const cols = ['#c4782a', '#d8a020', '#b8401a', '#e09a30'];
    for (const [x, y, r] of [[4, 16, 5], [27, 15, 5], [10, 13, 4], [22, 12, 4], [1, 9, 4], [30, 8, 4], [16, 7, 3]]) roundTree(img, x, y, r, cols[rng.nextInt(4)], '#3a2414', '#f0c050');
    for (let i = 0; i < 40; i++) px(img, rng.nextInt(32), 18 + rng.nextInt(14), cols[rng.nextInt(4)]);
    frame(img);
  });
  def('watchtower', 'The Watchtower', 2, 2, (img, rng) => {
    gradient(img, 0, 24, [[0, '#4a3a8a'], [0.6, '#d87a6a'], [1, '#f8c070']], 7);
    disc(img, 7, 20, 3, '#fff0b0');
    ridge(img, rng, { base: 25, amp: 6, scale: 20, col: '#3a5a2a', light: '#4a7a32', lightDepth: 2, off: 3 });
    for (let y = 7; y < 25; y++) for (let x = 13; x < 20; x++) px(img, x, y, x === 13 ? '#9a9aa2' : x === 19 ? '#4a4a52' : ((y % 3 === 0) && ((x + (y >> 1)) % 3 === 0)) ? '#5a5a62' : '#7a7a82');
    for (let x = 12; x < 21; x += 2) rect(img, x, 5, 1, 2, '#7a7a82');
    rect(img, 12, 7, 9, 1, '#5a5a62');
    rect(img, 16, 10, 1, 2, '#1a1410'); rect(img, 16, 20, 2, 4, '#2a1a10');
    line(img, 16, 5, 16, 0, '#4a3a2a'); rect(img, 17, 0, 3, 2, '#c02020');
    for (const [x, y] of [[25, 8], [28, 6], [5, 10]]) { px(img, x, y, '#20182a'); px(img, x - 1, y - 1, '#20182a'); px(img, x + 1, y - 1, '#20182a'); }
    frame(img);
  });
  def('lumite_hollow', 'Lumite Hollow', 2, 2, (img, rng) => {
    const n = TexGen.normalize(TexGen.fnoise(rng, 32, 32, [8, 4, 2], [0.5, 0.3, 0.2]));
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) px(img, x, y, ramp([[0, '#08080c'], [1, '#2a2a34']], n[y * 32 + x] * 0.8, x, y, 4));
    for (let k = 0; k < 7; k++) { const x = 2 + rng.nextInt(28), l = 2 + rng.nextInt(6); for (let y = 0; y < l; y++) px(img, x, y, y === l - 1 ? '#3a3a44' : '#22222a'); }
    const crystal = (cx, cy, h) => {
      glow(img, cx, cy - h / 2, h + 3, '#5ff0f0', 0.45);
      for (let k = -1; k <= 1; k++) { const hh = h - Math.abs(k) * 2; for (let y = 0; y < hh; y++) px(img, cx + k + (k * y) / hh * 1.5, cy - y, y > hh - 2 ? '#e8ffff' : k < 0 ? '#7fe6f2' : '#3a9aaa'); }
    };
    crystal(7, 27, 7); crystal(24, 25, 9); crystal(15, 29, 5); crystal(29, 12, 4);
    water(img, 29, 32, [[0, '#1a3a48'], [1, '#0a1820']], rng, '#5ff0f0');
    frame(img);
  });
  def('treasure_map', 'X Marks the Spot', 2, 2, (img, rng) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) px(img, x, y, ramp([[0, '#c8b080'], [1, '#ecdcb0']], 0.6 + Math.sin(x * 0.3) * 0.15 + Math.cos(y * 0.25) * 0.15 + (rng.nextFloat() - 0.5) * 0.2, x, y, 4));
    const f = fbm(rng);
    for (let y = 2; y < 30; y++) for (let x = 2; x < 30; x++) {
      const coast = 9 + f(y / 6) * 8;
      if (x < coast) px(img, x, y, (x + y) % 4 === 0 ? '#7aa0c8' : '#5a86b8');
      else if (Math.abs(x - coast) < 1) px(img, x, y, '#8a6a3a');
    }
    for (const [x, y] of [[20, 7], [24, 9], [22, 11]]) { px(img, x, y, '#6a5030'); px(img, x - 1, y + 1, '#6a5030'); px(img, x + 1, y + 1, '#6a5030'); }
    for (const [x, y] of [[15, 22], [19, 25], [26, 20]]) { px(img, x, y, '#3a7a2a'); px(img, x, y + 1, '#5a4020'); }
    let x = 14, y = 6;
    for (let i = 0; i < 28; i++) { if (i % 2 === 0) px(img, x, y, '#a02020'); x += rng.nextInt(3) === 0 ? 1 : 0; y += 0.6; x += i > 14 ? 0.4 : 0.15; }
    line(img, 22, 21, 26, 25, '#c01818'); line(img, 26, 21, 22, 25, '#c01818');
    for (const [dx, dy] of [[0, -3], [0, 3], [-3, 0], [3, 0]]) line(img, 6, 26, 6 + dx, 26 + dy, '#5a3a1a');
    px(img, 6, 22, '#c01818');
    for (let i = 0; i < 32; i++) { if (rng.nextInt(3) === 0) px(img, i, 0, '#8a6a3a'); if (rng.nextInt(3) === 0) px(img, 0, i, '#8a6a3a'); if (rng.nextInt(3) === 0) px(img, i, 31, '#8a6a3a'); if (rng.nextInt(3) === 0) px(img, 31, i, '#8a6a3a'); }
  });
  def('ashen_wastes', 'Ashen Wastes', 4, 2, (img, rng) => {
    gradient(img, 0, 20, [[0, '#1a0a0a'], [0.6, '#5a1e10'], [1, '#a8401a']], 7);
    for (let i = 0; i < 25; i++) px(img, rng.nextInt(64), rng.nextInt(18), rng.nextBool() ? '#ff8030' : '#ffc060');
    const hs = ridge(img, rng, { base: 22, amp: 4, scale: 16, col: '#3a3634', light: '#5a5450', lightDepth: 2 });
    for (let y = 2; y < 22; y++) { const hw = Math.max(1, (y - 2) * 0.75); for (let x = Math.round(48 - hw); x <= Math.round(48 + hw); x++) px(img, x, y, x < 48 ? '#4a4240' : '#2a2422'); }
    rect(img, 46, 2, 5, 1, '#ff8020'); glow(img, 48, 2, 8, '#ff6020', 0.5);
    for (let y = 3; y < 30; y++) { const x = 48 - (y - 3) * 0.9 + Math.sin(y * 0.4) * 3; px(img, x, y, '#ffb030'); px(img, x + 1, y, '#ff7010'); px(img, x - 1, y, '#e04a0a'); }
    for (const x of [10, 17, 30]) { const b = hs[x]; line(img, x, b, x, b - 6, '#141010'); line(img, x, b - 4, x - 2, b - 6, '#141010'); line(img, x, b - 3, x + 2, b - 5, '#141010'); }
    frame(img);
  });
  def('lost_coast', 'The Lost Coast', 4, 2, (img, rng) => {
    gradient(img, 0, 14, [[0, '#3a7ad8'], [1, '#b8dcf8']], 6);
    cloud(img, 8, 5, 12, '#ffffff', '#d0dcec'); cloud(img, 36, 3, 9, '#ffffff', '#d0dcec');
    water(img, 14, 32, [[0, '#5a9ae0'], [1, '#1a4a8a']], rng, '#ffffff');
    for (let y = 14; y < 32; y++) {
      const bx = 30 + (y - 14) * 1.1 + Math.sin(y * 0.5) * 1.5;
      for (let x = Math.round(bx); x < 64; x++) px(img, x, y, x - bx < 2 ? '#e8f4f8' : x - bx < 3 ? '#e8d8a0' : '#d8c088');
    }
    for (let y = 6; y < 32; y++) {
      const cx = 50 + Math.round(Math.sin(y * 0.3) * 2) - Math.max(0, 12 - y);
      for (let x = cx; x < 64; x++) px(img, x, y, y < 8 ? '#4a8a2a' : x === cx ? '#8a8078' : ((x + y) % 4 === 0 ? '#6a625a' : '#7a7068'));
    }
    rect(img, 14, 20, 6, 1, '#3a2614'); rect(img, 15, 21, 4, 1, '#2a1a0c'); px(img, 17, 19, '#2a3a6a');
    for (const [x, y] of [[24, 6], [27, 8], [44, 4]]) { px(img, x, y, '#2a2a3a'); px(img, x - 1, y - 1, '#2a2a3a'); px(img, x + 1, y - 1, '#2a2a3a'); }
    frame(img);
  });
  def('explorer', 'The Explorer', 4, 3, (img, rng) => {
    gradient(img, 0, 26, [[0, '#4a78c8'], [0.7, '#a8c8e8'], [1, '#f0dcc0']], 7);
    cloud(img, 6, 7, 10, '#ffffff', '#dce6f0'); cloud(img, 40, 5, 14, '#ffffff', '#dce6f0');
    ridge(img, rng, { base: 22, amp: 10, scale: 10, col: '#8aa0c0', peaks: true, snow: '#eef4ff', snowLine: 15 });
    ridge(img, rng, { base: 28, amp: 6, scale: 12, col: '#5a7a8a', light: '#6a8a9a', lightDepth: 3, off: 7 });
    const hs = ridge(img, rng, { base: 34, amp: 4, scale: 18, col: '#3a6a2a', light: '#4a8a32', lightDepth: 2, off: 13 });
    for (let y = 30; y < 48; y++) { const cx = 30 + Math.sin(y * 0.25) * 6 + (y - 30) * 0.4; for (let x = Math.round(cx - 1 - (y - 30) * 0.12); x <= Math.round(cx + 1 + (y - 30) * 0.12); x++) px(img, x, y, (x + y) % 5 ? '#4a88d0' : '#8ac0f0'); }
    for (let i = 0; i < 22; i++) { const x = rng.nextInt(64), y = Math.max(hs[x] + 2, 32 + rng.nextInt(12)); roundTree(img, x, y, 1 + rng.nextInt(2), rng.nextBool() ? '#2a5a22' : '#1e4a1a', '#2a1a10'); }
    const cliffTop = (x) => x <= 15 ? 35 + Math.round(Math.sin(x * 0.7) * 0.6) : 35 + (x - 15) * 2;
    for (let x = 0; x < 22; x++) {
      const t = cliffTop(x);
      for (let y = t; y < 48; y++) {
        const face = x > 15;
        px(img, x, y, y - t < 2 && !face ? (y === t ? '#5a8a32' : '#4a7a2a') : ((x * 3 + y * 5) % 7 === 0 ? '#4a3e34' : face ? '#5e5248' : '#6e6256'));
      }
    }
    figure(img, 11, 34, '#8a3a2a', '#e0b090');
    px(img, 13, 30, '#e8e0c0'); px(img, 14, 30, '#e8e0c0'); px(img, 13, 31, '#c8c0a0');
    frame(img);
  });
  def('starfall_crater', 'Starfall', 4, 3, (img, rng) => {
    gradient(img, 0, 30, [[0, '#04041a'], [1, '#1e1a48']], 6);
    stars(img, rng, 40, 26);
    line(img, 56, 3, 40, 12, (t) => lerp(H('#1e1a48'), H('#ffffff'), t)); glow(img, 40, 12, 3, '#c0b0ff', 0.6);
    ridge(img, rng, { base: 30, amp: 3, scale: 12, col: '#0e1018' });
    for (let y = 30; y < 48; y++) for (let x = 0; x < 64; x++) px(img, x, y, ramp([[0, '#2a2a30'], [1, '#141418']], (y - 30) / 18, x, y, 4));
    for (let y = 31; y < 46; y++) {
      const hw = Math.sqrt(Math.max(0, 1 - ((y - 38.5) / 7.5) ** 2)) * 21;
      for (let x = Math.round(32 - hw); x <= Math.round(32 + hw); x++) {
        const edge = Math.abs(x - 32) > hw - 1.5;
        px(img, x, y, edge && y < 39 ? '#6a5a68' : ramp([[0, '#120e16'], [1, '#3a3040']], (y - 31) / 15, x, y, 4));
      }
    }
    glow(img, 32, 40, 15, '#9c84ee', 0.85);
    glow(img, 32, 40, 6, '#e8dcff', 0.6);
    for (const [cx, cy, h] of [[30, 41, 4], [33, 42, 5], [36, 41, 3], [27, 42, 2]]) for (let k = 0; k < h; k++) { px(img, cx, cy - k, k === h - 1 ? '#f4eeff' : '#9c84ee'); if (k < h - 2) px(img, cx + 1, cy - k, '#5a3aa8'); }
    for (const x of [6, 9, 55, 59]) pine(img, x, 30, 6, '#080a10');
    frame(img);
  });
  def('mountain_vista', 'Mountain Vista', 4, 4, (img, rng) => {
    gradient(img, 0, 34, [[0, '#3a6ac8'], [0.8, '#a8c8f0'], [1, '#e0ecf8']], 7);
    cloud(img, 40, 9, 14, '#ffffff', '#d8e4f0'); cloud(img, 4, 12, 9, '#ffffff', '#d8e4f0');
    ridge(img, rng, { base: 30, amp: 18, scale: 14, col: '#7a90b8', light: '#8aa4c8', lightDepth: 30, peaks: true, snow: '#f4f8ff', snowLine: 20 });
    ridge(img, rng, { base: 38, amp: 10, scale: 10, col: '#4a6070', light: '#5a7484', lightDepth: 20, peaks: true, snow: '#e8f0f8', snowLine: 31, off: 5 });
    const hs = ridge(img, rng, { base: 44, amp: 5, scale: 16, col: '#2a4a2a', off: 11 });
    for (let x = 0; x < 64; x += 2 + rng.nextInt(2)) pine(img, x, hs[x] + 2, 4 + rng.nextInt(4), '#1e3a1e');
    water(img, 46, 64, [[0, '#4a78b8'], [1, '#1a3a6a']], rng, '#a8c8f0');
    for (let y = 47; y < 56; y++) for (let x = 0; x < 64; x++) if (bayer(x, y) < 0.3 && y - 46 < 46 - (hs[x] - 4)) blend(img, x, y, '#2a4a3a', 0.4);
    for (let x = 0; x < 64; x++) { px(img, x, 62, '#2a3a1a'); px(img, x, 63, '#1a2a12'); if (rng.nextInt(3) === 0) px(img, x, 61, '#3a5a22'); }
    frame(img);
  });
  def('wisp_night', 'Night of the Wisps', 4, 4, (img, rng) => {
    gradient(img, 0, 40, [[0, '#04061a'], [1, '#1a2a3a']], 6);
    stars(img, rng, 50, 30);
    disc(img, 48, 12, 6, '#f0f0d8'); disc(img, 50, 11, 5, '#04061a');
    glow(img, 47, 12, 10, '#a0b0c0', 0.25);
    water(img, 40, 64, [[0, '#14242c'], [1, '#060c10']], rng, '#3a6a6a');
    const swampTree = (x, by, h) => {
      for (let y = by - h; y <= by; y++) { const w = y > by - 3 ? 2 : 1; rect(img, x - (w >> 1), y, w + 1, 1, '#05080a'); }
      for (let k = 0; k < 5; k++) { const a = rng.nextFloat() * Math.PI, l = 4 + rng.nextInt(6); line(img, x, by - h + 2, x + Math.cos(a) * l * (k % 2 ? 1 : -1), by - h + 2 - Math.sin(a) * l * 0.6, '#05080a'); }
      for (let k = 0; k < 4; k++) line(img, x + rng.nextInt(7) - 3, by - h + rng.nextInt(4), x + rng.nextInt(7) - 3, by - h + 8 + rng.nextInt(6), '#0c1a14');
    };
    swampTree(8, 44, 26); swampTree(57, 46, 30); swampTree(26, 42, 16);
    for (let x = 0; x < 64; x++) if (rng.nextInt(4) === 0) { const h = 2 + rng.nextInt(5); for (let y = 0; y < h; y++) px(img, x, 44 - y, '#05100c'); }
    for (const [x, y, r] of [[18, 30, 2], [36, 34, 1.5], [44, 26, 1.2], [30, 22, 1], [12, 38, 1.2], [50, 36, 1.8], [40, 44, 1]]) {
      glow(img, x, y, r * 5, '#3ac8b8', 0.65); disc(img, x, y, r * 0.8, '#9ff8ec'); px(img, x, y, '#f0fffc');
      glow(img, x, 80 - y, r * 3, '#2a8a80', 0.35);
    }
    for (const [x, y] of [[20, 50], [33, 55], [47, 52]]) { rect(img, x, y, 3, 1, '#2a5a2a'); px(img, x + 1, y - 1, '#2a5a2a'); }
    frame(img);
  });
  def('world_tree', 'The World Seed', 4, 4, (img, rng) => {
    gradient(img, 0, 64, [[0, '#f0a060'], [0.35, '#f8d8a0'], [0.65, '#a8c8e8'], [1, '#6a98d0']], 8);
    for (let y = 30; y < 58; y++) {
      const hw = 3 + Math.max(0, (y - 46) * 0.5) + Math.max(0, (34 - y) * 0.2);
      for (let x = Math.round(32 - hw); x <= Math.round(32 + hw); x++) px(img, x, y, x < 30 ? '#6a4a2a' : ((x + (y >> 2)) % 3 === 0 ? '#3a2412' : '#4e331a'));
    }
    for (let k = 0; k < 7; k++) { const dir = k % 2 ? 1 : -1, l = 6 + rng.nextInt(10); line(img, 32 + dir * 3, 52 + rng.nextInt(5), 32 + dir * (6 + l), 60 + rng.nextInt(3), '#3a2412'); }
    for (let y = 58; y < 64; y++) for (let x = 0; x < 64; x++) px(img, x, y, (x + y) % 3 ? '#3a6a22' : '#4a7a2a');
    const leaves = (cx, cy, r) => {
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r * 1.4); x <= cx + r * 1.4; x++) {
        const d = ((x - cx) / 1.4) ** 2 + (y - cy) ** 2;
        if (d > r * r || rng.nextInt(9) === 0) continue;
        const l = (x - cx) + (y - cy) < -r * 0.5 ? '#6ab84a' : d > r * r * 0.7 ? '#2a5a1e' : '#3f8a2b';
        px(img, x, y, l);
      }
    };
    leaves(32, 22, 16); leaves(14, 28, 8); leaves(50, 27, 9); leaves(32, 10, 9);
    for (let k = 0; k < 6; k++) line(img, 32, 32, 32 + (k - 2.5) * 6, 22 + rng.nextInt(6), '#4e331a');
    for (let k = 0; k < 12; k++) px(img, 6 + rng.nextInt(52), 4 + rng.nextInt(36), rng.nextBool() ? '#f8e860' : '#ffffff');
    figure(img, 44, 59, '#2a3a6a');
    frame(img);
  });

  // ------------------------------------------------------------ packing into the skin atlas
  const AW = Skins.AW, AH = Skins.AH, atlas = Skins.atlas;
  const blit = (img, ox, oy) => {
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      const si = (y * img.w + x) * 4, di = ((oy + y) * AW + ox + x) * 4;
      atlas[di] = img.d[si]; atlas[di + 1] = img.d[si + 1]; atlas[di + 2] = img.d[si + 2]; atlas[di + 3] = img.d[si + 3];
    }
  };
  const top = Math.ceil((Skins.names.length + 1) / 8) * 32;
  // font for sign text: white glyphs in 8x8 cells, 16 per row
  const glyphs = {};
  const chars = Object.keys(GLYPHS);
  chars.forEach((ch, i) => {
    const g = GLYPHS[ch], ox = (i % 16) * 8, oy = top + Math.floor(i / 16) * 8;
    g.rows.forEach((row, r) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') { const di = ((oy + g.top + r) * AW + ox + x) * 4; atlas[di] = atlas[di + 1] = atlas[di + 2] = atlas[di + 3] = 255; } });
    glyphs[ch] = { u: ox, v: oy, w: g.w };
  });
  let y0 = top + Math.ceil(chars.length / 16) * 8;
  y0 = Math.ceil(y0 / 16) * 16;
  // the painting back: dark planks
  const back = TexGen.T.planks_oak.copy().mapColors((r, g, b, a) => [r * 0.72, g * 0.68, b * 0.62, a]);
  const items = ART.map((a) => ({ a, pw: a.w * 16, ph: a.h * 16 })).concat([{ a: null, pw: 16, ph: 16 }]);
  items.sort((p, q) => q.ph - p.ph || q.pw - p.pw);
  let sx = 0, sy = y0, shelf = 0;
  const backPos = { u: 0, v: 0 };
  for (const it of items) {
    if (sx + it.pw > AW) { sx = 0; sy += shelf; shelf = 0; }
    if (sy + it.ph > AH) { console.warn('painting atlas full'); break; }
    if (it.a) {
      const img = new TexGen.Img(it.pw, it.ph);
      it.a.paint(img, TexGen.rngFor('painting:' + it.a.key));
      blit(img, sx, sy);
      it.a.u = sx; it.a.v = sy;
    } else { blit(back, sx, sy); backPos.u = sx; backPos.v = sy; }
    sx += it.pw; shelf = Math.max(shelf, it.ph);
  }
  const byKey = {};
  for (const a of ART) byKey[a.key] = a;
  const textWidth = (s) => { let w = 0; for (const ch of s) w += ((GLYPHS[ch] || GLYPHS['?']).w + 1); return Math.max(0, w - 1); };
  return { ART, byKey, back: backPos, glyphs, textWidth };
})();
