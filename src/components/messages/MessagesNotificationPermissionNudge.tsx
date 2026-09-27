/**
 * Compact native-only Messages permission nudge (M3A).
 * Local OS permission + Later prefs only — no server/notification rows.
 */

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { isNativeApp } from "../../lib/storage/utils/capacitorDetection";
import {
  applyMessagesPushNudgeLater,
  isMessagesPushNudgeLaterActive,
} from "../../lib/messagesPushNudgePrefs";
import { openNativeAppNotificationSettings } from "../../lib/openNativeAppNotificationSettings";
import {
  getNativePushReceiveState,
  requestNotificationPermissionAndRegister,
  type NativePushReceiveUiState,
} from "../../lib/explicitNativePushRegistration";

export default function MessagesNotificationPermissionNudge() {
  const [receiveUi, setReceiveUi] = useState<NativePushReceiveUiState | null>(
    null,
  );
  const [hiddenByLater, setHiddenByLater] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!isNativeApp()) {
      setReceiveUi("unsupported");
      return;
    }
    if (isMessagesPushNudgeLaterActive()) {
      setHiddenByLater(true);
      return;
    }
    setHiddenByLater(false);
    const { ui } = await getNativePushReceiveState();
    setReceiveUi(ui);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onLater = useCallback(() => {
    applyMessagesPushNudgeLater();
    setHiddenByLater(true);
  }, []);

  const onAllow = useCallback(async () => {
    if (busy || !receiveUi || receiveUi === "granted") return;
    setBusy(true);
    try {
      if (receiveUi === "denied") {
        const opened = await openNativeAppNotificationSettings();
        if (!opened) {
          toast.error("Open Settings → Notifications to enable alerts.");
        }
        return;
      }
      const result = await requestNotificationPermissionAndRegister();
      if (result.granted) {
        setReceiveUi("granted");
        return;
      }
      const again = await getNativePushReceiveState();
      setReceiveUi(again.ui);
      if (again.ui === "denied") {
        /* Next tap can open Settings */
      }
    } finally {
      setBusy(false);
    }
  }, [busy, receiveUi]);

  if (!isNativeApp()) return null;
  if (hiddenByLater) return null;
  if (receiveUi == null || receiveUi === "granted" || receiveUi === "unsupported") {
    return null;
  }

  return (
    <div
      className="mt-2 w-full max-w-full rounded-2xl border border-[var(--border)]/60 bg-[color-mix(in_oklab,var(--surface-2)_55%,var(--bg))] px-3 py-2.5"
      role="region"
      aria-label="Notification permission"
    >
      <p className="text-[13px] font-semibold leading-tight text-[var(--text)]">
        Turn on notifications
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-[var(--text)]/60">
        Get notified when someone sends you a message.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAllow()}
          className="rounded-full bg-amber-400/95 px-2.5 py-1 text-[11px] font-semibold text-neutral-900 transition-opacity hover:opacity-95 disabled:opacity-50"
        >
          Allow notifications
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onLater}
          className="rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--text)]/55 transition-colors hover:text-[var(--text)]/85 disabled:opacity-50"
        >
          Later
        </button>
      </div>
    </div>
  );
}
