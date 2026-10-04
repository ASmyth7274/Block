'use strict';
// ---------------------------------------------------------------------------
// Texture array holding every 16x16 tile (blocks, items, particles...).
// Also builds the (block, meta, face) -> layer lookup table used by the mesher.
// ---------------------------------------------------------------------------
class TextureAtlas {
  constructor(gl, opts) {
    this.gl = gl;
    this.mipmaps = !(opts && opts.mipmaps === false);
    this.names = [];
    this.index = Object.create(null);
    this.cutoutLayer = [];
    // layer 0: the classic missing-texture checkerboard
    const missing = new TexGen.Img();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) missing.set(x, y, ((x >> 3) ^ (y >> 3)) ? [0, 0, 0] : [248, 0, 248]);
    TexGen.T.__missing = missing;
    this.add('__missing');
    for (const name in TexGen.T) if (name !== '__missing') this.add(name);
    this.count = this.names.length;
    const maxLayers = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS);
    if (this.count > maxLayers) console.warn('Too many textures for this GPU: ' + this.count + ' > ' + maxLayers);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    const levels = this.mipmaps ? 5 : 1;
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, 16, 16, Math.min(this.count, maxLayers));
    for (let i = 0; i < this.count && i < maxLayers; i++) this.upload(i, TexGen.T[this.names[i]]);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, this.mipmaps ? gl.NEAREST_MIPMAP_LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, levels - 1);
    this.levels = levels;
    this.buildFaceTable();
    this.animTimer = 0;
    this.animNames = Object.keys(TexGen.ANIM);
  }
  add(name) {
    if (this.index[name] !== undefined) return this.index[name];
    const i = this.names.length;
    this.names.push(name);
    this.index[name] = i;
    return i;
  }
  layer(name) {
    const l = this.index[name];
    if (l === undefined) { if (name) console.warn('missing texture', name); return 0; }
    return l;
  }
  has(name) { return this.index[name] !== undefined; }
  // CPU mip chain with alpha-weighted colour averaging
  mipChain(img) {
    const out = [img.d];
    let src = img.d, size = 16;
    let hasHoles = false;
    for (let i = 3; i < src.length; i += 4) if (src[i] < 250) { hasHoles = true; break; }
    while (size > 1) {
      const ns = size >> 1, dst = new Uint8ClampedArray(ns * ns * 4);
      for (let y = 0; y < ns; y++) for (let x = 0; x < ns; x++) {
        let r = 0, g = 0, b = 0, a = 0, wsum = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const si = ((y * 2 + dy) * size + (x * 2 + dx)) * 4;
          const w = src[si + 3] / 255 + 0.001;
          r += src[si] * w; g += src[si + 1] * w; b += src[si + 2] * w; a += src[si + 3]; wsum += w;
        }
        const di = (y * ns + x) * 4;
        dst[di] = r / wsum; dst[di + 1] = g / wsum; dst[di + 2] = b / wsum;
        dst[di + 3] = hasHoles ? Math.min(255, (a / 4) * 1.25) : a / 4;
      }
      out.push(dst); src = dst; size = ns;
    }
    return out;
  }
  upload(layer, img) {
    const gl = this.gl;
    if (!img) return;
    const chain = this.mipmaps ? this.mipChain(img) : [img.d];
    for (let lv = 0; lv < chain.length && lv < (this.mipmaps ? 5 : 1); lv++) {
      const s = 16 >> lv;
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, lv, 0, 0, layer, s, s, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(chain[lv].buffer, chain[lv].byteOffset, s * s * 4));
    }
  }
  // advance liquid / fire animations (called every game tick)
  tickAnimations() {
    this.animTimer++;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    for (const name of this.animNames) {
      const a = TexGen.ANIM[name];
      if (name.startsWith('lava') && (this.animTimer & 1)) continue;
      a.step();
      const img = TexGen.T[name];
      a.render(img);
      this.upload(this.layer(name), img);
    }
  }
  buildFaceTable() {
    // faceTex[((id << 8) | meta) * 6 + face]
    this.faceTex = new Uint16Array(256 * 256 * 6);
    const ft = this.faceTex;
    for (let id = 1; id < 256; id++) {
      const d = BLOCKS[id];
      if (!d || !d.tex) continue;
      const t = d.tex;
      const resolve = (meta, face) => {
        if (typeof t === 'string') return t;
        if (typeof t === 'function') return t(meta, face);
        const fk = ['bottom', 'top', 'north', 'south', 'west', 'east'][face];
        if (t[fk]) return t[fk];
        if (face <= 1) return t.top || t.side || t.all;
        return t.side || t.all || t.top;
      };
      const perMeta = typeof t === 'function';
      for (let m = 0; m < 256; m++) {
        for (let f = 0; f < 6; f++) {
          const name = (perMeta || m === 0) ? resolve(m, f) : null;
          ft[((id << 8) | m) * 6 + f] = name === null ? ft[(id << 8) * 6 + f] : this.layer(name);
        }
        if (!perMeta && m === 0) {
          // copy meta 0 to all metas quickly
          for (let mm = 1; mm < 256; mm++) for (let f = 0; f < 6; f++) ft[((id << 8) | mm) * 6 + f] = ft[(id << 8) * 6 + f];
          break;
        }
      }
    }
    this.L_GRASS_OVERLAY = this.layer('grass_side_overlay');
    this.L_GRASS_SNOW = this.layer('grass_side_snowed');
    this.L_MYC_SIDE = this.layer('mycelium_side');
    this.L_PODZOL_SIDE = this.layer('podzol_side');
    this.L_DESTROY = [];
    for (let i = 0; i < 10; i++) this.L_DESTROY.push(this.layer('destroy_' + i));
  }
  face(id, meta, f) { return this.faceTex[((id << 8) | (meta & 255)) * 6 + f]; }
}
