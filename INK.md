# Ambient ink fluid

Full-viewport WebGL2 stable-fluids background for the personal site. Ink drifts slowly, wraps around live DOM text, and stays behind all content.

## Drop-in

Already integrated:

1. `<canvas id="ink-canvas">` sits behind `.content` in `index.html`.
2. Built bundle: `dist/ink.js` (regenerate with `npm run build`).
3. Tune behavior in `src/config.ts`.

Local dev:

```bash
npm install
npm run build
python3 -m http.server 8765
# open http://localhost:8765
```

Watch mode: `npm run watch`

## Config (`src/config.ts`)

| Constant | Effect |
|----------|--------|
| `simResolutionLongEdge` | Sim grid size (↑ quality, ↓ speed) |
| `dyeResolutionLongEdge` | Ink sharpness |
| `curlNoiseStrength` | Ambient drift intensity |
| `curlNoiseSpeed` | How fast the noise field moves |
| `ambientDyeAmount` | Baseline ink from viewport edges |
| `pointerForce` / `pointerDye` | Mouse/touch influence |
| `velocityDissipation` / `dyeDissipation` | How fast motion/ink fades |
| `maxDyeDensity` | Darkest ink on paper |
| `maskDilatePx` | Clear margin around text glyphs |
| `paperColor` / `inkPrimary` / `inkSecondary` | Render palette |
| `maskSelectors` | DOM selectors traced into the obstacle mask |

**More ink:** raise `ambientDyeAmount`, `curlNoiseStrength`, or `maxDyeDensity`.  
**Slower / calmer:** lower `curlNoiseSpeed` and `curlNoiseStrength`.  
**Faster sim (weaker GPU):** lower `simResolutionLongEdge`.

## Modules

- `src/config.ts` — constants
- `src/gl/context.ts` — WebGL2 helpers, FBOs, quad
- `src/gl/fbo.ts` — ping-pong buffers
- `src/shaders.ts` — GLSL passes (advect, pressure, display, …)
- `src/fluid/solver.ts` — simulation step + render
- `src/mask/textMask.ts` — DOM text → dilated obstacle mask
- `src/input/pointer.ts` — window pointer capture
- `src/main.ts` — init, loop, resize, a11y

## Accessibility & perf

- `prefers-reduced-motion`: one static composed frame, no animation loop.
- Tab hidden: loop pauses (`visibilitychange`).
- DPR capped at 2 (1.5 on mobile); sim resolution auto-degrades if frames exceed budget.

## Mobile

Works on modern iOS Safari and Chrome Android (WebGL2 + float textures). On phones/tablets the runtime automatically:

- Lowers sim grid (144px vs 256px long edge) and dye resolution
- Runs fewer pressure iterations (18 vs 28)
- Caps DPR at 1.5
- Yields during warm-up so first paint doesn't freeze
- Uses Pointer Events for touch (canvas stays `pointer-events: none`, so links and Ventures stay tappable)

Ambient drift runs without touch — finger swipes add a gentle ink breeze on **desktop only**. On phones/tablets there is no cursor, so pointer splats are disabled; curl-noise + edge emitters carry the motion instead.

Tune mobile behavior in `MOBILE_OVERRIDES` inside `src/config.ts`.

## Vercel

`vercel.json` runs `npm run build` on deploy. Commit `dist/ink.js` if you deploy without a build step.
