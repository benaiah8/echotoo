import { corsHeaders } from "../_shared/push/edgeAuth.ts";

export const deletePublishedPostCorsHeaders: Record<string, string> = {
  ...corsHeaders,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function deletePublishedPostJsonResponse(
  body: Record<string, unknown>,
  status: number,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...deletePublishedPostCorsHeaders,
      "Content-Type": "application/json",
    },
  });
}
