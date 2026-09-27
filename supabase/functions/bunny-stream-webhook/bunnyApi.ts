import { LOG_PREFIX, type BunnyVideoMetadata, parseBunnyVideoMetadata } from "./helpers.ts";

export type BunnyVideoFetchResult =
  | { ok: true; metadata: BunnyVideoMetadata }
  | { ok: false; error: string };

export async function fetchBunnyVideoMetadata(
  libraryId: string,
  apiKey: string,
  videoGuid: string,
): Promise<BunnyVideoFetchResult> {
  try {
    const response = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${videoGuid}`,
      {
        method: "GET",
        headers: {
          AccessKey: apiKey,
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      console.error(
        `${LOG_PREFIX} metadata fetch status=${response.status} videoGuid=${videoGuid}`,
      );
      return { ok: false, error: "metadata_fetch_failed" };
    }

    const data = (await response.json()) as Record<string, unknown>;
    return { ok: true, metadata: parseBunnyVideoMetadata(data) };
  } catch (error) {
    console.error(
      `${LOG_PREFIX} metadata fetch error videoGuid=${videoGuid}`,
      error,
    );
    return { ok: false, error: "metadata_fetch_failed" };
  }
}
