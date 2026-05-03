import React, { useState, useEffect, useRef, useCallback } from "react";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import Hangout from "../../components/Hangout";
import { onPostChanged, onPostDeleted } from "../../lib/postEvents";
import { applyPostPatch } from "../../lib/applyPostPatch";
import { getPostDeleteExitDurationMs } from "../../lib/postDeleteExitAnimation";

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
  const [recent, setRecent] = useState<FeedItem[]>(recentItems);
  const [friends, setFriends] = useState<FeedItem[]>(friendsItems);
  const [location, setLocation] = useState<FeedItem[]>(locationItems);
  const [exitingPostIds, setExitingPostIds] = useState(() => new Set<string>());
  const deleteExitTimersRef = useRef<Map<string, number>>(new Map());
  const listsRef = useRef({ recent, friends, location });
  useEffect(() => {
    listsRef.current = { recent, friends, location };
  }, [recent, friends, location]);

  useEffect(() => {
    setRecent(recentItems);
  }, [recentItems]);
  useEffect(() => {
    setFriends(friendsItems);
  }, [friendsItems]);
  useEffect(() => {
    setLocation(locationItems);
  }, [locationItems]);

  useEffect(() => {
    const cleanup = onPostChanged((e) => {
      const { postId, patch } = e.detail;
      const patchOne = (prev: FeedItem[]) =>
        prev.map((item) =>
          item.id !== postId
            ? item
            : (applyPostPatch(
                item as Record<string, unknown>,
                patch
              ) as FeedItem)
        );
      setRecent((prev) => patchOne(prev));
      setFriends((prev) => patchOne(prev));
      setLocation((prev) => patchOne(prev));
    });
    return cleanup;
  }, []);

  useEffect(() => {
    const commitRemove = (postId: string) => {
      deleteExitTimersRef.current.delete(postId);
      setExitingPostIds((prev) => {
        if (!prev.has(postId)) return prev;
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
      const drop = (prev: FeedItem[]) =>
        prev.filter((item) => item.id !== postId);
      setRecent((prev) => drop(prev));
      setFriends((prev) => drop(prev));
      setLocation((prev) => drop(prev));
    };

    const cleanup = onPostDeleted((postId) => {
      const { recent: r, friends: f, location: l } = listsRef.current;
      if (![...r, ...f, ...l].some((p) => p.id === postId)) return;
      if (deleteExitTimersRef.current.has(postId)) return;

      const durationMs = getPostDeleteExitDurationMs();
      if (durationMs === 0) {
        commitRemove(postId);
        return;
      }

      setExitingPostIds((prev) => {
        if (prev.has(postId)) return prev;
        const next = new Set(prev);
        next.add(postId);
        return next;
      });

      const t = window.setTimeout(() => {
        commitRemove(postId);
      }, durationMs);
      deleteExitTimersRef.current.set(postId, t);
    });
    return cleanup;
  }, []);

  const railItemShellClass = useCallback(
    (id: string) =>
      [
        "shrink-0 overflow-visible transition-[opacity,transform] ease-out will-change-[opacity,transform]",
        "duration-[280ms]",
        exitingPostIds.has(id)
          ? "opacity-0 -translate-y-1 pointer-events-none"
          : "opacity-100 translate-y-0",
      ].join(" "),
    [exitingPostIds]
  );

  const renderSection = (
    title: string,
    items: FeedItem[],
    loading: boolean
  ) => {
    if (loading) {
      return (
        <div className="mt-4">
          <div className="text-[var(--text)]/90 text-sm font-medium mb-2 px-1.5">
            {title}
          </div>
          <div className="mt-2 -mx-1.5 px-1.5">
            <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-4 scroll-hide">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="w-[38vw] min-w-[180px] max-w-[240px] shrink-0"
                >
                  <div className="relative overflow-visible ui-card pt-2 px-3 pb-3 flex flex-col gap-2 mb-3">
                    {/* bookmark: matches Hangout bottom-edge straddle */}
                    <div
                      className="absolute bottom-0 left-3 z-10 flex translate-y-1/2 items-center justify-center p-[3px] rounded-lg bg-[var(--surface)]/80 border border-[var(--border)] shadow-lg"
                      aria-hidden
                    >
                      <div className="w-4 h-4 rounded bg-[var(--text)]/20 animate-pulse" />
                    </div>

                    {/* date strip + author row (matches Hangout) */}
                    <div className="h-5 w-full rounded-full bg-[var(--text)]/10 animate-pulse mb-2" />
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 shrink-0 rounded-full bg-[var(--text)]/10 animate-pulse" />
                      <div className="h-3 flex-1 min-w-0 rounded bg-[var(--text)]/10 animate-pulse" />
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
        <div className="text-[var(--text)]/90 text-sm font-medium mb-2 px-1.5">
          {title}
        </div>
        <div className="overflow-x-auto scroll-hide pt-2 pb-4">
          <div className="flex gap-3 w-max rail-pad">
            {items.map((p) => {
              const locationsCount =
                (p as any).activities_count?.[0]?.count ?? 0;
              const authorHandle =
                p.author?.display_name || p.author?.username || "Unknown";
              const avatarUrl = p.author?.avatar_url ?? null;

              return (
                <div key={p.id} className={railItemShellClass(p.id)}>
                  <Hangout
                    id={p.id}
                    caption={p.caption || "Untitled hangout"}
                    createdAt={p.created_at}
                    authorHandle={authorHandle}
                    avatarUrl={avatarUrl}
                    authorId={p.author_id}
                    isAnonymous={p.is_anonymous || false}
                    isOwner={(p as any).isOwner || false} // Pass isOwner prop
                    onDelete={() => onDelete?.(p.id)} // Pass onDelete callback
                    status={(p as any).status || "published"} // Default to published if status not available
                    selectedDates={p.selected_dates} // Pass selected dates for priority sorting
                    type={p.type} // Pass post type for avatar indicator
                    post={p}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-[640px] mx-auto px-0">
      {renderSection("Recent Uploads", recent, recentLoading)}
      {renderSection("Friends Uploads", friends, friendsLoading)}
      {renderSection("Current Location Uploads", location, locationLoading)}
    </div>
  );
}
