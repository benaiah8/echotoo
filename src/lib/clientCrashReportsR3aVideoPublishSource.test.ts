import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const BASELINE = "supabase/migrations/20260927120000_client_crash_reports.sql";
const STATUS_FIX =
  "supabase/migrations/20260927120100_fix_client_crash_status_reviewer_check.sql";
const R3A =
  "supabase/migrations/20261101120000_client_crash_reports_video_publish_source.sql";

describe("R3A client_crash_reports video_publish source (local migration)", () => {
  it("migration file exists and is the only crash source-extension migration", () => {
    const mig = read(R3A);
    expect(mig.length).toBeGreaterThan(500);
    expect(mig).toContain("LOCAL ONLY");
    expect(mig).toContain("video_publish");

    const all = readdirSync(join(process.cwd(), "supabase/migrations")).filter(
      (f) => f.endsWith(".sql") && f.includes("client_crash"),
    );
    expect(all.sort()).toEqual([
      "20260927120000_client_crash_reports.sql",
      "20260927120100_fix_client_crash_status_reviewer_check.sql",
      "20261101120000_client_crash_reports_video_publish_source.sql",
    ]);
  });

  it("1–4: source CHECK allows four sources including video_publish", () => {
    const baseline = read(BASELINE);
    const r3a = read(R3A);

    expect(baseline).toContain("client_crash_reports_source_check");
    expect(baseline).toMatch(
      /CHECK \(source = ANY \(ARRAY\[\s*'react_boundary'::text,\s*'window_error'::text,\s*'unhandled_rejection'::text\s*\]\)\)/,
    );
    expect(baseline).not.toContain("'video_publish'::text");

    expect(r3a).toContain("DROP CONSTRAINT IF EXISTS client_crash_reports_source_check");
    expect(r3a).toContain("ADD CONSTRAINT client_crash_reports_source_check");
    expect(r3a).toContain("'react_boundary'::text");
    expect(r3a).toContain("'window_error'::text");
    expect(r3a).toContain("'unhandled_rejection'::text");
    expect(r3a).toContain("'video_publish'::text");
  });

  it("5–6: RPC allowlist accepts video_publish; invalid still rejected", () => {
    const baseline = read(BASELINE);
    const r3a = read(R3A);

    expect(baseline).toContain(
      "IF v_source NOT IN ('react_boundary', 'window_error', 'unhandled_rejection') THEN",
    );
    expect(baseline).not.toMatch(
      /report_client_crash[\s\S]*video_publish/,
    );

    expect(r3a).toMatch(
      /IF v_source NOT IN \(\s*'react_boundary',\s*'window_error',\s*'unhandled_rejection',\s*'video_publish'\s*\) THEN/,
    );
    expect(r3a).toContain("RAISE EXCEPTION 'Invalid source'");
  });

  it("7: fingerprint SQL unchanged (still calls _client_crash_fingerprint)", () => {
    const baseline = read(BASELINE).replace(/\r\n/g, "\n");
    const r3a = read(R3A).replace(/\r\n/g, "\n");
    expect(baseline).toContain("public._client_crash_fingerprint(");
    expect(r3a).toContain("public._client_crash_fingerprint(");
    expect(r3a).toMatch(
      /v_fingerprint := public\._client_crash_fingerprint\(\s*v_source,\s*v_error_name,\s*v_message,\s*v_stack,\s*v_page_label\s*\)/,
    );
    expect(baseline).toMatch(
      /v_fingerprint := public\._client_crash_fingerprint\(\s*v_source,\s*v_error_name,\s*v_message,\s*v_stack,\s*v_page_label\s*\)/,
    );
    expect(r3a).not.toContain(
      "CREATE OR REPLACE FUNCTION public._client_crash_fingerprint",
    );
  });

  it("8–9: 30-second debounce and occurrence_count logic unchanged", () => {
    const baseline = read(BASELINE);
    const r3a = read(R3A);
    const debounce = `last_seen_at > (now() - interval '30 seconds')`;
    expect(baseline).toContain(debounce);
    expect(r3a).toContain(debounce);

    const occ = `occurrence_count = CASE
      WHEN public.client_crash_reports.last_seen_at > (now() - interval '30 seconds')
        THEN public.client_crash_reports.occurrence_count
      ELSE public.client_crash_reports.occurrence_count + 1
    END`;
    expect(baseline.replace(/\r\n/g, "\n")).toContain(occ);
    expect(r3a.replace(/\r\n/g, "\n")).toContain(occ);
  });

  it("10: runtime_summary handling unchanged (redact + left 200)", () => {
    const snippet = `v_runtime_summary := NULLIF(
    left(public._client_crash_redact(btrim(COALESCE(p_runtime_summary, ''))), 200),
    ''
  );`;
    expect(read(BASELINE).replace(/\r\n/g, "\n")).toContain(snippet);
    expect(read(R3A).replace(/\r\n/g, "\n")).toContain(snippet);
  });

  it("11: RLS not touched; grants preserved on report_client_crash", () => {
    const r3a = read(R3A);
    expect(r3a).not.toContain("ENABLE ROW LEVEL SECURITY");
    expect(r3a).not.toContain("CREATE POLICY");
    expect(r3a).not.toContain("DROP POLICY");
    expect(r3a).toContain(
      "GRANT EXECUTE ON FUNCTION public.report_client_crash",
    );
    expect(r3a).toContain("TO anon, authenticated");
    expect(r3a).toContain(
      "REVOKE ALL ON FUNCTION public.report_client_crash",
    );
  });

  it("12: no new columns / no table redesign", () => {
    const r3a = read(R3A);
    expect(r3a).not.toContain("ADD COLUMN");
    expect(r3a).not.toContain("CREATE TABLE");
    expect(r3a).not.toContain("ALTER COLUMN");
    expect(r3a).not.toContain("DROP COLUMN");
  });

  it("13: no frontend files changed by this pass (source audit)", () => {
    // R3A is SQL-only; types still lack video_publish until a later FE pass.
    const types = read("src/types/clientCrashReport.ts");
    expect(types).not.toContain("video_publish");
    expect(types).toContain("react_boundary");
  });

  it("later crash migration only fixed status RPC, not report_client_crash", () => {
    const fix = read(STATUS_FIX);
    expect(fix).toContain("set_client_crash_report_status");
    expect(fix).not.toContain("report_client_crash");
    expect(fix).not.toContain("client_crash_reports_source_check");
  });
});
