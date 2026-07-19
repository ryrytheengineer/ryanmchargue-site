import { InkConfig, STAIN_SEEDS } from '../config';
import {
  ADVECT,
  CLEAR,
  CURL_FORCE,
  DISPLAY,
  DIVERGENCE,
  EDGE_DYE,
  GRADIENT,
  MASK_DYE,
  PRESSURE,
  SPLAT,
  VERT,
} from '../shaders';
import {
  bindQuad,
  blit,
  createFloatTexture,
  createFBO,
  createFullscreenQuad,
  createGrainTexture,
  createProgram,
  setTex,
} from '../gl/context';
import { DoubleFBO } from '../gl/fbo';
import { TextMaskBuilder } from '../mask/textMask';
import { PointerInput } from '../input/pointer';

export class FluidSolver {
  private velocity: DoubleFBO;
  private dye: DoubleFBO;
  private pressure: DoubleFBO;
  private divergenceTex: WebGLTexture;
  private divergenceFbo: WebGLFramebuffer;

  private progAdvect: WebGLProgram;
  private progDivergence: WebGLProgram;
  private progPressure: WebGLProgram;
  private progGradient: WebGLProgram;
  private progCurl: WebGLProgram;
  private progSplat: WebGLProgram;
  private progEdgeDye: WebGLProgram;
  private progMaskDye: WebGLProgram;
  private progDisplay: WebGLProgram;
  private progClear: WebGLProgram;

  private vao: WebGLVertexArrayObject;
  private grain: WebGLTexture;
  private mask: TextMaskBuilder;

  simW: number;
  simH: number;
  dyeW: number;
  dyeH: number;
  simLongEdge: number;

  constructor(
    private gl: WebGL2RenderingContext,
    simLongEdge: number,
    private canvas: HTMLCanvasElement,
    private cfg: InkConfig
  ) {
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

  private sizeFromLong(longEdge: number): { w: number; h: number } {
    const aspect = window.innerWidth / window.innerHeight;
    if (aspect >= 1) return { w: Math.round(longEdge * aspect), h: longEdge };
    return { w: longEdge, h: Math.round(longEdge / aspect) };
  }

  private createTex(w: number, h: number): WebGLTexture {
    return createFloatTexture(this.gl, w, h);
  }

  private createFbo(tex: WebGLTexture): WebGLFramebuffer {
    return createFBO(this.gl, tex);
  }

  rebuildMask(): void {
    this.mask.rebuild();
  }

  resize(simLongEdge: number): void {
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

  private disposeBuffers(): void {
    this.velocity.dispose();
    this.dye.dispose();
    this.pressure.dispose();
    this.gl.deleteTexture(this.divergenceTex);
    this.gl.deleteFramebuffer(this.divergenceFbo);
  }

  dispose(): void {
    this.disposeBuffers();
    this.mask.dispose();
    this.gl.deleteTexture(this.grain);
  }

  private clearAll(): void {
    this.clearFBO(this.velocity.fboRead, this.simW, this.simH);
    this.clearFBO(this.velocity.fboWrite, this.simW, this.simH);
    this.clearFBO(this.dye.fboRead, this.dyeW, this.dyeH);
    this.clearFBO(this.dye.fboWrite, this.dyeW, this.dyeH);
    this.clearFBO(this.pressure.fboRead, this.simW, this.simH);
    this.clearFBO(this.pressure.fboWrite, this.simW, this.simH);
    this.clearFBO(this.divergenceFbo, this.simW, this.simH);
  }

  private clearFBO(fbo: WebGLFramebuffer, w: number, h: number): void {
    blit(this.gl, this.progClear, this.vao, fbo, w, h, () => {
      this.gl.uniform4f(this.gl.getUniformLocation(this.progClear, 'u_color'), 0, 0, 0, 0);
    });
  }

  step(dt: number, pointer: PointerInput): void {
    const maskTex = this.mask.getTexture();
    const texel = [1 / this.simW, 1 / this.simH];

    // 1. Advect velocity
    this.advect(this.velocity, this.velocity.read, true, dt, this.cfg.velocityDissipation, this.simW, this.simH, maskTex);

    // 2. Apply forces (curl noise + pointer)
    blit(this.gl, this.progCurl, this.vao, this.velocity.fboWrite, this.simW, this.simH, () => {
      setTex(this.gl, this.progCurl, 'u_velocity', 0, this.velocity.read);
      setTex(this.gl, this.progCurl, 'u_mask', 1, maskTex);
      this.gl.uniform1f(this.gl.getUniformLocation(this.progCurl, 'u_time'), performance.now() * 0.001);
      this.gl.uniform1f(this.gl.getUniformLocation(this.progCurl, 'u_strength'), this.cfg.curlNoiseStrength);
      this.gl.uniform1f(this.gl.getUniformLocation(this.progCurl, 'u_speed'), this.cfg.curlNoiseSpeed);
      this.gl.uniform1f(this.gl.getUniformLocation(this.progCurl, 'u_dt'), dt);
      this.gl.uniform2fv(this.gl.getUniformLocation(this.progCurl, 'u_texel'), texel);
    });
    this.velocity.swap();

    const { dx, dy, moved } = pointer.consumeDelta();
    if (this.cfg.pointerEnabled && moved) {
      this.splat(this.velocity, pointer.x, pointer.y, dx * this.cfg.pointerForce, dy * this.cfg.pointerForce, true, this.simW, this.simH);
      this.splat(this.dye, pointer.x, pointer.y, this.cfg.pointerDye, 0, false, this.dyeW, this.dyeH);
    }

    // 3. Divergence
    blit(this.gl, this.progDivergence, this.vao, this.divergenceFbo, this.simW, this.simH, () => {
      setTex(this.gl, this.progDivergence, 'u_velocity', 0, this.velocity.read);
      setTex(this.gl, this.progDivergence, 'u_mask', 1, maskTex);
      this.gl.uniform2fv(this.gl.getUniformLocation(this.progDivergence, 'u_texel'), texel);
    });

    // Pressure solve
    this.clearFBO(this.pressure.fboRead, this.simW, this.simH);
    this.clearFBO(this.pressure.fboWrite, this.simW, this.simH);
    for (let i = 0; i < this.cfg.pressureIterations; i++) {
      blit(this.gl, this.progPressure, this.vao, this.pressure.fboWrite, this.simW, this.simH, () => {
        setTex(this.gl, this.progPressure, 'u_pressure', 0, this.pressure.read);
        setTex(this.gl, this.progPressure, 'u_divergence', 1, this.divergenceTex);
        setTex(this.gl, this.progPressure, 'u_mask', 2, maskTex);
        this.gl.uniform2fv(this.gl.getUniformLocation(this.progPressure, 'u_texel'), texel);
      });
      this.pressure.swap();
    }

    // Gradient subtract
    blit(this.gl, this.progGradient, this.vao, this.velocity.fboWrite, this.simW, this.simH, () => {
      setTex(this.gl, this.progGradient, 'u_velocity', 0, this.velocity.read);
      setTex(this.gl, this.progGradient, 'u_pressure', 1, this.pressure.read);
      setTex(this.gl, this.progGradient, 'u_mask', 2, maskTex);
      this.gl.uniform2fv(this.gl.getUniformLocation(this.progGradient, 'u_texel'), texel);
    });
    this.velocity.swap();

    // 6. Advect dye + ambient edge emitters
    blit(this.gl, this.progEdgeDye, this.vao, this.dye.fboWrite, this.dyeW, this.dyeH, () => {
      setTex(this.gl, this.progEdgeDye, 'u_dye', 0, this.dye.read);
      setTex(this.gl, this.progEdgeDye, 'u_mask', 1, maskTex);
      this.gl.uniform1f(this.gl.getUniformLocation(this.progEdgeDye, 'u_amount'), this.cfg.ambientDyeAmount);
      this.gl.uniform1f(this.gl.getUniformLocation(this.progEdgeDye, 'u_edge'), this.cfg.edgeEmitterWidth);
      this.gl.uniform1f(this.gl.getUniformLocation(this.progEdgeDye, 'u_time'), performance.now() * 0.001);
    });
    this.dye.swap();

    this.advect(this.dye, this.velocity.read, false, dt, this.cfg.dyeDissipation, this.dyeW, this.dyeH, maskTex);

    // Enforce mask on dye
    blit(this.gl, this.progMaskDye, this.vao, this.dye.fboWrite, this.dyeW, this.dyeH, () => {
      setTex(this.gl, this.progMaskDye, 'u_dye', 0, this.dye.read);
      setTex(this.gl, this.progMaskDye, 'u_mask', 1, maskTex);
    });
    this.dye.swap();
  }

  private advect(
    target: DoubleFBO,
    velocityTex: WebGLTexture,
    isVector: boolean,
    dt: number,
    dissipation: number,
    w: number,
    h: number,
    maskTex: WebGLTexture
  ): void {
    blit(this.gl, this.progAdvect, this.vao, target.fboWrite, w, h, () => {
      setTex(this.gl, this.progAdvect, 'u_field', 0, target.read);
      setTex(this.gl, this.progAdvect, 'u_velocity', 1, velocityTex);
      setTex(this.gl, this.progAdvect, 'u_mask', 2, maskTex);
      this.gl.uniform1f(this.gl.getUniformLocation(this.progAdvect, 'u_dissipation'), dissipation);
      this.gl.uniform1f(this.gl.getUniformLocation(this.progAdvect, 'u_dt'), dt);
      this.gl.uniform1i(this.gl.getUniformLocation(this.progAdvect, 'u_isVector'), isVector ? 1 : 0);
    });
    target.swap();
  }

  /** Seed organic corner stains so the field has composition on load. */
  seedLandscape(): void {
    for (const [x, y, amount, radius] of STAIN_SEEDS) {
      this.splat(this.dye, x, y, amount, 0, false, this.dyeW, this.dyeH, radius);
      this.splat(this.velocity, x, y, amount * 0.35, amount * 0.25, true, this.simW, this.simH, radius * 2.2);
    }
  }

  private splat(
    target: DoubleFBO,
    x: number,
    y: number,
    addX: number,
    addY: number,
    isVector: boolean,
    w: number,
    h: number,
    radius = this.cfg.splatRadius
  ): void {
    const maskTex = this.mask.getTexture();
    blit(this.gl, this.progSplat, this.vao, target.fboWrite, w, h, () => {
      setTex(this.gl, this.progSplat, 'u_target', 0, target.read);
      setTex(this.gl, this.progSplat, 'u_mask', 1, maskTex);
      this.gl.uniform2f(this.gl.getUniformLocation(this.progSplat, 'u_point'), x, y);
      this.gl.uniform3f(this.gl.getUniformLocation(this.progSplat, 'u_add'), addX, addY, addX);
      this.gl.uniform1f(this.gl.getUniformLocation(this.progSplat, 'u_radius'), radius);
      this.gl.uniform1i(this.gl.getUniformLocation(this.progSplat, 'u_isVector'), isVector ? 1 : 0);
    });
    target.swap();
  }

  render(): void {
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

    setTex(gl, this.progDisplay, 'u_dye', 0, this.dye.read);
    setTex(gl, this.progDisplay, 'u_mask', 1, maskTex);
    setTex(gl, this.progDisplay, 'u_grain', 2, this.grain);

    const i = this.cfg.inkPrimary;
    const i2 = this.cfg.inkSecondary;
    gl.uniform3f(gl.getUniformLocation(this.progDisplay, 'u_ink'), i[0], i[1], i[2]);
    gl.uniform3f(gl.getUniformLocation(this.progDisplay, 'u_ink2'), i2[0], i2[1], i2[2]);
    gl.uniform2fv(gl.getUniformLocation(this.progDisplay, 'u_riso'), this.cfg.risoOffset);
    gl.uniform2f(gl.getUniformLocation(this.progDisplay, 'u_dyeTexel'), 1 / this.dyeW, 1 / this.dyeH);
    gl.uniform1f(gl.getUniformLocation(this.progDisplay, 'u_maxDye'), this.cfg.maxDyeDensity);
    gl.uniform1f(gl.getUniformLocation(this.progDisplay, 'u_grainStrength'), this.cfg.grainStrength);
    gl.uniform1f(gl.getUniformLocation(this.progDisplay, 'u_meniscus'), this.cfg.meniscusStrength);
    gl.uniform1f(gl.getUniformLocation(this.progDisplay, 'u_bleed'), this.cfg.bleedStrength);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);
  }
}
