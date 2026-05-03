/**
 * Desktop-only layout:
 * - Public legal/help routes (desktop web): full-page reading layout (no phone shell)
 * - All other desktop web routes: phone + right marketing column (no split policy panel)
 * - Native & mobile web: passthrough (unchanged)
 */

import { useLocation } from "react-router-dom";
import { useIsDesktopLayout } from "../lib/desktopLayoutDetection";
import { isDesktopPolicyHelpPath } from "../lib/desktopPolicyRoutes";
import DesktopRightPanel from "./desktop/DesktopRightPanel";
import BottomTab from "./BottomTab";

/**
 * Desktop split (browser width ≥ 900, non-native) only. Shared by phone frame and
 * right panel so columns stay level. Height budget = viewport minus vertical padding
 * (24+24; keep in sync with .desktop-shell padding). Uses 100vh (not dvh) so the
 * min() value always parses in older engines if max-height would otherwise be ignored.
 */
const DESKTOP_SHELL_PAD_Y = 24 * 2;
const DESKTOP_STAGE_MAX_HEIGHT = `min(calc(100vh - ${DESKTOP_SHELL_PAD_Y}px), 844px)`;
const DESKTOP_PHONE_MIN_HEIGHT = `min(700px, ${DESKTOP_STAGE_MAX_HEIGHT})`;

export default function DesktopShellWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const isDesktop = useIsDesktopLayout();
  const { pathname } = useLocation();
  const legalFullPageDesktop =
    isDesktop && isDesktopPolicyHelpPath(pathname);

  if (!isDesktop) {
    return <>{children}</>;
  }

  /** Full-width legal/help on desktop — reuses routed policy page components */
  if (legalFullPageDesktop) {
    return (
      <div className="desktop-public-legal-page min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <div className="mx-auto w-full max-w-[760px] px-5 sm:px-8 py-8 sm:py-12 pb-16">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="desktop-shell-root">
      <div
        className="desktop-shell"
        style={{
          display: "flex",
          minHeight: "100vh",
          maxHeight: "100vh",
          boxSizing: "border-box",
          alignItems: "center",
          justifyContent: "center",
          gap: "40px",
          padding: "24px",
        }}
      >
        <div
          className="desktop-phone-frame"
          style={{
            width: "390px",
            minHeight: DESKTOP_PHONE_MIN_HEIGHT,
            maxHeight: DESKTOP_STAGE_MAX_HEIGHT,
            borderRadius: "40px",
            border: "12px solid rgba(255,255,255,0.07)",
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.06), 0 0 100px -24px rgba(247,208,71,0.18), 0 28px 56px -18px rgba(0,0,0,0.65)",
            overflow: "hidden",
            flexShrink: 0,
            transform: "translateZ(0)",
            position: "relative",
          }}
        >
          <div
            className="desktop-phone-inner desktop-phone-inner-scroll"
            style={{
              width: "100%",
              height: "100%",
              minHeight: DESKTOP_PHONE_MIN_HEIGHT,
              maxHeight: DESKTOP_STAGE_MAX_HEIGHT,
              overflow: "auto",
              background: "var(--bg)",
              position: "relative",
            }}
          >
            {children}
            {/* Fixed tab positions to this column: ancestor phone frame uses transform */}
            <BottomTab />
          </div>
        </div>

        <div
          className="desktop-panel-theme-scope desktop-panel-scroll min-h-0 flex flex-col flex-1 w-full min-w-0 max-w-[640px] overflow-y-auto overscroll-y-contain bg-transparent py-4 px-5 sm:px-7 sm:py-6 border-l border-white/[0.06]"
          style={{ maxHeight: DESKTOP_STAGE_MAX_HEIGHT }}
        >
          <DesktopRightPanel />
        </div>
      </div>
    </div>
  );
}
