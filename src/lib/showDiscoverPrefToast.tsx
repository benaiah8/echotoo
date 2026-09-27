/**
 * People Discover preference status toasts — top safe-area host.
 * Reuses SocialActionToast chrome; does not use the bottom social-action Toaster.
 */

import { setP2pDiscoverEnabled } from "../api/services/pairUp";
import { peopleUiCopy } from "../pages/people/peopleUiCopy";
import {
  dismissSocialActionToast,
  showSocialActionToast,
  SOCIAL_ACTION_TOAST_DURATION_MS,
} from "./showSocialActionToast";
import toast from "react-hot-toast";

/** Dedicated top Toaster — Discover preference status only. */
export const DISCOVER_PREF_TOASTER_ID = "discover-pref";

export const DISCOVER_ENABLED_TOAST_ID = "discover-pref-enabled";
export const DISCOVER_DISABLED_TOAST_ID = "discover-pref-disabled";

/** Matches AppFloatingChrome Discover pref Toaster top inset. */
export const DISCOVER_PREF_TOAST_TOP =
  "calc(16px + env(safe-area-inset-top, 0px))";

export function dismissDiscoverEnabledToast(): void {
  dismissSocialActionToast(DISCOVER_ENABLED_TOAST_ID);
}

export function dismissDiscoverDisabledToast(): void {
  dismissSocialActionToast(DISCOVER_DISABLED_TOAST_ID);
}

function showDiscoverStatusToast(args: {
  id: string;
  title: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  durationMs?: number;
}): void {
  showSocialActionToast({
    id: args.id,
    title: args.title,
    variant: "compact",
    toasterId: DISCOVER_PREF_TOASTER_ID,
    position: "top-center",
    durationMs: args.durationMs ?? SOCIAL_ACTION_TOAST_DURATION_MS,
    primaryAction: args.primaryAction,
  });
}

/** Compact confirmation after Discover is turned off (People Turn off / status). */
export function showDiscoverTurnedOffToast(): void {
  dismissDiscoverEnabledToast();
  showDiscoverStatusToast({
    id: DISCOVER_DISABLED_TOAST_ID,
    title: peopleUiCopy.discoverToggleOffSuccess,
    durationMs: Math.min(2200, SOCIAL_ACTION_TOAST_DURATION_MS),
  });
}

/** After enabling Discover from People — reversible via Turn off. */
export function showDiscoverTurnedOnToast(args: {
  onTurnedOff?: () => void;
}): void {
  const { onTurnedOff } = args;
  dismissDiscoverDisabledToast();
  showDiscoverStatusToast({
    id: DISCOVER_ENABLED_TOAST_ID,
    title: peopleUiCopy.discoverToggleOnSuccess,
    primaryAction: {
      label: peopleUiCopy.discoverToggleTurnOff,
      onClick: () => {
        void (async () => {
          try {
            await setP2pDiscoverEnabled(false);
            onTurnedOff?.();
            showDiscoverTurnedOffToast();
          } catch {
            toast.error(peopleUiCopy.discoverToggleError);
          }
        })();
      },
    },
  });
}
