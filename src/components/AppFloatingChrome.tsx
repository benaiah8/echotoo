import { Toaster } from "react-hot-toast";
import BottomTab from "./BottomTab";
import InstallAppButton from "./InstallAppButton";
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

      <Toaster
        position="top-center"
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
