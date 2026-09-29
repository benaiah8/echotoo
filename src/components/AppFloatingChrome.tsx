import { Toaster } from "react-hot-toast";
import BottomTab from "./BottomTab";
import InstallAppButton from "./InstallAppButton";
import InAppNotificationBannerHost from "./notifications/InAppNotificationBannerHost";
import PairUpActiveOverlay from "./ui/PairUpActiveOverlay";
import OpenPlanActiveOverlay from "./ui/OpenPlanActiveOverlay";
import GroupUpActiveOverlay from "./ui/GroupUpActiveOverlay";
import GroupUpRequestersOverlay from "./messages/GroupUpRequestersOverlay";
import OpenPlanRequestersOverlay from "./messages/OpenPlanRequestersOverlay";
import SourceGroupsOverlay from "./social/SourceGroupsOverlay";
import PairUpPhotoPromptMount from "./profile/PairUpPhotoPromptMount";
import OrdinaryErrorToastBar, {
  ORDINARY_ERROR_TOAST_DURATION_MS,
} from "./OrdinaryErrorToastBar";
import { useIsDesktopLayout } from "../lib/desktopLayoutDetection";
import { SOCIAL_ACTION_TOASTER_ID } from "../lib/showSocialActionToast";
import {
  DISCOVER_PREF_TOAST_TOP,
  DISCOVER_PREF_TOASTER_ID,
} from "../lib/showDiscoverPrefToast";

/**
 * Floating UI outside the desktop phone shell.
 * BottomTab: mobile / native only — on desktop web it renders inside
 * `DesktopShellWrapper` so it stays attached to the phone frame.
 */
export default function AppFloatingChrome() {
  const isDesktop = useIsDesktopLayout();

  return (
    <>
      {!isDesktop ? <BottomTab /> : null}

      <InAppNotificationBannerHost />

      <PairUpActiveOverlay />
      <OpenPlanActiveOverlay />
      <GroupUpActiveOverlay />
      <SourceGroupsOverlay />
      <GroupUpRequestersOverlay />
      <OpenPlanRequestersOverlay />
      {/* Photo gate AFTER social sheets so equal-z ties still paint on top; z-150 > browse 140. */}
      <PairUpPhotoPromptMount />

      <Toaster
        position="top-center"
        containerStyle={{
          top: "calc(12px + env(safe-area-inset-top, 0px))",
          zIndex: 10050,
        }}
        toastOptions={{
          style: { background: "#111", color: "#fff" },
          success: {
            iconTheme: { primary: "#F7D047", secondary: "#111" },
          },
          error: {
            duration: ORDINARY_ERROR_TOAST_DURATION_MS,
          },
        }}
      >
        {(t) => <OrdinaryErrorToastBar toast={t} />}
      </Toaster>

      {/* Discover preference status only — top, below notch/status bar */}
      <Toaster
        toasterId={DISCOVER_PREF_TOASTER_ID}
        position="top-center"
        gutter={8}
        containerStyle={{
          top: DISCOVER_PREF_TOAST_TOP,
          zIndex: 10050,
        }}
        toastOptions={{
          duration: 6500,
          style: {
            background: "transparent",
            boxShadow: "none",
            padding: 0,
          },
        }}
      />

      {/* Duo/Group social feedback — default above bottom nav; Source Groups overrides bottom via CSS var */}
      <Toaster
        toasterId={SOCIAL_ACTION_TOASTER_ID}
        position="bottom-center"
        gutter={8}
        containerStyle={{
          bottom: `var(--social-action-toast-bottom, calc(72px + var(--safe-area-bottom-layout, 0px)))`,
          zIndex: 10040,
        }}
        toastOptions={{
          duration: 6500,
          style: {
            background: "transparent",
            boxShadow: "none",
            padding: 0,
          },
        }}
      />

      <InstallAppButton />
    </>
  );
}
