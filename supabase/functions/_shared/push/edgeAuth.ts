/**
 * Shared auth helpers for internal/service Edge push functions.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-push-secret",
};

export function jsonResponse(
  body: Record<string, unknown>,
  status: number
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function createServiceRoleClient(
  supabaseUrl: string,
  serviceRoleKey: string
): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Service-role bearer or matching INTERNAL_PUSH_SECRET header. */
export function authorizeInternalPushRequest(
  req: Request,
  serviceRoleKey: string
): boolean {
  const internalSecret = Deno.env.get("INTERNAL_PUSH_SECRET")?.trim();
  if (internalSecret) {
    const header = req.headers.get("x-internal-push-secret")?.trim();
    if (header && header === internalSecret) return true;
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 && token === serviceRoleKey;
}

export async function assertReportReviewer(
  supabaseUser: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabaseUser
    .from("report_reviewers")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[push-auth] report_reviewers:", error.message);
    return false;
  }
  return !!data?.user_id;
}

export function toPublicMediaAvatarUrl(
  supabaseUrl: string,
  avatarPath: string | null | undefined
): string | undefined {
  const raw = (avatarPath ?? "").trim();
  if (!raw) return undefined;
  if (raw.startsWith("preset:")) return undefined;
  if (/^https:\/\//i.test(raw)) return raw;
  if (/^http:\/\//i.test(raw)) return undefined;
  try {
    const normalizedBase = supabaseUrl.replace(/\/+$/, "");
    const encodedPath = raw
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    return `${normalizedBase}/storage/v1/object/public/media/${encodedPath}`;
  } catch {
    return undefined;
  }
}
