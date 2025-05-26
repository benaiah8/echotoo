import React, { ReactNode, useEffect } from "react";
import BottomTab from "../BottomTab";
import HeaderBack from "../HeaderBack";

interface Props {
  children: ReactNode;
  back?: boolean;
  hideUI?: boolean;
}

export default function PrimaryPageContainer({
  children,
  back = false,
  hideUI = false,
}: Props) {
  useEffect(() => window.scrollTo(0, 0), []);

  return (
    <div className="w-full bg-black text-white min-h-screen flex flex-col items-center">
      {back && <HeaderBack />}

      {/* ← Single centered column */}
      <div className="w-full max-w-sm mx-auto flex-1 relative">{children}</div>

      {/* ← BottomTab in same column */}
      <div
        className={`fixed inset-x-0 bottom-0 flex justify-center transition-transform duration-300 ease-in-out ${
          hideUI ? "translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="w-full max-w-sm mx-auto px-4">
          <BottomTab />
        </div>
      </div>
    </div>
  );
}
