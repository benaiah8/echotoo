/**
 * @deprecated Import from `../_shared/push/fcm.ts` instead.
 * Re-export shim for backward compatibility during Phase 1B migration.
 */
export {
  getFcmAccessToken,
  sendFcmToDevice,
  type AndroidDeliveryMode,
  type FcmDataPayload,
  type FcmSendOptions,
  type FcmSendResult,
  type PushDevicePlatform,
} from "../_shared/push/fcm.ts";
