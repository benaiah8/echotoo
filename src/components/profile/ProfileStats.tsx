import { getFollowCounts } from "../../api/services/follows";
import {
  getCachedFollowCounts,
  setCachedFollowCounts,
} from "../../lib/followCountsCache";
import { PROFILE_OVERVIEW_STATS_ROW_CLASS } from "../../lib/profileOverviewPresentation";
import ProfileSocialTile from "./ProfileSocialTile";

interface ProfileStatsProps {
  following: number;
  followers: number;
  profileId: string;
  onOpenDrawer: (mode: "followers" | "following") => void;
  loading?: {
    following?: boolean;
    followers?: boolean;
  };
  /** When true, render only tiles (no outer row wrapper) for parent composition. */
  embedded?: boolean;
  /** Optional override for the standalone row wrapper (non-embedded). */
  className?: string;
}

export default function ProfileStats({
  following,
  followers,
  profileId,
  onOpenDrawer,
  loading = {},
  embedded = false,
  className = "",
}: ProfileStatsProps) {
  const prefetchFollowCounts = () => {
    if (!profileId) return;
    const cached = getCachedFollowCounts(profileId);
    if (cached) return;

    getFollowCounts(profileId)
      .then((counts: { followers: number; following: number }) => {
        setCachedFollowCounts(profileId, counts);
      })
      .catch(() => {
        // Silent fail for prefetching
      });
  };

  const tiles = (
    <>
      <ProfileSocialTile
        label="Following"
        value={following}
        fanPosition="left"
        ariaLabel={`Following, ${following}`}
        loading={loading.following}
        onClick={() => onOpenDrawer("following")}
        onMouseEnter={prefetchFollowCounts}
      />
      <ProfileSocialTile
        label="Followers"
        value={followers}
        fanPosition={embedded ? "center" : "right"}
        ariaLabel={`Followers, ${followers}`}
        loading={loading.followers}
        onClick={() => onOpenDrawer("followers")}
        onMouseEnter={prefetchFollowCounts}
      />
    </>
  );

  if (embedded) {
    return tiles;
  }

  return (
    <div
      className={[PROFILE_OVERVIEW_STATS_ROW_CLASS, className]
        .filter(Boolean)
        .join(" ")}
    >
      {tiles}
    </div>
  );
}
