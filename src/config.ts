/**
 * Ink fluid — tunable constants.
 */
export type InkConfig = {
  simResolutionLongEdge: number;
  dyeResolutionLongEdge: number;
  pressureIterations: number;
  velocityDissipation: number;
  dyeDissipation: number;
  maxDt: number;
  curlNoiseStrength: number;
  curlNoiseSpeed: number;
  pointerForce: number;
  pointerDye: number;
  splatRadius: number;
  ambientDyeAmount: number;
  edgeEmitterWidth: number;
  maskDilatePx: number;
  maxDyeDensity: number;
  inkPrimary: readonly [number, number, number];
  inkSecondary: readonly [number, number, number];
  risoOffset: readonly [number, number];
  meniscusStrength: number;
  bleedStrength: number;
  grainStrength: number;
  maxDevicePixelRatio: number;
  maskSelectors: readonly string[];
  staticSimSteps: number;
  warmupSteps: number;
  perfDegradeMs: number;
  minSimResolutionLongEdge: number;
  pointerEnabled: boolean;
};

export const CONFIG: InkConfig = {
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
  splatRadius: 0.0032,
  ambientDyeAmount: 0.000085,
  edgeEmitterWidth: 0.055,
  maskDilatePx: 10,
  maxDyeDensity: 0.62,
  inkPrimary: [0.11, 0.098, 0.086],
  inkSecondary: [0.38, 0.36, 0.42],
  risoOffset: [0.0024, -0.0016],
  meniscusStrength: 0.28,
  bleedStrength: 0.52,
  grainStrength: 0.018,
  maxDevicePixelRatio: 2,
  maskSelectors: [
    '.head-name',
    '.head-loc',
    '.head-link',
    '.ventures-toggle',
    '.work-name',
    '.work-desc',
  ],
  staticSimSteps: 240,
  warmupSteps: 48,
  perfDegradeMs: 24,
  minSimResolutionLongEdge: 160,
  pointerEnabled: true,
};

const MOBILE_OVERRIDES: Partial<InkConfig> = {
  simResolutionLongEdge: 176,
  dyeResolutionLongEdge: 288,
  pressureIterations: 20,
  maxDevicePixelRatio: 1.5,
  pointerEnabled: false,
  curlNoiseStrength: 0.52,
  ambientDyeAmount: 0.0001,
  warmupSteps: 32,
  staticSimSteps: 140,
  perfDegradeMs: 32,
  minSimResolutionLongEdge: 112,
  meniscusStrength: 0.32,
};

export function isMobileDevice(): boolean {
  return (
    window.matchMedia('(hover: none) and (pointer: coarse)').matches ||
    window.matchMedia('(max-width: 768px)').matches
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

export function resolveConfig(): InkConfig {
  const base: InkConfig = isMobileDevice() ? { ...CONFIG, ...MOBILE_OVERRIDES } : { ...CONFIG };
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
  if (ink.startsWith('#')) base.inkPrimary = hexToRgb(ink);
  return base;
}

/** Organic stain seeds: [x, y, amount, radius]. */
export const STAIN_SEEDS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.06, 0.94, 0.22, 0.014],
  [0.94, 0.08, 0.18, 0.012],
  [0.88, 0.92, 0.16, 0.011],
  [0.12, 0.18, 0.12, 0.009],
  [0.72, 0.62, 0.08, 0.008],
  [0.38, 0.96, 0.1, 0.007],
];
