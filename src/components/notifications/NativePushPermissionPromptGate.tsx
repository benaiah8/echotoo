import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { useAppSelector } from "../../app/hooks";
import { supabase } from "../../lib/supabaseClient";
import { isNativeApp } from "../../lib/storage/utils/capacitorDetection";
import {
  applyNativePushPromptLater,
  applyNativePushPromptNever,
  applyNativePushPromptSessionDismiss,
  shouldShowNativePushPermissionPrompt,
} from "../../lib/pushPromptPrefs";
import {
  getNativePushReceiveState,
  getPushRegistrationUserFeedback,
  requestNotificationPermissionAndRegister,
} from "../../lib/explicitNativePushRegistration";
import { useCreateChooser } from "../../context/CreateChooserContext";
import { useOwlMessageModal } from "../../context/OwlMessageModalContext";
import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "../ui/FrostedCenterModal";

const AUTH_CALLBACK_PATH = "/auth/callback";
/** After splash / shell ready; avoids stacking with first paint. */
const PROMPT_DELAY_MS = 2500;

type Props = {
  /** False while splash logo is showing. */
  appContentReady: boolean;
};

const pillBase =
  "flex-1 min-w-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition " +
  "disabled:opacity-50 whitespace-nowrap text-center";

const secondaryPillClass =
  pillBase +
  " border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface)]/80";

const primaryPillClass =
  pillBase + " bg-[var(--brand)] text-[var(--brand-ink)] hover:opacity-90";

/**
 * Native-only, signed-in, delayed push permission reminder.
 * OS permission is requested only from the primary button via {@link requestNotificationPermissionAndRegister}.
 */
export default function NativePushPermissionPromptGate({
  appContentReady,
}: Props) {
  const location = useLocation();
  const authUser = useAppSelector((s) => s.auth.user);
  const authLoading = useAppSelector((s) => s.auth.loading);
  const { isOpen: createChooserOpen } = useCreateChooser();
  const { isOpen: owlModalOpen } = useOwlMessageModal();

  const [open, setOpen] = useState(false);
  const [allowBusy, setAllowBusy] = useState(false);
  const openedRef = useRef(false);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    if (!authUser) {
      openedRef.current = false;
      return;
    }
    if (!appContentReady) return;
    if (authLoading) return;
    if (location.pathname === AUTH_CALLBACK_PATH) return;
    if (createChooserOpen || owlModalOpen) return;
    if (openedRef.current) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (cancelled) return;

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user) {
          return;
        }

        const { ui } = await getNativePushReceiveState();
        if (ui === "granted" || ui === "unsupported") {
          openedRef.current = true;
          return;
        }
        if (!shouldShowNativePushPermissionPrompt()) {
          openedRef.current = true;
          return;
        }

        if (cancelled) return;
        openedRef.current = true;
        setOpen(true);
      })();
    }, PROMPT_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    appContentReady,
    authLoading,
    authUser,
    location.pathname,
    createChooserOpen,
    owlModalOpen,
  ]);

  const onAllow = useCallback(async () => {
    setAllowBusy(true);
    try {
      const result = await requestNotificationPermissionAndRegister();
      const fb = getPushRegistrationUserFeedback(result);
      if (fb.kind === "success") toast.success(fb.message);
      else if (fb.kind === "error") toast.error(fb.message);
    } finally {
      applyNativePushPromptSessionDismiss();
      setAllowBusy(false);
      close();
    }
  }, [close]);

  const onMaybeLater = useCallback(() => {
    applyNativePushPromptLater();
    close();
  }, [close]);

  const onNever = useCallback(() => {
    applyNativePushPromptNever();
    close();
  }, [close]);

  if (!isNativeApp()) return null;

  return (
    <FrostedCenterModal
      open={open}
      onBackdropClick={() => {
        onMaybeLater();
      }}
      zTier="dialog"
      aria-labelledby="native-push-prompt-title"
    >
      <div
        className={frostedModalPanelClassName}
        style={frostedModalPanelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          id="native-push-prompt-title"
          className="text-sm font-semibold mb-1 text-[var(--text)]"
        >
          Stay updated
        </div>
        <p className="text-xs text-[var(--text)]/70 mb-3 leading-snug">
          Turn on notifications so you do not miss invite messages, replies, and
          activity.
        </p>
        <div className="flex w-full min-w-0 gap-2">
          <button
            type="button"
            className={secondaryPillClass}
            disabled={allowBusy}
            onClick={onMaybeLater}
          >
            Maybe later
          </button>
          <button
            type="button"
            className={primaryPillClass}
            disabled={allowBusy}
            onClick={() => void onAllow()}
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
              "hover:text-[var(--text)]/65 whitespace-nowrap text-center disabled:opacity-40"
            }
            disabled={allowBusy}
            onClick={onNever}
          >
            Never remind me again
          </button>
        </div>
      </div>
    </FrostedCenterModal>
  );
}
