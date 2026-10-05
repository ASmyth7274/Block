'use strict';
// ---------------------------------------------------------------------------
// Generative ambient piano. Every piece is composed on the fly from a few
// rules (key, mode, chord progression, accompaniment pattern, motifs), then
// played on a synthesised piano through a soft reverb. Calm, sparse, warm.
// ---------------------------------------------------------------------------
class MusicEngine {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.notes = new Map();          // midi -> AudioBuffer
    this.renderQueue = [];
    this.pending = new Map();
    this.events = []; this.ei = 0;
    this.playing = false;
    this.pieceStart = 0; this.pieceEnd = 0;
    this.nextStart = performance.now() + 2000;
    this.sources = [];
    this.mood = 'menu';
  }
  attach(ctx, gain) {
    this.ctx = ctx;
    this.out = ctx.createGain(); this.out.gain.value = 1; this.out.connect(gain);
    this.reverb = ctx.createConvolver(); this.reverb.buffer = this.impulse(3.2);
    this.wet = ctx.createGain(); this.wet.gain.value = 0.42;
    this.dry = ctx.createGain(); this.dry.gain.value = 0.85;
    this.reverb.connect(this.wet); this.wet.connect(this.out); this.dry.connect(this.out);
    this.bus = ctx.createGain(); this.bus.gain.value = 0.9;
    this.bus.connect(this.dry); this.bus.connect(this.reverb);
    this.nextStart = performance.now() + (this.game.world ? 20000 + Math.random() * 40000 : 1500);
  }
  impulse(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / ctx.sampleRate;
        lp += ((Math.random() * 2 - 1) - lp) * (0.35 - 0.25 * Math.min(1, t / sec));   // darker tail
        d[i] = lp * Math.pow(1 - i / n, 2.2) * (i < 200 ? i / 200 : 1);
      }
    }
    return b;
  }

  // ------------------------------------------------------------ piano synthesis
  renderPiano(midi) {
    const SR = 22050;
    const f0 = 440 * Math.pow(2, (midi - 69) / 12);
    const dur = clamp(5.2 - (midi - 40) * 0.07, 1.5, 5.2);
    const n = Math.floor(dur * SR);
    const out = new Float32Array(n);
    const Bk = 0.0003 * Math.pow(2, (midi - 60) / 20);
    const decay = clamp(3.4 - (midi - 48) * 0.04, 0.7, 4.5);
    for (let k = 1; k <= 14; k++) {
      const fk = f0 * k * Math.sqrt(1 + Bk * k * k);
      if (fk > SR * 0.45) break;
      let amp = Math.pow(k, -1.25) * (1 / (1 + Math.max(0, fk - 2200) / 1400));
      if (k === 2) amp *= 0.75;
      if (k % 7 === 0) amp *= 0.3;       // hammer position notch
      const tLong = decay / (1 + (k - 1) * 0.5), tShort = tLong * 0.16;
      const strings = k <= 3 ? [-0.7, 0.7] : [0];
      for (const cents of strings) {
        const w = 2 * Math.PI * fk * Math.pow(2, cents / 1200) / SR;
        const c2 = 2 * Math.cos(w);
        const ph = Math.random() * TAU;
        let y1 = Math.sin(ph - w), y2 = Math.sin(ph - 2 * w);
        let e1 = 0.55 * amp / strings.length, e2 = 0.45 * amp / strings.length;
        const d1 = Math.exp(-1 / (tShort * SR)), d2 = Math.exp(-1 / (tLong * SR));
        // stop once this partial has died away (high partials decay fast)
        const cut = Math.min(n, Math.ceil(tLong * SR * 7.5));
        for (let i = 0; i < cut; i++) {
          const y = c2 * y1 - y2; y2 = y1; y1 = y;
          out[i] += y * (e1 + e2);
          e1 *= d1; e2 *= d2;
        }
      }
    }
    // hammer thump
    let lp = 0;
    const hn = Math.min(n, Math.floor(SR * 0.03));
    for (let i = 0; i < hn; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.2; out[i] += lp * Math.exp(-i / (SR * 0.005)) * 0.12; }
    // attack ramp, normalise, tail fade
    let pk = 0;
    for (let i = 0; i < n; i++) { if (i < 60) out[i] *= i / 60; pk = Math.max(pk, Math.abs(out[i])); }
    const g = (pk > 0 ? 0.6 / pk : 1) * (1 + Math.max(0, 60 - midi) * 0.012);
    for (let i = 0; i < n; i++) out[i] *= g * (i > n - 2000 ? (n - i) / 2000 : 1);
    const buf = this.ctx.createBuffer(1, n, SR);
    buf.getChannelData(0).set(out);
    return buf;
  }
  note(midi) {
    let b = this.notes.get(midi);
    if (!b) { b = this.renderPiano(midi); this.notes.set(midi, b); }
    return b;
  }
  // The same piano voice, rendered off the main thread by an OfflineAudioContext.
  prefetch(midi) {
    if (this.notes.has(midi) || this.pending.has(midi)) return;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return;
    const SR = 22050;
    const f0 = 440 * Math.pow(2, (midi - 69) / 12);
    const dur = clamp(5.2 - (midi - 40) * 0.07, 1.5, 5.2);
    const n = Math.floor(dur * SR);
    let oc;
    try { oc = new OAC(1, n, SR); } catch (e) { return; }
    const Bk = 0.0003 * Math.pow(2, (midi - 60) / 20);
    const decay = clamp(3.4 - (midi - 48) * 0.04, 0.7, 4.5);
    for (let k = 1; k <= 14; k++) {
      const fk = f0 * k * Math.sqrt(1 + Bk * k * k);
      if (fk > SR * 0.45) break;
      let amp = Math.pow(k, -1.25) * (1 / (1 + Math.max(0, fk - 2200) / 1400));
      if (k === 2) amp *= 0.75;
      if (k % 7 === 0) amp *= 0.3;
      const tLong = decay / (1 + (k - 1) * 0.5), tShort = tLong * 0.16;
      const strings = k <= 3 ? [-0.7, 0.7] : [0];
      for (const cents of strings) {
        const o = oc.createOscillator();
        o.frequency.value = fk * Math.pow(2, cents / 1200);
        for (const [lvl, tau] of [[0.55, tShort], [0.45, tLong]]) {
          const g = oc.createGain();
          g.gain.setValueAtTime(0, 0);
          g.gain.linearRampToValueAtTime(lvl * amp / strings.length, 0.003);
          g.gain.setTargetAtTime(0, 0.003, tau);
          o.connect(g); g.connect(oc.destination);
        }
        o.start(Math.random() * 0.0005);
        o.stop(Math.min(dur, tLong * 7.5 + 0.01));
      }
    }
    // hammer thump
    const nb = oc.createBuffer(1, Math.floor(SR * 0.03), SR), nd = nb.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < nd.length; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.2; nd[i] = lp * Math.exp(-i / (SR * 0.005)) * 0.12; }
    const ns = oc.createBufferSource(); ns.buffer = nb; ns.connect(oc.destination); ns.start(0);
    const p = oc.startRendering().then((buf) => {
      const d = buf.getChannelData(0);
      let pk = 0;
      for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
      const gn = (pk > 0 ? 0.6 / pk : 1) * (1 + Math.max(0, 60 - midi) * 0.012);
      for (let i = 0; i < d.length; i++) d[i] *= gn * (i > d.length - 2000 ? (d.length - i) / 2000 : 1);
      const out = this.ctx.createBuffer(1, d.length, SR);
      out.getChannelData(0).set(d);
      this.notes.set(midi, out);
      this.pending.delete(midi);
    }).catch(() => { this.pending.delete(midi); });
    this.pending.set(midi, p);
  }

  // ------------------------------------------------------------ composition
  chooseMood() {
    const g = this.game;
    if (!g.world || g.world.menu) return 'menu';
    const p = g.player, w = g.world;
    if (this.forceMood) return this.forceMood;
    if (w.dim === 2) return typeof Wyrm !== 'undefined' && Wyrm.fighting() ? 'wyrm' : 'isles';
    if (w.dim === 3) return 'sift';
    if (w.dim) return 'underworld';
    if (p && p.creative) return Math.random() < 0.5 ? 'creative' : 'day';
    if (p && p.y < 72) {
      const cb = w.biomeAt3(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z));
      if (cb === HUSH_BIOME) return 'hush';
      if (cb === MOSSGLOW_BIOME) return 'mossglow';
    }
    if (p && p.y < 52 && !w.canSeeSky(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z))) return 'underground';
    if (w.skyDarken() >= 6) return 'night';
    return 'day';
  }
  compose(mood) {
    const R = Math.random, pick = (a) => a[Math.floor(R() * a.length)];
    const MODES = { ionian: [0, 2, 4, 5, 7, 9, 11], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], dorian: [0, 2, 3, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], phrygian: [0, 1, 3, 5, 7, 8, 10] };
    // the deep caves borrow from the others: the Hush is sparser and lower than any cave, mossglow gentler
    if (mood === 'hush' || mood === 'mossglow' || mood === 'sift') return this.composeCave(mood);
    const under = mood === 'underworld', isles = mood === 'isles', wyrm = mood === 'wyrm', ending = mood === 'ending';
    const modeName = under ? pick(['phrygian', 'aeolian', 'phrygian']) : mood === 'night' ? pick(['dorian', 'aeolian', 'ionian', 'lydian']) : mood === 'underground' ? pick(['aeolian', 'dorian', 'aeolian'])
      : isles ? pick(['lydian', 'dorian', 'lydian', 'ionian']) : wyrm ? pick(['aeolian', 'phrygian', 'aeolian']) : ending ? pick(['ionian', 'lydian'])
      : mood === 'menu' ? pick(['ionian', 'lydian', 'mixolydian', 'ionian']) : pick(['ionian', 'lydian', 'ionian', 'mixolydian', 'dorian']);
    const mode = MODES[modeName];
    const minor = modeName === 'dorian' || modeName === 'aeolian' || modeName === 'phrygian';
    const tonic = under ? 43 + Math.floor(R() * 6) : isles ? 55 + Math.floor(R() * 6) : wyrm ? 45 + Math.floor(R() * 5) : 50 + Math.floor(R() * 8);
    const bpm = under ? 44 + R() * 10 : isles ? 46 + R() * 10 : wyrm ? 84 + R() * 12 : ending ? 58 + R() * 6 : mood === 'underground' ? 52 + R() * 10 : mood === 'night' ? 58 + R() * 12 : mood === 'menu' ? 66 + R() * 14 : 62 + R() * 16;
    const beat = 60 / bpm;
    const meter = R() < 0.25 ? 3 : 4;
    const bar = beat * meter;
    const deg = (d) => { const o = Math.floor(d / 7); const i = ((d % 7) + 7) % 7; return tonic + mode[i] + 12 * o; };
    const chordOf = (d, ext) => { const c = [deg(d), deg(d + 2), deg(d + 4)]; if (ext === 7) c.push(deg(d + 6)); if (ext === 9) c.push(deg(d + 8)); return c; };
    const PROG_MAJ = [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4], [0, 3, 0, 4], [0, 2, 3, 0], [1, 4, 0, 5], [0, 3, 5, 4], [3, 0, 4, 5], [0, 5, 1, 4], [3, 4, 2, 5]];
    const PROG_MIN = [[0, 6, 5, 6], [0, 3, 6, 0], [0, 5, 2, 6], [0, 3, 4, 0], [5, 6, 0, 0], [0, 2, 5, 6], [3, 0, 6, 5]];
    const progs = minor ? PROG_MIN : PROG_MAJ;
    const ev = [];
    const add = (t, m, v, d) => { if (m >= 28 && m <= 96) ev.push({ t: t + (R() - 0.5) * 0.025, m, v: clamp(v, 0.05, 1), d }); };
    let t = 0.4;
    const phrases = (mood === 'underground' || under) ? 3 + Math.floor(R() * 2) : ending ? 6 : wyrm ? 5 : 4 + Math.floor(R() * 3);
    const progA = pick(progs), progB = R() < 0.6 ? pick(progs) : progA;
    const accomp = ['roll', 'arp8', 'arp4', 'sparse', 'pedal'];
    let motif = null;
    for (let ph = 0; ph < phrases; ph++) {
      const prog = ph % 2 === 1 ? progB : progA;
      const style = under ? pick(['sparse', 'pedal', 'pedal', 'roll']) : mood === 'underground' ? pick(['sparse', 'pedal', 'roll'])
        : isles ? pick(['sparse', 'pedal', 'arp4', 'sparse']) : wyrm ? pick(['arp8', 'arp8', 'roll']) : ending ? pick(['roll', 'arp8', 'arp4']) : pick(accomp);
      const withMelody = ph > 0 && R() < (under ? 0.4 : mood === 'underground' ? 0.45 : isles ? 0.5 : ending ? 0.9 : 0.75);
      if (withMelody && (!motif || R() < 0.4)) motif = this.makeMotif(meter, R);
      const accV = mood === 'menu' ? 0.42 : 0.34;
      for (let b = 0; b < prog.length; b++) {
        const d = prog[b];
        const ext = R() < 0.35 ? (R() < 0.5 ? 7 : 9) : 0;
        const ch = chordOf(d, ext);
        const bass = ch[0] - 12 * (ch[0] > 52 ? 2 : 1);
        if (R() < 0.85) add(t, bass, accV + 0.1, bar * 1.2);
        if ((under || wyrm) && R() < (wyrm ? 0.6 : 0.35)) add(t + beat * 0.02, bass - 12, accV * 0.8, bar * 1.6);   // a low toll
        if (isles && R() < 0.5) add(t + beat * (1 + Math.floor(R() * meter)) + beat * 0.5, deg(d + 21 + pick([0, 2, 4])), 0.16 + R() * 0.06, beat * 3);   // starlight
        if (R() < 0.3) add(t + beat * (meter === 3 ? 2 : 2), bass + 7, accV * 0.7, bar * 0.6);
        const up = ch.map((m) => m + (m < 55 ? 12 : 0));
        switch (style) {
          case 'roll': { const sp = 0.07 + R() * 0.06; up.forEach((m, i) => add(t + i * sp, m, accV, bar)); if (meter === 4 && R() < 0.4) up.slice(1).forEach((m, i) => add(t + beat * 2 + i * sp, m, accV * 0.8, bar / 2)); break; }
          case 'arp8': { const pat = meter === 3 ? [0, 1, 2, 3, 2, 1] : [0, 1, 2, 3, 2, 1, 2, 1]; const tones = up.concat([up[0] + 12]); pat.forEach((k, i) => add(t + i * beat / 2, tones[k % tones.length], accV * (i % 2 ? 0.75 : 0.9), beat * 1.5)); break; }
          case 'arp4': { const tones = up.concat([up[0] + 12]); for (let i = 0; i < meter; i++) add(t + i * beat, tones[i % tones.length], accV * 0.85, beat * 2); break; }
          case 'sparse': { add(t + beat * 0.5, up[1], accV * 0.7, beat * 2.5); if (R() < 0.7) add(t + beat * (meter - 1), up[2], accV * 0.6, beat * 2); break; }
          default: { add(t + beat, up[0], accV * 0.7, beat * 2); add(t + beat * 1.02, up[2], accV * 0.6, beat * 2); if (meter === 4) add(t + beat * 3, up[1] + 12, accV * 0.5, beat); }
        }
        if (withMelody && motif) {
          // place the motif, snapping strong notes to chord tones
          const ctones = new Set(ch.map((m) => ((m % 12) + 12) % 12));
          let deg0 = d + 7 + (b % 2 === 1 && R() < 0.5 ? 2 : 0);
          for (const n of motif) {
            if (n.rest) continue;
            let m = deg(deg0 + n.step);
            if (n.strong && !ctones.has(((m % 12) + 12) % 12)) { if (ctones.has(((deg(deg0 + n.step + 1) % 12) + 12) % 12)) m = deg(deg0 + n.step + 1); else m = deg(deg0 + n.step - 1); }
            while (m > 84) m -= 12;
            while (m < 60) m += 12;
            add(t + n.at * beat, m, 0.5 + R() * 0.2, n.len * beat * 1.4);
          }
        } else if ((mood === 'menu' || mood === 'day' || mood === 'creative') && R() < 0.25) {
          add(t + beat * (1 + Math.floor(R() * (meter - 1))) + 0.5 * beat, deg(d + 14 + pick([0, 2, 4])), 0.25, beat * 2);
        }
        t += bar;
      }
    }
    // ending: tonic chord, held
    const fin = chordOf(0, R() < 0.5 ? 9 : 0);
    add(t, fin[0] - 12, 0.4, bar * 2);
    fin.forEach((m, i) => add(t + 0.1 * i, m + (m < 55 ? 12 : 0), 0.32, bar * 2.5));
    if (R() < 0.6) add(t + bar * 0.75, deg(14), 0.22, bar * 2);
    ev.sort((a, b) => a.t - b.t);
    return { events: ev, length: t + bar * 3, mood, mode: modeName, bpm: Math.round(bpm) };
  }
  // the deep caves: the Hush gets low tolls and far-off notes that echo back softer and
  // softer, with long silences between; the mossglow caves get slow falling arpeggios like drops
  composeCave(mood) {
    const R = Math.random, pick = (a) => a[Math.floor(R() * a.length)];
    const ev = [];
    const add = (t, m, v, d) => { if (m >= 28 && m <= 96) ev.push({ t: t + (R() - 0.5) * 0.03, m, v: clamp(v, 0.05, 1), d }); };
    let t = 0.6;
    if (mood === 'hush') {
      const scale = [0, 1, 3, 5, 6, 8, 10], tonic = 36 + Math.floor(R() * 5), bpm = 34 + R() * 8, bar = 60 / bpm * 4;
      const bars = 9 + Math.floor(R() * 5);
      for (let b = 0; b < bars; b++) {
        if (R() < 0.55) add(t, tonic + pick([0, 0, 1, 7, -5 + 12]), 0.42, bar * 1.8);
        if (R() < 0.4) {
          const m = tonic + 24 + scale[Math.floor(R() * scale.length)] + (R() < 0.3 ? 12 : 0), at = t + bar * (0.25 + R() * 0.5);
          for (let k = 0; k < 3; k++) add(at + k * bar * 0.19, m, 0.3 * Math.pow(0.5, k), bar * 0.5);
        }
        if (R() < 0.12) add(t + bar * 0.5, tonic + 6, 0.2, bar);
        t += bar;
      }
      return { events: ev.sort((a, b) => a.t - b.t), length: t + bar * 2, mood, mode: 'locrian', bpm: Math.round(bpm) };
    }
    if (mood === 'sift') {
      // the Sift: a slow music-box tune, falling a step at a time, each phrase echoing back fainter
      const scale = pick([[0, 2, 3, 5, 7, 9, 10], [0, 2, 4, 7, 9, 11, 12]]), tonic = 60 + Math.floor(R() * 5), bpm = 44 + R() * 8, beat = 60 / bpm;
      const deg = (d) => tonic + scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
      for (let ph = 0; ph < 5; ph++) {
        const top = 7 + Math.floor(R() * 4), len = 4 + Math.floor(R() * 3);
        for (let k = 0; k < len; k++) for (let echo = 0; echo < 2; echo++) add(t + k * beat + echo * beat * 0.75, deg(top - k) + (echo ? 12 : 0), (0.36 - k * 0.03) * (echo ? 0.35 : 1), beat * 2);
        add(t, deg(0) - 12, 0.26, beat * len * 1.2);
        if (R() < 0.6) add(t + beat * len * 0.5, deg(4) - 12, 0.2, beat * len);
        t += beat * (len + 3 + Math.floor(R() * 3));
      }
      add(t, deg(0) - 12, 0.28, beat * 6); add(t + 0.15, deg(2), 0.2, beat * 6); add(t + 0.3, deg(4), 0.18, beat * 6);
      return { events: ev.sort((a, b) => a.t - b.t), length: t + beat * 8, mood, mode: 'sift', bpm: Math.round(bpm) };
    }
    const scale = pick([[0, 2, 4, 6, 7, 9, 11], [0, 2, 3, 5, 7, 9, 10]]), tonic = 55 + Math.floor(R() * 6), bpm = 50 + R() * 8, beat = 60 / bpm, bar = beat * 4;
    const deg = (d) => tonic + scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    const roots = pick([[0, 3, 4, 0], [0, 5, 3, 4], [0, 1, 3, 0]]);
    for (let ph = 0; ph < 3; ph++) for (const d of roots) {
      add(t, deg(d) - 12, 0.3, bar * 1.4);
      // drops: three notes falling, then a pause
      const top = d + 9 + Math.floor(R() * 3);
      for (let k = 0; k < 3; k++) add(t + beat * (1 + k * 0.5), deg(top - k * 2), 0.28 - k * 0.05, beat * 2);
      if (R() < 0.5) add(t + beat * 3, deg(d + 4), 0.22, beat * 1.5);
      t += bar;
    }
    add(t, deg(0) - 12, 0.3, bar * 2); add(t + 0.1, deg(4), 0.24, bar * 2); add(t + 0.2, deg(7), 0.22, bar * 2);
    return { events: ev.sort((a, b) => a.t - b.t), length: t + bar * 3, mood, mode: 'cave', bpm: Math.round(bpm) };
  }
  makeMotif(meter, R) {
    const rhythms = meter === 3
      ? [[1, 1, 1], [2, 1], [1.5, 0.5, 1], [1, 2], [0.5, 0.5, 2]]
      : [[1, 1, 2], [1.5, 0.5, 2], [2, 1, 1], [0.5, 0.5, 1, 2], [1, 3], [2, 2], [1, 1, 1, 1]];
    const rh = rhythms[Math.floor(R() * rhythms.length)];
    let step = Math.floor(R() * 3) * 2 - 2, at = 0;
    const out = [];
    for (let i = 0; i < rh.length; i++) {
      if (i > 0 && R() < 0.15) out.push({ rest: true, at, len: rh[i] });
      else out.push({ step, at, len: rh[i], strong: at % 2 === 0 });
      at += rh[i];
      step += Math.floor(R() * 5) - 2;
      if (step > 6) step -= 2; if (step < -3) step += 2;
    }
    return out;
  }

  // ------------------------------------------------------------ playback
  start(mood) {
    if (!this.ctx) return;
    this.stop(0.5);
    this.mood = mood || this.chooseMood();
    const piece = this.compose(this.mood);
    this.events = piece.events; this.ei = 0;
    const uniq = [...new Set(this.events.map((e) => e.m))].filter((m) => !this.notes.has(m));
    this.renderQueue = uniq;
    this.pieceStart = this.ctx.currentTime + 1.5;
    this.pieceEnd = this.pieceStart + piece.length;
    this.playing = true;
  }
  stop(fade) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const s of this.sources) {
      try { s.g.gain.cancelScheduledValues(now); s.g.gain.setTargetAtTime(0, now, (fade || 0.3) / 3); s.src.stop(now + (fade || 0.3) + 0.1); } catch (e) { /* already stopped */ }
    }
    this.sources = [];
    this.events = []; this.ei = 0;
    this.playing = false;
  }
  playNow() {
    if (this.game.audio) this.game.audio.unlock();
    if (!this.ctx) return;
    this.start();
  }
  scheduleNext(menu) {
    this.nextStart = performance.now() + (menu ? 15000 + Math.random() * 25000 : 180000 + Math.random() * 300000);
  }
  update() {
    if (!this.ctx) return;
    const vol = this.game.settings.music;
    if (vol <= 0) { if (this.playing) this.stop(1); return; }
    const menu = !this.game.world || this.game.world.menu;
    // switching between the title screen and a world changes the mood soon
    if (this.playing && (this.mood === 'menu') !== menu && this.ctx.currentTime - this.pieceStart > 2) { this.stop(3); this.scheduleNext(true); this.nextStart = performance.now() + (menu ? 3000 : 25000); }
    // the Starwyrm's fight has its own music, which starts as soon as it does
    const fight = !menu && typeof Wyrm !== 'undefined' && Wyrm.fighting();
    if (this.playing && (this.mood === 'wyrm') !== fight && this.ctx.currentTime - this.pieceStart > 2) { this.stop(fight ? 2 : 6); this.scheduleNext(false); this.nextStart = performance.now() + (fight ? 1500 : 20000); }
    if (!this.playing && fight && this.nextStart > performance.now() + 2000) this.nextStart = performance.now() + 2000;
    if (!this.playing) { if (performance.now() >= this.nextStart && this.ctx.state === 'running') this.start(); return; }
    // render a few note buffers ahead of time
    const t0 = performance.now();
    while (this.renderQueue.length) this.prefetch(this.renderQueue.shift());
    void t0;
    const now = this.ctx.currentTime;
    while (this.ei < this.events.length && this.pieceStart + this.events[this.ei].t < now + 1.2) {
      const e = this.events[this.ei];
      // wait for a note still rendering in the background, unless it is due right now
      if (!this.notes.has(e.m) && this.pending.has(e.m) && this.pieceStart + e.t > now + 0.15) break;
      this.ei++;
      const when = Math.max(now + 0.01, this.pieceStart + e.t);
      this.playNote(e, when);
    }
    this.sources = this.sources.filter((s) => s.end > now);
    if (this.ei >= this.events.length && now > this.pieceEnd) { this.playing = false; this.scheduleNext(menu); }
  }
  playNote(e, when) {
    const ctx = this.ctx;
    const buf = this.note(e.m);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain();
    const v = e.v * 0.55;
    g.gain.setValueAtTime(v, when);
    const rel = when + Math.min(e.d, buf.duration);
    g.gain.setValueAtTime(v, rel);
    g.gain.setTargetAtTime(0, rel, 0.18);
    let node = g;
    src.connect(g);
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp((e.m - 64) / 40, -0.6, 0.6); g.connect(p); node = p; }
    node.connect(this.bus);
    src.start(when);
    const end = Math.min(when + buf.duration, rel + 1.2);
    src.stop(end);
    this.sources.push({ src, g, end });
  }
}
