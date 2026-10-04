'use strict';
// ---------------------------------------------------------------------------
// NoiseLib: seeded RNG + gradient noise. Written as a self-contained factory
// so the exact same source can be injected into the world-gen Web Worker.
// Do NOT reference any outer variables from inside this function.
// ---------------------------------------------------------------------------
function NoiseLib() {
  function hash32(a) {
    a |= 0;
    a = Math.imul(a ^ (a >>> 16), 0x85ebca6b);
    a = Math.imul(a ^ (a >>> 13), 0xc2b2ae35);
    return (a ^ (a >>> 16)) >>> 0;
  }
  // Combine several integers into one well-mixed 32-bit seed
  function seedHash(seed, a, b, c) {
    let h = hash32(seed ^ 0x9e3779b9);
    h = hash32(h ^ Math.imul(a | 0, 0x27d4eb2d));
    h = hash32(h ^ Math.imul(b | 0, 0x165667b1));
    if (c !== undefined) h = hash32(h ^ Math.imul(c | 0, 0x61c88647));
    return h;
  }

  // sfc32 generator seeded through splitmix32: fast, good quality, deterministic
  class Random {
    constructor(seed) { this.setSeed(seed === undefined ? (Math.random() * 4294967296) >>> 0 : seed); }
    setSeed(seed) {
      let s = seed >>> 0;
      const sm = () => { s = (s + 0x9e3779b9) | 0; let z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35); return (z ^ (z >>> 16)) >>> 0; };
      this.a = sm(); this.b = sm(); this.c = sm(); this.d = sm() | 1;
      for (let i = 0; i < 8; i++) this.nextU32();
      this.haveGauss = false;
    }
    nextU32() {
      let a = this.a, b = this.b, c = this.c, d = this.d;
      const t = (((a + b) | 0) + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      c = (c + t) | 0;
      this.a = a; this.b = b; this.c = c; this.d = d;
      return t >>> 0;
    }
    nextFloat() { return this.nextU32() / 4294967296; }
    nextDouble() { return this.nextFloat(); }
    nextInt(n) { return n <= 1 ? 0 : Math.floor(this.nextFloat() * n); }
    nextRange(lo, hi) { return lo + this.nextInt(hi - lo + 1); }
    nextBool() { return (this.nextU32() & 1) === 1; }
    chance(p) { return this.nextFloat() < p; }
    nextSeed() { return this.nextU32(); }
    nextGaussian() {
      if (this.haveGauss) { this.haveGauss = false; return this.gauss; }
      let v1, v2, s;
      do { v1 = 2 * this.nextFloat() - 1; v2 = 2 * this.nextFloat() - 1; s = v1 * v1 + v2 * v2; } while (s >= 1 || s === 0);
      const m = Math.sqrt(-2 * Math.log(s) / s);
      this.gauss = v2 * m; this.haveGauss = true;
      return v1 * m;
    }
    pick(arr) { return arr[this.nextInt(arr.length)]; }
  }

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function grad3(h, x, y, z) {
    switch (h & 15) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
      case 4: return x + z; case 5: return -x + z; case 6: return x - z; case 7: return -x - z;
      case 8: return y + z; case 9: return -y + z; case 10: return y - z; case 11: return -y - z;
      case 12: return y + x; case 13: return -y + z; case 14: return y - x; default: return -y - z;
    }
  }
  function grad2(h, x, y) {
    switch (h & 7) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
      case 4: return x; case 5: return -x; case 6: return y; default: return -y;
    }
  }

  // Improved Perlin noise with a seeded permutation and random offsets
  class Perlin {
    constructor(rng) {
      const p = new Uint8Array(512);
      for (let i = 0; i < 256; i++) p[i] = i;
      for (let i = 255; i > 0; i--) { const j = rng.nextInt(i + 1); const t = p[i]; p[i] = p[j]; p[j] = t; }
      for (let i = 0; i < 256; i++) p[i + 256] = p[i];
      this.p = p;
      this.ox = rng.nextFloat() * 256; this.oy = rng.nextFloat() * 256; this.oz = rng.nextFloat() * 256;
    }
    noise3(x, y, z) {
      x += this.ox; y += this.oy; z += this.oz;
      const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
      const X = fx & 255, Y = fy & 255, Z = fz & 255;
      x -= fx; y -= fy; z -= fz;
      const u = fade(x), v = fade(y), w = fade(z);
      const p = this.p;
      const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
      const x1 = x - 1, y1 = y - 1, z1 = z - 1;
      const l1 = grad3(p[AA], x, y, z), l2 = grad3(p[BA], x1, y, z);
      const l3 = grad3(p[AB], x, y1, z), l4 = grad3(p[BB], x1, y1, z);
      const l5 = grad3(p[AA + 1], x, y, z1), l6 = grad3(p[BA + 1], x1, y, z1);
      const l7 = grad3(p[AB + 1], x, y1, z1), l8 = grad3(p[BB + 1], x1, y1, z1);
      const a1 = l1 + u * (l2 - l1), a2 = l3 + u * (l4 - l3), a3 = l5 + u * (l6 - l5), a4 = l7 + u * (l8 - l7);
      const b1 = a1 + v * (a2 - a1), b2 = a3 + v * (a4 - a3);
      return b1 + w * (b2 - b1);
    }
    noise2(x, y) {
      x += this.ox; y += this.oz;
      const fx = Math.floor(x), fy = Math.floor(y);
      const X = fx & 255, Y = fy & 255;
      x -= fx; y -= fy;
      const u = fade(x), v = fade(y);
      const p = this.p;
      const A = p[X] + Y, B = p[X + 1] + Y;
      const l1 = grad2(p[A], x, y), l2 = grad2(p[B], x - 1, y);
      const l3 = grad2(p[A + 1], x, y - 1), l4 = grad2(p[B + 1], x - 1, y - 1);
      const a1 = l1 + u * (l2 - l1), a2 = l3 + u * (l4 - l3);
      return a1 + v * (a2 - a1);
    }
  }

  // Fractal sum of Perlin octaves. Output roughly in [-1, 1].
  class Octaves {
    constructor(rng, count, persistence, lacunarity) {
      this.oct = [];
      this.persistence = persistence || 0.5;
      this.lacunarity = lacunarity || 2.0;
      let amp = 1, norm = 0;
      for (let i = 0; i < count; i++) { this.oct.push(new Perlin(rng)); norm += amp; amp *= this.persistence; }
      this.norm = 1 / norm;
    }
    noise3(x, y, z) {
      let s = 0, f = 1, a = 1;
      const o = this.oct, pers = this.persistence, lac = this.lacunarity;
      for (let i = 0; i < o.length; i++) { s += o[i].noise3(x * f, y * f, z * f) * a; f *= lac; a *= pers; }
      return s * this.norm;
    }
    noise2(x, z) {
      let s = 0, f = 1, a = 1;
      const o = this.oct, pers = this.persistence, lac = this.lacunarity;
      for (let i = 0; i < o.length; i++) { s += o[i].noise2(x * f, z * f) * a; f *= lac; a *= pers; }
      return s * this.norm * 1.4;
    }
  }

  return { hash32, seedHash, Random, Perlin, Octaves, fade };
}
const Noise = NoiseLib();
