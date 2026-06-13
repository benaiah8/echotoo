// src/components/detail/PostDetailBody.tsx
import MediaCarousel from "../../components/MediaCarousel";
import Avatar from "../ui/Avatar";
import FollowButton from "../ui/FollowButton";
import GoogleMapsEmbed from "../ui/GoogleMapsEmbed";
import RSVPComponent from "../ui/RSVPComponent";
import PostMenu from "../ui/PostMenu";
import PostActions from "../ui/PostActions";
import StickyPostActions from "../ui/StickyPostActions";
import InviteDrawer from "../ui/InviteDrawer";
import CommentList from "../ui/CommentList";
import { scrollModalCommentsContentAboveComposer } from "../../lib/postDetailCommentsScroll";
import { buildCarouselImages } from "../../lib/carouselImages";
import { useNavigate, useLocation } from "react-router-dom";
import { Paths } from "../../router/Paths";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import { supabase } from "../../lib/supabaseClient";
import { emitPostChanged } from "../../lib/postEvents";
import { getPostForEdit } from "../../api/services/posts";
import type { PostDetailNavigateState } from "../../lib/postDetailNavigationState";
import {
  buildCanonicalEditPostData,
  createEditActivitiesHref,
  persistCanonicalEditPostData,
} from "../../lib/editPostBootstrap";
import toast from "react-hot-toast";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import { RootState } from "../../app/store";
import { setAuthModal } from "../../reducers/modalReducer";
import ReportModal from "../ui/ReportModal";
import { PostTypeMetaChip } from "../ui/PostFeedSurfaceMeta";
import PostRatingSummary from "../ui/PostRatingSummary";
import {
  buildPostReportDraftFromFeedItem,
  type ReportDraft,
} from "../../types/report";
import {
  formatDateSummary,
  formatFinalizeRecurrenceSummaryLine,
  formatFinalizeSelectedDatesSummaryLine,
} from "../../lib/createFlowDateSummary";
import { visibleActivityTagLines } from "../../lib/createFlowLimitUtils";
import { formatHashtagForDisplay } from "../../lib/createFlowLimits";
import {
  buildTimelineDisplayItems,
  getTimelineSectionLabel,
  getTimelineStopHeadingText,
  shouldShowTimelineStopHeading,
} from "../../lib/createFlowMeaningfulActivity";
import { ReadOnlyActivityTagLine } from "./ReadOnlyActivityTagLine";
import { AdditionalInfoSemanticRows } from "./AdditionalInfoSemanticRows";
import { PiCalendarBlank, PiListBullets, PiMapPin } from "react-icons/pi";
import {
  getPostScheduleLabel,
  type PostScheduleLabelKind,
} from "../../lib/postScheduleLabel";
// [OPTIMIZATION: Phase 3.4] Removed BatchLoadResult - PostgreSQL function provides all data

/** Light emphasis for detail author subline (no feed pills). */
function detailHeaderScheduleLabelClass(kind: PostScheduleLabelKind): string {
  switch (kind) {
    case "today":
      return "font-medium text-green-600";
    case "tomorrow":
      return "font-medium text-amber-600";
    case "next_weekday":
      return "font-medium text-[var(--text)]/80";
    case "in_days":
      return "text-[var(--text)]/70";
    case "passed":
      return "italic text-[var(--text)]/50";
    default:
      return "";
  }
}

// ---- Types the component will accept (all extras are optional) ----
// [OPTIMIZATION: Phase 3.4] Post type now extends FeedItem for consistency
export type Post = FeedItem & {
  status?: "draft" | "published";
  visibility?: "public" | "friends" | "private";
  rsvp_capacity?: number | null;
  is_recurring?: boolean | null;
  recurrence_days?: string[] | null;
  // activities (server format) - included in FeedItem but explicitly typed here
  activities: {
    title: string | null;
    images: string[] | null;
    order_idx: number | null;
    location_name?: string | null;
    location_desc?: string | null;
    // Google Maps and location details
    location_url?: string | null;
    location_notes?: string | null;
    // optional advanced meta
    additional_info?: { title: string; value: string }[] | null;
    // activity tags (multiple activities within this activity section)
    tags?: string[] | null;
  }[];
};

export default function PostDetailBody({
  post,
  isPreview = false,
  onClose,
  previewHeroOverlay,
  /**
   * Create-flow merged final step: hide the sticky post action bar and post menu;
   * use create-flow top chrome instead. Keeps hero/main layout aligned with `topOffset` 0.
   */
  composeFinalizeShell = false,
  /**
   * Create finalize step: inline caption editor in the post caption slot (replaces static caption).
   */
  composeFinalizeCaption,
  /** Create finalize: metadata row + shared panel (rendered below caption, above inline preview chips). */
  composeFinalizeBelowCaption,
  composeFinalizeStripPreviewMeta = false,
  /** Create finalize: hide author/profile preview row (avatar, name, type chip, schedule subline). */
  composeFinalizeHideAuthorPreview = false,
  /** Create finalize: full-width image CTA when there is no hero yet (safe-area handled here). */
  composeFinalizeEmptyHeroCta,
  /** Create finalize: secondary image CTA below hero when images exist (not overlaid on carousel). */
  composeFinalizeBelowHeroImageCta,
  /** Create finalize: overlay image CTA dock pinned to hero bottom. */
  composeFinalizeHeroBottomOverlayCta,
  /** Create finalize: full-width Activities entry (above the activity timeline when shown). */
  composeFinalizeActivitiesCta,
  /**
   * Create finalize: when false, hide the read-only activity timeline (e.g. untouched seeded stop).
   * Omit or true everywhere else.
   */
  composeFinalizeShowActivityTimeline,
  /** Opened from feed comment control (router state): focus composer when comments are ready. */
  autoFocusCommentComposer = false,
  /** Modal: portal host for comment composer (sibling to modal scroll root). */
  modalComposerPortalHost = null,
}: {
  post: Post;
  isPreview?: boolean;
  onClose?: () => void;
  /** When `isPreview`, optional node fixed over the hero carousel (e.g. upload status pill). */
  previewHeroOverlay?: ReactNode;
  composeFinalizeShell?: boolean;
  composeFinalizeCaption?: {
    value: string;
    onChange: (next: string) => void;
    /** Hard cap (e.g. finalize publish limit); enforced in onChange + maxLength. */
    maxLength?: number;
    /** Matches create-flow caption-required notice highlight */
    highlight?: boolean;
    /** Brief landing emphasis (fades when parent clears) */
    entryPulse?: boolean;
    /** When false, hero/author/below stay at full prominence (e.g. user tapped outside caption). Default: dim. */
    surroundingDeemphasize?: boolean;
    onCaptionFocusChange?: (focused: boolean) => void;
    /** Rendered inside the caption card below the textarea (e.g. tags field on finalize). */
    belowCaption?: ReactNode;
  };
  composeFinalizeBelowCaption?: ReactNode;
  /** Hide inline tags / schedule / RSVP preview rows (finalize uses caption + metadata row instead). */
  composeFinalizeStripPreviewMeta?: boolean;
  composeFinalizeHideAuthorPreview?: boolean;
  composeFinalizeEmptyHeroCta?: ReactNode;
  composeFinalizeBelowHeroImageCta?: ReactNode;
  composeFinalizeHeroBottomOverlayCta?: ReactNode;
  composeFinalizeActivitiesCta?: ReactNode;
  composeFinalizeShowActivityTimeline?: boolean;
  autoFocusCommentComposer?: boolean;
  modalComposerPortalHost?: HTMLElement | null;
  // [OPTIMIZATION: Phase 3.4] Removed batchedData - PostgreSQL function provides all data in post object
}) {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showInviteDrawer, setShowInviteDrawer] = useState(false);
  const [isInviteDrawerClosing, setIsInviteDrawerClosing] = useState(false);
  const dispatch = useDispatch();
  const authState = useSelector((state: RootState) => state.auth);
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);

  const handleRequestPostReport = useCallback(() => {
    const authLoading = authState?.loading ?? true;
    const isAuthenticated = !!authState?.user;
    if (!authLoading && !isAuthenticated) {
      dispatch(setAuthModal(true));
      return;
    }
    setReportDraft(buildPostReportDraftFromFeedItem(post));
  }, [authState?.loading, authState?.user, dispatch, post]);

  // Emit post:changed when follow:changed fires for this post's author (sync feed + modal)
  useEffect(() => {
    const handleFollowChange = (e: Event) => {
      const { targetId, status } = (e as CustomEvent).detail || {};
      const authorProfileId = post.author?.id;
      if (!authorProfileId) return;
      if (targetId === authorProfileId && status) {
        emitPostChanged(post.id, { viewerFollowStatus: status });
      }
    };
    window.addEventListener(
      "follow:changed",
      handleFollowChange as EventListener
    );
    return () =>
      window.removeEventListener(
        "follow:changed",
        handleFollowChange as EventListener
      );
  }, [post.id, post.author?.id]);

  // Get current user ID to check if it's the author
  useEffect(() => {
    const getCurrentUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setCurrentUserId(session?.user?.id || null);
    };
    getCurrentUser();
  }, []);

  const isOwner = currentUserId === post.author_id;
  const isDraft = post.status === "draft";

  const handleEdit = async () => {
    try {
      const postData = await getPostForEdit(post.id);
      if (postData) {
        const navState = routerLocation.state as PostDetailNavigateState | null;
        const overlayBg = navState?.backgroundLocation;
        const editData = buildCanonicalEditPostData(
          postData.post,
          postData.activities,
          {
            returnPath: window.location.pathname,
            ...(overlayBg != null
              ? {
                  returnState: {
                    backgroundLocation: overlayBg as unknown,
                    initialPost: post as unknown,
                  },
                }
              : {}),
          }
        );
        persistCanonicalEditPostData(editData);
        navigate(createEditActivitiesHref(postData.post.type));
      }
    } catch (error) {
      console.error("Error loading post for edit:", error);
      toast.error("Failed to load post for editing");
    }
  };

  /** PostMenu performs delete + toast; this runs only after success (dismiss modal or leave full-page detail). */
  const handleAfterDelete = () => {
    if (onClose) {
      onClose();
    } else {
      navigate(Paths.home);
    }
  };

  const handleInvite = () => {
    if (!isDraft) {
      setShowInviteDrawer(true);
    }
  };

  const commentComposerFocusRef = useRef<(() => void) | null>(null);
  /** Full-page detail only: one scroll when opening with `autoFocusCommentComposer` (modal scroll is handled in PostDetailModal via `scrollToComments` / legacy `focusCommentComposer`). */
  const fullPageCommentScrollDoneRef = useRef(false);

  const setFocusComposer = useCallback((fn: () => void) => {
    commentComposerFocusRef.current = fn;
  }, []);

  const handleStickyCommentClick = useCallback(() => {
    scrollModalCommentsContentAboveComposer({ behavior: "smooth" });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        commentComposerFocusRef.current?.();
      });
    });
  }, []);

  useEffect(() => {
    fullPageCommentScrollDoneRef.current = false;
  }, [post.id]);

  useEffect(() => {
    if (!autoFocusCommentComposer || onClose) return;
    if (fullPageCommentScrollDoneRef.current) return;
    fullPageCommentScrollDoneRef.current = true;
    const t = window.setTimeout(() => {
      document.querySelector("[data-comments-section]")?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }, 120);
    return () => clearTimeout(t);
  }, [autoFocusCommentComposer, onClose, post.id]);

  const vis = post.visibility || "public";
  const anon = Boolean(post.is_anonymous);

  const displayName =
    anon && post.anonymous_name
      ? post.anonymous_name
      : post.author?.display_name || post.author?.username || "User";

  const goToProfile = () => {
    const slug = post.author?.username || post.author_id || "";
    if (slug) navigate(Paths.user.replace(":username", slug));
  };

  // HERO images: same URL/order as feed for cache continuity when opening from feed
  const { images: gallery } = buildCarouselImages(post.activities ?? [], 400);

  const tags =
    post.tags && post.tags.length > 0
      ? post.tags
      : [post.type === "experience" ? "Experience" : "Event"];

  // Clearance below sticky actions (floating glass bar is shorter than legacy full-width bar).
  // Create finalize step uses CreateFlowTopBar + notice stack instead of StickyPostActions.
  const topOffset = composeFinalizeShell ? "0px" : "46px";
  /** Modal only: small gap so the hero is not flush against the floating pill */
  const heroBelowBarGap = onClose ? "12px" : "0px";

  /** Extra air below CreateFlowTopBar for finalize hero/CTA (not a second safe-area — additive px only). */
  const finalizeHeroBreathing = composeFinalizeShell ? "20px" : "0px";

  const finalizeSurroundingsDim =
    composeFinalizeCaption != null &&
    composeFinalizeCaption.surroundingDeemphasize !== false;

  const finalizeEmptyHeroActive = Boolean(
    composeFinalizeShell && gallery.length === 0 && composeFinalizeEmptyHeroCta
  );

  const hideFinalizeActivityTimeline =
    composeFinalizeShell && composeFinalizeShowActivityTimeline === false;

  const timelineDisplayItems = useMemo(
    () => buildTimelineDisplayItems(post.activities ?? []),
    [post.activities]
  );

  const timelineSectionLabel = useMemo(
    () => getTimelineSectionLabel(timelineDisplayItems),
    [timelineDisplayItems]
  );

  const detailPostType = post.type === "hangout" ? "hangout" : "experience";

  const headerScheduleLabel = useMemo(
    () =>
      getPostScheduleLabel({
        type: detailPostType,
        createdAt: post.created_at,
        selectedDates: post.selected_dates,
        isRecurring: post.is_recurring,
        recurrenceDays: post.recurrence_days,
      }),
    [
      detailPostType,
      post.created_at,
      post.selected_dates,
      post.is_recurring,
      post.recurrence_days,
    ]
  );

  const scheduleDates = (post.selected_dates || []).map((s) => new Date(s));
  const recurrenceCodes = (post.recurrence_days || [])
    .map(String)
    .filter(Boolean);
  const recurringForDisplay =
    Boolean(post.is_recurring) || recurrenceCodes.length > 0;
  const scheduleGroups = formatDateSummary(scheduleDates);
  const scheduleSummaryLine = formatFinalizeSelectedDatesSummaryLine(
    scheduleGroups,
    scheduleDates
  );
  const recurrenceSummaryLine = formatFinalizeRecurrenceSummaryLine(
    recurringForDisplay,
    recurrenceCodes
  );
  const showScheduleBlock =
    (scheduleSummaryLine != null && scheduleSummaryLine.length > 0) ||
    (recurrenceSummaryLine != null && recurrenceSummaryLine.length > 0);

  const computeBlendedEffectiveFromReal = useCallback(
    (nextRealAverage: number | null | undefined, nextRealCount: number | null | undefined) => {
      const currentRealCount =
        typeof post.rating_count === "number" && Number.isFinite(post.rating_count)
          ? post.rating_count
          : 0;
      const currentRealAverage =
        typeof post.rating_average === "number" && Number.isFinite(post.rating_average)
          ? post.rating_average
          : 0;
      const currentEffectiveCount =
        typeof post.effective_rating_count === "number" &&
        Number.isFinite(post.effective_rating_count)
          ? post.effective_rating_count
          : currentRealCount;
      const currentEffectiveAverage =
        typeof post.effective_rating_average === "number" &&
        Number.isFinite(post.effective_rating_average)
          ? post.effective_rating_average
          : currentRealAverage;
      const demoCount = Math.max(0, currentEffectiveCount - currentRealCount);
      const demoWeightedTotal =
        currentEffectiveAverage * currentEffectiveCount -
        currentRealAverage * currentRealCount;
      const demoAverage = demoCount > 0 ? demoWeightedTotal / demoCount : 0;
      const realCount =
        typeof nextRealCount === "number" && Number.isFinite(nextRealCount)
          ? nextRealCount
          : 0;
      const realAverage =
        typeof nextRealAverage === "number" && Number.isFinite(nextRealAverage)
          ? nextRealAverage
          : 0;
      const effectiveCount = demoCount + realCount;
      const effectiveAverage =
        effectiveCount > 0
          ? Number(((demoAverage * demoCount + realAverage * realCount) / effectiveCount).toFixed(1))
          : 0;
      return { effectiveAverage, effectiveCount };
    },
    [post]
  );

  // --- UI ---
  return (
    <>
      {/* STICKY INTERACTION BAR (hidden on create merged final step — use CreateFlowTopBar) */}
      {!composeFinalizeShell ? (
        <div className="contents" data-sticky-post-actions>
          <StickyPostActions
            postId={post.id}
            authorId={!anon ? post.author_id : undefined}
            post={post}
            barVariant={onClose ? "floatingGlass" : "default"}
            onClose={onClose}
            postType={post.type}
            caption={post.caption ?? null}
            postImageUrl={gallery.length > 0 ? gallery[0] : null}
            postAuthor={
              !anon && post.author
                ? {
                    id: post.author_id,
                    username: post.author.username ?? null,
                    display_name: post.author.display_name ?? null,
                    avatar_url: post.author.avatar_url ?? null,
                    is_anonymous: false,
                  }
                : undefined
            }
            onInvite={handleInvite}
            onCommentClick={onClose ? handleStickyCommentClick : undefined}
          />
        </div>
      ) : null}

      {/* Create finalize: full-width image CTA when no hero; optional upload pill overlays it. */}
      {finalizeEmptyHeroActive ? (
        <div
          className={[
            "relative w-full page-content-wide mb-2",
            finalizeSurroundingsDim
              ? "opacity-[0.80] transition-opacity duration-300"
              : "",
          ].join(" ")}
          style={{
            paddingTop: `calc(${topOffset} + env(safe-area-inset-top, 0px) + ${heroBelowBarGap} + ${finalizeHeroBreathing})`,
            minHeight: "44px",
          }}
        >
          <div className="w-full px-1">{composeFinalizeEmptyHeroCta}</div>
          {isPreview && previewHeroOverlay ? (
            <div
              className="pointer-events-none absolute left-1/2 z-[25] flex w-full max-w-[calc(100%-1rem)] -translate-x-1/2 justify-center px-2"
              style={{
                top: `calc(${topOffset} + env(safe-area-inset-top, 0px) + ${heroBelowBarGap} + ${finalizeHeroBreathing} + 10px)`,
              }}
            >
              {previewHeroOverlay}
            </div>
          ) : null}
        </div>
      ) : isPreview && gallery.length === 0 && previewHeroOverlay ? (
        <div
          className={[
            composeFinalizeShell
              ? "relative w-full page-content-wide mb-[0.45rem]"
              : "relative w-full page-content-wide mb-2",
            finalizeSurroundingsDim
              ? "opacity-[0.80] transition-opacity duration-300"
              : "",
          ].join(" ")}
          style={{
            paddingTop: `calc(${topOffset} + env(safe-area-inset-top, 0px) + ${heroBelowBarGap} + 8px)`,
            minHeight: "44px",
          }}
        >
          <div className="pointer-events-none flex justify-center px-2">
            {previewHeroOverlay}
          </div>
        </div>
      ) : null}

      {/* HERO CAROUSEL (contain, lightbox) - aspect-ratio reserves space to avoid layout shift */}
      {gallery.length > 0 && (
        <div
          className={[
            composeFinalizeShell
              ? "relative w-full page-content-wide mb-2 min-h-0"
              : "relative w-full page-content-wide mb-2 min-h-0",
            finalizeSurroundingsDim
              ? "opacity-[0.80] transition-opacity duration-300"
              : "",
          ].join(" ")}
          data-media-control
          style={{
            aspectRatio: "4/5",
            maxHeight: "50vh",
            paddingTop: `calc(${topOffset} + env(safe-area-inset-top, 0px) + ${heroBelowBarGap} + ${finalizeHeroBreathing})`,
          }}
        >
          <div
            className="absolute left-0 right-0 bottom-0 z-0"
            data-carousel-control
            data-image-control
            style={{
              top: `calc(${topOffset} + env(safe-area-inset-top, 0px) + ${heroBelowBarGap} + ${finalizeHeroBreathing})`,
            }}
          >
            <MediaCarousel
              images={gallery}
              fit="contain"
              enableLightbox={!isPreview}
              maxHeight="100%"
              className="h-full"
              autoplay={false}
              interactiveDots={!isPreview}
            />
          </div>
          {isPreview && previewHeroOverlay ? (
            <div
              className="pointer-events-none absolute left-1/2 z-[25] flex w-full max-w-[calc(100%-1rem)] -translate-x-1/2 justify-center px-2"
              style={{
                top: `calc(${topOffset} + env(safe-area-inset-top, 0px) + ${heroBelowBarGap} + ${finalizeHeroBreathing} + 10px)`,
              }}
            >
              {previewHeroOverlay}
            </div>
          ) : null}
          {composeFinalizeShell &&
          isPreview &&
          composeFinalizeHeroBottomOverlayCta ? (
            <div className="absolute inset-x-0 bottom-0 z-[26] px-2 pb-2">
              {composeFinalizeHeroBottomOverlayCta}
            </div>
          ) : null}
        </div>
      )}

      {/* Create finalize: Add more photos — document flow below hero (never over the carousel). */}
      {composeFinalizeShell &&
      gallery.length > 0 &&
      composeFinalizeBelowHeroImageCta ? (
        <div className="relative w-full page-content-wide mb-2 px-1">
          {composeFinalizeBelowHeroImageCta}
        </div>
      ) : null}

      {/* MAIN COLUMN */}
      <div
        className="w-full page-content-wide"
        style={{
          paddingTop: finalizeEmptyHeroActive
            ? "0.75rem"
            : gallery.length === 0
            ? `calc(${topOffset} + env(safe-area-inset-top, 0px) + ${heroBelowBarGap})`
            : composeFinalizeShell
            ? "0.9rem"
            : "1rem",
        }}
      >
        {/* Author row */}
        {!composeFinalizeHideAuthorPreview ? (
          <div
            className={[
              composeFinalizeShell
                ? "mt-[0.675rem] flex items-center gap-3"
                : "mt-3 flex items-center gap-3",
              finalizeSurroundingsDim
                ? "opacity-[0.82] transition-opacity duration-300"
                : "",
            ].join(" ")}
          >
            <Avatar
              className="shrink-0"
              url={anon ? undefined : post.author?.avatar_url || undefined}
              name={anon ? post.anonymous_name || "Anonymous" : displayName}
              size={40}
              onClick={anon ? undefined : goToProfile}
              variant={anon ? "anon" : vis === "friends" ? "friends" : "default"}
              anonymousAvatar={anon ? post.anonymous_avatar : undefined}
              userId={anon ? null : post.author_id || null} // [OPTIMIZATION: Phase 3.2] Pass userId for cache lookup
            />

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <button
                  className="text-sm font-medium hover:underline"
                  onClick={anon ? undefined : goToProfile}
                >
                  {anon ? post.anonymous_name || "Anonymous" : displayName}
                </button>
                <PostTypeMetaChip type={post.type} />
              </div>
              <div className="text-xs text-[var(--text)]/60">
                {anon ? "" : `@${post.author?.username || "user"} · `}
                <span
                  className={detailHeaderScheduleLabelClass(
                    headerScheduleLabel.kind
                  )}
                >
                  {headerScheduleLabel.label}
                </span>
              </div>
            </div>

            {!composeFinalizeShell ? (
              <div className="ml-auto flex items-center gap-2" data-post-menu>
                <PostMenu
                  postId={post.id}
                  isOwner={isOwner}
                  onEdit={handleEdit}
                  onDelete={handleAfterDelete}
                  isDraft={isDraft}
                  onRequestReport={handleRequestPostReport}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Caption (read-only, or inline editor on create finalize) */}
        {composeFinalizeCaption ? (
          <section
            id="create-finalize-caption-anchor"
            className={[
              "relative z-[1] rounded-xl px-3.5 py-4 transition-[box-shadow,ring] duration-700 ease-out",
              composeFinalizeHideAuthorPreview ? "mt-0" : "mt-[1.125rem]",
              composeFinalizeCaption.highlight
                ? "border border-[var(--brand)]/55 shadow-[0_0_0_1px_color-mix(in_oklab,var(--brand)_35%,transparent),0_0_28px_rgba(247,208,71,0.2),0_12px_36px_rgba(0,0,0,0.35)]"
                : composeFinalizeCaption.entryPulse
                ? "border border-[var(--brand)]/40 shadow-[0_0_0_1px_color-mix(in_oklab,var(--brand)_28%,transparent),0_0_48px_-4px_rgba(247,208,71,0.22),0_16px_44px_-8px_rgba(0,0,0,0.55)] ring-2 ring-[var(--brand)]/20"
                : [
                    "border border-[var(--create-border-composer-shell)] bg-white/95",
                    "shadow-[0_0_0_1px_var(--create-border-composer-shell-ring),0_2px_14px_rgba(0,0,0,0.06)]",
                    "app-dark:bg-[color-mix(in_oklab,var(--surface)_18%,transparent)] app-dark:shadow-[0_4px_24px_rgba(0,0,0,0.32)]",
                  ].join(" "),
            ].join(" ")}
            style={{
              scrollMarginTop:
                "calc(var(--create-flow-top-bar-total, 0px) + var(--create-flow-notice-stack-height, 0px) + 48px)",
            }}
          >
            <label
              htmlFor="create-finalize-caption"
              className="mb-3 block text-[12px] font-semibold tracking-wide app-light:!text-neutral-900 app-dark:!text-white/92"
            >
              Write your caption{" "}
              <span
                className="text-[var(--create-caption-required-accent)]"
                aria-hidden
              >
                *
              </span>
            </label>
            <div className="relative">
              <textarea
                id="create-finalize-caption"
                value={composeFinalizeCaption.value}
                maxLength={composeFinalizeCaption.maxLength}
                onChange={(e) => {
                  let v = e.target.value;
                  const cap = composeFinalizeCaption.maxLength;
                  if (typeof cap === "number" && v.length > cap) {
                    v = v.slice(0, cap);
                  }
                  composeFinalizeCaption.onChange(v);
                }}
                onFocus={() =>
                  composeFinalizeCaption.onCaptionFocusChange?.(true)
                }
                onBlur={() =>
                  composeFinalizeCaption.onCaptionFocusChange?.(false)
                }
                rows={4}
                placeholder="Say what this is about…"
                className="w-full min-h-[5.75rem] resize-y rounded-lg border-2 border-[var(--create-border-primary-field)] bg-white px-3 pb-7 pt-3 pr-3 text-[15px] leading-snug app-light:!text-neutral-900 outline-none transition-[border-color,box-shadow] app-light:placeholder:text-neutral-500 app-dark:bg-[color-mix(in_oklab,var(--surface)_12%,transparent)] app-dark:!text-neutral-100 app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] app-dark:placeholder:text-white/45 focus:border-[var(--brand)]/60 focus:shadow-[0_0_0_2px_color-mix(in_oklab,var(--brand)_22%,transparent),0_0_0_1px_rgba(0,0,0,0.06)] app-dark:focus:border-[var(--brand)]/65 app-dark:focus:shadow-[0_0_0_2px_color-mix(in_oklab,var(--brand)_24%,transparent),inset_0_1px_0_rgba(255,255,255,0.08)] whitespace-pre-wrap"
                aria-describedby={
                  typeof composeFinalizeCaption.maxLength === "number"
                    ? "create-finalize-caption-count"
                    : undefined
                }
              />
              {typeof composeFinalizeCaption.maxLength === "number" ? (
                <div
                  id="create-finalize-caption-count"
                  className="pointer-events-none absolute bottom-2 right-2.5 text-[10px] tabular-nums app-light:text-neutral-500 app-dark:text-white/50"
                  aria-live="polite"
                >
                  {composeFinalizeCaption.value.length}/
                  {composeFinalizeCaption.maxLength}
                </div>
              ) : null}
            </div>
            {composeFinalizeCaption.belowCaption}
          </section>
        ) : post.caption ? (
          <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-snug text-[var(--text)]/90">
            {post.caption}
          </p>
        ) : null}

        {/* Date / Visibility / RSVP: keep full opacity when caption de-emphasizes surroundings */}
        {composeFinalizeBelowCaption ? (
          <div className="mt-3 w-full">{composeFinalizeBelowCaption}</div>
        ) : null}

        {composeFinalizeShell && composeFinalizeActivitiesCta ? (
          <div className="mt-7 w-full">{composeFinalizeActivitiesCta}</div>
        ) : null}

        <div
          className={
            finalizeSurroundingsDim
              ? "opacity-[0.76] transition-opacity duration-300"
              : "contents"
          }
        >
          {!composeFinalizeStripPreviewMeta ? (
            <>
              {/* Post-detail hashtags: single horizontal scroll row, width capped (not create-flow) */}
              <div
                className="mt-4 w-full max-w-[80%] min-w-0 overflow-x-auto pb-2 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                data-hashtag-row
                role="region"
                aria-label="Hashtags"
              >
                <div className="flex w-max min-w-0 flex-nowrap gap-1.5">
                  {tags.map((t, i) => (
                    <span
                      key={`tag-${i}`}
                      className="shrink-0 rounded-full border border-[var(--border)]/55 bg-[var(--surface)]/16 px-2 py-0.5 text-[10px] font-medium leading-tight text-[var(--text)]/62 app-dark:border-white/20 app-dark:bg-white/[0.06] app-dark:text-white/58"
                    >
                      {post.tags && post.tags.length > 0
                        ? formatHashtagForDisplay(t)
                        : t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Dates & Recurring — helpers unchanged; boxed for readability */}
              {showScheduleBlock && (
                <div className="mt-3 rounded-xl border border-[var(--border)]/50 bg-[color-mix(in_oklab,var(--surface)_18%,transparent)] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] app-dark:border-white/14 app-dark:bg-white/[0.05]">
                  <div className="mb-1.5 flex items-center gap-2">
                    <PiCalendarBlank
                      className="h-4 w-4 shrink-0 text-[var(--create-accent-icon-fg)] drop-shadow-[0_0_8px_var(--create-accent-icon-glow)]"
                      aria-hidden
                    />
                    <span className="text-[12px] font-semibold tracking-wide text-[var(--text)]/88 app-dark:text-white/92">
                      Schedule / Date
                    </span>
                  </div>
                  {scheduleSummaryLine ? (
                    <p className="text-[12px] leading-snug text-[var(--text)]/90 app-dark:text-white/85">
                      {scheduleSummaryLine}
                    </p>
                  ) : null}
                  {recurrenceSummaryLine ? (
                    <p
                      className={
                        scheduleSummaryLine
                          ? "mt-1.5 text-[11px] leading-snug text-[var(--text)]/58 app-dark:text-white/55"
                          : "text-[11px] leading-snug text-[var(--text)]/58 app-dark:text-white/55"
                      }
                    >
                      {recurrenceSummaryLine}
                    </p>
                  ) : null}
                </div>
              )}

              <PostRatingSummary
                ratingEnabled={post.rating_enabled}
                ratingAverage={
                  post.effective_rating_average ?? post.rating_average ?? null
                }
                ratingCount={post.effective_rating_count ?? post.rating_count ?? null}
                viewerRating={post.viewer_rating ?? null}
                inlineInteractive
                postId={post.id}
                onRatingApplied={(next) => {
                  const blended = computeBlendedEffectiveFromReal(
                    next.ratingAverage,
                    next.ratingCount
                  );
                  emitPostChanged(post.id, {
                    ratingAverage: next.ratingAverage ?? undefined,
                    ratingCount: next.ratingCount ?? undefined,
                    effectiveRatingAverage: blended.effectiveAverage,
                    effectiveRatingCount: blended.effectiveCount,
                    // Preserve null when viewer clears rating (do not use ?? which drops null)
                    viewerRating: next.viewerRating,
                  });
                }}
              />

              {/* RSVP section */}
              {typeof post.rsvp_capacity === "number" &&
                post.type === "hangout" && (
                  <div className="mt-3" data-rsvp>
                    <RSVPComponent
                      postId={post.id}
                      capacity={post.rsvp_capacity}
                      className=""
                      rsvpData={post.rsvp_data || undefined}
                      align="left"
                      postAuthor={
                        anon
                          ? { id: post.author_id, is_anonymous: true }
                          : post.author
                          ? {
                              id: post.author_id,
                              username: post.author.username ?? null,
                              display_name: post.author.display_name ?? null,
                              avatar_url: post.author.avatar_url ?? null,
                              is_anonymous: false,
                            }
                          : undefined
                      }
                      post={
                        {
                          tags: post.tags || null,
                          author_id: post.author_id,
                          type: post.type,
                          is_recurring: post.is_recurring ?? null,
                        } as any
                      }
                    />
                  </div>
                )}
            </>
          ) : null}

          {!hideFinalizeActivityTimeline && timelineDisplayItems.length > 0 ? (
            <>
              {/* Divider */}
              <div className="mt-4 border-t border-[var(--border)] app-dark:border-white/12" />

              {/* Timeline — finalize uses composeFinalizeActivitiesCta as the section entry */}
              {!composeFinalizeShell && timelineSectionLabel ? (
                <div className="mt-3 text-sm font-semibold text-[var(--text)]/95 app-dark:text-white/92">
                  {timelineSectionLabel}
                </div>
              ) : null}
              <section className={composeFinalizeShell ? "mt-3" : "mt-2"}>
                <div className="relative">
                  {/* vertical rail — theme + caption-focus dimming */}
                  <div
                    className={[
                      "absolute left-2 top-0 bottom-0 rounded-full",
                      finalizeSurroundingsDim
                        ? "w-px bg-[var(--create-timeline-rail-muted)]"
                        : "w-[2px] bg-[var(--create-timeline-rail)]",
                    ].join(" ")}
                    aria-hidden
                  />
                  <ol className="space-y-6">
                    {timelineDisplayItems.map(
                      ({
                        activity: a,
                        index: i,
                        input,
                        visibleTagLineCount,
                      }) => {
                      const extras = (a.additional_info || []) as {
                        title: string;
                        value: string;
                      }[];

                      const address = a.location_name || "";
                      const locationNotes = a.location_notes || "";
                      const googleMapsUrl = a.location_url || "";

                      // Per-stop lines (exclude "custom" sentinel; matches ActivitiesTagsInput)
                      const activityTagLines = visibleActivityTagLines(
                        Array.isArray(a.tags) ? a.tags : []
                      );

                      const showStopHeading = shouldShowTimelineStopHeading(
                        input,
                        i,
                        visibleTagLineCount
                      );

                      const extrasFiltered = Array.isArray(extras)
                        ? extras.filter((x) => x?.title && x?.value)
                        : [];
                      const hasExtras = extrasFiltered.length > 0;
                      const hasLocation = !!(
                        address ||
                        locationNotes ||
                        googleMapsUrl
                      );
                      const hasStopLabelBlock =
                        activityTagLines.length > 0 || showStopHeading;

                      return (
                        <li key={i} className="relative min-w-0 pl-6">
                          <span
                            className={[
                              "absolute left-2 top-3 -translate-x-1/2 h-2 w-2 rounded-full",
                              finalizeSurroundingsDim
                                ? "bg-[var(--create-timeline-dot-muted)]"
                                : "bg-[var(--create-timeline-dot)]",
                            ].join(" ")}
                            aria-hidden
                          />

                          {/* Stacked lines: pills when short; full-width blocks when long (matches composer) */}
                          {hasStopLabelBlock ? (
                            <div className="flex w-full min-w-0 flex-col items-start gap-2">
                              {activityTagLines.length > 0 ? (
                                activityTagLines.map(
                                  (tag: string, tagIndex: number) => (
                                    <ReadOnlyActivityTagLine
                                      key={tagIndex}
                                      text={tag}
                                      isFirst={tagIndex === 0}
                                    />
                                  )
                                )
                              ) : (
                                <ReadOnlyActivityTagLine
                                  text={getTimelineStopHeadingText(
                                    a.title || `Stop ${i + 1}`,
                                    i
                                  )}
                                  isFirst
                                />
                              )}
                            </div>
                          ) : null}

                          {/* Location — larger gap from activities */}
                          {hasLocation && (
                            <div
                              className={[
                                "rounded-md border border-[var(--border)] px-3 py-2",
                                hasStopLabelBlock ? "mt-8" : "mt-0",
                              ].join(" ")}
                            >
                              <div className="space-y-3">
                                <div>
                                  <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[var(--text)]/60">
                                    <PiMapPin
                                      className="h-3.5 w-3.5 shrink-0 text-[var(--create-accent-icon-fg)] drop-shadow-[0_0_8px_var(--create-accent-icon-glow)]"
                                      aria-hidden
                                    />
                                    <span>Location (Address & Details)</span>
                                  </div>
                                  {address && (
                                    <div className="text-xs text-[var(--text)]/85 mb-2">
                                      {address}
                                    </div>
                                  )}
                                  {locationNotes && (
                                    <div className="text-xs text-[var(--text)]/85 mb-2">
                                      {locationNotes}
                                    </div>
                                  )}
                                </div>
                                {googleMapsUrl && (
                                  <GoogleMapsEmbed url={googleMapsUrl} />
                                )}
                              </div>
                            </div>
                          )}

                          {/* Additional info — semantic rows (preview + published detail) */}
                          {hasExtras && (
                            <div
                              className={hasLocation ? "mt-4" : "mt-8"}
                            >
                              <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[var(--text)]/60">
                                <PiListBullets
                                  className="h-3.5 w-3.5 shrink-0 text-[var(--create-accent-icon-fg)] drop-shadow-[0_0_8px_var(--create-accent-icon-glow)]"
                                  aria-hidden
                                />
                                <span>Additional Info</span>
                              </div>
                              <AdditionalInfoSemanticRows
                                items={extrasFiltered}
                              />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>

      {/* Comments Section - Only show if not preview */}
      {!isPreview && (
        <div data-comments-section>
          <CommentList
            postId={post.id}
            isModal={!!onClose}
            autoFocusCommentComposer={autoFocusCommentComposer}
            setFocusComposer={setFocusComposer}
            modalComposerPortalHost={modalComposerPortalHost}
          />
        </div>
      )}

      {/* Invite Drawer */}
      <InviteDrawer
        isOpen={showInviteDrawer}
        onClose={() => setShowInviteDrawer(false)}
        postId={post.id}
        postType={post.type}
        postCaption={post.caption || ""}
        onClosingChange={setIsInviteDrawerClosing}
      />

      <ReportModal
        open={reportDraft !== null}
        draft={reportDraft}
        onClose={() => setReportDraft(null)}
      />
    </>
  );
}
