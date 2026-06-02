export type MediaUploadErrorCategory =
  | "network"
  | "auth"
  | "decode"
  | "storage"
  | "size"
  | "policy"
  | "abort"
  | "attach"
  | "unknown";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err ?? "");
}

function lowerMessage(err: unknown): string {
  return errorMessage(err).toLowerCase();
}

function isAbortError(err: unknown, msg: string): boolean {
  if (err instanceof Error && err.name === "AbortError") return true;
  return msg.includes("aborterror") || msg.includes("aborted");
}

function isNetworkMessage(msg: string): boolean {
  return (
    msg.includes("load failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("err_network") ||
    msg.includes("offline") ||
    msg.includes("timeout") ||
    msg.includes("timed out")
  );
}

function hasTransientHttpStatus(msg: string): boolean {
  if (/\b408\b/.test(msg) || msg.includes("request timeout")) return true;
  if (/\b429\b/.test(msg) || msg.includes("too many requests")) return true;
  if (/\b502\b/.test(msg) || /\b503\b/.test(msg) || /\b504\b/.test(msg)) {
    return true;
  }
  if (/\b5\d{2}\b/.test(msg)) return true;
  return false;
}

function isDuplicateMessage(msg: string): boolean {
  return (
    msg.includes("already exists") ||
    msg.includes("duplicate") ||
    /\b409\b/.test(msg)
  );
}

function isCloudinaryNotConfigured(msg: string): boolean {
  return msg.includes("cloudinary is not configured");
}

/**
 * Classify upload I/O errors for diagnostics and retry decisions.
 */
export function getMediaUploadErrorCategory(
  err: unknown
): MediaUploadErrorCategory {
  const msg = lowerMessage(err);

  if (isAbortError(err, msg)) return "abort";

  if (msg.includes("could not attach")) return "attach";

  if (
    msg.includes("not authenticated") ||
    msg.includes("user not authenticated") ||
    (msg.includes("session") && msg.includes("expired")) ||
    msg.includes("jwt") ||
    /\b401\b/.test(msg) ||
    msg.includes("unauthorized")
  ) {
    return "auth";
  }

  if (
    /\b403\b/.test(msg) ||
    msg.includes("forbidden") ||
    msg.includes("policy") ||
    msg.includes("rls") ||
    msg.includes("permission denied")
  ) {
    return "policy";
  }

  if (
    msg.includes("not a supported image") ||
    msg.includes("could not encode") ||
    msg.includes("could not process") ||
    msg.includes("image load failed") ||
    msg.includes("heic") ||
    msg.includes("heif") ||
    msg.includes("decode") ||
    msg.includes("encode image") ||
    msg.includes("try another photo") ||
    msg.includes("toblob failed")
  ) {
    return "decode";
  }

  if (
    /\b413\b/.test(msg) ||
    msg.includes("payload too large") ||
    msg.includes("entity too large") ||
    msg.includes("file too large") ||
    (msg.includes("exceeded") && msg.includes("size"))
  ) {
    return "size";
  }

  if (isNetworkMessage(msg)) return "network";

  if (
    msg.includes("supabase storage") ||
    msg.includes("cloudinary upload failed") ||
    msg.includes("no secure_url from cloudinary")
  ) {
    return "storage";
  }

  return "unknown";
}

/**
 * Whether a failed upload I/O attempt should be retried (transient failures only).
 */
export function isMediaUploadRetryable(err: unknown): boolean {
  const msg = lowerMessage(err);
  const category = getMediaUploadErrorCategory(err);

  if (
    category === "auth" ||
    category === "decode" ||
    category === "size" ||
    category === "policy" ||
    category === "abort" ||
    category === "attach" ||
    category === "unknown"
  ) {
    return false;
  }

  if (isDuplicateMessage(msg) || isCloudinaryNotConfigured(msg)) {
    return false;
  }

  if (category === "network") {
    return true;
  }

  if (category === "storage") {
    if (isNetworkMessage(msg) || hasTransientHttpStatus(msg)) {
      return true;
    }
    return false;
  }

  return false;
}
