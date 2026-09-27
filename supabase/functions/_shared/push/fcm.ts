/**
 * Shared FCM HTTP v1 helpers for Supabase Edge push functions.
 * Canonical base: former send-invite-push/fcm.ts (Android + iOS, rich errors).
 *
 * Android: data-only, HIGH priority (invite-style custom rendering).
 * iOS: notification + APNS alert + data.
 *
 * Note: `import { SignJWT }` — not `import * as jose` + `jose.SignJWT` — some Deno/edge
 * bundles break class construction on namespace imports (SignJWT must be used with `new`).
 */
import { SignJWT, importPKCS8 } from "npm:jose@5.9.6";
import type {
  AndroidDeliveryMode,
  FcmDataPayload,
  FcmSendOptions,
  FcmSendResult,
  PushDevicePlatform,
} from "./types.ts";

export type {
  AndroidDeliveryMode,
  FcmDataPayload,
  FcmSendOptions,
  FcmSendResult,
  PushDevicePlatform,
} from "./types.ts";

type ServiceAccount = {
  type: string;
  project_id: string;
  client_email: string;
  private_key: string;
};

function parseServiceAccountJson(raw: string): ServiceAccount {
  const sa = JSON.parse(raw) as ServiceAccount;
  if (!sa.client_email || !sa.private_key || !sa.project_id) {
    throw new Error("Invalid service account JSON");
  }
  return sa;
}

/** Exchange a service account JWT for a Google OAuth2 access token (FCM scope). */
export async function getFcmAccessToken(
  serviceAccountJson: string
): Promise<{ accessToken: string; projectId: string }> {
  const sa = parseServiceAccountJson(serviceAccountJson);
  const pk = sa.private_key.replace(/\\n/g, "\n");
  const key = await importPKCS8(pk, "RS256");

  const jwt = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
  };
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(
      tokenJson.error ?? `OAuth token failed: ${tokenRes.status}`
    );
  }

  return { accessToken: tokenJson.access_token, projectId: sa.project_id };
}

function truncateForLog(value: string, max = 240): string {
  const singleLine = value
    .replace(/[A-Za-z0-9_:\-.]{32,}/g, "[redacted-long-value]")
    .replace(/\s+/g, " ")
    .trim();
  return singleLine.length > max ? `${singleLine.slice(0, max)}...` : singleLine;
}

function extractFcmErrorSummary(
  text: string
): Omit<FcmSendResult, "ok" | "status"> {
  const fallback = { errorText: truncateForLog(text) };
  try {
    const parsed = JSON.parse(text) as {
      error?: {
        status?: unknown;
        message?: unknown;
        details?: unknown;
      };
    };
    const err = parsed?.error;
    if (!err || typeof err !== "object") return fallback;

    let errorCode: string | undefined;
    if (Array.isArray(err.details)) {
      for (const detail of err.details) {
        if (!detail || typeof detail !== "object") continue;
        const maybeCode = (detail as { errorCode?: unknown }).errorCode;
        if (typeof maybeCode === "string" && maybeCode.trim()) {
          errorCode = maybeCode.trim();
          break;
        }
      }
    }

    const errorStatus =
      typeof err.status === "string" && err.status.trim()
        ? err.status.trim()
        : undefined;
    const errorMessage =
      typeof err.message === "string" && err.message.trim()
        ? truncateForLog(err.message)
        : undefined;

    const errorText =
      [errorStatus, errorCode, errorMessage].filter(Boolean).join(" | ") ||
      fallback.errorText;
    return { errorText, errorStatus, errorCode, errorMessage };
  } catch {
    return fallback;
  }
}

const FCM_DATA_KEYS: (keyof FcmDataPayload)[] = [
  "type",
  "title",
  "body",
  "avatarUrl",
  "postId",
  "postType",
  "inviteId",
  "threadId",
  "threadKind",
  "actorId",
  "target",
  "conversationId",
  "messageId",
  "senderUserId",
  "senderName",
  "groupName",
  "occurrenceDate",
  "targetPath",
];

function buildFcmDataStringMap(data: FcmDataPayload): Record<string, string> {
  const fcmData: Record<string, string> = {};
  for (const key of FCM_DATA_KEYS) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) {
      fcmData[key] = value.trim();
    }
  }
  return fcmData;
}

/**
 * Send one FCM v1 message to a single device token.
 * Android: `data_only` (invite, default) or `notification_and_data` (post push).
 * iOS: notification + APNS alert + data.
 */
export async function sendFcmToDevice(
  accessToken: string,
  projectId: string,
  deviceToken: string,
  platform: PushDevicePlatform,
  data: FcmDataPayload,
  options?: FcmSendOptions
): Promise<FcmSendResult> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const fcmData = buildFcmDataStringMap(data);
  const androidDelivery: AndroidDeliveryMode =
    options?.androidDelivery ?? "data_only";
  const defaultTitle =
    options?.defaultNotification?.title ?? "New invite";
  const defaultBody =
    options?.defaultNotification?.body ?? "Tap to view invite";

  const notification = {
    title: options?.defaultNotification?.title ?? data.title ?? defaultTitle,
    body: options?.defaultNotification?.body ?? data.body ?? defaultBody,
  };

  const message =
    platform === "ios"
      ? {
          token: deviceToken,
          notification,
          apns: {
            payload: {
              aps: {
                alert: notification,
                sound: "default",
              },
            },
          },
          data: fcmData,
        }
      : androidDelivery === "notification_and_data"
        ? {
            token: deviceToken,
            notification,
            data: fcmData,
          }
        : {
            token: deviceToken,
            android: {
              priority: "HIGH",
            },
            data: fcmData,
          };

  const body = {
    message: {
      ...message,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      ...extractFcmErrorSummary(text),
    };
  }
  return { ok: true, status: res.status };
}
