'use strict';
// ---------------------------------------------------------------------------
// GLSL sources
// ---------------------------------------------------------------------------
const SHADERS = {
  chunkVS: `#version 300 es
precision highp float; precision highp int;
layout(location=0) in uvec3 a;
uniform mat4 uVP;
uniform vec3 uOrigin;
out vec3 vUV; out vec4 vCol; out vec2 vLight; out float vDist;
void main() {
  vec3 p = (vec3(float(a.x & 511u), float((a.x >> 18) & 16383u), float((a.x >> 9) & 511u)) - 32.0) * 0.0625 + uOrigin;
  // shade codes 252-254 mark decals (wire on the ground): nudged toward the camera so they never z-fight
  uint shb = (a.z >> 24) & 255u;
  float sh = float(shb) / 255.0;
  if (shb >= 252u && shb <= 254u) { p *= 0.9985; sh = shb == 254u ? 1.0 : (shb == 253u ? 0.8 : 0.6); }
  gl_Position = uVP * vec4(p, 1.0);
  vUV = vec3(float(a.y & 31u) * 0.0625, float((a.y >> 5) & 31u) * 0.0625, float((a.y >> 10) & 1023u));
  vLight = vec2(float((a.y >> 20) & 63u), float((a.y >> 26) & 63u)) / 60.0;
  vCol = vec4(vec3(float(a.z & 255u), float((a.z >> 8) & 255u), float((a.z >> 16) & 255u)) / 255.0, sh);
  vDist = length(p.xz);
}`,
  chunkFS: `#version 300 es
precision highp float; precision highp sampler2DArray;
uniform sampler2DArray uTex; uniform sampler2D uLightmap;
uniform vec3 uFogColor; uniform vec2 uFog; uniform float uAlphaTest; uniform float uAlpha;
in vec3 vUV; in vec4 vCol; in vec2 vLight; in float vDist;
out vec4 o;
void main() {
  vec4 t = texture(uTex, vUV);
  if (t.a < uAlphaTest) discard;
  vec3 lm = texture(uLightmap, vec2(vLight.y * 0.9375 + 0.03125, vLight.x * 0.9375 + 0.03125)).rgb;
  vec3 c = t.rgb * vCol.rgb * vCol.a * lm;
  float fog = clamp((vDist - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  o = vec4(mix(c, uFogColor, fog), (uAlphaTest > 0.0 && uAlpha >= 1.0) ? 1.0 : t.a * uAlpha);
}`,
  // full screen sky
  skyVS: `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vNdc;
void main() { vNdc = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }`,
  skyFS: `#version 300 es
precision highp float;
uniform mat4 uInvVP; uniform vec3 uSky; uniform vec3 uFogColor; uniform vec3 uSunDir; uniform vec4 uSunrise; uniform vec3 uVoid; uniform float uIsles;
uniform mat3 uCel; uniform float uNight; uniform float uTime; uniform float uAurora;
in vec2 vNdc; out vec4 o;
// the Milky Way's plane and its bright heart, in the stars' own frame (match buildStars)
const vec3 MW_N = vec3(0.5009, 0.3506, 0.7913);
const vec3 MW_C = vec3(0.5734, -0.8193, 0.0);
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
void main() {
  vec4 p = uInvVP * vec4(vNdc, 1.0, 1.0);
  vec3 d = normalize(p.xyz / p.w);
  float e = d.y;
  vec3 col = mix(uFogColor, uSky, smoothstep(0.02, 0.42, e));
  if (uIsles > 0.0) {
    // the Far Isles: a faint river of starlight across the void, violet and teal
    float n = vn(d * 5.0) * 0.55 + vn(d * 11.0) * 0.3 + vn(d * 23.0) * 0.15;
    float band = exp(-pow(dot(d, normalize(vec3(0.42, 0.3, 0.86))) / 0.26, 2.0));
    col += vec3(0.14, 0.06, 0.2) * band * smoothstep(0.25, 0.85, n) * 1.4;
    col += vec3(0.02, 0.1, 0.11) * pow(band, 3.0) * smoothstep(0.45, 0.9, n);
    col = mix(col, uFogColor, 1.0 - smoothstep(-0.05, 0.3, e));
  }
  // the night sky: the Milky Way turning with the stars, and the northern lights
  if (uNight > 0.004 && e > -0.05) {
    vec3 dc = uCel * d;
    float bd = dot(dc, MW_N), band = exp(-pow(bd / 0.17, 2.0));
    if (band > 0.01) {
      // snapped to a grid of sky texels, so it is as blocky as the rest of the world
      vec3 q = floor(dc * 150.0) / 150.0;
      float clump = vn(q * 7.0) * 0.6 + vn(q * 17.0) * 0.3 + vn(q * 41.0) * 0.1;
      float lane = exp(-pow((bd + (vn(q * 9.0) - 0.5) * 0.03) / 0.03, 2.0)) * smoothstep(0.25, 0.6, vn(q * 13.0 + 3.0));
      float core = exp(-pow(distance(dc, MW_C) / 0.6, 2.0));
      float mw = band * smoothstep(0.3, 0.9, clump) * (1.0 - 0.8 * lane) * (0.5 + 0.9 * core);
      col += mix(vec3(0.52, 0.6, 0.9), vec3(0.95, 0.82, 0.66), core * 0.6) * mw * 0.3 * uNight * smoothstep(-0.02, 0.2, e);
    }
  }
  if (uAurora > 0.004 && e > 0.0 && d.z < 0.3) {
    float az = atan(d.x, -d.z);
    if (abs(az) < 1.5) {
      float azq = floor(az * 140.0) / 140.0, eq = floor(e * 160.0) / 160.0;
      vec3 ac = vec3(0.0);
      for (int k = 0; k < 2; k++) {
        float fk = float(k);
        float base = 0.1 + fk * 0.08 + 0.05 * sin(azq * (2.3 + fk) + uTime * (0.05 + fk * 0.03) + fk * 2.0) + 0.025 * sin(azq * (6.1 + fk * 2.0) - uTime * 0.11);
        float h = eq - base;
        if (h < -0.02) continue;
        // curtains of rays, each drifting and flickering on its own
        float rays = 0.35 + 0.65 * vn(vec3(azq * 36.0 + fk * 10.0, uTime * 0.3, fk * 3.0));
        float fall = exp(-max(h, 0.0) / (0.14 + 0.12 * rays)) * smoothstep(-0.02, 0.015, h);
        float win = smoothstep(1.4, 0.3, abs(az + fk * 0.35 - 0.12 * sin(uTime * 0.02 + fk)));
        ac += mix(vec3(0.2, 1.0, 0.55), vec3(0.72, 0.32, 1.0), clamp(h / 0.34, 0.0, 1.0)) * fall * rays * win * (0.85 - fk * 0.3);
      }
      col += ac * uAurora * 0.6 * smoothstep(0.0, 0.08, e);
    }
  }
  if (e < 0.0) col = mix(uFogColor, uVoid, smoothstep(0.0, -0.25, e));
  if (uSunrise.a > 0.0) {
    vec2 h = normalize(d.xz + vec2(1e-5));
    float s = max(0.0, dot(h, normalize(uSunDir.xz + vec2(1e-5))));
    float g = pow(s, 3.0) * (1.0 - smoothstep(-0.05, 0.55, abs(e - 0.06))) * uSunrise.a;
    col = mix(col, uSunrise.rgb, clamp(g, 0.0, 1.0));
  }
  o = vec4(col, 1.0);
}`,
  // the Sift gate: a window onto the Sift. Layer behind layer of grains falling through grey
  // mist, each layer further back moving less as you move (parallax), worked out per texel of
  // the sheet so it stays as blocky as everything else. Lost things glint gold now and then,
  // and echoes ripple down across the whole gate.
  gateVS: `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aUV;
uniform mat4 uVP;
out vec3 vPos; flat out float vAxis;
void main() { gl_Position = uVP * vec4(aPos, 1.0); vPos = aPos; vAxis = aUV.x; }`,
  gateFS: `#version 300 es
precision highp float;
uniform vec3 uCam; uniform float uTime; uniform vec3 uFogColor; uniform vec2 uFog;
in vec3 vPos; flat in float vAxis; out vec4 o;
float h2(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
void main() {
  // snap to the sheet's texels
  vec3 wp = floor((vPos + uCam) * 16.0) / 16.0 + 1.0 / 32.0;
  vec3 rel = wp - uCam, dir = normalize(rel);
  vec3 n = vAxis < 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  if (dot(dir, n) < 0.0) n = -n;
  float dn = max(dot(dir, n), 0.08);
  vec3 col = vec3(0.05, 0.048, 0.068);
  for (int k = 6; k >= 0; k--) {
    // far layers first; each nearer layer is drawn over them
    float fk = float(k), depth = 0.7 + fk * 1.9;
    vec3 p = wp + dir * (depth / dn);
    vec2 uv = vAxis < 0.5 ? p.xy : p.zy;
    // slow grey clouds drifting down through the deep
    vec2 m = uv * 0.35 + vec2(fk * 3.7, uTime * 0.05);
    vec2 mi = floor(m), mf = fract(m); mf = mf * mf * (3.0 - 2.0 * mf);
    float cloud = mix(mix(h2(mi), h2(mi + vec2(1.0, 0.0)), mf.x), mix(h2(mi + vec2(0.0, 1.0)), h2(mi + vec2(1.0, 1.0)), mf.x), mf.y);
    col = mix(col, vec3(0.19, 0.18, 0.24) * (0.4 + cloud), 0.17);
    // grains falling, a few to each cell of the layer's grid, smaller and dimmer further back
    float sc = 1.1 + fk * 0.55;
    uv.x += sin(uv.y * 0.45 + fk * 1.7 + uTime * 0.1) * 0.2;
    uv.y += uTime * (0.3 + fk * 0.05);
    vec2 g = uv * sc, c = floor(g), f = fract(g);
    float r = h2(c + fk * 17.0);
    if (r < 0.8) continue;
    vec2 at = vec2(0.15) + 0.7 * vec2(h2(c + 3.1 + fk), h2(c + 7.7 + fk));
    vec2 dt = (f - at) * 16.0 / sc;            // in texels of the sheet
    float size = k < 2 ? 1.0 : 0.5, fade = 1.0 / (1.0 + fk * 0.35);
    bool gold = r > 0.985;
    if (abs(dt.x) < size && abs(dt.y) < size) {
      float tw = gold ? 0.6 + 0.4 * sin(uTime * 6.0 + r * 50.0) : 1.0;
      col = mix(col, gold ? vec3(1.0, 0.85, 0.48) * tw : vec3(0.85, 0.83, 0.94) * (0.6 + 0.4 * fract(r * 13.0)), fade);
    } else if (abs(dt.x) < size && dt.y > 0.0 && dt.y < 3.5 * size + 1.0) {
      col = mix(col, gold ? vec3(0.7, 0.55, 0.3) : vec3(0.5, 0.48, 0.58), 0.45 * fade * (1.0 - dt.y / (3.5 * size + 1.0)));
    }
  }
  // an echo, rippling down across the whole gate
  float e = fract((wp.y + uTime * 1.6) / 22.0) * 22.0;
  float wob = sin((vAxis < 0.5 ? wp.x : wp.z) * 0.9) * 0.3;
  col += vec3(0.25, 0.95, 0.9) * (smoothstep(0.12, 0.0, abs(e - 11.0 - wob)) * 0.55 + smoothstep(0.9, 0.0, abs(e - 11.0 - wob)) * 0.1);
  float dist = length(vPos.xz);
  float fog = clamp((dist - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  o = vec4(mix(col, uFogColor, fog), 1.0);
}`,
  // stars that twinkle, and shooting stars (aUV: x how much it twinkles, y how fast, z how bright)
  starVS: `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aUV; layout(location=2) in vec4 aCol;
uniform mat4 uVP; uniform float uTime;
out vec3 vCol;
void main() {
  gl_Position = uVP * vec4(aPos, 1.0);
  float tw = 1.0 - aUV.x * (0.5 + 0.5 * sin(uTime * (1.4 + aUV.y * 4.0) + aCol.a * 40.0)) * (0.6 + 0.4 * sin(uTime * 0.37 + aCol.a * 17.0));
  vCol = aCol.rgb * aUV.z * tw;
}`,
  starFS: `#version 300 es
precision highp float;
uniform vec3 uTint; in vec3 vCol; out vec4 o;
void main() { o = vec4(vCol * uTint, 1.0); }`,
  // textured / coloured geometry with light (entities, particles, items, sun, clouds, outlines)
  entVS: `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aUV; layout(location=2) in vec4 aCol; layout(location=3) in vec2 aLight;
uniform mat4 uVP;
out vec3 vUV; out vec4 vCol; out vec2 vLight; out float vDist;
void main() { gl_Position = uVP * vec4(aPos, 1.0); vUV = aUV; vCol = aCol; vLight = aLight; vDist = length(aPos.xz); }`,
  entFS: `#version 300 es
precision highp float; precision highp sampler2DArray;
uniform sampler2DArray uTex; uniform sampler2D uSkin; uniform sampler2D uLightmap;
uniform int uMode; uniform vec3 uFogColor; uniform vec2 uFog; uniform float uAlphaTest; uniform vec4 uOverlay; uniform vec4 uTint;
in vec3 vUV; in vec4 vCol; in vec2 vLight; in float vDist;
out vec4 o;
void main() {
  vec4 t;
  if (uMode == 0) t = texture(uTex, vUV);
  else if (uMode == 1) t = texture(uSkin, vUV.xy);
  else t = vec4(1.0);
  if (t.a < uAlphaTest) discard;
  vec3 lm = vLight.x < 0.0 ? vec3(1.0) : texture(uLightmap, vec2(vLight.y * 0.9375 + 0.03125, vLight.x * 0.9375 + 0.03125)).rgb;
  vec3 c = t.rgb * vCol.rgb * lm * uTint.rgb;
  if (uMode == 1 && vUV.z > 0.0) c = mix(c, vec3(1.0), vUV.z);
  c = mix(c, uOverlay.rgb, uOverlay.a);
  float fog = clamp((vDist - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  o = vec4(mix(c, uFogColor, fog), t.a * vCol.a * uTint.a);
}`,
};
