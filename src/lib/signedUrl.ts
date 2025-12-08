// PERF: signed URLs + tiny in-memory cache to avoid refetching the same path repeatedly
import { supabase } from "./supabaseClient";

const cache = new Map<string, string>();

export async function getSignedUrl(bucket: string, path: string, ttlSec = 120) {
  const key = `${bucket}:${path}:${ttlSec}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, ttlSec);

  if (error) throw error;
  cache.set(key, data.signedUrl);
  return data.signedUrl;
}
