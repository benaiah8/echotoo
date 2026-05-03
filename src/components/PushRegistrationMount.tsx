import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { PushNotifications, type Token } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { supabase } from "../lib/supabaseClient";
import { isNativeApp } from "../lib/storage/utils/capacitorDetection";
import {
  upsertPushDevice,
  type PushDevicePlatform,
} from "../api/services/pushDevices";

function nativePlatform(): PushDevicePlatform | null {
  const p = Capacitor.getPlatform();
  if (p === "ios" || p === "android") return p;
  return null;
}

/**
 * Registers for remote push on iOS/Android only, persists token to Supabase.
 * Does not send pushes — Phase 1 registration only.
 */

// TEMP: push registration disabled during Android auth/session stabilization
// Set to false (and remove this guard) to restore listeners, permissions, register(), upsertPushDevice.
// Explicit user-driven registration lives in `lib/explicitNativePushRegistration.ts` (explainer only).
const TEMP_DISABLE_PUSH_REGISTRATION = true;

const AUTH_CALLBACK_PATH = "/auth/callback";

export default function PushRegistrationMount() {
  const listenersReady = useRef(false);
  const location = useLocation();

  useEffect(() => {
    if (TEMP_DISABLE_PUSH_REGISTRATION) {
      return;
    }

    if (!isNativeApp()) return;

    let registrationRemove: (() => Promise<void>) | null = null;
    let registrationErrorRemove: (() => Promise<void>) | null = null;

    const attachListeners = async () => {
      if (listenersReady.current) return;
      const reg = await PushNotifications.addListener(
        "registration",
        async (token: Token) => {
          const platform = nativePlatform();
          if (!platform) return;
          const value = token?.value?.trim?.() ?? "";
          if (!value) {
            console.error(
              "[PushRegistrationMount] registration event with empty token",
              token
            );
            return;
          }
          const { error } = await upsertPushDevice(value, platform);
          if (error) {
            console.error(
              "[PushRegistrationMount] Failed to save push token:",
              error.message
            );
          }
        }
      );
      const regErr = await PushNotifications.addListener(
        "registrationError",
        (err: unknown) => {
          console.error(
            "[PushRegistrationMount] Push registrationError:",
            err != null ? JSON.stringify(err) : String(err)
          );
        }
      );
      registrationRemove = () => reg.remove();
      registrationErrorRemove = () => regErr.remove();
      listenersReady.current = true;
    };

    const requestRegister = async () => {
      if (location.pathname === AUTH_CALLBACK_PATH) {
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;

      const platform = nativePlatform();
      if (!platform) {
        console.warn(
          "[PushRegistrationMount] Unexpected platform on native:",
          Capacitor.getPlatform()
        );
        return;
      }

      await attachListeners();

      try {
        let perm = await PushNotifications.checkPermissions();
        if (perm.receive === "prompt") {
          perm = await PushNotifications.requestPermissions();
        }

        if (perm.receive !== "granted") {
          console.warn(
            "[PushRegistrationMount] Push permission not granted:",
            perm.receive
          );
          return;
        }

        await PushNotifications.register();
      } catch (e) {
        console.error(
          "[PushRegistrationMount] register sequence failed:",
          e instanceof Error ? e.message : String(e)
        );
      }
    };

    void requestRegister();

    const { data: authSub } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          await requestRegister();
        }
      }
    );

    return () => {
      authSub.subscription.unsubscribe();
      void registrationRemove?.();
      void registrationErrorRemove?.();
      listenersReady.current = false;
    };
  }, [location.pathname]);

  return null;
}
