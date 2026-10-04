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
  vec3 p = (vec3(float(a.x & 511u), float((a.x >> 18) & 4095u), float((a.x >> 9) & 511u)) - 32.0) * 0.0625 + uOrigin;
  // shade codes 252-254 mark decals (wire on the ground): nudged toward the camera so they never z-fight
  uint shb = (a.z >> 24) & 255u;
  float sh = float(shb) / 255.0;
  if (shb >= 252u) { p *= 0.9985; sh = shb == 254u ? 1.0 : (shb == 253u ? 0.8 : 0.6); }
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
uniform mat4 uInvVP; uniform vec3 uSky; uniform vec3 uFogColor; uniform vec3 uSunDir; uniform vec4 uSunrise; uniform vec3 uVoid;
in vec2 vNdc; out vec4 o;
void main() {
  vec4 p = uInvVP * vec4(vNdc, 1.0, 1.0);
  vec3 d = normalize(p.xyz / p.w);
  float e = d.y;
  vec3 col = mix(uFogColor, uSky, smoothstep(0.02, 0.42, e));
  if (e < 0.0) col = mix(uFogColor, uVoid, smoothstep(0.0, -0.25, e));
  if (uSunrise.a > 0.0) {
    vec2 h = normalize(d.xz + vec2(1e-5));
    float s = max(0.0, dot(h, normalize(uSunDir.xz + vec2(1e-5))));
    float g = pow(s, 3.0) * (1.0 - smoothstep(-0.05, 0.55, abs(e - 0.06))) * uSunrise.a;
    col = mix(col, uSunrise.rgb, clamp(g, 0.0, 1.0));
  }
  o = vec4(col, 1.0);
}`,
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
