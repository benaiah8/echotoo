import { useState, useEffect, useCallback } from "react";
import { App } from "@capacitor/app";
import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "./FrostedCenterModal";
import {
  applyHangoutExplainerAllowNotifications,
  applyHangoutExplainerLater,
  applyHangoutExplainerNeverAskAgain,
} from "../../lib/hangoutNotificationExplainerPrefs";
import toast from "react-hot-toast";
import {
  getNativePushReceiveState,
  getNativePushStatusLabel,
  getPushRegistrationUserFeedback,
  requestNotificationPermissionAndRegister,
} from "../../lib/explicitNativePushRegistration";
import { isNativeApp } from "../../lib/storage/utils/capacitorDetection";

export type HangoutNotificationExplainerMode = "contextual" | "manual";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * `contextual` — save hangout / bell: Maybe later + Allow notifications (one row), Never ask again below; prefs apply.
   * `manual` — own profile menu: Cancel + Allow only; no Never row; Cancel/backdrop do not write prefs.
   */
  mode?: HangoutNotificationExplainerMode;
};

/** Shared copy: saved hangout flow + profile menu — broad notification scope. */
const EXPLAINER_BODY =
  "Get reminders and updates on your phone for the hangouts and creators you choose to follow.";

/** Equal-width row — same flex weight for both pills (contextual + manual top rows). */
const manualPillBase =
  "flex-1 min-w-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition " +
  "disabled:opacity-50 whitespace-nowrap text-center";

const manualCancelPillClass =
  manualPillBase +
  " border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface)]/80";

const manualAllowPillClass =
  manualPillBase +
  " bg-[var(--brand)] text-[var(--brand-ink)] hover:opacity-90";

/**
 * Frosted explainer for in-app notification opt-in.
 * `Allow notifications` requests OS permission on native only; web stays a harmless dismiss.
 */
export default function HangoutNotificationExplainerModal({
  open,
  onOpenChange,
  mode = "contextual",
}: Props) {
  const close = () => onOpenChange(false);
  const isManual = mode === "manual";
  const [nativeStatusLine, setNativeStatusLine] = useState<string | null>(null);

  const refreshNativeStatus = useCallback(async () => {
    if (!isNativeApp()) {
      setNativeStatusLine(null);
      return;
    }
    const { ui } = await getNativePushReceiveState();
    setNativeStatusLine(getNativePushStatusLabel(ui));
  }, []);

  useEffect(() => {
    if (!open) {
      setNativeStatusLine(null);
      return;
    }
    void refreshNativeStatus();
  }, [open, refreshNativeStatus]);

  const notifyRegistrationOutcome = useCallback(
    (result: Awaited<
      ReturnType<typeof requestNotificationPermissionAndRegister>
    >) => {
      const fb = getPushRegistrationUserFeedback(result);
      if (fb.kind === "success") toast.success(fb.message);
      else if (fb.kind === "error") toast.error(fb.message);
    },
    []
  );

  useEffect(() => {
    if (!open || !isNativeApp()) return;
    let handle: { remove: () => Promise<void> } | undefined;
    void App.addListener("resume", () => {
      void refreshNativeStatus();
    }).then((h) => {
      handle = h;
    });
    return () => {
      void handle?.remove();
    };
  }, [open, refreshNativeStatus]);

  return (
    <FrostedCenterModal
      open={open}
      onBackdropClick={() => {
        if (!isManual) {
          applyHangoutExplainerLater();
        }
        close();
      }}
      aria-labelledby="hangout-notif-explainer-title"
    >
      <div
        className={frostedModalPanelClassName}
        style={frostedModalPanelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          id="hangout-notif-explainer-title"
          className="text-sm font-semibold mb-1 text-[var(--text)]"
        >
          Receive notifications?
        </div>
        <p className="text-xs text-[var(--text)]/70 mb-3 leading-snug">
          {EXPLAINER_BODY}
        </p>
        {isNativeApp() && nativeStatusLine ? (
          <p className="text-[10px] text-[var(--text)]/45 mb-3 leading-tight">
            {nativeStatusLine}
          </p>
        ) : null}
        {isManual ? (
          <div className="flex w-full min-w-0 gap-2">
            <button
              type="button"
              className={manualCancelPillClass}
              onClick={() => {
                close();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className={manualAllowPillClass}
              onClick={() => {
                applyHangoutExplainerAllowNotifications();
                close();
                void (async () => {
                  const result =
                    await requestNotificationPermissionAndRegister();
                  notifyRegistrationOutcome(result);
                  void refreshNativeStatus();
                })();
              }}
            >
              Allow notifications
            </button>
          </div>
        ) : (
          <>
            <div className="flex w-full min-w-0 gap-2">
              <button
                type="button"
                className={manualCancelPillClass}
                onClick={() => {
                  applyHangoutExplainerLater();
                  close();
                }}
              >
                Maybe later
              </button>
              <button
                type="button"
                className={manualAllowPillClass}
                onClick={() => {
                  applyHangoutExplainerAllowNotifications();
                  close();
                  void (async () => {
                    const result =
                      await requestNotificationPermissionAndRegister();
                    notifyRegistrationOutcome(result);
                    void refreshNativeStatus();
                  })();
                }}
              >
                Allow notifications
              </button>
            </div>
            <div className="mt-2 flex w-full justify-center">
              <button
                type="button"
                className={
                  "max-w-full px-2 py-0.5 text-[11px] font-medium text-[var(--text)]/45 " +
                  "underline decoration-[var(--text)]/25 underline-offset-2 transition " +
                  "hover:text-[var(--text)]/65 whitespace-nowrap text-center"
                }
                onClick={() => {
                  applyHangoutExplainerNeverAskAgain();
                  close();
                }}
              >
                Never ask again
              </button>
            </div>
          </>
        )}
      </div>
    </FrostedCenterModal>
  );
}
