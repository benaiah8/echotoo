/**
 * Higher-level multi-device push sender for Supabase Edge functions.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendFcmToDevice } from "./fcm.ts";
import {
  emptyPlatformCounts,
  loadPushDeviceTargets,
} from "./recipientDevices.ts";
import type {
  FcmDataPayload,
  FcmSendOptions,
  PushDeviceTarget,
  PushSendFailure,
  SendPushBatchResult,
  SendPushToUsersResult,
} from "./types.ts";

const DEFAULT_MAX_FAILURES = 5;

export function safeTokenPreview(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return "empty(len=0)";
  return `${trimmed.slice(0, 8)}...(len=${trimmed.length})`;
}

export function sanitizeErrorPreview(
  value: string | undefined,
  max = 240
): string | undefined {
  if (!value) return undefined;
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (!singleLine) return undefined;
  return singleLine.length > max ? `${singleLine.slice(0, max)}...` : singleLine;
}

/** One-line summary for a single FCM device failure (no full tokens). */
export function formatPushFailureLine(failure: PushSendFailure): string {
  const parts: string[] = [];
  if (failure.platform) parts.push(failure.platform);
  if (failure.errorStatus) parts.push(failure.errorStatus);
  if (failure.errorCode) parts.push(failure.errorCode);
  const message =
    sanitizeErrorPreview(failure.errorMessage) ??
    sanitizeErrorPreview(failure.detail);
  if (message) parts.push(message);
  if (parts.length === 0 && failure.status) {
    parts.push(`status=${failure.status}`);
  }
  return parts.join(" | ") || "unknown push failure";
}

/** Join multiple push failures into a compact audit/log string. */
export function formatPushFailuresSummary(
  failures: PushSendFailure[],
  max = 3
): string | undefined {
  if (failures.length === 0) return undefined;
  return failures.slice(0, max).map(formatPushFailureLine).join("; ");
}

export type SendPushToDeviceTargetsOptions = {
  accessToken: string;
  projectId: string;
  targets: PushDeviceTarget[];
  data: FcmDataPayload;
  logPrefix?: string;
  maxFailuresInResult?: number;
  fcmSendOptions?: FcmSendOptions;
};

/**
 * Send one FCM message per deduped device target (invite-style delivery).
 */
export async function sendPushToDeviceTargets(
  options: SendPushToDeviceTargetsOptions
): Promise<SendPushBatchResult> {
  const logPrefix = options.logPrefix ?? "[push]";
  const maxFailures = options.maxFailuresInResult ?? DEFAULT_MAX_FAILURES;

  let sent = 0;
  const sentByPlatform = emptyPlatformCounts();
  const failures: SendPushBatchResult["failures"] = [];

  for (const targetDevice of options.targets) {
    console.log(`${logPrefix} FCM send begin`, {
      platform: targetDevice.platform,
      tokenPreview: safeTokenPreview(targetDevice.token),
    });
    const result = await sendFcmToDevice(
      options.accessToken,
      options.projectId,
      targetDevice.token,
      targetDevice.platform,
      options.data,
      options.fcmSendOptions
    );
    if (result.ok) {
      sent++;
      sentByPlatform[targetDevice.platform]++;
      console.log(`${logPrefix} FCM send success`, {
        platform: targetDevice.platform,
        status: result.status,
      });
    } else {
      const detail = sanitizeErrorPreview(result.errorText);
      const errorMessage = sanitizeErrorPreview(result.errorMessage);
      console.error(`${logPrefix} FCM send failed`, {
        platform: targetDevice.platform,
        status: result.status,
        errorStatus: result.errorStatus,
        errorCode: result.errorCode,
        errorMessage,
        detail,
      });
      failures.push({
        platform: targetDevice.platform,
        status: result.status,
        detail,
        errorStatus: result.errorStatus,
        errorCode: result.errorCode,
        errorMessage,
      });
    }
  }

  return {
    sent,
    sentByPlatform,
    failures: failures.length > 0 ? failures.slice(0, maxFailures) : [],
  };
}

export type SendPushToUsersOptions = {
  supabaseAdmin: SupabaseClient;
  recipientAuthUserIds: string[];
  accessToken: string;
  projectId: string;
  data: FcmDataPayload;
  logPrefix?: string;
  maxFailuresInResult?: number;
  platforms?: ("android" | "ios")[];
  fcmSendOptions?: FcmSendOptions;
};

/**
 * Load recipient device targets and send to all (query + send loop).
 * For flows that must skip FCM OAuth when no tokens exist, use
 * `loadPushDeviceTargets` then `sendPushToDeviceTargets` separately.
 */
export async function sendPushToUsers(
  options: SendPushToUsersOptions
): Promise<SendPushToUsersResult> {
  const logPrefix = options.logPrefix ?? "[push]";

  const deviceLoad = await loadPushDeviceTargets(
    options.supabaseAdmin,
    options.recipientAuthUserIds,
    {
      platforms: options.platforms,
      logPrefix,
    }
  );

  if (!deviceLoad.ok) {
    return deviceLoad;
  }

  if (deviceLoad.targets.length === 0) {
    return {
      ok: true,
      sent: 0,
      skipped: "no_push_tokens",
      message: "No push device tokens for recipients",
    };
  }

  const batch = await sendPushToDeviceTargets({
    accessToken: options.accessToken,
    projectId: options.projectId,
    targets: deviceLoad.targets,
    data: options.data,
    logPrefix,
    maxFailuresInResult: options.maxFailuresInResult,
    fcmSendOptions: options.fcmSendOptions,
  });

  return {
    ok: true,
    attempted: deviceLoad.targets.length,
    attemptedByPlatform: deviceLoad.attemptedByPlatform,
    sent: batch.sent,
    sentByPlatform: batch.sentByPlatform,
    failures: batch.failures,
  };
}
