/**
 * Vertical People feed list — scroll, near-end loadMore, viewport seen marking.
 * Renders already-fetched ordered rows; does not own fetch/rank logic.
 */
import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { PEOPLE_DECK_PREFETCH_REMAINING } from "../../lib/people/matchDeckNavigation";
import { peopleFeedCssVars } from "../../lib/people/peopleFeedLayout";
import PeopleDiscoverFeedSkeleton from "./PeopleDiscoverFeedSkeleton";

export type PeopleFeedListProps = {
  children: ReactNode;
  /** Opportunity ids in render order (same as visible rows). */
  orderedIds: string[];
  hasMore: boolean;
  loadMoreInFlight?: boolean;
  onLoadMore: () => void;
  /**
   * Mark seen when a row crosses the visible threshold.
   * Parent must not mark merely because data was prefetched.
   */
  onRowVisible?: (opportunityId: string) => void;
  /** Which row is the interaction focus (photo cycle, etc.). */
  focusedId: string | null;
  onFocusedIdChange?: (opportunityId: string) => void;
  className?: string;
  style?: CSSProperties;
  /**
   * Top clearance applied on the scrolling root (not a parent pane), so cards
   * can pass under the fixed People top nav as the list scrolls.
   * Prefer {@link peopleFeedContentTopPad} (+ Groups toggle clearance).
   */
  topChromePad?: string;
  /** Opportunity id to scroll to when a restore is requested. */
  scrollToId?: string | null;
  /**
   * When set, scrollIntoView runs only when this token changes (session enter /
   * legitimate return). When omitted, legacy behavior scrolls whenever
   * scrollToId changes (Plans/Groups). Discover must pass a token.
   */
  scrollRestoreToken?: string | number | null;
  empty?: ReactNode;
  /**
   * Discover passes "discover" so pagination shows one Discover skeleton.
   * Plans and Groups keep the text placeholder.
   */
  loadMorePlaceholder?: "text" | "discover";
};

export default function PeopleFeedList({
  children,
  orderedIds,
  hasMore,
  loadMoreInFlight = false,
  onLoadMore,
  onRowVisible,
  focusedId,
  onFocusedIdChange,
  className = "",
  style,
  topChromePad,
  scrollToId = null,
  scrollRestoreToken = undefined,
  empty = null,
  loadMorePlaceholder = "text",
}: PeopleFeedListProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const seenMarkedRef = useRef<Set<string>>(new Set());
  const loadMoreLockRef = useRef(false);
  const lastRestoreTokenRef = useRef<string | number | null>(null);
  const useTokenRestore = scrollRestoreToken !== undefined;

  useEffect(() => {
    seenMarkedRef.current = new Set();
  }, [orderedIds.join("|")]);

  /**
   * Session restore only.
   * Token mode (Discover): scroll when scrollRestoreToken changes — not on
   * every focus/currentOpportunityId update during browsing.
   * Align to start (not center) so tall Discover rows are not clipped under nav.
   * Legacy mode (Plans/Groups): scroll when scrollToId changes; keep center.
   */
  useEffect(() => {
    if (!scrollToId || !rootRef.current) return;
    if (useTokenRestore) {
      if (scrollRestoreToken == null || scrollRestoreToken === "") return;
      if (lastRestoreTokenRef.current === scrollRestoreToken) return;
      lastRestoreTokenRef.current = scrollRestoreToken;
    }
    const root = rootRef.current;
    const el = root.querySelector(
      `[data-people-feed-opportunity="${CSS.escape(scrollToId)}"]`
    );
    if (!(el instanceof HTMLElement)) return;

    if (useTokenRestore) {
      /* Feed-relative top align under chrome pad — avoids center clipping on Android. */
      const rootRect = root.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const padTop = parseFloat(getComputedStyle(root).paddingTop) || 0;
      const delta = elRect.top - rootRect.top - padTop;
      if (Math.abs(delta) > 1) {
        root.scrollTop += delta;
      }
      return;
    }

    el.scrollIntoView({ block: "center", behavior: "auto" });
  }, [scrollToId, scrollRestoreToken, useTokenRestore]);

  const tryLoadMore = useCallback(() => {
    if (!hasMore || loadMoreInFlight || loadMoreLockRef.current) return;
    loadMoreLockRef.current = true;
    onLoadMore();
    window.setTimeout(() => {
      loadMoreLockRef.current = false;
    }, 400);
  }, [hasMore, loadMoreInFlight, onLoadMore]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onScroll = () => {
      const remainingPx =
        root.scrollHeight - root.scrollTop - root.clientHeight;
      const approxRow = Math.max(root.clientHeight / 3, 120);
      const remainingRows = remainingPx / approxRow;
      if (remainingRows <= PEOPLE_DECK_PREFETCH_REMAINING) {
        tryLoadMore();
      }

      /* Focus: Discover appearances when present; else opportunity rows. */
      if (onFocusedIdChange) {
        const mid = root.scrollTop + root.clientHeight * 0.35;
        const appearanceRows = root.querySelectorAll<HTMLElement>(
          "[data-people-discover-appearance]"
        );
        const rows =
          appearanceRows.length > 0
            ? appearanceRows
            : root.querySelectorAll<HTMLElement>(
                "[data-people-feed-opportunity]"
              );
        let nextFocus: string | null = focusedId;
        for (const row of rows) {
          const top = row.offsetTop;
          const bottom = top + row.offsetHeight;
          if (mid >= top && mid <= bottom) {
            nextFocus =
              row.dataset.peopleDiscoverAppearance ??
              row.dataset.peopleFeedOpportunity ??
              null;
            break;
          }
        }
        if (nextFocus && nextFocus !== focusedId) {
          onFocusedIdChange(nextFocus);
        }
      }
    };

    root.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => root.removeEventListener("scroll", onScroll);
  }, [focusedId, onFocusedIdChange, tryLoadMore, orderedIds.length]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !onRowVisible) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.55) continue;
          const id = (entry.target as HTMLElement).dataset
            .peopleFeedOpportunity;
          if (!id || seenMarkedRef.current.has(id)) continue;
          seenMarkedRef.current.add(id);
          onRowVisible(id);
        }
      },
      {
        root,
        threshold: [0.55],
        rootMargin: "0px",
      }
    );

    const rows = root.querySelectorAll("[data-people-feed-opportunity]");
    rows.forEach((row) => io.observe(row));
    return () => io.disconnect();
  }, [onRowVisible, orderedIds.join("|"), children]);

  if (orderedIds.length === 0 && empty) {
    return <>{empty}</>;
  }

  const chromePad =
    typeof topChromePad === "string" && topChromePad.trim()
      ? topChromePad.trim()
      : undefined;

  return (
    <div
      ref={rootRef}
      className={[
        "people-feed-list min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain",
        "[scrollbar-width:thin]",
        className,
      ].join(" ")}
      style={{
        ...peopleFeedCssVars(),
        ...style,
        ...(chromePad ? { paddingTop: chromePad } : null),
      }}
      data-people-feed-list="true"
      data-people-feed-list-top-chrome={chromePad ? "true" : undefined}
      data-people-feed-focused={focusedId ?? ""}
    >
      <div
        className="mx-auto w-full"
        style={{
          maxWidth: "var(--people-feed-max-w, 640px)",
          paddingLeft: "var(--people-feed-gutter, var(--gutter))",
          paddingRight: "var(--people-feed-gutter, var(--gutter))",
        }}
        data-people-feed-list-inner="true"
      >
        {children}
        {hasMore ? (
          <div
            className="flex justify-center py-4 text-[13px] text-[var(--text)]/45"
            data-people-feed-load-more-sentinel="true"
          >
            {loadMoreInFlight
              ? loadMorePlaceholder === "discover"
                ? (
                  <PeopleDiscoverFeedSkeleton variant="pagination" />
                )
                : "Loading…"
              : ""}
          </div>
        ) : null}
      </div>
    </div>
  );
}
