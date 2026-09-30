import { supabase } from "../../lib/supabaseClient";
import type {
  ClientCrashPlatform,
  ClientCrashReportRow,
  ClientCrashSourceFilter,
  ClientCrashStatus,
  ListClientCrashReportsFilters,
  ReportClientCrashInput,
} from "../../types/clientCrashReport";
import { matchesClientCrashSourceFilter } from "../../lib/clientCrashFilters";

const REPORT_SELECT =
  "id,fingerprint,first_seen_at,last_seen_at,occurrence_count,status,source,error_name,message,stack,component_stack,route,page_label,platform,app_version,app_build,runtime_summary,last_user_id,resolved_at,resolved_by_user_id,created_at";

/**
 * Fire-and-forget submit. Never throws — reporter must not crash the app.
 */
export async function reportClientCrash(
  input: ReportClientCrashInput
): Promise<void> {
  try {
    await supabase.rpc("report_client_crash", {
      p_source: input.source,
      p_error_name: input.error_name,
      p_message: input.message,
      p_stack: input.stack ?? null,
      p_component_stack: input.component_stack ?? null,
      p_route: input.route ?? null,
      p_page_label: input.page_label ?? null,
      p_platform: input.platform,
      p_app_version: input.app_version ?? null,
      p_app_build: input.app_build ?? null,
      p_runtime_summary: input.runtime_summary ?? null,
    });
  } catch {
    /* ignore */
  }
}

export async function listClientCrashReports(
  filters: ListClientCrashReportsFilters = {}
): Promise<ClientCrashReportRow[]> {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200);
  let query = supabase
    .from("client_crash_reports")
    .select(REPORT_SELECT)
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.platform && filters.platform !== "all") {
    query = query.eq("platform", filters.platform);
  }
  if (filters.source === "video_publish") {
    query = query.eq("source", "video_publish");
  } else if (filters.source === "app_crashes") {
    query = query.in("source", [
      "react_boundary",
      "window_error",
      "unhandled_rejection",
    ]);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as ClientCrashReportRow[];
  if (!filters.source || filters.source === "all") return rows;
  return rows.filter((r) =>
    matchesClientCrashSourceFilter(r.source, filters.source as ClientCrashSourceFilter)
  );
}

export async function setClientCrashReportStatus(
  reportId: string,
  status: ClientCrashStatus
): Promise<void> {
  const { error } = await supabase.rpc("set_client_crash_report_status", {
    p_report_id: reportId,
    p_status: status,
  });
  if (error) throw error;
}

export function isClientCrashStatus(value: string): value is ClientCrashStatus {
  return value === "open" || value === "resolved" || value === "ignored";
}

export function isClientCrashPlatform(
  value: string
): value is ClientCrashPlatform {
  return value === "web" || value === "android" || value === "ios";
}
