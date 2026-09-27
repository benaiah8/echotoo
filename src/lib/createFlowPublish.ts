/**
 * Shared publish path for create flow (Preview page + Finalize direct publish).
 * Keeps insert/update, activities, XP, personalization, and cache invalidation in one place.
 */
import { supabase } from "./supabaseClient";
import { insertPost, invokePostPublishedPush } from "../api/services/posts";
import {
  adminRepublishPost,
  invalidateCachesAfterAdminPostEdit,
} from "../api/services/adminPosts";
import {
  ownerCreatePost,
  ownerRepublishPost,
} from "../api/services/ownerPosts";
import { assertLocalCreateDraftOwnedBy, getDraftPublishPostIdForPublish } from "./drafts";
import { invalidatePostDetailCache } from "../api/queries/getPostById";
import { dataCache } from "./dataCache";
import { recordSignal } from "./feedPersonalization";
import { incrementMyXp } from "../api/services/xp";
import { sanitizeTagsForPublish } from "./createFlowLimits";
import { isMeaningfulActivityAtIndex as shouldPersistActivityAtIndex } from "./createFlowMeaningfulActivity";
import { sanitizeV4SectionBodyForCommit } from "./createFlowV4Section";
import { persistOwnCreatedPrependPending } from "./ownCreatedPendingPrepend";
import {
  invalidatePublishedMedia,
  seedPublishedMediaFromList,
} from "./publishedMedia";
import { clearPersistedProfilePosts } from "./profilePostListCache";
import { assertCreateFlowDraftTextAllowed } from "./ugcTextPolicy";
import { emitPostChanged, type PostPatch } from "./postEvents";
import {
  resolveAdminRepublishTypeGate,
  withOwnerRepublishTypeKey,
} from "./createFlowPostType";
import { resolveCreateFlowPublishRsvpCapacity } from "./createFlowPublishRsvp";
import { invalidatePairUpForPost } from "./pairUpCache";
import { invalidateOpenPlanOwnForPost } from "./openPlanCache";
import { invalidateGroupUpOwnForPost } from "./groupUpCache";
import { invalidateGroupUpSourceList } from "./groupUpSourceListCache";
import { enqueuePendingPostPatch } from "./pendingPostPatches";
import { buildCarouselImages } from "./carouselImages";
import {
  mapDraftMediaOrderToPublished,
  type DraftMediaOrderItem,
  type PublishedMediaOrderItem,
} from "./createDraftMediaOrder";
import { isLocalDraftImageUrl } from "./createDraftImage/localDraftImageUrl";
import { assertPublishImagePayloadHasNoLocalLeak } from "./createDraftImage/publishDraftImages";
import {
  isCanonicalPublishedVideoMediaId,
  PUBLISHED_VIDEO_MEDIA_ID_REQUIRED_MESSAGE,
  PUBLISHED_VIDEO_ORDER_REQUIRED_MESSAGE,
} from "./resolvePublishedVideoMediaId";
import type { VideoEditPayload } from "./ownerPostMediaEditContract";

/** Legacy sessionStorage key — no longer written; cleared on new publish for hygiene. */
const LEGACY_OWN_CREATED_PUBLISHED_PENDING_KEY =
  "echotoo:own-created-published-pending";

export type CreateFlowDraftActivity = {
  title?: string;
  activityType?: string;
  customActivity?: string;
  locationDesc?: string;
  location?: string;
  locationNotes?: string;
  locationUrl?: string;
  tags?: string[];
  images?: unknown[];
  additionalInfo?: { title: string; value: string }[];
  sectionBody?: string;
};

const isHttpUrl = (v: unknown): v is string =>
  typeof v === "string" &&
  (/^https?:\/\//.test(v) || (v.includes("/") && v.includes(".")));

const isCloudinaryUrl = (u: string) => u.includes("res.cloudinary.com");

export function cleanImagesForActivity(arr: unknown): string[] {
  const valid = Array.isArray(arr)
    ? arr
        .map(String)
        .filter(
          (u) =>
            isHttpUrl(u) &&
            !isLocalDraftImageUrl(u) &&
            !u.startsWith("blob:"),
        )
    : [];
  const nonCloudinary = valid.filter((u) => !isCloudinaryUrl(u));
  const hadCloudinary = valid.some(isCloudinaryUrl);
  if (hadCloudinary && nonCloudinary.length === 0) {
    console.warn(
      "[createFlowPublish] Dropping Cloudinary-only images (would store empty)",
      { droppedCount: valid.length }
    );
    return [];
  }
  return hadCloudinary ? nonCloudinary : valid;
}

function coerceStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function mapActivitiesForDbInsert(
  activities: CreateFlowDraftActivity[]
): Array<Record<string, unknown>> {
  return activities.map((a: CreateFlowDraftActivity, i: number) => {
    const sectionBody = sanitizeV4SectionBodyForCommit(a.sectionBody ?? "");
    return {
      title: a.title || a.customActivity || a.activityType || `Stop ${i + 1}`,
      activity_type: a.activityType ?? null,
      custom_activity: a.customActivity ?? null,
      location_name: a.location ?? null,
      location_desc: a.locationDesc ?? null,
      location_url: a.locationUrl ?? null,
      location_notes: a.locationNotes ?? null,
      additional_info: a.additionalInfo ?? null,
      tags: a.tags ?? null,
      images: cleanImagesForActivity(a.images),
      section_body: sectionBody || null,
    };
  });
}

/** Admin RPC payload: array-like JSON fields must be arrays, not null/scalars. */
function mapActivitiesForAdminRepublish(
  activities: CreateFlowDraftActivity[]
): Array<Record<string, unknown>> {
  return mapActivitiesForDbInsert(activities).map((row) => ({
    ...row,
    tags: coerceStringArray(row.tags),
    images: coerceStringArray(row.images),
  }));
}

function mapActivitiesForOwnerCreate(
  activities: CreateFlowDraftActivity[]
): Array<Record<string, unknown>> {
  return mapActivitiesForAdminRepublish(activities).map((row, i) => ({
    ...row,
    order_idx: i,
  }));
}

function resolvePublishedMediaOrderForCreate(
  input: ExecuteCreateFlowPublishInput,
): PublishedMediaOrderItem[] | undefined {
  if (!input.mediaOrder?.length) {
    if (input.requireVideoInMediaOrder) {
      throw new Error(PUBLISHED_VIDEO_ORDER_REQUIRED_MESSAGE);
    }
    return undefined;
  }
  const hasVideo = input.mediaOrder.some((item) => item.kind === "video");
  if (input.requireVideoInMediaOrder && !hasVideo) {
    throw new Error(PUBLISHED_VIDEO_ORDER_REQUIRED_MESSAGE);
  }
  const publishedVideoMediaId = isCanonicalPublishedVideoMediaId(
    input.publishedVideoMediaId,
  )
    ? input.publishedVideoMediaId.trim()
    : null;
  if (hasVideo && !publishedVideoMediaId) {
    throw new Error(PUBLISHED_VIDEO_MEDIA_ID_REQUIRED_MESSAGE);
  }
  return mapDraftMediaOrderToPublished(
    input.mediaOrder,
    publishedVideoMediaId,
  );
}

function buildOwnerCreatePayload(
  input: ExecuteCreateFlowPublishInput,
  activitiesForDb: Array<Record<string, unknown>>
): Record<string, unknown> {
  const tags = sanitizeTagsForPublish(input.tags);
  const mediaOrder = resolvePublishedMediaOrderForCreate(input);
  return {
    type: input.postType === "hangout" ? "hangout" : "experience",
    caption: input.caption,
    visibility: input.visibility === "friends" ? "friends" : "public",
    tags,
    selected_dates: input.selectedDatesIso,
    rsvp_capacity: input.rsvpCapacity,
    is_recurring: input.isRecurring ?? null,
    recurrence_days: input.recurrenceDays,
    rating_enabled: input.ratingEnabled ?? false,
    activities: activitiesForDb,
    ...(mediaOrder ? { media_order: mediaOrder } : {}),
  };
}

function buildAdminRepublishPayload(
  input: ExecuteCreateFlowPublishInput,
  activitiesForDb: Array<Record<string, unknown>>
): Record<string, unknown> {
  const tags = sanitizeTagsForPublish(input.tags);
  const payload: Record<string, unknown> = {
    type: input.postType === "hangout" ? "hangout" : "experience",
    caption: input.caption,
    visibility: input.visibility === "friends" ? "friends" : "public",
    tags,
    selected_dates: input.selectedDatesIso,
    rsvp_capacity: input.rsvpCapacity,
    is_recurring: input.isRecurring ?? null,
    recurrence_days: input.recurrenceDays,
    rating_enabled: input.ratingEnabled ?? false,
    is_anonymous: input.isAnonymous ?? false,
    anonymous_name: input.anonymousName ?? null,
    anonymous_avatar: input.anonymousAvatar ?? null,
    activities: activitiesForDb,
  };
  // Owner + Admin Edit: fold optional video_edit / media_order into the same RPC.
  applyEditMediaToRepublishPayload(payload, input);
  return payload;
}

/**
 * Fold optional Edit media keys into owner_republish_post / admin_republish_post.
 * Omitting videoEdit → no post_media video mutation. mediaOrder including [].
 */
function applyEditMediaToRepublishPayload(
  payload: Record<string, unknown>,
  input: ExecuteCreateFlowPublishInput,
): void {
  if (!input.commitOwnerMediaInRepublish) return;

  if (input.videoEdit) {
    payload.video_edit = input.videoEdit;
  }
  // Explicit media_order (including []) when draft order was provided.
  if (input.mediaOrder !== undefined) {
    if (input.mediaOrder.length === 0) {
      payload.media_order = [];
    } else {
      try {
        const publishedOrder = resolvePublishedMediaOrderForCreate(input);
        if (publishedOrder) {
          payload.media_order = publishedOrder;
        }
      } catch (err) {
        throw err instanceof Error
          ? err
          : new Error("Could not build media_order for edit save");
      }
    }
  }
}

/** Owner republish: omit type unless explicit confirmed conversion (D2B). */
function buildOwnerRepublishPayload(
  input: ExecuteCreateFlowPublishInput,
  activitiesForDb: Array<Record<string, unknown>>
): Record<string, unknown> {
  const payload = buildAdminRepublishPayload(input, activitiesForDb);

  return withOwnerRepublishTypeKey(
    payload,
    input.confirmedOwnerTypeConversion ?? null,
  );
}

function buildAdminEditVisiblePatch(
  input: ExecuteCreateFlowPublishInput,
  activities: CreateFlowDraftActivity[]
): PostPatch {
  const tags = sanitizeTagsForPublish(input.tags);
  const dbVisibility = input.visibility === "friends" ? "friends" : "public";
  const feedActivities = activities.map((a, i) => {
    const images = cleanImagesForActivity(a.images);
    return {
      title: a.title || a.customActivity || a.activityType || `Stop ${i + 1}`,
      images: images.length ? images : null,
      order_idx: i,
      location_name: a.location ?? null,
      location_desc: a.locationDesc ?? null,
      location_url: a.locationUrl ?? null,
      location_notes: a.locationNotes ?? null,
      additional_info: Array.isArray(a.additionalInfo) ? a.additionalInfo : null,
      tags: coerceStringArray(a.tags).length
        ? coerceStringArray(a.tags)
        : null,
    };
  });
  const carousel = buildCarouselImages(feedActivities, 400);

  return {
    caption: input.caption,
    tags: tags.length ? tags : null,
    visibility: dbVisibility,
    selected_dates: input.selectedDatesIso.length ? input.selectedDatesIso : null,
    rsvp_capacity: input.rsvpCapacity,
    is_recurring: input.isRecurring ?? null,
    recurrence_days: input.recurrenceDays.length ? input.recurrenceDays : null,
    ratingEnabled: input.ratingEnabled ?? false,
    activities: feedActivities,
    first_image_url: carousel.images[0] ?? null,
    has_images: carousel.images.length > 0,
    image_count: carousel.images.length,
  };
}

const ANONYMOUS_GUARD = {
  is_anonymous: false,
  anonymous_name: null as string | null,
  anonymous_avatar: null as string | null,
};

export type ExecuteCreateFlowPublishInput = {
  postType: "experience" | "hangout";
  /** Plain text; newlines preserved end-to-end (no flattening). */
  caption: string;
  tags: string[];
  visibility: "public" | "friends";
  rsvpCapacity: number | null;
  selectedDatesIso: string[];
  isRecurring: boolean;
  recurrenceDays: string[];
  activities: CreateFlowDraftActivity[];
  isEditMode: boolean;
  editPostId?: string;
  /** Reviewer editing another user's post — save via admin RPC only. */
  isAdminEdit?: boolean;
  /** Original owner auth user id for admin edit cache invalidation. */
  authorUserId?: string;
  /** Locked post type from edit bootstrap (admin type switch only when confirmed). */
  originalPostType?: "experience" | "hangout";
  /**
   * After published conversion confirm (owner or admin), include this `type` on
   * republish. Omit for ordinary edits (historical / legacy safe).
   */
  confirmedOwnerTypeConversion?: "experience" | "hangout" | null;
  isAnonymous?: boolean | null;
  anonymousName?: string | null;
  anonymousAvatar?: string | null;
  /** When true, post accepts star ratings (defaults false). */
  ratingEnabled?: boolean;
  /**
   * CreateFinalize new publish: requires draftMeta.publishPostId and uses owner_create_post.
   * Omit/false for legacy Preview insertPost path.
   */
  atomicPublish?: boolean;
  /**
   * Draft media order for new atomic publish. Mapped to posts.media_order via
   * {@link mapDraftMediaOrderToPublished} when present.
   * Owner/Admin Edit with {@link commitOwnerMediaInRepublish}: included on
   * owner_republish_post / admin_republish_post (including empty array).
   */
  mediaOrder?: DraftMediaOrderItem[];
  /**
   * Canonical remote post_media.id for media_order video items.
   * Must be passed from the current Publish transaction (upload return / draft
   * remoteMediaId) — do not rely on React state flush timing.
   * Edit retain: existing PublishedVideoReference.mediaId.
   * Edit ADD/REPLACE: staged media id after upload.
   */
  publishedVideoMediaId?: string | null;
  /**
   * PV3.3: when true, final published media_order must include a video entry
   * (active DraftVideo was present at Publish). Fail before owner_create_post.
   */
  requireVideoInMediaOrder?: boolean;
  /**
   * Owner/Admin Edit: optional video_edit folded into republish RPC.
   * Omit / null → no post_media video mutation (UNCHANGED).
   */
  videoEdit?: VideoEditPayload | null;
  /**
   * Owner/Admin Edit: include media_order (+ video_edit) atomically on
   * owner_republish_post / admin_republish_post and skip the legacy post-hoc
   * updateOwnedPostMediaOrder write.
   */
  commitOwnerMediaInRepublish?: boolean;
  /**
   * PV3.4: creator-first published media seed (compact media_order + post_media).
   * When set on new publish, seeds publishedMediaCache instead of only invalidating.
   */
  publishedMediaSeed?: {
    mediaOrder: unknown;
    postMedia: unknown;
    imageUrls?: string[];
  } | null;
};

export type ExecuteCreateFlowPublishResult = {
  post: {
    id: string;
    type: string;
    caption: string | null;
    author_id: string;
    tags: string[] | null;
    is_recurring: boolean | null;
  };
  /** Present for new publish paths (atomic RPC or legacy insert). */
  created?: boolean;
};

/**
 * Inserts or updates post + activities; side effects: XP, personalization, caches, publishedPostLast.
 * New publishes also write `echotoo:own-created-prepend-pending` and clear the current user's Created list caches.
 */
export async function executeCreateFlowPublish(
  input: ExecuteCreateFlowPublishInput
): Promise<ExecuteCreateFlowPublishResult> {
  // NEW POST: always null. EXISTING EDIT: keep historical unless type conversion.
  const resolvedRsvpCapacity = resolveCreateFlowPublishRsvpCapacity({
    isEditMode: input.isEditMode,
    existingCapacity: input.rsvpCapacity,
    confirmedTypeConversion: input.confirmedOwnerTypeConversion ?? null,
  });
  input = { ...input, rsvpCapacity: resolvedRsvpCapacity };

  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession();
  if (sessErr) throw sessErr;
  if (!session?.user) throw new Error("Not authenticated");

  assertCreateFlowDraftTextAllowed({
    caption: input.caption,
    tags: input.tags,
    activities: input.activities,
  });

  const dbVisibility = input.visibility === "friends" ? "friends" : "public";
  const tags = sanitizeTagsForPublish(input.tags);
  const ratingEnabled = input.ratingEnabled ?? false;

  const sanitizedActivities = input.activities.map((a, i) => ({
    ...a,
    _idx: i,
    images: cleanImagesForActivity(a?.images),
  }));

  const activitiesToPersist = sanitizedActivities.filter((a, i) =>
    shouldPersistActivityAtIndex(a, i)
  );

  let post: ExecuteCreateFlowPublishResult["post"];
  /** New publish only: true = first creation, false = idempotent replay. */
  let publishCreated: boolean | undefined;

  if (input.isEditMode && input.editPostId && input.isAdminEdit) {
    const { nextType, confirmedSwitch } = resolveAdminRepublishTypeGate({
      originalPostType: input.originalPostType,
      postType: input.postType,
      confirmedTypeConversion: input.confirmedOwnerTypeConversion,
    });

    const payload = buildAdminRepublishPayload(
      input,
      mapActivitiesForAdminRepublish(activitiesToPersist)
    );
    // Confirmed switch: payload.type must be the validated target only.
    if (confirmedSwitch) {
      payload.type = nextType;
    }

    const result = await adminRepublishPost(input.editPostId, payload);
    if (!result.updated) {
      throw new Error("Post was not updated");
    }

    const authorId = result.authorId || input.authorUserId;
    if (!authorId) {
      throw new Error("Missing post author after admin edit");
    }

    await invalidateCachesAfterAdminPostEdit(result.postId, authorId);

    // Atomic media_order via admin_republish_post when commitOwnerMediaInRepublish.
    // Do NOT post-hoc updateOwnedPostMediaOrder (posts UPDATE RLS is owner-only).

    // Type change: discovery eligibility is live from posts.type — incompatible
    // Pair Up / Open Plan stop surfacing without soft-close (D3 product choice).
    if (confirmedSwitch) {
      invalidatePairUpForPost(result.postId);
      invalidateOpenPlanOwnForPost(result.postId);
      invalidateGroupUpOwnForPost(result.postId);
      invalidateGroupUpSourceList(result.postId);
    }

    const visiblePatch = buildAdminEditVisiblePatch(
      input,
      activitiesToPersist
    );
    emitPostChanged(result.postId, visiblePatch);
    enqueuePendingPostPatch(result.postId, visiblePatch);

    post = {
      id: result.postId,
      type: nextType,
      caption: input.caption,
      author_id: authorId,
      tags: tags.length ? tags : null,
      is_recurring: input.isRecurring ?? null,
    };

    return { post };
  }

  if (input.isEditMode && input.editPostId) {
    const payload = buildOwnerRepublishPayload(
      input,
      mapActivitiesForAdminRepublish(activitiesToPersist)
    );
    const { post: rpcPost, updated } = await ownerRepublishPost(
      input.editPostId,
      payload
    );
    if (!updated) {
      throw new Error("Post was not updated");
    }
    post = rpcPost as ExecuteCreateFlowPublishResult["post"];

    // Atomic media_order via owner_republish_post when commitOwnerMediaInRepublish.
    // Legacy admin / older owner path: post-hoc RLS update.
    if (
      !input.commitOwnerMediaInRepublish &&
      input.mediaOrder?.length
    ) {
      const { updateOwnedPostMediaOrder } = await import("./editPublishedMedia");
      let publishedOrder: PublishedMediaOrderItem[] | undefined;
      try {
        publishedOrder = resolvePublishedMediaOrderForCreate(input);
      } catch {
        publishedOrder = undefined;
      }
      if (publishedOrder?.length) {
        const orderResult = await updateOwnedPostMediaOrder({
          postId: post.id,
          mediaOrder: publishedOrder,
        });
        if (!orderResult.ok) {
          console.warn(
            "[createFlowPublish] media_order update after edit failed",
            orderResult.error,
          );
        }
      }
    }

    const convertedType = input.confirmedOwnerTypeConversion;
    const originalType = input.originalPostType;
    if (
      convertedType &&
      originalType &&
      convertedType !== originalType
    ) {
      // Type change rebuckets Posts/Events feeds — admin-strength invalidation.
      // Discovery eligibility is live from posts.type; Pair Up / Open Plan stop
      // surfacing when incompatible without soft-closing opportunity rows (D3).
      await invalidateCachesAfterAdminPostEdit(
        post.id,
        typeof post.author_id === "string" && post.author_id
          ? post.author_id
          : session.user.id,
      );
      invalidatePairUpForPost(post.id);
      invalidateOpenPlanOwnForPost(post.id);
      invalidateGroupUpOwnForPost(post.id);
      invalidateGroupUpSourceList(post.id);
    }
  } else {
    // Defensive: remapped Create payload must never carry local sentinels/blobs.
    try {
      assertPublishImagePayloadHasNoLocalLeak(
        input.activities.map((a) =>
          Array.isArray(a.images) ? a.images.map(String) : [],
        ),
        input.mediaOrder ?? [],
      );
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message === "PUBLISH_LOCAL_IMAGE_LEAK" ||
          err.message === "UNRESOLVED_LOCAL_DRAFT_IMAGE")
      ) {
        throw new Error("Publish failed. Please try again.");
      }
      throw err;
    }

    assertLocalCreateDraftOwnedBy(session.user.id);

    if (input.atomicPublish) {
      const publishPostId = getDraftPublishPostIdForPublish();
      const payload = buildOwnerCreatePayload(
        input,
        mapActivitiesForOwnerCreate(activitiesToPersist)
      );
      const { post: rpcPost, created } = await ownerCreatePost(
        publishPostId,
        payload
      );
      post = rpcPost as ExecuteCreateFlowPublishResult["post"];
      publishCreated = created;
    } else {
      post = await insertPost({
        type: input.postType === "hangout" ? "hangout" : "experience",
        caption: input.caption,
        visibility: dbVisibility as "public" | "friends" | "private",
        ...ANONYMOUS_GUARD,
        rsvp_capacity: input.rsvpCapacity,
        selected_dates: input.selectedDatesIso.length
          ? input.selectedDatesIso
          : null,
        is_recurring: input.isRecurring ?? null,
        recurrence_days: input.recurrenceDays.length
          ? input.recurrenceDays
          : null,
        tags: tags.length ? tags : null,
        rating_enabled: ratingEnabled,
      });
      publishCreated = true;
    }
  }

  const runNewCreateOneTimeEffects =
    !input.isEditMode &&
    (input.atomicPublish ? publishCreated === true : true);

  // XP/personalization are best-effort; atomic replay (created=false) skips them.
  if (runNewCreateOneTimeEffects) {
    try {
      await incrementMyXp(4);
    } catch {
      /* ignore */
    }
  }

  if (runNewCreateOneTimeEffects && post) {
    try {
      recordSignal(
        {
          tags: post.tags || null,
          author_id: post.author_id,
          type: post.type as "experience" | "hangout",
          is_recurring: post.is_recurring ?? null,
        },
        "create"
      );
    } catch {
      /* ignore */
    }
  }

  // Push/XP are best-effort and only on actual RPC creation (created=true).
  // Legacy Preview still invokes push inside insertPost; idempotent replay skips push here.
  if (input.atomicPublish && publishCreated === true && post) {
    try {
      await invokePostPublishedPush({
        id: post.id,
        type: post.type as "experience" | "hangout",
        author_id: post.author_id,
      });
    } catch {
      /* ignore */
    }
  }

  // Legacy Preview new-create only; owner edit uses owner_republish_post (activities in RPC).
  const needsClientActivityInsert =
    activitiesToPersist.length > 0 &&
    !input.atomicPublish &&
    !input.isEditMode;

  if (needsClientActivityInsert) {
    const items = mapActivitiesForDbInsert(activitiesToPersist).map(
      (row, i) => ({
        post_id: post.id,
        order_idx: i,
        ...row,
      })
    );

    const { error: actErr } = await supabase.from("activities").insert(items);
    if (actErr) throw actErr;
  }

  try {
    localStorage.setItem(
      "publishedPostLast",
      JSON.stringify({
        id: post.id,
        type: post.type,
        caption: post.caption,
        tags,
        activities: sanitizedActivities,
      })
    );
  } catch {
    /* ignore */
  }

  const createdCacheKey = `profile_created_${session.user.id}`;
  if (input.isEditMode && input.editPostId) {
    dataCache.delete(createdCacheKey);
  } else {
    dataCache.delete(createdCacheKey);
    clearPersistedProfilePosts("created", session.user.id);
  }
  dataCache.clearFeedCache().catch(() => {});
  invalidatePostDetailCache(post.id);

  const isNewPublish = !input.isEditMode;
  const seed = input.publishedMediaSeed;
  // PV3.5: seed publishedMediaCache synchronously BEFORE prepend is exposed to UI.
  if (isNewPublish && seed && (seed.mediaOrder != null || seed.postMedia != null)) {
    seedPublishedMediaFromList({
      postId: post.id,
      viewerUserId: session.user.id,
      mediaOrder: seed.mediaOrder,
      postMedia: seed.postMedia,
      imageUrls: seed.imageUrls,
      source: "publish",
    });
  } else {
    invalidatePublishedMedia(post.id);
  }

  if (isNewPublish && session?.user?.id) {
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(LEGACY_OWN_CREATED_PUBLISHED_PENDING_KEY);
      }
    } catch {
      /* noop */
    }

    type DbPostExtras = {
      created_at?: string;
      visibility?: "public" | "friends" | "private";
      recurrence_days?: string[] | null;
      selected_dates?: string[] | null;
      is_recurring?: boolean | null;
      rsvp_capacity?: number | null;
      rating_enabled?: boolean | null;
    };
    const row = post as ExecuteCreateFlowPublishResult["post"] & DbPostExtras;

    const markerAt = new Date().toISOString();
    const prependActivities = activitiesToPersist.map((a, i) => {
      const imgs = cleanImagesForActivity(a.images);
      return {
        order_idx: i,
        title:
          a.title || a.customActivity || a.activityType || `Stop ${i + 1}`,
        images: imgs.length ? imgs : null,
        location_name: a.location ?? null,
        location_desc: a.locationDesc ?? null,
        location_url: a.locationUrl ?? null,
        location_notes: a.locationNotes ?? null,
        additional_info: a.additionalInfo ?? null,
        tags: a.tags ?? null,
      };
    });

    persistOwnCreatedPrependPending({
      v: 1,
      postId: post.id,
      authorId: session.user.id,
      type:
        input.postType === "hangout" || post.type === "hangout"
          ? "hangout"
          : "experience",
      caption: typeof post.caption === "string" ? post.caption : null,
      tags: tags.length ? tags : null,
      created_at:
        typeof row.created_at === "string" && row.created_at.length
          ? row.created_at
          : markerAt,
      selected_dates:
        Array.isArray(row.selected_dates) && row.selected_dates.length
          ? row.selected_dates
          : input.selectedDatesIso.length
            ? input.selectedDatesIso
            : null,
      is_recurring:
        typeof row.is_recurring === "boolean" || row.is_recurring === null
          ? row.is_recurring
          : input.isRecurring ?? null,
      recurrence_days:
        Array.isArray(row.recurrence_days) && row.recurrence_days.length
          ? row.recurrence_days
          : input.recurrenceDays.length
            ? input.recurrenceDays
            : null,
      rsvp_capacity:
        typeof row.rsvp_capacity === "number" || row.rsvp_capacity === null
          ? row.rsvp_capacity
          : input.rsvpCapacity,
      rating_enabled:
        typeof row.rating_enabled === "boolean"
          ? row.rating_enabled
          : ratingEnabled,
      visibility: row.visibility ?? null,
      activities: prependActivities,
      markerAt,
      media_order: seed?.mediaOrder ?? undefined,
      post_media: seed?.postMedia ?? undefined,
    });
  }

  return {
    post,
    ...(publishCreated !== undefined ? { created: publishCreated } : {}),
  };
}
