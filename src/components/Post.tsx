// PERF: Optimized post component with image optimization
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Paths } from "../router/Paths";
import { supabase } from "../lib/supabaseClient";
import MediaCarousel from "./MediaCarousel";
import Avatar from "./ui/Avatar";
import PostMenu from "./ui/PostMenu";
import InviteDrawer from "./ui/InviteDrawer";
import PostActions from "./ui/PostActions";
import { getPostForEdit } from "../api/services/posts";
import toast from "react-hot-toast";

import { imgUrlPublic } from "../lib/img";
import { prefetchProfile } from "../lib/prefetch";
import { preloadImages } from "../lib/imageOptimization";
import { buildCarouselImages } from "../lib/carouselImages";
import { getViewerId } from "../api/services/follows";
import { getFollowStatus } from "../api/services/follows";
import {
  getCachedFollowStatus,
  setCachedFollowStatus,
} from "../lib/followStatusCache";
import {
  getCachedActivities,
  isActivitiesPending,
  subscribeActivitiesCache,
} from "../lib/activitiesCache";
import { type BatchLoadResult } from "../types/legacy";
import { type FeedItem } from "../api/queries/getPublicFeed";
import { requestManager } from "../lib/requestManager";

/** In-memory set of postIds we've attempted fallback for (avoids loops + repeat requests) */
const fallbackAttemptedPostIds = new Set<string>();

/** In-flight dedupe: postId -> Promise so multiple renders can't fire multiple per-post fetches */
const perPostFetchInFlight = new Map<
  string,
  Promise<Array<{ images: string[] | null; order_idx: number | null }>>
>();

type PostProps = {
  postId: string;
  caption: string | null;
  createdAt: string;
  type?: "experience" | "hangout"; // NEW: post type for navigation
  isOwner?: boolean; // NEW: whether this is the current user's own post
  onDelete?: () => void; // NEW: callback when post is deleted
  status?: "draft" | "published"; // NEW: post status for visual indicators
  isDraft?: boolean; // NEW: whether this is a draft from localStorage
  isAnonymous?: boolean; // NEW: whether the author is anonymous
  anonymousName?: string | null; // NEW: anonymous name for anonymous posts
  anonymousAvatar?: string | null; // NEW: anonymous avatar for anonymous posts
  selectedDates?: string[] | null; // NEW: event dates for hangouts
  // [OPTIMIZATION: Phase 1 - PostgreSQL] Full FeedItem with PostgreSQL data
  post?: FeedItem;
  // [OPTIMIZATION: Phase 1 - Batch] Batched data for components (fallback for backward compatibility)
  batchedData?: BatchLoadResult | null;
  // Optional props passed from FeedItem (used when post is provided)
  tags?: string[] | null;
  followStatus?: "none" | "pending" | "following" | "friends";
  isLiked?: boolean;
  isSaved?: boolean;
  commentCount?: number;
  rsvpData?: FeedItem["rsvp_data"];
  /** When false, multi-image feed carousel autoplay is paused (hidden tab / inactive profile sub-tab). */
  slideshowHostVisible?: boolean;

  authorId: string; // profile id (for FollowButton)
  author: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

function Post({
  postId,
  caption,
  authorId,
  author,
  createdAt,
  type = "experience", // Default to experience for backward compatibility
  isOwner = false, // Default to false for backward compatibility
  onDelete,
  status = "published", // Default to published for backward compatibility
  isDraft = false, // Default to false for backward compatibility
  isAnonymous = false, // Default to false for backward compatibility
  anonymousName = null, // Default to null for backward compatibility
  anonymousAvatar = null, // Default to null for backward compatibility
  selectedDates = null, // Default to null for backward compatibility
  post, // [OPTIMIZATION: Phase 1 - PostgreSQL] Full FeedItem with PostgreSQL data
  batchedData, // [OPTIMIZATION: Phase 1 - Batch] Fallback for backward compatibility
  slideshowHostVisible = true,
}: PostProps) {
  const navigate = useNavigate();

  // [OPTIMIZATION: Phase 4 - Prefetch] Prefetch profiles and follow status for visible post authors
  // Why: Instant profile page loads, better perceived performance
  const postRef = useRef<HTMLDivElement>(null);
  // [OPTIMIZATION: Phase 2.2] Ref for IntersectionObserver (fallback query only)
  const rootRef = useRef<HTMLElement | null>(null);
  const lockedNonCloudinaryRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (isAnonymous || isOwner || !authorId || !postRef.current) return;

    // [OPTIMIZATION: Phase 4 - Prefetch] Use Intersection Observer to prefetch when post becomes visible
    // Why: Only prefetch when post is actually visible, saves resources
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          // Post is visible, prefetch in background
          const prefetchData = async () => {
            // [OPTIMIZATION: Phase 6 - Connection] Check connection speed before prefetching
            // Why: Skip prefetching on slow connections to save bandwidth
            const { shouldSkipPrefetching } = await import(
              "../lib/connectionAware"
            );
            if (shouldSkipPrefetching()) {
              observer.disconnect();
              return;
            }
            try {
              const viewerId = await getViewerId();
              if (!viewerId || viewerId === authorId) return;

              // [OPTIMIZATION: Phase 4 - Batch] Batch prefetch follow status and privacy status
              // Why: Single API call for multiple checks, more efficient
              const [
                { getBatchFollowStatuses },
                { getCachedProfile, setCachedProfile },
                { getCachedFollowStatus },
                { setCachedFollowStatus },
              ] = await Promise.all([
                import("../api/services/follows"),
                import("../lib/profileCache"),
                import("../lib/followStatusCache"),
                import("../lib/followStatusCache"),
              ]);

              // Check if already cached
              const cachedFollow = getCachedFollowStatus(viewerId, authorId);
              const cachedProfile = getCachedProfile(authorId);

              // Prefetch follow status if not cached
              if (!cachedFollow) {
                const statuses = await getBatchFollowStatuses(viewerId, [
                  authorId,
                ]);
                if (statuses[authorId]) {
                  setCachedFollowStatus(viewerId, authorId, statuses[authorId]);
                }
              }

              // Prefetch profile if not cached
              if (!cachedProfile && author) {
                setCachedProfile({
                  id: author.id,
                  user_id: "", // Will be fetched if needed
                  username: author.username,
                  display_name: author.display_name,
                  avatar_url: author.avatar_url,
                  bio: null,
                  xp: null,
                  member_no: null,
                  instagram_url: null,
                  tiktok_url: null,
                  telegram_url: null,
                });
              }

              // Prefetch privacy status (handled by privacy filter cache)
            } catch (error) {
              // Silent fail for prefetching
              console.debug("Failed to prefetch post author data:", error);
            }
          };

          // Use requestIdleCallback for non-blocking prefetch
          if (typeof window.requestIdleCallback === "function") {
            window.requestIdleCallback(prefetchData, { timeout: 2000 });
          } else {
            setTimeout(prefetchData, 0);
          }

          // Disconnect observer after first intersection
          observer.disconnect();
        }
      },
      { rootMargin: "100px" } // Start prefetching 100px before post is visible
    );

    observer.observe(postRef.current);

    return () => {
      observer.disconnect();
    };
  }, [authorId, isAnonymous, isOwner, author]);

  // [OPTIMIZATION: Phase 6.2 - React] Memoize computed display name
  // Why: Prevents recalculation on every render, only recalculates when dependencies change
  const displayName = useMemo(() => {
    return isAnonymous && anonymousName
      ? anonymousName
      : author?.display_name || author?.username || "User";
  }, [isAnonymous, anonymousName, author?.display_name, author?.username]);

  // [OPTIMIZATION: Phase 6.2 - React] Memoize date calculation
  // Why: Date calculation involves Date objects and comparisons, memoization improves performance
  const dateText = useMemo(() => {
    if (type === "hangout" && selectedDates && selectedDates.length > 0) {
      // For hangouts, show the event date(s) with special formatting
      const eventDate = new Date(selectedDates[0]);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const eventDay = new Date(
        eventDate.getFullYear(),
        eventDate.getMonth(),
        eventDate.getDate()
      );

      // Check if the event has already passed
      if (eventDay.getTime() < today.getTime()) {
        return "Event Passed";
      }

      // Format relative dates for hangouts
      if (eventDay.getTime() === today.getTime()) {
        return "Today";
      } else if (eventDay.getTime() === tomorrow.getTime()) {
        return "Tomorrow";
      } else {
        // Check if it's this weekend
        const eventDayOfWeek = eventDate.getDay(); // 0 = Sunday, 6 = Saturday
        const todayOfWeek = now.getDay();
        const daysUntilWeekend = 6 - todayOfWeek; // Days until Saturday
        const eventDayTime = eventDate.getTime();
        const weekendStart = new Date(
          today.getTime() + daysUntilWeekend * 24 * 60 * 60 * 1000
        );
        const weekendEnd = new Date(
          weekendStart.getTime() + 24 * 60 * 60 * 1000
        );

        if (
          eventDayTime >= weekendStart.getTime() &&
          eventDayTime <= weekendEnd.getTime()
        ) {
          return "This Weekend";
        }

        // Default to formatted date for hangouts
        return eventDate.toLocaleDateString();
      }
    } else {
      // For experiences or hangouts without event dates, show created date (no special formatting)
      const createdDate = new Date(createdAt);
      return createdDate.toLocaleDateString();
    }
  }, [type, selectedDates, createdAt]);

  // [OPTIMIZATION: Phase 6.2 - React] Memoize special date check
  // Why: Prevents recalculation when other props change
  const shouldHighlight = useMemo(() => {
    // Only highlight special dates for hangouts, not for experiences
    if (type !== "hangout") return false;

    return (
      dateText === "Today" ||
      dateText === "Tomorrow" ||
      dateText === "This Weekend" ||
      dateText === "Event Passed"
    );
  }, [type, dateText]);

  // [OPTIMIZATION: Phase 6.2 - React] Memoize navigation handler
  // Why: Prevents function recreation on every render, stable reference for React.memo
  const goToProfile = useCallback(() => {
    if (!authorId) return;
    const slug = author?.username || authorId;
    // avoids relying on a Paths helper that may differ across files
    navigate(`/u/${slug}`);
  }, [authorId, author?.username, navigate]);

  // lazy-load FIRST activity's images
  const [images, setImages] = useState<string[] | null>(null); // null: unknown; []: none
  const imagesRef = useRef<string[] | null>(null);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  const isCloudinaryUrl = (u?: string | null) =>
    !!u && u.includes("res.cloudinary.com");

  const hasNonCloudinary = (arr?: string[] | null) =>
    !!arr && arr.some((u) => u && !isCloudinaryUrl(u));

  const hasAnyCloudinary = (arr?: string[] | null) =>
    !!arr && arr.some((u) => isCloudinaryUrl(u));

  const setImagesWithReason = (next: string[], reason: string) => {
    const nextHasNonCloudinary = hasNonCloudinary(next);
    const nextHasCloudinary = hasAnyCloudinary(next);
    const nextIsCloudinaryOnly = nextHasCloudinary && !nextHasNonCloudinary;

    if (nextHasNonCloudinary) {
      lockedNonCloudinaryRef.current[postId] = true;
    }

    setImages((prev) => {
      if (
        lockedNonCloudinaryRef.current[postId] === true &&
        nextIsCloudinaryOnly
      ) {
        return prev;
      }
      return next;
    });
  };

  const [imagesLoading, setImagesLoading] = useState(false);
  const [tried, setTried] = useState(false);

  // [OPTIMIZATION: Phase 3.1] Show skeleton immediately if we know post has images
  // Why: Better UX - skeleton appears instantly, not after IntersectionObserver triggers
  // [FIX] undefined = unknown (Home feed RPC omits has_images); only true/false are explicit.
  const hasImages = post?.has_images;
  const [showImageSkeleton, setShowImageSkeleton] = useState(
    hasImages === true
  );

  // [FIX] Move useState declarations before useCallback hooks that use them
  // Why: Prevents "Cannot access before initialization" errors
  const [showInviteDrawer, setShowInviteDrawer] = useState(false);
  const [isInviteDrawerClosing, setIsInviteDrawerClosing] = useState(false);

  // [OPTIMIZATION: Phase 6.2 - React] Memoize navigation handler
  // Why: Prevents function recreation on every render, stable reference for React.memo
  const location = useLocation();
  const goToDetails = useCallback(() => {
    // Don't navigate if invite drawer is closing
    if (isInviteDrawerClosing) {
      console.log("Navigation prevented: invite drawer is closing");
      return;
    }

    // Draft: go to create flow instead of detail
    const isDraftPost =
      status === "draft" || isDraft || postId.startsWith("draft-");
    if (isDraftPost) {
      navigate(`/create/activities?type=${type}`);
      return;
    }

    // Prefetch hero image so modal renders instantly (guarded for real URLs only)
    if (post?.activities?.length) {
      const { images } = buildCarouselImages(post.activities, 400);
      const heroUrl = images[0];
      if (
        heroUrl &&
        (heroUrl.startsWith("http://") || heroUrl.startsWith("https://"))
      ) {
        const img = new Image();
        img.src = heroUrl;
      }
    }

    const detailPath =
      type === "hangout"
        ? Paths.hangoutDetail.replace(":id", postId)
        : Paths.experienceDetail.replace(":id", postId);
    navigate(detailPath, {
      state: { backgroundLocation: location, initialPost: post ?? undefined },
    });
  }, [
    isInviteDrawerClosing,
    postId,
    type,
    status,
    isDraft,
    navigate,
    location,
    post,
  ]);

  // [OPTIMIZATION: Phase 6.2 - React] Memoize edit handler
  // Why: Prevents function recreation on every render, stable reference for React.memo
  const handleEdit = useCallback(async () => {
    const isDraftPost =
      status === "draft" || isDraft || postId.startsWith("draft-");
    if (isDraftPost) {
      navigate(`/create/activities?type=${type}`);
      return;
    }
    try {
      const { post, activities } = await getPostForEdit(postId);

      // Store the current location so we can return to it after edit/cancel
      const returnPath = window.location.pathname;

      // Store the post data in localStorage for the edit flow
      const editData = {
        postId: post.id,
        type: post.type,
        caption: post.caption,
        visibility: post.visibility,
        is_anonymous: post.is_anonymous,
        rsvp_capacity: post.rsvp_capacity,
        selected_dates: post.selected_dates,
        is_recurring: post.is_recurring,
        recurrence_days: post.recurrence_days,
        tags: post.tags,
        returnPath: returnPath, // Store where we came from
        activities: activities.map((activity) => ({
          id: activity.id,
          title: activity.title,
          activityType: activity.activity_type || "",
          customActivity: activity.custom_activity || "",
          locationDesc: activity.location_desc || "",
          location: activity.location_name || "",
          locationNotes: activity.location_notes || "",
          locationUrl: activity.location_url || "",
          additionalInfo: activity.additional_info || [],
          tags: activity.tags || [],
          images: activity.images || [],
          order_idx: activity.order_idx,
        })),
      };

      localStorage.setItem("editPostData", JSON.stringify(editData));

      // Navigate to the activities page (first step of edit flow)
      navigate(Paths.createActivities);
    } catch (error) {
      console.error("Error loading post for edit:", error);
      toast.error("Failed to load post for editing");
    }
  }, [postId, navigate, status, isDraft, type]);

  // [OPTIMIZATION: Phase 2.2] Use activities from PostgreSQL if available
  // Why: Eliminates separate activities queries, reduces egress by 50-60%, images available immediately
  useEffect(() => {
    // Step 1: Check if activities are already in post prop (from PostgreSQL function)
    if (post?.activities && post.activities.length > 0) {
      const result = buildCarouselImages(post.activities, 400);
      if (result.images.length > 0) {
        setShowImageSkeleton(true);
        setImagesLoading(true);
        setImagesWithReason(result.images, "STEP1 post.activities");
        setShowImageSkeleton(false);
        preloadImages(result.images).catch(() => {});
      } else {
        setImagesWithReason([], "NO_IMAGES");
        setShowImageSkeleton(false);
      }
      setImagesLoading(false);
      if (result.images.length > 0) return;
    }

    // Step 2: Fallback - Use has_images flag to show skeleton immediately (if available)
    if (hasImages) {
      setShowImageSkeleton(true);
      setImagesLoading(true);
    }
  }, [post?.activities, hasImages]); // Only run when activities or hasImages change

  // When ProgressiveFeed's batch completes after this card already read an empty/partial cache,
  // upgrade carousel images without a second IntersectionObserver pass.
  useEffect(() => {
    return subscribeActivitiesCache(postId, () => {
      const cached = getCachedActivities(postId);
      if (cached == null) return;
      const result = buildCarouselImages(cached, 400);
      if (result.images.length === 0) return;
      const curLen = imagesRef.current?.length ?? 0;
      if (result.images.length <= curLen) return;
      setImagesWithReason(result.images, "CACHE activities batch (late)");
      preloadImages(result.images).catch(() => {});
    });
  }, [postId]);

  // Step 3: Fallback - Query activities only if not in post prop (backward compatibility)
  // This handles: old cached data, legacy code paths, or posts loaded without PostgreSQL function
  // Only runs if we don't have activities from PostgreSQL
  useEffect(() => {
    // [FIX] Guard: prevent repeat attempts (effect re-runs, in-flight races)
    if (fallbackAttemptedPostIds.has(postId)) {
      return;
    }

    // [SHRINK] Feed returns first_image_url only; we may have 1 image. Still run fallback to check
    // batch cache (which has full carousel). Don't skip - cache may have more images.

    // [FIX] Skip fallback when has_images=false ONLY if we have strong evidence there are no images.
    // Home feed can return has_images=false + activities=[] incorrectly; allow fallback when activities
    // is missing/empty so we can fetch from DB. Skip only when we have activities with all empty images.
    if (post?.has_images === false) {
      const hasActivitiesWithAllEmpty =
        post.activities &&
        post.activities.length > 0 &&
        post.activities.every((a) => (a.images?.length ?? 0) === 0);
      if (hasActivitiesWithAllEmpty) {
        return;
      }
    }

    // Skip if already tried or no root element
    if (tried || !rootRef.current) {
      return;
    }

    const node = rootRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setTried(true);
          // Mark attempted BEFORE fetch to prevent repeat attempts from effect re-runs while in flight
          fallbackAttemptedPostIds.add(postId);

          (async () => {
            try {
              // Check batch-fetch cache first (ProgressiveFeed may have populated it)
              let cached = getCachedActivities(postId);
              if (cached !== null) {
                if (cached.length > 0) {
                  const result = buildCarouselImages(cached, 400);
                  if (result.images.length > 0) {
                    if (!showImageSkeleton) setImagesLoading(true);
                    setImagesWithReason(
                      result.images,
                      "CACHE activities batch"
                    );
                    setShowImageSkeleton(false);
                    preloadImages(result.images).catch(() => {});
                  } else {
                    setImagesWithReason([], "NO_IMAGES");
                    setShowImageSkeleton(false);
                  }
                } else {
                  setImagesWithReason([], "NO_IMAGES");
                  setShowImageSkeleton(false);
                }
                setImagesLoading(false);
                obs.disconnect();
                return;
              }

              // Batch mode: when pending, NEVER do per-post fetch - retry cache only
              if (isActivitiesPending(postId)) {
                const MAX_RETRIES = 3;
                const RETRY_MS = 300;
                for (let r = 0; r < MAX_RETRIES; r++) {
                  await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
                  cached = getCachedActivities(postId);
                  if (cached !== null) {
                    if (cached.length > 0) {
                      const result = buildCarouselImages(cached, 400);
                      if (result.images.length > 0) {
                        if (!showImageSkeleton) setImagesLoading(true);
                        setImagesWithReason(
                          result.images,
                          "CACHE activities batch"
                        );
                        setShowImageSkeleton(false);
                        preloadImages(result.images).catch(() => {});
                      } else {
                        setImagesWithReason([], "NO_IMAGES");
                        setShowImageSkeleton(false);
                      }
                    } else {
                      setImagesWithReason([], "NO_IMAGES");
                      setShowImageSkeleton(false);
                    }
                    setImagesLoading(false);
                    obs.disconnect();
                    return;
                  }
                }
                // After retries: no cache yet - use feed's first_image_url if any, else "no activities"
                const fromFeed =
                  post?.activities?.flatMap((a) => a.images ?? []) ?? [];
                if (fromFeed.length > 0) {
                  const result = buildCarouselImages(
                    fromFeed.map((img) => ({ images: [img], order_idx: 0 })),
                    400
                  );
                  setImagesWithReason(result.images, "FEED first_image_url");
                  preloadImages(result.images).catch(() => {});
                } else {
                  setImagesWithReason([], "NO_IMAGES");
                }
                setShowImageSkeleton(false);
                setImagesLoading(false);
                obs.disconnect();
                return;
              }

              // Skip RPC when we already have multiple hero URLs from the post payload (e.g. profile).
              // Feed shrink usually yields a single first_image_url — then we still RPC below.
              const fromPostActivities =
                post?.activities && post.activities.length > 0
                  ? buildCarouselImages(post.activities, 400).images
                  : [];
              if (fromPostActivities.length > 1) {
                obs.disconnect();
                return;
              }

              // In-flight dedupe: reuse existing fetch (use RPC, no REST activities?select=)
              let fetchPromise = perPostFetchInFlight.get(postId);
              if (!fetchPromise) {
                fetchPromise = (async () => {
                  const { data: rows } = await requestManager.execute(
                    `activities_rpc:${postId}`,
                    async () => {
                      const { data, error } = await supabase.rpc(
                        "get_activities_for_posts_sanitized",
                        { p_post_ids: [postId] }
                      );
                      if (error) throw error;
                      return data ?? [];
                    }
                  );
                  return (rows ?? []).map(
                    (r: {
                      post_id?: string;
                      images?: string[] | null;
                      order_idx?: number | null;
                    }) => ({
                      images: (r.images ?? []) as string[] | null,
                      order_idx:
                        typeof r.order_idx === "number" ? r.order_idx : 0,
                    })
                  );
                })();
                perPostFetchInFlight.set(postId, fetchPromise);
              }

              const activities = await fetchPromise;
              perPostFetchInFlight.delete(postId);

              const result = buildCarouselImages(activities, 400);
              if (result.images.length > 0) {
                if (!showImageSkeleton) setImagesLoading(true);
                setImagesWithReason(result.images, "FALLBACK activities query");
                setShowImageSkeleton(false);
                preloadImages(result.images).catch(() => {});
              } else {
                setImagesWithReason([], "NO_IMAGES");
                setShowImageSkeleton(false);
              }
            } finally {
              setImagesLoading(false);
              obs.disconnect();
            }
          })();
        }
      },
      // [OPTIMIZATION: Phase 5 - Image] Optimized rootMargin for better prefetching
      // Why: 150px is optimal balance - prefetches early enough without wasting bandwidth
      { root: null, rootMargin: "150px 0px", threshold: 0.01 }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [post?.activities, postId, tried, showImageSkeleton, hasImages]); // Added hasImages to dependencies since we use it in the effect

  const isDraftPost = status === "draft" || isDraft;

  // [OPTIMIZATION: Phase 6.2 - React] Memoize invite handler
  // Why: Prevents function recreation on every render, stable reference
  const handleInvite = useCallback(() => {
    setShowInviteDrawer(true);
  }, []);

  return (
    <article
      ref={(el) => {
        rootRef.current = el;
        postRef.current = el as HTMLDivElement | null; // [OPTIMIZATION: Phase 4 - Prefetch] Also set postRef for prefetching
      }}
      className={`w-full border-t border-[var(--border)] px-0 py-3 ${
        isDraftPost ? "opacity-60" : ""
      }`}
    >
      <div className="flex gap-3">
        {/* LEFT: avatar column */}
        {/* LEFT: avatar column */}
        <div className="pt-1">
          <div
            role="button"
            onClick={isAnonymous ? undefined : goToProfile}
            onMouseEnter={() =>
              !isAnonymous &&
              author?.username &&
              prefetchProfile(author.username)
            }
            onTouchStart={() =>
              !isAnonymous &&
              author?.username &&
              prefetchProfile(author.username)
            }
          >
            <Avatar
              url={isAnonymous ? undefined : author?.avatar_url || undefined}
              name={displayName}
              size={40}
              postType={type}
              variant={isAnonymous ? "anon" : "default"}
              anonymousAvatar={isAnonymous ? anonymousAvatar : undefined}
              userId={isAnonymous ? null : author?.id || null} // [OPTIMIZATION: Phase 3.2] Pass userId for cache lookup
            />
          </div>
        </div>

        {/* RIGHT: content column — everything on one vertical rail */}
        <div className="flex-1 min-w-0 relative">
          {/* header: name · date + draft badge + follow */}
          <div className="flex items-center gap-2">
            <button
              className="text-xs font-medium hover:underline"
              onClick={isAnonymous ? undefined : goToProfile}
              onMouseEnter={() =>
                !isAnonymous &&
                author?.username &&
                prefetchProfile(author.username)
              }
              onTouchStart={() =>
                !isAnonymous &&
                author?.username &&
                prefetchProfile(author.username)
              }
            >
              {displayName}
            </button>
            <span
              className={`text-[10px] ${
                shouldHighlight
                  ? "px-2 py-0.5 rounded-md font-medium"
                  : "text-[var(--text)]/60"
              }`}
              style={
                shouldHighlight
                  ? {
                      backgroundColor: "var(--date-highlight-bg)",
                      color: "var(--date-highlight-text)",
                    }
                  : {}
              }
            >
              · {dateText}
            </span>
            {isDraftPost && (
              <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-600 rounded-full border border-yellow-500/30">
                Draft
              </span>
            )}
          </div>

          {/* Three dots menu - Edit/Delete for owner, Report for non-owner */}
          <div className="absolute top-0 right-0">
            <PostMenu
              postId={postId}
              isOwner={isOwner}
              onEdit={handleEdit}
              onDelete={onDelete}
              isDraft={isDraftPost}
            />
          </div>

          {/* caption — clamp on feed/profile lists; full text on post detail */}
          {caption && (
            <p
              className="mt-2 cursor-pointer whitespace-pre-wrap text-left text-[13px] leading-snug text-[var(--text)]/90 line-clamp-6 break-words"
              onClick={goToDetails}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  goToDetails();
                }
              }}
            >
              {caption}
            </p>
          )}

          {/* Continue Editing button for drafts */}
          {isDraftPost && isOwner && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                // Navigate to continue editing the draft
                window.location.href = `/create/activities?type=${type}`;
              }}
              className="mt-3 px-3 py-1.5 text-xs bg-yellow-500 text-black rounded-full hover:brightness-110 transition"
            >
              Continue Editing
            </button>
          )}

          {/* media row — show placeholder while loading, nothing if no images */}
          {/* [OPTIMIZATION: Phase 3.1] Show skeleton immediately if has_images is true */}
          {(imagesLoading || showImageSkeleton) && (
            <div className="mt-3 rounded-2xl border border-[var(--border)] overflow-hidden">
              <div className="w-full aspect-video bg-[var(--text)]/5 animate-pulse" />
            </div>
          )}
          {!imagesLoading &&
            !showImageSkeleton &&
            images &&
            images.length > 0 && (
              <div className="mt-3" role="button" onClick={goToDetails}>
                <MediaCarousel
                  images={images}
                  maxHeight="44vh"
                  autoplay={images.length > 1}
                  hostVisible={slideshowHostVisible}
                />
              </div>
            )}

          {/* actions row */}
          <div className="mt-4 text-[var(--text)]/85">
            <PostActions
              postId={postId}
              authorId={isAnonymous ? undefined : authorId}
              postType={type}
              caption={caption}
              postImageUrl={images && images.length > 0 ? images[0] : null}
              postAuthor={
                isAnonymous
                  ? undefined
                  : author
                  ? {
                      id: authorId,
                      username: author.username,
                      display_name: author.display_name,
                      avatar_url: author.avatar_url,
                      is_anonymous: false,
                    }
                  : undefined
              }
              post={post}
              batchedData={batchedData}
              onInvite={handleInvite}
            />
          </div>
        </div>
      </div>

      {/* Invite Drawer */}
      <InviteDrawer
        isOpen={showInviteDrawer}
        onClose={() => setShowInviteDrawer(false)}
        postId={postId}
        postType={type}
        postCaption={caption || "Untitled"}
        onClosingChange={setIsInviteDrawerClosing}
      />
    </article>
  );
}

// [OPTIMIZATION: Phase 6.2 - React] Memoize Post component to prevent unnecessary re-renders
// Why: Post components are rendered frequently in lists, memoization reduces render overhead
export default React.memo(Post, (prevProps, nextProps) => {
  const prevSig = (prevProps.post?.activities ?? [])
    .map((a) => a?.images?.length ?? 0)
    .join(",");
  const nextSig = (nextProps.post?.activities ?? [])
    .map((a) => a?.images?.length ?? 0)
    .join(",");
  return (
    prevProps.postId === nextProps.postId &&
    prevProps.caption === nextProps.caption &&
    prevProps.authorId === nextProps.authorId &&
    prevProps.author?.id === nextProps.author?.id &&
    prevProps.author?.username === nextProps.author?.username &&
    prevProps.author?.display_name === nextProps.author?.display_name &&
    prevProps.author?.avatar_url === nextProps.author?.avatar_url &&
    prevProps.createdAt === nextProps.createdAt &&
    prevProps.type === nextProps.type &&
    prevProps.isOwner === nextProps.isOwner &&
    prevProps.status === nextProps.status &&
    prevProps.isDraft === nextProps.isDraft &&
    prevProps.isAnonymous === nextProps.isAnonymous &&
    prevProps.anonymousName === nextProps.anonymousName &&
    prevProps.anonymousAvatar === nextProps.anonymousAvatar &&
    prevProps.post?.has_images === nextProps.post?.has_images &&
    (prevProps.post?.activities?.length ?? 0) ===
      (nextProps.post?.activities?.length ?? 0) &&
    prevSig === nextSig &&
    prevProps.post?.like_count === nextProps.post?.like_count &&
    prevProps.post?.is_liked === nextProps.post?.is_liked &&
    prevProps.post?.is_saved === nextProps.post?.is_saved &&
    prevProps.post?.comment_count === nextProps.post?.comment_count &&
    prevProps.post?.follow_status === nextProps.post?.follow_status &&
    JSON.stringify(prevProps.selectedDates) ===
      JSON.stringify(nextProps.selectedDates)
  );
});
