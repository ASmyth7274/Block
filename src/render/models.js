'use strict';
// ---------------------------------------------------------------------------
// Box models (units: pixels, y up, model faces -Z, character's right = +X)
// part: { pivot:[x,y,z], rot0:[rx,ry,rz], boxes:[{o:[x,y,z], s:[w,h,d], uv:[u,v], mirror, inflate}] }
// ---------------------------------------------------------------------------
const M3 = {
  // 3x4 affine matrices stored as arrays of 12 (column-major-ish: [r00 r01 r02 r10 r11 r12 r20 r21 r22 tx ty tz])
  ident() { return [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]; },
  mul(a, b) {
    // a * b
    const o = new Array(12);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    for (let r = 0; r < 3; r++) o[9 + r] = a[r * 3] * b[9] + a[r * 3 + 1] * b[10] + a[r * 3 + 2] * b[11] + a[9 + r];
    return o;
  },
  trans(x, y, z) { return [1, 0, 0, 0, 1, 0, 0, 0, 1, x, y, z]; },
  scale(x, y, z) { return [x, 0, 0, 0, y, 0, 0, 0, z, 0, 0, 0]; },
  rx(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c, 0, 0, 0]; },
  ry(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c, 0, 0, 0]; },
  rz(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1, 0, 0, 0]; },
  apply(m, x, y, z, out) {
    out[0] = m[0] * x + m[1] * y + m[2] * z + m[9];
    out[1] = m[3] * x + m[4] * y + m[5] * z + m[10];
    out[2] = m[6] * x + m[7] * y + m[8] * z + m[11];
    return out;
  },
  applyDir(m, x, y, z, out) {
    out[0] = m[0] * x + m[1] * y + m[2] * z; out[1] = m[3] * x + m[4] * y + m[5] * z; out[2] = m[6] * x + m[7] * y + m[8] * z;
    return out;
  },
};

const MODELS = (() => {
  const bx = (o, s, uv, extra) => Object.assign({ o, s, uv }, extra || {});
  const biped = (armW, opts) => {
    opts = opts || {};
    const aw = armW || 4;
    return {
      head: { pivot: [0, 24, 0], boxes: [bx([-4, 0, -4], [8, 8, 8], [0, 0])] },
      hat: { pivot: [0, 24, 0], boxes: [bx([-4, 0, -4], [8, 8, 8], [32, 0], { inflate: 0.5 })], follow: 'head' },
      body: { pivot: [0, 24, 0], boxes: [bx([-4, -12, -2], [8, 12, 4], [16, 16])] },
      rarm: { pivot: [5, 22, 0], boxes: [bx(aw === 4 ? [-1, -10, -2] : [0, -10, -1], [aw, 12, aw], [40, 16])] },
      larm: { pivot: [-5, 22, 0], boxes: [bx(aw === 4 ? [-3, -10, -2] : [-2, -10, -1], [aw, 12, aw], [40, 16], { mirror: true })] },
      rleg: opts.noLegs ? null : { pivot: [1.9, 12, 0], boxes: [bx(aw === 4 ? [-2, -12, -2] : [-1, -12, -1], [aw, 12, aw], [0, 16])] },
      lleg: opts.noLegs ? null : { pivot: [-1.9, 12, 0], boxes: [bx(aw === 4 ? [-2, -12, -2] : [-1, -12, -1], [aw, 12, aw], [0, 16], { mirror: true })] },
    };
  };
  const strip = (m) => { for (const k in m) if (!m[k]) delete m[k]; return m; };
  const quad = (o) => ({
    head: { pivot: o.headPivot, boxes: o.headBoxes },
    // classic models build the torso upright and tip it forward; y is flipped here (y up)
    body: { pivot: o.bodyPivot, rot0: [-Math.PI / 2, 0, 0], boxes: [bx([o.bodyO[0], -(o.bodyO[1] + o.bodyS[1]), o.bodyO[2]], o.bodyS, [28, 8])] },
    leg0: { pivot: [3, o.legH, 7], boxes: [bx([-2, -o.legH, -2], [4, o.legH, 4], [0, 16])] },
    leg1: { pivot: [-3, o.legH, 7], boxes: [bx([-2, -o.legH, -2], [4, o.legH, 4], [0, 16], { mirror: true })] },
    leg2: { pivot: [3, o.legH, -5], boxes: [bx([-2, -o.legH, -2], [4, o.legH, 4], [0, 16])] },
    leg3: { pivot: [-3, o.legH, -5], boxes: [bx([-2, -o.legH, -2], [4, o.legH, 4], [0, 16], { mirror: true })] },
  });
  const spiderLegs = {};
  for (let i = 0; i < 8; i++) {
    const right = i % 2 === 0, z = [2, 1, 0, -1][i >> 1];
    spiderLegs['leg' + i] = { pivot: [right ? 4 : -4, 9, z], boxes: [bx(right ? [-1, -1, -1] : [-15, -1, -1], [16, 2, 2], [18, 0], { mirror: !right })] };
  }
  return {
    biped: biped(4),
    skeleton: biped(2),
    wraith: strip(biped(4, { noLegs: true })),
    quadPig: quad({ headPivot: [0, 12, -6], headBoxes: [bx([-4, -4, -8], [8, 8, 8], [0, 0]), bx([-2, -3, -9], [4, 3, 1], [16, 16])], bodyPivot: [0, 13, 2], bodyO: [-5, -10, -7], bodyS: [10, 16, 8], legH: 6 }),
    quadCow: quad({ headPivot: [0, 20, -8], headBoxes: [bx([-4, -4, -6], [8, 8, 6], [0, 0]), bx([-5, 3, -4], [1, 3, 1], [22, 0]), bx([4, 3, -4], [1, 3, 1], [22, 0])], bodyPivot: [0, 19, 2], bodyO: [-5, -10, -7], bodyS: [10, 16, 8], legH: 12 }),
    quadSheep: quad({ headPivot: [0, 18, -8], headBoxes: [bx([-3, -4, -6], [6, 6, 8], [0, 0])], bodyPivot: [0, 19, 2], bodyO: [-4, -10, -7], bodyS: [8, 16, 6], legH: 12 }),
    spider: Object.assign({
      head: { pivot: [0, 9, -3], boxes: [bx([-4, -4, -8], [8, 8, 8], [32, 4])] },
      neck: { pivot: [0, 9, 0], boxes: [bx([-3, -3, -3], [6, 6, 6], [0, 0])] },
      body: { pivot: [0, 9, 9], boxes: [bx([-5, -4, -6], [10, 8, 12], [0, 12])] },
    }, spiderLegs),
    boomcap: {
      body: { pivot: [0, 4, 0], boxes: [bx([-4, 0, -3], [8, 8, 6], [16, 18])] },
      cap: { pivot: [0, 12, 0], boxes: [bx([-6, 0, -6], [12, 5, 12], [0, 0])] },
      leg0: { pivot: [2, 4, 2], boxes: [bx([-2, -4, -2], [4, 4, 4], [0, 18])] },
      leg1: { pivot: [-2, 4, 2], boxes: [bx([-2, -4, -2], [4, 4, 4], [0, 18], { mirror: true })] },
      leg2: { pivot: [2, 4, -2], boxes: [bx([-2, -4, -2], [4, 4, 4], [0, 18])] },
      leg3: { pivot: [-2, 4, -2], boxes: [bx([-2, -4, -2], [4, 4, 4], [0, 18], { mirror: true })] },
    },
    slime: {
      inner: { pivot: [0, 0, 0], boxes: [bx([-3, 1, -3], [6, 6, 6], [0, 16])] },
      outer: { pivot: [0, 0, 0], boxes: [bx([-4, 0, -4], [8, 8, 8], [0, 0])], translucent: true },
    },
    chicken: {
      head: { pivot: [0, 9, -4], boxes: [bx([-2, 0, -2], [4, 6, 3], [0, 0]), bx([-2, 2, -4], [4, 2, 2], [14, 0]), bx([-1, 0, -3], [2, 2, 2], [14, 4])] },
      body: { pivot: [0, 8, 0], rot0: [-Math.PI / 2, 0, 0], boxes: [bx([-3, -4, -3], [6, 8, 6], [0, 9])] },
      rwing: { pivot: [3, 11, 0], boxes: [bx([0, -4, -3], [1, 4, 6], [24, 13])] },
      lwing: { pivot: [-3, 11, 0], boxes: [bx([-1, -4, -3], [1, 4, 6], [24, 13], { mirror: true })] },
      rleg: { pivot: [1, 5, 1], boxes: [bx([-1, -5, -1], [3, 5, 3], [26, 0])] },
      lleg: { pivot: [-2, 5, 1], boxes: [bx([-1, -5, -1], [3, 5, 3], [26, 0], { mirror: true })] },
    },
    deer: {
      body: { pivot: [0, 15, 0], boxes: [bx([-4, -4, -7], [8, 8, 14], [20, 10])] },
      neck: { pivot: [0, 17, -6], rot0: [-0.45, 0, 0], boxes: [bx([-1.5, 0, -1.5], [3, 7, 3], [24, 0])] },
      head: { pivot: [0, 23, -8], boxes: [bx([-2.5, -1, -6], [5, 5, 7], [0, 0])] },
      antlerR: { pivot: [0, 23, -8], follow: 'head', antler: true, boxes: [bx([1.5, 4, -3], [1, 6, 1], [12, 16]), bx([1.5, 8, -3], [4, 1, 1], [8, 28])] },
      antlerL: { pivot: [0, 23, -8], follow: 'head', antler: true, boxes: [bx([-2.5, 4, -3], [1, 6, 1], [12, 16], { mirror: true }), bx([-5.5, 8, -3], [4, 1, 1], [8, 28], { mirror: true })] },
      tail: { pivot: [0, 18, 7], rot0: [0.5, 0, 0], boxes: [bx([-1, -3, 0], [2, 3, 1], [16, 12])] },
      leg0: { pivot: [2.5, 11, 5], boxes: [bx([-1, -11, -1], [2, 11, 2], [0, 16])] },
      leg1: { pivot: [-2.5, 11, 5], boxes: [bx([-1, -11, -1], [2, 11, 2], [0, 16], { mirror: true })] },
      leg2: { pivot: [2.5, 11, -5], boxes: [bx([-1, -11, -1], [2, 11, 2], [0, 16])] },
      leg3: { pivot: [-2.5, 11, -5], boxes: [bx([-1, -11, -1], [2, 11, 2], [0, 16], { mirror: true })] },
    },
    // a villager: tall head and big nose, a robe to the ground, arms folded in the sleeves
    villager: {
      body: { pivot: [0, 0, 0], boxes: [bx([-4, 0, -3], [8, 22, 6], [36, 4])] },
      head: { pivot: [0, 22, 0], boxes: [bx([-4, 0, -4], [8, 10, 8], [0, 0])] },
      nose: { pivot: [0, 22, 0], follow: 'head', boxes: [bx([-1, 1, -6], [2, 4, 2], [28, 26])] },
      arms: { pivot: [0, 20, -1], rot0: [0.75, 0, 0], boxes: [bx([-8, -6, -2], [4, 8, 4], [0, 18]), bx([4, -6, -2], [4, 8, 4], [0, 18], { mirror: true }), bx([-3, -6, -2], [6, 4, 4], [16, 18])] },
    },
    wolf: {
      head: { pivot: [0, 10.5, -5], boxes: [bx([-3, -3, -4], [6, 6, 4], [0, 0]), bx([-1.5, -3, -7], [3, 3, 4], [0, 10]), bx([-3, 3, -2.5], [2, 2, 1], [48, 0]), bx([1, 3, -2.5], [2, 2, 1], [48, 0], { mirror: true })] },
      mane: { pivot: [0, 10.5, -3], boxes: [bx([-4, -3.5, -3], [8, 7, 6], [20, 0])] },
      // the collar is an overlay ring around the neck (only drawn on tame wolves)
      collar: { pivot: [0, 10.5, -3], follow: 'mane', overlay: true, boxes: [bx([-4, -3.5, -2], [8, 7, 1], [0, 0])] },
      body: { pivot: [0, 10, 4.5], boxes: [bx([-3, -3, -4.5], [6, 6, 9], [18, 14])] },
      tail: { pivot: [0, 12, 8], boxes: [bx([-1, -8, -1], [2, 8, 2], [9, 18])] },
      leg0: { pivot: [1.5, 8, 7], boxes: [bx([-1, -8, -1], [2, 8, 2], [0, 18])] },
      leg1: { pivot: [-1.5, 8, 7], boxes: [bx([-1, -8, -1], [2, 8, 2], [0, 18], { mirror: true })] },
      leg2: { pivot: [1.5, 8, -4], boxes: [bx([-1, -8, -1], [2, 8, 2], [0, 18])] },
      leg3: { pivot: [-1.5, 8, -4], boxes: [bx([-1, -8, -1], [2, 8, 2], [0, 18], { mirror: true })] },
    },
    // a gleaner: low and quick, all ears, with a sack for the things it finds
    gleaner: {
      body: { pivot: [0, 6, 0], boxes: [bx([-3, 0, -4], [6, 5, 9], [0, 0])] },
      head: { pivot: [0, 9, -4], boxes: [bx([-3, -2, -5], [6, 5, 5], [30, 0])] },
      earR: { pivot: [2, 11, -6], rot0: [0.15, 0, -0.45], boxes: [bx([0, 0, -1], [1, 5, 3], [52, 0])], follow: 'head' },
      earL: { pivot: [-2, 11, -6], rot0: [0.15, 0, 0.45], boxes: [bx([-1, 0, -1], [1, 5, 3], [52, 0], { mirror: true })], follow: 'head' },
      leg0: { pivot: [2, 6, 3], boxes: [bx([-1, -6, -1], [2, 6, 2], [0, 14])] },
      leg1: { pivot: [-2, 6, 3], boxes: [bx([-1, -6, -1], [2, 6, 2], [0, 14], { mirror: true })] },
      leg2: { pivot: [2, 6, -2], boxes: [bx([-1, -6, -1], [2, 6, 2], [0, 14])] },
      leg3: { pivot: [-2, 6, -2], boxes: [bx([-1, -6, -1], [2, 6, 2], [0, 14], { mirror: true })] },
      tail: { pivot: [0, 9, 5], rot0: [-0.7, 0, 0], boxes: [bx([-1.5, -1, 0], [3, 3, 7], [8, 14])] },
      sack: { pivot: [0, 11, 1], boxes: [bx([-2.5, 0, -2], [5, 4, 5], [28, 14])] },
    },
    // a sifter: a long, finned body made for swimming through sand
    sifter: {
      head: { pivot: [0, 4, -6], boxes: [bx([-3, -2.5, -6], [6, 5, 6], [0, 0])] },
      jaw: { pivot: [0, 2, -6], boxes: [bx([-2.5, -1.5, -5], [5, 2, 5], [24, 0])] },
      s1: { pivot: [0, 4, -6], boxes: [bx([-2.5, -2.5, 0], [5, 5, 6], [0, 11])] },
      s2: { pivot: [0, 4, 0], boxes: [bx([-2, -2, 0], [4, 4, 6], [22, 11])] },
      s3: { pivot: [0, 4, 6], boxes: [bx([-1.5, -1.5, 0], [3, 3, 6], [0, 22])] },
      tailfin: { pivot: [0, 4, 12], boxes: [bx([-0.5, -3, 0], [1, 6, 3], [18, 22])] },
      fin: { pivot: [0, 6.5, -4], boxes: [bx([-1, 0, -1], [2, 4, 6], [44, 0]), bx([-1, 4, 1.5], [2, 3, 3], [44, 20])] },
      finR: { pivot: [2.5, 2, -3], boxes: [bx([0, -0.5, -1], [3, 1, 3], [44, 13])] },
      finL: { pivot: [-2.5, 2, -3], boxes: [bx([-3, -0.5, -1], [3, 1, 3], [44, 13], { mirror: true })] },
    },
    // a squid is built around its middle so it can tumble freely
    squid: (() => {
      const m = {
        body: { pivot: [0, 0, 0], boxes: [bx([-6, -8, -6], [12, 16, 12], [0, 0])] },
        finR: { pivot: [6, 4, 0], boxes: [bx([0, -3, -2], [1, 6, 4], [48, 22])] },
        finL: { pivot: [-6, 4, 0], boxes: [bx([-1, -3, -2], [1, 6, 4], [48, 22], { mirror: true })] },
      };
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        m['t' + i] = { pivot: [Math.cos(a) * 4.5, -7, Math.sin(a) * 4.5], boxes: [bx([-1, -18, -1], [2, 18, 2], [48, 0])] };
      }
      return m;
    })(),
    // the Listener: a hunched, blind giant whose face is one great dish of an ear
    listener: {
      body: { pivot: [0, 14, 0], boxes: [bx([-8, 0, -4], [16, 18, 8], [0, 0])] },
      head: { pivot: [0, 31, -3], boxes: [bx([-5, -2, -8], [10, 10, 8], [0, 0])] },
      rarm: { pivot: [10, 30, 0], boxes: [bx([-2, -24, -3], [5, 26, 5], [24, 0])] },
      larm: { pivot: [-10, 30, 0], boxes: [bx([-3, -24, -3], [5, 26, 5], [24, 0], { mirror: true })] },
      rleg: { pivot: [4, 14, 0], boxes: [bx([-3, -14, -3], [6, 14, 6], [0, 0])] },
      lleg: { pivot: [-4, 14, 0], boxes: [bx([-3, -14, -3], [6, 14, 6], [0, 0], { mirror: true })] },
    },
    // the rim of its dish, hinged so it can flare wide open (drawn relative to the head)
    listenerDish: {
      dishT: { pivot: [0, 8, -8], boxes: [bx([-9, 0, -3], [18, 3, 3], [0, 18])] },
      dishB: { pivot: [0, -2, -8], boxes: [bx([-9, -3, -3], [18, 3, 3], [0, 24])] },
      dishR: { pivot: [5, 3, -8], boxes: [bx([0, -5, -3], [4, 10, 3], [36, 0])] },
      dishL: { pivot: [-5, 3, -8], boxes: [bx([-4, -5, -3], [4, 10, 3], [36, 0], { mirror: true })] },
    },
    // the gaunt: a head and body on long, thin limbs, nearly three blocks tall
    gaunt: {
      head: { pivot: [0, 38, 0], boxes: [bx([-4, 0, -4], [8, 8, 8], [0, 0])] },
      body: { pivot: [0, 38, 0], boxes: [bx([-4, -12, -2], [8, 12, 4], [16, 16])] },
      rarm: { pivot: [5, 36, 0], boxes: [bx([-1, -28, -1], [2, 28, 2], [56, 0])] },
      larm: { pivot: [-5, 36, 0], boxes: [bx([-1, -28, -1], [2, 28, 2], [56, 0], { mirror: true })] },
      rleg: { pivot: [2, 26, 0], boxes: [bx([-1, -26, -1], [2, 26, 2], [48, 0])] },
      lleg: { pivot: [-2, 26, 0], boxes: [bx([-1, -26, -1], [2, 26, 2], [48, 0], { mirror: true })] },
    },
    // a vault mite: seven segments, widest near the head
    mite: (() => {
      const m = {}, sz = [[3, 2, 2], [4, 3, 2], [6, 4, 3], [3, 3, 3], [2, 2, 3], [2, 1, 2], [1, 1, 2]];
      let z = -3.5;
      const uv = [[0, 0], [0, 4], [0, 9], [0, 16], [0, 22], [0, 27], [24, 0]];
      sz.forEach(([w, h, d], i) => { m['s' + i] = { pivot: [0, h / 2, z + d / 2], boxes: [bx([-w / 2, -h / 2, -d / 2], [w, h, d], uv[i])] }; z += d; });
      return m;
    })(),
    // the wailer's great body (its tentacles are a second model sharing the pose)
    wailer: { body: { pivot: [0, 0, 0], boxes: [bx([-8, 0, -8], [16, 16, 16], [0, 0])] } },
    wailerTentacles: (() => {
      const m = {};
      [[-5, -4, 10], [0, -5, 8], [5, -4, 11], [-5, 4, 9], [0, 5, 12], [5, 4, 8]].forEach(([x, z, len], i) => { m['t' + i] = { pivot: [x, 0.5, z], boxes: [bx([-1, -len, -1], [2, len, 2], [0, 0])] }; });
      return m;
    })(),
    // a magma slime splits into two halves around its core as it bounds
    magmaSlime: {
      core: { pivot: [0, 0, 0], boxes: [bx([-3, 1, -3], [6, 6, 6], [0, 16])] },
      top: { pivot: [0, 4, 0], boxes: [bx([-4, 0, -4], [8, 4, 8], [0, 0])] },
      bottom: { pivot: [0, 0, 0], boxes: [bx([-4, 0, -4], [8, 4, 8], [32, 0])] },
    },
    flare: (() => {
      const m = { head: { pivot: [0, 22, 0], boxes: [bx([-4, -4, -4], [8, 8, 8], [0, 0])] } };
      for (let i = 0; i < 8; i++) m['rod' + i] = { pivot: [0, 0, 0], boxes: [bx([-1, -3, -1], [2, 6, 2], [0, 16])] };
      return m;
    })(),
    bat: {
      head: { pivot: [0, 8, 0], boxes: [bx([-3, 0, -3], [6, 6, 6], [0, 0])] },
      body: { pivot: [0, 8, 0], boxes: [bx([-3, -6, -2], [6, 6, 4], [0, 16])] },
      rwing: { pivot: [3, 6, 0], rot0: [Math.PI / 2, 0, 0], boxes: [bx([0, -8, 0], [10, 16, 1], [42, 0])] },
      lwing: { pivot: [-3, 6, 0], rot0: [Math.PI / 2, 0, 0], boxes: [bx([-10, -8, 0], [10, 16, 1], [42, 0], { mirror: true })] },
    },
    // the Starwyrm, built small and drawn large. Its head: a long skull with swept-back
    // horns, a heavy jaw and barbels trailing from the snout (centred on the neck joint)
    wyrmHead: {
      skull: { pivot: [0, 0, 0], boxes: [bx([-4, -3, -6], [8, 6, 12], [0, 0])] },
      snout: { pivot: [0, -0.5, -6], boxes: [bx([-3, -2, -6], [6, 4, 6], [40, 0])] },
      jaw: { pivot: [0, -2.5, -2], boxes: [bx([-3, -2, -10], [6, 2, 10], [0, 18])] },
      hornR: { pivot: [2.5, 2, 2], rot0: [-0.55, 0.3, 0], boxes: [bx([-1, -1, 0], [2, 2, 8], [40, 10])] },
      hornL: { pivot: [-2.5, 2, 2], rot0: [-0.55, -0.3, 0], boxes: [bx([-1, -1, 0], [2, 2, 8], [40, 10], { mirror: true })] },
      barbelR: { pivot: [2.5, -1.5, -11], rot0: [0.35, 0.5, 0], boxes: [bx([0, 0, 0], [1, 1, 6], [32, 20])] },
      barbelL: { pivot: [-2.5, -1.5, -11], rot0: [0.35, -0.5, 0], boxes: [bx([-1, 0, 0], [1, 1, 6], [32, 20], { mirror: true })] },
      crest: { pivot: [0, 3, -3], boxes: [bx([-0.5, 0, 0], [1, 3, 4], [46, 20])] },
    },
    // a body segment, with a spine along its back
    wyrmSeg: {
      body: { pivot: [0, 0, 0], boxes: [bx([-4, -4, -5], [8, 8, 10], [0, 0])] },
      spine: { pivot: [0, 4, 0], rot0: [-0.35, 0, 0], boxes: [bx([-0.5, 0, -1.5], [1, 3, 3], [36, 0])] },
    },
    // the long fins it swims the air with, on a few of its segments
    wyrmFins: {
      finR: { pivot: [4, 0, 0], boxes: [bx([0, -0.5, -3], [10, 1, 6], [0, 18])] },
      finL: { pivot: [-4, 0, 0], boxes: [bx([-10, -0.5, -3], [10, 1, 6], [0, 18], { mirror: true })] },
    },
    wyrmTail: { fin: { pivot: [0, 0, 4], boxes: [bx([-0.5, -4, 0], [1, 8, 10], [36, 8])] } },
  };
})();

// Build faces of a box: returns array of {verts:[[x,y,z]x4], uv:[[u,v]x4], n:[nx,ny,nz]}
function boxFaces(b) {
  const [ox, oy, oz] = b.o, [w, h, d] = b.s, inf = b.inflate || 0;
  const x0 = ox - inf, y0 = oy - inf, z0 = oz - inf, x1 = ox + w + inf, y1 = oy + h + inf, z1 = oz + d + inf;
  const [u, v] = b.uv;
  // texture regions (classic layout)
  const R = {
    top: [u + d, v, w, d], bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h], front: [u + d, v + d, w, h], left: [u + d + w, v + d, d, h], back: [u + d + w + d, v + d, w, h],
  };
  const faces = [];
  const q = (verts, reg, n, flipU) => {
    let [ru, rv, rw, rh] = reg;
    let ua = ru, ub = ru + rw;
    if (flipU) [ua, ub] = [ub, ua];
    faces.push({ verts, uv: [[ua, rv + rh], [ub, rv + rh], [ub, rv], [ua, rv]], n });
  };
  const mir = !!b.mirror;
  // front (-Z): viewer's left is +X
  q([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], R.front, [0, 0, -1], mir);
  // back (+Z): viewer's left is -X
  q([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], R.back, [0, 0, 1], mir);
  // +X side (character's right): viewer's left is +Z (back)
  q([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], mir ? R.left : R.right, [1, 0, 0], mir);
  // -X side (character's left): viewer's left is -Z (front)
  q([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], mir ? R.right : R.left, [-1, 0, 0], mir);
  // top: front edge at bottom of region
  { const [ru, rv, rw, rh] = R.top; let ua = ru + rw, ub = ru; if (mir) [ua, ub] = [ub, ua]; faces.push({ verts: [[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]], uv: [[ua, rv + rh], [ub, rv + rh], [ub, rv], [ua, rv]], n: [0, 1, 0] }); }
  // bottom
  { const [ru, rv, rw, rh] = R.bottom; let ua = ru + rw, ub = ru; if (mir) [ua, ub] = [ub, ua]; faces.push({ verts: [[x1, y0, z1], [x0, y0, z1], [x0, y0, z0], [x1, y0, z0]], uv: [[ua, rv + rh], [ub, rv + rh], [ub, rv], [ua, rv]], n: [0, -1, 0] }); }
  return faces;
}
const _faceCache = new WeakMap();
function cachedFaces(b) { let f = _faceCache.get(b); if (!f) { f = boxFaces(b); _faceCache.set(b, f); } return f; }
