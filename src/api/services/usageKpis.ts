import { supabase } from "../../lib/supabaseClient";
import type {
  UsageKpiMetric,
  UsageKpis,
  UsageMetricCounts,
  UsageWindowDays,
} from "../../types/usageKpis";

const USAGE_METRICS: UsageKpiMetric[] = [
  "app_active",
  "people_visit",
  "tab_discover",
  "tab_duo",
  "tab_plans",
  "tab_groups",
  "duo_express",
  "duo_withdraw",
  "duo_complete",
  "post_detail_open",
  "profile_view",
  "post_save",
  "post_unsave",
];

function asCount(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  if (typeof raw === "string" && /^\d+$/.test(raw)) {
    return Number(raw);
  }
  return 0;
}

function asMetricCounts(raw: unknown): UsageMetricCounts {
  const rec =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    events: asCount(rec.events),
    actors: asCount(rec.actors),
  };
}

export function parseUsageKpis(
  raw: unknown,
  fallbackWindow: UsageWindowDays
): UsageKpis {
  const rec =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const windowRaw = asCount(rec.window_days);
  const windowDays: UsageWindowDays =
    windowRaw === 1 || windowRaw === 7 || windowRaw === 30
      ? windowRaw
      : fallbackWindow;
  const usageRaw =
    rec.usage && typeof rec.usage === "object"
      ? (rec.usage as Record<string, unknown>)
      : {};
  const productRaw =
    rec.product && typeof rec.product === "object"
      ? (rec.product as Record<string, unknown>)
      : {};

  const usage = {} as Record<UsageKpiMetric, UsageMetricCounts>;
  for (const metric of USAGE_METRICS) {
    usage[metric] = asMetricCounts(usageRaw[metric]);
  }

  return {
    windowDays,
    usage,
    product: {
      commentsCreated: asCount(productRaw.comments_created),
      openPlanRequestsCreated: asCount(productRaw.open_plan_requests_created),
      groupUpRequestsCreated: asCount(productRaw.group_up_requests_created),
      duoJoinsCreated: asCount(productRaw.duo_joins_created),
      currentSavesCreated: asCount(productRaw.current_saves_created),
    },
  };
}

export function assertUsageWindow(days: number): UsageWindowDays {
  if (days === 1 || days === 7 || days === 30) return days;
  throw new Error("Invalid usage window");
}

/**
 * Reviewer-only totals. The RPC returns counts, never actor or subject ids.
 */
export async function getUsageKpis(days: UsageWindowDays): Promise<UsageKpis> {
  const windowDays = assertUsageWindow(days);
  const { data, error } = await supabase.rpc("get_usage_kpis", {
    p_days: windowDays,
  });
  if (error) throw error;
  return parseUsageKpis(data, windowDays);
}
