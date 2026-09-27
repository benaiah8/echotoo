import { LOG_PREFIX, isBunnyDeleteNotFoundStatus } from "./helpers.ts";

export type BunnyDeleteResult =
  | { ok: true; notFound: boolean }
  | { ok: false; error: string; status: number };

/**
 * Delete a Bunny Stream video. 404/410 = idempotent success.
 * Same contract as bunny-video-delete (draft path); shared by copy to avoid
 * coupling draft public API to published-post orchestration.
 */
export async function deleteBunnyVideo(
  libraryId: string,
  apiKey: string,
  videoId: string,
): Promise<BunnyDeleteResult> {
  try {
    const response = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`,
      {
        method: "DELETE",
        headers: { AccessKey: apiKey },
      },
    );

    if (isBunnyDeleteNotFoundStatus(response.status)) {
      return { ok: true, notFound: true };
    }

    if (!response.ok) {
      console.error(
        `${LOG_PREFIX} bunny delete status=${response.status}`,
      );
      return {
        ok: false,
        error: "bunny_delete_failed",
        status: response.status,
      };
    }

    return { ok: true, notFound: false };
  } catch (error) {
    console.error(`${LOG_PREFIX} bunny delete error`, error);
    return { ok: false, error: "bunny_delete_failed", status: 0 };
  }
}
