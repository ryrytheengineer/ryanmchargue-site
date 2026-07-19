import { InkConfig } from '../config';

/** Elements whose full box (not just glyphs) should block ink — e.g. CSS ::after markers. */
const BLOCK_MASK_SELECTORS = new Set(['.ventures-toggle']);

function isElementVisible(el: HTMLElement, vh: number): boolean {
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

  const details = el.closest('details');
  if (details && !details.open && !el.closest('summary')) return false;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > window.innerWidth) return false;

  return true;
}

function applyTextTransform(text: string, transform: string): string {
  switch (transform) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'capitalize':
      return text.replace(/\b\w/g, (c) => c.toUpperCase());
    default:
      return text;
  }
}

export class TextMaskBuilder {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: WebGLTexture;
  private maskW = 0;
  private maskH = 0;

  constructor(
    private gl: WebGL2RenderingContext,
    maskW: number,
    maskH: number,
    private cfg: InkConfig
  ) {
    this.maskW = maskW;
    this.maskH = maskH;
    this.canvas = document.createElement('canvas');
    this.canvas.width = maskW;
    this.canvas.height = maskH;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.texture = gl.createTexture()!;
    this.uploadEmpty();
  }

  resize(maskW: number, maskH: number): void {
    this.maskW = maskW;
    this.maskH = maskH;
    this.canvas.width = maskW;
    this.canvas.height = maskH;
  }

  rebuild(): void {
    const ctx = this.ctx;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const sx = this.maskW / vw;
    const sy = this.maskH / vh;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.maskW, this.maskH);

    for (const sel of this.cfg.maskSelectors) {
      document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        if (!isElementVisible(el, vh)) return;

        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const x = rect.left * sx;
        const y = rect.top * sy;
        const w = rect.width * sx;
        const h = rect.height * sy;

        ctx.fillStyle = '#fff';

        if (BLOCK_MASK_SELECTORS.has(sel)) {
          ctx.fillRect(x, y, w, h);
          return;
        }

        const fontSize = parseFloat(style.fontSize);
        ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        ctx.textBaseline = 'top';

        if (style.letterSpacing !== 'normal') {
          ctx.letterSpacing = style.letterSpacing;
        } else {
          ctx.letterSpacing = '0px';
        }

        if (style.fontVariantNumeric && style.fontVariantNumeric !== 'normal') {
          ctx.fontVariantNumeric = style.fontVariantNumeric as CanvasTextDrawingStyles['fontVariantNumeric'];
        }

        const raw = el.textContent?.replace(/\s+/g, ' ').trim() ?? '';
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

  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ): void {
    const words = text.split(' ');
    let line = '';
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

  private dilate(): void {
    const d = this.cfg.maskDilatePx;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const long = Math.max(vw, vh);
    const blurPx = (d / long) * Math.max(this.maskW, this.maskH);

    const tmp = document.createElement('canvas');
    tmp.width = this.maskW;
    tmp.height = this.maskH;
    const tctx = tmp.getContext('2d')!;
    tctx.filter = `blur(${blurPx}px)`;
    tctx.drawImage(this.canvas, 0, 0);
    tctx.filter = 'none';

    const img = tctx.getImageData(0, 0, this.maskW, this.maskH);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i] > 48 ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
    this.ctx.putImageData(img, 0, 0);
  }

  private uploadEmpty(): void {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, this.maskW, this.maskH, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  private upload(): void {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, this.maskW, this.maskH, 0, gl.RED, gl.UNSIGNED_BYTE, this.canvas);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  getTexture(): WebGLTexture {
    return this.texture;
  }

  dispose(): void {
    this.gl.deleteTexture(this.texture);
  }
}
