/**
 * Canvas-only sanity checks for Instagram story exports (manual Canvas 2D and html2canvas fallback).
 * No DOM; no layout regions — detects near-uniform fills matching the configured background
 * (e.g. silent blank output).
 */

export const STORY_EXPORT_BACKGROUND_HEX = "#0a0a0c";

const DEFAULT_GRID_SIZE = 8;
/** Max channel delta from background RGB to count as "near background". */
const DEFAULT_NEAR_BG_EPSILON = 14;
/**
 * If this fraction of samples are near-bg AND nothing is bright enough, treat as blank/bad export.
 * Conservative to avoid rejecting valid dark art (still expect bright text/pills/gradient).
 */
const NEAR_BG_RATIO_FAIL = 0.94;
const MIN_MAX_LUMINANCE_WHEN_MOSTLY_BG = 40;
/** Secondary guard: very flat + mostly dark. */
const NEAR_BG_RATIO_FAIL_STRICT = 0.9;
const MIN_MAX_LUMINANCE_STRICT = 32;
const MAX_VARIANCE_FOR_STRICT_FAIL = 2.5;

export type StoryCanvasValidationStats = {
  sampleCount: number;
  nearBackgroundRatio: number;
  maxLuminance: number;
  luminanceVariance: number;
};

export type StoryCanvasValidationResult = {
  ok: boolean;
  stats: StoryCanvasValidationStats;
};

function parseHexRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace(/^#/, "");
  if (h.length === 6) {
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  return { r: 10, g: 10, b: 12 };
}

function luminanceSrgb(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isNearBackground(
  r: number,
  g: number,
  b: number,
  bg: { r: number; g: number; b: number },
  eps: number
): boolean {
  return (
    Math.abs(r - bg.r) <= eps &&
    Math.abs(g - bg.g) <= eps &&
    Math.abs(b - bg.b) <= eps
  );
}

/**
 * Sparse grid sampling. Fails closed when the bitmap looks like a uniform background fill with no real
 * content (e.g. silent foreignObject / blank capture), including after manual canvas render.
 */
export function validateStoryExportCanvas(
  canvas: HTMLCanvasElement,
  options?: {
    backgroundHex?: string;
    nearBackgroundEpsilon?: number;
    gridSize?: number;
  }
): StoryCanvasValidationResult {
  const w = canvas.width;
  const h = canvas.height;
  const bgHex = options?.backgroundHex ?? STORY_EXPORT_BACKGROUND_HEX;
  const bg = parseHexRgb(bgHex);
  const eps = options?.nearBackgroundEpsilon ?? DEFAULT_NEAR_BG_EPSILON;
  const gridSize = Math.max(
    3,
    Math.min(16, options?.gridSize ?? DEFAULT_GRID_SIZE)
  );

  if (w === 0 || h === 0) {
    return {
      ok: false,
      stats: {
        sampleCount: 0,
        nearBackgroundRatio: 1,
        maxLuminance: 0,
        luminanceVariance: 0,
      },
    };
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return {
      ok: false,
      stats: {
        sampleCount: 0,
        nearBackgroundRatio: 1,
        maxLuminance: 0,
        luminanceVariance: 0,
      },
    };
  }

  const luminances: number[] = [];
  let nearBgCount = 0;
  let maxL = 0;

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const x = Math.min(w - 1, Math.floor(((gx + 0.5) / gridSize) * w));
      const y = Math.min(h - 1, Math.floor(((gy + 0.5) / gridSize) * h));
      const data = ctx.getImageData(x, y, 1, 1).data;
      const r = data[0]!;
      const g = data[1]!;
      const b = data[2]!;
      const L = luminanceSrgb(r, g, b);
      luminances.push(L);
      if (L > maxL) maxL = L;
      if (isNearBackground(r, g, b, bg, eps)) nearBgCount++;
    }
  }

  const sampleCount = luminances.length;
  const nearBackgroundRatio = sampleCount > 0 ? nearBgCount / sampleCount : 1;
  const meanL =
    sampleCount > 0 ? luminances.reduce((a, b) => a + b, 0) / sampleCount : 0;
  const luminanceVariance =
    sampleCount > 0
      ? luminances.reduce((s, L) => s + (L - meanL) ** 2, 0) / sampleCount
      : 0;

  const mostlyBackgroundAndDark =
    nearBackgroundRatio >= NEAR_BG_RATIO_FAIL &&
    maxL < MIN_MAX_LUMINANCE_WHEN_MOSTLY_BG;

  const flatDarkFill =
    nearBackgroundRatio >= NEAR_BG_RATIO_FAIL_STRICT &&
    maxL < MIN_MAX_LUMINANCE_STRICT &&
    luminanceVariance < MAX_VARIANCE_FOR_STRICT_FAIL;

  const ok = !mostlyBackgroundAndDark && !flatDarkFill;

  return {
    ok,
    stats: {
      sampleCount,
      nearBackgroundRatio,
      maxLuminance: maxL,
      luminanceVariance,
    },
  };
}
