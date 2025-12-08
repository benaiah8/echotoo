import React, { ReactNode, useEffect } from "react";
import BottomTab from "../BottomTab";

interface Props {
  children: ReactNode;
  hideUI?: boolean; // controls the bottom tab slide-in/out
  back?: boolean;
}

export default function PrimaryPageContainer({
  children,
  hideUI = false,
}: Props) {
  useEffect(() => window.scrollTo(0, 0), []);

  return (
    <div className="w-full bg-[var(--bg)] text-[var(--text)] min-h-screen flex flex-col">
      {/* Main single column */}
      <div
        className="w-full app-container flex-1 relative"
        style={{ paddingBottom: "var(--create-actions-total-bottom, 96px)" }}
      >
        {children}
      </div>
    </div>
  );
}
