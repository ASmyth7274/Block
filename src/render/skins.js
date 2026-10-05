'use strict';
// ---------------------------------------------------------------------------
// Procedural entity skins in the classic 64x32 box-UV layout, packed into an
// atlas texture. All designs are original.
// ---------------------------------------------------------------------------
const Skins = (() => {
  const W = 64, H = 32;
  const C = (h) => hexToRgb(h);
  class Skin {
    constructor(w, h) { this.w = w || W; this.h = h || H; this.d = new Uint8ClampedArray(this.w * this.h * 4); }
    set(x, y, c, a) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const i = (y * this.w + x) * 4; this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a === undefined ? 255 : a; }
    get(x, y) { const i = (y * this.w + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
    rect(x, y, w, h, fn) { for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const c = typeof fn === 'function' ? fn(xx, yy) : fn; if (c) this.set(x + xx, y + yy, c, c[3]); } }
    // paint all faces of a box at (u,v) with size (w,h,d); fn(face, x, y, fw, fh) => colour
    box(u, v, w, h, d, fn) {
      const faces = {
        top: [u + d, v, w, d], bottom: [u + d + w, v, w, d],
        right: [u, v + d, d, h], front: [u + d, v + d, w, h], left: [u + d + w, v + d, d, h], back: [u + d + w + d, v + d, w, h],
      };
      for (const f in faces) { const [x0, y0, fw, fh] = faces[f]; for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const c = fn(f, x, y, fw, fh); if (c) this.set(x0 + x, y0 + y, c, c[3]); } }
    }
  }
  const rng = (s) => new Noise.Random(stringHash('skin:' + s) >>> 0);
  const vary = (r, c, amt) => { const k = 1 + (r.nextFloat() - 0.5) * amt; return [c[0] * k, c[1] * k, c[2] * k]; };

  // ------------------------------------------------------------ player / humanoids
  function humanoid(name, o) {
    const s = new Skin();
    const r = rng(name);
    const skinC = C(o.skin), hair = o.hair ? C(o.hair) : null, shirt = C(o.shirt), pants = C(o.pants), shoes = C(o.shoes || o.pants);
    // head 8x8x8 at (0,0)
    s.box(0, 0, 8, 8, 8, (f, x, y) => {
      let c = vary(r, skinC, 0.08);
      if (hair) {
        if (f === 'top') c = vary(r, hair, 0.15);
        if (f === 'back' && y < 6) c = vary(r, hair, 0.15);
        if ((f === 'left' || f === 'right') && (y < 3 || (y < 5 && (f === 'left' ? x > 4 : x < 3)))) c = vary(r, hair, 0.15);
        if (f === 'front' && y < (o.fringe || 2)) c = vary(r, hair, 0.15);
        if (f === 'front' && y === 2 && (x === 0 || x === 7)) c = vary(r, hair, 0.15);
      }
      if (f === 'front') {
        if (o.face) { const fc = o.face(x, y); if (fc) c = fc; }
        else {
          if (y === 4 && (x === 1 || x === 6)) c = [255, 255, 255];
          if (y === 4 && (x === 2 || x === 5)) c = C(o.eyes || '#3a5a8a');
          if (y === 5 && (x === 3 || x === 4)) c = skinC.map((v) => v * 0.85);
          if (y === 6 && x >= 2 && x <= 5) c = o.beard ? C(o.beard) : skinC.map((v) => v * 0.7);
          if (o.beard && y === 7 && x >= 1 && x <= 6) c = C(o.beard);
        }
      }
      return c;
    });
    // body 8x12x4 at (16,16)
    s.box(16, 16, 8, 12, 4, (f, x, y, fw) => {
      let c = vary(r, shirt, 0.1);
      if (o.belt && y >= 8 && y <= 8 && f !== 'top' && f !== 'bottom') c = C(o.belt);
      if (o.collar && f === 'front' && y === 0 && x >= 2 && x <= 5) c = skinC;
      if (o.bodyFn) { const bc = o.bodyFn(f, x, y, fw); if (bc) c = bc; }
      if (y >= 10 && f !== 'top') c = vary(r, pants, 0.1);
      return c;
    });
    // arms 4x12x4 at (40,16)
    s.box(40, 16, 4, 12, 4, (f, x, y) => {
      let c = vary(r, shirt, 0.1);
      const sleeve = o.sleeve === undefined ? 8 : o.sleeve;
      if (y >= sleeve || f === 'bottom') c = vary(r, o.armSkin ? C(o.armSkin) : skinC, 0.08);
      if (f === 'top') c = vary(r, shirt, 0.1);
      if (o.armFn) { const ac = o.armFn(f, x, y); if (ac) c = ac; }
      return c;
    });
    // legs 4x12x4 at (0,16)
    s.box(0, 16, 4, 12, 4, (f, x, y) => {
      let c = vary(r, pants, 0.1);
      if (y >= (o.shoeH || 9) || f === 'bottom') c = vary(r, shoes, 0.12);
      if (o.legFn) { const lc = o.legFn(f, x, y); if (lc) c = lc; }
      return c;
    });
    if (o.hat) s.box(32, 0, 8, 8, 8, o.hat);
    return s;
  }

  const S = {};
  S.wanderer = humanoid('wanderer', { skin: '#c8946a', hair: '#3b2614', shirt: '#3f7a3a', pants: '#4a3826', shoes: '#2a1e14', belt: '#5a3a1a', collar: true, eyes: '#3a5a8a', sleeve: 9 });
  S.explorer = humanoid('explorer', { skin: '#e0b08a', hair: '#c8a050', shirt: '#2a6aa0', pants: '#3a3a4a', shoes: '#4a2a14', belt: '#2a1a0a', eyes: '#2a7a3a', fringe: 3 });
  S.miner = humanoid('miner', { skin: '#8a5a3a', hair: '#1a1a1a', shirt: '#8a4a2a', pants: '#3a4a6a', shoes: '#2a2a2a', beard: '#1a1a1a', eyes: '#3a2a1a',
    hat: (f, x, y) => (f === 'top' || y < 2) ? [210, 180, 40] : null });
  S.zombie = humanoid('zombie', {
    skin: '#5a7d4a', hair: '#2e4422', shirt: '#6a3a2a', pants: '#3a3f52', shoes: '#2a2a32', sleeve: 4, fringe: 1,
    face: (x, y) => (y === 3 || y === 4) && (x === 1 || x === 2 || x === 5 || x === 6) ? (y === 4 && (x === 2 || x === 5) ? [12, 12, 12] : [30, 40, 26]) : (y === 6 && x >= 2 && x <= 5 ? [40, 50, 34] : null),
    bodyFn: (f, x, y) => { if ((x * 7 + y * 3) % 11 === 0 && y > 2 && y < 9) return [90, 125, 74]; return null; },
  });
  S.mummy = humanoid('mummy', {
    skin: '#cbbb92', shirt: '#d8c8a0', pants: '#c4b48c', shoes: '#a89870', sleeve: 0,
    face: (x, y) => (y === 4 && (x === 1 || x === 2 || x === 5 || x === 6)) ? [30, 22, 10] : ((y % 3 === 1) ? [168, 152, 112] : null),
    bodyFn: (f, x, y) => (y % 3 === 1) ? [176, 160, 120] : null,
    armFn: (f, x, y) => (y % 3 === 2) ? [176, 160, 120] : [216, 200, 160],
    legFn: (f, x, y) => (y % 3 === 0) ? [168, 152, 112] : null,
  });
  // skeleton: thin limbs use the same box layout (2x12x2 at arm/leg slots)
  S.skeleton = (() => {
    const s = new Skin(); const r = rng('skeleton');
    const bone = C('#d6d6cc'), dark = C('#8a8a80'), hole = [28, 28, 28];
    s.box(0, 0, 8, 8, 8, (f, x, y) => {
      let c = vary(r, bone, 0.08);
      if (f === 'front') {
        if ((y === 3 || y === 4) && (x === 1 || x === 2 || x === 5 || x === 6)) c = hole;
        if (y === 5 && (x === 3 || x === 4)) c = dark;
        if (y === 6 && x >= 1 && x <= 6) c = x % 2 ? bone : hole;
      }
      return c;
    });
    s.box(16, 16, 8, 12, 4, (f, x, y) => {
      if (f === 'front' || f === 'back') {
        if (x >= 3 && x <= 4) return vary(r, bone, 0.06);
        if (y < 7 && y % 2 === 0) return vary(r, bone, 0.08);
        if (y >= 10) return vary(r, bone, 0.08);
        return [0, 0, 0, 0];
      }
      return y % 2 === 0 ? vary(r, bone, 0.08) : [0, 0, 0, 0];
    });
    s.box(40, 16, 2, 12, 2, (f, x, y) => vary(r, y % 5 === 0 ? dark : bone, 0.06));
    s.box(0, 16, 2, 12, 2, (f, x, y) => vary(r, y % 6 === 0 ? dark : bone, 0.06));
    return s;
  })();
  S.stranger = humanoid('stranger', {
    skin: '#1c1c22', hair: '#0e0e12', shirt: '#16161a', pants: '#121216', shoes: '#0a0a0c', sleeve: 12,
    face: (x, y) => (y === 4 && (x === 1 || x === 2 || x === 5 || x === 6)) ? [235, 235, 235] : null,
  });
  // wraith: hooded, legless robe
  S.wraith = (() => {
    const s = new Skin(); const r = rng('wraith');
    const robe = C('#8aa0b8'), dark = C('#3a4a5a');
    s.box(0, 0, 8, 8, 8, (f, x, y) => {
      if (f === 'front') { if (y >= 2 && x >= 1 && x <= 6) { if (y === 4 && (x === 2 || x === 5)) return [140, 255, 250]; return [10, 14, 20]; } }
      return vary(r, robe, 0.12);
    });
    s.box(16, 16, 8, 12, 4, (f, x, y) => { const c = vary(r, robe, 0.12); return y > 8 ? [...c, 255 - (y - 8) * 50] : c; });
    s.box(40, 16, 4, 12, 4, (f, x, y) => y > 9 ? vary(r, dark, 0.1) : vary(r, robe, 0.12));
    return s;
  })();

  // ------------------------------------------------------------ creatures
  S.spider = (() => {
    const s = new Skin(); const r = rng('spider');
    const body = C('#2a221c'), spot = C('#4a3a2c');
    // head 8x8x8 at (32,4)
    s.box(32, 4, 8, 8, 8, (f, x, y) => {
      if (f === 'front' && ((y === 2 && (x === 1 || x === 6)) || (y === 3 && (x === 2 || x === 3 || x === 4 || x === 5)) || (y === 4 && (x === 1 || x === 6)))) return [200, 30, 30];
      return vary(r, r.nextInt(5) ? body : spot, 0.2);
    });
    // thorax 6x6x6 at (0,0)
    s.box(0, 0, 6, 6, 6, () => vary(r, body, 0.2));
    // abdomen 10x8x12 at (0,12)
    s.box(0, 12, 10, 8, 12, (f, x, y) => vary(r, ((x + y) % 4 === 0 && f === 'top') ? spot : body, 0.25));
    // legs 16x2x2 at (18,0)
    s.box(18, 0, 16, 2, 2, (f, x) => vary(r, x % 5 === 0 ? spot : body, 0.2));
    return s;
  })();
  // glowing spider eyes (drawn fullbright over the head)
  S.spider_eyes = (() => {
    const s = new Skin();
    s.box(32, 4, 8, 8, 8, (f, x, y) => {
      if (f !== 'front') return null;
      if ((y === 2 && (x === 1 || x === 6)) || (y === 3 && (x === 2 || x === 3 || x === 4 || x === 5)) || (y === 4 && (x === 1 || x === 6))) return [255, 70, 60];
      return null;
    });
    return s;
  })();
  S.boomcap = (() => {
    const s = new Skin(); const r = rng('boomcap');
    const stem = C('#e8dcc0'), cap = C('#b82020'), spot = C('#f2f2f2');
    // stem/body 8x8x6 at (16,18)
    s.box(16, 18, 8, 8, 6, (f, x, y) => {
      let c = vary(r, stem, 0.06);
      if (f === 'front') {
        if (y === 2 && (x === 1 || x === 2 || x === 5 || x === 6)) c = [26, 18, 12];
        if (y === 3 && (x === 2 || x === 5)) c = [26, 18, 12];
        if (y === 5 && x >= 2 && x <= 5) c = [60, 40, 30];
        if (y === 6 && (x === 1 || x === 6)) c = [60, 40, 30];
      }
      return c;
    });
    // cap 12x5x12 at (0,0)
    s.box(0, 0, 12, 5, 12, (f, x, y) => {
      if (f === 'bottom') return vary(r, C('#d8c8a8'), 0.1);
      const sp = ((x * 5 + y * 3) % 7 === 0) || (f === 'top' && ((x - 3) * (x - 3) + (y - 4) * (y - 4) < 3 || (x - 8) * (x - 8) + (y - 8) * (y - 8) < 3));
      return sp ? spot : vary(r, cap, 0.1);
    });
    // legs 4x4x4 at (0,18)
    s.box(0, 18, 4, 4, 4, () => vary(r, C('#d8ccb0'), 0.08));
    return s;
  })();
  S.slime = (() => {
    const s = new Skin(); const r = rng('slime');
    const g = C('#6ab84a');
    s.box(0, 0, 8, 8, 8, (f, x, y) => [...vary(r, g, 0.08), 170]);
    s.box(0, 16, 6, 6, 6, (f, x, y) => { if (f === 'front' && y === 1 && (x === 1 || x === 4)) return [20, 40, 10]; if (f === 'front' && y === 4 && x === 3) return [40, 80, 30]; return vary(r, C('#4f9a3a'), 0.1); });
    return s;
  })();
  function quad(name, o) {
    const s = new Skin(); const r = rng(name);
    const base = C(o.base);
    // head at (0,0) size per o.head
    const [hw, hh, hd] = o.head || [8, 8, 6];
    s.box(0, 0, hw, hh, hd, (f, x, y) => { let c = vary(r, base, 0.08); if (o.headFn) { const hc = o.headFn(f, x, y, r); if (hc) c = hc; } return c; });
    // body at (28,8) size o.body
    const [bw, bh, bd] = o.body || [10, 16, 8];
    s.box(28, 8, bw, bh, bd, (f, x, y) => { let c = vary(r, base, 0.08); if (o.bodyFn) { const bc = o.bodyFn(f, x, y, r); if (bc) c = bc; } return c; });
    // legs at (0,16) size 4x?x4
    const lh = o.legH || 6;
    s.box(0, 16, 4, lh, 4, (f, x, y) => { let c = vary(r, base, 0.08); if (o.legFn) { const lc = o.legFn(f, x, y, r, lh); if (lc) c = lc; } return c; });
    if (o.extra) o.extra(s, r);
    return s;
  }
  S.pig = quad('pig', {
    base: '#f0a8a0',
    headFn: (f, x, y) => {
      if (f === 'front') { if (y === 2 && (x === 1 || x === 6)) return [255, 255, 255]; if (y === 2 && (x === 2 || x === 5)) return [20, 20, 20]; }
      return null;
    },
    extra: (s, r) => { s.box(16, 16, 4, 3, 1, (f, x, y) => (f === 'front' && y === 1 && (x === 1 || x === 2)) ? [140, 70, 70] : vary(r, C('#e08888'), 0.06)); },
    legFn: (f, x, y, r, lh) => y >= lh - 1 ? [200, 130, 120] : null,
  });
  S.cow = quad('cow', {
    base: '#5a3a24',
    headFn: (f, x, y) => {
      if (f === 'front') { if (y === 2 && (x === 1 || x === 6)) return [20, 20, 20]; if (y >= 5) return [200, 180, 170]; if (x >= 3 && x <= 4 && y < 5) return [232, 232, 232]; }
      return null;
    },
    bodyFn: (f, x, y, r) => {
      const n = Math.sin(x * 0.9 + y * 0.4) + Math.cos(y * 0.7 - x * 0.3);
      return n > 0.6 ? vary(r, C('#e8e8e8'), 0.05) : null;
    },
    extra: (s, r) => { s.box(22, 0, 1, 3, 1, () => [200, 200, 190]); s.box(52, 0, 4, 6, 1, (f, x, y) => (y > 3 ? [200, 150, 150] : null)); },
    legFn: (f, x, y, r, lh) => y >= lh - 2 ? [50, 40, 30] : (y < 3 ? null : [232, 232, 232]),
    legH: 12,
  });
  S.sheep = quad('sheep', {
    base: '#e0c8b0',
    head: [6, 6, 8],
    headFn: (f, x, y) => {
      if (f === 'front') { if (y === 2 && (x === 0 || x === 5)) return [255, 255, 255]; if (y === 2 && (x === 1 || x === 4)) return [20, 20, 20]; if (y === 4 && x >= 2 && x <= 3) return [190, 140, 130]; }
      return null;
    },
    body: [8, 16, 6],
    legH: 12,
    legFn: (f, x, y, r, lh) => y >= lh - 1 ? [120, 100, 90] : null,
  });
  // sheep wool layer (white; tinted at draw time) - separate skin
  S.sheep_wool = (() => {
    const s = new Skin(); const r = rng('wool');
    const wl = C('#f2f2f2');
    s.box(0, 0, 6, 6, 6, (f) => f === 'front' ? null : vary(r, wl, 0.08));
    s.box(28, 8, 8, 16, 6, () => vary(r, wl, 0.1));
    s.box(0, 16, 4, 6, 4, () => vary(r, wl, 0.08));
    return s;
  })();
  S.chicken = (() => {
    const s = new Skin(); const r = rng('chicken');
    const wht = C('#f2f2f2');
    s.box(0, 0, 4, 6, 3, (f, x, y) => (f === 'front' && y === 1 && (x === 0 || x === 3)) ? [20, 20, 20] : vary(r, wht, 0.04));
    s.box(14, 0, 4, 2, 2, () => C('#f0b020'));            // beak
    s.box(14, 4, 2, 2, 2, () => C('#c81e1e'));            // wattle
    s.box(0, 9, 6, 8, 6, () => vary(r, wht, 0.05));        // body
    s.box(24, 13, 1, 4, 6, () => vary(r, C('#e4e4e4'), 0.05)); // wings
    s.box(26, 0, 3, 5, 3, (f, x, y) => y > 3 ? C('#f0b020') : (x === 1 ? C('#f0b020') : null)); // legs
    return s;
  })();
  S.deer = (() => {
    const s = new Skin(); const r = rng('deer');
    const fur = C('#a07040'), belly = C('#e8dcc8'), dark = C('#6a4a28');
    s.box(0, 0, 5, 5, 7, (f, x, y) => {
      if (f === 'front') { if (y >= 3) return vary(r, C('#2a1a10'), 0.1); }
      if ((f === 'left' || f === 'right') && y === 1 && x === 3) return [20, 20, 20];
      return vary(r, fur, 0.08);
    });
    s.box(24, 0, 3, 7, 3, () => vary(r, fur, 0.08));                       // neck
    s.box(20, 10, 8, 8, 14, (f, x, y) => {
      if (f === 'bottom') return vary(r, belly, 0.05);
      if (f === 'top' && (x + y * 3) % 7 === 0) return vary(r, belly, 0.05);
      if ((f === 'left' || f === 'right') && y < 3 && (x * 3 + y) % 5 === 0) return vary(r, belly, 0.05);
      return vary(r, (f === 'top') ? dark : fur, 0.08);
    });
    s.box(0, 16, 2, 12, 2, (f, x, y) => y > 10 ? [30, 22, 14] : vary(r, fur, 0.08));
    s.box(12, 16, 1, 6, 1, () => vary(r, C('#d8c8a8'), 0.1));               // antler
    s.box(8, 28, 4, 1, 1, () => vary(r, C('#d8c8a8'), 0.1));                // antler tine
    s.box(16, 12, 2, 3, 1, () => vary(r, belly, 0.05));                     // tail
    return s;
  })();
  // villagers: a big nose, a long robe and arms folded in their sleeves; the robe tells the trade
  function villagerSkin(name, o) {
    const s = new Skin(); const r = rng('villager_' + name);
    const skin = C('#c08f72'), brow = C('#4a3020'), robe = C(o.robe), dark = C(o.trim || '#3a2a1a');
    // head (8x10x8)
    s.box(0, 0, 8, 10, 8, (f, x, y) => {
      if (f === 'top') return o.hat ? vary(r, C(o.hat), 0.08) : vary(r, C('#5a3a22'), 0.08);
      if (o.hat && y <= 1) return vary(r, C(o.hat), 0.08);
      if (f === 'front') {
        if (y === 3 && x >= 1 && x <= 6) return brow;
        if (y === 4 && (x === 1 || x === 6)) return [240, 240, 240];
        if (y === 4 && (x === 2 || x === 5)) return C(o.eyes || '#2e6a2a');
        if (y >= 8 && x >= 2 && x <= 5) return vary(r, C('#a87a60'), 0.05);
      }
      if (f === 'back' && y < 6 && !o.hat) return vary(r, C('#5a3a22'), 0.08);
      return vary(r, skin, 0.05);
    });
    // nose (2x4x2)
    s.box(28, 26, 2, 4, 2, (f, x, y) => vary(r, C('#b07e64'), 0.06));
    // robe (8x22x6)
    s.box(36, 4, 8, 22, 6, (f, x, y, fw, fh) => {
      if (f === 'top') return vary(r, robe, 0.06);
      if (f === 'bottom') return dark;
      if (y === 9 && o.belt) return C(o.belt);
      if (o.apron && f === 'front' && y >= 3 && y <= 17 && x >= 1 && x <= 6) return vary(r, C(o.apron), 0.05);
      if (y >= 20) return vary(r, dark, 0.06);
      if (o.trimFront && f === 'front' && (x === 3 || x === 4) && y < 14) return vary(r, C(o.trimFront), 0.05);
      return vary(r, robe, 0.07);
    });
    // folded arms: two sleeves and the hands crossed between them
    s.box(0, 18, 4, 8, 4, (f, x, y) => (y >= 6 && f !== 'top') ? vary(r, skin, 0.05) : vary(r, robe, 0.07));
    s.box(16, 18, 6, 4, 4, (f, x, y) => vary(r, f === 'top' || f === 'front' ? skin : robe, 0.05));
    return s;
  }
  S.villager_farmer = villagerSkin('farmer', { robe: '#7a5a32', trim: '#4a3418', hat: '#d8c060', belt: '#3a2410' });
  S.villager_fisher = villagerSkin('fisher', { robe: '#5a7a8a', trim: '#2a3a48', hat: '#c8b050', belt: '#2a2a2a' });
  S.villager_librarian = villagerSkin('librarian', { robe: '#e4e0d4', trim: '#9a9488', trimFront: '#6a4a2a', eyes: '#3a4a7a' });
  S.villager_cleric = villagerSkin('cleric', { robe: '#7a3a92', trim: '#3a1a48', trimFront: '#e8c040', eyes: '#6a2a8a' });
  S.villager_smith = villagerSkin('smith', { robe: '#6a5a4a', trim: '#2a2420', apron: '#2a2a2e', belt: '#1a1a1a' });
  S.villager_butcher = villagerSkin('butcher', { robe: '#8a8a8a', trim: '#4a4a4a', apron: '#ece8e0', belt: '#6a2a2a' });
  // wolves: wild (amber-eyed), tame (soft eyes, tongue out) and angry (red eyes, bared teeth)
  function wolfSkin(kind) {
    const s = new Skin(); const r = rng('wolf');
    const fur = C('#c6bfb5'), dark = C('#857c72'), light = C('#e9e5df'), nose = C('#262120');
    const k = kind === 'angry' ? 0.86 : 1;
    const v = (c, a) => { const q = vary(r, c, a || 0.07); return [q[0] * k, q[1] * k, q[2] * k]; };
    // head
    s.box(0, 0, 6, 6, 4, (f, x, y) => {
      if (f === 'front') {
        if (y === 2 && (x === 1 || x === 4)) return kind === 'angry' ? [220, 30, 24] : kind === 'tame' ? [40, 28, 20] : [214, 150, 40];
        if (y === 1 && (x === 1 || x === 4)) return kind === 'angry' ? v(C('#3a2e28')) : v(dark);
        if (kind === 'angry' && y === 1 && (x === 2 || x === 3)) return v(C('#4a3e36'));
        if (y >= 4) return v(light);
        return v(fur);
      }
      if (f === 'top') return v((x + y) % 3 === 0 ? dark : fur);
      if (f === 'bottom') return v(light);
      return v(y >= 4 ? light : fur);
    });
    // snout
    s.box(0, 10, 3, 3, 4, (f, x, y) => {
      if (f === 'front') {
        if (y === 0 && x === 1) return nose;
        if (y === 0) return v(C('#4a403a'));
        if (y === 2 && kind === 'angry') return x === 1 ? [40, 20, 20] : [235, 230, 220];
        if (y === 2 && kind === 'tame' && x === 1) return [214, 96, 110];
        return v(light);
      }
      if (f === 'top') return v(y >= 3 ? C('#5a504a') : fur);
      if (f === 'bottom') return (kind === 'tame' && y === 0 && x === 1) ? [214, 96, 110] : v(light);
      if (kind === 'angry' && y === 2 && (f === 'left' || f === 'right')) return (x % 2) ? [235, 230, 220] : [60, 30, 30];
      return v(y === 2 ? light : fur);
    });
    // ears
    s.box(48, 0, 2, 2, 1, (f, x, y) => (f === 'front' && y === 1) ? [168, 120, 112] : v(dark));
    // mane: shaggy, lighter at the throat
    s.box(20, 0, 8, 7, 6, (f, x, y) => {
      if (f === 'bottom' || (f === 'front' && y >= 4)) return v(light, 0.1);
      if (f === 'top') return v((x * 7 + y * 3) % 5 === 0 ? dark : fur, 0.1);
      if ((x * 5 + y * 3) % 7 === 0) return v(light, 0.1);
      return v(y < 2 ? C('#a8a097') : fur, 0.1);
    });
    // body with a dark saddle along the back
    s.box(18, 14, 6, 6, 9, (f, x, y, fw, fh) => {
      if (f === 'top') return v((x === 0 || x === fw - 1) ? fur : dark);
      if (f === 'bottom') return v(light);
      if (y === 0) return v(dark);
      if (y >= 4) return v(light);
      return v(fur);
    });
    // tail with a dark tip
    s.box(9, 18, 2, 8, 2, (f, x, y) => v(y >= 6 ? C('#4a423c') : y < 2 ? fur : (y % 2 ? fur : dark)));
    // legs with darker paws
    s.box(0, 18, 2, 8, 2, (f, x, y) => v(y >= 7 ? C('#6a6058') : y < 3 ? fur : light));
    return s;
  }
  S.wolf = wolfSkin('wild');
  S.wolf_tame = wolfSkin('tame');
  S.wolf_angry = wolfSkin('angry');
  // the collar (white, tinted with the dye colour when drawn) wraps the front of the mane
  S.wolf_collar = (() => {
    const s = new Skin();
    s.box(0, 0, 8, 7, 1, (f, x, y) => f === 'back' ? null : ((x + y) % 4 === 0 ? [214, 214, 214] : [255, 255, 255]));
    return s;
  })();
  S.squid = (() => {
    const s = new Skin(); const r = rng('squid');
    const skin = C('#2c3c5c'), deep = C('#1c2840'), pale = C('#5c7096'), spot = C('#7a5a8a');
    s.box(0, 0, 12, 16, 12, (f, x, y) => {
      if (f === 'front' || f === 'back') {
        if (f === 'front' && y >= 9 && y <= 11 && (x === 2 || x === 3 || x === 8 || x === 9)) {
          if (y === 10 && (x === 3 || x === 8)) return [12, 12, 16];
          return y === 9 ? [230, 236, 240] : [196, 208, 220];
        }
      }
      if (f === 'top') return vary(r, (x + y) % 4 === 0 ? spot : deep, 0.1);
      if (f === 'bottom') return vary(r, deep, 0.1);
      if (y < 4 && (x * 3 + y * 5) % 7 === 0) return vary(r, spot, 0.1);
      if ((x * 5 + y * 7) % 11 === 0) return vary(r, pale, 0.1);
      return vary(r, y > 12 ? deep : skin, 0.08);
    });
    s.box(48, 0, 2, 18, 2, (f, x, y) => {
      if ((f === 'front' || f === 'left') && y > 3 && y % 3 === 0) return vary(r, C('#9aa8c8'), 0.08);
      return vary(r, y > 14 ? deep : skin, 0.08);
    });
    s.box(48, 22, 1, 6, 4, () => vary(r, pale, 0.1));
    return s;
  })();
  S.bat = (() => {
    const s = new Skin(); const r = rng('bat');
    const fur = C('#3a2a1a');
    s.box(0, 0, 6, 6, 6, (f, x, y) => (f === 'front' && y === 2 && (x === 1 || x === 4)) ? [200, 60, 30] : vary(r, fur, 0.15));
    s.box(0, 16, 6, 6, 4, () => vary(r, fur, 0.15));
    s.box(42, 0, 10, 16, 1, (f, x, y) => (x + y) % 5 === 0 ? [20, 14, 10] : vary(r, C('#2a1e14'), 0.15));
    return s;
  })();

  // ------------------------------------------------------------ the Far Isles
  // the gaunt: a long, thin shadow speckled with starlight; its eyes live in a
  // second skin that is drawn full-bright over the head
  S.gaunt = (() => {
    const s = new Skin(); const r = rng('gaunt');
    const body = C('#17121f'), dark = C('#0e0b14'), speck = C('#5a4a7a'), star = C('#b8a8e8');
    const pick = (x, y, k) => { const h = (x * 31 + y * 17 + k * 7) % 53; return h === 0 ? star : h < 4 ? speck : vary(r, (x + y) % 4 === 0 ? dark : body, 0.12); };
    s.box(0, 0, 8, 8, 8, (f, x, y) => {
      if (f === 'front' && y === 4 && (x === 1 || x === 2 || x === 5 || x === 6)) return [70, 40, 110];
      if (f === 'front' && y >= 6 && x >= 2 && x <= 5) return dark;
      return pick(x, y, 1);
    });
    s.box(16, 16, 8, 12, 4, (f, x, y) => pick(x, y, 2));
    s.box(48, 0, 2, 26, 2, (f, x, y) => pick(x, y, 3));
    s.box(56, 0, 2, 28, 2, (f, x, y) => y > 25 ? vary(r, dark, 0.1) : pick(x, y, 4));
    return s;
  })();
  S.gaunt_eyes = (() => {
    const s = new Skin();
    s.box(0, 0, 8, 8, 8, (f, x, y) => {
      if (f !== 'front') return null;
      if (y === 4 && (x === 1 || x === 6)) return [196, 140, 255];
      if (y === 4 && (x === 2 || x === 5)) return [248, 232, 255];
      if (y === 3 && (x === 2 || x === 5)) return [150, 90, 220];
      return null;
    });
    return s;
  })();

  // ------------------------------------------------------------ the Sift
  // the gleaner: dusty grey-brown fur, a pale belly, big amber eyes, a burlap sack
  S.gleaner = (() => {
    const s = new Skin(); const r = rng('gleaner');
    const fur = C('#7e735f'), dark = C('#5e5546'), belly = C('#b8ad96'), sack = C('#8a6a40'), sackD = C('#6a4e2c');
    s.box(0, 0, 6, 5, 9, (f, x, y) => f === 'bottom' ? vary(r, belly, 0.08) : ((x + y * 3) % 7 === 0 ? vary(r, dark, 0.1) : vary(r, fur, 0.1)));
    s.box(30, 0, 6, 5, 5, (f, x, y) => {
      if (f === 'front') {
        if (y === 1 && (x === 1 || x === 4)) return C('#ffcf5a');
        if (y === 1 && (x === 0 || x === 5)) return C('#3a2a10');
        if (y === 3 && (x === 2 || x === 3)) return C('#3a2e26');
        if (y >= 3) return vary(r, belly, 0.08);
      }
      return vary(r, fur, 0.1);
    });
    s.box(52, 0, 1, 5, 3, (f, x, y) => (f === 'left' || f === 'right') && y > 0 && x > 0 ? C('#c8a0b0') : vary(r, fur, 0.1));
    s.box(0, 14, 2, 6, 2, (f, x, y) => y >= 5 ? C('#3a3228') : vary(r, dark, 0.1));
    s.box(8, 14, 3, 3, 7, (f, x, y) => (x + y) % 3 === 0 ? vary(r, belly, 0.1) : vary(r, fur, 0.12));
    s.box(28, 14, 5, 4, 5, (f, x, y) => (x + y) % 2 === 0 ? vary(r, sack, 0.1) : vary(r, sackD, 0.1));
    return s;
  })();
  // the sifter: grey-lavender scales in rows, a pale belly, small black eyes
  S.sifter = (() => {
    const s = new Skin(); const r = rng('sifter');
    const sc = C('#a29cb4'), scD = C('#827c94'), belly = C('#d4cee4'), fin = C('#8a849e');
    const scale = (f, x, y) => f === 'bottom' ? vary(r, belly, 0.06) : ((x + (y >> 1)) % 2 === 0 ? vary(r, sc, 0.08) : vary(r, scD, 0.08));
    s.box(0, 0, 6, 5, 6, (f, x, y) => (f === 'front' && y === 1 && (x === 0 || x === 5)) ? C('#101014') : (f === 'front' && y >= 3) ? C('#2a2430') : scale(f, x, y));
    s.box(24, 0, 5, 2, 5, (f, x, y) => f === 'top' ? ((x + y) % 2 ? C('#e8e4f0') : C('#5a2430')) : vary(r, belly, 0.08));
    s.box(0, 11, 5, 5, 6, scale);
    s.box(22, 11, 4, 4, 6, scale);
    s.box(0, 22, 3, 3, 6, scale);
    s.box(18, 22, 1, 6, 3, () => vary(r, fin, 0.12));
    s.box(44, 0, 2, 4, 6, (f, x, y) => (x + y) % 3 === 0 ? vary(r, C('#9a94ae'), 0.1) : vary(r, fin, 0.12));
    s.box(44, 20, 2, 3, 3, (f, x, y) => y < 1 ? vary(r, C('#5a546c'), 0.1) : vary(r, fin, 0.12));
    s.box(44, 13, 3, 1, 3, () => vary(r, fin, 0.12));
    return s;
  })();

  // ------------------------------------------------------------ the Hush
  // the Listener: slate-dark hide over a cage of ribs that glow when its heart beats,
  // and no face at all - only a dish of an ear, whorled like a shell
  const LS = { base: C('#162224'), dark: C('#0c1315'), hi: C('#24363a'), lichen: C('#2c4644'), bone: C('#5d7d78'), rim: C('#6f8f8a'), moss: C('#0f5c58') };
  const ribAt = (x, y) => {
    if ((x === 7 || x === 8) && y >= 2 && y <= 14) return true;
    for (const ry of [3, 6, 9, 12]) { const off = Math.floor(Math.abs(x - 7.5) / 3.2); if (y === ry + off && x >= 1 && x <= 14 && !(x === 7 || x === 8)) return true; }
    return false;
  };
  const heartAt = (x, y) => x >= 6 && x <= 9 && y >= 7 && y <= 9;
  S.listener = (() => {
    const s = new Skin(); const r = rng('listener');
    s.box(0, 0, 16, 18, 8, (f, x, y) => {
      if (f === 'front') { if (heartAt(x, y)) return C('#1d3a3a'); if (ribAt(x, y)) return vary(r, LS.bone, 0.08); }
      if (f === 'back' && (x === 7 || x === 8)) return y % 3 === 0 ? vary(r, LS.lichen, 0.1) : vary(r, LS.hi, 0.08);
      if (f === 'top' && (x * 5 + y * 3) % 7 < 2) return vary(r, LS.moss, 0.15);
      const h = (x * 31 + y * 17) % 23;
      return h === 0 ? vary(r, LS.lichen, 0.1) : vary(r, (x + y * 2) % 5 === 0 ? LS.dark : LS.base, 0.1);
    });
    return s;
  })();
  S.listener_glow = (() => {
    const s = new Skin();
    s.box(0, 0, 16, 18, 8, (f, x, y) => {
      if (f === 'front') { if (heartAt(x, y)) return (x === 6 || x === 9 || y === 7 || y === 9) ? [95, 247, 238] : [232, 255, 253]; if (ribAt(x, y)) return [63, 224, 214]; }
      // down its back, the spine and two rows of vents glow too, so you can see it walk away
      if (f === 'back' && (x === 7 || x === 8) && y % 3 === 0) return [63, 224, 214];
      if (f === 'back' && (x === 3 || x === 12) && y >= 3 && y <= 13 && y % 2 === 1) return [36, 160, 154];
      if ((f === 'left' || f === 'right') && x === 4 && y >= 5 && y <= 11 && y % 3 === 2) return [36, 160, 154];
      if (f === 'top' && (x * 5 + y * 3) % 11 === 0) return [40, 190, 180];
      return null;
    });
    return s;
  })();
  S.listener_limbs = (() => {
    const s = new Skin(); const r = rng('listener_limbs');
    s.box(0, 0, 6, 14, 6, (f, x, y) => {
      if (y >= 12) return f === 'front' && y === 13 && x % 2 === 0 ? vary(r, LS.rim, 0.08) : vary(r, LS.dark, 0.1);
      if (y === 6 || y === 7) return vary(r, LS.hi, 0.08);
      return vary(r, (x * 3 + y) % 7 === 0 ? LS.lichen : LS.base, 0.1);
    });
    s.box(24, 0, 5, 26, 5, (f, x, y) => {
      if (y >= 22) return (f === 'front' || f === 'bottom') && y >= 24 && x % 2 === 0 ? vary(r, LS.rim, 0.08) : vary(r, LS.dark, 0.1);
      if (y < 4 && f === 'top') return vary(r, LS.moss, 0.15);
      return vary(r, y >= 13 ? ((x + y) % 6 === 0 ? LS.lichen : LS.hi) : ((x * 7 + y) % 9 === 0 ? LS.lichen : LS.base), 0.1);
    });
    return s;
  })();
  const whorl = (x, y) => { const d = Math.hypot(x - 4.5, y - 4.5); return d < 1.2 ? 0 : (d > 1.8 && d < 2.6) || (d > 3.5 && d < 4.3) ? 2 : 1; };
  S.listener_head = (() => {
    const s = new Skin(); const r = rng('listener_head');
    s.box(0, 0, 10, 10, 8, (f, x, y) => {
      if (f === 'front') { const w = whorl(x, y); return w === 0 ? [5, 9, 10] : w === 2 ? vary(r, C('#2a4a48'), 0.08) : vary(r, LS.dark, 0.1); }
      return vary(r, (x * 3 + y * 5) % 11 === 0 ? LS.lichen : LS.base, 0.1);
    });
    // the rim's lip is dark and lichened; the inside of the dish is pale, veined with teal
    const rimFn = (inner) => (f, x, y, fw, fh) => {
      if (f === 'front') return (x * 5 + y * 3) % 7 === 0 ? vary(r, LS.lichen, 0.1) : vary(r, y === 0 || x === 0 ? LS.hi : LS.base, 0.08);
      if (f === inner) return (x * 2 + y) % 5 === 0 ? vary(r, C('#3f6f6a'), 0.08) : vary(r, LS.bone, 0.1);
      return vary(r, (x + y) % 4 === 0 ? LS.dark : LS.base, 0.1);
    };
    s.box(36, 0, 4, 10, 3, (f, x, y, fw, fh) => (f === 'left' || f === 'right') ? rimFn('left')(f === 'right' ? 'left' : f, x, y, fw, fh) : rimFn('none')(f, x, y, fw, fh));
    s.box(0, 18, 18, 3, 3, rimFn('bottom'));
    s.box(0, 24, 18, 3, 3, rimFn('top'));
    return s;
  })();
  S.listener_head_glow = (() => {
    const s = new Skin();
    s.box(0, 0, 10, 10, 8, (f, x, y) => (f === 'front' && whorl(x, y) === 2 && (x + y) % 2 === 0) ? [63, 224, 214] : (f === 'back' && y % 4 === 2 && (x === 3 || x === 6)) ? [36, 160, 154] : null);
    const glowRim = (inner) => (f, x, y) => f === 'front' ? ((x * 5 + y * 3) % 11 === 0 ? [95, 247, 238] : null) : f === inner && (x * 2 + y) % 5 === 0 ? [40, 180, 172] : null;
    s.box(36, 0, 4, 10, 3, (f, x, y) => (f === 'left' || f === 'right') ? ((x * 2 + y) % 5 === 0 ? [40, 180, 172] : null) : glowRim('none')(f, x, y));
    s.box(0, 18, 18, 3, 3, glowRim('bottom'));
    s.box(0, 24, 18, 3, 3, glowRim('top'));
    return s;
  })();

  // ------------------------------------------------------------ the Underworld
  S.mite = (() => {
    const s = new Skin(); const r = rng('mite');
    const sz = [[3, 2, 2], [4, 3, 2], [6, 4, 3], [3, 3, 3], [2, 2, 3], [2, 1, 2], [1, 1, 2]];
    const uv = [[0, 0], [0, 4], [0, 9], [0, 16], [0, 22], [0, 27], [24, 0]];
    sz.forEach(([w, h, d], i) => s.box(uv[i][0], uv[i][1], w, h, d, (f, x, y) => {
      if (i === 0 && f === 'front' && y === 0 && (x === 0 || x === w - 1)) return [20, 20, 22];
      return vary(r, (x + y + i) % 3 === 0 ? C('#5a5a5e') : C('#8a8a8e'), 0.1);
    }));
    return s;
  })();
  // the wailer: a vast pale weeper. Eyes shut and streaming until it sees you.
  function wailerSkin(open) {
    const s = new Skin(); const r = rng('wailer');
    const base = C('#e4dfe8'), shade = C('#c4bccc'), deep = C('#a49cb0'), tear = C('#8cb8e6');
    s.box(0, 0, 16, 16, 16, (f, x, y) => {
      let c = vary(r, (x * 7 + y * 5) % 13 === 0 ? shade : base, 0.05);
      if (f === 'bottom') return vary(r, (x + y) % 3 === 0 ? deep : shade, 0.06);
      if (f !== 'front') { if (y > 11 && (x * 3 + y) % 5 === 0) c = vary(r, shade, 0.05); return c; }
      // the face
      const eye = (cx) => Math.abs(x - cx) <= 2;
      if (!open) {
        // shut, downturned eyes with tears running from them
        if (y === 5 && (eye(4) || eye(11)) && !(x === 4 || x === 11)) return C('#4a4054');
        if (y === 4 && (x === 4 || x === 11)) return C('#4a4054');
        if (y >= 6 && y <= 13 && (x === 3 || x === 12) && (y % 3 !== 0)) return vary(r, tear, 0.08);
        if (y >= 7 && y <= 10 && (x === 5 || x === 10) && y % 2 === 0) return vary(r, tear, 0.08);
        // a small sorrowful mouth, turned down at the corners
        if (y === 11 && x >= 6 && x <= 9) return C('#5a4e60');
        if (y === 12 && (x === 5 || x === 10)) return C('#5a4e60');
        return c;
      }
      // eyes and mouth flung open, burning red
      if (y >= 4 && y <= 6 && (eye(4) || eye(11))) return (y === 5 && (x === 4 || x === 11)) ? C('#ffd27a') : C('#c81e10');
      if (y >= 7 && y <= 13 && (x === 3 || x === 12) && (y % 3 !== 0)) return vary(r, tear, 0.08);
      if (y >= 9 && y <= 13 && x >= 5 && x <= 10) {
        if (y === 9 || y === 13 || x === 5 || x === 10) return C('#3a1018');
        return (y === 12) ? C('#ff6a1a') : C('#8a1410');
      }
      return c;
    });
    return s;
  }
  S.wailer = wailerSkin(false);
  S.wailer_open = wailerSkin(true);
  S.wailer_tentacle = (() => {
    const s = new Skin(); const r = rng('wailer_t');
    s.box(0, 0, 2, 12, 2, (f, x, y) => vary(r, y > 8 ? C('#a49cb0') : y > 4 ? C('#c4bccc') : C('#e0dae4'), 0.06));
    return s;
  })();
  // the charred: miners lost below long ago, burnt black, embers glowing in the cracks
  S.charred = humanoid('charred', {
    skin: '#2c2622', shirt: '#4a3626', pants: '#2e2824', shoes: '#181412', sleeve: 5, armSkin: '#2c2622',
    face: (x, y) => {
      if (y === 3 && (x === 1 || x === 2 || x === 5 || x === 6)) return [24, 18, 16];
      if (y === 4 && (x === 2 || x === 5)) return [255, 176, 64];
      if (y === 4 && (x === 1 || x === 6)) return [200, 90, 30];
      if (y === 6 && x >= 2 && x <= 5) return x === 3 || x === 4 ? [120, 40, 16] : [20, 16, 14];
      if ((x * 5 + y * 3) % 11 === 0) return [230, 110, 30];
      return null;
    },
    bodyFn: (f, x, y) => {
      if ((x * 7 + y * 5) % 9 === 0 && y > 1 && y < 10) return [44, 38, 34];         // holes burnt through the shirt
      if ((x * 3 + y * 7) % 13 === 0) return [255, 130, 40];                           // embers
      return null;
    },
    armFn: (f, x, y) => ((x * 5 + y * 3) % 7 === 0 && y > 5) ? [240, 120, 34] : null,
    legFn: (f, x, y) => ((x * 3 + y * 5) % 11 === 0 && y < 9) ? [220, 100, 30] : null,
    // a battered miner's helmet with a dead lamp
    hat: (f, x, y) => {
      if (f === 'bottom') return null;
      if (f === 'top') return [86, 76, 64];
      if (y > 2) return null;
      if (f === 'front' && y >= 0 && y <= 2 && x >= 3 && x <= 4) return y === 1 ? [255, 200, 90] : [60, 54, 46];
      return [96, 84, 70];
    },
  });
  // magma slime: two halves of cooled crust around a molten core
  S.magma_slime = (() => {
    const s = new Skin(); const r = rng('magma');
    const crust = C('#2a1a16'), crust2 = C('#3a221a'), seam = C('#c8501a'), hot = C('#ff9a2a');
    const shell = (f, x, y, top) => {
      if (f === 'front' && top && y === 1 && (x === 2 || x === 5)) return C('#ffd84a');
      if (f === 'front' && top && y === 2 && (x === 2 || x === 5)) return C('#ff8a20');
      if ((f === 'top' || f === 'bottom') && (x * 5 + y * 3) % 7 === 0) return vary(r, seam, 0.1);
      if (f !== 'top' && f !== 'bottom' && (top ? y === 3 : y === 0)) return vary(r, seam, 0.1);
      if ((x * 3 + y * 7) % 9 === 0) return vary(r, hot, 0.1);
      return vary(r, (x + y) % 3 === 0 ? crust2 : crust, 0.12);
    };
    s.box(0, 0, 8, 4, 8, (f, x, y) => shell(f, x, y, true));
    s.box(32, 0, 8, 4, 8, (f, x, y) => shell(f, x, y, false));
    s.box(0, 16, 6, 6, 6, (f, x, y) => vary(r, (x + y) % 2 ? C('#ffb02a') : C('#ff7a1a'), 0.1));
    return s;
  })();
  // the flare: a caged fire with burning rods wheeling round it
  S.flare = (() => {
    const s = new Skin(); const r = rng('flare');
    const iron = C('#3a302c'), fire = C('#ffb83a'), deep = C('#e0601a');
    s.box(0, 0, 8, 8, 8, (f, x, y) => {
      if (f === 'front' && y === 3 && (x === 2 || x === 5)) return [255, 255, 220];
      if (f === 'front' && y === 5 && x >= 3 && x <= 4) return [255, 240, 160];
      const bar = x === 0 || x === 7 || y === 0 || y === 7 || (f !== 'top' && f !== 'bottom' && (x === 3 || x === 4) && y < 2);
      if (bar) return vary(r, iron, 0.12);
      return vary(r, (x * 3 + y * 5) % 4 === 0 ? deep : fire, 0.12);
    });
    s.box(0, 16, 2, 8, 2, (f, x, y) => vary(r, y % 3 === 0 ? C('#a8481a') : C('#ffc04a'), 0.1));
    return s;
  })();
  // ------------------------------------------------------------ armour layers
  function armorSkin(mat, colors) {
    const s = new Skin(); const r = rng('armor' + mat);
    const [b, l, d] = colors.map(C);
    const pick = (x, y) => vary(r, (x + y) % 5 === 0 ? l : ((x * 3 + y) % 7 === 0 ? d : b), 0.06);
    s.box(0, 0, 8, 8, 8, (f, x, y) => (f === 'front' && y > 1 && x > 0 && x < 7) ? (y >= 6 ? null : (y <= 2 ? pick(x, y) : null)) : (f === 'bottom' ? null : pick(x, y)));
    // the chest piece and sleeves stop short, so their bottom faces stay open
    s.box(16, 16, 8, 12, 4, (f, x, y) => (f === 'bottom' || y > 10) ? null : pick(x, y));
    s.box(40, 16, 4, 12, 4, (f, x, y) => (f === 'bottom' || y > 5) ? null : pick(x, y));
    s.box(0, 16, 4, 12, 4, (f, x, y) => y < 9 ? null : pick(x, y));
    // leggings live in the second layer (offset by 32 in y within the atlas slot)
    return s;
  }
  function legSkin(mat, colors) {
    const s = new Skin(); const r = rng('legs' + mat);
    const [b, l, d] = colors.map(C);
    const pick = (x, y) => vary(r, (x + y) % 5 === 0 ? l : ((x * 3 + y) % 7 === 0 ? d : b), 0.06);
    s.box(16, 16, 8, 12, 4, (f, x, y) => y >= 9 ? pick(x, y) : null);
    s.box(0, 16, 4, 12, 4, (f, x, y) => y < 9 ? pick(x, y) : null);
    return s;
  }
  const ARMOR_COLORS = {
    leather: ['#8a5530', '#a8703e', '#5a3418'], iron: ['#c4c4c4', '#ececec', '#8a8a8a'], gold: ['#e8c030', '#fff080', '#a87810'],
    diamond: ['#4adcd4', '#a8fff8', '#1a8a90'], cobalt: ['#3b54c4', '#8ca0ff', '#1c2a78'], starmetal: ['#5a3aa8', '#d8c8ff', '#2a1a58'],
  };
  for (const m in ARMOR_COLORS) { S['armor_' + m] = armorSkin(m, ARMOR_COLORS[m]); S['legs_' + m] = legSkin(m, ARMOR_COLORS[m]); }

  // ------------------------------------------------------------ atlas
  const SLOT_W = 64, SLOT_H = 32, COLS = 8;
  const names = Object.keys(S);
  const ROWS = Math.ceil((names.length + 4) / COLS);
  const AW = SLOT_W * COLS, AH = 512;
  const atlas = new Uint8ClampedArray(AW * AH * 4);
  const slots = {};
  function blit(name, skin, idx) {
    const ox = (idx % COLS) * SLOT_W, oy = Math.floor(idx / COLS) * SLOT_H;
    for (let y = 0; y < skin.h && y < SLOT_H; y++) for (let x = 0; x < skin.w && x < SLOT_W; x++) {
      const si = (y * skin.w + x) * 4, di = ((oy + y) * AW + ox + x) * 4;
      atlas[di] = skin.d[si]; atlas[di + 1] = skin.d[si + 1]; atlas[di + 2] = skin.d[si + 2]; atlas[di + 3] = skin.d[si + 3];
    }
    slots[name] = { u: ox / AW, v: oy / AH, du: 1 / AW, dv: 1 / AH, idx };
  }
  names.forEach((n, i) => blit(n, S[n], i));
  void ROWS;
  // custom player skin slot (loaded from a PNG)
  const customIdx = names.length;
  function setCustom(imgData) {
    const s = new Skin();
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) { const i = (y * imgData.width + x) * 4; s.set(x, y, [imgData.data[i], imgData.data[i + 1], imgData.data[i + 2]], imgData.data[i + 3]); }
    blit('custom', s, customIdx);
  }
  return { S, slots, atlas, AW, AH, setCustom, names };
})();
