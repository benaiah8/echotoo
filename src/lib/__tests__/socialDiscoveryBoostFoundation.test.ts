import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  sortDiscoveryHangoutsBySocialSignal,
  takeDiscoveryHangouts,
} from "../horizontalRailFilters";
import type { FeedItemWithDates } from "../feedSorting";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function item(
  id: string,
  opts: {
    type?: FeedItemWithDates["type"];
    group?: number | null;
    pair?: number | null;
    boostedAt?: string | null;
  } = {}
): FeedItemWithDates {
  return {
    id,
    type: opts.type ?? "hangout",
    caption: id,
    created_at: "2099-01-01T00:00:00.000Z",
    discoverable_group_count: opts.group,
    discoverable_pair_count: opts.pair,
    social_discovery_boosted_at: opts.boostedAt,
  } as FeedItemWithDates;
}

const MIG =
  "supabase/migrations/20261003120000_social_discovery_boost_and_pair_count.sql";
const RECOVERY_MIG =
  "supabase/migrations/20261004120000_social_discovery_feed_payload_recovery.sql";
const REVIEWER_FIX_MIG =
  "supabase/migrations/20261005120000_fix_social_discovery_boost_reviewer_check.sql";
const LIVE_TIP =
  "supabase/migrations/20260924120000_feed_profile_published_media_manifest.sql";

function extractGetFeed(sql: string): string {
  const start = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.get_feed_with_related_data"
  );
  expect(start).toBeGreaterThanOrEqual(0);
  const endMarker = "$function$;";
  const end = sql.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + endMarker.length);
}

describe("social discovery boost migration (rebased on live tip)", () => {
  const mig = read(MIG);
  const tip = read(LIVE_TIP);

  it("adds social_discovery_boosted_at and reviewer-gated setter", () => {
    expect(mig).toContain(
      "ADD COLUMN IF NOT EXISTS social_discovery_boosted_at timestamptz NULL"
    );
    expect(mig).toContain("set_post_social_discovery_boost");
    expect(mig).toContain("is_report_reviewer");
    expect(mig).toContain("Only Event posts can be prioritized");
    expect(mig).toContain("GRANT EXECUTE");
    expect(mig).toContain("REVOKE ALL");
    expect(mig).toContain("TO authenticated");
    expect(mig).toMatch(/FROM PUBLIC,\s*anon/);
  });

  it("is based on production tip feed_profile_published_media_manifest semantics", () => {
    expect(mig).toContain(
      "production tip 20260924120000_feed_profile_published_media_manifest"
    );
    // Live tip ordering / eligibility / media
    expect(mig).toContain("ORDER BY created_at DESC, id DESC");
    expect(mig).toContain("Africa/Addis_Ababa");
    expect(mig).toContain(
      "((trim(elem))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date"
    );
    expect(mig).not.toContain("(elem::timestamptz) >= now()");
    expect(mig).toContain("p.media_order AS media_order");
    expect(mig).toContain("'media_order', fp.media_order");
    expect(mig).toContain("'post_media', fp.post_media");
    expect(tip).toContain("ORDER BY created_at DESC, id DESC");
    expect(tip).toContain("(elem::timestamptz) >= now()");
  });

  it("does not leak unapplied 202609291-only feed features", () => {
    expect(mig).not.toContain("all_score");
    expect(mig).not.toContain("slot0_");
    expect(mig).not.toContain("latest_comment");
    expect(mig).not.toContain("page_ord");
    expect(mig).not.toContain("eligible_ranked");
    expect(mig).not.toContain("get_user_posts_created");
  });

  it("adds page-scoped pair count + boost without changing Group count", () => {
    expect(mig).toContain("pair_discoverable_counts");
    expect(mig).toContain("INNER JOIN page_ids pi ON pi.id = o.source_post_id");
    expect(mig).toContain("kind = 'pair_up'");
    expect(mig).toContain("discoverable_until > now()");
    expect(mig).toContain("people_source_is_eligible");
    expect(mig).toContain("'discoverable_pair_count'");
    expect(mig).toContain("'social_discovery_boosted_at'");
    expect(mig).toContain("discoverable_group_count");
    expect(mig).toContain("group_discoverable_counts");
    // Boost is payload-only — not used in ORDER BY
    const orderIdx = mig.indexOf("ORDER BY p.created_at DESC, p.id DESC");
    const boostOrder = mig.indexOf(
      "ORDER BY",
      mig.indexOf("social_discovery_boosted_at")
    );
    expect(orderIdx).toBeGreaterThan(0);
    expect(mig.slice(orderIdx, orderIdx + 80)).not.toContain(
      "social_discovery_boosted"
    );
    expect(mig.slice(orderIdx, orderIdx + 80)).not.toContain(
      "discoverable_pair"
    );
    void boostOrder;
  });
});

describe("fix social discovery boost reviewer check migration", () => {
  const fix = read(REVIEWER_FIX_MIG);

  it("contains only set_post_social_discovery_boost (no feed/column/helper DDL)", () => {
    expect(fix).toContain(
      "CREATE OR REPLACE FUNCTION public.set_post_social_discovery_boost"
    );
    expect(fix.match(/CREATE OR REPLACE FUNCTION/g)?.length).toBe(1);
    expect(fix).not.toMatch(/ALTER TABLE/i);
    expect(fix).not.toContain("get_feed_with_related_data");
    expect(fix).not.toContain(
      "CREATE OR REPLACE FUNCTION public.is_report_reviewer"
    );
    expect(fix).not.toMatch(/^CREATE INDEX/m);
    expect(fix).not.toMatch(/^CREATE TRIGGER/m);
  });

  it("uses production zero-arg is_report_reviewer() only", () => {
    const body = fix
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(body).toContain("IF NOT public.is_report_reviewer() THEN");
    expect(body).not.toContain("is_report_reviewer(v_actor)");
    expect(body).not.toContain("is_report_reviewer(auth.uid())");
    expect(body.match(/public\.is_report_reviewer\(\)/g)?.length).toBe(1);
  });

  it("preserves boost RPC semantics and security contract", () => {
    expect(fix).toContain("v_actor uuid := auth.uid()");
    expect(fix).toContain("RAISE EXCEPTION 'Not authenticated'");
    expect(fix).toContain("Only Event posts can be prioritized for social discovery");
    expect(fix).toContain("SET social_discovery_boosted_at = now()");
    expect(fix).toContain("SET social_discovery_boosted_at = NULL");
    expect(fix).toContain("'social_discovery_boosted_at', v_boosted_at");
    expect(fix).toContain("SECURITY DEFINER");
    expect(fix).toContain("SET search_path TO public, pg_temp");
    expect(fix).toContain("REVOKE ALL");
    expect(fix).toMatch(/FROM PUBLIC,\s*anon/);
    expect(fix).toContain("GRANT EXECUTE");
    expect(fix).toContain("TO authenticated");
  });
});

describe("social discovery feed payload recovery migration", () => {
  const recovery = read(RECOVERY_MIG);
  const mig = read(MIG);

  it("contains only get_feed_with_related_data (no column/admin DDL)", () => {
    expect(recovery).toContain(
      "CREATE OR REPLACE FUNCTION public.get_feed_with_related_data"
    );
    expect(recovery.match(/CREATE OR REPLACE FUNCTION/g)?.length).toBe(1);
    expect(recovery).not.toMatch(/ALTER TABLE/i);
    expect(recovery).not.toContain(
      "CREATE OR REPLACE FUNCTION public.set_post_social_discovery_boost"
    );
    expect(recovery).not.toMatch(/^GRANT\b/m);
    expect(recovery).not.toMatch(/^REVOKE\b/m);
    expect(recovery.trimEnd().endsWith("$function$;")).toBe(true);
  });

  it("matches the rebased 202610031 feed function byte-for-byte", () => {
    expect(extractGetFeed(recovery)).toBe(extractGetFeed(mig));
  });

  it("preserves tip ordering/media and adds pair+boost payload only", () => {
    expect(recovery).toContain("ORDER BY created_at DESC, id DESC");
    expect(recovery).toContain("Africa/Addis_Ababa");
    expect(recovery).toContain(
      "((trim(elem))::timestamptz AT TIME ZONE 'Africa/Addis_Ababa')::date"
    );
    expect(recovery).not.toContain("(elem::timestamptz) >= now()");
    expect(recovery).toContain("'media_order', fp.media_order");
    expect(recovery).toContain("'post_media', fp.post_media");
    expect(recovery).toContain("pair_discoverable_counts");
    expect(recovery).toContain("'discoverable_pair_count'");
    expect(recovery).toContain("'social_discovery_boosted_at'");
    expect(recovery).not.toContain("all_score");
    expect(recovery).not.toContain("slot0_");
    expect(recovery).not.toContain("latest_comment");
    expect(recovery).not.toContain("page_ord");
    expect(recovery).not.toContain("eligible_ranked");
  });
});

describe("sortDiscoveryHangoutsBySocialSignal (admin + duo + group)", () => {
  it("boosted Event first, then pair+group total, then feed order", () => {
    const input = [
      item("a", { group: 9, pair: 0 }),
      item("b", { group: 1, pair: 1, boostedAt: "2099-01-02T00:00:00.000Z" }),
      item("c", { group: 2, pair: 3 }),
      item("d", { group: 5, pair: 0, boostedAt: "2099-01-01T00:00:00.000Z" }),
      item("e", { group: 2, pair: 3 }),
    ];
    const snapshot = [...input];
    const out = sortDiscoveryHangoutsBySocialSignal(input);
    expect(out.map((p) => p.id)).toEqual(["d", "b", "a", "c", "e"]);
    expect(input).toEqual(snapshot);
  });

  it("treats missing/null counts as 0 and does not mutate", () => {
    const input = [
      item("z", { group: null, pair: undefined }),
      item("y", { group: 1, pair: null }),
      item("x", { pair: 2 }),
    ];
    const snapshot = [...input];
    expect(sortDiscoveryHangoutsBySocialSignal(input).map((p) => p.id)).toEqual(
      ["x", "y", "z"]
    );
    expect(input).toEqual(snapshot);
  });

  it("keeps Event-only takeDiscoveryHangouts behavior", () => {
    const input = [
      item("e1", { type: "experience", group: 99 }),
      item("h1", { group: 0 }),
      item("h2", { group: 1 }),
    ];
    expect(takeDiscoveryHangouts(input, 8).map((p) => p.id)).toEqual([
      "h1",
      "h2",
    ]);
  });
});

describe("PostMenu social discovery action wiring", () => {
  it("exposes Event-only reviewer action with state labels", () => {
    const menu = read("src/components/ui/PostMenu.tsx");
    expect(menu).toContain("setPostSocialDiscoveryBoost");
    expect(menu).toContain("Social Discovery");
    expect(menu).toContain("Remove Social Discovery");
    expect(menu).toContain('resolvedPostType === "hangout"');
    expect(menu).toContain("showSocialDiscoveryBoostAction");
    expect(menu).toContain("socialDiscoveryBoostedAt");
  });

  it("admin service patches boost + clears Home feed caches only", () => {
    const svc = read("src/api/services/adminSocialDiscovery.ts");
    expect(svc).toContain("set_post_social_discovery_boost");
    expect(svc).toContain("social_discovery_boosted_at");
    expect(svc).toContain("clearAllPersistedHomeFeeds");
    expect(svc).toContain("clearFeedCache");
    expect(svc).toContain("emitPostChanged");
    expect(svc).not.toContain("clearPersistedProfilePosts");
  });
});
