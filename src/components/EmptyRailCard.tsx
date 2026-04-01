// src/components/EmptyRailCard.tsx
// Empty state card for horizontal rails when filters return no results
// Matches the dimensions and styling of Hangout cards

import React from "react";

export default function EmptyRailCard() {
  return (
    <div className="w-[38vw] min-w-[180px] max-w-[240px] shrink-0">
      {/* Simple line/divider instead of large card */}
      <div className="relative overflow-visible ui-card p-3 flex flex-col items-center justify-center gap-2 mb-3">
        <div className="w-full h-px bg-[var(--border)]" />
        <p className="text-xs text-[var(--text)]/50 text-center">
          No posts found
        </p>
        <div className="w-full h-px bg-[var(--border)]" />
      </div>
    </div>
  );
}

