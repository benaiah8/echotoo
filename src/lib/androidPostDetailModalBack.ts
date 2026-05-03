import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

/**
 * Subscribe to Android hardware back (Capacitor `App` `backButton` — Android only).
 * Call the returned function to remove the listener.
 *
 * No-op on web and iOS (Capacitor backButton is Android-only).
 */
export function subscribeAndroidHardwareBack(onBack: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return () => {};
  }

  let handle: { remove: () => Promise<void> } | undefined;
  let cancelled = false;

  void App.addListener("backButton", () => {
    onBack();
  }).then((h) => {
    if (cancelled) {
      void h.remove();
      return;
    }
    handle = h;
  });

  return () => {
    cancelled = true;
    void handle?.remove();
  };
}

/**
 * Android hardware back while the post-detail modal is mounted.
 * Invokes the same callback used for in-app close / exit animation — no second navigation path.
 */
export function subscribeAndroidPostDetailModalBack(
  onBack: () => void
): () => void {
  return subscribeAndroidHardwareBack(onBack);
}
