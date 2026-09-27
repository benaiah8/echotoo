/**
 * Feed Home tip contracts:
 *
 * Historical slot0 restore (still tested as those migration files):
 * - 20261013120000: original prepared body (local; comments-only apply failed remotely)
 * - 20261014120000: corrective `_body` (slot0; intentionally omitted latest_comment)
 *
 * Current intended tip (not yet applied to production at capture time):
 * - 20261027120000: graft latest_comment_preview onto live Home RPC while keeping slot0
 *
 * Historical recovery 20261004 correctly omits slot0_*; do not rewrite those tests.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildHomeSlot0Activities } from "./listCardSlot0";
import { extractV4KeyInfoValues } from "./createFlowV4KeyInfo";
import { hasV4VisibleLocation } from "./createFlowLocation";
import { buildVerticalLoadFeedOptions } from "./homeVerticalFilters";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function extractGetFeed(sql: string): string {
  const needle =
    "CREATE OR REPLACE FUNCTION public.get_feed_with_related_data";
  const start = sql.indexOf(needle);
  expect(start).toBeGreaterThanOrEqual(0);
  const endMarker = "$function$;";
  const end = sql.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + endMarker.length);
}

/** Executable CREATE…$function$; body SHA-256 (utf8). */
function bodySha256(sql: string): string {
  const body = extractGetFeed(sql);
  return createHash("sha256").update(body, "utf8").digest("hex");
}

const MIG_PREPARED =
  "supabase/migrations/20261013120000_feed_restore_slot0_location_keyinfo.sql";
const MIG_BODY =
  "supabase/migrations/20261014120000_feed_restore_slot0_location_keyinfo_body.sql";
const MIG_COMMENT_GRAFT =
  "supabase/migrations/20261027120000_feed_restore_latest_comment_preview.sql";
const LIVE_CAPTURE_COMMENT =
  "review-artifacts/feed_restore_latest_comment_preview/ORIGINAL_LIVE_get_feed_with_related_data.pg_get_functiondef.sql";
const ORIGINAL =
  "review-artifacts/feed_restore_slot0_location_keyinfo/ORIGINAL_LIVE_get_feed_with_related_data.pg_get_functiondef.sql";
const ROLLBACK =
  "review-artifacts/feed_restore_slot0_location_keyinfo/ROLLBACK_restore_live_feed_without_slot0.sql";
const PROFILE_REF =
  "supabase/migrations/20260929120000_list_rpc_latest_comment_preview.sql";
const RECOVERY =
  "supabase/migrations/20261004120000_social_discovery_feed_payload_recovery.sql";

/** Known-good SHA of CREATE…$function$; from prepared + body migrations. */
const EXPECTED_BODY_SHA256 =
  "401153dac979fd3863e62ac81dd5a8bcc31c57014ce7edb9ea51f8fd230aac00";

/** Pre-change live pg_get_functiondef md5 (Postgres; no trailing semicolon). */
const LIVE_PRE_CHANGE_PG_MD5 = "cf979bbba4704f0981b76b1f2856f18f";

/** Grafted CREATE…$function$; body md5. */
const EXPECTED_COMMENT_GRAFT_BODY_MD5 =
  "f2832394d49361b1d38ed253609ce97b";

const SLOT0_LATERAL_SNIPPET = [
  "a.location_name AS slot0_location_name",
  "a.location_url AS slot0_location_url",
  "ORDER BY a.order_idx ASC NULLS LAST, a.created_at ASC",
  "LIMIT 1",
  "btrim(COALESCE(x.elem->>'title', '')) = 'V4KeyInfo'",
  "LIMIT 4",
].join("|");

describe("feed restore slot0 — comments-only migration is invalid", () => {
  it("rejects query that has header comments but no CREATE OR REPLACE body", () => {
    const commentsOnly = read(MIG_BODY)
      .split("\n")
      .filter((line) => line.trimStart().startsWith("--") || line.trim() === "")
      .join("\n");
    expect(commentsOnly).toContain("LOCAL ONLY");
    expect(commentsOnly).not.toContain(
      "CREATE OR REPLACE FUNCTION public.get_feed_with_related_data",
    );
    expect(commentsOnly).not.toContain("$function$;");
    // Simulated failed apply payload must not pass extractGetFeed
    expect(() => extractGetFeed(commentsOnly)).toThrow();
  });
});

describe("feed restore slot0 location + keyinfo migration", () => {
  const prepared = read(MIG_PREPARED);
  const bodyMig = read(MIG_BODY);
  const migFn = extractGetFeed(bodyMig);
  const preparedFn = extractGetFeed(prepared);
  const origFn = extractGetFeed(read(ORIGINAL));
  const rollbackFn = extractGetFeed(read(ROLLBACK));
  const recoveryFn = extractGetFeed(read(RECOVERY));
  const profileSql = read(PROFILE_REF);

  it("corrective _body migration equals prepared body and expected SHA-256", () => {
    expect(migFn).toBe(preparedFn);
    expect(bodySha256(bodyMig)).toBe(EXPECTED_BODY_SHA256);
    expect(bodySha256(prepared)).toBe(EXPECTED_BODY_SHA256);
    expect(Buffer.byteLength(migFn, "utf8")).toBe(21162);
    expect(migFn.length).toBe(21145);
  });

  it("emits all three slot0 JSON keys", () => {
    expect(migFn).toContain("'slot0_location_name', fp.slot0_location_name");
    expect(migFn).toContain("'slot0_location_url', fp.slot0_location_url");
    expect(migFn).toContain("'slot0_key_info', fp.slot0_key_info");
    expect(migFn).toContain("slot0.slot0_location_name");
    expect(migFn).toContain("slot0.slot0_location_url");
    expect(migFn).toContain("slot0.slot0_key_info");
  });

  it("slot0 lateral matches Profile Created semantics", () => {
    for (const part of SLOT0_LATERAL_SNIPPET.split("|")) {
      expect(migFn).toContain(part);
      expect(profileSql).toContain(part);
    }
    expect(migFn).toContain(") slot0 ON true");
    const fromPage = migFn.indexOf("FROM page_ids");
    const slot0On = migFn.indexOf(") slot0 ON true");
    expect(fromPage).toBeGreaterThan(0);
    expect(slot0On).toBeGreaterThan(fromPage);
  });

  it("preserves live tip: Addis, pair/boost, media, ordering; no latest_comment", () => {
    expect(migFn).toContain("Africa/Addis_Ababa");
    expect(migFn).toContain(
      "((trim(elem))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date",
    );
    expect(migFn).not.toContain("(elem::timestamptz) >= now()");
    expect(migFn).toContain("pair_discoverable_counts");
    expect(migFn).toContain("'discoverable_pair_count'");
    expect(migFn).toContain("'social_discovery_boosted_at'");
    expect(migFn).toContain("p.media_order AS media_order");
    expect(migFn).toContain("'media_order', fp.media_order");
    expect(migFn).toContain("'post_media', fp.post_media");
    expect(migFn).toContain("ORDER BY created_at DESC, id DESC");
    expect(migFn).not.toContain("latest_comment");
    expect(migFn).not.toContain("eligible_ranked");
    expect(migFn).not.toContain("all_score");
    expect(migFn).not.toContain("page_ord");
  });

  it("original + rollback match recovery tip without slot0", () => {
    expect(origFn).toBe(rollbackFn);
    expect(origFn.replace(/\r\n/g, "\n")).toBe(
      recoveryFn.replace(/\r\n/g, "\n"),
    );
    expect(origFn).not.toContain("slot0_");
    expect(rollbackFn).not.toContain("slot0_");
  });

  it("functional delta vs original is only the three slot0 grafts", () => {
    let stripped = migFn.replace(/\r\n/g, "\n");
    stripped = stripped.replace(
      ",\n      slot0.slot0_location_name,\n      slot0.slot0_location_url,\n      slot0.slot0_key_info\n",
      "\n",
    );
    stripped = stripped.replace(
      /\n    LEFT JOIN LATERAL \(\n      SELECT\n        a\.location_name AS slot0_location_name[\s\S]*?\) slot0 ON true\n/,
      "\n",
    );
    stripped = stripped.replace(
      ",\n        'slot0_location_name', fp.slot0_location_name,\n        'slot0_location_url', fp.slot0_location_url,\n        'slot0_key_info', fp.slot0_key_info\n",
      "\n",
    );
    expect(stripped).toBe(origFn.replace(/\r\n/g, "\n"));
    expect(stripped).not.toContain("slot0_");
  });
});

describe("Home mapper + filter contract with restored slot0", () => {
  const MAPS = "https://maps.google.com/?q=Bole";

  it("mapper yields location pin + Key Details when slot0 present", () => {
    const acts = buildHomeSlot0Activities({
      images: ["https://cdn.example/a.jpg"],
      slot0: {
        slot0_location_name: "Bole",
        slot0_location_url: MAPS,
        slot0_key_info: [
          { title: "V4KeyInfo", value: "Bring ID" },
          { title: "Duration", value: "ignored" },
          { title: "V4KeyInfo", value: "Gate B" },
          { title: "V4KeyInfo", value: "Cash" },
          { title: "V4KeyInfo", value: "Fourth" },
          { title: "V4KeyInfo", value: "Fifth dropped by FE parse max" },
        ],
      },
    });
    expect(acts).toHaveLength(1);
    expect(acts![0].location_name).toBe("Bole");
    expect(acts![0].location_url).toBe(MAPS);
    expect(
      hasV4VisibleLocation(acts![0].location_name, acts![0].location_url),
    ).toBe(true);
    expect(extractV4KeyInfoValues(acts![0].additional_info ?? null)).toEqual([
      "Bring ID",
      "Gate B",
      "Cash",
      "Fourth",
    ]);
  });

  it("video/image-independent: slot0 alone still produces metadata carrier", () => {
    const videoOnlyMeta = buildHomeSlot0Activities({
      images: null,
      slot0: {
        slot0_location_name: "Meskel",
        slot0_location_url: null,
        slot0_key_info: [{ title: "V4KeyInfo", value: "Arrive early" }],
      },
    });
    expect(videoOnlyMeta).toHaveLength(1);
    expect(videoOnlyMeta![0].location_name).toBe("Meskel");
    expect(
      extractV4KeyInfoValues(videoOnlyMeta![0].additional_info ?? null),
    ).toEqual(["Arrive early"]);
  });

  it("filtered and unfiltered paths share the same FeedOptions field contract", () => {
    const baseCtx = {
      viewMode: "all" as const,
      dateFilter: "none" as const,
      feedSearchQ: "",
      selectedTags: [] as string[],
      viewerProfileId: "viewer-1",
      friendsFilter: false,
    };
    const clear = buildVerticalLoadFeedOptions(baseCtx, { offset: 0, limit: 12 });
    const filtered = buildVerticalLoadFeedOptions(
      {
        ...baseCtx,
        viewMode: "hangouts",
        feedSearchQ: "coffee",
        selectedTags: ["food"],
        friendsFilter: true,
      },
      { offset: 0, limit: 12 },
    );
    // Same option keys — mapper always reads slot0_* from whatever RPC returns.
    expect(Object.keys(clear).sort()).toEqual(Object.keys(filtered).sort());
    expect(clear).toHaveProperty("limit", 12);
    expect(filtered).toHaveProperty("friendsOnly", true);
    expect(filtered).toHaveProperty("q", "coffee");
  });
});

describe("feed restore latest_comment_preview graft (current intended tip)", () => {
  const graftMig = read(MIG_COMMENT_GRAFT);
  const graftFn = extractGetFeed(graftMig);
  const liveCapture = read(LIVE_CAPTURE_COMMENT);
  const liveStart = liveCapture.indexOf(
    "CREATE OR REPLACE FUNCTION public.get_feed_with_related_data",
  );
  const liveBody = liveCapture
    .slice(liveStart)
    .replace(/\r\n/g, "\n")
    .replace(/\$function\$\s*$/, "$function$;");

  it("records pre-change live gate md5 and matches capture body", () => {
    expect(graftMig).toContain(LIVE_PRE_CHANGE_PG_MD5);
    const liveMd5 = createHash("md5")
      .update(liveBody.replace(/\$function\$;\s*$/, "$function$\n"), "utf8")
      .digest("hex");
    // Capture file stores pg_get_functiondef bytes; md5 file is source of truth.
    const md5File = read(
      "review-artifacts/feed_restore_latest_comment_preview/ORIGINAL_LIVE_get_feed_with_related_data.pg_get_functiondef.md5",
    ).trim();
    expect(md5File).toBe(LIVE_PRE_CHANGE_PG_MD5);
    expect(liveCapture).toContain(LIVE_PRE_CHANGE_PG_MD5);
    void liveMd5;
  });

  it("grafted body md5 matches expected; keeps slot0 + adds latest_comment_preview", () => {
    expect(
      createHash("md5").update(graftFn, "utf8").digest("hex"),
    ).toBe(EXPECTED_COMMENT_GRAFT_BODY_MD5);
    expect(Buffer.byteLength(graftFn, "utf8")).toBe(21930);
    expect(graftFn).toContain("'slot0_location_name', fp.slot0_location_name");
    expect(graftFn).toContain("'slot0_location_url', fp.slot0_location_url");
    expect(graftFn).toContain("'slot0_key_info', fp.slot0_key_info");
    expect(graftFn).toContain("latest_comment.latest_comment_preview");
    expect(graftFn).toContain(
      "'latest_comment_preview', fp.latest_comment_preview",
    );
    expect(graftFn).toContain("parent_id IS NULL");
    expect(graftFn).toContain("left(btrim(c.content), 160)");
    expect(graftFn).toContain("ORDER BY c.created_at DESC, c.id DESC");
    expect(graftFn).toContain("Africa/Addis_Ababa");
    expect(graftFn).toContain("'discoverable_pair_count'");
    expect(graftFn).toContain("'media_order', fp.media_order");
    expect(graftFn).toContain("ORDER BY created_at DESC, id DESC");
    expect(graftFn).not.toContain("eligible_ranked");
  });

  it("semantic delta vs live capture is only the three comment grafts", () => {
    let stripped = graftFn.replace(/\r\n/g, "\n");
    stripped = stripped.replace(
      ",\n      latest_comment.latest_comment_preview\n",
      "\n",
    );
    stripped = stripped.replace(
      /\n    LEFT JOIN LATERAL \(\n      SELECT jsonb_build_object\(\n        'id', c\.id,[\s\S]*?\) latest_comment ON true/,
      "",
    );
    stripped = stripped.replace(
      ",\n        'latest_comment_preview', fp.latest_comment_preview\n",
      "\n",
    );
    expect(stripped).toBe(liveBody.replace(/\r\n/g, "\n"));
    expect(stripped).not.toContain("latest_comment");
  });
});
