"use strict";
(() => {
  // src/config.ts
  var CONFIG = {
    simResolutionLongEdge: 320,
    dyeResolutionLongEdge: 512,
    pressureIterations: 30,
    velocityDissipation: 0.993,
    dyeDissipation: 0.9975,
    maxDt: 0.016,
    curlNoiseStrength: 0.48,
    curlNoiseSpeed: 0.045,
    pointerForce: 720,
    pointerDye: 0.028,
    splatRadius: 32e-4,
    ambientDyeAmount: 85e-6,
    edgeEmitterWidth: 0.055,
    maskDilatePx: 10,
    maxDyeDensity: 0.62,
    inkPrimary: [0.11, 0.098, 0.086],
    inkSecondary: [0.38, 0.36, 0.42],
    risoOffset: [24e-4, -16e-4],
    meniscusStrength: 0.28,
    bleedStrength: 0.52,
    grainStrength: 0.018,
    maxDevicePixelRatio: 2,
    maskSelectors: [
      ".head-name",
      ".head-loc",
      ".head-link",
      ".ventures-toggle",
      ".work-name",
      ".work-desc"
    ],
    staticSimSteps: 240,
    warmupSteps: 48,
    perfDegradeMs: 24,
    minSimResolutionLongEdge: 160,
    pointerEnabled: true
  };
  var MOBILE_OVERRIDES = {
    simResolutionLongEdge: 176,
    dyeResolutionLongEdge: 288,
    pressureIterations: 20,
    maxDevicePixelRatio: 1.5,
    pointerEnabled: false,
    curlNoiseStrength: 0.52,
    ambientDyeAmount: 1e-4,
    warmupSteps: 32,
    staticSimSteps: 140,
    perfDegradeMs: 32,
    minSimResolutionLongEdge: 112,
    meniscusStrength: 0.32
  };
  function isMobileDevice() {
    return window.matchMedia("(hover: none) and (pointer: coarse)").matches || window.matchMedia("(max-width: 768px)").matches;
  }
  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255
    ];
  }
  function resolveConfig() {
    const base = isMobileDevice() ? { ...CONFIG, ...MOBILE_OVERRIDES } : { ...CONFIG };
    const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
    if (ink.startsWith("#")) base.inkPrimary = hexToRgb(ink);
    return base;
  }
  var STAIN_SEEDS = [
    [0.06, 0.94, 0.22, 0.014],
    [0.94, 0.08, 0.18, 0.012],
    [0.88, 0.92, 0.16, 0.011],
    [0.12, 0.18, 0.12, 9e-3],
    [0.72, 0.62, 0.08, 8e-3],
    [0.38, 0.96, 0.1, 7e-3]
  ];

  // src/gl/context.ts
  function createContext(canvas) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true
    });
    if (!gl) return null;
    const ext = gl.getExtension("EXT_color_buffer_float");
    if (!ext) {
      console.warn("EXT_color_buffer_float unavailable");
      return null;
    }
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    return gl;
  }
  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile: ${log}`);
    }
    return shader;
  }
  function createProgram(gl, vs, fs) {
    const prog = gl.createProgram();
    const vsh = compileShader(gl, gl.VERTEX_SHADER, vs);
    const fsh = compileShader(gl, gl.FRAGMENT_SHADER, fs);
    gl.attachShader(prog, vsh);
    gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    gl.deleteShader(vsh);
    gl.deleteShader(fsh);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Program link: ${gl.getProgramInfoLog(prog)}`);
    }
    return prog;
  }
  function createFullscreenQuad(gl) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const positionLoc = 0;
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return { vao, positionLoc };
  }
  function bindQuad(gl, vao) {
    gl.bindVertexArray(vao);
  }
  function createFloatTexture(gl, w, h, internalFormat = gl.RGBA16F, format = gl.RGBA, type = gl.HALF_FLOAT) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }
  function createFBO(gl, tex) {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`FBO incomplete: ${status}`);
    }
    return fbo;
  }
  function createGrainTexture(gl, size = 512) {
    const data = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const n = Math.sin(x * 0.17 + y * 0.11) * 0.5 + Math.sin(x * 0.07 - y * 0.23) * 0.3;
        data[i] = Math.floor((0.5 + n * 0.12 + (Math.random() - 0.5) * 0.08) * 255);
      }
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, size, size, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }
  function blit(gl, program, vao, target, w, h, setup) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, w, h);
    gl.useProgram(program);
    bindQuad(gl, vao);
    setup();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function setTex(gl, program, name, unit, tex) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(program, name), unit);
  }

  // src/gl/fbo.ts
  var DoubleFBO = class {
    constructor(gl, w, h, internalFormat, format, type) {
      this.gl = gl;
      this.width = w;
      this.height = h;
      this.read = createFloatTexture(gl, w, h, internalFormat, format, type);
      this.write = createFloatTexture(gl, w, h, internalFormat, format, type);
      this.fboRead = createFBO(gl, this.read);
      this.fboWrite = createFBO(gl, this.write);
    }
    swap() {
      [this.read, this.write] = [this.write, this.read];
      [this.fboRead, this.fboWrite] = [this.fboWrite, this.fboRead];
    }
    dispose() {
      const { gl } = this;
      gl.deleteTexture(this.read);
      gl.deleteTexture(this.write);
      gl.deleteFramebuffer(this.fboRead);
      gl.deleteFramebuffer(this.fboWrite);
    }
  };
  function resizeLongEdge(current, min = 128) {
    return Math.max(min, current - 32);
  }

  // src/shaders.ts
  var VERT = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
  var ADVECT = `#version 300 es
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
  var DIVERGENCE = `#version 300 es
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
  var PRESSURE = `#version 300 es
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
  var GRADIENT = `#version 300 es
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
  var CURL_FORCE = `#version 300 es
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
  var SPLAT = `#version 300 es
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
  var EDGE_DYE = `#version 300 es
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
  var MASK_DYE = `#version 300 es
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
  var DISPLAY = `#version 300 es
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

  // Ink bleed \u2014 soft risograph spread
  float bleed = dye;
  bleed += texture(u_dye, v_uv + vec2( u_dyeTexel.x, 0.0)).x;
  bleed += texture(u_dye, v_uv + vec2(-u_dyeTexel.x, 0.0)).x;
  bleed += texture(u_dye, v_uv + vec2(0.0,  u_dyeTexel.y)).x;
  bleed += texture(u_dye, v_uv + vec2(0.0, -u_dyeTexel.y)).x;
  bleed += texture(u_dye, v_uv + u_dyeTexel * 1.8).x * 0.5;
  bleed += texture(u_dye, v_uv - u_dyeTexel * 1.8).x * 0.5;
  bleed *= 0.2;
  dye = mix(dye, bleed, u_bleed);

  // Meniscus \u2014 ink pools at text boundaries (the parting read)
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

  // Premultiplied alpha \u2014 multiplies with CSS paper beneath
  float alpha = density;
  fragColor = vec4(col * alpha, alpha);
}
`;
  var CLEAR = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform vec4 u_color;
void main() { fragColor = u_color; }
`;

  // src/mask/textMask.ts
  var BLOCK_MASK_SELECTORS = /* @__PURE__ */ new Set([".ventures-toggle"]);
  function isElementVisible(el, vh) {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const details = el.closest("details");
    if (details && !details.open && !el.closest("summary")) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > window.innerWidth) return false;
    return true;
  }
  function applyTextTransform(text, transform) {
    switch (transform) {
      case "uppercase":
        return text.toUpperCase();
      case "lowercase":
        return text.toLowerCase();
      case "capitalize":
        return text.replace(/\b\w/g, (c) => c.toUpperCase());
      default:
        return text;
    }
  }
  var TextMaskBuilder = class {
    constructor(gl, maskW, maskH, cfg) {
      this.gl = gl;
      this.cfg = cfg;
      this.maskW = 0;
      this.maskH = 0;
      this.maskW = maskW;
      this.maskH = maskH;
      this.canvas = document.createElement("canvas");
      this.canvas.width = maskW;
      this.canvas.height = maskH;
      const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("2D context unavailable");
      this.ctx = ctx;
      this.texture = gl.createTexture();
      this.uploadEmpty();
    }
    resize(maskW, maskH) {
      this.maskW = maskW;
      this.maskH = maskH;
      this.canvas.width = maskW;
      this.canvas.height = maskH;
    }
    rebuild() {
      const ctx = this.ctx;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const sx = this.maskW / vw;
      const sy = this.maskH / vh;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, this.maskW, this.maskH);
      for (const sel of this.cfg.maskSelectors) {
        document.querySelectorAll(sel).forEach((el) => {
          if (!isElementVisible(el, vh)) return;
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          const x = rect.left * sx;
          const y = rect.top * sy;
          const w = rect.width * sx;
          const h = rect.height * sy;
          ctx.fillStyle = "#fff";
          if (BLOCK_MASK_SELECTORS.has(sel)) {
            ctx.fillRect(x, y, w, h);
            return;
          }
          const fontSize = parseFloat(style.fontSize);
          ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          ctx.textBaseline = "top";
          if (style.letterSpacing !== "normal") {
            ctx.letterSpacing = style.letterSpacing;
          } else {
            ctx.letterSpacing = "0px";
          }
          if (style.fontVariantNumeric && style.fontVariantNumeric !== "normal") {
            ctx.fontVariantNumeric = style.fontVariantNumeric;
          }
          const raw = el.textContent?.replace(/\s+/g, " ").trim() ?? "";
          if (!raw) return;
          const text = applyTextTransform(raw, style.textTransform);
          const maxWidth = w;
          const lineHeight = (parseFloat(style.lineHeight) || fontSize * 1.35) * sy;
          this.wrapText(ctx, text, x, y, maxWidth, lineHeight);
        });
      }
      this.dilate();
      this.upload();
    }
    wrapText(ctx, text, x, y, maxWidth, lineHeight) {
      const words = text.split(" ");
      let line = "";
      let cy = y;
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          ctx.fillText(line, x, cy);
          cy += lineHeight;
          line = word;
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, x, cy);
    }
    dilate() {
      const d = this.cfg.maskDilatePx;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const long = Math.max(vw, vh);
      const blurPx = d / long * Math.max(this.maskW, this.maskH);
      const tmp = document.createElement("canvas");
      tmp.width = this.maskW;
      tmp.height = this.maskH;
      const tctx = tmp.getContext("2d");
      tctx.filter = `blur(${blurPx}px)`;
      tctx.drawImage(this.canvas, 0, 0);
      tctx.filter = "none";
      const img = tctx.getImageData(0, 0, this.maskW, this.maskH);
      const data = img.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = data[i] > 48 ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
      this.ctx.putImageData(img, 0, 0);
    }
    uploadEmpty() {
      const { gl } = this;
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, this.maskW, this.maskH, 0, gl.RED, gl.UNSIGNED_BYTE, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    upload() {
      const { gl } = this;
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, this.maskW, this.maskH, 0, gl.RED, gl.UNSIGNED_BYTE, this.canvas);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    getTexture() {
      return this.texture;
    }
    dispose() {
      this.gl.deleteTexture(this.texture);
    }
  };

  // src/fluid/solver.ts
  var FluidSolver = class {
    constructor(gl, simLongEdge, canvas, cfg) {
      this.gl = gl;
      this.canvas = canvas;
      this.cfg = cfg;
      this.simLongEdge = simLongEdge;
      const dyeLong = cfg.dyeResolutionLongEdge;
      const sim = this.sizeFromLong(simLongEdge);
      const dye = this.sizeFromLong(dyeLong);
      this.simW = sim.w;
      this.simH = sim.h;
      this.dyeW = dye.w;
      this.dyeH = dye.h;
      this.velocity = new DoubleFBO(gl, this.simW, this.simH);
      this.dye = new DoubleFBO(gl, this.dyeW, this.dyeH);
      this.pressure = new DoubleFBO(gl, this.simW, this.simH);
      this.divergenceTex = this.createTex(this.simW, this.simH);
      this.divergenceFbo = this.createFbo(this.divergenceTex);
      this.progAdvect = createProgram(gl, VERT, ADVECT);
      this.progDivergence = createProgram(gl, VERT, DIVERGENCE);
      this.progPressure = createProgram(gl, VERT, PRESSURE);
      this.progGradient = createProgram(gl, VERT, GRADIENT);
      this.progCurl = createProgram(gl, VERT, CURL_FORCE);
      this.progSplat = createProgram(gl, VERT, SPLAT);
      this.progEdgeDye = createProgram(gl, VERT, EDGE_DYE);
      this.progMaskDye = createProgram(gl, VERT, MASK_DYE);
      this.progDisplay = createProgram(gl, VERT, DISPLAY);
      this.progClear = createProgram(gl, VERT, CLEAR);
      const quad = createFullscreenQuad(gl);
      this.vao = quad.vao;
      this.grain = createGrainTexture(gl);
      this.mask = new TextMaskBuilder(gl, this.dyeW, this.dyeH, cfg);
      this.clearAll();
    }
    sizeFromLong(longEdge) {
      const aspect = window.innerWidth / window.innerHeight;
      if (aspect >= 1) return { w: Math.round(longEdge * aspect), h: longEdge };
      return { w: longEdge, h: Math.round(longEdge / aspect) };
    }
    createTex(w, h) {
      return createFloatTexture(this.gl, w, h);
    }
    createFbo(tex) {
      return createFBO(this.gl, tex);
    }
    rebuildMask() {
      this.mask.rebuild();
    }
    resize(simLongEdge) {
      this.disposeBuffers();
      this.simLongEdge = simLongEdge;
      const sim = this.sizeFromLong(simLongEdge);
      const dye = this.sizeFromLong(this.cfg.dyeResolutionLongEdge);
      this.simW = sim.w;
      this.simH = sim.h;
      this.dyeW = dye.w;
      this.dyeH = dye.h;
      this.velocity = new DoubleFBO(this.gl, this.simW, this.simH);
      this.dye = new DoubleFBO(this.gl, this.dyeW, this.dyeH);
      this.pressure = new DoubleFBO(this.gl, this.simW, this.simH);
      this.divergenceTex = this.createTex(this.simW, this.simH);
      this.divergenceFbo = this.createFbo(this.divergenceTex);
      this.mask.resize(this.dyeW, this.dyeH);
      this.clearAll();
      this.rebuildMask();
      this.seedLandscape();
    }
    disposeBuffers() {
      this.velocity.dispose();
      this.dye.dispose();
      this.pressure.dispose();
      this.gl.deleteTexture(this.divergenceTex);
      this.gl.deleteFramebuffer(this.divergenceFbo);
    }
    dispose() {
      this.disposeBuffers();
      this.mask.dispose();
      this.gl.deleteTexture(this.grain);
    }
    clearAll() {
      this.clearFBO(this.velocity.fboRead, this.simW, this.simH);
      this.clearFBO(this.velocity.fboWrite, this.simW, this.simH);
      this.clearFBO(this.dye.fboRead, this.dyeW, this.dyeH);
      this.clearFBO(this.dye.fboWrite, this.dyeW, this.dyeH);
      this.clearFBO(this.pressure.fboRead, this.simW, this.simH);
      this.clearFBO(this.pressure.fboWrite, this.simW, this.simH);
      this.clearFBO(this.divergenceFbo, this.simW, this.simH);
    }
    clearFBO(fbo, w, h) {
      blit(this.gl, this.progClear, this.vao, fbo, w, h, () => {
        this.gl.uniform4f(this.gl.getUniformLocation(this.progClear, "u_color"), 0, 0, 0, 0);
      });
    }
    step(dt, pointer) {
      const maskTex = this.mask.getTexture();
      const texel = [1 / this.simW, 1 / this.simH];
      this.advect(this.velocity, this.velocity.read, true, dt, this.cfg.velocityDissipation, this.simW, this.simH, maskTex);
      blit(this.gl, this.progCurl, this.vao, this.velocity.fboWrite, this.simW, this.simH, () => {
        setTex(this.gl, this.progCurl, "u_velocity", 0, this.velocity.read);
        setTex(this.gl, this.progCurl, "u_mask", 1, maskTex);
        this.gl.uniform1f(this.gl.getUniformLocation(this.progCurl, "u_time"), performance.now() * 1e-3);
        this.gl.uniform1f(this.gl.getUniformLocation(this.progCurl, "u_strength"), this.cfg.curlNoiseStrength);
        this.gl.uniform1f(this.gl.getUniformLocation(this.progCurl, "u_speed"), this.cfg.curlNoiseSpeed);
        this.gl.uniform1f(this.gl.getUniformLocation(this.progCurl, "u_dt"), dt);
        this.gl.uniform2fv(this.gl.getUniformLocation(this.progCurl, "u_texel"), texel);
      });
      this.velocity.swap();
      const { dx, dy, moved } = pointer.consumeDelta();
      if (this.cfg.pointerEnabled && moved) {
        this.splat(this.velocity, pointer.x, pointer.y, dx * this.cfg.pointerForce, dy * this.cfg.pointerForce, true, this.simW, this.simH);
        this.splat(this.dye, pointer.x, pointer.y, this.cfg.pointerDye, 0, false, this.dyeW, this.dyeH);
      }
      blit(this.gl, this.progDivergence, this.vao, this.divergenceFbo, this.simW, this.simH, () => {
        setTex(this.gl, this.progDivergence, "u_velocity", 0, this.velocity.read);
        setTex(this.gl, this.progDivergence, "u_mask", 1, maskTex);
        this.gl.uniform2fv(this.gl.getUniformLocation(this.progDivergence, "u_texel"), texel);
      });
      this.clearFBO(this.pressure.fboRead, this.simW, this.simH);
      this.clearFBO(this.pressure.fboWrite, this.simW, this.simH);
      for (let i = 0; i < this.cfg.pressureIterations; i++) {
        blit(this.gl, this.progPressure, this.vao, this.pressure.fboWrite, this.simW, this.simH, () => {
          setTex(this.gl, this.progPressure, "u_pressure", 0, this.pressure.read);
          setTex(this.gl, this.progPressure, "u_divergence", 1, this.divergenceTex);
          setTex(this.gl, this.progPressure, "u_mask", 2, maskTex);
          this.gl.uniform2fv(this.gl.getUniformLocation(this.progPressure, "u_texel"), texel);
        });
        this.pressure.swap();
      }
      blit(this.gl, this.progGradient, this.vao, this.velocity.fboWrite, this.simW, this.simH, () => {
        setTex(this.gl, this.progGradient, "u_velocity", 0, this.velocity.read);
        setTex(this.gl, this.progGradient, "u_pressure", 1, this.pressure.read);
        setTex(this.gl, this.progGradient, "u_mask", 2, maskTex);
        this.gl.uniform2fv(this.gl.getUniformLocation(this.progGradient, "u_texel"), texel);
      });
      this.velocity.swap();
      blit(this.gl, this.progEdgeDye, this.vao, this.dye.fboWrite, this.dyeW, this.dyeH, () => {
        setTex(this.gl, this.progEdgeDye, "u_dye", 0, this.dye.read);
        setTex(this.gl, this.progEdgeDye, "u_mask", 1, maskTex);
        this.gl.uniform1f(this.gl.getUniformLocation(this.progEdgeDye, "u_amount"), this.cfg.ambientDyeAmount);
        this.gl.uniform1f(this.gl.getUniformLocation(this.progEdgeDye, "u_edge"), this.cfg.edgeEmitterWidth);
        this.gl.uniform1f(this.gl.getUniformLocation(this.progEdgeDye, "u_time"), performance.now() * 1e-3);
      });
      this.dye.swap();
      this.advect(this.dye, this.velocity.read, false, dt, this.cfg.dyeDissipation, this.dyeW, this.dyeH, maskTex);
      blit(this.gl, this.progMaskDye, this.vao, this.dye.fboWrite, this.dyeW, this.dyeH, () => {
        setTex(this.gl, this.progMaskDye, "u_dye", 0, this.dye.read);
        setTex(this.gl, this.progMaskDye, "u_mask", 1, maskTex);
      });
      this.dye.swap();
    }
    advect(target, velocityTex, isVector, dt, dissipation, w, h, maskTex) {
      blit(this.gl, this.progAdvect, this.vao, target.fboWrite, w, h, () => {
        setTex(this.gl, this.progAdvect, "u_field", 0, target.read);
        setTex(this.gl, this.progAdvect, "u_velocity", 1, velocityTex);
        setTex(this.gl, this.progAdvect, "u_mask", 2, maskTex);
        this.gl.uniform1f(this.gl.getUniformLocation(this.progAdvect, "u_dissipation"), dissipation);
        this.gl.uniform1f(this.gl.getUniformLocation(this.progAdvect, "u_dt"), dt);
        this.gl.uniform1i(this.gl.getUniformLocation(this.progAdvect, "u_isVector"), isVector ? 1 : 0);
      });
      target.swap();
    }
    /** Seed organic corner stains so the field has composition on load. */
    seedLandscape() {
      for (const [x, y, amount, radius] of STAIN_SEEDS) {
        this.splat(this.dye, x, y, amount, 0, false, this.dyeW, this.dyeH, radius);
        this.splat(this.velocity, x, y, amount * 0.35, amount * 0.25, true, this.simW, this.simH, radius * 2.2);
      }
    }
    splat(target, x, y, addX, addY, isVector, w, h, radius = this.cfg.splatRadius) {
      const maskTex = this.mask.getTexture();
      blit(this.gl, this.progSplat, this.vao, target.fboWrite, w, h, () => {
        setTex(this.gl, this.progSplat, "u_target", 0, target.read);
        setTex(this.gl, this.progSplat, "u_mask", 1, maskTex);
        this.gl.uniform2f(this.gl.getUniformLocation(this.progSplat, "u_point"), x, y);
        this.gl.uniform3f(this.gl.getUniformLocation(this.progSplat, "u_add"), addX, addY, addX);
        this.gl.uniform1f(this.gl.getUniformLocation(this.progSplat, "u_radius"), radius);
        this.gl.uniform1i(this.gl.getUniformLocation(this.progSplat, "u_isVector"), isVector ? 1 : 0);
      });
      target.swap();
    }
    render() {
      const maskTex = this.mask.getTexture();
      const dpr = Math.min(window.devicePixelRatio, this.cfg.maxDevicePixelRatio);
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      const { gl } = this;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.progDisplay);
      bindQuad(gl, this.vao);
      setTex(gl, this.progDisplay, "u_dye", 0, this.dye.read);
      setTex(gl, this.progDisplay, "u_mask", 1, maskTex);
      setTex(gl, this.progDisplay, "u_grain", 2, this.grain);
      const i = this.cfg.inkPrimary;
      const i2 = this.cfg.inkSecondary;
      gl.uniform3f(gl.getUniformLocation(this.progDisplay, "u_ink"), i[0], i[1], i[2]);
      gl.uniform3f(gl.getUniformLocation(this.progDisplay, "u_ink2"), i2[0], i2[1], i2[2]);
      gl.uniform2fv(gl.getUniformLocation(this.progDisplay, "u_riso"), this.cfg.risoOffset);
      gl.uniform2f(gl.getUniformLocation(this.progDisplay, "u_dyeTexel"), 1 / this.dyeW, 1 / this.dyeH);
      gl.uniform1f(gl.getUniformLocation(this.progDisplay, "u_maxDye"), this.cfg.maxDyeDensity);
      gl.uniform1f(gl.getUniformLocation(this.progDisplay, "u_grainStrength"), this.cfg.grainStrength);
      gl.uniform1f(gl.getUniformLocation(this.progDisplay, "u_meniscus"), this.cfg.meniscusStrength);
      gl.uniform1f(gl.getUniformLocation(this.progDisplay, "u_bleed"), this.cfg.bleedStrength);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.BLEND);
    }
  };

  // src/input/pointer.ts
  var PointerInput = class {
    constructor(enabled = true) {
      this.x = 0.5;
      this.y = 0.5;
      this.dx = 0;
      this.dy = 0;
      this.down = false;
      this.moved = false;
      this.lastX = 0;
      this.lastY = 0;
      this.active = false;
      this.enabled = enabled;
      if (!enabled) return;
      const onMove = (clientX, clientY) => {
        const nx = clientX / window.innerWidth;
        const ny = 1 - clientY / window.innerHeight;
        if (this.active) {
          this.dx += nx - this.lastX;
          this.dy += ny - this.lastY;
          this.moved = true;
        }
        this.lastX = nx;
        this.lastY = ny;
        this.x = nx;
        this.y = ny;
        this.active = true;
      };
      window.addEventListener("pointermove", (e) => onMove(e.clientX, e.clientY), { passive: true });
      window.addEventListener("pointerdown", (e) => {
        this.down = true;
        onMove(e.clientX, e.clientY);
      }, { passive: true });
      window.addEventListener("pointerup", () => {
        this.down = false;
      });
      window.addEventListener("pointercancel", () => {
        this.down = false;
      });
    }
    consumeDelta() {
      if (!this.enabled) return { dx: 0, dy: 0, moved: false };
      const out = { dx: this.dx, dy: this.dy, moved: this.moved };
      this.dx = 0;
      this.dy = 0;
      this.moved = false;
      return out;
    }
  };

  // src/main.ts
  async function initInk() {
    const canvas = document.getElementById("ink-canvas");
    if (!canvas) return;
    const cfg = resolveConfig();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = createContext(canvas);
    if (!gl) {
      canvas.style.display = "none";
      return;
    }
    const pointer = new PointerInput(cfg.pointerEnabled);
    let simLong = cfg.simResolutionLongEdge;
    let solver = new FluidSolver(gl, simLong, canvas, cfg);
    let running = !reducedMotion;
    let lastT = performance.now();
    let raf = 0;
    let perfCooldown = 0;
    let maskTimer = 0;
    function resizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio, cfg.maxDevicePixelRatio);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    }
    function rebuildMask() {
      solver.rebuildMask();
    }
    function scheduleMaskRebuild() {
      window.clearTimeout(maskTimer);
      maskTimer = window.setTimeout(rebuildMask, 120);
    }
    function resizeAll() {
      resizeCanvas();
      solver.resize(simLong);
    }
    async function waitFonts() {
      if ("fonts" in document) {
        await document.fonts.ready;
        await document.fonts.load('400 18px "Instrument Serif"');
      }
      rebuildMask();
    }
    async function warmup(steps) {
      for (let i = 0; i < steps; i++) {
        solver.step(cfg.maxDt, pointer);
        if (i % 4 === 0) {
          solver.render();
          await new Promise((r) => requestAnimationFrame(() => r()));
        }
      }
      solver.render();
    }
    resizeCanvas();
    solver.render();
    await waitFonts();
    solver.seedLandscape();
    if (reducedMotion) {
      await warmup(cfg.staticSimSteps);
      return;
    }
    await warmup(cfg.warmupSteps);
    window.addEventListener("resize", () => resizeAll());
    document.querySelector(".ventures")?.addEventListener("toggle", () => {
      requestAnimationFrame(rebuildMask);
    });
    const observer = new MutationObserver(() => scheduleMaskRebuild());
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    function stepFrame(now) {
      const dt = Math.min(cfg.maxDt, (now - lastT) / 1e3);
      lastT = now;
      const frameStart = performance.now();
      solver.step(dt, pointer);
      solver.render();
      const frameMs = performance.now() - frameStart;
      if (frameMs > cfg.perfDegradeMs && perfCooldown <= 0 && simLong > cfg.minSimResolutionLongEdge) {
        simLong = resizeLongEdge(simLong, cfg.minSimResolutionLongEdge);
        solver.resize(simLong);
        perfCooldown = 120;
      }
      if (perfCooldown > 0) perfCooldown--;
    }
    function loop(now) {
      if (!running) return;
      stepFrame(now);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reducedMotion) {
        running = true;
        lastT = performance.now();
        raf = requestAnimationFrame(loop);
      }
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void initInk());
  } else {
    void initInk();
  }
})();
