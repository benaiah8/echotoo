import React, { ReactNode, useEffect } from "react";
import CapacitorNotchScrim from "../CapacitorNotchScrim";

interface Props {
  children: ReactNode;
  hideUI?: boolean; // controls the bottom tab slide-in/out
  back?: boolean;
  /** When true, adds top safe-area padding for pages that start at top (no custom fixed header). */
  topSafeArea?: boolean;
  /**
   * Capacitor only: fixed notch/status-bar scrim (`--gradient-notch-cap` in index.css).
   * Tune layout in `CapacitorNotchScrim.tsx` (`CAPACITOR_NOTCH_SCRIM`).
   */
  capacitorNotchScrim?: boolean;
}

export default function PrimaryPageContainer({
  children,
  hideUI = false,
  topSafeArea = false,
  capacitorNotchScrim = false,
}: Props) {
  useEffect(() => window.scrollTo(0, 0), []);

  return (
    <div className="w-full bg-[var(--bg)] text-[var(--text)] min-h-screen flex flex-col">
      {/* Main single column */}
      <div
        className={`w-full app-container flex-1 relative ${
          topSafeArea ? "safe-area-inset-top" : ""
        }`}
        style={{ paddingBottom: "var(--create-actions-total-bottom, 96px)" }}
      >
        {capacitorNotchScrim ? <CapacitorNotchScrim /> : null}
        {children}
      </div>
    </div>
  );
}
