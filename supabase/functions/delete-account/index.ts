/**
 * delete-account — v1
 * Authenticated self-service: deletes public.profiles for the user (cascades
 * posts per DB FK), then removes the Supabase Auth user via Admin API.
 * Client not wired yet.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(
  body: Record<string, unknown>,
  status: number
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("[delete-account] Missing Supabase env");
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(
      { error: "Missing or invalid Authorization header" },
      401
    );
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return jsonResponse({ error: "Missing bearer token" }, 401);
  }

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser(token);

  if (userError || !user?.id) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const userId = user.id;

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: profileDeleteError } = await supabaseAdmin
    .from("profiles")
    .delete()
    .eq("user_id", userId);

  if (profileDeleteError) {
    console.error(
      "[delete-account] profiles.delete:",
      profileDeleteError.message
    );
    return jsonResponse({ error: "Failed to delete account" }, 500);
  }

  const { error: deleteError } =
    await supabaseAdmin.auth.admin.deleteUser(userId);

  if (deleteError) {
    console.error("[delete-account] admin.deleteUser:", deleteError.message);
    return jsonResponse({ error: "Failed to delete account" }, 500);
  }

  return jsonResponse({ ok: true }, 200);
});
