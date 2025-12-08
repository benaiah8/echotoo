import React from "react";
import HomeHangoutSection from "./HomeHangoutSection";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import Post from "../../components/Post";
import PostSkeleton from "../../components/skeletons/PostSkeleton";

interface Props {
  viewMode: "all" | "hangouts" | "experiences";
  items: FeedItem[];
  loading?: boolean;
  loadingMore?: boolean;
  hasActiveFilters?: boolean;
  // for tag fallback when no results match filters
  tagFallbackItems?: FeedItem[];
  tagFallbackLoading?: boolean;
  showTagFallback?: boolean;
  // for the injected rail
  hangouts?: FeedItem[];
  hangoutsLoading?: boolean;
  // to know if we have tag filters active
  selectedTags?: string[];
}

const INJECT_EVERY = 8;

export default function HomePostsSection({
  viewMode,
  items,
  loading,
  loadingMore = false,
  hasActiveFilters = false,
  tagFallbackItems = [],
  tagFallbackLoading = false,
  showTagFallback = false,
  hangouts = [],
  hangoutsLoading,
  selectedTags = [],
}: Props) {
  // Show appropriate items based on viewMode
  const hangoutItems = items.filter(
    (p: FeedItem) => String(p.type).toLowerCase() === "hangout"
  );
  const experienceItems = items.filter(
    (p: FeedItem) => String(p.type).toLowerCase() === "experience"
  );

  // Determine which items to show based on viewMode
  const displayItems =
    viewMode === "hangouts"
      ? hangoutItems
      : viewMode === "experiences"
      ? experienceItems
      : [...hangoutItems, ...experienceItems]; // UNIFIED: Default (all) shows both types mixed together

  // Fallback items for tag filters - UNIFIED: include both types
  const fallbackItems = showTagFallback
    ? tagFallbackItems // Show all fallback items (both types)
    : [];

  // Check if we should show empty state (only when no main results AND no fallback)
  const shouldShowEmptyState =
    !loading &&
    displayItems.length === 0 &&
    (!showTagFallback || fallbackItems.length === 0);

  // Show empty state only if we have no posts at all
  if (shouldShowEmptyState) {
    return (
      <div className="text-[var(--text)]/70 text-sm px-3 py-4">
        {hasActiveFilters ? (
          <>
            <div className="font-medium mb-1">Oops, sorry!</div>
            <div>No posts match your current filters.</div>
          </>
        ) : (
          "No posts to show right now."
        )}
      </div>
    );
  }

  return (
    // NOTE: px-3 here realigns posts with the header/search and bottom bar
    <div className="flex flex-col w-full px-3 gap-4 mt-4">
      {/* Show skeleton only when no posts are available yet */}
      {loading &&
        displayItems.length === 0 &&
        Array.from({ length: 3 }).map((_, i) => (
          <PostSkeleton key={`sk-${i}`} />
        ))}

      {/* Show "no matches" message when we have tag filters but no results, but have fallback */}
      {!loading &&
        selectedTags.length > 0 &&
        displayItems.length === 0 &&
        showTagFallback && (
          <div className="text-[var(--text)]/70 text-sm py-4">
            <div className="font-medium mb-1">Oops, sorry!</div>
            <div>No posts match your current tag filters.</div>
          </div>
        )}

      {/* Show main results if we have them - show appropriate items based on viewMode */}
      {displayItems.map((p: FeedItem, idx: number) => (
        <React.Fragment key={p.id}>
          <Post
            postId={p.id}
            caption={p.caption || "(no caption)"}
            createdAt={p.created_at}
            authorId={p.author_id}
            author={p.author}
            type={p.type}
            isAnonymous={p.is_anonymous || false}
            anonymousName={p.anonymous_name}
            anonymousAvatar={p.anonymous_avatar}
            selectedDates={p.selected_dates}
          />

          {/* Inject horizontal rail every 8 posts */}
          {viewMode === "all" &&
            (idx + 1) % INJECT_EVERY === 0 &&
            (hangoutsLoading || hangouts.length > 0) && (
              <>
                <div className="text-[var(--text)]/90 text-sm font-medium">
                  {hangoutsLoading ? (
                    <span className="inline-block h-4 w-40 rounded bg-[var(--text)]/10 animate-pulse" />
                  ) : (
                    "Discover More"
                  )}
                </div>

                <HomeHangoutSection
                  items={hangouts}
                  loading={!!hangoutsLoading}
                />
              </>
            )}
        </React.Fragment>
      ))}

      {/* Show loading skeletons for pagination */}
      {loadingMore &&
        Array.from({ length: 2 }).map((_, i) => (
          <PostSkeleton key={`loading-more-${i}`} />
        ))}

      {/* Show fallback posts when tag filters are active */}
      {showTagFallback && selectedTags.length > 0 && (
        <>
          {/* Section header for fallback posts */}
          <div className="text-[var(--text)]/80 text-sm font-medium mt-4 mb-2">
            {displayItems.length === 0
              ? "Here are some other posts you might like:"
              : "Other posts:"}
          </div>

          {/* Loading state for fallback */}
          {tagFallbackLoading &&
            Array.from({ length: 2 }).map((_, i) => (
              <PostSkeleton key={`fallback-sk-${i}`} />
            ))}

          {/* Fallback posts - UNIFIED: now showing both types */}
          {fallbackItems.map((p: FeedItem, idx: number) => (
            <React.Fragment key={`fallback-${p.id}`}>
              <Post
                postId={p.id}
                caption={p.caption || "(no caption)"}
                createdAt={p.created_at}
                authorId={p.author_id}
                author={p.author}
                type={p.type}
                isAnonymous={p.is_anonymous || false}
                anonymousName={p.anonymous_name}
                anonymousAvatar={p.anonymous_avatar}
                selectedDates={p.selected_dates}
              />
            </React.Fragment>
          ))}
        </>
      )}
    </div>
  );
}
