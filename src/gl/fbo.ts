import { createFloatTexture, createFBO } from './context';

export class DoubleFBO {
  read: WebGLTexture;
  write: WebGLTexture;
  fboRead: WebGLFramebuffer;
  fboWrite: WebGLFramebuffer;
  width: number;
  height: number;

  constructor(
    private gl: WebGL2RenderingContext,
    w: number,
    h: number,
    internalFormat?: number,
    format?: number,
    type?: number
  ) {
    this.width = w;
    this.height = h;
    this.read = createFloatTexture(gl, w, h, internalFormat, format, type);
    this.write = createFloatTexture(gl, w, h, internalFormat, format, type);
    this.fboRead = createFBO(gl, this.read);
    this.fboWrite = createFBO(gl, this.write);
  }

  swap(): void {
    [this.read, this.write] = [this.write, this.read];
    [this.fboRead, this.fboWrite] = [this.fboWrite, this.fboRead];
  }

  dispose(): void {
    const { gl } = this;
    gl.deleteTexture(this.read);
    gl.deleteTexture(this.write);
    gl.deleteFramebuffer(this.fboRead);
    gl.deleteFramebuffer(this.fboWrite);
  }
}

export function simSize(longEdge: number): { w: number; h: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const aspect = vw / vh;
  if (aspect >= 1) {
    return { w: Math.round(longEdge * aspect), h: longEdge };
  }
  return { w: longEdge, h: Math.round(longEdge / aspect) };
}

export function resizeLongEdge(current: number, min = 128): number {
  return Math.max(min, current - 32);
}
