export type DraftVideoStorageKind = "native-fs" | "idb-blob";

/** Local processing only — never overload remote Bunny statuses. */
export type VideoPreparationStatus =
  | "local_ready"
  | "preparing"
  | "prepared"
  | "prepare_failed";

/**
 * Stored strategy on DraftVideo.
 * Policy API uses "prepare"; persisted value is "transcode".
 */
export type VideoPreparationStrategyStored = "passthrough" | "transcode";

export type DraftVideo = {
  localId: string;
  fileName: string;
  mimeType: string;
  size: number;
  lastModified?: number;
  localStorageKind: DraftVideoStorageKind;
  /** Source artifact reference — authoritative for Create preview. */
  localReference: string;
  width?: number;
  height?: number;
  duration?: number;
  remoteMediaId?: string | null;
  remoteVideoId?: string | null;
  /**
   * Durable Bunny TUS Location for Android native resume (PASS P2).
   * Cleared on successful publish cleanup. Never stores API secrets.
   */
  nativeTusUploadUrl?: string | null;

  /**
   * PV3.4 publish-retry: Supabase Storage object key for the tiny video poster.
   * Never persist localPosterUrl / blob URLs / JPEG blobs here.
   */
  remotePosterStoragePath?: string | null;
  /** Public media URL derived from remotePosterStoragePath after successful upload. */
  remotePosterUrl?: string | null;

  /** Local preparation only — not Bunny upload/processing. */
  preparationStatus?: VideoPreparationStatus;
  preparationStrategy?: VideoPreparationStrategyStored | null;
  /** null = indeterminate "Preparing video…"; 0..1 = real encoder progress. */
  prepareProgress?: number | null;
  /** Prepared output path/key — never replaces source localReference. */
  preparedReference?: string | null;
  preparedStorageKind?: DraftVideoStorageKind | null;
  preparedMimeType?: string | null;
  preparedSizeBytes?: number | null;
  preparedWidth?: number | null;
  preparedHeight?: number | null;
  preparedDuration?: number | null;
  prepareErrorCode?: string | null;
};

export const LOCAL_DRAFT_VIDEO_MEDIA_ID = "draft-local";
export const LOCAL_DRAFT_VIDEO_VIDEO_ID = "draft-local";

export const DRAFT_VIDEO_MISSING_MESSAGE =
  "Video file unavailable. Your draft is safe — remove the video and select it again.";
