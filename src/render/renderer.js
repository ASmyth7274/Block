'use strict';
// ---------------------------------------------------------------------------
// World renderer
// ---------------------------------------------------------------------------
const BRIGHTNESS = new Float32Array(16);
for (let i = 0; i < 16; i++) { const f = 1 - i / 15; BRIGHTNESS[i] = (1 - f) / (f * 3 + 1); }
// the Underworld never goes fully black: a dull glow hangs in the air
const BRIGHTNESS_UNDER = BRIGHTNESS.map((v) => v * 0.87 + 0.13);

class Renderer {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    const s = game.settings;
    this.atlas = new TextureAtlas(gl, { mipmaps: s.mipmaps });
    this.mesher = new Mesher(this.atlas);
    this.mesher.fancy = s.graphics !== 'fast';
    this.mesher.smooth = s.smoothLighting;
    this.progChunk = GLU.program(gl, SHADERS.chunkVS, SHADERS.chunkFS);
    this.progSky = GLU.program(gl, SHADERS.skyVS, SHADERS.skyFS);
    this.progEnt = GLU.program(gl, SHADERS.entVS, SHADERS.entFS);
    this.progStars = GLU.program(gl, SHADERS.starVS, SHADERS.starFS);
    this.progGate = GLU.program(gl, SHADERS.gateVS, SHADERS.gateFS);
    this.ibo = null; this.iboQuads = 0;
    this.vaos = new Set();
    this.ensureIndices(65536);
    // full-screen triangle for the sky
    this.skyVAO = gl.createVertexArray();
    gl.bindVertexArray(this.skyVAO);
    const sb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    // lightmap
    this.lightmapData = new Uint8Array(16 * 16 * 4);
    this.lightmap = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.lightmap);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 16, 16, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.lightmapData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // skin atlas (mobs / player), filled by EntityRenderer
    this.skinTex = gl.createTexture();
    // dynamic batches
    this.batch = new DynBatch(gl, [[3, 'f'], [3, 'f'], [4, 'ub'], [2, 'f']], 65536);
    this.cloudBatch = new DynBatch(gl, [[3, 'f'], [3, 'f'], [4, 'ub'], [2, 'f']], 60000);
    this.starBatch = new DynBatch(gl, [[3, 'f'], [3, 'f'], [4, 'ub'], [2, 'f']], 16000);
    this.meteorBatch = new DynBatch(gl, [[3, 'f'], [3, 'f'], [4, 'ub'], [2, 'f']], 3000);
    this.gateBatch = new DynBatch(gl, [[3, 'f'], [3, 'f'], [4, 'ub'], [2, 'f']], 12000);
    this.meteors = []; this.meteorT = 0; this.auroraT = 0; this.nightK = 0; this.aurora = 0;
    this.buildStars();
    this.buildCloudMap();
    this.cloudKey = '';
    this.proj = Mat4.create(); this.view = Mat4.create(); this.vp = Mat4.create(); this.invVP = Mat4.create();
    this.tmpM = Mat4.create(); this.skyVP = Mat4.create();
    this.frustum = new Frustum();
    this.fogColor = [0.7, 0.8, 1]; this.skyColor = [0.5, 0.7, 1];
    this.fogStart = 0; this.fogEnd = 128;
    this.stats = { chunks: 0, drawn: 0, quads: 0, meshed: 0 };
    this.width = 1; this.height = 1;
    this.camX = 0; this.camY = 0; this.camZ = 0;
    this.flicker = 1; this.flickerT = 0;
  }

  ensureIndices(quads) {
    if (quads <= this.iboQuads) return;
    const gl = this.gl;
    const n = Math.max(quads, this.iboQuads * 2, 65536);
    const idx = new Uint32Array(n * 6);
    for (let i = 0, v = 0; i < idx.length; i += 6, v += 4) {
      idx[i] = v; idx[i + 1] = v + 1; idx[i + 2] = v + 2; idx[i + 3] = v; idx[i + 4] = v + 2; idx[i + 5] = v + 3;
    }
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    if (this.ibo) {
      for (const vao of this.vaos) { gl.bindVertexArray(vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); }
      gl.bindVertexArray(null);
      gl.deleteBuffer(this.ibo);
    }
    this.ibo = ibo; this.iboQuads = n;
  }

  resize(w, h) {
    this.width = w; this.height = h;
    this.canvas.width = w; this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  // ------------------------------------------------------------ chunk meshes
  freeChunk(c) {
    const r = c.render;
    if (!r) return;
    const gl = this.gl;
    for (const p of r.passes) if (p) { gl.deleteBuffer(p.vbo); gl.deleteVertexArray(p.vao); this.vaos.delete(p.vao); }
    c.render = null;
  }
  computeTints(world, c) {
    const t = new Uint8Array(256 * 9);
    const nb = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) nb.push(world.getChunk(c.cx + dx, c.cz + dz));
    const bio = (x, z) => {
      const ch = nb[((z < 0 ? 0 : z > 15 ? 2 : 1) * 3) + (x < 0 ? 0 : x > 15 ? 2 : 1)] || c;
      return ch.biomes[((z & 15) << 4) | (x & 15)];
    };
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const acc = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      let n = 0;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const bt = BIOME_TINTS[bio(x + dx, z + dz)] || BIOME_TINTS[2];
        acc[0] += bt.grass[0]; acc[1] += bt.grass[1]; acc[2] += bt.grass[2];
        acc[3] += bt.foliage[0]; acc[4] += bt.foliage[1]; acc[5] += bt.foliage[2];
        acc[6] += bt.water[0]; acc[7] += bt.water[1]; acc[8] += bt.water[2];
        n++;
      }
      const o = ((z << 4) | x) * 9;
      for (let k = 0; k < 9; k++) t[o + k] = acc[k] / n;
    }
    c.tints = t;
  }
  neighborsLoaded(world, c) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && !world.getChunk(c.cx + dx, c.cz + dz)) return false;
    return true;
  }
  updateMeshes(world, budgetMs) {
    const t0 = performance.now();
    const pcx = Math.floor(this.camX) >> 4, pcz = Math.floor(this.camZ) >> 4;
    const rd = this.game.settings.renderDistance;
    const list = [];
    for (const c of world.chunks.values()) {
      if (!c.anyDirty) continue;
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (Math.abs(dx) > rd || Math.abs(dz) > rd) continue;
      if (!this.neighborsLoaded(world, c)) continue;
      list.push([c, dx * dx + dz * dz]);
    }
    list.sort((a, b) => a[1] - b[1]);
    let n = 0;
    for (const [c] of list) {
      if (performance.now() - t0 > budgetMs && n > 0) break;
      this.meshChunk(world, c);
      n++;
    }
    this.stats.meshed = n;
    return n;
  }
  meshChunk(world, c) {
    if (!c.tints) this.computeTints(world, c);
    if (!c.render) c.render = { sect: new Array(CH_SECTIONS).fill(null), passes: [null, null, null], minY: 0, maxY: 0 };
    const r = c.render;
    const touched = [false, false, false];
    for (let sy = 0; sy < CH_SECTIONS; sy++) {
      if (!c.dirty[sy]) continue;
      c.dirty[sy] = 0;
      const old = r.sect[sy];
      const res = this.mesher.build(world, c, sy);
      r.sect[sy] = res;
      for (let p = 0; p < 3; p++) if ((old && old[p]) || (res && res[p])) touched[p] = true;
    }
    c.anyDirty = false;
    let minY = CH_SECTIONS, maxY = -1;
    for (let sy = 0; sy < CH_SECTIONS; sy++) if (r.sect[sy]) { if (sy < minY) minY = sy; if (sy > maxY) maxY = sy; }
    r.minY = minY * 16; r.maxY = (maxY + 1) * 16;
    for (let p = 0; p < 3; p++) if (touched[p]) this.uploadPass(c, p);
  }
  uploadPass(c, p) {
    const gl = this.gl, r = c.render;
    let total = 0;
    for (let sy = 0; sy < CH_SECTIONS; sy++) { const s = r.sect[sy]; if (s && s[p]) total += s[p].length; }
    if (total === 0) {
      if (r.passes[p]) { gl.deleteBuffer(r.passes[p].vbo); gl.deleteVertexArray(r.passes[p].vao); this.vaos.delete(r.passes[p].vao); r.passes[p] = null; }
      return;
    }
    const data = new Uint32Array(total);
    let o = 0;
    for (let sy = 0; sy < CH_SECTIONS; sy++) { const s = r.sect[sy]; if (s && s[p]) { data.set(s[p], o); o += s[p].length; } }
    const quads = total / 12;
    this.ensureIndices(quads);
    let ps = r.passes[p];
    if (!ps) {
      ps = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), quads: 0 };
      gl.bindVertexArray(ps.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, ps.vbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribIPointer(0, 3, gl.UNSIGNED_INT, 12, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bindVertexArray(null);
      this.vaos.add(ps.vao);
      r.passes[p] = ps;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, ps.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    ps.quads = quads;
  }
  setMeshOptions(fancy, smooth) {
    this.mesher.fancy = fancy; this.mesher.smooth = smooth;
    const w = this.game.world;
    if (w) for (const c of w.chunks.values()) c.markAllDirty();
  }

  // ------------------------------------------------------------ sky colours
  computeSky(world, partial, camera) {
    if (world.dim === 2) {
      // the Far Isles: a deep violet void, its haze shifting from isle to gulf
      const b = BIOMES[world.biomeAt(Math.floor(camera.x), Math.floor(camera.z))];
      const want = (b && b.fog) || [0.075, 0.055, 0.12];
      const now = performance.now(), dt = Math.min(1, ((now - (this.fogT || now)) / 1000));
      this.fogT = now;
      if (!this.uFog || this.uFogWorld !== world) { this.uFog = want.slice(); this.uFogWorld = world; }
      for (let i = 0; i < 3; i++) this.uFog[i] += (want[i] - this.uFog[i]) * Math.min(1, dt * 1.5);
      this.fogColor = this.uFog.slice();
      this.skyColor = [this.uFog[0] * 0.45, this.uFog[1] * 0.4, this.uFog[2] * 0.62];
      this.sunrise = null; this.sunDir = [0, 1, 0]; this.dayFactor = 0.4; this.rain = 0;
      this.celestial = ((world.time + partial) % 192000) / 192000;
      return;
    }
    if (world.dim === 3) {
      // the Sift: a pale sky without a sun, its haze shifting from dune to hollow
      const b = BIOMES[world.biomeAt(Math.floor(camera.x), Math.floor(camera.z))];
      const want = (b && b.fog) || [0.44, 0.42, 0.49];
      const now = performance.now(), dt = Math.min(1, ((now - (this.fogT || now)) / 1000));
      this.fogT = now;
      if (!this.uFog || this.uFogWorld !== world) { this.uFog = want.slice(); this.uFogWorld = world; }
      for (let i = 0; i < 3; i++) this.uFog[i] += (want[i] - this.uFog[i]) * Math.min(1, dt * 1.2);
      this.fogColor = this.uFog.slice();
      this.skyColor = [this.uFog[0] * 0.55, this.uFog[1] * 0.53, this.uFog[2] * 0.66];
      this.sunrise = null; this.sunDir = [0.35, 0.32, -0.88]; this.dayFactor = 0.6; this.rain = 0;
      this.celestial = 0; this.nightK = 0; this.aurora = 0;
      return;
    }
    if (world.dim) {
      // no sky below: the air takes the colour of the region's haze
      const b = BIOMES[world.biomeAt(Math.floor(camera.x), Math.floor(camera.z))];
      const want = (b && b.fog) || [0.2, 0.03, 0.03];
      const now = performance.now(), dt = Math.min(1, ((now - (this.fogT || now)) / 1000));
      this.fogT = now;
      if (!this.uFog || this.uFogWorld !== world) { this.uFog = want.slice(); this.uFogWorld = world; }
      for (let i = 0; i < 3; i++) this.uFog[i] += (want[i] - this.uFog[i]) * Math.min(1, dt * 1.5);
      this.skyColor = this.uFog.slice(); this.fogColor = this.uFog.slice();
      this.sunrise = null; this.sunDir = [0, 1, 0]; this.celestial = 0; this.dayFactor = 1; this.rain = 0;
      return;
    }
    const a = world.celestialAngle(partial);
    let day = Math.cos(a * TAU) * 2 + 0.5;
    day = clamp(day, 0, 1);
    const bx = Math.floor(camera.x), bz = Math.floor(camera.z);
    const b = BIOMES[world.biomeAt(bx, bz)] || BIOMES[2];
    // sky hue from temperature (like the classics)
    let t = clamp(b.temp / 3, -1, 1);
    const sky = hsbToRgb(0.6222 - t * 0.05, 0.5 + t * 0.1, 1.0);
    let sr = sky[0] * day, sg = sky[1] * day, sb = sky[2] * day;
    const rain = world.prevRainStrength + (world.rainStrength - world.prevRainStrength) * partial;
    const thunder = world.prevThunderStrength + (world.thunderStrength - world.prevThunderStrength) * partial;
    if (rain > 0) { const g = (sr * 0.3 + sg * 0.59 + sb * 0.11) * 0.6, k = 1 - rain * 0.75; sr = sr * k + g * (1 - k); sg = sg * k + g * (1 - k); sb = sb * k + g * (1 - k); }
    if (thunder > 0) { const g = (sr * 0.3 + sg * 0.59 + sb * 0.11) * 0.2, k = 1 - thunder * 0.75; sr = sr * k + g * (1 - k); sg = sg * k + g * (1 - k); sb = sb * k + g * (1 - k); }
    if (world.lightningFlash > 0) { const f = Math.min(1, world.lightningFlash - partial) * 0.45; sr = sr * (1 - f) + 0.8 * f; sg = sg * (1 - f) + 0.8 * f; sb = sb * (1 - f) + f; }
    // fog colour
    let fr = 0.753 * (day * 0.94 + 0.06), fg = 0.847 * (day * 0.94 + 0.06), fb = 1.0 * (day * 0.91 + 0.09);
    const rdf = Math.max(0, 1 - Math.pow(0.25 + 0.75 * Math.min(32, this.game.settings.renderDistance) / 32, 0.25));
    fr += (sr - fr) * rdf; fg += (sg - fg) * rdf; fb += (sb - fb) * rdf;
    // sunrise / sunset
    const sun = this.sunriseColor(a);
    const sunDir = [-Math.sin(a * TAU), Math.cos(a * TAU), 0];
    if (sun) {
      const look = [-Math.sin(camera.yaw) * Math.cos(camera.pitch), 0, -Math.cos(camera.yaw) * Math.cos(camera.pitch)];
      let d = look[0] * (sunDir[0] > 0 ? 1 : -1);
      d = clamp(d, 0, 1) * sun[3];
      fr += (sun[0] - fr) * d; fg += (sun[1] - fg) * d; fb += (sun[2] - fb) * d;
    }
    if (rain > 0) { const k = 1 - rain * 0.5; fr *= k; fg *= k; fb *= 1 - rain * 0.4; }
    if (thunder > 0) { const k = 1 - thunder * 0.5; fr *= k; fg *= k; fb *= k; }
    this.skyColor = [sr, sg, sb];
    this.fogColor = [fr, fg, fb];
    this.sunrise = sun;
    this.sunDir = sunDir;
    this.celestial = a;
    this.dayFactor = day;
    this.rain = rain;
    // how dark and clear the night is, and whether the northern lights are out: most nights
    // in the cold country, now and then anywhere
    const night = clamp(1 - (Math.cos(a * TAU) * 2 + 0.25), 0, 1);
    this.nightK = night * night * (1 - rain);
    const nightNo = Math.floor((world.dayTime + 12000) / 24000), h = ((Math.imul(nightNo ^ (world.seed | 0), 2654435761) >>> 0) % 1000) / 1000;
    const want = b.temp < 0.3 ? (h < 0.7 ? 0.55 + h * 0.6 : 0.12) : (h < 0.15 ? 0.35 + h * 2 : 0);
    this.auroraT += (want - this.auroraT) * 0.01;
    this.aurora = this.auroraT * this.nightK;
  }
  sunriseColor(a) {
    const c = Math.cos(a * TAU);
    if (c >= -0.4 && c <= 0.4) {
      const f3 = c / 0.4 * 0.5 + 0.5;
      let f4 = 1 - (1 - Math.sin(f3 * Math.PI)) * 0.99;
      f4 *= f4;
      return [f3 * 0.3 + 0.7, f3 * f3 * 0.7 + 0.2, f3 * f3 * 0.0 + 0.2, f4];
    }
    return null;
  }
  updateLightmap(world, partial, extra) {
    const under = world.dim === 1, isles = world.dim === 2, sift = world.dim === 3;
    const sunB = world.menu ? 1 : under ? 0 : isles ? 0.66 : sift ? 0.62 : world.sunBrightness(partial) * 0.95 + 0.05;
    const BR = under || isles || sift ? BRIGHTNESS_UNDER : BRIGHTNESS;
    this.flickerT += (Math.random() - Math.random()) * Math.random() * Math.random() * 0.1;
    this.flickerT *= 0.9;
    this.flicker = 1 + this.flickerT;
    const gamma = this.game.settings.brightness;
    const nv = extra && extra.nightVision ? extra.nightVision : 0;
    const dk = extra && extra.darkness ? extra.darkness : 0;
    const flash = world.lightningFlash > 0 ? 1 : 0;
    const d = this.lightmapData;
    for (let s = 0; s < 16; s++) for (let bl = 0; bl < 16; bl++) {
      const skyL = under ? 0 : BRIGHTNESS[s] * (flash ? 1 : sunB);
      const blkL = BR[bl] * (this.flicker * 0.1 + 1.4);
      let skyR = skyL * (sunB * 0.65 + 0.35), skyG = skyR, skyB = skyL;
      if (isles) { skyR = skyL * 0.9; skyG = skyL * 0.82; skyB = skyL * 1.04; }   // a cold violet twilight
      else if (sift) { skyR = skyL * 0.93; skyG = skyL * 0.91; skyB = skyL * 1.0; }   // grey, with a little lavender
      const bG = blkL * ((blkL * 0.6 + 0.4) * 0.6 + 0.4), bB = blkL * (blkL * blkL * 0.6 + 0.4);
      let r = skyR + blkL, g = skyG + bG, b = skyB + bB;
      r = r * 0.96 + 0.03; g = g * 0.96 + 0.03; b = b * 0.96 + 0.03;
      if (nv > 0) { const m = 1 / Math.max(r, g, b, 0.0001); r = r * (1 - nv) + r * m * nv; g = g * (1 - nv) + g * m * nv; b = b * (1 - nv) + b * m * nv; }
      r = clamp(r, 0, 1); g = clamp(g, 0, 1); b = clamp(b, 0, 1);
      const ig = (v) => { const f = 1 - v; return 1 - f * f * f * f; };
      r = r * (1 - gamma) + ig(r) * gamma; g = g * (1 - gamma) + ig(g) * gamma; b = b * (1 - gamma) + ig(b) * gamma;
      r = r * 0.96 + 0.03; g = g * 0.96 + 0.03; b = b * 0.96 + 0.03;
      if (dk > 0) { const k = 1 - dk * 0.82; r *= k; g *= k; b *= k; }
      const i = (s * 16 + bl) * 4;
      d[i] = clamp(r, 0, 1) * 255; d[i + 1] = clamp(g, 0, 1) * 255; d[i + 2] = clamp(b, 0, 1) * 255; d[i + 3] = 255;
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.lightmap);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, d);
  }

  // ------------------------------------------------------------ stars & clouds
  buildStars() {
    const rng = new Noise.Random(10842), rng2 = new Noise.Random(20931);
    const b = this.starBatch;
    let n = 0;
    // a star: a little square facing the middle; twinkle (how much), rate, brightness, colour
    const star = (x, y, z, size, rot, tw, rate, br, col) => {
      const cx = x * 100, cy = y * 100, cz = z * 100;
      const th = Math.atan2(x, z), sth = Math.sin(th), cth = Math.cos(th);
      const ph = Math.atan2(Math.sqrt(x * x + z * z), y), sph = Math.sin(ph), cph = Math.cos(ph);
      const sr = Math.sin(rot), cr = Math.cos(rot), phase = Math.floor(rng2.nextFloat() * 255);
      const corners = [];
      for (let j = 0; j < 4; j++) {
        const a = ((j & 2) - 1) * size, bb = (((j + 1) & 2) - 1) * size;
        const d1 = a * cr - bb * sr, d2 = bb * cr + a * sr;
        const dy = d1 * sph, dd = -d1 * cph;
        corners.push([cx + dd * sth - d2 * cth, cy + dy, cz + d2 * sth + dd * cth]);
      }
      for (const k of [0, 1, 2, 0, 2, 3]) {
        if (n >= b.maxVerts) return;
        const o = n * 9, p = corners[k];
        b.f32[o] = p[0]; b.f32[o + 1] = p[1]; b.f32[o + 2] = p[2];
        b.f32[o + 3] = tw; b.f32[o + 4] = rate; b.f32[o + 5] = br;
        const c = (o + 6) * 4; b.u8[c] = col[0]; b.u8[c + 1] = col[1]; b.u8[c + 2] = col[2]; b.u8[c + 3] = phase;
        b.f32[o + 7] = -1; b.f32[o + 8] = 0;
        n++;
      }
    };
    const COLS = [[255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255], [200, 220, 255], [200, 220, 255], [255, 235, 195], [255, 190, 150]];
    // the classic field, in the same places as ever
    for (let i = 0; i < 1500; i++) {
      let x = rng.nextFloat() * 2 - 1, y = rng.nextFloat() * 2 - 1, z = rng.nextFloat() * 2 - 1;
      let size = 0.15 + rng.nextFloat() * 0.1;
      let l = x * x + y * y + z * z;
      if (l >= 1 || l < 0.01) continue;
      l = 1 / Math.sqrt(l); x *= l; y *= l; z *= l;
      const rot = rng.nextFloat() * Math.PI * 2;
      const r = rng2.nextFloat(), bright = r < 0.04;
      if (bright) size *= 1.5;
      star(x, y, z, size, rot, rng2.nextFloat() < 0.75 ? 0.25 + rng2.nextFloat() * 0.45 : 0.05, rng2.nextFloat(), bright ? 1.25 : 0.75 + rng2.nextFloat() * 0.3, COLS[Math.floor(rng2.nextFloat() * COLS.length)]);
    }
    // the Milky Way: a crowd of faint little stars along its plane (match MW_N in the sky shader)
    const N = [0.5009, 0.3506, 0.7913], E1 = [0.5734, -0.8193, 0];
    const E2 = [N[1] * E1[2] - N[2] * E1[1], N[2] * E1[0] - N[0] * E1[2], N[0] * E1[1] - N[1] * E1[0]];
    for (let i = 0; i < 1100; i++) {
      const a = rng2.nextFloat() * TAU, g = (rng2.nextFloat() + rng2.nextFloat() + rng2.nextFloat() - 1.5) * 0.14;
      const ca = Math.cos(a), sa = Math.sin(a);
      let x = E1[0] * ca + E2[0] * sa + N[0] * g, y = E1[1] * ca + E2[1] * sa + N[1] * g, z = E1[2] * ca + E2[2] * sa + N[2] * g;
      const l = 1 / Math.sqrt(x * x + y * y + z * z); x *= l; y *= l; z *= l;
      star(x, y, z, 0.07 + rng2.nextFloat() * 0.06, rng2.nextFloat() * TAU, 0.2 + rng2.nextFloat() * 0.4, rng2.nextFloat(), 0.4 + rng2.nextFloat() * 0.35, COLS[Math.floor(rng2.nextFloat() * 8)]);
    }
    b.count = n;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, b.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.u8, 0, n * b.stride);
  }
  buildCloudMap() {
    const rng = new Noise.Random(4211);
    const p = new Noise.Octaves(rng, 4);
    this.clouds = new Uint8Array(256 * 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      // tileable sampling on a torus
      const a = x / 256 * TAU, bb = y / 256 * TAU;
      const v = p.noise3(Math.cos(a) * 4, Math.sin(a) * 4 + Math.cos(bb) * 4, Math.sin(bb) * 4);
      const v2 = p.noise3(Math.cos(a) * 16 + 50, Math.sin(a) * 16, Math.cos(bb) * 16 + Math.sin(bb) * 16);
      this.clouds[y * 256 + x] = v + v2 * 0.25 > 0.12 ? 1 : 0;
    }
  }
  cloudAt(i, j) { return this.clouds[((j & 255) << 8) | (i & 255)]; }
  rebuildClouds(ci, cj, R, fancy) {
    const b = this.cloudBatch;
    b.n = 0;
    const S = 12, Hc = 4;
    const f32 = b.f32, u8 = b.u8;
    const v = (x, y, z, c) => {
      if (b.n >= b.maxVerts) return;
      const o = b.n * 9;
      f32[o] = x; f32[o + 1] = y; f32[o + 2] = z; f32[o + 3] = 0; f32[o + 4] = 0; f32[o + 5] = -1;
      const u = (o + 6) * 4; u8[u] = c; u8[u + 1] = c; u8[u + 2] = c; u8[u + 3] = 204;
      f32[o + 7] = -1; f32[o + 8] = 0;
      b.n++;
    };
    const quad = (p, c) => { v(...p[0], c); v(...p[1], c); v(...p[2], c); v(...p[0], c); v(...p[2], c); v(...p[3], c); };
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
      if (!this.cloudAt(i, j)) continue;
      const x0 = i * S, z0 = j * S, x1 = x0 + S, z1 = z0 + S, y0 = 0, y1 = fancy ? Hc : 0;
      quad([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], 255);
      if (!fancy) continue;
      quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 178);
      if (!this.cloudAt(i, j - 1)) quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 230);
      if (!this.cloudAt(i, j + 1)) quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 230);
      if (!this.cloudAt(i - 1, j)) quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 210);
      if (!this.cloudAt(i + 1, j)) quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 210);
    }
    b.count = b.n;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, b.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.u8, 0, b.n * b.stride);
    b.n = 0;
  }

  // ------------------------------------------------------------ frame
  setupCamera(cam) {
    const w = this.width, h = this.height;
    Mat4.perspective(this.proj, cam.fov * DEG, w / h, 0.05, Math.max(256, this.game.settings.renderDistance * 16 * 1.5 + 64));
    const v = this.view;
    Mat4.identity(v);
    if (cam.roll) Mat4.rotateZ(v, v, cam.roll);
    if (cam.bobPitch) Mat4.rotateX(v, v, cam.bobPitch);
    Mat4.rotateX(v, v, -cam.pitch);
    Mat4.rotateY(v, v, -cam.yaw);
    Mat4.multiply(this.skyVP, this.proj, v);
    if (cam.bobX || cam.bobY) {
      const t = Mat4.create();
      Mat4.translate(t, t, cam.bobX || 0, cam.bobY || 0, 0);
      Mat4.multiply(this.tmpM, t, v);
      Mat4.multiply(this.vp, this.proj, this.tmpM);
    } else Mat4.copy(this.vp, this.skyVP);
    Mat4.invert(this.invVP, this.skyVP);
    this.frustum.setFromMatrix(this.vp);
    this.camX = cam.x; this.camY = cam.y; this.camZ = cam.z;
  }

  render(world, cam, partial, hooks) {
    const gl = this.gl;
    const settings = this.game.settings;
    this.setupCamera(cam);
    this.computeSky(world, partial, cam);
    this.updateLightmap(world, partial, hooks && hooks.lightExtra);
    const rd = settings.renderDistance * 16;
    let fogStart = rd * 0.6, fogEnd = rd;
    if (world.dim === 1) { fogStart = rd * 0.08; fogEnd = Math.min(rd, 192) * 0.62; }   // thick, hot haze
    else if (world.dim === 2) { fogStart = rd * 0.25; fogEnd = rd * 0.92; }             // a thin starlit mist
    else if (world.dim === 3) { fogStart = rd * 0.12; fogEnd = Math.min(rd, 224) * 0.8; }  // the grey haze of the Sift
    let fogColor = this.fogColor;
    const inFluid = hooks && hooks.inFluid;
    if (inFluid === 'water') {
      const b = clamp(this.dayFactor, 0.15, 1);
      fogColor = [0.02 * b, 0.02 * b, 0.2 * b + 0.02];
      fogStart = -8; fogEnd = 22 + (hooks.waterVision || 0) * 40;
    } else if (inFluid === 'lava') {
      fogColor = [0.6, 0.1, 0.0]; fogStart = 0; fogEnd = 2;
    } else if (hooks && hooks.blindFog) { fogStart = 0; fogEnd = hooks.blindFog; fogColor = [0, 0, 0]; }
    if (hooks && hooks.moorMist) { fogStart *= 1 - hooks.moorMist * 0.75; fogEnd *= 1 - hooks.moorMist * 0.45; }
    // darkness: the world closes in, pulsing, to a few blocks of black fog
    if (hooks && hooks.dark > 0 && inFluid !== 'lava') { const k = hooks.dark; fogStart *= 1 - k; fogEnd = fogEnd * (1 - k) + 13 * k; fogColor = [fogColor[0] * (1 - k), fogColor[1] * (1 - k), fogColor[2] * (1 - k)]; }
    if (this.rain > 0) { fogStart *= 1 - this.rain * 0.3; }
    this.fogStart = fogStart; this.fogEnd = fogEnd; this.curFog = fogColor;
    gl.clearColor(fogColor[0], fogColor[1], fogColor[2], 1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);

    // ---- sky ----
    if (inFluid !== 'water' && inFluid !== 'lava' && world.dim !== 1) {
      const isles = world.dim === 2;
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      const ps = this.progSky;
      gl.useProgram(ps.p);
      gl.uniformMatrix4fv(ps.u.uInvVP, false, this.invVP);
      gl.uniform3fv(ps.u.uSky, this.skyColor);
      gl.uniform3fv(ps.u.uFogColor, fogColor);
      gl.uniform3fv(ps.u.uSunDir, this.sunDir);
      gl.uniform4fv(ps.u.uSunrise, this.sunrise || [0, 0, 0, 0]);
      // the dark "void" below the horizon only shows when you are below sea level
      const vk = clamp((SEA_LEVEL + 1 - cam.y) / 16, 0, 1);
      if (isles) gl.uniform3fv(ps.u.uVoid, [0.022, 0.014, 0.045]);
      else if (world.dim === 3) gl.uniform3fv(ps.u.uVoid, [fogColor[0] * 0.6, fogColor[1] * 0.58, fogColor[2] * 0.66]);
      else gl.uniform3fv(ps.u.uVoid, [lerp(fogColor[0], this.skyColor[0] * 0.2 + 0.04, vk), lerp(fogColor[1], this.skyColor[1] * 0.2 + 0.04, vk), lerp(fogColor[2], this.skyColor[2] * 0.6 + 0.1, vk)]);
      gl.uniform1f(ps.u.uIsles, isles ? 1 : 0);
      gl.uniform1f(ps.u.uSift, world.dim === 3 ? 1 : 0);
      const ca = Math.cos(this.celestial * TAU), sa = Math.sin(this.celestial * TAU);
      gl.uniformMatrix3fv(ps.u.uCel, false, [ca, -sa, 0, sa, ca, 0, 0, 0, 1]);
      gl.uniform1f(ps.u.uNight, isles || world.menu ? 0 : this.nightK);
      gl.uniform1f(ps.u.uAurora, isles || world.menu ? 0 : this.aurora);
      gl.uniform1f(ps.u.uTime, (world.time + partial) / 20);
      gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(this.skyVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      this.drawCelestial(world, partial);
      gl.enable(gl.CULL_FACE);
    }

    // ---- terrain ----
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    const pc = this.progChunk;
    gl.useProgram(pc.p);
    gl.uniformMatrix4fv(pc.u.uVP, false, this.vp);
    gl.uniform3fv(pc.u.uFogColor, fogColor);
    gl.uniform2f(pc.u.uFog, fogStart, fogEnd);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.lightmap);
    gl.uniform1i(pc.u.uTex, 0); gl.uniform1i(pc.u.uLightmap, 1);
    gl.uniform1f(pc.u.uAlpha, 1);
    const vis = [];
    const rdc = settings.renderDistance;
    const pcx = Math.floor(cam.x) >> 4, pcz = Math.floor(cam.z) >> 4;
    let quads = 0;
    for (const c of world.chunks.values()) {
      const r = c.render;
      if (!r || r.maxY <= r.minY) continue;
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > (rdc + 0.5) * (rdc + 0.5)) continue;
      const ox = c.cx * 16 - cam.x, oz = c.cz * 16 - cam.z;
      if (!this.frustum.testBox(ox, r.minY - cam.y, oz, ox + 16, r.maxY - cam.y, oz + 16)) continue;
      vis.push([c, dx * dx + dz * dz, ox, oz]);
    }
    vis.sort((a, b) => a[1] - b[1]);
    this.stats.chunks = world.chunks.size; this.stats.drawn = vis.length;
    const drawPass = (p, list) => {
      for (const [c, , ox, oz] of list) {
        const ps = c.render.passes[p];
        if (!ps) continue;
        gl.uniform3f(pc.u.uOrigin, ox, -cam.y, oz);
        gl.bindVertexArray(ps.vao);
        gl.drawElements(gl.TRIANGLES, ps.quads * 6, gl.UNSIGNED_INT, 0);
        quads += ps.quads;
      }
    };
    gl.uniform1f(pc.u.uAlphaTest, -1);
    drawPass(0, vis);
    gl.uniform1f(pc.u.uAlphaTest, 0.5);
    drawPass(1, vis);
    gl.bindVertexArray(null);
    this.drawGates(vis, cam, world, partial, fogColor, fogStart, fogEnd);

    // ---- entities, particles, block overlays ----
    if (hooks && hooks.drawWorldObjects) hooks.drawWorldObjects(this, partial);

    // ---- clouds ----
    if (settings.clouds !== 'off' && !world.menuNoClouds && !world.dim) this.drawClouds(world, cam, partial, fogColor);

    // ---- translucent terrain ----
    gl.useProgram(pc.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.lightmap);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniform1f(pc.u.uAlphaTest, 0.01);
    const back = vis.slice().reverse();
    drawPass(2, back);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    this.stats.quads = quads;

    if (hooks && hooks.drawWeather) hooks.drawWeather(this, partial);
    if (hooks && hooks.drawHand) hooks.drawHand(this, partial);
  }

  // Begin a batch draw with the entity program
  useEnt(vp, mode, alphaTest, fog) {
    const gl = this.gl, pe = this.progEnt;
    gl.useProgram(pe.p);
    gl.uniformMatrix4fv(pe.u.uVP, false, vp || this.vp);
    gl.uniform1i(pe.u.uMode, mode);
    gl.uniform1f(pe.u.uAlphaTest, alphaTest === undefined ? 0.1 : alphaTest);
    gl.uniform3fv(pe.u.uFogColor, this.curFog || this.fogColor);
    if (fog === false) gl.uniform2f(pe.u.uFog, 1e6, 1e6 + 1);
    else gl.uniform2f(pe.u.uFog, this.fogStart, this.fogEnd);
    gl.uniform4f(pe.u.uOverlay, 0, 0, 0, 0);
    gl.uniform4f(pe.u.uTint, 1, 1, 1, 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.skinTex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.lightmap);
    gl.uniform1i(pe.u.uTex, 0); gl.uniform1i(pe.u.uSkin, 1); gl.uniform1i(pe.u.uLightmap, 2);
    return pe;
  }

  drawCelestial(world, partial) {
    const gl = this.gl;
    if (world.dim === 3) return;   // the Sift has no sun, moon or stars: only its glow, in the sky shader
    const a = this.celestial;
    const rainF = 1 - this.rain;
    const m = Mat4.create();
    Mat4.rotateZ(m, m, a * TAU);
    const vp = Mat4.create();
    Mat4.multiply(vp, this.skyVP, m);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    const time = (world.time + partial) / 20;
    if (world.dim === 2) {
      // no sun, no moon: only the stars, turning slowly overhead, and stars falling often
      this.drawStars(vp, [0.85, 0.82, 1], time);
      this.drawMeteors(world, time, 1, [0.85, 0.7, 1], 9);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.BLEND);
      return;
    }
    // stars, twinkling; and now and then one falls (on some nights, a great many)
    let starB = 1 - (Math.cos(a * TAU) * 2 + 0.25);
    starB = clamp(starB, 0, 1);
    starB = starB * starB * 0.5 * rainF;
    if (starB > 0) this.drawStars(vp, [starB, starB, starB], time);
    if (!world.menu) {
      const nightNo = Math.floor((world.dayTime + 12000) / 24000), shower = ((Math.imul(nightNo + 7, 2246822519) ^ (world.seed | 0)) >>> 0) % 9 === 0;
      this.drawMeteors(world, time, starB * 2, [1, 0.97, 0.9], shower ? 2.5 : 24);
    }
    // sun & moon
    const b = this.batch;
    b.reset();
    const sunL = this.atlas.layer('sun'), moonL = this.atlas.layer('moon_' + world.moonPhase());
    const put = (x, y, z, u, v, layer, al) => {
      const o = b.n * 9;
      b.f32[o] = x; b.f32[o + 1] = y; b.f32[o + 2] = z; b.f32[o + 3] = u; b.f32[o + 4] = v; b.f32[o + 5] = layer;
      const c = (o + 6) * 4; b.u8[c] = 255; b.u8[c + 1] = 255; b.u8[c + 2] = 255; b.u8[c + 3] = al;
      b.f32[o + 7] = -1; b.f32[o + 8] = 0; b.n++;
    };
    const sq = (yv, s, layer, al, flip) => {
      const pts = flip ? [[-s, yv, -s, 0, 0], [s, yv, -s, 1, 0], [s, yv, s, 1, 1], [-s, yv, s, 0, 1]] : [[-s, yv, s, 0, 1], [s, yv, s, 1, 1], [s, yv, -s, 1, 0], [-s, yv, -s, 0, 0]];
      for (const k of [0, 1, 2, 0, 2, 3]) put(pts[k][0], pts[k][1], pts[k][2], pts[k][3], pts[k][4], layer, al);
    };
    const al = Math.round(255 * rainF);
    sq(100, 30, sunL, al, false);
    sq(-100, 20, moonL, al, true);
    this.useEnt(vp, 0, 0.01, false);
    gl.disable(gl.CULL_FACE);
    b.flush();
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.BLEND);
  }

  // the Sift gates in view, each block a double-sided sheet through its middle
  drawGates(vis, cam, world, partial, fogColor, fogStart, fogEnd) {
    const b = this.gateBatch;
    b.reset();
    const put = (x, y, z, axis) => {
      if (b.n >= b.maxVerts) return;
      const o = b.n * 9;
      b.f32[o] = x; b.f32[o + 1] = y; b.f32[o + 2] = z; b.f32[o + 3] = axis; b.f32[o + 4] = 0; b.f32[o + 5] = 0;
      b.u8[(o + 6) * 4 + 3] = 255; b.f32[o + 7] = 0; b.f32[o + 8] = 0; b.n++;
    };
    for (const [c, , ox, oz] of vis) {
      for (const s of c.render.sect) {
        if (!s || !s.gates) continue;
        const g = s.gates;
        for (let i = 0; i < g.length; i += 4) {
          const x = ox + g[i], y = g[i + 1] - cam.y, z = oz + g[i + 2], ax = g[i + 3] & 1;
          if (!ax) { put(x, y, z + 0.5, 0); put(x + 1, y, z + 0.5, 0); put(x + 1, y + 1, z + 0.5, 0); put(x, y, z + 0.5, 0); put(x + 1, y + 1, z + 0.5, 0); put(x, y + 1, z + 0.5, 0); }
          else { put(x + 0.5, y, z, 1); put(x + 0.5, y, z + 1, 1); put(x + 0.5, y + 1, z + 1, 1); put(x + 0.5, y, z, 1); put(x + 0.5, y + 1, z + 1, 1); put(x + 0.5, y + 1, z, 1); }
        }
      }
    }
    if (!b.n) return;
    const gl = this.gl, pg = this.progGate;
    gl.useProgram(pg.p);
    gl.uniformMatrix4fv(pg.u.uVP, false, this.vp);
    gl.uniform3f(pg.u.uCam, cam.x, cam.y, cam.z);
    gl.uniform1f(pg.u.uTime, (world.time + partial) / 20);
    gl.uniform3fv(pg.u.uFogColor, fogColor);
    gl.uniform2f(pg.u.uFog, fogStart, fogEnd);
    gl.disable(gl.CULL_FACE);
    b.flush();
    gl.enable(gl.CULL_FACE);
  }
  drawStars(vp, tint, time) {
    const gl = this.gl, ps = this.progStars;
    gl.useProgram(ps.p);
    gl.uniformMatrix4fv(ps.u.uVP, false, vp);
    gl.uniform1f(ps.u.uTime, time);
    gl.uniform3fv(ps.u.uTint, tint);
    gl.bindVertexArray(this.starBatch.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.starBatch.count);
    gl.bindVertexArray(null);
  }
  // shooting stars: a bright head racing along a great circle, its tail fading behind it.
  // `every` is the average number of seconds between them at full dark.
  drawMeteors(world, time, bright, col, every) {
    const dt = clamp(time - (this.meteorT || time), 0, 0.25);
    this.meteorT = time;
    const ms = this.meteors;
    if (bright > 0.05 && dt > 0 && ms.length < 6 && Math.random() < dt / every * bright) {
      const az = Math.random() * TAU, el = (20 + Math.random() * 50) * DEG;
      const s = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
      // a direction of travel along the sky, mostly downward
      let m = [Math.random() - 0.5, -0.35 - Math.random() * 0.6, Math.random() - 0.5];
      const k = m[0] * s[0] + m[1] * s[1] + m[2] * s[2];
      m = [m[0] - s[0] * k, m[1] - s[1] * k, m[2] - s[2] * k];
      const ml = Math.hypot(m[0], m[1], m[2]) || 1;
      ms.push({ s, m: [m[0] / ml, m[1] / ml, m[2] / ml], t: 0, life: 0.45 + Math.random() * 0.7, speed: (22 + Math.random() * 22) * DEG, len: (6 + Math.random() * 10) * DEG, w: 0.3 + Math.random() * 0.2 });
    }
    if (!ms.length) return;
    const b = this.meteorBatch;
    b.reset();
    const put = (p, br) => {
      if (b.n >= b.maxVerts) return;
      const o = b.n * 9;
      b.f32[o] = p[0]; b.f32[o + 1] = p[1]; b.f32[o + 2] = p[2];
      b.f32[o + 3] = 0; b.f32[o + 4] = 0; b.f32[o + 5] = br;
      const c = (o + 6) * 4; b.u8[c] = col[0] * 255; b.u8[c + 1] = col[1] * 255; b.u8[c + 2] = col[2] * 255; b.u8[c + 3] = 0;
      b.f32[o + 7] = -1; b.f32[o + 8] = 0; b.n++;
    };
    for (let i = ms.length - 1; i >= 0; i--) {
      const M = ms[i];
      M.t += dt;
      if (M.t >= M.life) { ms.splice(i, 1); continue; }
      const fade = Math.sin(Math.PI * M.t / M.life) * Math.min(1, bright), head = M.speed * M.t;
      const SEG = 10, pts = [];
      for (let j = 0; j <= SEG; j++) {
        const th = Math.max(0, head - M.len * (j / SEG)), c = Math.cos(th), s = Math.sin(th);
        const p = [M.s[0] * c + M.m[0] * s, M.s[1] * c + M.m[1] * s, M.s[2] * c + M.m[2] * s];
        const tg = [-M.s[0] * s + M.m[0] * c, -M.s[1] * s + M.m[1] * c, -M.s[2] * s + M.m[2] * c];
        const wv = [p[1] * tg[2] - p[2] * tg[1], p[2] * tg[0] - p[0] * tg[2], p[0] * tg[1] - p[1] * tg[0]];
        const wd = M.w * (1 - j / SEG * 0.85);
        pts.push([p[0] * 100 + wv[0] * wd, p[1] * 100 + wv[1] * wd, p[2] * 100 + wv[2] * wd], [p[0] * 100 - wv[0] * wd, p[1] * 100 - wv[1] * wd, p[2] * 100 - wv[2] * wd]);
      }
      for (let j = 0; j < SEG; j++) {
        const b0 = 1.6 * fade * Math.pow(1 - j / SEG, 1.6), b1 = 1.6 * fade * Math.pow(1 - (j + 1) / SEG, 1.6);
        const a0 = pts[j * 2], a1 = pts[j * 2 + 1], c0 = pts[j * 2 + 2], c1 = pts[j * 2 + 3];
        put(a0, b0); put(a1, b0); put(c1, b1); put(a0, b0); put(c1, b1); put(c0, b1);
      }
      // and a bright square at its head
      const hp = pts[0], hq = pts[1], hc = [(hp[0] + hq[0]) / 2, (hp[1] + hq[1]) / 2, (hp[2] + hq[2]) / 2];
      const wv = [(hp[0] - hq[0]) / 2, (hp[1] - hq[1]) / 2, (hp[2] - hq[2]) / 2], tl = Math.hypot(wv[0], wv[1], wv[2]) || 1;
      const up = [hc[1] * wv[2] - hc[2] * wv[1], hc[2] * wv[0] - hc[0] * wv[2], hc[0] * wv[1] - hc[1] * wv[0]], ul = Math.hypot(up[0], up[1], up[2]) || 1;
      const s2 = 1.35, ux = up.map((v) => v / ul * tl * s2), wx = wv.map((v) => v * s2);
      const q = (sx, sy) => [hc[0] + wx[0] * sx + ux[0] * sy, hc[1] + wx[1] * sx + ux[1] * sy, hc[2] + wx[2] * sx + ux[2] * sy];
      const hb = 2 * fade;
      put(q(-1, -1), hb); put(q(1, -1), hb); put(q(1, 1), hb); put(q(-1, -1), hb); put(q(1, 1), hb); put(q(-1, 1), hb);
    }
    const gl = this.gl, ps = this.progStars;
    gl.useProgram(ps.p);
    gl.uniformMatrix4fv(ps.u.uVP, false, this.skyVP);
    gl.uniform1f(ps.u.uTime, time);
    gl.uniform3fv(ps.u.uTint, [1, 1, 1]);
    gl.disable(gl.CULL_FACE);
    b.flush();
  }

  drawClouds(world, cam, partial, fogColor) {
    const gl = this.gl;
    const fancy = this.game.settings.clouds !== 'fast';
    const S = 12, CLOUD_Y = 150;
    const t = (world.time + partial) * 0.03;
    const ox = cam.x + t, oz = cam.z;
    const ci = Math.floor(ox / S), cj = Math.floor(oz / S);
    const R = Math.min(40, Math.ceil(this.game.settings.renderDistance * 16 * 1.4 / S) + 2);
    const key = ci + ',' + cj + ',' + R + ',' + fancy;
    if (key !== this.cloudKey) { this.cloudKey = key; this.rebuildClouds(ci, cj, R, fancy); }
    // model: clouds in cloud space, shifted so that cloud-space origin maps correctly
    const m = Mat4.create();
    Mat4.translate(m, m, -ox, CLOUD_Y - cam.y + 0.33, -oz);
    const vp = Mat4.create();
    Mat4.multiply(vp, this.vp, m);
    const day = this.dayFactor;
    const pe = this.useEnt(vp, 2, -1, true);
    // clouds use their own fog distance
    gl.uniform2f(pe.u.uFog, this.fogEnd * 0.8, this.fogEnd * 1.6);
    const rainK = 1 - this.rain * 0.55;
    const sr = this.sunrise ? this.sunrise[3] * 0.25 : 0;
    gl.uniform4f(pe.u.uTint, (0.88 * day + 0.12) * rainK + sr * 0.2, (0.88 * day + 0.12) * rainK, (0.85 * day + 0.15) * rainK - sr * 0.1, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.cloudBatch.vao);
    if (fancy) {
      gl.colorMask(false, false, false, false);
      gl.drawArrays(gl.TRIANGLES, 0, this.cloudBatch.count);
      gl.colorMask(true, true, true, true);
      gl.depthFunc(gl.LEQUAL);
    }
    gl.drawArrays(gl.TRIANGLES, 0, this.cloudBatch.count);
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.uniform4f(pe.u.uTint, 1, 1, 1, 1);
    void fogColor;
  }
}

function hsbToRgb(h, s, v) {
  h = (h - Math.floor(h)) * 6;
  const i = Math.floor(h), f = h - i;
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  switch (i) {
    case 0: return [v, t, p]; case 1: return [q, v, p]; case 2: return [p, v, t];
    case 3: return [p, q, v]; case 4: return [t, p, v]; default: return [v, p, q];
  }
}
