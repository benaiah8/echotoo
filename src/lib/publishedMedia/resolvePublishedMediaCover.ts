/**
 * Pure cover selection from PublishedMediaItem[] (PV3 foundation; no UI in PV2A).
 */

import type { PublishedMediaItem } from "./types";

export type PublishedMediaCover =
  | { kind: "image"; url: string }
  | { kind: "video-poster"; url: string }
  | { kind: "video-placeholder" }
  | { kind: "none" };

export function resolvePublishedMediaCover(
  items: PublishedMediaItem[],
): PublishedMediaCover {
  const first = items[0];
  if (!first) return { kind: "none" };
  if (first.kind === "image") {
    return { kind: "image", url: first.url };
  }
  if (first.posterUrl && first.posterUrl.trim()) {
    return { kind: "video-poster", url: first.posterUrl.trim() };
  }
  return { kind: "video-placeholder" };
}
