import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import PrimaryPageContainer from "../../components/container/PrimaryPageContainer";
import {
  getCurrentUserIsReportReviewer,
  listReportsForReview,
  updateReportQueueStatus,
} from "../../api/services/reportReview";
import type { ReportQueueRow, ReportQueueStatus } from "../../types/reportReview";
import { showErrorToast } from "../../lib/errorHandling";
import { navigateToPostDetailInApp } from "../../lib/navigateToPostDetailInApp";
import { Paths, postDetailPath } from "../../router/Paths";

const STATUS_OPTIONS: ReportQueueStatus[] = ["open", "triaged", "closed"];

export default function ReportsReviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [rows, setRows] = useState<ReportQueueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listReportsForReview(100);
      setRows(data);
    } catch (e) {
      console.error("[ReportsReviewPage]", e);
      showErrorToast(e, "Could not load reports.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setChecking(true);
      try {
        const ok = await getCurrentUserIsReportReviewer();
        if (cancelled) return;
        setAllowed(ok);
        if (ok) await loadReports();
      } catch (e) {
        console.error("[ReportsReviewPage] reviewer check", e);
        if (!cancelled) setAllowed(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadReports]);

  const onStatusChange = async (reportId: string, status: ReportQueueStatus) => {
    if (!STATUS_OPTIONS.includes(status)) return;
    setUpdatingId(reportId);
    try {
      await updateReportQueueStatus(reportId, status);
      await loadReports();
      toast.success("Status updated");
    } catch (e) {
      console.error("[ReportsReviewPage] status update", e);
      showErrorToast(e, "Could not update status.");
    } finally {
      setUpdatingId(null);
    }
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
            Reports
          </h1>
        </div>
        <p className="text-[11px] text-[var(--text)]/60 mb-4">
          Reviewer queue —{" "}
          <span className="font-mono text-[10px]">{Paths.internalReports}</span>
        </p>

        {checking ? (
          <p className="text-sm text-[var(--text)]/70">Checking access…</p>
        ) : !allowed ? (
          <div
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text)]/85"
            role="status"
          >
            You don&apos;t have access to this page. Reports are only visible to
            allowlisted reviewers.
          </div>
        ) : loading ? (
          <p className="text-sm text-[var(--text)]/70">Loading reports…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--text)]/70">No reports yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => {
              const postType =
                r.post_type === "experience" || r.post_type === "hangout"
                  ? r.post_type
                  : null;
              const postDetailHref =
                r.report_kind === "post" &&
                r.target_post_id &&
                postType
                  ? postDetailPath(postType, r.target_post_id)
                  : null;
              return (
                <li
                  key={r.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/90 p-3 text-xs text-[var(--text)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="font-semibold uppercase tracking-wide text-[10px] text-[var(--text)]/80">
                      {r.report_kind}
                    </span>
                    <span className="text-[10px] text-[var(--text)]/55 tabular-nums">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-[11px] leading-relaxed">
                    <div>
                      <span className="text-[var(--text)]/55">Reason: </span>
                      {r.reason}
                    </div>
                    {r.details ? (
                      <div>
                        <span className="text-[var(--text)]/55">Details: </span>
                        <span className="whitespace-pre-wrap break-words">
                          {r.details}
                        </span>
                      </div>
                    ) : null}
                    <div className="font-mono text-[10px] break-all space-y-0.5">
                      <div>
                        <span className="text-[var(--text)]/55">post: </span>
                        {postDetailHref ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!postType || !r.target_post_id) return;
                              navigateToPostDetailInApp(
                                navigate,
                                location,
                                postType,
                                r.target_post_id
                              );
                            }}
                            className="font-mono text-[10px] text-left text-[var(--brand)] underline decoration-[var(--brand)]/35 underline-offset-2 hover:opacity-90 active:opacity-80 break-all touch-manipulation"
                          >
                            {r.target_post_id}
                          </button>
                        ) : (
                          (r.target_post_id ?? "—")
                        )}
                      </div>
                      <div>
                        <span className="text-[var(--text)]/55">profile: </span>
                        {r.target_profile_id ?? "—"}
                      </div>
                      <div>
                        <span className="text-[var(--text)]/55">
                          target_owner_user_id:{" "}
                        </span>
                        {r.target_owner_user_id ?? "—"}
                      </div>
                      <div>
                        <span className="text-[var(--text)]/55">reporter: </span>
                        {r.reporter_user_id}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="text-[10px] text-[var(--text)]/55 shrink-0">
                      Status
                    </label>
                    <select
                      className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] app-light:bg-white px-2 py-1.5 text-[11px] text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40 disabled:opacity-50"
                      value={r.status}
                      disabled={updatingId === r.id}
                      onChange={(e) =>
                        void onStatusChange(
                          r.id,
                          e.target.value as ReportQueueStatus
                        )
                      }
                    >
                      {Array.from(
                        new Set([r.status, ...STATUS_OPTIONS] as string[])
                      ).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PrimaryPageContainer>
  );
}
