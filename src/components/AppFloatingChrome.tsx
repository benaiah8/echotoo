import { Toaster } from "react-hot-toast";
import BottomTab from "./BottomTab";
import InstallAppButton from "./InstallAppButton";
import ProfileFinishSoftNudge from "./profile/ProfileFinishSoftNudge";
import { useIsDesktopLayout } from "../lib/desktopLayoutDetection";

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

      <ProfileFinishSoftNudge />

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
        }}
      />

      <InstallAppButton />
    </>
  );
}
