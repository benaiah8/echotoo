/**
 * Map compact list-RPC post_media JSON → PublishedPostMediaRow[].
 */

import type { PublishedPostMediaRow, PublishedVideoStatus } from "./types";

function parseVideoStatus(value: unknown): PublishedVideoStatus {
  if (
    value === "pending" ||
    value === "uploading" ||
    value === "processing" ||
    value === "ready" ||
    value === "failed"
  ) {
    return value;
  }
  return "failed";
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function mapCompactPostMediaRow(
  raw: unknown,
): PublishedPostMediaRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id) return null;
  if (typeof row.bunny_video_id !== "string" || !row.bunny_video_id.trim()) {
    return null;
  }
  return {
    id: row.id,
    post_id: typeof row.post_id === "string" ? row.post_id : null,
    sort_order: asFiniteNumber(row.sort_order) ?? 0,
    kind: typeof row.kind === "string" ? row.kind : "video",
    bunny_video_id: row.bunny_video_id.trim(),
    video_status: parseVideoStatus(row.video_status),
    poster_url:
      typeof row.poster_url === "string" && row.poster_url.trim()
        ? row.poster_url.trim()
        : null,
    duration_sec: asFiniteNumber(row.duration_sec),
    width: asFiniteNumber(row.width),
    height: asFiniteNumber(row.height),
  };
}

export function mapCompactPostMediaRows(
  value: unknown,
): PublishedPostMediaRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(mapCompactPostMediaRow)
    .filter((row): row is PublishedPostMediaRow => row != null);
}

/** Image URLs embedded in media_order (sufficient for Feed without full activities). */
export function imageUrlsFromMediaOrder(mediaOrder: unknown): string[] {
  if (!Array.isArray(mediaOrder)) return [];
  const out: string[] = [];
  for (const item of mediaOrder) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.kind !== "image") continue;
    if (typeof row.url === "string" && row.url.trim()) {
      out.push(row.url.trim());
    }
  }
  return out;
}
