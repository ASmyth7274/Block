'use strict';
// ---------------------------------------------------------------------------
// Procedural sound effects. Every sound is synthesised in JS into an
// AudioBuffer the first time it is needed (a few variants each).
// ---------------------------------------------------------------------------
const DSP = (() => {
  const SR = 22050;
  let seed = 1;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const noise = () => rnd() * 2 - 1;
  // RBJ biquad
  class Biquad {
    constructor(type, f, q) { this.type = type; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(f, q || 0.707); }
    set(f, q) {
      f = Math.max(10, Math.min(SR * 0.45, f));
      const w = 2 * Math.PI * f / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
      let b0, b1, b2, a0, a1, a2;
      if (this.type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
      else if (this.type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
      else { b0 = a; b1 = 0; b2 = -a; }
      a0 = 1 + a; a1 = -2 * c; a2 = 1 - a;
      this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    }
    p(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
  }
  // render a sound of `dur` seconds with fn(t, i) -> sample
  function render(dur, fn) {
    const n = Math.max(1, Math.floor(dur * SR));
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = fn(i / SR, i, n);
    // normalise peak to 0.9
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(out[i]));
    if (pk > 0) { const k = 0.9 / pk; for (let i = 0; i < n; i++) out[i] *= k; }
    // tiny fade in/out to avoid clicks
    for (let i = 0; i < Math.min(64, n); i++) { out[i] *= i / 64; out[n - 1 - i] *= i / 64; }
    return out;
  }
  const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
  return { SR, rnd, noise, Biquad, render, env, setSeed: (s) => { seed = s >>> 0 || 1; } };
})();

const SOUND_DEFS = (() => {
  const { render, noise, rnd, Biquad, env } = DSP;
  const S = {};
  // ----- block materials -----
  // Each material has its own character: rock cracks and crumbles, wood knocks
  // hollow, gravel and dirt crunch, grass rustles, sand hisses, cloth thumps.
  // struck resonances: [start, freq, amp, decay]
  const ring = (list, t) => { let s = 0; for (const [at, f, a, d] of list) { const u = t - at; if (u >= 0 && u < d * 7) s += Math.sin(2 * Math.PI * f * u) * a * Math.exp(-u / d); } return s; };
  // rock: a hard clack, chips flying off, grit trickling after, a little weight underneath
  const rock = (dur, chips, bright, body, grit) => () => {
    const ev = [], f0 = (1700 + rnd() * 1300) * bright;
    ev.push([0, f0, 0.55, 0.011], [0, f0 * 1.58, 0.4, 0.008], [0, f0 * 2.41, 0.28, 0.005], [0, f0 * 0.53, 0.3, 0.016]);
    for (let i = 0; i < chips; i++) { const at = 0.006 + Math.pow(rnd(), 1.7) * dur * 0.75; ev.push([at, (1400 + rnd() * 4200) * bright, (0.1 + rnd() * 0.32) * (1 - at / dur), 0.002 + rnd() * 0.008]); }
    const hp = new Biquad('hp', 1100 * bright, 0.7), lp = new Biquad('lp', 170, 0.8);
    let g = 0, gt = 0;
    return render(dur, (t) => {
      if (t > gt) { g = rnd() < 0.45 ? 0 : 0.3 + rnd() * 0.7; gt = t + 0.0015 + rnd() * 0.006; }
      const n = noise();
      return ring(ev, t) + hp.p(n) * g * grit * Math.exp(-t / (dur * 0.3)) + lp.p(n) * body * 7 * Math.exp(-t / 0.025) + n * Math.exp(-t / 0.0015) * 0.7;
    });
  };
  // granular crunch: grains arriving at `rate` per second, each colouring the noise a little differently
  const grains = (dur, rate, f0, f1, q, gd, body, attack, swish) => () => {
    const bp = new Biquad('bp', f0, q), lp = new Biquad('lp', 200, 0.7), hp = new Biquad('hp', 2500, 0.7);
    let e = 0, next = 0;
    const k = Math.exp(-1 / (DSP.SR * gd));
    return render(dur, (t) => {
      if (t >= next) { e += 0.35 + rnd() * 0.65; bp.set(f0 + rnd() * (f1 - f0), q); next = t - Math.log(1 - rnd() * 0.999) / rate; }
      e *= k;
      const shape = (t < attack ? t / attack : 1) * Math.exp(-t / (dur * 0.38));
      const n = noise();
      return (bp.p(n) * e * 2 + lp.p(n) * body * 5 * Math.exp(-t / 0.04) + (swish ? hp.p(n) * swish * Math.sin(Math.PI * Math.min(1, t / dur)) : 0)) * shape;
    });
  };
  // wood: a hollow knock with a dry crack on top
  const woody = (dur, f0, crack, decay) => () => {
    const f = f0 * (0.9 + rnd() * 0.2);
    const modes = [[f, 1, decay], [f * 2.32, 0.55, decay * 0.55], [f * 3.95, 0.32, decay * 0.33], [f * 5.7, 0.18, decay * 0.2]];
    const bp = new Biquad('bp', 1800 + rnd() * 900, 1.4);
    const chips = []; for (let i = 0; i < crack * 5; i++) chips.push([rnd() * dur * 0.5, 900 + rnd() * 2400, 0.15 + rnd() * 0.2, 0.004 + rnd() * 0.006]);
    return render(dur, (t) => {
      let s = 0; for (const [mf, a, d] of modes) s += Math.sin(2 * Math.PI * mf * t) * a * Math.exp(-t / d);
      return s + bp.p(noise()) * crack * 1.6 * Math.exp(-t / 0.014) + ring(chips, t);
    });
  };
  // cloth: a soft, muffled thump
  const muffled = (dur, f, attack, decay) => () => {
    const lp = new Biquad('lp', f, 0.7), lp2 = new Biquad('lp', f * 0.35, 0.7);
    return render(dur, (t) => { const n = noise(); return (lp.p(n) + lp2.p(n) * 1.5) * (t < attack ? t / attack : Math.exp(-(t - attack) / decay)); });
  };
  S.stone_break = rock(0.34, 16, 1, 0.55, 0.35); S.stone_hit = rock(0.13, 5, 1.08, 0.35, 0.22); S.stone_step = rock(0.09, 2, 0.75, 0.6, 0.12); S.stone_place = rock(0.26, 9, 0.92, 0.85, 0.28);
  S.wood_break = woody(0.32, 175, 1, 0.07); S.wood_hit = woody(0.14, 200, 0.5, 0.04); S.wood_step = woody(0.1, 160, 0.25, 0.03); S.wood_place = woody(0.24, 150, 0.6, 0.065);
  S.gravel_break = grains(0.3, 260, 380, 2600, 1.6, 0.0045, 0.7, 0.003, 0); S.gravel_hit = grains(0.13, 220, 400, 2400, 1.6, 0.004, 0.5, 0.003, 0);
  S.gravel_step = grains(0.13, 240, 350, 2000, 1.5, 0.004, 0.6, 0.004, 0); S.gravel_place = grains(0.24, 240, 380, 2400, 1.6, 0.0045, 0.8, 0.003, 0);
  S.grass_break = grains(0.28, 380, 2400, 7600, 1.1, 0.0025, 0.18, 0.006, 0.25); S.grass_hit = grains(0.13, 320, 2600, 7200, 1.1, 0.0025, 0.12, 0.005, 0.15);
  S.grass_step = grains(0.15, 340, 2200, 6800, 1.1, 0.0025, 0.15, 0.008, 0.2); S.grass_place = grains(0.24, 360, 2400, 7600, 1.1, 0.0025, 0.2, 0.006, 0.22);
  S.sand_break = grains(0.32, 1100, 3600, 9500, 0.8, 0.0016, 0.06, 0.025, 0.35); S.sand_hit = grains(0.14, 900, 3800, 9000, 0.8, 0.0016, 0.04, 0.015, 0.25);
  S.sand_step = grains(0.17, 1000, 3400, 8800, 0.8, 0.0016, 0.05, 0.02, 0.3); S.sand_place = grains(0.26, 1000, 3600, 9500, 0.8, 0.0016, 0.07, 0.02, 0.32);
  S.snow_break = () => { const base = grains(0.3, 300, 1300, 5200, 2.4, 0.003, 0.15, 0.005, 0.1)(); const sq = []; for (let i = 0; i < 5; i++) sq.push([rnd() * 0.18, 1100 + rnd() * 900, 0.12, 0.012]); return render((base.length + 0.5) / DSP.SR, (t, i) => base[i] + ring(sq, t)); };
  S.snow_hit = grains(0.13, 260, 1400, 5000, 2.4, 0.003, 0.12, 0.005, 0.08); S.snow_step = grains(0.15, 280, 1200, 4800, 2.4, 0.003, 0.15, 0.006, 0.1);
  S.snow_place = grains(0.24, 300, 1300, 5200, 2.4, 0.003, 0.18, 0.005, 0.1);
  S.cloth_break = muffled(0.24, 950, 0.012, 0.06); S.cloth_hit = muffled(0.12, 900, 0.01, 0.03); S.cloth_step = muffled(0.11, 800, 0.012, 0.03); S.cloth_place = muffled(0.2, 900, 0.012, 0.05);
  // glass: a bright crash and a shower of tinkling pieces
  S.glass_break = () => {
    const parts = []; for (let i = 0; i < 16; i++) parts.push([Math.pow(rnd(), 1.5) * 0.22, 2400 + rnd() * 6000, 0.12 + rnd() * 0.25, 0.02 + rnd() * 0.12]);
    const hp = new Biquad('hp', 2800, 0.7);
    return render(0.7, (t) => hp.p(noise()) * (env(t, 0.001, 0.05) * 0.9 + Math.exp(-t / 0.2) * 0.08) + ring(parts, t));
  };
  // metal: struck rock, brighter, with a short ring to it
  S.metal_break = () => {
    const base = rock(0.32, 10, 1.45, 0.3, 0.25)(), pf = [610, 1470, 2520, 3610].map((f) => f * (0.92 + rnd() * 0.16));
    return render((base.length + 0.5) / DSP.SR, (t, i) => { let s = base[i]; pf.forEach((f, k) => { s += Math.sin(2 * Math.PI * f * t) * Math.exp(-t / (0.16 / (k + 1))) * 0.35 / (k + 1); }); return s; });
  };
  S.metal_hit = rock(0.12, 4, 1.5, 0.2, 0.2); S.metal_step = rock(0.09, 2, 1.3, 0.4, 0.1); S.metal_place = S.metal_break;
  S.glass_hit = rock(0.12, 4, 1.3, 0.2, 0.15); S.glass_step = rock(0.09, 2, 1.1, 0.4, 0.1); S.glass_place = rock(0.24, 8, 1.2, 0.6, 0.2);
  S.ladder_step = woody(0.1, 230, 0.3, 0.03); S.ladder_break = S.wood_break; S.ladder_hit = S.wood_hit; S.ladder_place = S.wood_place;
  // ----- ui & items -----
  S.click = () => render(0.06, (t) => (Math.sin(2 * Math.PI * 1400 * t) * 0.6 + noise() * 0.3) * env(t, 0.0005, 0.012));
  S.pop = () => render(0.12, (t) => Math.sin(2 * Math.PI * (300 + t * 3000) * t) * env(t, 0.002, 0.03));
  S.orb = () => { const f = 1800; return render(0.5, (t) => (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t / 0.05)) * env(t, 0.002, 0.12)); };
  S.levelup = () => render(1.2, (t) => { let s = 0; [523, 659, 784, 1047].forEach((f, i) => { const st = i * 0.09; if (t > st) s += Math.sin(2 * Math.PI * f * (t - st)) * Math.exp(-(t - st) / 0.5) * 0.4; }); return s; });
  S.hurt = () => {
    const bp = new Biquad('bp', 650, 2.5), bp2 = new Biquad('bp', 1300, 3);
    let ph = 0;
    return render(0.22, (t) => {
      ph += 2 * Math.PI * (165 - t * 250) / DSP.SR;
      const saw = ((ph / (2 * Math.PI)) % 1) * 2 - 1;
      return (bp.p(saw) * 1.2 + bp2.p(saw) * 0.5 + noise() * 0.05) * env(t, 0.005, 0.06);
    });
  };
  S.fall_small = () => { const lp = new Biquad('lp', 300, 0.7); return render(0.2, (t) => (Math.sin(2 * Math.PI * 90 * t) + lp.p(noise())) * env(t, 0.002, 0.05)); };
  S.fall_big = () => { const lp = new Biquad('lp', 250, 0.7); return render(0.35, (t) => (Math.sin(2 * Math.PI * 65 * t) + lp.p(noise()) * 1.2) * env(t, 0.003, 0.09)); };
  S.eat = () => { const lp = new Biquad('lp', 2200, 1); const hits = [0, 0.07, 0.15]; return render(0.25, (t) => { let s = 0; for (const h of hits) if (t > h) s += lp.p(noise()) * Math.exp(-(t - h) / 0.02); return s; }); };
  S.drink = () => render(0.3, (t) => Math.sin(2 * Math.PI * (280 + Math.sin(t * 40) * 40) * t) * env(t, 0.01, 0.08));
  S.burp = () => { const bp = new Biquad('bp', 500, 3); let ph = 0; return render(0.35, (t) => { ph += 2 * Math.PI * (95 + Math.sin(t * 30) * 8) / DSP.SR; return bp.p(((ph / (2 * Math.PI)) % 1) * 2 - 1 + noise() * 0.3) * env(t, 0.02, 0.1); }); };
  S.splash = () => { const bp = new Biquad('bp', 800, 1); return render(0.6, (t) => { bp.set(600 + t * 2500, 1); return bp.p(noise()) * env(t, 0.005, 0.15); }); };
  S.swim = () => { const bp = new Biquad('bp', 1200, 1.2); return render(0.4, (t) => { bp.set(900 + Math.sin(t * 20) * 300, 1.2); return bp.p(noise()) * env(t, 0.05, 0.12); }); };
  S.bow = () => {
    const N = Math.floor(DSP.SR / 220); const buf = new Float32Array(N); for (let i = 0; i < N; i++) buf[i] = noise(); let idx = 0;
    return render(0.4, (t) => { const v = buf[idx]; const nv = (v + buf[(idx + 1) % N]) * 0.497; buf[idx] = nv; idx = (idx + 1) % N; return v * env(t, 0.001, 0.15) + noise() * env(t, 0.001, 0.01) * 0.3; });
  };
  S.arrow_hit = () => { const lp = new Biquad('lp', 1200, 1); return render(0.15, (t) => (lp.p(noise()) + Math.sin(2 * Math.PI * 180 * t) * 0.5) * env(t, 0.001, 0.03)); };
  const creak = (f0, f1, dur) => () => { const bp = new Biquad('bp', 600, 6); let ph = 0; return render(dur, (t) => { const f = f0 + (f1 - f0) * (t / dur); ph += 2 * Math.PI * f / DSP.SR; const s = (((ph / (2 * Math.PI)) % 1) < 0.15 ? 1 : 0) - 0.15; return (bp.p(s + noise() * 0.2) + (t > dur - 0.08 ? noise() * Math.exp(-(t - dur + 0.08) / 0.02) * 0.5 : 0)) * env(t, 0.02, dur * 0.6); }); };
  S.door_open = creak(55, 75, 0.45); S.door_close = creak(70, 50, 0.35);
  // minecarts: a clack at every rail joint and the rumble of iron wheels
  S.rail_clack = () => {
    const bp = new Biquad('bp', 1900, 5), lp = new Biquad('lp', 900, 0.8);
    return render(0.22, (t) => {
      let s = 0;
      for (const st of [0, 0.075]) if (t > st) { const tt = t - st; s += (bp.p(noise()) * 0.8 + Math.sin(2 * Math.PI * 1150 * tt) * 0.35) * Math.exp(-tt / 0.018) + lp.p(noise()) * Math.exp(-tt / 0.03) * 0.5; }
      return s;
    });
  };
  S.minecart_roll = () => {
    const lp = new Biquad('lp', 420, 0.9), bp = new Biquad('bp', 1300, 3);
    return render(0.55, (t) => (lp.p(noise()) * 1.2 * (0.75 + 0.25 * Math.sin(t * 2 * Math.PI * 23)) + bp.p(noise()) * 0.12) * Math.sin(Math.PI * t / 0.55));
  };
  S.chest_open = creak(40, 55, 0.5); S.chest_close = creak(50, 38, 0.4);
  S.explode = () => {
    const lp = new Biquad('lp', 500, 0.8), lp2 = new Biquad('lp', 120, 0.8);
    return render(2.2, (t) => { lp.set(500 - t * 180, 0.8); const n = noise(); return (lp.p(n) * 1.3 + lp2.p(n) * 2 + Math.sin(2 * Math.PI * (55 - t * 15) * t) * Math.exp(-t / 0.3)) * env(t, 0.004, 0.45); });
  };
  S.fuse = () => { const hp = new Biquad('hp', 3500, 0.7); return render(1.4, (t) => hp.p(noise()) * (0.5 + 0.5 * Math.sin(t * 60)) * env(t, 0.05, 0.6)); };
  S.fizz = () => { const hp = new Biquad('hp', 2500, 0.7); return render(0.45, (t) => hp.p(noise()) * env(t, 0.01, 0.12)); };
  // the vault mite: a dry chittering
  S.mite_say = () => { const hp = new Biquad('hp', 3000, 0.8); return render(0.5, (t) => { const k = Math.floor(t * 40); return hp.p(noise()) * ((k % 3) ? 1 : 0.2) * Math.sin(Math.PI * t / 0.5); }); };
  S.mite_hurt = () => { const bp = new Biquad('bp', 3500, 4); return render(0.25, (t) => bp.p(noise()) * env(t, 0.003, 0.06) + Math.sin(2 * Math.PI * 2600 * t) * env(t, 0.003, 0.04) * 0.3); };
  S.mite_death = () => { const bp = new Biquad('bp', 2800, 3); return render(0.5, (t) => { bp.set(3200 - t * 3000, 3); return bp.p(noise()) * env(t, 0.005, 0.15); }); };
  // the Seeker's Eye and the rift
  S.eye_throw = () => { const bp = new Biquad('bp', 1200, 3); return render(0.6, (t) => { bp.set(600 + t * 2400, 3); return bp.p(noise()) * env(t, 0.01, 0.15) + Math.sin(2 * Math.PI * (880 + t * 900) * t) * env(t, 0.01, 0.1) * 0.3; }); };
  S.eye_drop = () => render(0.5, (t) => Math.sin(2 * Math.PI * (1320 - t * 900) * t) * env(t, 0.005, 0.12) * 0.6 + noise() * env(t, 0.002, 0.02) * 0.3);
  S.eye_set = () => render(1.0, (t) => { let s = 0; [523, 784, 1047].forEach((f, i) => { s += Math.sin(2 * Math.PI * f * t) * Math.exp(-t / (0.4 - i * 0.1)) * 0.35; }); return s + noise() * env(t, 0.002, 0.03) * 0.4; });
  S.rift_open = () => { const lp = new Biquad('lp', 600, 0.8); return render(4, (t) => { let s = lp.p(noise()) * env(t, 0.3, 1.2) * 0.6; [130.8, 196, 261.6, 392, 523.3].forEach((f, i) => { const st = i * 0.25; if (t > st) s += Math.sin(2 * Math.PI * f * (t - st)) * Math.exp(-(t - st) / 1.6) * 0.25; }); return s; }); };
  // brewing: a soft bubbling, a bright 'done', glass bursting
  S.brew = () => { const bp = new Biquad('bp', 700, 6); let g = 0, gt = 0; return render(1.2, (t) => { if (t > gt) { g = 1; gt = t + 0.08 + rnd() * 0.15; bp.set(500 + rnd() * 700, 8); } g *= 0.996; return bp.p(noise()) * g * Math.sin(Math.PI * t / 1.2); }); };
  S.brew_done = () => render(0.8, (t) => { let s = 0; [784, 1047, 1319].forEach((f, i) => { const st = i * 0.06; if (t > st) s += Math.sin(2 * Math.PI * f * (t - st)) * Math.exp(-(t - st) / 0.25) * 0.4; }); return s; });
  S.bottle_fill = () => { const bp = new Biquad('bp', 1400, 3); return render(0.4, (t) => { bp.set(800 + t * 2600, 3); return bp.p(noise()) * env(t, 0.01, 0.12); }); };
  S.potion_splash = () => { const hp = new Biquad('hp', 2200, 0.8); return render(0.6, (t) => { let s = hp.p(noise()) * env(t, 0.002, 0.08); [2900, 3700, 4400].forEach((f, i) => { s += Math.sin(2 * Math.PI * f * t) * Math.exp(-t / (0.12 + i * 0.03)) * 0.25; }); return s; }); };
  S.fire_charge = () => { const lp = new Biquad('lp', 900, 0.8); return render(0.6, (t) => lp.p(noise()) * env(t, 0.01, 0.15) + Math.sin(2 * Math.PI * (90 - t * 60) * t) * env(t, 0.005, 0.12) * 0.6); };
  S.ignite = () => { const hp = new Biquad('hp', 4000, 0.7); return render(0.25, (t) => hp.p(noise()) * env(t, 0.002, 0.05) + Math.sin(2 * Math.PI * 3000 * t) * env(t, 0.001, 0.01) * 0.3); };
  S.thunder = () => {
    const lp = new Biquad('lp', 180, 0.7), lp2 = new Biquad('lp', 900, 0.7);
    let g = 1, gt = 0;
    return render(4, (t) => { if (t > gt) { g = 0.4 + rnd() * 0.6; gt = t + 0.05 + rnd() * 0.15; } const n = noise(); return (lp.p(n) * 2 + lp2.p(n) * 0.3 * Math.exp(-t / 0.2)) * g * env(t, 0.01, 1.2); });
  };
  S.bucket_fill = () => { const bp = new Biquad('bp', 900, 2); return render(0.5, (t) => { bp.set(400 + t * 1600, 2); return bp.p(noise()) * env(t, 0.02, 0.15); }); };
  S.bucket_empty = () => { const bp = new Biquad('bp', 1500, 2); return render(0.5, (t) => { bp.set(1600 - t * 1800, 2); return bp.p(noise()) * env(t, 0.02, 0.15); }); };
  S.bucket_fill_lava = S.bucket_empty_lava = () => { const lp = new Biquad('lp', 400, 1); return render(0.6, (t) => lp.p(noise()) * env(t, 0.02, 0.2) + Math.sin(2 * Math.PI * 70 * t) * env(t, 0.01, 0.1) * 0.5); };
  S.break_tool = () => { const hp = new Biquad('hp', 1500, 0.7); return render(0.4, (t) => hp.p(noise()) * env(t, 0.001, 0.05) + Math.sin(2 * Math.PI * 1900 * t) * env(t, 0.001, 0.12) * 0.5); };
  S.lava_pop = () => render(0.2, (t) => Math.sin(2 * Math.PI * (120 + t * 600) * t) * env(t, 0.002, 0.04));
  S.fire = () => { const hp = new Biquad('hp', 800, 0.7); return render(0.6, (t) => hp.p(noise()) * (rnd() < 0.01 ? 3 : 0.2) * env(t, 0.1, 0.3)); };
  S.rune = () => render(2.5, (t) => (Math.sin(2 * Math.PI * 220 * t) * 0.5 + Math.sin(2 * Math.PI * 330.5 * t) * 0.35 + Math.sin(2 * Math.PI * 440.7 * t) * 0.2) * Math.sin(Math.PI * Math.min(1, t / 2.5)) * (0.8 + 0.2 * Math.sin(t * 9)));
  S.chime = () => render(1.5, (t) => { let s = 0; [1318, 1760, 2093].forEach((f, i) => { const st = i * 0.12; if (t > st) s += Math.sin(2 * Math.PI * f * (t - st)) * Math.exp(-(t - st) / 0.4); }); return s; });
  S.discover = () => render(2.0, (t) => { let s = 0; [392, 523, 659, 784].forEach((f, i) => { const st = i * 0.15; if (t > st) s += (Math.sin(2 * Math.PI * f * (t - st)) + 0.3 * Math.sin(4 * Math.PI * f * (t - st))) * Math.exp(-(t - st) / 0.7) * 0.4; }); return s; });
  // ----- creatures -----
  const voice = (f0, f1, dur, formants, vib, rough) => () => {
    const fs = formants.map(([f, q]) => new Biquad('bp', f, q));
    let ph = 0;
    return render(dur, (t) => {
      const f = f0 + (f1 - f0) * (t / dur) + Math.sin(t * 2 * Math.PI * (vib || 0)) * (vib ? f0 * 0.05 : 0);
      ph += 2 * Math.PI * f / DSP.SR;
      const saw = ((ph / (2 * Math.PI)) % 1) * 2 - 1 + noise() * (rough || 0.1);
      let s = 0; for (const flt of fs) s += flt.p(saw);
      return s * Math.sin(Math.PI * Math.min(1, t / dur)) ;
    });
  };
  S.zombie_say = voice(85, 70, 0.9, [[350, 3], [900, 4]], 3, 0.4);
  S.zombie_hurt = voice(110, 85, 0.35, [[400, 3], [1000, 4]], 0, 0.5);
  S.zombie_death = voice(90, 50, 1.0, [[300, 3], [800, 4]], 2, 0.5);
  S.skeleton_say = () => render(0.35, (t) => { const k = Math.floor(t * 24); const ph = t * 24 - k; return noise() * Math.exp(-ph * 12) * (k % 3 === 2 ? 0.2 : 1); });
  S.skeleton_hurt = S.skeleton_say; S.skeleton_death = () => render(0.7, (t) => { const k = Math.floor(t * 18); const ph = t * 18 - k; return noise() * Math.exp(-ph * 10) * Math.exp(-t / 0.4); });
  S.spider_say = () => { const bp = new Biquad('bp', 3000, 2); return render(0.5, (t) => bp.p(noise()) * (0.5 + 0.5 * Math.sin(t * 80)) * Math.sin(Math.PI * t / 0.5)); };
  S.spider_hurt = S.spider_say; S.spider_death = S.spider_say;
  S.slime = () => { const lp = new Biquad('lp', 400, 2); return render(0.3, (t) => { lp.set(200 + t * 1200, 3); return lp.p(noise()) * env(t, 0.01, 0.08); }); };
  S.pig_say = voice(220, 160, 0.3, [[700, 4], [1600, 5]], 0, 0.3);
  S.pig_hurt = voice(380, 300, 0.25, [[900, 4], [2000, 5]], 0, 0.3);
  S.cow_say = voice(115, 95, 1.1, [[420, 3], [900, 4]], 2, 0.2);
  S.cow_hurt = voice(140, 110, 0.4, [[450, 3], [1000, 4]], 0, 0.3);
  S.sheep_say = voice(300, 270, 0.7, [[800, 4], [1800, 5]], 7, 0.2);
  S.chicken_say = () => render(0.3, (t) => { const k = t < 0.08 || (t > 0.13 && t < 0.2) ? 1 : 0; return Math.sin(2 * Math.PI * (900 + Math.sin(t * 300) * 200) * t) * k * env(t, 0.005, 0.2); });
  S.chicken_hurt = voice(900, 1300, 0.2, [[1500, 3]], 0, 0.3);
  S.deer_say = voice(380, 340, 0.4, [[900, 4], [2200, 5]], 4, 0.4);
  S.wraith_say = () => { const bp = new Biquad('bp', 900, 4); return render(1.6, (t) => { bp.set(500 + Math.sin(t * 3) * 400, 4); return (bp.p(noise()) * 0.8 + Math.sin(2 * Math.PI * (620 + Math.sin(t * 6) * 30) * t) * 0.2) * Math.sin(Math.PI * t / 1.6); }); };
  S.wraith_hurt = S.wraith_say;
  // ----- the Underworld's creatures -----
  // the charred: a dry, smoky rasp; an angry, coughing snarl
  S.charred_say = voice(78, 66, 1.0, [[300, 2.5], [750, 3]], 1.5, 0.9);
  S.charred_angry = voice(120, 95, 0.6, [[420, 3], [1100, 3]], 7, 1.1);
  S.charred_hurt = voice(130, 100, 0.3, [[450, 3], [1200, 4]], 0, 1.0);
  S.charred_death = voice(95, 45, 1.1, [[320, 3], [800, 4]], 2, 1.0);
  // the wailer: a high, sobbing cry that carries a long way
  const cry = (f0, f1, dur, sob, shriek) => () => {
    const bp = new Biquad('bp', 1400, 3), lp = new Biquad('lp', 3200, 0.8);
    const dl = new Float32Array(Math.floor(DSP.SR * 0.19)); let di = 0, ph = 0;
    return render(dur, (t) => {
      const u = t / dur;
      const f = f0 + (f1 - f0) * u + Math.sin(t * 2 * Math.PI * 6.5) * f0 * 0.035 + (sob ? Math.max(0, Math.sin(t * 2 * Math.PI * sob)) * f0 * 0.12 : 0);
      ph += 2 * Math.PI * f / DSP.SR;
      const src = Math.sin(ph) * 0.7 + Math.sin(ph * 2) * 0.2 + (shriek ? bp.p(noise()) * shriek : 0);
      const g = Math.sin(Math.PI * Math.min(1, u * 1.15)) * (sob ? 0.7 + 0.3 * Math.sin(t * 2 * Math.PI * sob) : 1);
      const out = lp.p(src) * g + dl[di] * 0.45; dl[di] = out; di = (di + 1) % dl.length;
      return out;
    });
  };
  S.wailer_say = cry(520, 430, 2.4, 2.2, 0.15);
  S.wailer_charge = cry(380, 880, 1.0, 0, 0.35);
  S.wailer_hurt = cry(900, 760, 0.45, 0, 0.5);
  S.wailer_death = cry(700, 180, 2.6, 1.5, 0.3);
  S.wailer_shoot = () => { const lp = new Biquad('lp', 700, 0.9); return render(0.9, (t) => { lp.set(1400 - t * 1100, 0.9); return lp.p(noise()) * env(t, 0.02, 0.25) + Math.sin(2 * Math.PI * (120 - t * 80) * t) * env(t, 0.005, 0.15) * 0.5; }); };
  // magma slimes slap down with a hiss
  S.magma_slime = () => { const lp = new Biquad('lp', 260, 2), hp = new Biquad('hp', 3000, 0.7); return render(0.45, (t) => { lp.set(140 + t * 700, 3); return lp.p(noise()) * env(t, 0.01, 0.08) * 1.2 + hp.p(noise()) * env(t, 0.03, 0.15) * 0.25; }); };
  // the flare: a roaring breath, crackling, a ringing clang when struck
  S.flare_say = () => { const bp = new Biquad('bp', 500, 1.2), hp = new Biquad('hp', 2500, 0.7); return render(1.4, (t) => { bp.set(380 + Math.sin(t * 4) * 120, 1.2); return bp.p(noise()) * Math.sin(Math.PI * t / 1.4) + hp.p(noise()) * (rnd() < 0.006 ? 4 : 0.05); }); };
  S.flare_shoot = () => { const lp = new Biquad('lp', 1600, 0.8); return render(0.5, (t) => { lp.set(2200 - t * 2600, 0.8); return lp.p(noise()) * env(t, 0.005, 0.12); }); };
  S.flare_hurt = () => render(0.6, (t) => { let s = 0; [523, 1187, 1873].forEach((f, i) => { s += Math.sin(2 * Math.PI * f * t) * Math.exp(-t / (0.25 - i * 0.06)) * 0.4; }); return s + noise() * env(t, 0.002, 0.03) * 0.5; });
  S.flare_death = () => { const lp = new Biquad('lp', 900, 0.8); return render(1.6, (t) => { lp.set(900 - t * 450, 0.8); let s = lp.p(noise()) * env(t, 0.01, 0.6); [440, 990].forEach((f) => { s += Math.sin(2 * Math.PI * f * (1 - t * 0.25) * t) * Math.exp(-t / 0.5) * 0.3; }); return s; }); };
  S.bat_say = () => render(0.1, (t) => Math.sin(2 * Math.PI * (5000 - t * 20000) * t) * env(t, 0.002, 0.02));
  // wolves: barks, growls, whines, panting, a yelp, a fur shake and a howl for moonlit nights
  const bark = (f0, n, gap) => () => {
    const f1 = new Biquad('bp', 900, 2.5), f2 = new Biquad('bp', 2100, 4);
    let ph = 0;
    const len = 0.11;
    return render(n * (len + gap), (t) => {
      const k = Math.floor(t / (len + gap)), tt = t - k * (len + gap);
      if (tt > len) return 0;
      const f = f0 * (1.15 - tt / len * 0.45) * (k % 2 ? 0.94 : 1);
      ph += 2 * Math.PI * f / DSP.SR;
      const src = ((ph / (2 * Math.PI)) % 1) * 2 - 1 + noise() * 0.6;
      return (f1.p(src) * 1.1 + f2.p(src) * 0.6) * Math.sin(Math.PI * tt / len) * (tt < 0.01 ? tt / 0.01 : 1);
    });
  };
  S.wolf_bark = bark(420, 2, 0.07);
  S.wolf_growl = () => {
    const lp = new Biquad('lp', 700, 1.5), bp = new Biquad('bp', 320, 2);
    let ph = 0;
    return render(1.1, (t) => {
      ph += 2 * Math.PI * (88 + Math.sin(t * 31) * 9) / DSP.SR;
      const src = ((ph / (2 * Math.PI)) % 1) * 2 - 1 + noise() * 0.9;
      return (lp.p(src) * 0.7 + bp.p(src)) * (0.6 + 0.4 * Math.sin(t * 23)) * Math.sin(Math.PI * Math.min(1, t / 1.1));
    });
  };
  // swept tones keep a running phase so the pitch glides cleanly
  const glide = (dur, freq, shape, grit) => () => {
    let ph = 0;
    return render(dur, (t) => {
      ph += 2 * Math.PI * freq(t) / DSP.SR;
      return (Math.sin(ph) * 0.6 + Math.sin(ph * 2) * 0.15 + (grit ? noise() * grit : 0)) * shape(t);
    });
  };
  S.wolf_whine = glide(0.75, (t) => 980 - t * 360 + Math.sin(t * 38) * 25, (t) => Math.sin(Math.PI * t / 0.75));
  S.wolf_pant = () => {
    const bp = new Biquad('bp', 1500, 1.2);
    return render(0.8, (t) => { const k = (t * 6.5) % 1; return bp.p(noise()) * Math.sin(Math.PI * Math.min(1, k / 0.55)) * (k < 0.55 ? 1 : 0) * 0.9; });
  };
  S.wolf_hurt = glide(0.22, (t) => t < 0.05 ? 900 + t * 9000 : 1350 - (t - 0.05) * 3000, (t) => env(t, 0.004, 0.08), 0.15);
  S.wolf_death = glide(1.0, (t) => 1050 - t * 600 + Math.sin(t * 30) * 30, (t) => Math.sin(Math.PI * t) * Math.exp(-t * 0.8), 0.08);
  S.wolf_shake = () => {
    const bp = new Biquad('bp', 2400, 0.9);
    return render(0.7, (t) => bp.p(noise()) * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 14)) * Math.sin(Math.PI * t / 0.7));
  };
  S.wolf_howl = glide(2.6, (t) => 380 + Math.min(1, t / 0.6) * 260 - Math.max(0, t - 1.8) * 220 + Math.sin(t * 11) * 6, (t) => Math.sin(Math.PI * t / 2.6) * 0.85, 0.03);
  // villagers: nasal hums - a musing 'hrrm', a pleased 'hmm-hm', a doubtful 'hm-mm'
  const hum = (pts, dur, nasal) => () => {
    const f1 = new Biquad('bp', 1100, 3), f2 = new Biquad('bp', 2500, 5), lp = new Biquad('lp', 2800, 0.8);
    let ph = 0;
    return render(dur, (t) => {
      const u = t / dur;
      let f = pts[0][1];
      for (let i = 1; i < pts.length; i++) if (u >= pts[i - 1][0]) { const a = pts[i - 1], b = pts[i]; f = a[1] + (b[1] - a[1]) * clamp((u - a[0]) / (b[0] - a[0]), 0, 1); }
      ph += 2 * Math.PI * f / DSP.SR;
      const src = ((ph / (2 * Math.PI)) % 1) * 2 - 1 + noise() * 0.08;
      const gate = Math.sin(Math.PI * Math.min(1, u * 1.05)) * (0.75 + 0.25 * Math.sin(u * Math.PI * 2 * 3));
      return lp.p(f1.p(src) * 0.9 + f2.p(src) * nasal) * gate;
    });
  };
  S.villager_say = hum([[0, 150], [0.4, 175], [1, 140]], 0.55, 0.6);
  S.villager_yes = hum([[0, 160], [0.45, 150], [0.55, 200], [1, 210]], 0.5, 0.55);
  S.villager_no = hum([[0, 190], [0.45, 200], [0.55, 150], [1, 130]], 0.5, 0.55);
  S.villager_hurt = hum([[0, 240], [0.3, 300], [1, 200]], 0.3, 0.7);
  S.villager_death = hum([[0, 220], [1, 110]], 0.9, 0.6);
  S.boomcap_say = () => { const lp = new Biquad('lp', 600, 2); return render(0.4, (t) => lp.p(noise()) * env(t, 0.02, 0.1)); };
  S.wisp = () => render(1.2, (t) => { let s = 0; [2093, 2637, 3136].forEach((f, i) => { const st = i * 0.18; if (t > st) s += Math.sin(2 * Math.PI * f * (t - st)) * Math.exp(-(t - st) / 0.3); }); return s; });
  S.stranger = () => { const lp = new Biquad('lp', 300, 1); return render(3, (t) => (lp.p(noise()) * 0.6 + Math.sin(2 * Math.PI * 55 * t) * 0.3) * Math.sin(Math.PI * t / 3)); };
  // ----- note block instruments (tuned to F#4 and played back faster or slower) -----
  const pluck = (f0, dur, damp, lpf) => () => {
    const n = Math.max(2, Math.round(DSP.SR / f0)), b = new Float32Array(n);
    for (let i = 0; i < n; i++) b[i] = noise();
    const lp = lpf ? new Biquad('lp', lpf, 0.7) : null;
    let i = 0;
    return render(dur, (t) => {
      const v = b[i], nv = b[(i + 1) % n];
      b[i] = (v + nv) * 0.5 * damp; i = (i + 1) % n;
      return (lp ? lp.p(v) : v) * Math.min(1, t * 600);
    });
  };
  S.nb_harp = pluck(370, 1.6, 0.998);
  S.nb_bass = pluck(92.5, 1.3, 0.997, 700);
  S.nb_drum = () => render(0.35, (t) => Math.sin(2 * Math.PI * (55 + 150 * Math.exp(-t * 28)) * t) * Math.exp(-t / 0.1) + noise() * 0.12 * Math.exp(-t / 0.008));
  S.nb_snare = () => { const bp = new Biquad('bp', 1900, 0.8); return render(0.25, (t) => (bp.p(noise()) * 0.8 + Math.sin(2 * Math.PI * 185 * t) * 0.35) * Math.exp(-t / 0.05)); };
  S.nb_hat = () => { const hp = new Biquad('hp', 6500, 0.7); return render(0.09, (t) => hp.p(noise()) * Math.exp(-t / 0.016)); };
  S.piston_out = () => { const lp = new Biquad('lp', 900, 1.2); return render(0.35, (t) => lp.p(noise()) * env(t, 0.004, 0.05) * 0.9 + Math.sin(2 * Math.PI * (140 - t * 200) * t) * env(t, 0.002, 0.06)); };
  S.piston_in = () => { const lp = new Biquad('lp', 700, 1.2); return render(0.35, (t) => lp.p(noise()) * env(t, 0.006, 0.06) * 0.8 + Math.sin(2 * Math.PI * (110 - t * 120) * t) * env(t, 0.002, 0.08)); };
  // ----- ambience -----
  S.cave = () => {
    const kind = Math.floor(rnd() * 3);
    const lp = new Biquad('lp', 600, 1);
    const dl = new Float32Array(Math.floor(DSP.SR * 0.23)); let di = 0;
    return render(5, (t) => {
      let s;
      if (kind === 0) s = Math.sin(2 * Math.PI * (70 + Math.sin(t * 0.7) * 15) * t) * 0.5 + lp.p(noise()) * 0.4;
      else if (kind === 1) { lp.set(300 + Math.sin(t * 1.3) * 250, 3); s = lp.p(noise()); }
      else s = Math.sin(2 * Math.PI * (180 - t * 20) * t) * 0.4 + Math.sin(2 * Math.PI * (183 - t * 21) * t) * 0.4;
      s *= Math.sin(Math.PI * t / 5);
      const out = s + dl[di] * 0.5; dl[di] = out; di = (di + 1) % dl.length;
      return out;
    });
  };
  S.rain = () => { const lp = new Biquad('lp', 2200, 0.7), hp = new Biquad('hp', 300, 0.7); return render(3, (t) => hp.p(lp.p(noise())) + (rnd() < 0.002 ? noise() * 2 : 0)); };
  // ----- portals & the Underworld -----
  // the portal's endless phasing whoomp
  S.portal_hum = () => {
    const bp = new Biquad('bp', 400, 4), bp2 = new Biquad('bp', 900, 6);
    let ph = 0;
    return render(2.6, (t) => {
      const sw = Math.sin(t * Math.PI * 2 / 2.6);
      bp.set(300 + sw * 180, 4); bp2.set(820 - sw * 300, 6);
      ph += 2 * Math.PI * (62 + sw * 9 + Math.sin(t * 31) * 2) / DSP.SR;
      return (bp.p(noise()) * 0.9 + bp2.p(noise()) * 0.5 + Math.sin(ph) * 0.45) * Math.sin(Math.PI * t / 2.6);
    });
  };
  // stepping in: a swelling rush
  S.portal_trigger = () => {
    const bp = new Biquad('bp', 300, 3);
    let ph = 0;
    return render(3.2, (t) => {
      const u = t / 3.2;
      bp.set(220 + u * u * 2400, 3);
      ph += 2 * Math.PI * (70 + u * 260) / DSP.SR;
      return (bp.p(noise()) + Math.sin(ph) * 0.35 * u) * Math.min(1, u * 3) * (1 - Math.pow(u, 6));
    });
  };
  // coming out the other side: a falling roar
  S.portal_travel = () => {
    const bp = new Biquad('bp', 2000, 2), lp = new Biquad('lp', 400, 0.8);
    let ph = 0;
    return render(3.5, (t) => {
      const u = t / 3.5;
      bp.set(2600 * (1 - u) + 150, 2);
      ph += 2 * Math.PI * (300 - u * 240) / DSP.SR;
      return (bp.p(noise()) * 0.9 + lp.p(noise()) * 0.6 + Math.sin(ph) * 0.3) * env(t, 0.05, 1.2);
    });
  };
  // a frame catching light
  S.portal_open = () => {
    const bp = new Biquad('bp', 600, 2);
    return render(2.2, (t) => {
      let s = 0;
      [196, 247, 294, 392].forEach((f, i) => { const st = i * 0.12; if (t > st) s += Math.sin(2 * Math.PI * f * (t - st) * (1 + 0.01 * Math.sin(t * 9))) * Math.exp(-(t - st) / 0.9) * 0.3; });
      bp.set(500 + t * 900, 2);
      return s + bp.p(noise()) * env(t, 0.2, 0.5) * 0.6;
    });
  };
  // the Underworld's low, hot drone (looped)
  S.under_drone = () => {
    const lp = new Biquad('lp', 160, 0.9), bp = new Biquad('bp', 700, 6);
    return render(6, (t) => {
      const w = Math.sin(Math.PI * 2 * t / 6);
      bp.set(600 + w * 200, 6);
      return lp.p(noise()) * 1.6 + Math.sin(2 * Math.PI * 41 * t) * 0.25 + Math.sin(2 * Math.PI * 61.5 * t) * 0.12 * (0.6 + 0.4 * w) + bp.p(noise()) * 0.06;
    });
  };
  // a far-off moan rolling through the caverns
  S.under_moan = () => {
    const f1 = new Biquad('bp', 500, 4), f2 = new Biquad('bp', 1100, 6), lp = new Biquad('lp', 1500, 0.8);
    const dl = new Float32Array(Math.floor(DSP.SR * 0.31)); let di = 0, ph = 0;
    const f0 = 120 + rnd() * 80, bend = rnd() < 0.5 ? -1 : 1;
    return render(4.5, (t) => {
      const u = t / 4.5;
      ph += 2 * Math.PI * (f0 + bend * Math.sin(u * Math.PI) * 40 + Math.sin(t * 6) * 3) / DSP.SR;
      const src = ((ph / (2 * Math.PI)) % 1) * 2 - 1;
      let s = lp.p(f1.p(src) + f2.p(src) * 0.5) * Math.sin(Math.PI * Math.min(1, u * 1.6)) * (u < 0.62 ? 1 : 0);
      const out = s + dl[di] * 0.55; dl[di] = out; di = (di + 1) % dl.length;
      return out;
    });
  };
  S.wind = () => { const bp = new Biquad('bp', 400, 1); return render(4, (t) => { bp.set(300 + Math.sin(t * 0.8) * 200, 1.5); return bp.p(noise()) * Math.sin(Math.PI * t / 4); }); };

  // ----- the Far Isles -----
  // the air between the isles: a slow breath with a cold shimmer on top (looped)
  S.isles_air = () => {
    const lp = new Biquad('lp', 380, 0.7), bp = new Biquad('bp', 2400, 9);
    return render(8, (t) => {
      const w = Math.sin(Math.PI * 2 * t / 8), w2 = Math.sin(Math.PI * 2 * t / 4 + 1);
      bp.set(2100 + w2 * 500, 9);
      let s = lp.p(noise()) * (0.9 + 0.3 * w) + bp.p(noise()) * 0.05 * (0.6 + 0.4 * w2);
      s += (Math.sin(2 * Math.PI * 55 * t) * 0.12 + Math.sin(2 * Math.PI * 82.5 * t) * 0.06) * (0.7 + 0.3 * w);
      return s;
    });
  };
  // a far-off chime, as if the stars rang
  S.isles_chime = () => {
    const notes = [880, 987.8, 1174.7, 1318.5, 1568, 1760], a = notes[Math.floor(rnd() * notes.length)], b = a * (rnd() < 0.5 ? 1.5 : 1.25);
    const dl = new Float32Array(Math.floor(DSP.SR * 0.23)); let di = 0;
    return render(4.5, (t) => {
      let s = Math.sin(2 * Math.PI * a * t) * Math.exp(-t / 1.4) * 0.4 + Math.sin(2 * Math.PI * a * 2.76 * t) * Math.exp(-t / 0.4) * 0.08;
      if (t > 0.45) s += Math.sin(2 * Math.PI * b * (t - 0.45)) * Math.exp(-(t - 0.45) / 1.2) * 0.3;
      const out = s + dl[di] * 0.5; dl[di] = out; di = (di + 1) % dl.length;
      return out;
    });
  };
  // stepping through a rift: a rush of air folding in on itself
  S.rift_travel = () => {
    const bp = new Biquad('bp', 300, 2);
    return render(2.4, (t) => {
      bp.set(200 + Math.pow(t / 2.4, 0.5) * 2600, 2.5);
      let s = bp.p(noise()) * Math.sin(Math.PI * t / 2.4);
      [261.6, 329.6, 392, 523.3].forEach((f, i) => { const st = 0.6 + i * 0.18; if (t > st) s += Math.sin(2 * Math.PI * f * (t - st)) * Math.exp(-(t - st) / 0.9) * 0.18; });
      return s;
    });
  };
  // the gaunt: a low, warbling murmur that seems to come from the wrong place
  const warble = (f0, f1, dur, wob, shriek) => () => {
    const f1a = new Biquad('bp', 600, 5), f2a = new Biquad('bp', 1500, 6), hp = new Biquad('hp', 200, 0.7);
    let ph = 0;
    return render(dur, (t) => {
      const u = t / dur;
      const f = f0 + (f1 - f0) * u + Math.sin(t * 2 * Math.PI * wob) * f0 * 0.18;
      ph += 2 * Math.PI * f / DSP.SR;
      f1a.set(500 + Math.sin(t * 7) * 250, 5);
      const src = ((ph / (2 * Math.PI)) % 1) * 2 - 1 + noise() * (shriek || 0.15);
      return hp.p(f1a.p(src) + f2a.p(src) * 0.6) * Math.sin(Math.PI * Math.min(1, u * 1.1));
    });
  };
  S.gaunt_say = warble(70, 52, 1.4, 5.5, 0.2);
  S.gaunt_stare = warble(180, 640, 1.5, 11, 0.9);
  S.gaunt_hurt = warble(150, 95, 0.4, 14, 0.5);
  S.gaunt_death = warble(120, 35, 2.2, 7, 0.4);
  S.gaunt_warp = () => {
    const bp = new Biquad('bp', 1500, 3);
    return render(0.6, (t) => { bp.set(2600 - t * 3600, 3); return bp.p(noise()) * env(t, 0.01, 0.18) + Math.sin(2 * Math.PI * (700 - t * 1000) * t) * env(t, 0.005, 0.12) * 0.4; });
  };
  // a star crystal shattering
  S.crystal_break = () => {
    const hp = new Biquad('hp', 2500, 0.8);
    return render(1.6, (t) => {
      let s = hp.p(noise()) * env(t, 0.002, 0.25) * 0.8;
      [1046.5, 1396.9, 1760, 2093].forEach((f, i) => { s += Math.sin(2 * Math.PI * f * t * (1 + i * 0.002)) * Math.exp(-t / (0.5 + i * 0.15)) * 0.2; });
      return s;
    });
  };
  S.crystal_hum = () => render(3, (t) => (Math.sin(2 * Math.PI * 440 * t) * 0.5 + Math.sin(2 * Math.PI * 660.4 * t) * 0.3 + Math.sin(2 * Math.PI * 880.9 * t) * 0.15) * Math.sin(Math.PI * t / 3));
  // ----- the Starwyrm -----
  // a voice like a whale's under a sky full of bells: a deep saw growl with a high, glassy shimmer over it
  const wyrmVoice = (dur, f0, f1, rough, shimmer, roar) => () => {
    const lp = new Biquad('lp', 380, 0.9), bp = new Biquad('bp', 900, 1.5), hp = new Biquad('hp', 2600, 0.7);
    let ph = 0, ph2 = 0;
    const bells = [523.3, 659.3, 784, 987.8, 1174.7].map((f) => f * (0.98 + rnd() * 0.04));
    return render(dur, (t) => {
      const u = t / dur, f = f0 + (f1 - f0) * Math.pow(u, 0.8) + Math.sin(t * 2 * Math.PI * 5) * f0 * 0.05;
      ph += 2 * Math.PI * f / DSP.SR; ph2 += 2 * Math.PI * f * 1.5 / DSP.SR;
      const saw = ((ph / (2 * Math.PI)) % 1) * 2 - 1, sq = Math.sin(ph2) > 0 ? 0.4 : -0.4;
      const e = Math.sin(Math.PI * Math.min(1, u * 1.1)) * (u < 0.05 ? u / 0.05 : 1);
      let v = (lp.p(saw + sq * 0.5 + noise() * rough) * 1.5 + bp.p(noise()) * rough * (roar || 0)) * e;
      let sh = 0; bells.forEach((bf, i) => { sh += Math.sin(2 * Math.PI * bf * t + i) * Math.sin(Math.PI * clamp((t - i * dur * 0.06) / (dur * 0.7), 0, 1)); });
      v += (sh * 0.06 + hp.p(noise()) * 0.05) * shimmer * Math.max(0, Math.sin(Math.PI * u));
      return v;
    });
  };
  S.wyrm_say = wyrmVoice(2.6, 64, 50, 0.25, 0.8, 0.2);
  S.wyrm_hurt = wyrmVoice(0.8, 96, 70, 0.45, 0.4, 0.6);
  S.wyrm_roar = wyrmVoice(3.4, 58, 46, 0.5, 1.2, 1.2);
  // its end: the roar falls away and the stars ring out of it
  S.wyrm_death = () => {
    const base = wyrmVoice(4.5, 70, 26, 0.5, 0.5, 1)();
    const bells = [261.6, 329.6, 392, 523.3, 659.3, 784, 1046.5];
    return render((base.length / DSP.SR) + 2.5, (t, i) => {
      let s = i < base.length ? base[i] : 0;
      bells.forEach((f, k) => { const u = t - 1.2 - k * 0.32; if (u > 0) s += Math.sin(2 * Math.PI * f * u) * Math.exp(-u / 1.6) * 0.18; });
      return s;
    });
  };
  // a starbolt spat: a breath of air and a flurry of sparks
  S.wyrm_spit = () => {
    const bp = new Biquad('bp', 1200, 1.2), ck = [];
    for (let i = 0; i < 12; i++) ck.push([0.05 + rnd() * 0.5, 1800 + rnd() * 2600, 0.25, 0.01 + rnd() * 0.02]);
    return render(0.8, (t) => { bp.set(600 + t * 2400, 1.2); return bp.p(noise()) * env(t, 0.02, 0.22) * 1.4 + ring(ck, t); });
  };
  // starfire rolling out across the ground
  S.wyrm_breath = () => {
    const bp = new Biquad('bp', 900, 0.9), hp = new Biquad('hp', 3000, 0.7), ck = [];
    for (let i = 0; i < 30; i++) ck.push([0.2 + rnd() * 2.2, 1500 + rnd() * 3000, 0.12, 0.015 + rnd() * 0.02]);
    return render(2.8, (t) => { const e = Math.sin(Math.PI * Math.min(1, t / 2.8)) * (t < 0.1 ? t / 0.1 : 1); bp.set(500 + Math.sin(t * 3) * 300, 0.9); return (bp.p(noise()) * 1.3 + hp.p(noise()) * 0.3) * e + ring(ck, t); });
  };
  S.wyrm_bolt_burst = () => {
    const lp = new Biquad('lp', 600, 0.8), ck = [];
    for (let i = 0; i < 16; i++) ck.push([rnd() * 0.4, 1200 + rnd() * 3500, 0.3, 0.02 + rnd() * 0.04]);
    return render(1.2, (t) => lp.p(noise()) * 3 * env(t, 0.003, 0.08) + ring(ck, t) + Math.sin(2 * Math.PI * 880 * t) * env(t, 0.01, 0.4) * 0.25);
  };
  // a piece of the wyrm bursting into stars
  S.wyrm_burst = () => {
    const hp = new Biquad('hp', 1800, 0.7), f = 600 + rnd() * 500;
    return render(1.6, (t) => hp.p(noise()) * env(t, 0.002, 0.12) + (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 1.5 * t) * 0.6 + Math.sin(2 * Math.PI * f * 2 * t) * 0.3) * env(t, 0.005, 0.5) * 0.4);
  };
  // a star falling out of the dark: a long whistle, getting lower and louder
  S.meteor_fall = () => {
    let ph = 0;
    const bp = new Biquad('bp', 2000, 2);
    return render(2.6, (t) => { const u = t / 2.6, f = 2400 - u * 1900; ph += 2 * Math.PI * f / DSP.SR; bp.set(f, 2); return (Math.sin(ph) * 0.4 + bp.p(noise()) * 0.8) * (0.15 + u * 0.85) * (u > 0.96 ? (1 - u) / 0.04 : 1); });
  };
  S.meteor_impact = () => {
    const lp = new Biquad('lp', 160, 0.8), hp = new Biquad('hp', 2500, 0.7), ck = [];
    for (let i = 0; i < 24; i++) ck.push([0.05 + rnd() * 0.8, 1500 + rnd() * 3000, 0.15, 0.02 + rnd() * 0.03]);
    return render(1.8, (t) => lp.p(noise()) * 6 * env(t, 0.004, 0.25) + Math.sin(2 * Math.PI * (55 - t * 15) * t) * env(t, 0.004, 0.4) * 0.8 + hp.p(noise()) * env(t, 0.002, 0.1) * 0.5 + ring(ck, t));
  };
  // a star gateway opening far off: a chord swelling out of nothing
  S.gateway_open = () => {
    const hp = new Biquad('hp', 3000, 0.7);
    return render(4.5, (t) => {
      const u = t / 4.5, sw = Math.sin(Math.PI * Math.min(1, u * 1.15));
      let s = 0; [196, 246.9, 293.7, 392, 493.9, 587.3].forEach((f, i) => { s += Math.sin(2 * Math.PI * f * t * (1 + Math.sin(t * 0.7 + i) * 0.002)) * (0.4 / (1 + i * 0.4)); });
      return s * sw + hp.p(noise()) * 0.15 * sw;
    });
  };
  // through it: a rush of air and a bell
  S.gateway_travel = () => {
    const bp = new Biquad('bp', 800, 1);
    return render(1.6, (t) => { bp.set(300 + t * 1800, 1); return bp.p(noise()) * env(t, 0.15, 0.35) * 1.2 + (Math.sin(2 * Math.PI * 1046.5 * t) + Math.sin(2 * Math.PI * 1568 * t) * 0.5) * env(t, 0.3, 0.6) * 0.3 * (t > 0.3 ? 1 : 0); });
  };
  // the Star Well drinking in the crystals' light
  S.wyrm_ritual = () => {
    const lp = new Biquad('lp', 200, 0.8);
    return render(6, (t) => {
      const u = t / 6, sw = Math.sin(Math.PI * Math.min(1, u * 1.1));
      let s = 0; [55, 82.4, 110, 164.8].forEach((f, i) => { s += Math.sin(2 * Math.PI * f * t) * (0.5 / (i + 1)); });
      [880, 1108.7, 1318.5].forEach((f, i) => { s += Math.sin(2 * Math.PI * f * t) * 0.07 * Math.max(0, Math.sin(t * (1.3 + i * 0.4))); });
      return (s + lp.p(noise()) * 0.6) * sw;
    });
  };
  // a wyrmling's voice: a small chirruping trill with bells in it
  S.wyrmling_say = () => {
    let ph = 0;
    return render(0.9, (t) => { const f = 900 + Math.sin(t * 40) * 120 + t * 300; ph += 2 * Math.PI * f / DSP.SR; return Math.sin(ph) * env(t, 0.02, 0.35) * 0.6 + Math.sin(2 * Math.PI * 1760 * t) * env(t, 0.1, 0.3) * 0.2 * (t > 0.1 ? 1 : 0); });
  };
  S.wyrmling_hurt = () => { let ph = 0; return render(0.4, (t) => { const f = 1400 - t * 1500; ph += 2 * Math.PI * f / DSP.SR; return Math.sin(ph) * env(t, 0.005, 0.12); }); };
  // a dropper or dispenser: the clack of its mechanism (higher and thinner when it is empty)
  S.dispense = () => { const ck = [[0, 1800, 0.6, 0.012], [0.03, 1200, 0.5, 0.02], [0.05, 2600, 0.3, 0.008]]; const lp = new Biquad('lp', 600, 0.8); return render(0.3, (t) => ring(ck, t) + lp.p(noise()) * env(t, 0.002, 0.03) * 1.5); };
  S.dispense_fail = () => { const ck = [[0, 2400, 0.6, 0.008], [0.05, 2600, 0.4, 0.006]]; return render(0.25, (t) => ring(ck, t)); };
  // ----- golems -----
  // the iron keeper: a deep, ringing footfall; the clang of a struck bell-iron body; a groaning collapse
  S.keeper_step = () => { const lp = new Biquad('lp', 260, 0.9); const ck = [[0.01, 196, 0.25, 0.05], [0.012, 523, 0.12, 0.03]]; return render(0.45, (t) => lp.p(noise()) * env(t, 0.004, 0.08) * 1.8 + ring(ck, t)); };
  S.keeper_hurt = () => { const ck = [[0, 220, 0.5, 0.18], [0, 547, 0.35, 0.12], [0, 1130, 0.2, 0.06], [0.004, 1687, 0.1, 0.04]]; const lp = new Biquad('lp', 900, 0.8); return render(1.2, (t) => ring(ck, t) + lp.p(noise()) * env(t, 0.002, 0.04)); };
  S.keeper_death = () => {
    const ck = []; for (let i = 0; i < 9; i++) ck.push([i * 0.09 + rnd() * 0.03, 110 + rnd() * 500, 0.35, 0.15 + rnd() * 0.15]);
    const lp = new Biquad('lp', 400, 0.8);
    return render(2.2, (t) => ring(ck, t) + lp.p(noise()) * env(t, 0.3, 0.7) * 0.8 + Math.sin(2 * Math.PI * (80 - t * 25) * t) * env(t, 0.05, 1) * 0.4);
  };
  S.keeper_attack = () => { const lp = new Biquad('lp', 500, 0.9); return render(0.5, (t) => { lp.set(300 + t * 1600, 0.9); return lp.p(noise()) * env(t, 0.06, 0.12) * 1.4; }); };
  S.keeper_wake = () => {
    const ck = [[0, 147, 0.4, 0.4], [0.18, 220, 0.4, 0.35], [0.36, 294, 0.45, 0.5], [0.36, 587, 0.15, 0.4]];
    const lp = new Biquad('lp', 300, 0.8);
    return render(2.2, (t) => ring(ck, t) + lp.p(noise()) * env(t, 0.02, 0.4) * 0.6);
  };
  // the snowkin: a soft crunch of packed snow
  S.snowkin_hurt = () => { const bp = new Biquad('bp', 1800, 1.2); return render(0.3, (t) => bp.p(noise()) * env(t, 0.003, 0.07) * (0.6 + 0.4 * Math.sin(t * 300))); };
  // ----- the Drift Isles -----
  // an orrery sentinel: the dry tick of its clockwork as it turns
  S.orrery_tick = () => { const ck = []; for (let i = 0; i < 8; i++) ck.push([i * 0.11 + rnd() * 0.01, 2400 + (i % 2) * 700, 0.4, 0.004]); return render(1, (t) => ring(ck, t)); };
  S.orrery_shoot = () => { let ph = 0; return render(0.7, (t) => { const f = 500 + t * 1800; ph += 2 * Math.PI * f / DSP.SR; return Math.sin(ph) * env(t, 0.01, 0.2) * 0.6 + Math.sin(ph * 2.01) * env(t, 0.01, 0.12) * 0.3; }); };
  S.orrery_hurt = () => { const ck = []; for (let i = 0; i < 6; i++) ck.push([rnd() * 0.15, 1200 + rnd() * 2500, 0.5, 0.01]); return render(0.4, (t) => ring(ck, t) + Math.sin(2 * Math.PI * 330 * t) * env(t, 0.003, 0.06) * 0.5); };
  S.orrery_death = () => {
    const ck = []; for (let i = 0; i < 30; i++) ck.push([rnd() * 1.1, 900 + rnd() * 3000, 0.3, 0.01 + rnd() * 0.02]);
    return render(1.6, (t) => ring(ck, t) + Math.sin(2 * Math.PI * (440 - t * 200) * t) * env(t, 0.01, 0.5) * 0.4);
  };
  S.mote_pop = () => render(0.4, (t) => Math.sin(2 * Math.PI * (1600 - t * 2000) * t) * env(t, 0.002, 0.08));
  S.mote_hit = () => { let ph = 0; return render(1.1, (t) => { const f = 300 + t * 900; ph += 2 * Math.PI * f / DSP.SR; return Math.sin(ph) * env(t, 0.01, 0.4) * 0.6 + Math.sin(2 * Math.PI * 1318 * t) * env(t, 0.05, 0.3) * 0.2; }); };
  // a glider snapping open, and the wind past it (looped)
  S.glider_open = () => { const hp = new Biquad('hp', 900, 0.8); return render(0.45, (t) => hp.p(noise()) * env(t, 0.004, 0.08) * 1.2 + Math.sin(2 * Math.PI * 180 * t) * env(t, 0.004, 0.05) * 0.4); };
  S.glide_wind = () => {
    const bp = new Biquad('bp', 500, 0.7), lp = new Biquad('lp', 260, 0.7);
    return render(6, (t) => { bp.set(420 + Math.sin(t * 2.1) * 160 + Math.sin(t * 5.3) * 60, 0.8); return (bp.p(noise()) * 0.9 + lp.p(noise()) * 1.4) * (0.75 + 0.25 * Math.sin(Math.PI * 2 * t / 6)); });
  };
  // ----- the Hush -----
  // the air of the Hush: a pressure more than a sound, with something ticking far away (looped)
  S.hush_air = () => {
    const lp = new Biquad('lp', 110, 0.8), ck = [];
    for (let i = 0; i < 10; i++) ck.push([rnd() * 7.6, 1400 + rnd() * 1600, 0.04 + rnd() * 0.05, 0.004]);
    return render(8, (t) => {
      const w = Math.sin(Math.PI * 2 * t / 8);
      return lp.p(noise()) * 1.8 * (0.8 + 0.2 * w) + Math.sin(2 * Math.PI * 36.7 * t) * 0.14 + Math.sin(2 * Math.PI * 55 * t) * 0.05 * (0.5 + 0.5 * w) + ring(ck, t);
    });
  };
  // mossglow caves: a soft green breath and water dripping somewhere (looped)
  S.moss_air = () => {
    const lp = new Biquad('lp', 500, 0.7), drips = [];
    for (let i = 0; i < 6; i++) { const at = 0.4 + rnd() * 7, f = 900 + rnd() * 900; drips.push([at, f, 0.25, 0.04], [at + 0.004, f * 1.9, 0.08, 0.02]); }
    return render(8, (t) => lp.p(noise()) * 0.35 * (0.8 + 0.2 * Math.sin(Math.PI * 2 * t / 8)) + ring(drips, t));
  };
  // a sensor hears something: a soft, hollow click and a breath of shimmer
  S.hush_click = () => {
    const bp = new Biquad('bp', 1900, 6), hp = new Biquad('hp', 3000, 0.7);
    return render(0.55, (t) => bp.p(noise()) * Math.exp(-t / 0.012) * 1.4 + Math.sin(2 * Math.PI * 420 * t) * Math.exp(-t / 0.03) * 0.5
      + hp.p(noise()) * 0.18 * Math.sin(Math.PI * Math.min(1, t / 0.55)) * (0.5 + 0.5 * Math.sin(t * 90)));
  };
  // a shrieker: a thin, rising wail with something rattling behind it
  S.hush_shriek = () => {
    const bp = new Biquad('bp', 900, 3), bp2 = new Biquad('bp', 2400, 8);
    let ph = 0, ph2 = 0;
    return render(2.6, (t) => {
      const u = t / 2.6, f = 520 + 380 * Math.sin(Math.PI * Math.min(1, u * 1.6)) + Math.sin(t * 2 * Math.PI * 7) * 30;
      ph += 2 * Math.PI * f / DSP.SR; ph2 += 2 * Math.PI * f * 1.502 / DSP.SR;
      const saw = ((ph / (2 * Math.PI)) % 1) * 2 - 1;
      const v = bp.p(saw) * 0.7 + Math.sin(ph2) * 0.25 + bp2.p(noise()) * (0.4 + 0.3 * Math.sin(t * 2 * Math.PI * 23));
      return v * (t < 0.08 ? t / 0.08 : 1) * Math.pow(1 - u, 1.2);
    });
  };
  // the Listener
  const groan = (dur, f0, f1, rough, clicks) => () => {
    const lp = new Biquad('lp', 500, 0.9), bp = new Biquad('bp', 320, 4), ck = [];
    for (let i = 0; i < clicks; i++) ck.push([rnd() * dur * 0.9, 900 + rnd() * 1800, 0.3 + rnd() * 0.4, 0.004 + rnd() * 0.004]);
    let ph = 0;
    return render(dur, (t) => {
      const u = t / dur, f = f0 + (f1 - f0) * u + Math.sin(t * 2 * Math.PI * 4.5) * f0 * 0.06;
      ph += 2 * Math.PI * f / DSP.SR;
      const src = (((ph / (2 * Math.PI)) % 1) * 2 - 1) * 0.6 + noise() * rough;
      return (lp.p(src) * 1.2 + bp.p(src) * 0.6) * Math.sin(Math.PI * Math.min(1, u * 1.15)) + ring(ck, t);
    });
  };
  S.listener_say = groan(1.6, 62, 48, 0.35, 7);
  S.listener_hurt = groan(0.5, 95, 60, 0.5, 3);
  S.listener_death = groan(3.2, 70, 24, 0.45, 18);
  S.listener_roar = () => {
    const base = groan(2.2, 58, 44, 0.7, 6)(), bp = new Biquad('bp', 700, 2);
    return render((base.length + 0.5) / DSP.SR, (t, i) => base[i] + bp.p(noise()) * 0.5 * Math.sin(Math.PI * Math.min(1, t / 2.2)) * (0.6 + 0.4 * Math.sin(t * 40)));
  };
  // it tilts its dish: a dry ratchet of clicks
  S.listener_listen = () => {
    const ck = []; for (let i = 0; i < 9; i++) ck.push([0.03 + i * 0.045 + rnd() * 0.01, 1200 + rnd() * 900, 0.5, 0.005]);
    const hp = new Biquad('hp', 1500, 0.7);
    return render(0.6, (t) => ring(ck, t) + hp.p(noise()) * 0.12 * Math.sin(Math.PI * Math.min(1, t / 0.6)));
  };
  // the slow heart in its chest: lub-dub
  S.listener_heart = () => {
    const lp = new Biquad('lp', 120, 0.8);
    return render(0.6, (t) => { const th = (u) => (u >= 0 ? Math.sin(2 * Math.PI * 48 * u) * Math.exp(-u / 0.06) : 0); return th(t) + th(t - 0.2) * 0.7 + lp.p(noise()) * 2 * (Math.exp(-t / 0.03) + (t > 0.2 ? Math.exp(-(t - 0.2) / 0.03) * 0.7 : 0)); });
  };
  S.listener_step = () => { const lp = new Biquad('lp', 160, 0.8); return render(0.35, (t) => lp.p(noise()) * 4 * Math.exp(-t / 0.05) + Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t / 0.07) * 0.8); };
  // digging up out of the floor, or back down into it
  S.listener_emerge = () => {
    const lp = new Biquad('lp', 260, 0.9), ck = [];
    for (let i = 0; i < 40; i++) ck.push([rnd() * 2.6, 300 + rnd() * 1500, 0.15 + rnd() * 0.35, 0.004 + rnd() * 0.01]);
    return render(3, (t) => (lp.p(noise()) * 3 * (0.6 + 0.4 * Math.sin(t * 13)) + Math.sin(2 * Math.PI * 38 * t) * 0.3) * Math.sin(Math.PI * Math.min(1, t / 3)) + ring(ck, t));
  };
  S.listener_dig = S.listener_emerge;
  // drawing breath for the hush wave: a whine climbing as it gathers
  S.listener_charge = () => {
    let ph = 0;
    const bp = new Biquad('bp', 1000, 3);
    return render(1.7, (t) => {
      const u = t / 1.7, f = 180 + u * u * 900;
      ph += 2 * Math.PI * f / DSP.SR;
      bp.set(400 + u * 2200, 3);
      return (Math.sin(ph) * 0.4 + bp.p(noise()) * 0.6) * u * (0.7 + 0.3 * Math.sin(t * 2 * Math.PI * (6 + u * 20)));
    });
  };
  // the hush wave: a deep blow, then a ringing that fills the head
  S.listener_wave = () => {
    const lp = new Biquad('lp', 200, 0.8), bp = new Biquad('bp', 1400, 2);
    return render(2, (t) => lp.p(noise()) * 5 * Math.exp(-t / 0.08) + Math.sin(2 * Math.PI * (60 - t * 12) * t) * Math.exp(-t / 0.3) * 0.9
      + (Math.sin(2 * Math.PI * 1760 * t) * 0.15 + Math.sin(2 * Math.PI * 2349 * t) * 0.1) * Math.exp(-t / 0.7) + bp.p(noise()) * Math.exp(-t / 0.25) * 0.5);
  };
  // the city gate waking: a deep chord swelling out of a hiss of falling grains
  S.sift_gate_open = () => {
    const hp = new Biquad('hp', 2500, 0.7);
    return render(5, (t) => {
      const u = t / 5, sw = Math.sin(Math.PI * Math.min(1, u * 1.2));
      let s = 0; [55, 82.4, 110, 164.8, 220].forEach((f, i) => { s += Math.sin(2 * Math.PI * f * t * (1 + i * 0.0007)) * (0.5 / (i + 1)); });
      return s * sw + hp.p(noise()) * 0.25 * sw * (0.5 + 0.5 * Math.sin(t * 7));
    });
  };
  // the gleaner chitters; the sifter hisses like pouring sand, and bursts out of it
  S.gleaner_say = () => { const ck = []; for (let i = 0; i < 6; i++) ck.push([i * 0.05 + rnd() * 0.02, 1800 + rnd() * 1400, 0.4, 0.012]); return render(0.4, (t) => ring(ck, t)); };
  S.gleaner_hurt = () => render(0.25, (t) => Math.sin(2 * Math.PI * (1400 - t * 2400) * t) * env(t, 0.004, 0.06));
  S.gleaner_death = () => render(0.6, (t) => Math.sin(2 * Math.PI * (1100 - t * 1300) * t) * env(t, 0.01, 0.2));
  S.sifter_say = () => { const bp = new Biquad('bp', 2500, 1.5); return render(1.2, (t) => bp.p(noise()) * Math.sin(Math.PI * t / 1.2) * (0.6 + 0.4 * Math.sin(t * 30))); };
  S.sifter_hurt = () => { const lp = new Biquad('lp', 900, 0.8); return render(0.4, (t) => lp.p(noise()) * 2 * env(t, 0.005, 0.08) + Math.sin(2 * Math.PI * 180 * t) * env(t, 0.005, 0.1) * 0.5); };
  S.sifter_death = () => { const bp = new Biquad('bp', 1500, 1); return render(1.4, (t) => bp.p(noise()) * env(t, 0.02, 0.4) + Math.sin(2 * Math.PI * (160 - t * 60) * t) * env(t, 0.01, 0.5) * 0.5); };
  S.sifter_lunge = () => { const hp = new Biquad('hp', 1200, 0.7), lp = new Biquad('lp', 300, 0.8); return render(0.7, (t) => hp.p(noise()) * env(t, 0.005, 0.18) + lp.p(noise()) * 3 * env(t, 0.003, 0.06) + (t > 0.25 && t < 0.27 ? Math.sin(2 * Math.PI * 900 * t) : 0)); };
  S.sifter_dive = () => { const hp = new Biquad('hp', 1500, 0.7); return render(0.6, (t) => hp.p(noise()) * env(t, 0.03, 0.2)); };
  // a sheet of paper unfolded
  S.page = () => { const bp = new Biquad('bp', 3000, 0.9); let g = 0, gt = 0; return render(0.35, (t) => { if (t > gt) { g = rnd(); gt = t + 0.005 + rnd() * 0.02; } return bp.p(noise()) * g * Math.sin(Math.PI * t / 0.35); }); };
  // the Sift: wind over the dunes, hissing with sand (looped), and the sunken bells
  S.sift_wind = () => {
    const bp = new Biquad('bp', 900, 1.2), hp = new Biquad('hp', 4000, 0.7);
    return render(8, (t) => {
      const w = Math.sin(Math.PI * 2 * t / 8), w2 = Math.sin(Math.PI * 2 * t / 4 + 2);
      bp.set(500 + 300 * w, 1.4);
      return bp.p(noise()) * (0.7 + 0.3 * w) + hp.p(noise()) * 0.12 * (0.6 + 0.4 * w2);
    });
  };
  S.sift_bell = () => {
    const f = 110 * (0.9 + rnd() * 0.2), parts = [[1, 0.6, 3.5], [2.0, 0.35, 2.4], [2.76, 0.25, 1.6], [5.4, 0.12, 0.8], [8.9, 0.06, 0.4]];
    const dl = new Float32Array(Math.floor(DSP.SR * 0.31)); let di = 0;
    return render(6, (t) => {
      let s = 0; for (const [k, a, d] of parts) s += Math.sin(2 * Math.PI * f * k * t * (1 + k * 0.0004)) * a * Math.exp(-t / d) * (t < 0.004 ? t / 0.004 : 1);
      const out = s + dl[di] * 0.45; dl[di] = out; di = (di + 1) % dl.length;
      return out;
    });
  };
  // the Sift gate: grains pouring through grey light, and a low note beneath
  S.sift_hum = () => {
    const hp = new Biquad('hp', 3000, 0.7), bp = new Biquad('bp', 5000, 2);
    return render(3, (t) => { const sw = Math.sin(Math.PI * t / 3); return (hp.p(noise()) * 0.5 * (0.7 + 0.3 * Math.sin(t * 11)) + bp.p(noise()) * 0.3 + Math.sin(2 * Math.PI * 82.4 * t) * 0.25 + Math.sin(2 * Math.PI * 123.5 * t) * 0.12) * sw; });
  };
  // an echo fork, struck: a clear note that takes its time to die
  S.echo_fork = () => render(2.4, (t) => (Math.sin(2 * Math.PI * 880 * t) * 0.6 + Math.sin(2 * Math.PI * 883 * t) * 0.3 + Math.sin(2 * Math.PI * 5550 * t) * 0.15 * Math.exp(-t / 0.05)) * Math.exp(-t / 0.8) * (t < 0.003 ? t / 0.003 : 1));
  return S;
})();

class AudioEngine {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.buffers = {};
    this.listener = [0, 0, 0, 0];
    this.loops = {};
    this.cache = new Map();
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
    this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.master);
    this.setVolumes(this.game.settings);
    if (this.game.music) this.game.music.attach(this.ctx, this.musicGain);
  }
  setVolumes(s) { if (!this.ctx) return; this.sfx.gain.value = s.sound; this.musicGain.gain.value = s.music * 0.7; }
  buffer(name) {
    let variants = this.cache.get(name);
    if (variants) return variants[Math.floor(Math.random() * variants.length)];
    const def = SOUND_DEFS[name];
    if (!def || !this.ctx) return null;
    variants = [];
    const nv = (name === 'cave' || name === 'thunder' || name === 'explode' || name === 'under_moan') ? 3 : 2;
    for (let v = 0; v < nv; v++) {
      DSP.setSeed(stringHash(name) + v * 7919);
      const data = def();
      const b = this.ctx.createBuffer(1, data.length, DSP.SR);
      b.getChannelData(0).set(data);
      variants.push(b);
    }
    this.cache.set(name, variants);
    return variants[Math.floor(Math.random() * variants.length)];
  }
  setListener(x, y, z, yaw) { this.listener = [x, y, z, yaw]; }
  play(name, vol, pitch, x, y, z) {
    if (!this.ctx || this.game.settings.sound <= 0) return;
    const buf = this.buffer(name);
    if (!buf) return;
    vol = vol === undefined ? 1 : vol; pitch = pitch || 1;
    let pan = 0;
    if (x !== undefined) {
      const [lx, ly, lz, yaw] = this.listener;
      const dx = x - lx, dy = y - ly, dz = z - lz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const range = 16 * Math.max(1, vol);
      if (d > range) return;
      vol *= Math.max(0, 1 - d / range);
      const ang = Math.atan2(dx, dz) - Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
      pan = Math.sin(ang) * Math.min(1, d / 3) * -1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = clamp(pitch, 0.25, 4);
    const g = this.ctx.createGain(); g.gain.value = Math.min(2, vol);
    let node = src.connect(g);
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); node.connect(p); node = p; }
    node.connect(this.sfx);
    src.start();
  }
  // note blocks: midi 54..78 (F#3..F#5), played by pitching the F#4 sample like the classic game
  playNote(inst, midi, x, y, z) { this.play('nb_' + inst, 2, Math.pow(2, (midi - 66) / 12), x, y, z); }
  playBlock(material, kind, x, y, z) {
    const m = material || 'stone';
    const vol = { break: 1, hit: 0.25, step: 0.15, place: 1 }[kind] || 1;
    const pitch = { break: 0.8, hit: 0.5, step: 1, place: 0.8 }[kind] || 1;
    this.play(m + '_' + kind, vol, pitch * (0.9 + Math.random() * 0.2) * (kind === 'hit' ? 1.6 : 1.2), x, y, z);
  }
  // looping ambience (rain)
  loop(name, vol) {
    if (!this.ctx) return;
    let l = this.loops[name];
    if (vol <= 0.001) { if (l) { l.g.gain.value = 0; } return; }
    if (!l) {
      const buf = this.buffer(name); if (!buf) return;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(g); g.connect(this.sfx); src.start();
      l = this.loops[name] = { src, g };
    }
    l.g.gain.value = vol;
  }
  stopLoops() { for (const k in this.loops) { try { this.loops[k].src.stop(); } catch (e) { /* ignore */ } } this.loops = {}; }
}
