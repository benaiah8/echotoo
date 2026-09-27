/**
 * Best-effort delete of draft-owned unpublished post image Storage objects.
 * Never deletes published/edit/profile paths without strict ownership proof.
 */

import { deleteMediaStorageObject } from "../../api/services/mediaUpload";
import { isLocalDraftImageUrl } from "./localDraftImageUrl";
import type { DraftImage } from "./types";
import { updateDraftImageRemoteFields } from "./draftImageMeta";

/** Supabase post image path: `{userId}/post/{uuid}.{ext}` */
export function isDraftOwnedPostStoragePath(
  path: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  const uid = typeof userId === "string" ? userId.trim() : "";
  const p = typeof path === "string" ? path.trim() : "";
  if (!uid || !p) return false;
  if (p.includes("..") || p.includes("\\") || p.includes("\0")) return false;
  if (/^https?:\/\//i.test(p) || p.startsWith("blob:") || p.startsWith("data:")) {
    return false;
  }
  if (isLocalDraftImageUrl(p)) return false;
  // Must be exactly under this user's post/ namespace (no extra segments).
  const prefix = `${uid}/post/`;
  if (!p.startsWith(prefix)) return false;
  const rest = p.slice(prefix.length);
  if (!rest || rest.includes("/") || rest.includes("..")) return false;
  return /^[A-Za-z0-9._-]+$/.test(rest);
}

export function draftImageReusableRemotePath(
  image: DraftImage,
  userId: string | null | undefined,
): string | null {
  const storage = image.remoteStoragePath?.trim() || "";
  if (storage) {
    if (isDraftOwnedPostStoragePath(storage, userId)) return storage;
    // Wrong owner / invalid — do not reuse.
    return null;
  }
  const url = image.remoteUrl?.trim() || "";
  if (!url) return null;
  if (url.startsWith("blob:") || url.startsWith("data:") || isLocalDraftImageUrl(url)) {
    return null;
  }
  // Cloudinary / absolute URL from prior uploadNormalizedPostImage — reuse as payload value.
  if (/^https?:\/\//i.test(url)) return url;
  // Relative storage path stored in remoteUrl historically.
  if (isDraftOwnedPostStoragePath(url, userId)) return url;
  return null;
}

/**
 * Best-effort Storage remove for a draft-owned unpublished object.
 * Prefer orphan over destructive delete when ownership is unclear.
 */
export async function deleteDraftOwnedRemoteImageIfSafe(options: {
  pathOrUrl: string | null | undefined;
  userId: string | null | undefined;
}): Promise<{ deleted: boolean; skipped: boolean; reason?: string }> {
  const raw =
    typeof options.pathOrUrl === "string" ? options.pathOrUrl.trim() : "";
  if (!raw) return { deleted: false, skipped: true, reason: "empty" };
  if (!isDraftOwnedPostStoragePath(raw, options.userId)) {
    return { deleted: false, skipped: true, reason: "not_draft_owned_post_path" };
  }
  const removed = await deleteMediaStorageObject(raw);
  if (!removed.ok) {
    return {
      deleted: false,
      skipped: false,
      reason: removed.error || "storage_error",
    };
  }
  return { deleted: true, skipped: false };
}

export async function cleanupDraftImageRemoteIfPresent(
  image: DraftImage,
  userId: string | null | undefined,
): Promise<void> {
  const path =
    image.remoteStoragePath?.trim() ||
    (isDraftOwnedPostStoragePath(image.remoteUrl, userId)
      ? image.remoteUrl!.trim()
      : "");
  if (!path) return;
  await deleteDraftOwnedRemoteImageIfSafe({ pathOrUrl: path, userId });
  updateDraftImageRemoteFields(image.localId, {
    remoteStoragePath: null,
    remoteUrl: null,
  });
}
