/**
 * Games Page - Placeholder
 *
 * This is a placeholder page for the Games tab.
 * Will be implemented in a future phase.
 */

import React from "react";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";

export default function GamesPage() {
  return (
    <PrimaryPageContainer topSafeArea>
      <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-6">🎮</div>
          <h1 className="text-3xl font-bold text-[var(--text)] mb-4">Games</h1>
          <p className="text-[var(--text)]/70 mb-8">
            Coming soon! This will be your hub for gaming activities,
            tournaments, and gaming meetups.
          </p>
          <div className="text-sm text-[var(--text)]/50">
            Stay tuned for exciting features!
          </div>
        </div>
      </div>
    </PrimaryPageContainer>
  );
}
