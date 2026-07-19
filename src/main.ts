import { resolveConfig } from './config';
import { createContext } from './gl/context';
import { resizeLongEdge } from './gl/fbo';
import { FluidSolver } from './fluid/solver';
import { PointerInput } from './input/pointer';

async function initInk(): Promise<void> {
  const canvas = document.getElementById('ink-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  const cfg = resolveConfig();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = createContext(canvas);
  if (!gl) {
    canvas.style.display = 'none';
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

  function resizeCanvas(): void {
    const dpr = Math.min(window.devicePixelRatio, cfg.maxDevicePixelRatio);
    canvas!.width = Math.floor(window.innerWidth * dpr);
    canvas!.height = Math.floor(window.innerHeight * dpr);
    canvas!.style.width = `${window.innerWidth}px`;
    canvas!.style.height = `${window.innerHeight}px`;
  }

  function rebuildMask(): void {
    solver.rebuildMask();
  }

  function scheduleMaskRebuild(): void {
    window.clearTimeout(maskTimer);
    maskTimer = window.setTimeout(rebuildMask, 120);
  }

  function resizeAll(): void {
    resizeCanvas();
    solver.resize(simLong);
  }

  async function waitFonts(): Promise<void> {
    if ('fonts' in document) {
      await document.fonts.ready;
      await document.fonts.load('400 18px "Instrument Serif"');
    }
    rebuildMask();
  }

  async function warmup(steps: number): Promise<void> {
    for (let i = 0; i < steps; i++) {
      solver.step(cfg.maxDt, pointer);
      if (i % 4 === 0) {
        solver.render();
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
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

  window.addEventListener('resize', () => resizeAll());

  document.querySelector('.ventures')?.addEventListener('toggle', () => {
    requestAnimationFrame(rebuildMask);
  });

  const observer = new MutationObserver(() => scheduleMaskRebuild());
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });

  function stepFrame(now: number): void {
    const dt = Math.min(cfg.maxDt, (now - lastT) / 1000);
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

  function loop(now: number): void {
    if (!running) return;
    stepFrame(now);
    raf = requestAnimationFrame(loop);
  }

  raf = requestAnimationFrame(loop);

  document.addEventListener('visibilitychange', () => {
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void initInk());
} else {
  void initInk();
}
