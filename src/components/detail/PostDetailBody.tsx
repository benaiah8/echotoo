// src/components/detail/PostDetailBody.tsx
import MediaCarousel from "../../components/MediaCarousel";
import PublishedMediaCarousel from "./PublishedMediaCarousel";
import Avatar from "../ui/Avatar";
import GoogleMapsEmbed from "../ui/GoogleMapsEmbed";
import PostMenu from "../ui/PostMenu";
import PostActions from "../ui/PostActions";
import StickyPostActions from "../ui/StickyPostActions";
import InviteDrawer from "../ui/InviteDrawer";
import CommentList from "../ui/CommentList";
import PostDetailSocialDock from "./PostDetailSocialDock";
import PostCaptionText from "../PostCaptionText";
import ComposeLinkPreviewOverlay, {
  COMPOSE_LINK_PREVIEW_TYPE_CLASS,
  composeTextHasLinkPreview,
} from "../ui/ComposeLinkPreviewOverlay";
import ComposeLinkOpenIcons from "../ui/ComposeLinkOpenIcons";
import { createPortal } from "react-dom";
import { scrollModalCommentsContentAboveComposer } from "../../lib/postDetailCommentsScroll";
import { scheduleStabilizedLocationScroll } from "../../lib/postDetailLocationScroll";
import {
  buildCarouselImages,
  buildFinalizeComposerGallery,
} from "../../lib/carouselImages";
import { shouldMountFinalizeHeroRegion } from "../../lib/createFinalizeHeroMedia";
import { isCreateFinalizeCaptionCompact } from "../../lib/createFinalizeCaptionLayout";
import { CREATE_FINALIZE_DOCK_CSS_VARS } from "../../lib/createFinalizeMediaDockLayout";
import { useNavigate, useLocation } from "react-router-dom";
import { Paths } from "../../router/Paths";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
} from "../../lib/editPostBootstrap";
import { runOwnerPublishedEditOpen } from "../../lib/openOwnerPublishedEdit";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import { RootState } from "../../app/store";
import { setAuthModal } from "../../reducers/modalReducer";
import ReportModal from "../ui/ReportModal";
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
  finalizeMetaToSectionsGapClass,
  finalizeMetaToSectionsGapCompactClass,
} from "../../lib/createFlowFinalizeMetaSurface";
import {
  buildTimelineDisplayItems,
  getPublishedCarrierSlot0Location,
  getTimelineSectionLabel,
  getTimelineStopHeadingText,
  listPublishedV4SectionBodies,
  shouldShowTimelineStopHeading,
} from "../../lib/createFlowMeaningfulActivity";
import {
  extractV4KeyInfoValues,
  stripV4KeyInfoFromAdditionalInfo,
} from "../../lib/createFlowV4KeyInfo";
import PostV4KeyDetailsReadOnly from "./PostV4KeyDetailsReadOnly";
import PostV4LocationReadOnly from "./PostV4LocationReadOnly";
import PostV4SectionsReadOnly from "./PostV4SectionsReadOnly";
import { ReadOnlyActivityTagLine } from "./ReadOnlyActivityTagLine";
import { AdditionalInfoSemanticRows } from "./AdditionalInfoSemanticRows";
import { PiCalendarBlank, PiListBullets, PiMapPin } from "react-icons/pi";
import {
  formatPostDetailScheduleStatus,
  getPostScheduleLabel,
} from "../../lib/postScheduleLabel";
import { getPostScheduleLabelTextClass } from "../../lib/postScheduleLabelStyles";
import {
  buildPublishedMediaItems,
  getOrFetchPublishedMedia,
  getPublishedMediaCache,
  isPublishedMediaCacheFresh,
  isPublishedMediaOrder,
  publishedMediaViewerKey,
  seedPublishedMediaFromFeedItems,
  upgradePublishedMediaLegacyGalleryFromUrls,
  type PublishedMediaItem,
} from "../../lib/publishedMedia";
// [OPTIMIZATION: Phase 3.4] Removed BatchLoadResult - PostgreSQL function provides all data

/** Finalize caption: grow with content so the page scrolls, not the textarea. */
function resizeFinalizeCaptionCanvas(
  el: HTMLTextAreaElement | null,
  opts?: { empty?: boolean },
) {
  if (!el) return;
  // Empty canvas: clear inline height so min-height owns spacious ↔ compact.
  // (A leftover autosize height would lock the tall size and defeat focus compact.)
  if (opts?.empty) {
    el.style.removeProperty("height");
    return;
  }
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

const FINALIZE_CAPTION_MIN_HEIGHT_SPACIOUS = "11rem";
const FINALIZE_CAPTION_MIN_HEIGHT_COMPACT = "5rem";

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
    activity_type?: string | null;
    section_body?: string | null;
    custom_activity?: string | null;
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
  /** Create finalize: overlay image CTA dock pinned to hero bottom. */
  composeFinalizeHeroBottomOverlayCta,
  /** Create finalize: active video job exists (mount hero without image gallery). */
  composeFinalizeHasActiveVideo = false,
  /** Create finalize: adaptive hero frame (video vs default image 4:5). */
  composeFinalizeHeroContainerStyle,
  /** Create finalize: replaces default MediaCarousel (video + image hero). */
  composeFinalizeHeroMedia,
  composeFinalizeHeroSlideIndex,
  composeFinalizeOnHeroSlideIndexChange,
  composeFinalizeHeroPagination,
  /** Create finalize: full-width Activities entry (above the activity timeline when shown). */
  composeFinalizeActivitiesCta,
  /**
   * Create finalize: when false, hide the read-only activity timeline (e.g. untouched seeded stop).
   * Omit or true everywhere else.
   */
  composeFinalizeShowActivityTimeline,
  /**
   * Create finalize: Date and/or Location pills visible on canvas — keeps caption min-height
   * and relaxed meta→Section gap. When false, use compact vertical spacing.
   */
  composeFinalizeHasVisibleDateOrLocation = true,
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
    /** Capture `InputEvent.inputType` before controlled updates (Undo grouping). */
    onBeforeInput?: (inputType: string) => void;
    /** Hard cap (e.g. finalize publish limit); enforced in onChange + maxLength. */
    maxLength?: number;
    /** Legacy notice-driven ring highlight (categories); finalize caption-required uses placeholder instead. */
    highlight?: boolean;
    /**
     * Finalize caption-required presentation: warning placeholder after failed Publish.
     * Cleared by parent on caption focus/tap — no canvas ring.
     */
    requiredWarning?: boolean;
    /** One-shot placeholder pulse while requiredWarning is active. */
    requiredWarningPulse?: boolean;
    /** Caption focused — drives compact empty canvas (with content). */
    captionFocused?: boolean;
    /** One-shot neutral placeholder flash on focus (empty, non-error). */
    focusPulse?: boolean;
    /** Brief landing emphasis: placeholder color pulse (fades when parent clears) */
    entryPulse?: boolean;
    /** When false, hero/author/below stay at full prominence (e.g. user tapped outside caption). Default: dim. */
    surroundingDeemphasize?: boolean;
    onCaptionFocusChange?: (focused: boolean) => void;
    /** Optional external ref for caption textarea (e.g. focus after Section delete). */
    captionTextareaRef?: React.MutableRefObject<HTMLTextAreaElement | null>;
    /** Rendered inside the caption card below the textarea (e.g. tags field on finalize). */
    belowCaption?: ReactNode;
  };
  composeFinalizeBelowCaption?: ReactNode;
  /** Hide inline tags / schedule / RSVP preview rows (finalize uses caption + metadata row instead). */
  composeFinalizeStripPreviewMeta?: boolean;
  composeFinalizeHideAuthorPreview?: boolean;
  composeFinalizeEmptyHeroCta?: ReactNode;
  composeFinalizeHeroBottomOverlayCta?: ReactNode;
  composeFinalizeHasActiveVideo?: boolean;
  composeFinalizeHeroContainerStyle?: {
    aspectRatio?: string;
    maxHeight?: string;
    minHeight?: string;
  };
  composeFinalizeHeroMedia?: ReactNode;
  /** Create finalize: pagination dots rendered outside the rounded hero surface. */
  composeFinalizeHeroPagination?: ReactNode;
  /** UI-only finalize hero slide (`images` index). Does not change cover. */
  composeFinalizeHeroSlideIndex?: number;
  composeFinalizeOnHeroSlideIndexChange?: (index: number) => void;
  composeFinalizeActivitiesCta?: ReactNode;
  composeFinalizeShowActivityTimeline?: boolean;
  composeFinalizeHasVisibleDateOrLocation?: boolean;
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
  const finalizeCaptionRef = useRef<HTMLTextAreaElement | null>(null);
  const finalizeCaptionValue = composeFinalizeCaption?.value;
  const finalizeCaptionFocused = Boolean(
    composeFinalizeCaption?.captionFocused,
  );
  const finalizeCaptionCompact = isCreateFinalizeCaptionCompact({
    caption: finalizeCaptionValue ?? "",
    focused: finalizeCaptionFocused,
  });
  const finalizeCaptionEmpty = !(finalizeCaptionValue ?? "").trim();
  const finalizeCaptionLinkPreview = Boolean(
    composeFinalizeCaption &&
      composeTextHasLinkPreview(finalizeCaptionValue ?? ""),
  );

  useLayoutEffect(() => {
    if (finalizeCaptionValue === undefined) return;
    const el = finalizeCaptionRef.current;
    if (!el) return;
    resizeFinalizeCaptionCanvas(el, { empty: finalizeCaptionEmpty });
  }, [
    finalizeCaptionCompact,
    finalizeCaptionEmpty,
    finalizeCaptionFocused,
    finalizeCaptionValue,
  ]);

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
      handleFollowChange as EventListener,
    );
    return () =>
      window.removeEventListener(
        "follow:changed",
        handleFollowChange as EventListener,
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
    await runOwnerPublishedEditOpen({
      startPathname: window.location.pathname,
      navigate,
      fetchAndBuild: async () => {
        const postData = await getPostForEdit(post.id);
        const navState = routerLocation.state as PostDetailNavigateState | null;
        const overlayBg = navState?.backgroundLocation;
        return {
          editData: buildCanonicalEditPostData(
            postData.post,
            postData.activities,
            {
              returnPath: window.location.pathname,
              mediaOrder: postData.mediaOrder,
              postMedia: postData.postMedia,
              ...(overlayBg != null
                ? {
                    returnState: {
                      backgroundLocation: overlayBg as unknown,
                      initialPost: post as unknown,
                    },
                  }
                : {}),
            },
          ),
          href: createEditActivitiesHref(postData.post.type),
        };
      },
    });
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
  /** Full-page detail only: one scroll when opened with `scrollToLocation` (modal handled in PostDetailModal). */
  const fullPageLocationScrollDoneRef = useRef(false);

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
    fullPageLocationScrollDoneRef.current = false;
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

  const shouldScrollToLocationOnOpen = Boolean(
    (routerLocation.state as PostDetailNavigateState | null)?.scrollToLocation,
  );

  useEffect(() => {
    // Modal overlay owns location scroll; full-page only here.
    if (onClose || !shouldScrollToLocationOnOpen) return;
    if (fullPageLocationScrollDoneRef.current) return;
    fullPageLocationScrollDoneRef.current = true;
    const handle = scheduleStabilizedLocationScroll({ isModal: false });
    return () => handle.cancel();
  }, [shouldScrollToLocationOnOpen, onClose, post.id]);

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

  // HERO images: feed/detail keep shared carousel order. Finalize honors
  // slot0 `activities[0].images` when that is the only media array (V4).
  const { images: gallery } = composeFinalizeShell
    ? buildFinalizeComposerGallery(post.activities ?? [], 400)
    : buildCarouselImages(post.activities ?? [], 400);

  const loadPublishedMedia =
    !composeFinalizeShell && !isPreview && Boolean(post.id);

  const viewerUserId = authState?.user?.id ?? currentUserId ?? null;
  const viewerKey = publishedMediaViewerKey(viewerUserId);

  const [publishedMediaItems, setPublishedMediaItems] = useState<
    PublishedMediaItem[] | null
  >(() => {
    if (!loadPublishedMedia || !post.id) return null;
    const cached = getPublishedMediaCache(post.id, viewerKey)?.items;
    if (cached && cached.length > 0) {
      return cached;
    }
    // Sync seed from FeedItem-shaped post (nav initialPost / hydrated feed row).
    if (
      post.media_order != null ||
      (Array.isArray(post.post_media) && post.post_media.length > 0)
    ) {
      seedPublishedMediaFromFeedItems({
        items: [post],
        viewerUserId,
        source: "feed",
      });
      return getPublishedMediaCache(post.id, viewerKey)?.items ?? null;
    }
    return null;
  });

  const galleryKey = gallery.join("\0");
  const initialMediaKey =
    (routerLocation.state as PostDetailNavigateState | null)?.initialMediaKey ??
    undefined;
  const openImmersiveFullscreen = Boolean(
    (routerLocation.state as PostDetailNavigateState | null)
      ?.openImmersiveFullscreen,
  );
  const listPlaybackOrigin =
    (routerLocation.state as PostDetailNavigateState | null)
      ?.listPlaybackOrigin;
  const listPlaybackHandoffSessionId =
    (routerLocation.state as PostDetailNavigateState | null)
      ?.listPlaybackHandoffSessionId;

  useEffect(() => {
    if (!loadPublishedMedia || !post.id) {
      setPublishedMediaItems(null);
      return;
    }
    let cancelled = false;
    const imageUrls = galleryKey ? galleryKey.split("\0") : [];
    let cached = getPublishedMediaCache(post.id, viewerKey);

    // If Feed handed off initialPost with a manifest but cache was empty, seed sync.
    if (
      !cached?.items?.length &&
      (post.media_order != null ||
        (Array.isArray(post.post_media) && post.post_media.length > 0))
    ) {
      seedPublishedMediaFromFeedItems({
        items: [post],
        viewerUserId,
        source: "feed",
      });
      cached = getPublishedMediaCache(post.id, viewerKey);
    }

    // Completeness upgrade: hydrated Detail gallery richer than legacy/partial cache.
    // Freshness must not block this (Pass 2A). No network.
    // Never replace a video-containing mixed manifest with image-only URLs —
    // preserve membership/order and force canonical revalidation instead.
    let forceCanonicalRevalidate = false;
    if (
      imageUrls.length > 0 &&
      cached &&
      !isPublishedMediaOrder(cached.mediaOrder) &&
      (cached.legacyScope === "partial" ||
        imageUrls.length >
          (cached.items.filter((i) => i.kind === "image").length ?? 0))
    ) {
      const cachedHasVideo = cached.items.some((i) => i.kind === "video");
      if (cachedHasVideo) {
        forceCanonicalRevalidate = true;
      } else {
        const upgraded = upgradePublishedMediaLegacyGalleryFromUrls({
          postId: post.id,
          viewerUserId,
          imageUrls,
          source: "detail",
        });
        if (upgraded) {
          cached = upgraded;
        }
      }
    }

    if (cached?.items?.length) {
      // Cache-first: paint final count immediately (no null black-shell wait).
      // no image-only provisional — never mount a fake gallery-only list while waiting.
      setPublishedMediaItems(cached.items);
      if (forceCanonicalRevalidate || !isPublishedMediaCacheFresh(cached)) {
        // Stale-while-revalidate, or protected mixed cache awaiting canonical order.
        void getOrFetchPublishedMedia({
          postId: post.id,
          viewerUserId,
          imageUrls,
          forceRevalidate: true,
        }).then((entry) => {
          if (cancelled || !entry) return;
          setPublishedMediaItems(entry.items);
        });
      }
      return () => {
        cancelled = true;
      };
    }

    // Deep link / no cache: keep shell until final manifest (do not mount fake 2-slide list).
    setPublishedMediaItems(null);
    void getOrFetchPublishedMedia({
      postId: post.id,
      viewerUserId,
      imageUrls,
    })
      .then((entry) => {
        if (cancelled) return;
        // If gallery grew while fetch was in flight, prefer upgraded cache.
        const latest = getPublishedMediaCache(post.id, viewerKey);
        setPublishedMediaItems(latest?.items ?? entry?.items ?? []);
      })
      .catch((err) => {
        console.warn("[PostDetail] published media load failed", err);
        if (!cancelled) {
          setPublishedMediaItems(
            buildPublishedMediaItems({
              imageUrls,
              mediaOrder: null,
              postMedia: [],
            }),
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    galleryKey,
    loadPublishedMedia,
    post.id,
    post.media_order,
    post.post_media,
    viewerKey,
    viewerUserId,
  ]);

  /** Published Detail: null = waiting for final manifest (stable shell, no fake count). */
  const publishedMediaLoading =
    loadPublishedMedia && publishedMediaItems === null;
  const publishedMediaReadyItems =
    loadPublishedMedia && publishedMediaItems != null
      ? publishedMediaItems
      : null;
  const publishedMediaShellItems = publishedMediaReadyItems ?? [];
  const publishedMediaShellReady =
    !publishedMediaLoading && publishedMediaShellItems.length > 0;
  const usePublishedDetailShell = loadPublishedMedia;

  const tags = Array.isArray(post.tags) ? post.tags : [];

  // Clearance below sticky actions (floating glass bar is shorter than legacy full-width bar).
  // Create finalize step uses CreateFlowTopBar + notice stack instead of StickyPostActions.
  const topOffset = composeFinalizeShell ? "0px" : "46px";
  /** Modal only: small gap so the hero is not flush against the floating pill */
  const heroBelowBarGap = onClose ? "12px" : "0px";

  /**
   * Published detail: clearance below sticky bar.
   * Create finalize: canvas already pads for safe-area + top bar — hero only needs a small gap (see gallery block).
   */
  const finalizeHeroBreathing = composeFinalizeShell ? "20px" : "0px";
  /** Compose finalize hero: pt-4 (16px) mobile, md:pt-5 (20px) desktop — no duplicate safe-area. */
  const composeFinalizeHeroTopClass = "pt-4 md:pt-5";
  const composeFinalizeHeroTopAbsClass = "top-4 md:top-5";
  const composeFinalizeHeroOverlayTopClass =
    "top-[calc(1rem+10px)] md:top-[calc(1.25rem+10px)]";

  const finalizeSurroundingsDim =
    composeFinalizeCaption != null &&
    composeFinalizeCaption.surroundingDeemphasize !== false;

  const finalizeEmptyHeroActive = Boolean(
    composeFinalizeShell && gallery.length === 0 && composeFinalizeEmptyHeroCta,
  );

  const finalizeHeroActive = composeFinalizeShell
    ? shouldMountFinalizeHeroRegion(
        gallery.length,
        composeFinalizeHasActiveVideo,
      )
    : usePublishedDetailShell
    ? publishedMediaShellReady || publishedMediaLoading
    : gallery.length > 0;

  const hideFinalizeActivityTimeline =
    composeFinalizeShell && composeFinalizeShowActivityTimeline === false;

  const finalizeBelowCaptionGapClass = composeFinalizeHasVisibleDateOrLocation
    ? finalizeMetaToSectionsGapClass
    : finalizeMetaToSectionsGapCompactClass;

  /** Empty canvas ≈ 7–10 lines; compact when focused or has content ≈ 3–4 lines.
   * Inline minHeight (not Tailwind class) so focus compact cannot be skipped by
   * class/caching issues; CSS transitions this value on .create-finalize-caption-canvas. */
  const finalizeCaptionMinHeight = finalizeCaptionCompact
    ? FINALIZE_CAPTION_MIN_HEIGHT_COMPACT
    : FINALIZE_CAPTION_MIN_HEIGHT_SPACIOUS;

  const timelineDisplayItems = useMemo(
    () => buildTimelineDisplayItems(post.activities ?? []),
    [post.activities],
  );

  const timelineSectionLabel = useMemo(
    () => getTimelineSectionLabel(timelineDisplayItems),
    [timelineDisplayItems],
  );

  const publishedV4KeyDetailValues = useMemo(() => {
    if (composeFinalizeShell) return [];
    const slot0 = post.activities?.[0];
    return extractV4KeyInfoValues(slot0?.additional_info ?? null);
  }, [composeFinalizeShell, post.activities]);

  const publishedV4SectionBodies = useMemo(() => {
    if (composeFinalizeShell) return [];
    return listPublishedV4SectionBodies(post.activities ?? []);
  }, [composeFinalizeShell, post.activities]);

  const publishedCarrierSlot0Location = useMemo(() => {
    if (composeFinalizeShell) return null;
    return getPublishedCarrierSlot0Location(post.activities ?? []);
  }, [composeFinalizeShell, post.activities]);

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
    ],
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
    scheduleDates,
  );
  const recurrenceSummaryLine = formatFinalizeRecurrenceSummaryLine(
    recurringForDisplay,
    recurrenceCodes,
  );
  /** Relative status from same helper as header — device-local, no second state machine. */
  const scheduleStatusLine = formatPostDetailScheduleStatus(headerScheduleLabel);
  const showScheduleBlock =
    (scheduleSummaryLine != null && scheduleSummaryLine.length > 0) ||
    (recurrenceSummaryLine != null && recurrenceSummaryLine.length > 0);

  const computeBlendedEffectiveFromReal = useCallback(
    (
      nextRealAverage: number | null | undefined,
      nextRealCount: number | null | undefined,
    ) => {
      const currentRealCount =
        typeof post.rating_count === "number" &&
        Number.isFinite(post.rating_count)
          ? post.rating_count
          : 0;
      const currentRealAverage =
        typeof post.rating_average === "number" &&
        Number.isFinite(post.rating_average)
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
          ? Number(
              (
                (demoAverage * demoCount + realAverage * realCount) /
                effectiveCount
              ).toFixed(1),
            )
          : 0;
      return { effectiveAverage, effectiveCount };
    },
    [post],
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
            "relative w-full mb-2",
            finalizeSurroundingsDim
              ? "opacity-[0.80] transition-opacity duration-300"
              : "",
          ].join(" ")}
          style={{
            paddingTop: `calc(${topOffset} + var(--safe-area-top-layout) + ${heroBelowBarGap} + ${finalizeHeroBreathing})`,
            minHeight: "44px",
          }}
        >
          <div className="w-full">{composeFinalizeEmptyHeroCta}</div>
          {isPreview && previewHeroOverlay ? (
            <div
              className="pointer-events-none absolute left-1/2 z-[25] flex w-full max-w-[calc(100%-1rem)] -translate-x-1/2 justify-center px-2"
              style={{
                top: `calc(${topOffset} + var(--safe-area-top-layout) + ${heroBelowBarGap} + ${finalizeHeroBreathing} + 10px)`,
              }}
            >
              {previewHeroOverlay}
            </div>
          ) : null}
        </div>
      ) : isPreview &&
        gallery.length === 0 &&
        previewHeroOverlay &&
        !finalizeHeroActive ? (
        <div
          className={[
            composeFinalizeShell
              ? "relative w-full mb-[0.45rem]"
              : "relative w-full page-content-wide mb-2",
            finalizeSurroundingsDim
              ? "opacity-[0.80] transition-opacity duration-300"
              : "",
          ].join(" ")}
          style={{
            paddingTop: `calc(${topOffset} + var(--safe-area-top-layout) + ${heroBelowBarGap} + 8px)`,
            minHeight: "44px",
          }}
        >
          <div className="pointer-events-none flex justify-center px-2">
            {previewHeroOverlay}
          </div>
        </div>
      ) : null}

      {/* HERO CAROUSEL (contain, lightbox) - aspect-ratio reserves space to avoid layout shift */}
      {finalizeHeroActive && (
        <>
          {usePublishedDetailShell ? (
            <div
              className={[
                "relative w-full page-content-wide mb-2 min-h-0",
                finalizeSurroundingsDim
                  ? "opacity-[0.80] transition-opacity duration-300"
                  : "",
              ].join(" ")}
              data-media-control
              data-published-detail-media-shell
              style={{
                paddingTop: `calc(${topOffset} + var(--safe-area-top-layout) + ${heroBelowBarGap} + ${finalizeHeroBreathing})`,
              }}
            >
              <PublishedMediaCarousel
                items={publishedMediaShellItems}
                ready={publishedMediaShellReady}
                initialMediaKey={initialMediaKey}
                openImmersiveFullscreen={openImmersiveFullscreen}
                postId={post.id}
                viewerUserId={viewerUserId}
                listPlaybackOrigin={listPlaybackOrigin}
                listPlaybackHandoffSessionId={listPlaybackHandoffSessionId}
                maxHeight="50vh"
                className="w-full"
              />
            </div>
          ) : (
            <div
              className={[
                composeFinalizeShell
                  ? `relative w-full min-h-0 ${composeFinalizeHeroTopClass} ${
                      composeFinalizeHeroPagination ? "mb-0" : "mb-2"
                    }`
                  : "relative w-full page-content-wide mb-2 min-h-0",
                finalizeSurroundingsDim
                  ? "opacity-[0.80] transition-opacity duration-300"
                  : "",
              ].join(" ")}
              data-media-control
              style={{
                aspectRatio:
                  composeFinalizeHeroContainerStyle?.aspectRatio ?? "4/5",
                maxHeight:
                  composeFinalizeHeroContainerStyle?.maxHeight ?? "50vh",
                minHeight: composeFinalizeHeroContainerStyle?.minHeight,
                ...(composeFinalizeShell ? CREATE_FINALIZE_DOCK_CSS_VARS : {}),
                ...(composeFinalizeShell
                  ? {
                      transition:
                        "max-height 200ms ease, min-height 200ms ease",
                    }
                  : {}),
                ...(composeFinalizeShell
                  ? {}
                  : {
                      paddingTop: `calc(${topOffset} + var(--safe-area-top-layout) + ${heroBelowBarGap} + ${finalizeHeroBreathing})`,
                    }),
              }}
            >
              <div
                className={[
                  "absolute left-0 right-0 bottom-0 z-0",
                  composeFinalizeShell ? composeFinalizeHeroTopAbsClass : "",
                ].join(" ")}
                data-carousel-control
                data-image-control
                style={
                  composeFinalizeShell
                    ? undefined
                    : {
                        top: `calc(${topOffset} + var(--safe-area-top-layout) + ${heroBelowBarGap} + ${finalizeHeroBreathing})`,
                      }
                }
              >
                {composeFinalizeShell && composeFinalizeHeroMedia ? (
                  composeFinalizeHeroMedia
                ) : (
                  <MediaCarousel
                    images={gallery}
                    fit="contain"
                    enableLightbox={composeFinalizeShell || !isPreview}
                    maxHeight="100%"
                    className="h-full"
                    autoplay={false}
                    interactiveDots={composeFinalizeShell || !isPreview}
                    activeIndex={
                      composeFinalizeShell
                        ? composeFinalizeHeroSlideIndex
                        : undefined
                    }
                    onActiveIndexChange={
                      composeFinalizeShell
                        ? composeFinalizeOnHeroSlideIndexChange
                        : undefined
                    }
                  />
                )}
              </div>
              {isPreview && previewHeroOverlay ? (
                <div
                  className={[
                    "pointer-events-none absolute left-1/2 z-[25] flex w-full max-w-[calc(100%-1rem)] -translate-x-1/2 justify-center px-2",
                    composeFinalizeShell
                      ? composeFinalizeHeroOverlayTopClass
                      : "",
                  ].join(" ")}
                  style={
                    composeFinalizeShell
                      ? undefined
                      : {
                          top: `calc(${topOffset} + var(--safe-area-top-layout) + ${heroBelowBarGap} + ${finalizeHeroBreathing} + 10px)`,
                        }
                  }
                >
                  {previewHeroOverlay}
                </div>
              ) : null}
              {composeFinalizeShell &&
              isPreview &&
              composeFinalizeHeroBottomOverlayCta ? (
                <div className="pointer-events-none absolute inset-0 z-[26]">
                  {composeFinalizeHeroBottomOverlayCta}
                </div>
              ) : null}
            </div>
          )}
          {composeFinalizeShell && composeFinalizeHeroPagination ? (
            <div
              className="mt-1.5 mb-1.5 flex justify-center"
              data-create-hero-pagination-slot
            >
              {composeFinalizeHeroPagination}
            </div>
          ) : null}
        </>
      )}

      {/* MAIN COLUMN */}
      <div
        className={composeFinalizeShell ? "w-full" : "w-full page-content-wide"}
        style={{
          // Sticky-header clearance only when there is no hero above.
          // Published video-only has finalizeHeroActive but gallery.length === 0 —
          // do not double-apply clearance under the media shell.
          paddingTop: finalizeEmptyHeroActive
            ? "0.75rem"
            : composeFinalizeShell &&
              gallery.length === 0 &&
              !finalizeHeroActive
            ? "1.5rem"
            : gallery.length === 0 && !finalizeHeroActive
            ? `calc(${topOffset} + var(--safe-area-top-layout) + ${heroBelowBarGap})`
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
              variant={
                anon ? "anon" : vis === "friends" ? "friends" : "default"
              }
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
              </div>
              <div className="text-xs text-[var(--text)]/60">
                {anon ? "" : `@${post.author?.username || "user"} · `}
                <span
                  className={getPostScheduleLabelTextClass(
                    headerScheduleLabel.kind,
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
                  currentAuthorId={post.author_id}
                  isOwner={isOwner}
                  onEdit={handleEdit}
                  onDelete={handleAfterDelete}
                  isDraft={isDraft}
                  onRequestReport={handleRequestPostReport}
                  dropdownZClassName={onClose ? "z-[130]" : undefined}
                  postType={detailPostType}
                  postCaption={post.caption}
                  socialDiscoveryBoostedAt={
                    (post as { social_discovery_boosted_at?: string | null })
                      .social_discovery_boosted_at ?? null
                  }
                  editReturnPath={window.location.pathname}
                  editReturnState={(() => {
                    const navState =
                      routerLocation.state as PostDetailNavigateState | null;
                    const overlayBg = navState?.backgroundLocation;
                    if (overlayBg == null) return undefined;
                    return {
                      backgroundLocation: overlayBg as unknown,
                      initialPost: post as unknown,
                    };
                  })()}
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
              "relative z-[1] py-1 transition-[box-shadow,ring] duration-700 ease-out",
              composeFinalizeShell ? "px-0" : "px-1",
              composeFinalizeHideAuthorPreview ? "mt-0" : "mt-[1.125rem]",
              // Caption-required on finalize uses placeholder warning — never ring the canvas.
              composeFinalizeCaption.highlight &&
              !composeFinalizeCaption.requiredWarning
                ? "rounded-[var(--create-radius-panel)] ring-2 ring-[var(--brand)]/45"
                : "",
            ].join(" ")}
            style={{
              scrollMarginTop:
                "calc(var(--create-flow-top-bar-total, 0px) + var(--create-flow-notice-stack-height, 0px) + 48px)",
              scrollMarginBottom:
                "calc(var(--create-actions-total-bottom, 96px) + var(--create-finalize-writing-toolbar-height, 28px) + 16px)",
            }}
          >
            <div className="min-w-0">
              <label htmlFor="create-finalize-caption" className="sr-only">
                Say what this is about
              </label>
              <div className="relative">
                {finalizeCaptionLinkPreview ? (
                  <div
                    className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
                    aria-hidden
                  >
                    <ComposeLinkPreviewOverlay
                      text={composeFinalizeCaption.value}
                    />
                  </div>
                ) : null}
                <textarea
                  ref={(el) => {
                    finalizeCaptionRef.current = el;
                    const externalRef =
                      composeFinalizeCaption.captionTextareaRef;
                    if (externalRef) externalRef.current = el;
                  }}
                  id="create-finalize-caption"
                  value={composeFinalizeCaption.value}
                  maxLength={composeFinalizeCaption.maxLength}
                  onBeforeInput={(e) => {
                    composeFinalizeCaption.onBeforeInput?.(
                      (e.nativeEvent as globalThis.InputEvent).inputType ?? "",
                    );
                  }}
                  onChange={(e) => {
                    let v = e.target.value;
                    const cap = composeFinalizeCaption.maxLength;
                    if (typeof cap === "number" && v.length > cap) {
                      v = v.slice(0, cap);
                    }
                    composeFinalizeCaption.onChange(v);
                    resizeFinalizeCaptionCanvas(e.currentTarget, {
                      empty: !v.trim(),
                    });
                  }}
                  onFocus={(e) => {
                    // Clear any locked autosize height before React re-renders compact minHeight.
                    if (!e.currentTarget.value.trim()) {
                      e.currentTarget.style.removeProperty("height");
                      e.currentTarget.style.minHeight =
                        FINALIZE_CAPTION_MIN_HEIGHT_COMPACT;
                    }
                    composeFinalizeCaption.onCaptionFocusChange?.(true);
                  }}
                  onBlur={(e) => {
                    if (!e.currentTarget.value.trim()) {
                      e.currentTarget.style.removeProperty("height");
                      // Spacious only when empty+blur; React will sync minHeight from compact=false.
                      e.currentTarget.style.minHeight =
                        FINALIZE_CAPTION_MIN_HEIGHT_SPACIOUS;
                    }
                    composeFinalizeCaption.onCaptionFocusChange?.(false);
                  }}
                  rows={1}
                  placeholder={
                    composeFinalizeCaption.requiredWarning &&
                    !composeFinalizeCaption.value.trim()
                      ? "Add a caption to continue."
                      : "Say what this is about…"
                  }
                  data-create-caption-compact={
                    finalizeCaptionCompact ? "true" : "false"
                  }
                  data-create-caption-link-preview={
                    finalizeCaptionLinkPreview ? "true" : "false"
                  }
                  style={{ minHeight: finalizeCaptionMinHeight }}
                  className={[
                    COMPOSE_LINK_PREVIEW_TYPE_CLASS,
                    "create-finalize-caption-canvas relative z-[1] w-full overflow-hidden resize-none bg-transparent outline-none",
                    finalizeCaptionLinkPreview
                      ? "create-finalize-caption-canvas--link-preview"
                      : "text-[var(--text)]",
                    "placeholder:transition-colors placeholder:duration-700 placeholder:ease-out",
                    composeFinalizeCaption.requiredWarning &&
                    !composeFinalizeCaption.value.trim()
                      ? "placeholder:text-[var(--brand)] app-dark:placeholder:text-[var(--brand)]"
                      : composeFinalizeCaption.captionFocused &&
                        !composeFinalizeCaption.value.trim()
                      ? "create-finalize-caption--focus-invite"
                      : composeFinalizeCaption.entryPulse &&
                        !composeFinalizeCaption.value.trim()
                      ? "placeholder:text-[var(--brand)] app-dark:placeholder:text-[var(--brand)]"
                      : "placeholder:text-[var(--text)]/42 app-dark:placeholder:text-white/40",
                    composeFinalizeCaption.requiredWarningPulse &&
                    composeFinalizeCaption.requiredWarning &&
                    !composeFinalizeCaption.value.trim()
                      ? "create-finalize-caption--required-pulse"
                      : !composeFinalizeCaption.requiredWarning &&
                        composeFinalizeCaption.focusPulse &&
                        !composeFinalizeCaption.value.trim()
                      ? "create-finalize-caption--focus-pulse"
                      : "",
                  ].join(" ")}
                  aria-describedby={
                    typeof composeFinalizeCaption.maxLength === "number"
                      ? "create-finalize-caption-count"
                      : undefined
                  }
                  aria-invalid={
                    composeFinalizeCaption.requiredWarning &&
                    !composeFinalizeCaption.value.trim()
                      ? true
                      : undefined
                  }
                />
                {typeof composeFinalizeCaption.maxLength === "number" ? (
                  <div
                    id="create-finalize-caption-count"
                    className="pointer-events-none absolute bottom-1 right-0 z-[2] text-[10px] tabular-nums text-[var(--text)]/40 app-dark:text-white/35"
                    aria-live="polite"
                  >
                    {composeFinalizeCaption.value.length}/
                    {composeFinalizeCaption.maxLength}
                  </div>
                ) : null}
              </div>
              {finalizeCaptionLinkPreview ? (
                <ComposeLinkOpenIcons text={composeFinalizeCaption.value} />
              ) : null}
              {composeFinalizeCaption.belowCaption}
              {composeFinalizeBelowCaption ? (
                <div
                  className={`mt-3 flex w-full flex-col ${finalizeBelowCaptionGapClass}`}
                >
                  {composeFinalizeBelowCaption}
                </div>
              ) : null}
            </div>
          </section>
        ) : post.caption ? (
          <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-snug text-[var(--text)]/90">
            <PostCaptionText text={post.caption} />
          </p>
        ) : null}

        {!composeFinalizeShell && publishedV4KeyDetailValues.length > 0 ? (
          <PostV4KeyDetailsReadOnly values={publishedV4KeyDetailValues} />
        ) : null}

        {!composeFinalizeCaption && composeFinalizeBelowCaption ? (
          <div
            className={`mt-4 flex w-full flex-col ${finalizeMetaToSectionsGapClass}`}
          >
            {composeFinalizeBelowCaption}
          </div>
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
              {/* Post-detail hashtags: only when real tags exist (no Event/Place fallback). */}
              {tags.length > 0 ? (
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
                        {formatHashtagForDisplay(t)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Dates & Recurring — helpers unchanged; border-only shell */}
              {showScheduleBlock && (
                <div className="mt-3 rounded-xl border border-[var(--border)]/70 bg-transparent px-3 py-2.5 app-dark:border-white/22">
                  <div className="mb-1.5 flex items-center gap-2">
                    <PiCalendarBlank
                      className="h-4 w-4 shrink-0 text-[var(--create-accent-icon-fg)]"
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
                  {scheduleStatusLine ? (
                    <p
                      className={[
                        scheduleSummaryLine ? "mt-1" : "",
                        "text-[11px] leading-snug",
                        getPostScheduleLabelTextClass(headerScheduleLabel.kind),
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      data-schedule-status
                    >
                      {scheduleStatusLine}
                    </p>
                  ) : null}
                  {recurrenceSummaryLine ? (
                    <p
                      className={
                        scheduleSummaryLine || scheduleStatusLine
                          ? "mt-1.5 text-[11px] leading-snug text-[var(--text)]/58 app-dark:text-white/55"
                          : "text-[11px] leading-snug text-[var(--text)]/58 app-dark:text-white/55"
                      }
                      data-schedule-recurrence
                    >
                      {recurrenceSummaryLine}
                    </p>
                  ) : null}
                </div>
              )}

              {!composeFinalizeShell && publishedCarrierSlot0Location ? (
                <div className="mt-3" data-location-section>
                  <PostV4LocationReadOnly
                    locationName={publishedCarrierSlot0Location.locationName}
                    locationUrl={publishedCarrierSlot0Location.locationUrl}
                    locationDesc={publishedCarrierSlot0Location.locationDesc}
                    locationNotes={publishedCarrierSlot0Location.locationNotes}
                  />
                </div>
              ) : null}

              <PostRatingSummary
                ratingEnabled={post.rating_enabled}
                ratingAverage={
                  post.effective_rating_average ?? post.rating_average ?? null
                }
                ratingCount={
                  post.effective_rating_count ?? post.rating_count ?? null
                }
                viewerRating={post.viewer_rating ?? null}
                inlineInteractive
                postId={post.id}
                onRatingApplied={(next) => {
                  const blended = computeBlendedEffectiveFromReal(
                    next.ratingAverage,
                    next.ratingCount,
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
            </>
          ) : null}

          {!composeFinalizeShell && publishedV4SectionBodies.length > 0 ? (
            <PostV4SectionsReadOnly bodies={publishedV4SectionBodies} />
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
                          Array.isArray(a.tags) ? a.tags : [],
                        );

                        const showStopHeading = shouldShowTimelineStopHeading(
                          input,
                          i,
                          visibleTagLineCount,
                        );

                        const extrasFiltered = Array.isArray(extras)
                          ? stripV4KeyInfoFromAdditionalInfo(extras).filter(
                              (x) => x?.title && x?.value,
                            )
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
                                    ),
                                  )
                                ) : (
                                  <ReadOnlyActivityTagLine
                                    text={getTimelineStopHeadingText(
                                      a.title || `Stop ${i + 1}`,
                                      i,
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
                              <div className={hasLocation ? "mt-4" : "mt-8"}>
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
                      },
                    )}
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
          {modalComposerPortalHost ? (
            createPortal(
              <PostDetailSocialDock
                postId={post.id}
                postType={post.type}
                post={post}
                isModal
                modalComposerLayer="layer-absolute"
              />,
              modalComposerPortalHost,
            )
          ) : (
            <PostDetailSocialDock
              postId={post.id}
              postType={post.type}
              post={post}
              isModal={!!onClose}
              modalComposerLayer="viewport-fixed"
            />
          )}
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
