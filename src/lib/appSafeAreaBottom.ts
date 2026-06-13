import {
  isAndroid,
  isIOS,
  isNativeApp,
} from "./storage/utils/capacitorDetection";

/** Fired after `--android-extra-bottom` is updated so UI can re-measure. */
export const APP_SAFE_BOTTOM_SYNC_EVENT = "echotoo:safe-bottom-sync";

/**
 * Native bottom sync writes `--android-extra-bottom` / `--ios-extra-bottom` on
 * `documentElement` so `--safe-area-bottom-layout` matches content clearance
 * (see `src/index.css`). The floating tab pill’s `bottom` offset is computed in
 * `BottomTab.tsx` separately — do not assume it equals this constant.
 */
export const BOTTOM_TAB_PILL_OFFSET_PX = 5;

/** Typical 3-button nav + margin; only used when env() reports almost nothing. */
const ANDROID_BOTTOM_MIN_PX = 52;
/**
 * Home indicator / home swipe strip when `env(safe-area-inset-bottom)` under-reports
 * in Capacitor iOS WebView.
 */
const IOS_BOTTOM_MIN_PX = 32;
/** If env() is at least this, trust it (gesture bar ~20–34px on many devices). */
const ENV_TRUST_MIN_PX = 14;

let keyboardOpen = false;

function probeEnvSafeInsetBottomPx(): number {
  if (typeof document === "undefined") return 0;
  try {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;bottom:0;left:0;right:0;padding-bottom:env(safe-area-inset-bottom, 0px);visibility:hidden;pointer-events:none;";
    document.body.appendChild(probe);
    const px = parseFloat(getComputedStyle(probe).paddingBottom || "0");
    document.body.removeChild(probe);
    return Number.isFinite(px) ? px : 0;
  } catch {
    return 0;
  }
}

function computeAndroidNativeExtraPx(): number {
  const envPx = probeEnvSafeInsetBottomPx();
  if (envPx >= ENV_TRUST_MIN_PX) return 0;
  return Math.max(0, ANDROID_BOTTOM_MIN_PX - envPx);
}

function computeIOSNativeExtraPx(): number {
  const envPx = probeEnvSafeInsetBottomPx();
  if (envPx >= ENV_TRUST_MIN_PX) return 0;
  return Math.max(0, IOS_BOTTOM_MIN_PX - envPx);
}

export function syncAppSafeAreaBottom(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  let androidExtra = 0;
  let iosExtra = 0;
  if (isNativeApp() && isAndroid()) {
    androidExtra = keyboardOpen ? 0 : computeAndroidNativeExtraPx();
  }
  if (isNativeApp() && isIOS()) {
    iosExtra = keyboardOpen ? 0 : computeIOSNativeExtraPx();
  }
  root.style.setProperty("--android-extra-bottom", `${androidExtra}px`);
  root.style.setProperty("--ios-extra-bottom", `${iosExtra}px`);
  window.dispatchEvent(new Event(APP_SAFE_BOTTOM_SYNC_EVENT));
}

/** Resolved pixel sum of env(safe-area-inset-bottom) + android extra (for JS layout). */
export function resolveSafeAreaBottomLayoutPx(): number {
  if (typeof document === "undefined") return 0;
  try {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;left:-9999px;bottom:0;padding-bottom:var(--safe-area-bottom-layout);visibility:hidden;pointer-events:none;";
    document.body.appendChild(probe);
    const px = parseFloat(getComputedStyle(probe).paddingBottom || "0");
    document.body.removeChild(probe);
    return Number.isFinite(px) ? px : 0;
  } catch {
    return 0;
  }
}

/**
 * iOS: adds --ios-extra-bottom when env() under-reports in the Capacitor WebView.
 * Android native: adds --android-extra-bottom when env() under-reports (common with 3-button nav).
 * Keyboard open: native extras cleared so we do not stack with Keyboard resize.
 */
export function initAppSafeAreaBottom(): () => void {
  const run = () => syncAppSafeAreaBottom();
  run();

  window.addEventListener("resize", run);
  window.addEventListener("orientationchange", run);
  window.visualViewport?.addEventListener("resize", run);

  let keyboardCleanup: (() => void) | undefined;

  if (isNativeApp() && (isAndroid() || isIOS())) {
    void import("@capacitor/keyboard")
      .then(async ({ Keyboard }) => {
        const hShow = await Keyboard.addListener("keyboardDidShow", () => {
          keyboardOpen = true;
          syncAppSafeAreaBottom();
        });
        const hHide = await Keyboard.addListener("keyboardDidHide", () => {
          keyboardOpen = false;
          syncAppSafeAreaBottom();
        });
        keyboardCleanup = () => {
          void hShow.remove();
          void hHide.remove();
        };
      })
      .catch(() => {
        /* web build without native Keyboard */
      });
  }

  return () => {
    window.removeEventListener("resize", run);
    window.removeEventListener("orientationchange", run);
    window.visualViewport?.removeEventListener("resize", run);
    keyboardCleanup?.();
  };
}
