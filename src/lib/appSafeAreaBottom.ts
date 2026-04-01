import {
  isAndroid,
  isIOS,
  isNativeApp,
} from "./storage/utils/capacitorDetection";

/** Fired after `--android-extra-bottom` is updated so UI can re-measure. */
export const APP_SAFE_BOTTOM_SYNC_EVENT = "echotoo:safe-bottom-sync";

/** Typical 3-button nav + margin; only used when env() reports almost nothing. */
const ANDROID_BOTTOM_MIN_PX = 52;
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

export function syncAppSafeAreaBottom(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  let extra = 0;
  if (isIOS()) {
    extra = 0;
  } else if (isNativeApp() && isAndroid()) {
    extra = keyboardOpen ? 0 : computeAndroidNativeExtraPx();
  }
  root.style.setProperty("--android-extra-bottom", `${extra}px`);
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
 * iOS: leaves layout to env() only (home indicator is reliable with viewport-fit=cover).
 * Android native: adds --android-extra-bottom when env() under-reports (common with 3-button nav).
 * Android keyboard open: extra cleared so we do not stack with Keyboard resize.
 */
export function initAppSafeAreaBottom(): () => void {
  const run = () => syncAppSafeAreaBottom();
  run();

  window.addEventListener("resize", run);
  window.addEventListener("orientationchange", run);
  window.visualViewport?.addEventListener("resize", run);

  let keyboardCleanup: (() => void) | undefined;

  if (isNativeApp() && isAndroid()) {
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
