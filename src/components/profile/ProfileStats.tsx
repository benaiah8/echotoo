import React from "react";

interface ProfileStatsProps {
  following: number;
  followers: number;
  xp: number;
  profileId: string;
  onOpenDrawer: (mode: "followers" | "following") => void;
  loading?: {
    following?: boolean;
    followers?: boolean;
    xp?: boolean;
  };
}

export default function ProfileStats({
  following,
  followers,
  xp,
  profileId,
  onOpenDrawer,
  loading = {},
}: ProfileStatsProps) {
  const softBg = "color-mix(in oklab, var(--text) 7%, transparent)";
  const softBorder = "color-mix(in oklab, var(--text) 14%, transparent)";
  const softDivider = "color-mix(in oklab, var(--text) 10%, transparent)";

  // [OPTIMIZATION: Phase 4 - Prefetch] Prefetch counts when user hovers over stats
  // Why: Instant drawer opening, better perceived performance
  const handleMouseEnter = (mode: "followers" | "following") => {
    if (mode === "followers" || mode === "following") {
      // Prefetch follow list data in background
      const { getFollowCounts } = require("../../api/services/follows");
      const { getCachedFollowCounts, setCachedFollowCounts } = require("../../lib/followCountsCache");
      
      // Check cache first
      const cached = getCachedFollowCounts(profileId);
      if (cached) return; // Already cached, no need to prefetch
      
      // Prefetch in background (non-blocking)
      getFollowCounts(profileId)
        .then((counts: { followers: number; following: number }) => {
          setCachedFollowCounts(profileId, counts);
        })
        .catch(() => {
          // Silent fail for prefetching
        });
    }
  };

  return (
    <div className="mt-4 grid grid-cols-3 gap-3 w-full max-w-xs">
      {[
        {
          v: following,
          l: "Following",
          click: () => onOpenDrawer("following"),
          isLoading: loading.following,
          mode: "following" as const,
        },
        {
          v: followers,
          l: "Followers",
          click: () => onOpenDrawer("followers"),
          isLoading: loading.followers,
          mode: "followers" as const,
        },
        {
          v: xp,
          l: "XP",
          click: undefined,
          isLoading: loading.xp,
          mode: undefined,
        },
      ].map((it) => (
        <button
          key={it.l}
          onClick={it.click}
          onMouseEnter={it.mode ? () => handleMouseEnter(it.mode!) : undefined}
          disabled={!it.click || it.isLoading}
          className="flex-1 rounded-2xl overflow-hidden text-center disabled:cursor-default"
          style={{
            background: softBg,
            borderColor: softBorder,
            borderWidth: 1,
          }}
        >
          <div className="pt-2 pb-1">
            {it.isLoading ? (
              <div className="h-[18px] w-8 mx-auto bg-[var(--text)]/20 rounded animate-pulse" />
            ) : (
              <div className="text-[18px] font-semibold leading-none">
                {it.v}
              </div>
            )}
          </div>
          <div style={{ borderTop: `1px solid ${softDivider}` }}>
            <div className="py-1 text-[11px] text-[var(--text)]/70">
              {it.l}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

