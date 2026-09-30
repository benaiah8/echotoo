export {
  buildPublishedMediaItems,
  isPublishedMediaOrder,
  publishedVideoAspectRatio,
  isPublishedVideoOnly,
  isPublishedSingleImage,
  publishedMediaFrameStyle,
  PUBLISHED_DIMLESS_VIDEO_FALLBACK_ASPECT,
  PUBLISHED_DIMLESS_VIDEO_FALLBACK_MIN_HEIGHT,
} from "./types";
export type {
  PublishedMediaItem,
  PublishedPostMediaRow,
  PublishedVideoStatus,
  PublishedMediaFrameStyle,
  PublishedMediaFrameOptions,
} from "./types";
export {
  normalizePublishedImageUrl,
  resolvePublishedImageDisplayUrl,
} from "./normalizePublishedImageUrl";
export {
  getPublishedPostMediaForDetail,
  fetchPublishedPostMediaRowById,
  getPublishedPostMediaForPosts,
} from "./getPublishedPostMediaForDetail";
export type { PublishedPostMediaForDetail } from "./getPublishedPostMediaForDetail";
export {
  buildBunnyHlsPlaylistUrl,
  getBunnyStreamCdnHost,
  resolvePublishedVideoPlayback,
} from "./resolvePublishedVideoPlayback";
export type {
  PublishedVideoPlayback,
  PublishedVideoPlaybackInput,
} from "./resolvePublishedVideoPlayback";

export {
  publishedLightboxImageUrls,
  mixedIndexToLightboxImageIndex,
} from "./lightboxIndex";
export {
  mapCompactPostMediaRow,
  mapCompactPostMediaRows,
  imageUrlsFromMediaOrder,
} from "./mapCompactPostMedia";
export {
  resolvePublishedMediaCover,
} from "./resolvePublishedMediaCover";
export type { PublishedMediaCover } from "./resolvePublishedMediaCover";
export {
  PUBLISHED_MEDIA_CACHE_TTL_MS,
  PUBLISHED_MEDIA_DETAIL_IMAGE_LOADER_REV,
  publishedMediaViewerKey,
  getPublishedMediaCache,
  isPublishedMediaCacheFresh,
  isStaleEmptyDetailImageSeed,
  setPublishedMediaCache,
  ensurePublishedMediaCacheForDetailHandoff,
  ensureLegacyGalleryHandoffFromUrls,
  upgradePublishedMediaLegacyGalleryFromUrls,
  patchPublishedMediaRow,
  invalidatePublishedMedia,
  clearPublishedMediaCache,
  seedPublishedMediaFromList,
  shouldApplyPublishedMediaListSeed,
  getOrFetchPublishedMedia,
  getOrFetchPublishedMediaMany,
  dedupePublishedMediaPostIds,
  decidePublishedMediaCacheWrite,
  isLegacyGalleryCompletenessUpgrade,
  isPoorerLegacyImageMembership,
  resolvePublishedMediaCacheAuthority,
  __resetPublishedMediaCacheForTests,
} from "./publishedMediaCache";
export type {
  PublishedMediaCacheEntry,
  PublishedMediaCacheSource,
  PublishedMediaCacheProvenance,
  PublishedMediaLegacyScope,
  SeedPublishedMediaFromListInput,
  GetOrFetchPublishedMediaOptions,
  GetOrFetchPublishedMediaManyOptions,
  GetOrFetchPublishedMediaManyResult,
} from "./publishedMediaCache";
export {
  seedPublishedMediaFromFeedItems,
  resolvePublishedPostImageUrls,
} from "./seedPublishedMediaFromFeedItems";
export type {
  FeedItemPublishedMediaFields,
  PublishedPostImageUrlSources,
  SeedPublishedMediaFromFeedItemsOptions,
} from "./seedPublishedMediaFromFeedItems";

export {
  PUBLISHED_PROCESSING_LIST_POLL_MS,
  getPublishedProcessingListOwnerId,
  requestPublishedProcessingListOwnership,
  releasePublishedProcessingListOwnership,
  pausePublishedProcessingListPolling,
  resumePublishedProcessingListPollingIfNeeded,
  __resetPublishedProcessingListRevalidatorForTests,
} from "./publishedProcessingListRevalidator";
export type { ProcessingListRevalidatorOwnerId } from "./publishedProcessingListRevalidator";
export { computeEffectiveIntersectionRatio } from "./listVideoVisibility";
export { PUBLISHED_LIST_IO_THRESHOLDS } from "./listVideoIoThresholds";
export {
  PUBLISHED_LIST_VIDEO_ACTIVE_ENTER_RATIO,
  PUBLISHED_LIST_VIDEO_ACTIVE_EXIT_RATIO,
  PUBLISHED_LIST_VIDEO_VISIBILITY_RATIO,
  PUBLISHED_LIST_VIDEO_WARM_RATIO,
} from "./listVideoVisibilityThresholds";
export {
  evaluatePublishedListVideoVisibilityPolicy,
  type PublishedListVideoVisibilityPolicy,
  type PublishedListVideoVisibilityPolicyInput,
} from "./listVideoVisibilityPolicy";
export { shouldAllowPublishedListVideoSpeculativeWarm } from "./publishedListVideoWarmGate";

export {
  PUBLISHED_HLS_BUFFER,
  PUBLISHED_HLS_WARM_BUFFER,
  PUBLISHED_LIST_WARM_BUFFER_TARGET_SEC,
} from "./publishedHlsBufferConfig";
export type { PublishedHlsBufferConfig } from "./publishedHlsBufferConfig";
export {
  getPublishedVideoSoundPreference,
  getPublishedVideoPreferredMuted,
  setPublishedVideoSoundPreferenceMuted,
  getPublishedVideoSessionUnmuted,
  setPublishedVideoSessionUnmuted,
  __resetPublishedVideoMutePreferenceForTests,
} from "./publishedVideoMutePreference";
export type { PublishedVideoSoundPreference } from "./publishedVideoMutePreference";
export {
  isPositivePublishedDimension,
  mergePublishedDimensionField,
  mergePublishedVideoDimensions,
} from "./mergePublishedVideoDimensions";
export {
  mergePublishedPosterUrl,
  mergePublishedVideoItemFields,
  mergePublishedVideoItemFromRow,
  preservePublishedVideoMetadataAcrossItems,
  preservePositiveVideoDimensions,
} from "./mergePublishedVideoMetadata";
export {
  isPublishedVideoProcessingStatus,
  shouldApplyPosterProvisionalVideoDimensions,
  posterProvisionalDimensionsAlreadyApplied,
} from "./posterProvisionalVideoDimensions";
export {
  resolvePublishedMultiMediaFrame,
  resolvePublishedImageOnlyAspectRatio,
  findPrimaryPublishedVideoAspectRatio,
  clampPublishedImageOnlyAspectRatio,
  publishedMediaMembershipSignature,
  medianNumber,
  isUsablePublishedImageNaturalSize,
  PUBLISHED_MULTI_ASPECT_MIN,
  PUBLISHED_MULTI_ASPECT_MAX,
  PUBLISHED_MULTI_PROVISIONAL_ASPECT,
  PUBLISHED_MULTI_MIN_HEIGHT,
  PUBLISHED_IMAGE_SAMPLE_MIN_PX,
} from "./resolvePublishedMultiMediaFrame";
export type {
  PublishedImageAspectSample,
  ResolvePublishedMultiMediaFrameInput,
  ResolvePublishedMultiMediaFrameResult,
} from "./resolvePublishedMultiMediaFrame";
export { usePublishedMultiMediaFrame } from "./usePublishedMultiMediaFrame";
export type {
  PublishedMultiMediaFramePolicy,
  UsePublishedMultiMediaFrameOptions,
} from "./usePublishedMultiMediaFrame";
export { isPublishedMediaMembershipExpansion } from "./usePublishedMultiMediaFrame";
export { remapPublishedMediaActiveIndex } from "./remapPublishedMediaActiveIndex";
export {
  resolvePublishedCarouselInitialIndex,
  resolvePublishedCarouselIndexAfterItemsChange,
  shouldAcceptPublishedCarouselSlideChange,
  markPublishedCarouselInitialKeyApplied,
} from "./publishedCarouselInitialIndex";
export {
  isPublishedFullscreenVerticalDismissBlockedTarget,
  isPublishedFullscreenBackdropDismissTarget,
  shouldClosePublishedFullscreenVerticalDismiss,
  resolvePublishedFullscreenAxisLock,
  resolvePublishedFullscreenDismissPolicy,
  shouldBlockLegacyMixedVideoVerticalDismiss,
  resolvePublishedFullscreenThumbSrc,
  isPublishedFullscreenVideoOnlyItems,
  armPublishedFullscreenDismissTapSuppress,
  shouldSuppressPublishedVideoSurfaceTap,
  __resetPublishedFullscreenDismissTapSuppressForTests,
} from "./publishedFullscreenGestures";
export type {
  PublishedFullscreenVerticalDismissPolicy,
  PublishedFullscreenAxisLock,
} from "./publishedFullscreenGestures";
export {
  usePublishedVideoSurfaceGestures,
  PUBLISHED_HOLD_CANCEL_PX,
} from "./usePublishedVideoSurfaceGestures";
export type { PublishedVideoGestureFlash } from "./usePublishedVideoSurfaceGestures";
export {
  logPublishedVideoState,
  logPublishedVideoStateTransition,
  nextPublishedVideoPlayerInstanceId,
  publishedVideoMediaSnapshot,
  publishedVideoPlayErrorName,
  __resetPublishedVideoStateLogForTests,
} from "./publishedVideoStateLog";
export {
  createPublishedVideoPlaybackSnapshot,
  capturePublishedVideoPlaybackFromElement,
  isPublishedVideoPlaybackSnapshotForMedia,
  clampPublishedVideoSeekTime,
  waitForPublishedVideoCanSeek,
  applyPublishedVideoCurrentTime,
  waitForPublishedVideoSeekSettled,
  isPublishedVideoSeekNearTime,
  resolvePublishedVideoSeekPlaybackAction,
  PUBLISHED_VIDEO_SEEK_SETTLE_EPSILON_SEC,
} from "./publishedVideoPlaybackSnapshot";
export type { PublishedVideoPlaybackSnapshot } from "./publishedVideoPlaybackSnapshot";
export {
  resolvePublishedVideoHandoffLatchUi,
  shouldSuppressCompetingPlayDuringHandoff,
  shouldCommitDeferredPlaybackTeardown,
  shouldTearDownIdlePublishedVideo,
  resolveHandoffRestoreAbortDisposition,
  abandonPublishedVideoHandoffForManualPlay,
  nextHandoffVisualSeekLock,
  shouldCommitHandoffRestoreVisualState,
  resolvePublishedVideoShowVideoFrame,
  shouldIgnoreTimeupdateDuringHandoffSeek,
  shouldResetAppliedHandoffGeneration,
  shouldHideVideoFrameUntilHandoffSeek,
  classifyPublishedVideoPlayError,
  resolvePublishedVideoHandoffPlayMute,
  shouldRetryPublishedVideoPlayMuted,
  applyPublishedVideoHandoffRestore,
} from "./publishedVideoHandoffRestore";
export {
  resolveVideoPlaybackLoadingVisible,
  resolvePublishedVideoAwaitingFirstFrame,
  VIDEO_PLAYBACK_LOADING_STALL_TIMEOUT_MS,
} from "./resolveVideoPlaybackLoadingVisible";
export type { ResolveVideoPlaybackLoadingVisibleInput } from "./resolveVideoPlaybackLoadingVisible";
export type {
  PublishedVideoHandoffLatchUi,
  PublishedVideoHandoffRestoreStatus,
  PublishedVideoHandoffRestoreResult,
  PublishedVideoPlayErrorKind,
  HandoffRestoreAbortDisposition,
  HandoffVisualSeekLockState,
} from "./publishedVideoHandoffRestore";
export {
  nextPublishedVideoFeedDetailHandoffGeneration,
  setPublishedVideoFeedDetailHandoff,
  peekPublishedVideoFeedDetailHandoff,
  peekPublishedVideoFeedDetailHandoffEntry,
  consumePublishedVideoFeedDetailHandoff,
  invalidatePublishedVideoFeedDetailHandoff,
  isPublishedVideoListHandoffOrigin,
  resolvePublishedListHandoffOrigin,
  latchPublishedListHandoffOrigin,
  shouldCapturePublishedVideoListDetailHandoff,
  capturePublishedVideoListToDetailHandoff,
  writePublishedVideoListReturnHandoff,
  resolvePublishedVideoListReturnIntent,
  consumePublishedVideoListToDetailHandoffIfEligible,
  __resetPublishedVideoFeedDetailHandoffForTests,
} from "./publishedVideoFeedDetailHandoff";
export type {
  PublishedVideoFeedDetailHandoffDirection,
  PublishedVideoFeedDetailHandoffEntry,
  PublishedVideoListHandoffOrigin,
  PublishedVideoFeedDetailHandoffMatch,
  InvalidatePublishedVideoFeedDetailHandoffOptions,
} from "./publishedVideoFeedDetailHandoff";
export {
  getPublishedImageAspectRatio,
  rememberPublishedImageAspectRatio,
  __resetPublishedImageAspectRatioCacheForTests,
} from "./publishedImageAspectRatioCache";

export {
  getPublishedListVideoOwnerId,
  getPublishedListVideoWarmOwnerId,
  subscribePublishedListVideoOwner,
  subscribePublishedListVisibilityEpoch,
  getPublishedListVisibilityEpoch,
  requestPublishedListVideoOwnership,
  requestPublishedListVideoWarmOwnership,
  releasePublishedListVideoOwnership,
  releasePublishedListVideoWarmOwnership,
  releaseAllPublishedListVideoOwnership,
  ensurePublishedListVideoDocumentVisibilityCleanup,
  publishedListVideoOwnerId,
  __resetPublishedListVideoCoordinatorForTests,
  __bumpPublishedListVisibilityEpochForTests,
} from "./publishedListVideoCoordinator";
export type { PublishedListVideoOwnerId } from "./publishedListVideoCoordinator";

export {
  isPublishedVideoContaining,
  shouldUsePublishedImmersiveFullscreenChrome,
  shouldShowPublishedFullscreenThumbStrip,
  shouldShowPublishedFullscreenMixedVideoDots,
  shouldShowPublishedFullscreenTopClose,
  shouldUsePublishedFullscreenMixedMediaCount,
  PUBLISHED_FULLSCREEN_MIXED_VIDEO_DOTS_BOTTOM_CSS,
  PUBLISHED_FULLSCREEN_MIXED_CHROME_GAP_PX,
  PUBLISHED_FULLSCREEN_MIXED_CHROME_CLOSE_PX,
  PUBLISHED_FULLSCREEN_MIXED_CHROME_RAIL_PX,
  PUBLISHED_FULLSCREEN_MIXED_CHROME_BODY_PX,
  PUBLISHED_FULLSCREEN_MIXED_CHROME_HEIGHT_CSS,
  PUBLISHED_FULLSCREEN_MIXED_OVERLAY_CLOSE_TOP_CSS,
  PUBLISHED_FULLSCREEN_MIXED_OVERLAY_CLOSE_LEFT_CSS,
  PUBLISHED_FULLSCREEN_MIXED_PAGINATION_TOP_CSS,
  PUBLISHED_FULLSCREEN_MIXED_PAGINATION_RIGHT_CSS,
  PUBLISHED_FULLSCREEN_MIXED_PAGINATION_DOT_LIMIT,
  shouldMountFullscreenPublishedVideoPlayer,
  publishedVideoObjectIdentity,
} from "./publishedVideoSessionHost";

export {
  normalizeManualVideoRotateDeg,
  nextManualVideoRotateDeg,
  isManualVideoQuarterTurn,
  resolveManualVideoRotateFitStyle,
  shouldShowPublishedFullscreenVideoRotateControl,
} from "./publishedFullscreenVideoManualRotate";
export type { ManualVideoRotateDeg } from "./publishedFullscreenVideoManualRotate";

/** Swiper no-swipe selector for published mixed carousel (Create parity). */
export const PUBLISHED_MEDIA_SWIPE_NO_SELECTOR =
  "[data-video-control],[data-swiper-no-swipe],[data-video-scrubber]";

/** Post Detail scrubber inset from bottom of black media frame (~12px). */
export const PUBLISHED_VIDEO_SCRUB_BOTTOM_CSS = "0.75rem";

/** List surface visibility dwell before muted autoplay (ms). PV3.1: ~350ms. */
export const PUBLISHED_LIST_VIDEO_DWELL_MS = 350;
