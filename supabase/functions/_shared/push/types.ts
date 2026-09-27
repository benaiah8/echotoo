/**
 * Shared push/FCM types for Supabase Edge functions.
 */

export type PushDevicePlatform = "android" | "ios";

/** Android FCM delivery strategy (invite vs followed-post). */
export type AndroidDeliveryMode = "data_only" | "notification_and_data";

export type FcmSendOptions = {
  /** Default `data_only` (invite). Post push uses `notification_and_data`. */
  androidDelivery?: AndroidDeliveryMode;
  defaultNotification?: {
    title: string;
    body: string;
  };
};

/**
 * FCM `data` map fields — all values serialized to strings in {@link sendFcmToDevice}.
 * Post routing fields optional for DM/campaign-only payloads.
 */
export type FcmDataPayload = {
  type?: string;
  title?: string;
  body?: string;
  avatarUrl?: string;
  /** Post detail routing */
  postId?: string;
  postType?: string;
  inviteId?: string;
  threadId?: string;
  threadKind?: string;
  actorId?: string;
  target?: string;
  /** DM / group messaging */
  conversationId?: string;
  messageId?: string;
  senderUserId?: string;
  senderName?: string;
  groupName?: string;
  /** Saved event reminder */
  occurrenceDate?: string;
  /** Admin campaign deep link (app path, optional) */
  targetPath?: string;
  /** Open Plan request (creator notify; no requester identity) */
  requestId?: string;
  opportunityId?: string;
  sourcePostId?: string;
};

export type FcmSendResult = {
  ok: boolean;
  status: number;
  errorText?: string;
  errorStatus?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type PushDeviceTarget = {
  token: string;
  platform: PushDevicePlatform;
};

export type PlatformCounts = Record<PushDevicePlatform, number>;

export type DeviceRowPlatformCounts = PlatformCounts & {
  other: number;
};

export type PushSendFailure = {
  platform: PushDevicePlatform;
  status: number;
  detail?: string;
  errorStatus?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type SendPushBatchResult = {
  sent: number;
  sentByPlatform: PlatformCounts;
  failures: PushSendFailure[];
};

export type LoadPushDeviceTargetsResult =
  | {
      ok: true;
      targets: PushDeviceTarget[];
      rawDeviceRowCount: number;
      rawDevicePlatformCounts: DeviceRowPlatformCounts;
      attemptedByPlatform: PlatformCounts;
    }
  | {
      ok: false;
      skipped: "push_devices_read_failed";
      message: string;
    };

export type SendPushToUsersResult =
  | ({
      ok: true;
      attempted: number;
      attemptedByPlatform: PlatformCounts;
    } & SendPushBatchResult)
  | LoadPushDeviceTargetsResult
  | {
      ok: true;
      sent: 0;
      skipped: "no_push_tokens";
      message: string;
    };
