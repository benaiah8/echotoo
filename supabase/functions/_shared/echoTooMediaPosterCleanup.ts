/**
 * Shared helpers for EchoToo Supabase media-bucket poster URL detection/cleanup.
 * Used by bunny-stream-webhook and delete-published-post (local Edge only).
 */

export const MEDIA_BUCKET = "media";

const STORAGE_PUBLIC_MARKER = "/storage/v1/object/public/media/";

/**
 * If poster_url is a public EchoToo media-bucket URL, return the object path.
 * Bunny CDN URLs return null.
 */
export function parseEchoTooMediaBucketObjectPath(
  posterUrl: string | null | undefined,
): string | null {
  if (typeof posterUrl !== "string") return null;
  const raw = posterUrl.trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  try {
    const u = new URL(raw);
    const idx = u.pathname.indexOf(STORAGE_PUBLIC_MARKER);
    if (idx < 0) return null;
    const path = decodeURIComponent(
      u.pathname.slice(idx + STORAGE_PUBLIC_MARKER.length),
    ).replace(/^\/+/, "");
    if (!path || path.includes("..") || path.includes("\\")) return null;
    // Must look like {uuid}/post/{file}
    if (!/^[0-9a-f-]{36}\/post\/[^/]+$/i.test(path)) return null;
    if (!/\.(webp|jpg|jpeg|png)$/i.test(path)) return null;
    return path;
  } catch {
    return null;
  }
}

export async function deleteEchoTooMediaPosterBestEffort(options: {
  supabaseUrl: string;
  serviceRoleKey: string;
  posterUrl: string | null | undefined;
  logPrefix: string;
}): Promise<void> {
  const objectPath = parseEchoTooMediaBucketObjectPath(options.posterUrl);
  if (!objectPath) return;

  try {
    const base = options.supabaseUrl.replace(/\/+$/, "");
    const res = await fetch(
      `${base}/storage/v1/object/${MEDIA_BUCKET}/${objectPath}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${options.serviceRoleKey}`,
          apikey: options.serviceRoleKey,
        },
      },
    );
    if (!res.ok && res.status !== 404) {
      console.warn(
        `${options.logPrefix} poster storage delete failed status=${res.status} path=${objectPath}`,
      );
    }
  } catch (err) {
    console.warn(
      `${options.logPrefix} poster storage delete exception`,
      err,
    );
  }
}
