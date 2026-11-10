import { useCallback, useEffect, useRef } from "react";
import ProfileSocialOpportunityCard from "./ProfileSocialOpportunityCard";
import { useProfileSocialOpportunities } from "../../hooks/useProfileSocialOpportunities";
import type { ProfileIdentityMediaSource } from "../../lib/profileIdentityMedia";

const LOAD_MORE_THRESHOLD_PX = 200;

/**
 * Shared Profile horizontal rail of current Duo + hosted Group opportunities
 * (Own + Other). Hidden when empty. Pages incrementally via keyset RPC.
 * Other viewers: Discover OFF → server []. Self: Discover OFF still lists own actives.
 *
 * Must `self-stretch w-full` inside Profile's `items-center` column so the
 * scrollport is viewport-bounded (Home ProgressiveHorizontalRail pattern).
 * Top/bottom `border-y` dividers; no edge fade overlays.
 *
 * Scroll: match Home — `overflow-x-auto scroll-hide` only.
 * Avoid touch-action pan-x locks (they block vertical page scroll on mobile).
 */
export default function ProfileSocialOpportunityRail({
  profileUserId,
  enabled,
  profileIdentity = null,
}: {
  profileUserId: string | null | undefined;
  enabled: boolean;
  /** Profile owner identity for Other Profile comments. Own Profile omits it. */
  profileIdentity?: ProfileIdentityMediaSource | null;
}) {
  const {
    opportunities,
    hasMore,
    loading,
    loadingMore,
    loadMore,
    viewerUserId,
  } = useProfileSocialOpportunities({
    profileUserId,
    enabled,
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const loadingMoreRef = useRef(loadingMore);
  loadingMoreRef.current = loadingMore;

  const maybeLoadMore = useCallback(() => {
    if (!hasMoreRef.current || loadingMoreRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const remaining = el.scrollWidth - el.scrollLeft - el.clientWidth;
    if (remaining <= LOAD_MORE_THRESHOLD_PX) {
      void loadMoreRef.current();
    }
  }, []);

  useEffect(() => {
    // After append / first paint, content may still fit without a scroll event.
    maybeLoadMore();
  }, [opportunities.length, hasMore, maybeLoadMore]);

  if (!enabled || (!loading && opportunities.length === 0)) {
    return null;
  }

  /** Equal L/R inset so the first card and trailing edge match. */
  const rowPadClass = "px-2.5";

  /** Unified Home-style skeleton (Own + Other share the same geometry). */
  const skeleton = (
    <div className={`flex w-max gap-3 ${rowPadClass}`}>
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="w-[38vw] min-w-[180px] max-w-[240px] shrink-0"
          data-profile-social-skeleton
          aria-hidden
        >
          <div className="relative mb-3 overflow-hidden rounded-[14px] border border-[var(--border)] ui-card pt-2 px-3 pb-2">
            <div className="relative z-10 flex min-w-0 flex-col">
              <div className="flex h-[26px] w-full min-w-0 items-center justify-center">
                <div className="h-full w-full rounded-full bg-[var(--text)]/10 animate-pulse" />
              </div>
              <div className="mt-2.5 flex min-w-0 items-center gap-1.5">
                <div className="h-6 w-6 shrink-0 rounded-full bg-[var(--text)]/10 animate-pulse" />
                <div className="h-3 w-16 max-w-[40%] shrink-0 rounded bg-[var(--text)]/10 animate-pulse" />
              </div>
              <div className="mt-2.5 min-h-[60px] space-y-2">
                <div className="h-3.5 w-[88%] rounded bg-[var(--text)]/10 animate-pulse" />
                <div className="h-3.5 w-[72%] rounded bg-[var(--text)]/10 animate-pulse" />
                <div className="h-3.5 w-[55%] rounded bg-[var(--text)]/10 animate-pulse" />
              </div>
              <div className="mt-2.5 flex min-w-0 shrink-0 items-center gap-2">
                <div className="h-7 w-10 shrink-0 rounded-[12px_16px_11px_15px] bg-[var(--text)]/10 animate-pulse" />
                <div className="h-7 w-11 shrink-0 rounded-[12px_16px_11px_15px] bg-[var(--text)]/10 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const row = (
    <div className={`flex w-max gap-3 ${rowPadClass}`}>
      {opportunities.map((item) => (
        <div key={item.source_post_id} className="shrink-0">
          <ProfileSocialOpportunityCard
            row={item}
            profileUserId={profileUserId!}
            viewerUserId={viewerUserId}
            profileIdentity={profileIdentity}
          />
        </div>
      ))}
      {loadingMore ? (
        <div
          className="flex w-10 shrink-0 items-center justify-center self-stretch"
          data-profile-social-loading-more
          aria-hidden
        >
          <div className="h-5 w-5 rounded-full border-2 border-[var(--text)]/15 border-t-[var(--text)]/45 animate-spin" />
        </div>
      ) : null}
    </div>
  );

  return (
    <section
      className="mt-5 mb-0 w-full min-w-0 max-w-full self-stretch border-y border-[var(--border)]/55"
      data-profile-social-opportunity-rail
    >
      <div
        ref={scrollRef}
        className="w-full min-w-0 max-w-full overflow-x-auto scroll-hide pt-2.5 pb-3.5"
        onScroll={maybeLoadMore}
      >
        {loading && opportunities.length === 0 ? skeleton : row}
      </div>
    </section>
  );
}
