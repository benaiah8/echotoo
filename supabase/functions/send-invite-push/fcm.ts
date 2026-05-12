/**
 * FCM HTTP v1 — isolated helpers for invite pushes.
 * Android stays data-only for native custom rendering; iOS uses a visible alert.
 * Note: `import { SignJWT }` — not `import * as jose` + `jose.SignJWT` — some Deno/edge
 * bundles break class construction on namespace imports (SignJWT must be used with `new`).
 */
import { SignJWT, importPKCS8 } from "npm:jose@5.9.6";

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

export type FcmDataPayload = {
  type?: string;
  title?: string;
  body?: string;
  avatarUrl?: string;
  postId: string;
  postType: string;
  /** Optional; included for single-recipient sends (e.g. invite) when the client has one invite row. */
  inviteId?: string;
  threadId?: string;
  threadKind?: string;
  actorId?: string;
  target?: string;
};

export type PushDevicePlatform = "android" | "ios";

/**
 * Send one FCM v1 message to a single device token.
 */
export async function sendFcmToDevice(
  accessToken: string,
  projectId: string,
  deviceToken: string,
  platform: PushDevicePlatform,
  data: FcmDataPayload
): Promise<{ ok: boolean; status: number; errorText?: string }> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const fcmData: Record<string, string> = {
    postId: data.postId,
    postType: data.postType,
  };
  if (data.type) {
    fcmData.type = data.type;
  }
  if (data.title) {
    fcmData.title = data.title;
  }
  if (data.body) {
    fcmData.body = data.body;
  }
  if (data.avatarUrl) {
    fcmData.avatarUrl = data.avatarUrl;
  }
  if (data.inviteId) {
    fcmData.inviteId = data.inviteId;
  }
  if (data.threadId) {
    fcmData.threadId = data.threadId;
  }
  if (data.threadKind) {
    fcmData.threadKind = data.threadKind;
  }
  if (data.actorId) {
    fcmData.actorId = data.actorId;
  }
  if (data.target) {
    fcmData.target = data.target;
  }

  const notification = {
    title: data.title ?? "New invite",
    body: data.body ?? "Tap to view invite",
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
    return { ok: false, status: res.status, errorText: text.slice(0, 500) };
  }
  return { ok: true, status: res.status };
}
