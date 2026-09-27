/**
 * Bunny Stream CDN playback URL resolver (PV1).
 *
 * TODO(token-auth): When Bunny token auth is enabled, replace raw HLS URL
 * construction here only — players/carousels must keep calling this helper.
 */

export type PublishedVideoPlaybackInput = {
  videoId: string;
  posterUrl?: string | null;
};

export type PublishedVideoPlayback = {
  hlsUrl: string;
  posterUrl: string | null;
};

const DEFAULT_CDN_HOST = "vz-352d6183-da2.b-cdn.net";

export function getBunnyStreamCdnHost(): string {
  const fromEnv =
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    typeof import.meta.env.VITE_BUNNY_STREAM_CDN_HOST === "string"
      ? import.meta.env.VITE_BUNNY_STREAM_CDN_HOST.trim()
      : "";
  return fromEnv || DEFAULT_CDN_HOST;
}

export function buildBunnyHlsPlaylistUrl(
  bunnyVideoId: string,
  cdnHost = getBunnyStreamCdnHost(),
): string {
  const id = bunnyVideoId.trim();
  const host = cdnHost.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return `https://${host}/${id}/playlist.m3u8`;
}

export function resolvePublishedVideoPlayback(
  media: PublishedVideoPlaybackInput,
): PublishedVideoPlayback {
  const videoId = media.videoId?.trim() || "";
  if (!videoId) {
    throw new Error("Missing Bunny video id for playback");
  }
  return {
    hlsUrl: buildBunnyHlsPlaylistUrl(videoId),
    posterUrl:
      typeof media.posterUrl === "string" && media.posterUrl.trim()
        ? media.posterUrl.trim()
        : null,
  };
}
