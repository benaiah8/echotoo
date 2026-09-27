import { corsHeaders } from "../_shared/push/edgeAuth.ts";

/** CORS for browser clients (preflight + JSON responses). */
export const bunnyVideoDeleteCorsHeaders: Record<string, string> = {
  ...corsHeaders,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function bunnyVideoDeleteJsonResponse(
  body: Record<string, unknown>,
  status: number,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...bunnyVideoDeleteCorsHeaders,
      "Content-Type": "application/json",
    },
  });
}
