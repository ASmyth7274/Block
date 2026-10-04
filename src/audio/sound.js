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
  const crunch = (dur, lp, hp, grain, decay) => () => {
    const f1 = new Biquad('lp', lp, 0.8), f2 = new Biquad('hp', hp, 0.7);
    let g = 1, gt = 0;
    return render(dur, (t) => {
      if (t > gt) { g = 0.3 + rnd() * 0.7; gt = t + grain * (0.5 + rnd()); }
      return f2.p(f1.p(noise())) * g * env(t, 0.004, decay);
    });
  };
  const knock = (freq, res, dur, decay) => () => {
    const bp = new Biquad('bp', freq * 3, res);
    let ph = 0;
    return render(dur, (t) => {
      ph += 2 * Math.PI * freq * (1 - t * 0.6) / DSP.SR;
      return (Math.sin(ph) * 0.6 + bp.p(noise()) * 0.8) * env(t, 0.002, decay);
    });
  };
  S.stone_break = crunch(0.22, 3500, 700, 0.012, 0.06); S.stone_hit = crunch(0.1, 3200, 900, 0.01, 0.03); S.stone_step = crunch(0.1, 2600, 600, 0.015, 0.03); S.stone_place = crunch(0.18, 3000, 500, 0.012, 0.05);
  S.wood_break = knock(140, 4, 0.25, 0.07); S.wood_hit = knock(170, 5, 0.12, 0.035); S.wood_step = knock(150, 3, 0.1, 0.03); S.wood_place = knock(130, 4, 0.2, 0.06);
  S.gravel_break = crunch(0.25, 1600, 200, 0.02, 0.07); S.gravel_hit = crunch(0.12, 1400, 250, 0.02, 0.035); S.gravel_step = crunch(0.12, 1300, 200, 0.025, 0.035); S.gravel_place = crunch(0.2, 1500, 200, 0.02, 0.06);
  S.grass_break = crunch(0.25, 6000, 1800, 0.008, 0.07); S.grass_hit = crunch(0.12, 5500, 2000, 0.008, 0.04); S.grass_step = crunch(0.14, 5000, 1600, 0.01, 0.045); S.grass_place = crunch(0.2, 6000, 1600, 0.008, 0.06);
  S.sand_break = crunch(0.25, 7000, 2500, 0.004, 0.08); S.sand_hit = crunch(0.12, 7000, 2500, 0.004, 0.04); S.sand_step = crunch(0.14, 6500, 2400, 0.005, 0.05); S.sand_place = crunch(0.2, 7000, 2500, 0.004, 0.07);
  S.cloth_break = crunch(0.2, 700, 80, 0.03, 0.06); S.cloth_hit = crunch(0.1, 700, 80, 0.03, 0.03); S.cloth_step = crunch(0.1, 600, 80, 0.03, 0.03); S.cloth_place = crunch(0.18, 700, 80, 0.03, 0.05);
  S.snow_break = crunch(0.25, 3500, 1200, 0.006, 0.07); S.snow_hit = crunch(0.12, 3500, 1300, 0.006, 0.035); S.snow_step = crunch(0.14, 3200, 1100, 0.008, 0.045); S.snow_place = crunch(0.2, 3500, 1200, 0.006, 0.06);
  S.glass_break = () => {
    const parts = []; for (let i = 0; i < 9; i++) parts.push([2500 + rnd() * 5500, rnd() * 0.15, 0.03 + rnd() * 0.12]);
    const hp = new Biquad('hp', 3000, 0.7);
    return render(0.6, (t) => {
      let s = hp.p(noise()) * env(t, 0.001, 0.04) * 0.6;
      for (const [f, st, d] of parts) if (t > st) s += Math.sin(2 * Math.PI * f * (t - st)) * Math.exp(-(t - st) / d) * 0.4;
      return s;
    });
  };
  S.metal_break = () => {
    const pf = [440, 1050, 1730, 2600, 3900].map((f) => f * (0.9 + rnd() * 0.2));
    return render(0.6, (t) => { let s = noise() * env(t, 0.001, 0.01) * 0.5; pf.forEach((f, i) => { s += Math.sin(2 * Math.PI * f * t) * Math.exp(-t / (0.3 / (i + 1))) / (i + 1); }); return s; });
  };
  S.metal_hit = S.metal_place = S.metal_break; S.metal_step = S.stone_step; S.glass_hit = S.stone_hit; S.glass_step = S.stone_step; S.glass_place = S.stone_place;
  S.ladder_step = knock(220, 3, 0.1, 0.03); S.ladder_break = S.wood_break; S.ladder_hit = S.wood_hit; S.ladder_place = S.wood_place;
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
  S.wind = () => { const bp = new Biquad('bp', 400, 1); return render(4, (t) => { bp.set(300 + Math.sin(t * 0.8) * 200, 1.5); return bp.p(noise()) * Math.sin(Math.PI * t / 4); }); };
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
    const nv = (name === 'cave' || name === 'thunder' || name === 'explode') ? 3 : 2;
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
