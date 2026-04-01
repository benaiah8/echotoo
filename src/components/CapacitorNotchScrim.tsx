import { isCapacitor } from "../lib/storage/utils/capacitorDetection";

/**
 * Native top scrim (Capacitor) — single tuning surface:
 *
 * - **Layout / stack:** `CAPACITOR_NOTCH_SCRIM` below (z-index, height below safe area).
 * - **Colors / solid vs gradient:** `--gradient-notch-cap` in `src/index.css` (`:root` + `.theme-light`).
 *
 * Mounted via `PrimaryPageContainer` prop `capacitorNotchScrim` so all target pages stay in sync.
 */
export const CAPACITOR_NOTCH_SCRIM = {
  /** Fade continues this many px below `env(safe-area-inset-top)`. */
  belowSafeAreaPx: 32,
  /** Below scroll-away headers (e.g. HomeTopBar z-30/31), above scrolling content. */
  zIndex: 28,
} as const;

type Props = {
  /** Override for tests or rare layouts; default uses CSS variable. */
  background?: string;
};

/**
 * Fixed theme-aware top scrim for notched devices (iOS/Android WebView).
 * Web: not rendered. `pointer-events-none` — no hit-testing impact.
 */
export default function CapacitorNotchScrim({ background }: Props) {
  if (!isCapacitor()) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-0 right-0 top-0"
      style={{
        zIndex: CAPACITOR_NOTCH_SCRIM.zIndex,
        height: `calc(env(safe-area-inset-top, 0px) + ${CAPACITOR_NOTCH_SCRIM.belowSafeAreaPx}px)`,
        background: background ?? "var(--gradient-notch-cap)",
      }}
    />
  );
}
