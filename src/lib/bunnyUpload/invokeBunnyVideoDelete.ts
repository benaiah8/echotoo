import { supabase } from "../supabaseClient";

export type DeleteCreatePostVideoParams = {
  publishPostId: string;
  mediaId: string;
};

export type DeleteCreatePostVideoResult =
  | { ok: true; alreadyGone?: boolean }
  | { ok: false; error: string };

export function parseBunnyVideoDeleteResponse(
  value: unknown,
): { ok: true; alreadyGone?: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.ok !== true || record.deleted !== true) return null;
  return {
    ok: true,
    alreadyGone: record.alreadyGone === true,
  };
}

export async function deleteCreatePostVideo(
  params: DeleteCreatePostVideoParams,
): Promise<DeleteCreatePostVideoResult> {
  const { data, error } = await supabase.functions.invoke("bunny-video-delete", {
    body: params,
  });

  if (error) {
    const body = data as { error?: string } | null;
    return {
      ok: false,
      error: body?.error ?? error.message,
    };
  }

  const parsed = parseBunnyVideoDeleteResponse(data);
  if (!parsed) {
    return { ok: false, error: "Invalid video-delete response" };
  }

  return parsed;
}
