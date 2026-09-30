export type ClientCrashStatus = "open" | "resolved" | "ignored";

export type ClientCrashSource =
  | "react_boundary"
  | "window_error"
  | "unhandled_rejection"
  | "video_publish";

/** Admin list filter groups — not a DB column. */
export type ClientCrashSourceFilter =
  | "all"
  | "app_crashes"
  | "video_publish";

export type ClientCrashPlatform = "web" | "android" | "ios";

export type ClientCrashReportRow = {
  id: string;
  fingerprint: string;
  first_seen_at: string;
  last_seen_at: string;
  occurrence_count: number;
  status: ClientCrashStatus;
  source: ClientCrashSource;
  error_name: string;
  message: string;
  stack: string | null;
  component_stack: string | null;
  route: string | null;
  page_label: string | null;
  platform: ClientCrashPlatform;
  app_version: string | null;
  app_build: string | null;
  runtime_summary: string | null;
  last_user_id: string | null;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  created_at: string;
};

export type ReportClientCrashInput = {
  source: ClientCrashSource;
  error_name: string;
  message: string;
  stack?: string | null;
  component_stack?: string | null;
  route?: string | null;
  page_label?: string | null;
  platform: ClientCrashPlatform;
  app_version?: string | null;
  app_build?: string | null;
  runtime_summary?: string | null;
};

export type ListClientCrashReportsFilters = {
  status?: ClientCrashStatus | "all";
  platform?: ClientCrashPlatform | "all";
  source?: ClientCrashSourceFilter;
  limit?: number;
};
