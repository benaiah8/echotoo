import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseUsageKpis } from "../api/services/usageKpis";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const SQL = "supabase/migrations/20261123120000_usage_kpis.sql";

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`FUNCTION public.${name}`);
  expect(start).toBeGreaterThan(-1);
  const next = sql.indexOf("COMMENT ON FUNCTION public.", start);
  expect(next).toBeGreaterThan(start);
  return sql.slice(start, next);
}

describe("usage KPI migration", () => {
  const sql = read(SQL).replace(/\r\n/g, "\n");

  it("adds rollup tables and both RPCs without product DDL", () => {
    expect(sql).toContain("CREATE TABLE public.usage_daily (");
    expect(sql).toContain("CREATE TABLE public.usage_daily_actors (");
    expect(sql).toContain("CREATE TABLE public.usage_ingest_dedupe (");
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.record_usage_events(p_events jsonb)"
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.get_usage_kpis(p_days integer)"
    );
    expect(sql).not.toMatch(/CREATE\s+TRIGGER/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(
      /ALTER\s+TABLE\s+public\.(comments|saved_posts|social_opportunities|open_plan_requests|group_up_requests|people_deck_seen)\b/i
    );
    expect(sql).not.toContain("CREATE POLICY");
  });

  it("blocks direct client table access", () => {
    expect(sql).toContain(
      "REVOKE ALL ON TABLE public.usage_daily FROM PUBLIC, anon, authenticated;"
    );
    expect(sql).toContain(
      "REVOKE ALL ON TABLE public.usage_daily_actors FROM PUBLIC, anon, authenticated;"
    );
    expect(sql).toContain(
      "REVOKE ALL ON TABLE public.usage_ingest_dedupe FROM PUBLIC, anon, authenticated;"
    );
    expect(sql).toContain("ALTER TABLE public.usage_daily ENABLE ROW LEVEL SECURITY;");
    expect(sql).not.toMatch(
      /GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\s+ON\s+TABLE\s+public\.usage_/i
    );
  });

  it("ingests with an allowlist, a batch bound, a daily cap, and dedupe", () => {
    const body = functionBody(sql, "record_usage_events");
    expect(body).toContain("c_max_batch integer := 20");
    expect(body).toContain("c_daily_cap integer := 50");
    expect(body).toContain("v_uid uuid := auth.uid()");
    expect(body).toContain("RAISE EXCEPTION 'Not authenticated'");
    expect(body).toContain("RAISE EXCEPTION 'Too many events'");
    expect(body).toContain("k.key NOT IN ('metric', 'dedupe_id')");
    expect(body).toContain("INSERT INTO public.usage_daily (day, metric, event_count)");
    expect(body).toContain("ON CONFLICT (day, metric) DO UPDATE");
    expect(body).toContain("ON CONFLICT (day, metric, user_id) DO NOTHING");
    expect(body).toContain("'people_visit'");
    expect(body).toContain("'tab_discover'");
    expect(body).toContain("'tab_duo'");
    expect(body).toContain("'tab_plans'");
    expect(body).toContain("'tab_groups'");
    expect(body).toContain("'post_detail_open'");
    expect(body).toContain("'profile_view'");
    expect(body).toContain("'post_save'");
    expect(body).toContain("'post_unsave'");
    expect(body).toContain("WHERE d.user_id = v_uid");
    expect(body).toContain("AND d.dedupe_id = v_dedupe");
    expect(body).toContain("v_today_count >= c_daily_cap");
    expect(body).toContain(
      "PERFORM pg_advisory_xact_lock(hashtext('usage_kpis'), hashtext(v_uid::text))"
    );
    expect(body).toContain("(timezone('utc', now()))::date");
    expect(body).not.toContain("post_id");
    expect(body).not.toContain("profile_id");
  });

  it("dedupes by primary key lookup rather than an upsert conflict", () => {
    const body = functionBody(sql, "record_usage_events");
    expect(body).not.toContain("ON CONFLICT (user_id, dedupe_id)");
    expect(body).toContain("INSERT INTO public.usage_ingest_dedupe");
    expect(sql).toContain("PRIMARY KEY (user_id, dedupe_id)");
    expect(sql).toContain("Does not delete old rows");
    expect(sql).toContain("No DELETE in the ingest function");
  });

  it("reports through zero-arg is_report_reviewer and hides identifiers", () => {
    const body = functionBody(sql, "get_usage_kpis");
    expect(body).toContain("IF NOT public.is_report_reviewer() THEN");
    expect(body).not.toMatch(/is_report_reviewer\s*\(\s*[^)]/);
    expect(body).toContain("RAISE EXCEPTION 'Not authorized'");
    expect(body).toContain("p_days NOT IN (1, 7, 30)");
    expect(body).toContain("set_config('statement_timeout', '5000', true)");
    expect(body).toContain("FROM public.comments c");
    expect(body).toContain("FROM public.open_plan_requests r");
    expect(body).toContain("FROM public.group_up_requests r");
    expect(body).toContain("o.kind = 'pair_up'");
    expect(body).toContain("FROM public.saved_posts s");
    expect(body).toContain("'comments_created'");
    expect(body).toContain("'open_plan_requests_created'");
    expect(body).toContain("'group_up_requests_created'");
    expect(body).toContain("'duo_joins_created'");
    expect(body).toContain("'current_saves_created'");
    expect(body).toContain("count(DISTINCT a.user_id)");
    expect(body).not.toMatch(/jsonb_build_object\(\s*'user_id'/);
    expect(body).not.toContain("jsonb_agg");
    expect(body).not.toContain("post_id");
    expect(body).not.toContain("profile_id");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.get_usage_kpis(integer) FROM PUBLIC, anon;"
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_usage_kpis(integer) TO authenticated;"
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.record_usage_events(jsonb) FROM PUBLIC, anon;"
    );
    expect(sql).not.toContain(
      "GRANT EXECUTE ON FUNCTION public.record_usage_events(jsonb) TO anon"
    );
  });
});

describe("usage admin access", () => {
  it("gates the route and the page on the reviewer allowlist", () => {
    const paths = read("src/router/Paths.ts");
    const router = read("src/router/AppRouter.tsx");
    const landing = read("src/pages/internal/InternalLandingPage.tsx");
    const page = read("src/pages/internal/UsageAnalyticsPage.tsx");
    const service = read("src/api/services/usageKpis.ts");

    expect(paths).toContain('internalUsage: "/internal/usage"');
    expect(router).toContain("path={Paths.internalUsage}");
    expect(router).toMatch(
      /path=\{Paths\.internalUsage\}[\s\S]*<RequireAuthRoute>[\s\S]*<UsageAnalyticsPage \/>/
    );
    expect(landing).toContain("navigate(Paths.internalUsage)");
    expect(landing).toContain("Usage");

    expect(page).toContain("getCurrentUserIsReportReviewer()");
    expect(page).toContain("allowlisted reviewers");
    expect(page).toContain("Today");
    expect(page).toContain("7 days");
    expect(page).toContain("30 days");
    expect(page).toContain("People");
    expect(page).toContain("Discover");
    expect(page).toContain("Duo");
    expect(page).toContain("Plans");
    expect(page).toContain("Groups");
    expect(page).toContain("Post details");
    expect(page).toContain("Successful save operations");
    expect(page).toContain("Pair-up matches completed (Duo + Discover)");
    expect(page).toContain("Profile views");
    expect(page).toContain("Comments");
    expect(page).toContain("Open Plan requests");
    expect(page).toContain("Group Up requests");
    expect(page).toContain("Duo joins");
    expect(page).toContain("Current saves");
    expect(page).toContain(
      "Counts reflect activity recorded by tracking-enabled app"
    );
    expect(page).not.toContain("until usage tracking ships");
    expect(page).not.toContain("record_usage_events");
    expect(page).not.toContain("user_id");
    expect(page).not.toContain(".from(");

    expect(service).toContain('supabase.rpc("get_usage_kpis"');
    expect(service).not.toContain("record_usage_events");
    expect(service).not.toContain('.from("usage_');
  });
});

describe("parseUsageKpis", () => {
  it("keeps counts and drops nothing that looks like an identifier field", () => {
    const parsed = parseUsageKpis(
      {
        window_days: 7,
        user_id: "should-not-surface",
        post_id: "should-not-surface",
        usage: {
          people_visit: { events: 2, actors: 1, user_id: "hidden" },
          tab_discover: { events: 0, actors: 0 },
        },
        product: {
          comments_created: 4,
          open_plan_requests_created: 1,
          group_up_requests_created: 3,
          duo_joins_created: 5,
          current_saves_created: 6,
          requester_id: "hidden",
        },
      },
      7
    );

    expect(parsed.windowDays).toBe(7);
    expect(parsed.usage.people_visit).toEqual({ events: 2, actors: 1 });
    expect(parsed.usage.tab_discover).toEqual({ events: 0, actors: 0 });
    expect(parsed.usage.tab_duo).toEqual({ events: 0, actors: 0 });
    expect(parsed.usage.post_save).toEqual({ events: 0, actors: 0 });
    expect(parsed.usage.profile_view).toEqual({ events: 0, actors: 0 });
    expect(parsed.product).toEqual({
      commentsCreated: 4,
      openPlanRequestsCreated: 1,
      groupUpRequestsCreated: 3,
      duoJoinsCreated: 5,
      currentSavesCreated: 6,
    });
    expect(JSON.stringify(parsed)).not.toContain("should-not-surface");
    expect(JSON.stringify(parsed)).not.toContain("hidden");
  });
});
