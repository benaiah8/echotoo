import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAppSelector } from "../../app/hooks";
import { supabase } from "../../lib/supabaseClient";
import { isNativeApp } from "../../lib/storage/utils/capacitorDetection";
import {
  hasNativePushOsPromptAttempt,
  isNativePushPromptNeverAgain,
  markNativePushOsPromptAttempt,
  NATIVE_PUSH_PROMPT_DELAY_MS,
} from "../../lib/pushPromptPrefs";
import {
  getNativePushReceiveState,
  requestNotificationPermissionAndRegister,
} from "../../lib/explicitNativePushRegistration";
import { useCreateChooser } from "../../context/CreateChooserContext";
import { useOwlMessageModal } from "../../context/OwlMessageModalContext";

const AUTH_CALLBACK_PATH = "/auth/callback";

type Props = {
  /** False while splash logo is showing. */
  appContentReady: boolean;
};

/**
 * Native-only, signed-in, splash-ready permission check.
 * Requestable permission gets one OS prompt per user on this device.
 * Granted permission registers the token with no prompt.
 * Denied permission is not requested again. Settings stays user-initiated.
 */
export default function NativePushPermissionPromptGate({
  appContentReady,
}: Props) {
  const location = useLocation();
  const authUser = useAppSelector((s) => s.auth.user);
  const authLoading = useAppSelector((s) => s.auth.loading);
  const { isOpen: createChooserOpen } = useCreateChooser();
  const { isOpen: owlModalOpen } = useOwlMessageModal();
  const startedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;
    const userId = authUser?.id?.trim() ?? "";
    if (!userId) {
      startedForUserRef.current = null;
      return;
    }
    if (!appContentReady) return;
    if (authLoading) return;
    if (location.pathname === AUTH_CALLBACK_PATH) return;
    if (createChooserOpen || owlModalOpen) return;
    if (startedForUserRef.current === userId) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (cancelled) return;
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const sessionUserId = session?.user?.id?.trim() ?? "";
        if (!sessionUserId || sessionUserId !== userId) return;

        const { ui } = await getNativePushReceiveState();
        if (cancelled) return;

        if (ui === "granted") {
          startedForUserRef.current = userId;
          await requestNotificationPermissionAndRegister();
          return;
        }

        if (ui !== "prompt") {
          startedForUserRef.current = userId;
          return;
        }

        if (isNativePushPromptNeverAgain()) {
          startedForUserRef.current = userId;
          return;
        }

        if (hasNativePushOsPromptAttempt(userId)) {
          startedForUserRef.current = userId;
          return;
        }

        startedForUserRef.current = userId;
        markNativePushOsPromptAttempt(userId);
        await requestNotificationPermissionAndRegister();
      })();
    }, NATIVE_PUSH_PROMPT_DELAY_MS);

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

  if (!isNativeApp()) return null;
  return null;
}
