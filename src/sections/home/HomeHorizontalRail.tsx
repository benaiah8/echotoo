import React from "react";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import Hangout from "../../components/Hangout";

type Props = {
  recentItems: FeedItem[];
  friendsItems: FeedItem[];
  locationItems: FeedItem[];
  recentLoading?: boolean;
  friendsLoading?: boolean;
  locationLoading?: boolean;
  onDelete?: (postId: string) => void;
};

export default function HomeHorizontalRail({
  recentItems = [],
  friendsItems = [],
  locationItems = [],
  recentLoading = false,
  friendsLoading = false,
  locationLoading = false,
  onDelete,
}: Props) {
  const renderSection = (
    title: string,
    items: FeedItem[],
    loading: boolean
  ) => {
    if (loading) {
      return (
        <div className="mt-4">
          <div className="text-[var(--text)]/90 text-sm font-medium mb-2 px-3">
            {title}
          </div>
          <div className="mt-2 -mx-3 px-3">
            <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 scroll-hide">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="w-[38vw] min-w-[180px] max-w-[240px] shrink-0"
                >
                  <div className="relative overflow-visible ui-card p-3 flex flex-col gap-2 mb-3">
                    {/* bookmark badge: bottom-left (skeleton style) */}
                    <div
                      className="absolute -bottom-3 -left-3 z-10 grid place-items-center h-8 w-8 rounded-full bg-[var(--surface)]/80 border border-[var(--border)] shadow-lg"
                      aria-hidden
                    >
                      <div className="w-4 h-4 rounded bg-[var(--text)]/20 animate-pulse" />
                    </div>

                    {/* header (avatar + two lines) */}
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[var(--text)]/10 animate-pulse" />
                      <div className="flex-1 min-w-0">
                        <div className="h-3 w-24 rounded bg-[var(--text)]/10 animate-pulse mb-1" />
                      </div>
                      <div className="h-3 w-12 rounded bg-[var(--text)]/10 animate-pulse" />
                    </div>

                    {/* caption (3 lines to match clamp) */}
                    <div className="mt-1 space-y-2">
                      <div className="h-4 w-[92%] rounded bg-[var(--text)]/10 animate-pulse" />
                      <div className="h-4 w-[78%] rounded bg-[var(--text)]/10 animate-pulse" />
                      <div className="h-4 w-[60%] rounded bg-[var(--text)]/10 animate-pulse" />
                    </div>

                    {/* footer row: RSVP component skeleton */}
                    <div className="pt-1 flex items-center justify-end">
                      <div className="flex items-center">
                        {/* User avatars (overlapping circles) - Creator on right, others to left */}
                        <div className="flex items-center">
                          {[0, 1, 2].map((index) => (
                            <div
                              key={index}
                              className="relative"
                              style={{
                                zIndex: index + 1, // Creator (index 0) = z-index 1, middle (index 1) = z-index 2, rightmost (index 2) = z-index 3
                                marginLeft: index > 0 ? "-4px" : "0px", // Reduced overlap
                              }}
                            >
                              <div
                                className="w-6 h-6 rounded-full bg-[var(--text)]/10 border border-[var(--border)] animate-pulse"
                                style={{ width: "20px", height: "20px" }}
                              />
                            </div>
                          ))}
                        </div>

                        {/* RSVP pill - same height as circles, overlapping, on top */}
                        <div
                          className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--surface)] border border-[var(--border)] animate-pulse"
                          style={{
                            marginLeft: "-4px", // Reduced overlap with the last circle
                            zIndex: 4, // Highest z-index so pill appears on top
                          }}
                        >
                          <div className="h-3 w-8 rounded bg-[var(--text)]/20 animate-pulse" />
                          <div className="h-3 w-6 rounded bg-[var(--text)]/20 animate-pulse" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (items.length === 0) {
      return null; // Don't show empty sections
    }

    return (
      <div className="mt-4">
        <div className="text-[var(--text)]/90 text-sm font-medium mb-2 px-3">
          {title}
        </div>
        <div className="overflow-x-auto scroll-hide py-2">
          <div className="flex gap-3 w-max rail-pad">
            {items.map((p) => {
              const locationsCount =
                (p as any).activities_count?.[0]?.count ?? 0;
              const authorHandle =
                p.author?.display_name || p.author?.username || "Unknown";
              const avatarUrl = p.author?.avatar_url ?? null;

              return (
                <Hangout
                  key={p.id}
                  id={p.id}
                  caption={p.caption || "Untitled hangout"}
                  createdAt={p.created_at}
                  authorHandle={authorHandle}
                  avatarUrl={avatarUrl}
                  authorId={p.author_id}
                  isAnonymous={p.is_anonymous || false}
                  capacity={20} // Default capacity
                  isOwner={(p as any).isOwner || false} // Pass isOwner prop
                  onDelete={() => onDelete?.(p.id)} // Pass onDelete callback
                  status={(p as any).status || "published"} // Default to published if status not available
                  selectedDates={p.selected_dates} // Pass selected dates for priority sorting
                  type={p.type} // Pass post type for avatar indicator
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-[640px] mx-auto px-0">
      {renderSection("Recent Uploads", recentItems, recentLoading)}
      {renderSection("Friends Uploads", friendsItems, friendsLoading)}
      {renderSection(
        "Current Location Uploads",
        locationItems,
        locationLoading
      )}
    </div>
  );
}
