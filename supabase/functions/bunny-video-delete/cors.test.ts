import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  bunnyVideoDeleteCorsHeaders,
  bunnyVideoDeleteJsonResponse,
} from "./cors.ts";

Deno.test("OPTIONS CORS headers include origin, headers, and methods", () => {
  assertEquals(bunnyVideoDeleteCorsHeaders["Access-Control-Allow-Origin"], "*");
  assertEquals(
    bunnyVideoDeleteCorsHeaders["Access-Control-Allow-Headers"]?.includes(
      "authorization",
    ),
    true,
  );
  assertEquals(
    bunnyVideoDeleteCorsHeaders["Access-Control-Allow-Methods"],
    "POST, OPTIONS",
  );
});

Deno.test("JSON responses include matching CORS headers", async () => {
  const res = bunnyVideoDeleteJsonResponse({ ok: true }, 200);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(res.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
  assertEquals(
    res.headers.get("Access-Control-Allow-Headers")?.includes("content-type"),
    true,
  );
});
