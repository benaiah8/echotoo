/**
 * Viewer-scoped cache for normalized PublishedMediaItem[] manifests (PV2A).
 * Bridging Feed/Profile list → Post Detail. Not a general cache framework.
 */

import {
  buildPublishedMediaItems,
  isPublishedMediaOrder,
  type PublishedMediaItem,
  type PublishedPostMediaRow,
} from "./types";
import {
  getPublishedPostMediaForDetail,
  getPublishedPostMediaForPosts,
} from "./getPublishedPostMediaForDetail";
import {
  imageUrlsFromMediaOrder,
  mapCompactPostMediaRows,
} from "./mapCompactPostMedia";
import {
  mergePublishedVideoItemFromRow,
  preservePublishedVideoMetadataAcrossItems,
} from "./mergePublishedVideoMetadata";
import {
  decidePublishedMediaCacheWrite,
  resolvePublishedMediaCacheAuthority,
  type PublishedMediaCacheProvenance,
  type PublishedMediaLegacyScope,
} from "./publishedMediaCacheAuthority";

export const PUBLISHED_MEDIA_CACHE_TTL_MS = 120_000;

/**
 * Bumped when detail/batch seed starts resolving legacy activity /
 * first_image_url images. Pre-rev empty detail seeds are treated as misses
 * once so incorrect [] does not permanently suppress corrected fetches.
 */
export const PUBLISHED_MEDIA_DETAIL_IMAGE_LOADER_REV = 2;

export type PublishedMediaCacheSource =
  | "feed"
  | "profile"
  | "detail"
  | "publish"
  | "patch"
  | "warm"
  | "persist";

export type PublishedMediaCacheEntry = {
  postId: string;
  viewerKey: string;
  items: PublishedMediaItem[];
  mediaOrder: unknown;
  fetchedAt: number;
  source: PublishedMediaCacheSource;
  provenance: PublishedMediaCacheProvenance;
  /** Only meaningful when provenance === "legacy-gallery". */
  legacyScope?: PublishedMediaLegacyScope;
  /** Set on detail/batch seeds that ran the activity+first_image image pass. */
  detailImageLoaderRev?: number;
};

export type {
  PublishedMediaCacheProvenance,
  PublishedMediaLegacyScope,
} from "./publishedMediaCacheAuthority";

export {
  decidePublishedMediaCacheWrite,
  isLegacyGalleryCompletenessUpgrade,
  isPoorerLegacyImageMembership,
  resolvePublishedMediaCacheAuthority,
} from "./publishedMediaCacheAuthority";

/** Network / authoritative sources that warm/persist must not clobber. */
const AUTHORITATIVE_CACHE_SOURCES: ReadonlySet<PublishedMediaCacheSource> =
  new Set(["feed", "profile", "detail", "publish", "patch"]);

function isWarmOrPersistSource(
  source: PublishedMediaCacheSource,
): source is "warm" | "persist" {
  return source === "warm" || source === "persist";
}

/**
 * Warm/persist may write only when cache is missing, or when the snapshot is
 * not older than the current entry (by fetchedAt / snapshotTs).
 * Fresh feed/profile/publish always replace.
 * Unversioned warm/persist never overwrites authoritative sources.
 */
export function shouldApplyPublishedMediaListSeed(options: {
  existing: PublishedMediaCacheEntry | null;
  source: PublishedMediaCacheSource;
  snapshotTs?: number;
}): boolean {
  const { existing, source, snapshotTs } = options;
  if (!existing) return true;
  if (source === "feed" || source === "profile" || source === "publish") {
    return true;
  }
  if (!isWarmOrPersistSource(source)) return true;

  // Monotonic: warm/persist never clobber feed/profile/detail/publish/patch.
  if (AUTHORITATIVE_CACHE_SOURCES.has(existing.source)) {
    return false;
  }

  const snap =
    typeof snapshotTs === "number" && Number.isFinite(snapshotTs)
      ? snapshotTs
      : null;
  // Missing snapshotTs: only apply when existing is also warm/persist without
  // treating unversioned warm as newer than a stamped warm entry.
  if (snap == null) {
    return existing.source === "warm" || existing.source === "persist";
  }
  if (existing.fetchedAt > snap) {
    return false;
  }
  return true;
}

function cacheKey(viewerKey: string, postId: string): string {
  return `published-media:${viewerKey}:${postId}`;
}

export function publishedMediaViewerKey(
  viewerUserId: string | null | undefined,
): string {
  const id = typeof viewerUserId === "string" ? viewerUserId.trim() : "";
  return id || "anon";
}

const store = new Map<string, PublishedMediaCacheEntry>();
const inFlight = new Map<string, Promise<PublishedMediaCacheEntry>>();

function authorityFromEntry(
  entry: PublishedMediaCacheEntry,
): {
  items: PublishedMediaItem[];
  mediaOrder: unknown;
  provenance: PublishedMediaCacheProvenance;
  legacyScope?: PublishedMediaLegacyScope;
} {
  return {
    items: entry.items,
    mediaOrder: entry.mediaOrder,
    provenance: entry.provenance,
    legacyScope: entry.legacyScope,
  };
}

export function getPublishedMediaCache(
  postId: string,
  viewerKey: string,
): PublishedMediaCacheEntry | null {
  const id = postId?.trim();
  if (!id) return null;
  const entry = store.get(cacheKey(viewerKey, id));
  return entry ?? null;
}

export function isPublishedMediaCacheFresh(
  entry: PublishedMediaCacheEntry,
  now = Date.now(),
): boolean {
  return now - entry.fetchedAt < PUBLISHED_MEDIA_CACHE_TTL_MS;
}

export function setPublishedMediaCache(options: {
  postId: string;
  viewerKey: string;
  items: PublishedMediaItem[];
  mediaOrder?: unknown;
  source: PublishedMediaCacheSource;
  /** Override fetchedAt (warm/persist snapshots). Defaults to Date.now(). */
  fetchedAt?: number;
  provenance?: PublishedMediaCacheProvenance;
  legacyScope?: PublishedMediaLegacyScope;
  detailImageLoaderRev?: number;
  /** When true, skip poorer-legacy protection (tests only). */
  forceWrite?: boolean;
}): PublishedMediaCacheEntry {
  const postId = options.postId.trim();
  const key = cacheKey(options.viewerKey, postId);
  const prev = store.get(key);
  const mediaOrder = options.mediaOrder ?? null;
  const auth =
    options.provenance != null
      ? {
          provenance: options.provenance,
          legacyScope: options.legacyScope,
        }
      : resolvePublishedMediaCacheAuthority({
          mediaOrder,
          legacyScope: options.legacyScope,
        });

  if (!options.forceWrite && prev) {
    const decision = decidePublishedMediaCacheWrite({
      existing: authorityFromEntry(prev),
      incoming: {
        items: options.items,
        mediaOrder,
        provenance: auth.provenance,
        legacyScope: auth.legacyScope,
      },
    });
    if (decision === "keep-existing") {
      return prev;
    }
  }

  const fetchedAt =
    typeof options.fetchedAt === "number" && Number.isFinite(options.fetchedAt)
      ? options.fetchedAt
      : Date.now();
  const entry: PublishedMediaCacheEntry = {
    postId,
    viewerKey: options.viewerKey,
    items: options.items,
    mediaOrder,
    fetchedAt,
    source: options.source,
    provenance: auth.provenance,
    ...(auth.provenance === "legacy-gallery"
      ? { legacyScope: auth.legacyScope ?? "partial" }
      : {}),
    ...(typeof options.detailImageLoaderRev === "number"
      ? { detailImageLoaderRev: options.detailImageLoaderRev }
      : {}),
  };
  store.set(key, entry);
  return entry;
}

/**
 * Feed/Profile → Detail handoff: ensure the currently rendered published
 * items are present in the viewer-scoped cache before navigation (sync).
 * No network. Refreshes TTL so Detail mounts on a cache hit.
 */
export function ensurePublishedMediaCacheForDetailHandoff(options: {
  postId: string;
  viewerUserId: string | null | undefined;
  items: readonly PublishedMediaItem[];
  source?: "feed" | "profile";
  provenance?: PublishedMediaCacheProvenance;
  legacyScope?: PublishedMediaLegacyScope;
}): PublishedMediaCacheEntry | null {
  const postId = options.postId?.trim();
  if (!postId || !options.items.length) return null;
  const viewerKey = publishedMediaViewerKey(options.viewerUserId);
  const existing = getPublishedMediaCache(postId, viewerKey);
  const items = preservePublishedVideoMetadataAcrossItems(
    existing?.items,
    [...options.items],
  );
  const existingOrderValid = isPublishedMediaOrder(existing?.mediaOrder);
  const provenance =
    options.provenance ??
    (existingOrderValid ? "media-order" : "legacy-gallery");
  // Legacy handoff must not attach a prior media_order while replacing items.
  const mediaOrder =
    provenance === "media-order"
      ? (existing?.mediaOrder ?? null)
      : existingOrderValid
        ? existing?.mediaOrder ?? null
        : null;
  const entry = setPublishedMediaCache({
    postId,
    viewerKey,
    items,
    mediaOrder,
    source: options.source ?? "feed",
    provenance,
    legacyScope:
      provenance === "legacy-gallery"
        ? (options.legacyScope ?? "full")
        : undefined,
  });
  return entry;
}

/**
 * Sync handoff for legacy Feed MediaCarousel galleries (no media_order).
 * Builds PublishedMediaItem[] from local image URLs — no network, no fake order.
 */
export function ensureLegacyGalleryHandoffFromUrls(options: {
  postId: string;
  viewerUserId: string | null | undefined;
  imageUrls: readonly string[];
  source?: "feed" | "profile";
}): PublishedMediaCacheEntry | null {
  const urls = options.imageUrls.filter(
    (u) => typeof u === "string" && u.trim().length > 0,
  );
  if (!urls.length) return null;
  const postId = options.postId?.trim();
  if (!postId) return null;
  const viewerKey = publishedMediaViewerKey(options.viewerUserId);
  const existing = getPublishedMediaCache(postId, viewerKey);
  // Never clobber an authoritative media_order manifest with a URL-only gallery.
  if (existing && isPublishedMediaOrder(existing.mediaOrder)) {
    return existing;
  }
  const built = buildPublishedMediaItems({
    imageUrls: [...urls],
    mediaOrder: null,
    postMedia: [],
  });
  if (!built.length) return null;
  return ensurePublishedMediaCacheForDetailHandoff({
    postId,
    viewerUserId: options.viewerUserId,
    items: built,
    source: options.source ?? "feed",
    provenance: "legacy-gallery",
    legacyScope: "full",
  });
}

/**
 * Sync completeness upgrade from a Detail-hydrated activity gallery.
 * No network. Only upgrades legacy/partial entries (never clobbers media_order).
 */
export function upgradePublishedMediaLegacyGalleryFromUrls(options: {
  postId: string;
  viewerUserId: string | null | undefined;
  imageUrls: readonly string[];
  source?: PublishedMediaCacheSource;
}): PublishedMediaCacheEntry | null {
  const postId = options.postId?.trim();
  if (!postId) return null;
  const urls = options.imageUrls.filter(
    (u) => typeof u === "string" && u.trim().length > 0,
  );
  if (!urls.length) return null;
  const viewerKey = publishedMediaViewerKey(options.viewerUserId);
  const existing = getPublishedMediaCache(postId, viewerKey);
  if (existing && isPublishedMediaOrder(existing.mediaOrder)) {
    return existing;
  }
  const built = buildPublishedMediaItems({
    imageUrls: [...urls],
    mediaOrder: null,
    postMedia: [],
  });
  if (!built.length) return null;
  const items = preservePublishedVideoMetadataAcrossItems(
    existing?.items,
    built,
  );
  return setPublishedMediaCache({
    postId,
    viewerKey,
    items,
    mediaOrder: existing?.mediaOrder ?? null,
    source: options.source ?? "detail",
    provenance: "legacy-gallery",
    legacyScope: "full",
  });
}

/** Patch a single video row in place by post_media.id — membership/order unchanged. */
export function patchPublishedMediaRow(options: {
  postId: string;
  viewerKey: string;
  row: PublishedPostMediaRow;
}): PublishedMediaCacheEntry | null {
  const existing = getPublishedMediaCache(options.postId, options.viewerKey);
  if (!existing) return null;
  const mediaId = options.row.id;
  let changed = false;
  const items = existing.items.map((item) => {
    if (item.kind !== "video" || item.mediaId !== mediaId) return item;
    changed = true;
    return mergePublishedVideoItemFromRow(item, options.row);
  });
  if (!changed) return existing;
  return setPublishedMediaCache({
    postId: options.postId,
    viewerKey: options.viewerKey,
    items,
    mediaOrder: existing.mediaOrder,
    source: "patch",
    provenance: existing.provenance,
    legacyScope: existing.legacyScope,
    forceWrite: true,
  });
}

export function invalidatePublishedMedia(
  postId: string,
  viewerKey?: string,
): void {
  const id = postId?.trim();
  if (!id) return;
  if (viewerKey != null) {
    store.delete(cacheKey(viewerKey, id));
    inFlight.delete(cacheKey(viewerKey, id));
    return;
  }
  const suffix = `:${id}`;
  for (const key of Array.from(store.keys())) {
    if (key.endsWith(suffix)) store.delete(key);
  }
  for (const key of Array.from(inFlight.keys())) {
    if (key.endsWith(suffix)) inFlight.delete(key);
  }
}

export function clearPublishedMediaCache(): void {
  store.clear();
  inFlight.clear();
}

export type SeedPublishedMediaFromListInput = {
  postId: string;
  viewerUserId: string | null | undefined;
  mediaOrder: unknown;
  postMedia: unknown;
  imageUrls?: string[];
  source: "feed" | "profile" | "warm" | "persist" | "publish";
  /** For warm/persist: do not overwrite a newer existing entry. */
  snapshotTs?: number;
};

/** Normalize list RPC compact manifest and seed viewer-scoped cache. */
export function seedPublishedMediaFromList(
  input: SeedPublishedMediaFromListInput,
): PublishedMediaItem[] | null {
  const postId = input.postId?.trim();
  if (!postId) return null;
  const postMedia = mapCompactPostMediaRows(input.postMedia);
  const hasOrder =
    Array.isArray(input.mediaOrder) && input.mediaOrder.length > 0;
  if (!hasOrder && postMedia.length === 0 && !(input.imageUrls?.length)) {
    // Still seed empty when RPC sent explicit empty arrays? Skip noise.
    if (input.mediaOrder === undefined && input.postMedia === undefined) {
      return null;
    }
  }
  const viewerKey = publishedMediaViewerKey(input.viewerUserId);
  const existing = getPublishedMediaCache(postId, viewerKey);
  if (
    !shouldApplyPublishedMediaListSeed({
      existing,
      source: input.source,
      snapshotTs: input.snapshotTs,
    })
  ) {
    return existing?.items ?? null;
  }
  const built = buildPublishedMediaItems({
    imageUrls: input.imageUrls ?? [],
    mediaOrder: input.mediaOrder ?? null,
    postMedia,
  });
  const items = preservePublishedVideoMetadataAcrossItems(
    existing?.items,
    built,
  );
  const fetchedAt =
    isWarmOrPersistSource(input.source) &&
    typeof input.snapshotTs === "number" &&
    Number.isFinite(input.snapshotTs)
      ? input.snapshotTs
      : undefined;
  const auth = resolvePublishedMediaCacheAuthority({
    mediaOrder: input.mediaOrder ?? null,
    // List RPC seeds with order or compact media are treated as full when order valid;
    // otherwise full when imageUrls came from order extract / list payload.
    legacyScope: "full",
  });
  const entry = setPublishedMediaCache({
    postId,
    viewerKey,
    items,
    mediaOrder: input.mediaOrder ?? null,
    source: input.source,
    fetchedAt,
    provenance: auth.provenance,
    legacyScope: auth.legacyScope,
  });
  return entry.items;
}

export type GetOrFetchPublishedMediaOptions = {
  postId: string;
  viewerUserId: string | null | undefined;
  imageUrls?: string[];
  /** When false, never hit network if missing (returns null). Default true. */
  fetchIfMissing?: boolean;
  /** Force network even when fresh. */
  forceRevalidate?: boolean;
};

/**
 * Cache-first read. Fresh → return. Stale → return + optional background refresh
 * is caller-driven; this function can force fetch when missing/forced.
 */
export async function getOrFetchPublishedMedia(
  options: GetOrFetchPublishedMediaOptions,
): Promise<PublishedMediaCacheEntry | null> {
  const postId = options.postId?.trim();
  if (!postId) return null;
  const viewerKey = publishedMediaViewerKey(options.viewerUserId);
  const key = cacheKey(viewerKey, postId);
  const existing = store.get(key);

  if (
    existing &&
    isPublishedMediaCacheFresh(existing) &&
    !options.forceRevalidate
  ) {
    return existing;
  }

  if (existing && !options.forceRevalidate && options.fetchIfMissing === false) {
    return existing;
  }

  if (options.fetchIfMissing === false && !existing) {
    return null;
  }

  let promise = inFlight.get(key);
  if (!promise) {
    const startedImageUrls = options.imageUrls ?? [];
    promise = (async () => {
      const detail = await getPublishedPostMediaForDetail(postId);
      const imageUrls =
        startedImageUrls.length > 0
          ? startedImageUrls
          : detail.imageUrls ?? [];
      const orderValid = isPublishedMediaOrder(detail.mediaOrder);
      const built = buildPublishedMediaItems({
        imageUrls,
        mediaOrder: detail.mediaOrder,
        postMedia: detail.postMedia,
      });
      const prior = store.get(key);
      const items = preservePublishedVideoMetadataAcrossItems(
        prior?.items,
        built,
      );
      const auth = resolvePublishedMediaCacheAuthority({
        mediaOrder: detail.mediaOrder,
        // Thin imageUrls from initialPost are partial; order-valid is authoritative.
        legacyScope: orderValid ? undefined : "partial",
      });
      const entry = setPublishedMediaCache({
        postId,
        viewerKey,
        items,
        mediaOrder: detail.mediaOrder,
        source: "detail",
        provenance: auth.provenance,
        legacyScope: auth.legacyScope,
        detailImageLoaderRev: PUBLISHED_MEDIA_DETAIL_IMAGE_LOADER_REV,
      });
      return entry;
    })().finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, promise);
  }
  return promise;
}

export type GetOrFetchPublishedMediaManyOptions = {
  postIds: readonly (string | null | undefined)[];
  viewerUserId: string | null | undefined;
  /** Force network for every id (ignores freshness). */
  forceRevalidate?: boolean;
};

export type GetOrFetchPublishedMediaManyResult = {
  /** Present for every valid requested postId (including authoritative []). */
  byPostId: Map<string, PublishedMediaItem[]>;
  /** Post ids that required a network batch (or awaited an in-flight fetch). */
  fetchedPostIds: string[];
};

/** Dedupe + drop null/blank ids; preserve first-seen order. */
export function dedupePublishedMediaPostIds(
  postIds: readonly (string | null | undefined)[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of postIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function seedDetailManifestIntoCache(options: {
  postId: string;
  viewerKey: string;
  mediaOrder: unknown;
  postMedia: PublishedPostMediaRow[];
  imageUrls?: string[];
}): PublishedMediaCacheEntry {
  const imageUrls =
    options.imageUrls && options.imageUrls.length > 0
      ? options.imageUrls
      : imageUrlsFromMediaOrder(options.mediaOrder);
  const orderValid = isPublishedMediaOrder(options.mediaOrder);
  const built = buildPublishedMediaItems({
    imageUrls,
    mediaOrder: options.mediaOrder,
    postMedia: options.postMedia,
  });
  const prior = store.get(cacheKey(options.viewerKey, options.postId));
  const items = preservePublishedVideoMetadataAcrossItems(prior?.items, built);
  const auth = resolvePublishedMediaCacheAuthority({
    mediaOrder: options.mediaOrder,
    legacyScope: orderValid ? undefined : "partial",
  });
  return setPublishedMediaCache({
    postId: options.postId,
    viewerKey: options.viewerKey,
    items,
    mediaOrder: options.mediaOrder,
    source: "detail",
    provenance: auth.provenance,
    legacyScope: auth.legacyScope,
    detailImageLoaderRev: PUBLISHED_MEDIA_DETAIL_IMAGE_LOADER_REV,
  });
}

/** True when a fresh empty detail seed predates the activity/first_image pass. */
export function isStaleEmptyDetailImageSeed(
  entry: PublishedMediaCacheEntry,
): boolean {
  if (entry.items.length > 0) return false;
  if (entry.source !== "detail") return false;
  if (isPublishedMediaOrder(entry.mediaOrder)) return false;
  return (
    (entry.detailImageLoaderRev ?? 0) < PUBLISHED_MEDIA_DETAIL_IMAGE_LOADER_REV
  );
}

/**
 * Cache-first multi-post read for Groups (and similar).
 * Fresh hits (including authoritative empty []) skip network.
 * Misses/stale ids are loaded in ONE batched table read, then seeded into
 * the same viewer-scoped publishedMediaCache.
 */
export async function getOrFetchPublishedMediaMany(
  options: GetOrFetchPublishedMediaManyOptions,
): Promise<GetOrFetchPublishedMediaManyResult> {
  const ids = dedupePublishedMediaPostIds(options.postIds);
  const viewerKey = publishedMediaViewerKey(options.viewerUserId);
  const byPostId = new Map<string, PublishedMediaItem[]>();
  const fetchedPostIds: string[] = [];

  if (ids.length === 0) {
    return { byPostId, fetchedPostIds };
  }

  const force = options.forceRevalidate === true;
  const hits: string[] = [];
  const missIds: string[] = [];

  for (const postId of ids) {
    const existing = store.get(cacheKey(viewerKey, postId));
    if (
      existing &&
      isPublishedMediaCacheFresh(existing) &&
      !force &&
      !isStaleEmptyDetailImageSeed(existing)
    ) {
      // Known empty ([]) and non-empty alike — fresh entry is authoritative.
      byPostId.set(postId, existing.items);
      hits.push(postId);
      continue;
    }
    missIds.push(postId);
  }

  if (missIds.length === 0) {
    return { byPostId, fetchedPostIds };
  }

  // Reuse any single-post inFlight; batch only the remainder.
  const needBatch: string[] = [];
  const awaitExisting: Array<Promise<void>> = [];

  for (const postId of missIds) {
    const key = cacheKey(viewerKey, postId);
    const pending = inFlight.get(key);
    if (pending) {
      fetchedPostIds.push(postId);
      awaitExisting.push(
        pending.then((entry) => {
          byPostId.set(postId, entry.items);
        }),
      );
      continue;
    }
    needBatch.push(postId);
  }

  if (needBatch.length > 0) {
    for (const id of needBatch) fetchedPostIds.push(id);

    let settleBatch!: (entries: Map<string, PublishedMediaCacheEntry>) => void;
    let failBatch!: (err: unknown) => void;
    const batchEntriesPromise = new Promise<
      Map<string, PublishedMediaCacheEntry>
    >((resolve, reject) => {
      settleBatch = resolve;
      failBatch = reject;
    });

    for (const postId of needBatch) {
      const key = cacheKey(viewerKey, postId);
      const idPromise = batchEntriesPromise
        .then((entries) => {
          const entry = entries.get(postId);
          if (entry) return entry;
          // Should not happen — seed empty fallback.
          return seedDetailManifestIntoCache({
            postId,
            viewerKey,
            mediaOrder: null,
            postMedia: [],
            imageUrls: [],
          });
        })
        .finally(() => {
          if (inFlight.get(key) === idPromise) inFlight.delete(key);
        });
      inFlight.set(key, idPromise);
      awaitExisting.push(
        idPromise.then((entry) => {
          byPostId.set(postId, entry.items);
        }),
      );
    }

    try {
      const details = await getPublishedPostMediaForPosts(needBatch);
      const entries = new Map<string, PublishedMediaCacheEntry>();
      for (const postId of needBatch) {
        const detail = details.get(postId) ?? {
          mediaOrder: null,
          postMedia: [] as PublishedPostMediaRow[],
          imageUrls: [] as string[],
        };
        entries.set(
          postId,
          seedDetailManifestIntoCache({
            postId,
            viewerKey,
            mediaOrder: detail.mediaOrder,
            postMedia: detail.postMedia,
            imageUrls: detail.imageUrls,
          }),
        );
      }
      settleBatch(entries);
    } catch (err) {
      failBatch(err);
      throw err;
    }
  }

  await Promise.all(awaitExisting);

  // Ensure every requested id is present (defensive).
  for (const postId of ids) {
    if (byPostId.has(postId)) continue;
    const cached = store.get(cacheKey(viewerKey, postId));
    byPostId.set(postId, cached?.items ?? []);
  }

  return { byPostId, fetchedPostIds };
}

/** Test helper — wipe store between tests. */
export function __resetPublishedMediaCacheForTests(): void {
  clearPublishedMediaCache();
}
