export const VERT = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const ADVECT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_field;
uniform sampler2D u_velocity;
uniform sampler2D u_mask;
uniform float u_dissipation;
uniform float u_dt;
uniform bool u_isVector;
void main() {
  float m = texture(u_mask, v_uv).r;
  if (m > 0.5) {
    fragColor = u_isVector ? vec4(0.0) : vec4(0.0);
    return;
  }
  vec2 vel = texture(u_velocity, v_uv).xy;
  vec2 coord = v_uv - u_dt * vel;
  coord = clamp(coord, vec2(0.001), vec2(0.999));
  vec4 val = texture(u_field, coord);
  if (u_isVector) {
    fragColor = vec4(val.xy * u_dissipation, 0.0, 1.0);
  } else {
    fragColor = vec4(val.x * u_dissipation, 0.0, 0.0, 1.0);
  }
}
`;

export const DIVERGENCE = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_velocity;
uniform sampler2D u_mask;
uniform vec2 u_texel;
void main() {
  float m = texture(u_mask, v_uv).r;
  if (m > 0.5) { fragColor = vec4(0.0); return; }
  vec2 vL = texture(u_velocity, v_uv - vec2(u_texel.x, 0.0)).xy;
  vec2 vR = texture(u_velocity, v_uv + vec2(u_texel.x, 0.0)).xy;
  vec2 vB = texture(u_velocity, v_uv - vec2(0.0, u_texel.y)).xy;
  vec2 vT = texture(u_velocity, v_uv + vec2(0.0, u_texel.y)).xy;
  float mL = texture(u_mask, v_uv - vec2(u_texel.x, 0.0)).r;
  float mR = texture(u_mask, v_uv + vec2(u_texel.x, 0.0)).r;
  float mB = texture(u_mask, v_uv - vec2(0.0, u_texel.y)).r;
  float mT = texture(u_mask, v_uv + vec2(0.0, u_texel.y)).r;
  if (mL > 0.5) vL = vec2(0.0);
  if (mR > 0.5) vR = vec2(0.0);
  if (mB > 0.5) vB = vec2(0.0);
  if (mT > 0.5) vT = vec2(0.0);
  float div = 0.5 * (vR.x - vL.x + vT.y - vB.y);
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}
`;

export const PRESSURE = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_pressure;
uniform sampler2D u_divergence;
uniform sampler2D u_mask;
uniform vec2 u_texel;
void main() {
  float m = texture(u_mask, v_uv).r;
  if (m > 0.5) { fragColor = vec4(0.0); return; }
  float pC = texture(u_pressure, v_uv).x;
  float mL = texture(u_mask, v_uv - vec2(u_texel.x, 0.0)).r;
  float mR = texture(u_mask, v_uv + vec2(u_texel.x, 0.0)).r;
  float mB = texture(u_mask, v_uv - vec2(0.0, u_texel.y)).r;
  float mT = texture(u_mask, v_uv + vec2(0.0, u_texel.y)).r;
  float pL = mL > 0.5 ? pC : texture(u_pressure, v_uv - vec2(u_texel.x, 0.0)).x;
  float pR = mR > 0.5 ? pC : texture(u_pressure, v_uv + vec2(u_texel.x, 0.0)).x;
  float pB = mB > 0.5 ? pC : texture(u_pressure, v_uv - vec2(0.0, u_texel.y)).x;
  float pT = mT > 0.5 ? pC : texture(u_pressure, v_uv + vec2(0.0, u_texel.y)).x;
  float div = texture(u_divergence, v_uv).x;
  float p = (pL + pR + pB + pT - div) * 0.25;
  fragColor = vec4(p, 0.0, 0.0, 1.0);
}
`;

export const GRADIENT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_velocity;
uniform sampler2D u_pressure;
uniform sampler2D u_mask;
uniform vec2 u_texel;
void main() {
  float m = texture(u_mask, v_uv).r;
  vec2 vel = texture(u_velocity, v_uv).xy;
  if (m > 0.5) { fragColor = vec4(0.0); return; }
  float pL = texture(u_pressure, v_uv - vec2(u_texel.x, 0.0)).x;
  float pR = texture(u_pressure, v_uv + vec2(u_texel.x, 0.0)).x;
  float pB = texture(u_pressure, v_uv - vec2(0.0, u_texel.y)).x;
  float pT = texture(u_pressure, v_uv + vec2(0.0, u_texel.y)).x;
  vel -= vec2(pR - pL, pT - pB) * 0.5;
  fragColor = vec4(vel, 0.0, 1.0);
}
`;

export const CURL_FORCE = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_velocity;
uniform sampler2D u_mask;
uniform float u_time;
uniform float u_strength;
uniform float u_speed;
uniform float u_dt;
uniform vec2 u_texel;
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
void main() {
  float m = texture(u_mask, v_uv).r;
  vec2 vel = texture(u_velocity, v_uv).xy;
  if (m > 0.5) { fragColor = vec4(0.0); return; }
  vec2 p = v_uv * 2.4 + u_time * u_speed * vec2(0.22, 0.14);
  vec2 p2 = v_uv * 7.5 + u_time * u_speed * 0.35 * vec2(-0.15, 0.24);
  float eps = 0.0035;
  float dNdx = (snoise(p + vec2(eps, 0.0)) - snoise(p - vec2(eps, 0.0))) / (2.0 * eps);
  float dNdy = (snoise(p + vec2(0.0, eps)) - snoise(p - vec2(0.0, eps))) / (2.0 * eps);
  float dNdx2 = (snoise(p2 + vec2(eps, 0.0)) - snoise(p2 - vec2(eps, 0.0))) / (2.0 * eps);
  float dNdy2 = (snoise(p2 + vec2(0.0, eps)) - snoise(p2 - vec2(0.0, eps))) / (2.0 * eps);
  vec2 curl = vec2(dNdy, -dNdx) * 0.72 + vec2(dNdy2, -dNdx2) * 0.28;
  vel += curl * u_strength * u_dt * 0.22;
  fragColor = vec4(vel, 0.0, 1.0);
}
`;

export const SPLAT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_target;
uniform sampler2D u_mask;
uniform vec2 u_point;
uniform vec3 u_add;
uniform float u_radius;
uniform bool u_isVector;
void main() {
  if (texture(u_mask, v_uv).r > 0.5) {
    fragColor = texture(u_target, v_uv);
    return;
  }
  vec4 base = texture(u_target, v_uv);
  vec2 d = v_uv - u_point;
  float r = length(d);
  float a = exp(-r * r / u_radius);
  if (u_isVector) {
    fragColor = vec4(base.xy + u_add.xy * a, 0.0, 1.0);
  } else {
    fragColor = vec4(base.x + u_add.x * a, 0.0, 0.0, 1.0);
  }
}
`;

export const EDGE_DYE = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_dye;
uniform sampler2D u_mask;
uniform float u_amount;
uniform float u_edge;
uniform float u_time;
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
void main() {
  if (texture(u_mask, v_uv).r > 0.5) {
    fragColor = vec4(0.0);
    return;
  }
  float d = texture(u_dye, v_uv).x;
  float edge = min(min(v_uv.x, 1.0 - v_uv.x), min(v_uv.y, 1.0 - v_uv.y));
  float emit = smoothstep(u_edge, 0.0, edge);
  float n = snoise(v_uv * 5.5 + u_time * 0.018);
  emit *= 0.55 + 0.45 * (n * 0.5 + 0.5);
  d += u_amount * emit;
  fragColor = vec4(d, 0.0, 0.0, 1.0);
}
`;

export const MASK_DYE = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_dye;
uniform sampler2D u_mask;
void main() {
  float m = texture(u_mask, v_uv).r;
  float d = texture(u_dye, v_uv).x;
  if (m > 0.5) d = 0.0;
  fragColor = vec4(d, 0.0, 0.0, 1.0);
}
`;

export const DISPLAY = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_dye;
uniform sampler2D u_mask;
uniform sampler2D u_grain;
uniform vec3 u_ink;
uniform vec3 u_ink2;
uniform vec2 u_riso;
uniform vec2 u_dyeTexel;
uniform float u_maxDye;
uniform float u_grainStrength;
uniform float u_meniscus;
uniform float u_bleed;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  float m = texture(u_mask, v_uv).r;
  if (m > 0.92) {
    fragColor = vec4(0.0);
    return;
  }

  float dye = texture(u_dye, v_uv).x;
  float dye2 = texture(u_dye, v_uv + u_riso).x;

  // Ink bleed — soft risograph spread
  float bleed = dye;
  bleed += texture(u_dye, v_uv + vec2( u_dyeTexel.x, 0.0)).x;
  bleed += texture(u_dye, v_uv + vec2(-u_dyeTexel.x, 0.0)).x;
  bleed += texture(u_dye, v_uv + vec2(0.0,  u_dyeTexel.y)).x;
  bleed += texture(u_dye, v_uv + vec2(0.0, -u_dyeTexel.y)).x;
  bleed += texture(u_dye, v_uv + u_dyeTexel * 1.8).x * 0.5;
  bleed += texture(u_dye, v_uv - u_dyeTexel * 1.8).x * 0.5;
  bleed *= 0.2;
  dye = mix(dye, bleed, u_bleed);

  // Meniscus — ink pools at text boundaries (the parting read)
  vec2 me = u_dyeTexel * 2.2;
  vec2 mg = vec2(
    texture(u_mask, v_uv + vec2(me.x, 0.0)).r - texture(u_mask, v_uv - vec2(me.x, 0.0)).r,
    texture(u_mask, v_uv + vec2(0.0, me.y)).r - texture(u_mask, v_uv - vec2(0.0, me.y)).r
  );
  float meniscus = length(mg) * u_meniscus * (1.0 - m);
  dye = min(dye + meniscus, u_maxDye);

  dye = min(dye, u_maxDye) * (1.0 - m * 0.97);
  dye2 = min(dye2, u_maxDye * 0.65) * (1.0 - m * 0.97);

  // Irregular plate edge
  float edgeNoise = hash(floor(v_uv * vec2(920.0, 680.0)));
  dye *= 0.9 + 0.1 * edgeNoise;

  vec3 col = mix(u_ink, u_ink2, clamp(dye2 * 0.65, 0.0, 0.45));
  float grain = texture(u_grain, v_uv * 1.8).r;
  float density = clamp(dye * (0.94 + (grain - 0.5) * u_grainStrength), 0.0, 0.82);

  // Premultiplied alpha — multiplies with CSS paper beneath
  float alpha = density;
  fragColor = vec4(col * alpha, alpha);
}
`;

export const CLEAR = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform vec4 u_color;
void main() { fragColor = u_color; }
`;

export const BLIT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_tex;
void main() { fragColor = texture(u_tex, v_uv); }
`;
