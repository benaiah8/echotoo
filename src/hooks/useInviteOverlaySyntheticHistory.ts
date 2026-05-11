import { useEffect, useRef } from "react";
import { subscribeAndroidHardwareBack } from "../lib/androidPostDetailModalBack";
import type { InviteOverlayHistoryMarker } from "../lib/inviteOverlayHistory";

/**
 * While `engage` is true: push one synthetic history entry, listen for Back (popstate),
 * Android hardware back, and Escape — all call `onDismiss`.
 * On cleanup (overlay closed or `engage` false): remove the synthetic entry with `history.back()`
 * when our marker is still on `history.state`, using `skipPopstateRef` so the popstate handler
 * does not call `onDismiss` again (mirrors FullScreenProfileCreation).
 */
export function useInviteOverlaySyntheticHistory(options: {
  engage: boolean;
  marker: InviteOverlayHistoryMarker;
  onDismiss: () => void;
}): void {
  const { engage, marker, onDismiss } = options;
  const skipPopstateRef = useRef(false);
  const pushedRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!engage) {
      return;
    }

    if (typeof window !== "undefined" && !pushedRef.current) {
      window.history.pushState(
        { [marker]: true } as Record<string, boolean>,
        "",
        window.location.href
      );
      pushedRef.current = true;
    }

    const onPopState = () => {
      if (skipPopstateRef.current) {
        skipPopstateRef.current = false;
        return;
      }
      onDismissRef.current();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismissRef.current();
      }
    };

    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);
    const unsubAndroid = subscribeAndroidHardwareBack(() => {
      onDismissRef.current();
    });

    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
      unsubAndroid();

      if (typeof window === "undefined") {
        pushedRef.current = false;
        return;
      }
      if (pushedRef.current) {
        const st = window.history.state as Record<string, boolean> | null;
        if (st && st[marker] === true) {
          skipPopstateRef.current = true;
          window.history.back();
        }
        pushedRef.current = false;
      }
    };
  }, [engage, marker]);
}
