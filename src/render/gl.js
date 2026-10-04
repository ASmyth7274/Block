'use strict';
// ---------------------------------------------------------------------------
// Minimal WebGL2 helpers
// ---------------------------------------------------------------------------
const GLU = {
  compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      console.error(log + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'));
      throw new Error('Shader compile failed: ' + log);
    }
    return s;
  },
  program(gl, vs, fs, attribs) {
    const p = gl.createProgram();
    gl.attachShader(p, GLU.compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, GLU.compile(gl, gl.FRAGMENT_SHADER, fs));
    if (attribs) attribs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program link failed: ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  },
};

// A dynamic vertex batch (float attributes) for entities, particles, overlays...
class DynBatch {
  // layout: array of [size, type ('f' | 'ub')] ; floats packed into a Float32Array/DataView
  constructor(gl, layout, maxVerts) {
    this.gl = gl;
    this.layout = layout;
    this.stride = layout.reduce((s, l) => s + (l[1] === 'ub' ? 4 : l[0] * 4), 0);
    this.maxVerts = maxVerts || 65536;
    this.buf = new ArrayBuffer(this.stride * this.maxVerts);
    this.f32 = new Float32Array(this.buf);
    this.u8 = new Uint8Array(this.buf);
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.buf.byteLength, gl.DYNAMIC_DRAW);
    let off = 0;
    layout.forEach((l, i) => {
      gl.enableVertexAttribArray(i);
      if (l[1] === 'ub') { gl.vertexAttribPointer(i, 4, gl.UNSIGNED_BYTE, true, this.stride, off); off += 4; }
      else { gl.vertexAttribPointer(i, l[0], gl.FLOAT, false, this.stride, off); off += l[0] * 4; }
    });
    gl.bindVertexArray(null);
    this.n = 0;
  }
  reset() { this.n = 0; }
  full(k) { return this.n + (k || 1) > this.maxVerts; }
  flush(mode) {
    if (!this.n) return;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.u8, 0, this.n * this.stride);
    gl.drawArrays(mode === undefined ? gl.TRIANGLES : mode, 0, this.n);
    gl.bindVertexArray(null);
    this.n = 0;
  }
}
