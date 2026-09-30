import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import PrimaryPageContainer from "../../components/container/PrimaryPageContainer";
import BottomDrawer from "../../components/ui/BottomDrawer";
import { getCurrentUserIsReportReviewer } from "../../api/services/reportReview";
import {
  listClientCrashReports,
  setClientCrashReportStatus,
} from "../../api/services/clientCrashReports";
import {
  clientCrashSourceDisplayLabel,
  clientCrashSourceFilterLabel,
  matchesClientCrashSourceFilter,
} from "../../lib/clientCrashFilters";
import { showErrorToast } from "../../lib/errorHandling";
import { Paths } from "../../router/Paths";
import type {
  ClientCrashPlatform,
  ClientCrashReportRow,
  ClientCrashSourceFilter,
  ClientCrashStatus,
} from "../../types/clientCrashReport";

const STATUS_FILTERS: Array<ClientCrashStatus | "all"> = [
  "open",
  "resolved",
  "ignored",
  "all",
];

const PLATFORM_FILTERS: Array<ClientCrashPlatform | "all"> = [
  "all",
  "android",
  "ios",
  "web",
];

const SOURCE_FILTERS: ClientCrashSourceFilter[] = [
  "all",
  "app_crashes",
  "video_publish",
];

function statusLabel(status: ClientCrashStatus | "all"): string {
  if (status === "all") return "All";
  if (status === "open") return "Open";
  if (status === "resolved") return "Resolved";
  return "Ignored";
}

function platformLabel(platform: ClientCrashPlatform | "all"): string {
  if (platform === "all") return "All";
  if (platform === "android") return "Android";
  if (platform === "ios") return "iOS";
  return "Web";
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function shortMessage(message: string): string {
  const t = message.trim();
  if (t.length <= 90) return t;
  return `${t.slice(0, 87)}…`;
}

function matchesFilters(
  row: ClientCrashReportRow,
  status: ClientCrashStatus | "all",
  platform: ClientCrashPlatform | "all",
  source: ClientCrashSourceFilter
): boolean {
  if (status !== "all" && row.status !== status) return false;
  if (platform !== "all" && row.platform !== platform) return false;
  if (!matchesClientCrashSourceFilter(row.source, source)) return false;
  return true;
}

function buildCopyText(row: ClientCrashReportRow): string {
  const isVideo = row.source === "video_publish";
  return [
    `EchoToo crash report`,
    `status: ${row.status}`,
    `source: ${clientCrashSourceDisplayLabel(row.source)}`,
    ...(isVideo
      ? [`stage: ${row.error_name}`, `code: ${row.message}`]
      : [`error: ${row.error_name}`, `message: ${row.message}`]),
    `platform: ${row.platform}`,
    `page: ${row.page_label ?? "—"}`,
    `route: ${row.route ?? "—"}`,
    `app: ${row.app_version ?? "—"} (${row.app_build ?? "—"})`,
    `count: ${row.occurrence_count}`,
    `first: ${row.first_seen_at}`,
    `last: ${row.last_seen_at}`,
    `runtime: ${row.runtime_summary ?? "(none)"}`,
    ...(isVideo
      ? []
      : [
          ``,
          `stack:`,
          row.stack ?? "(none)",
          ``,
          `component stack:`,
          row.component_stack ?? "(none)",
        ]),
  ].join("\n");
}

const chipBase =
  "flex-1 min-w-0 py-2 px-2 text-xs font-semibold rounded-lg transition-colors touch-manipulation";
const chipOn =
  "bg-[var(--surface-2)] text-[var(--text)] shadow-sm border border-[var(--border)]/80";
const chipOff = "text-[var(--text)]/55 hover:text-[var(--text)]/85";

export default function CrashReportsPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ClientCrashStatus | "all">(
    "open"
  );
  const [platformFilter, setPlatformFilter] = useState<
    ClientCrashPlatform | "all"
  >("all");
  const [sourceFilter, setSourceFilter] =
    useState<ClientCrashSourceFilter>("all");
  const [rows, setRows] = useState<ClientCrashReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ClientCrashReportRow | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listClientCrashReports({
        status: statusFilter,
        platform: platformFilter,
        source: sourceFilter,
        limit: 100,
      });
      setRows(data);
    } catch (e) {
      console.error("[CrashReportsPage]", e);
      showErrorToast(e, "Could not load crash reports.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, platformFilter, sourceFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setChecking(true);
      try {
        const ok = await getCurrentUserIsReportReviewer();
        if (cancelled) return;
        setAllowed(ok);
      } catch (e) {
        console.error("[CrashReportsPage] reviewer check", e);
        if (!cancelled) setAllowed(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!allowed) return;
    void loadRows();
  }, [allowed, loadRows]);

  const selectedLive = useMemo(() => {
    if (!selected) return null;
    return rows.find((r) => r.id === selected.id) ?? selected;
  }, [rows, selected]);

  const applyStatus = async (
    row: ClientCrashReportRow,
    status: ClientCrashStatus
  ) => {
    if (updatingId) return;
    setUpdatingId(row.id);
    try {
      await setClientCrashReportStatus(row.id, status);
      const next: ClientCrashReportRow = {
        ...row,
        status,
        resolved_at:
          status === "open" ? null : new Date().toISOString(),
        resolved_by_user_id: status === "open" ? null : row.resolved_by_user_id,
      };
      const keep = matchesFilters(
        next,
        statusFilter,
        platformFilter,
        sourceFilter
      );
      setRows((prev) => {
        if (!keep) return prev.filter((r) => r.id !== row.id);
        return prev.map((r) => (r.id === row.id ? next : r));
      });
      if (!keep) setSelected(null);
      else setSelected(next);
      toast.success(`Marked ${statusLabel(status).toLowerCase()}`);
    } catch (e) {
      console.error("[CrashReportsPage] status", e);
      showErrorToast(e, "Could not update crash status.");
    } finally {
      setUpdatingId(null);
    }
  };

  const copyReport = async (row: ClientCrashReportRow) => {
    try {
      await navigator.clipboard.writeText(buildCopyText(row));
      toast.success("Report copied");
    } catch {
      toast.error("Could not copy report.");
    }
  };

  const statusActions = (row: ClientCrashReportRow) => {
    const busy = updatingId === row.id;
    const btn =
      "rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[11px] font-semibold text-[var(--text)] disabled:opacity-50 touch-manipulation";
    if (row.status === "open") {
      return (
        <>
          <button
            type="button"
            className={btn}
            disabled={busy}
            onClick={() => void applyStatus(row, "resolved")}
          >
            Mark resolved
          </button>
          <button
            type="button"
            className={btn}
            disabled={busy}
            onClick={() => void applyStatus(row, "ignored")}
          >
            Ignore
          </button>
        </>
      );
    }
    if (row.status === "resolved") {
      return (
        <>
          <button
            type="button"
            className={btn}
            disabled={busy}
            onClick={() => void applyStatus(row, "open")}
          >
            Reopen
          </button>
          <button
            type="button"
            className={btn}
            disabled={busy}
            onClick={() => void applyStatus(row, "ignored")}
          >
            Ignore
          </button>
        </>
      );
    }
    return (
      <button
        type="button"
        className={btn}
        disabled={busy}
        onClick={() => void applyStatus(row, "open")}
      >
        Reopen
      </button>
    );
  };

  return (
    <PrimaryPageContainer back topSafeArea>
      <div className="w-full max-w-[720px] mx-auto px-3 pt-4 pb-8">
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-xs font-semibold text-[var(--text)]/80 hover:text-[var(--text)] px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]"
          >
            Back
          </button>
          <h1 className="text-base font-semibold text-[var(--text)]">
            Crash Reports
          </h1>
        </div>
        <p className="text-[11px] text-[var(--text)]/60 mb-4">
          Reviewer route —{" "}
          <span className="font-mono text-[10px]">
            {Paths.internalCrashReports}
          </span>
        </p>

        {checking ? (
          <p className="text-sm text-[var(--text)]/70">Checking access…</p>
        ) : !allowed ? (
          <div
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text)]/85"
            role="status"
          >
            You don&apos;t have access to this page. Crash reports are only
            visible to allowlisted reviewers.
          </div>
        ) : (
          <>
            <p className="text-[10px] font-medium text-[var(--text)]/45 uppercase tracking-wide mb-1.5">
              Status
            </p>
            <div
              className="flex rounded-xl border border-[var(--border)] p-1 bg-[var(--bg)] app-light:bg-white/80 mb-3"
              role="tablist"
              aria-label="Status filter"
            >
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === s}
                  onClick={() => setStatusFilter(s)}
                  className={`${chipBase} ${
                    statusFilter === s ? chipOn : chipOff
                  }`}
                >
                  {statusLabel(s)}
                </button>
              ))}
            </div>

            <p className="text-[10px] font-medium text-[var(--text)]/45 uppercase tracking-wide mb-1.5">
              Source
            </p>
            <div
              className="flex rounded-xl border border-[var(--border)] p-1 bg-[var(--bg)] app-light:bg-white/80 mb-3"
              role="tablist"
              aria-label="Source filter"
            >
              {SOURCE_FILTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={sourceFilter === s}
                  onClick={() => setSourceFilter(s)}
                  className={`${chipBase} ${
                    sourceFilter === s ? chipOn : chipOff
                  }`}
                >
                  {clientCrashSourceFilterLabel(s)}
                </button>
              ))}
            </div>

            <p className="text-[10px] font-medium text-[var(--text)]/45 uppercase tracking-wide mb-1.5">
              Platform
            </p>
            <div
              className="flex rounded-xl border border-[var(--border)] p-1 bg-[var(--bg)] app-light:bg-white/80 mb-4"
              role="tablist"
              aria-label="Platform filter"
            >
              {PLATFORM_FILTERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={platformFilter === p}
                  onClick={() => setPlatformFilter(p)}
                  className={`${chipBase} ${
                    platformFilter === p ? chipOn : chipOff
                  }`}
                >
                  {platformLabel(p)}
                </button>
              ))}
            </div>

            {loading ? (
              <p className="text-sm text-[var(--text)]/70">
                Loading crash reports…
              </p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-[var(--text)]/70">
                No crash reports.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {rows.map((r) => {
                  const isVideo = r.source === "video_publish";
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(r)}
                        className="w-full text-left rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/90 p-3 text-xs text-[var(--text)] active:opacity-90 touch-manipulation"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <span className="font-semibold text-[12px]">
                            {isVideo
                              ? "Video publish"
                              : r.page_label || "Other"}
                          </span>
                          <span className="text-[10px] text-[var(--text)]/55 tabular-nums">
                            {formatWhen(r.last_seen_at)}
                          </span>
                        </div>
                        {isVideo ? (
                          <>
                            <div className="text-[11px] font-medium">
                              Stage: {r.error_name}
                            </div>
                            <div className="text-[11px] text-[var(--text)]/70 mt-0.5 break-words">
                              Code: {shortMessage(r.message)}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-[11px] font-medium">
                              {r.error_name}
                            </div>
                            <div className="text-[11px] text-[var(--text)]/70 mt-0.5 break-words">
                              {shortMessage(r.message)}
                            </div>
                          </>
                        )}
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--text)]/55">
                          <span>{platformLabel(r.platform)}</span>
                          <span>{r.app_version?.trim() || "—"}</span>
                          <span>×{r.occurrence_count}</span>
                          <span className="uppercase tracking-wide">
                            {r.status}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>

      <BottomDrawer
        open={!!selectedLive}
        onClose={() => setSelected(null)}
        title={
          selectedLive?.source === "video_publish"
            ? "Video publish detail"
            : "Crash detail"
        }
        shrinkSheetToContent
        maxHeight="88vh"
        footer={
          selectedLive ? (
            <div className="flex flex-wrap gap-2">
              {statusActions(selectedLive)}
              <button
                type="button"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[11px] font-semibold text-[var(--text)] touch-manipulation"
                onClick={() => void copyReport(selectedLive)}
              >
                Copy report
              </button>
            </div>
          ) : null
        }
      >
        {selectedLive ? (
          selectedLive.source === "video_publish" ? (
            <div className="text-[11px] text-[var(--text)] space-y-2">
              <DetailRow
                label="Source"
                value={clientCrashSourceDisplayLabel(selectedLive.source)}
              />
              <DetailRow label="Stage" value={selectedLive.error_name} />
              <DetailRow label="Error code" value={selectedLive.message} />
              <DetailRow
                label="Runtime summary"
                value={selectedLive.runtime_summary ?? "—"}
                mono
              />
              <DetailRow label="Page" value={selectedLive.page_label ?? "—"} />
              <DetailRow
                label="Platform"
                value={platformLabel(selectedLive.platform)}
              />
              <DetailRow
                label="App"
                value={`${selectedLive.app_version ?? "—"} / ${
                  selectedLive.app_build ?? "—"
                }`}
              />
              <DetailRow
                label="First seen"
                value={formatWhen(selectedLive.first_seen_at)}
              />
              <DetailRow
                label="Last seen"
                value={formatWhen(selectedLive.last_seen_at)}
              />
              <DetailRow
                label="Count"
                value={String(selectedLive.occurrence_count)}
              />
              {selectedLive.last_user_id ? (
                <DetailRow
                  label="Last user"
                  value={selectedLive.last_user_id}
                  mono
                />
              ) : null}
            </div>
          ) : (
            <div className="text-[11px] text-[var(--text)] space-y-2">
              <DetailRow label="Error" value={selectedLive.error_name} />
              <DetailRow label="Message" value={selectedLive.message} />
              <DetailRow label="Page" value={selectedLive.page_label ?? "—"} />
              <DetailRow label="Route" value={selectedLive.route ?? "—"} mono />
              <DetailRow
                label="Source"
                value={clientCrashSourceDisplayLabel(selectedLive.source)}
              />
              <DetailRow
                label="Platform"
                value={platformLabel(selectedLive.platform)}
              />
              <DetailRow
                label="App"
                value={`${selectedLive.app_version ?? "—"} / ${
                  selectedLive.app_build ?? "—"
                }`}
              />
              <DetailRow
                label="First seen"
                value={formatWhen(selectedLive.first_seen_at)}
              />
              <DetailRow
                label="Last seen"
                value={formatWhen(selectedLive.last_seen_at)}
              />
              <DetailRow
                label="Count"
                value={String(selectedLive.occurrence_count)}
              />
              <div>
                <div className="text-[var(--text)]/55 mb-1">Stack</div>
                <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-snug rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 max-h-48 overflow-y-auto">
                  {selectedLive.stack || "(none)"}
                </pre>
              </div>
              <div>
                <div className="text-[var(--text)]/55 mb-1">Component stack</div>
                <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-snug rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 max-h-36 overflow-y-auto">
                  {selectedLive.component_stack || "(none)"}
                </pre>
              </div>
            </div>
          )
        ) : null}
      </BottomDrawer>
    </PrimaryPageContainer>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="text-[var(--text)]/55">{label}: </span>
      <span className={mono ? "font-mono break-all" : "break-words"}>
        {value}
      </span>
    </div>
  );
}
