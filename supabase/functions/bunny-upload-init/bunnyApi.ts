import { LOG_PREFIX } from "./helpers.ts";

export type BunnyCreateResult =
  | { ok: true; guid: string }
  | { ok: false; error: string };

export async function createBunnyVideo(
  libraryId: string,
  apiKey: string,
  title: string,
): Promise<BunnyCreateResult> {
  try {
    const response = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos`,
      {
        method: "POST",
        headers: {
          AccessKey: apiKey,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title }),
      },
    );

    if (!response.ok) {
      console.error(`${LOG_PREFIX} bunny create status=${response.status}`);
      return { ok: false, error: "bunny_create_failed" };
    }

    const data = (await response.json()) as { guid?: unknown };
    const guid = typeof data.guid === "string" ? data.guid.trim() : "";
    if (!guid) {
      console.error(`${LOG_PREFIX} bunny create missing guid`);
      return { ok: false, error: "bunny_create_invalid_response" };
    }

    return { ok: true, guid };
  } catch (error) {
    console.error(`${LOG_PREFIX} bunny create error`, error);
    return { ok: false, error: "bunny_create_failed" };
  }
}

export async function deleteBunnyVideoBestEffort(
  libraryId: string,
  apiKey: string,
  videoId: string,
): Promise<void> {
  try {
    const response = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`,
      {
        method: "DELETE",
        headers: { AccessKey: apiKey },
      },
    );

    if (!response.ok) {
      console.error(
        `${LOG_PREFIX} bunny delete status=${response.status} videoId=${videoId}`,
      );
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} bunny delete error videoId=${videoId}`, error);
  }
}
