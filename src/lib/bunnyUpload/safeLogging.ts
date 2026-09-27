export type SafeBunnySmokeLog = {
  ok: boolean;
  publishPostId?: string | null;
  mediaId?: string | null;
  videoId?: string | null;
  videoStatus?: string | null;
  reused?: boolean | null;
  uploaded?: boolean | null;
  alreadyReady?: boolean | null;
  alreadyUploaded?: boolean | null;
  progress?: number | null;
  error?: string | null;
};

export function buildSafeBunnySmokeLog(
  payload: Partial<SafeBunnySmokeLog>,
): SafeBunnySmokeLog {
  return {
    ok: payload.ok === true,
    publishPostId: payload.publishPostId ?? null,
    mediaId: payload.mediaId ?? null,
    videoId: payload.videoId ?? null,
    videoStatus: payload.videoStatus ?? null,
    reused: payload.reused ?? null,
    uploaded: payload.uploaded ?? null,
    alreadyReady: payload.alreadyReady ?? null,
    alreadyUploaded: payload.alreadyUploaded ?? null,
    progress: payload.progress ?? null,
    error: payload.error ?? null,
  };
}

export function logPayloadContainsSecret(
  payload: Record<string, unknown>,
  secret?: string,
): boolean {
  const json = JSON.stringify(payload);
  if (json.includes("authorizationSignature")) return true;
  if (secret && json.includes(secret)) return true;
  return false;
}
