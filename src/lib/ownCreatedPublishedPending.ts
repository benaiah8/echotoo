/**
 * Pending marker: after publishing a new post, own profile consumes this when visible
 * to remount/refetch Created tab without relying on PROFILE_TAB_REFRESH timing.
 */

export const OWN_CREATED_PUBLISHED_PENDING_KEY =
  "echotoo:own-created-published-pending";

export type OwnCreatedPublishedPendingPayload = {
  postId: string;
  userId: string;
  createdAt: string;
  /** posts.type snapshot */
  type?: string;
};

export type ConsumeOwnCreatedPublishResult =
  | { kind: "none" }
  | { kind: "consumed"; payload: OwnCreatedPublishedPendingPayload }
  | { kind: "mismatch_cleared"; markerUserId: string };

function removeMarker(): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.removeItem(OWN_CREATED_PUBLISHED_PENDING_KEY);
  } catch {
    /* noop */
  }
}

function parsePayload(raw: string): OwnCreatedPublishedPendingPayload | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const postId = typeof o.postId === "string" ? o.postId : "";
    const userId = typeof o.userId === "string" ? o.userId : "";
    const createdAt =
      typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString();
    const type =
      typeof o.type === "string" && o.type.length ? o.type : undefined;
    if (!postId || !userId) return null;
    const payload: OwnCreatedPublishedPendingPayload = {
      postId,
      userId,
      createdAt,
    };
    if (type !== undefined) payload.type = type;
    return payload;
  } catch {
    return null;
  }
}

export function setOwnCreatedPublishedPending(
  payload: OwnCreatedPublishedPendingPayload
): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(
      OWN_CREATED_PUBLISHED_PENDING_KEY,
      JSON.stringify(payload)
    );
  } catch {
    /* noop — quota / privacy mode */
  }
}

/** Read/remove marker exactly once per check. Matching user yields consumed; stale/malformed/mismatch clears storage. */
export function consumeOwnCreatedPublishedPending(
  currentAuthUserId: string
): ConsumeOwnCreatedPublishResult {
  if (typeof sessionStorage === "undefined" || !currentAuthUserId) {
    return { kind: "none" };
  }

  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(OWN_CREATED_PUBLISHED_PENDING_KEY);
  } catch {
    return { kind: "none" };
  }

  if (!raw || !raw.trim()) {
    return { kind: "none" };
  }

  const payload = parsePayload(raw);
  if (!payload) {
    removeMarker();
    return { kind: "none" };
  }

  if (payload.userId !== currentAuthUserId) {
    removeMarker();
    return { kind: "mismatch_cleared", markerUserId: payload.userId };
  }

  removeMarker();
  return { kind: "consumed", payload };
}
