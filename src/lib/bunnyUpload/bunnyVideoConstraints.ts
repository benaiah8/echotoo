export const MAX_BUNNY_VIDEO_FILE_BYTES = 200 * 1024 * 1024;

export const ALLOWED_BUNNY_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export const BUNNY_VIDEO_FILE_ACCEPT = ALLOWED_BUNNY_VIDEO_MIME_TYPES.join(",");

export function normalizeBunnyVideoMimeType(mimeType: string): string {
  return mimeType.trim().toLowerCase();
}

export function isAllowedBunnyVideoMimeType(mimeType: string): boolean {
  return (ALLOWED_BUNNY_VIDEO_MIME_TYPES as readonly string[]).includes(
    normalizeBunnyVideoMimeType(mimeType),
  );
}

export function validateBunnyVideoFile(
  file: Pick<File, "size" | "type" | "name">,
):
  | { ok: true; mimeType: string }
  | { ok: false; error: string } {
  const mimeType = normalizeBunnyVideoMimeType(file.type || "");
  if (!mimeType || !isAllowedBunnyVideoMimeType(mimeType)) {
    return { ok: false, error: "Unsupported video MIME type" };
  }
  if (file.size <= 0) {
    return { ok: false, error: "File is empty" };
  }
  if (file.size > MAX_BUNNY_VIDEO_FILE_BYTES) {
    return { ok: false, error: "File exceeds 200MB limit" };
  }
  if (!file.name?.trim()) {
    return { ok: false, error: "Invalid file name" };
  }
  return { ok: true, mimeType };
}
