/**
 * FCM HTTP v1 — isolated helpers (Android only for v1).
 * Uses OAuth2 service-account JWT to obtain an access token, then sends per device token.
 */
import * as jose from "npm:jose@5.9.6";

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
  const key = await jose.importPKCS8(pk, "RS256");

  const jwt = await new jose.SignJWT({
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
  postId: string;
  postType: string;
  /** Optional; included for single-recipient sends (e.g. invite) when the client has one invite row. */
  inviteId?: string;
};

/**
 * Send one FCM v1 message to a single device token (Android).
 */
export async function sendFcmToDevice(
  accessToken: string,
  projectId: string,
  deviceToken: string,
  notification: { title: string; body: string },
  data: FcmDataPayload
): Promise<{ ok: boolean; status: number; errorText?: string }> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const fcmData: Record<string, string> = {
    postId: data.postId,
    postType: data.postType,
  };
  if (data.inviteId) {
    fcmData.inviteId = data.inviteId;
  }
  const body = {
    message: {
      token: deviceToken,
      notification,
      data: fcmData,
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
