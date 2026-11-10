import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PrimaryPageContainer from "../../components/container/PrimaryPageContainer";
import { getCurrentUserIsReportReviewer } from "../../api/services/reportReview";
import { getUsageKpis } from "../../api/services/usageKpis";
import { showErrorToast } from "../../lib/errorHandling";
import { Paths } from "../../router/Paths";
import type {
  UsageKpis,
  UsageWindowDays,
} from "../../types/usageKpis";

const WINDOWS: Array<{ days: UsageWindowDays; label: string }> = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
];

function formatCount(value: number): string {
  return value.toLocaleString();
}

function CountCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/90 px-4 py-3">
      <div className="text-[11px] text-[var(--text)]/55">{label}</div>
      <div className="mt-1 text-lg font-semibold text-[var(--text)]">
        {formatCount(value)}
      </div>
      {detail ? (
        <div className="mt-0.5 text-[10px] text-[var(--text)]/45">{detail}</div>
      ) : null}
    </div>
  );
}

export default function UsageAnalyticsPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [windowDays, setWindowDays] = useState<UsageWindowDays>(7);
  const [loading, setLoading] = useState(false);
  const [kpis, setKpis] = useState<UsageKpis | null>(null);

  const load = useCallback(async (days: UsageWindowDays) => {
    setLoading(true);
    try {
      const data = await getUsageKpis(days);
      setKpis(data);
    } catch (e) {
      console.error("[UsageAnalyticsPage]", e);
      showErrorToast(e, "Could not load usage.");
      setKpis(null);
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
      } catch (e) {
        console.error("[UsageAnalyticsPage] reviewer check", e);
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
    void load(windowDays);
  }, [allowed, load, windowDays]);

  const usage = kpis?.usage;

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
          <h1 className="text-base font-semibold text-[var(--text)]">Usage</h1>
        </div>
        <p className="text-[11px] text-[var(--text)]/60 mb-4">
          Reviewer route —{" "}
          <span className="font-mono text-[10px]">{Paths.internalUsage}</span>
        </p>

        {checking ? (
          <p className="text-sm text-[var(--text)]/70">Checking access…</p>
        ) : !allowed ? (
          <div
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text)]/85"
            role="status"
          >
            You don&apos;t have access to this page. Usage is only visible to
            allowlisted reviewers.
          </div>
        ) : (
          <>
            <div
              className="flex rounded-xl border border-[var(--border)] p-1 bg-[var(--bg)] app-light:bg-white/80 mb-4"
              role="tablist"
              aria-label="Usage window"
            >
              {WINDOWS.map((w) => {
                const selected = windowDays === w.days;
                return (
                  <button
                    key={w.days}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setWindowDays(w.days)}
                    className={`flex-1 min-w-0 py-2 px-2 text-xs font-semibold rounded-lg transition-colors touch-manipulation ${
                      selected
                        ? "bg-[var(--surface-2)] text-[var(--text)] shadow-sm border border-[var(--border)]/80"
                        : "text-[var(--text)]/55 hover:text-[var(--text)]/85"
                    }`}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>

            {loading && !kpis ? (
              <p className="text-sm text-[var(--text)]/70">Loading usage…</p>
            ) : (
              <>
                <p className="text-[10px] font-medium text-[var(--text)]/45 uppercase tracking-wide mb-2">
                  Usage
                </p>
                <p className="text-[11px] text-[var(--text)]/55 mb-2">
                  Counts reflect activity recorded by tracking-enabled app
                  versions. Totals are events. The line under each number is
                  distinct people.
                </p>
                <div className="grid grid-cols-2 gap-2 mb-5">
                  <CountCard
                    label="People"
                    value={usage?.people_visit.events ?? 0}
                    detail={`${formatCount(usage?.people_visit.actors ?? 0)} people`}
                  />
                  <CountCard
                    label="Discover"
                    value={usage?.tab_discover.events ?? 0}
                    detail={`${formatCount(usage?.tab_discover.actors ?? 0)} people`}
                  />
                  <CountCard
                    label="Duo"
                    value={usage?.tab_duo.events ?? 0}
                    detail={`${formatCount(usage?.tab_duo.actors ?? 0)} people`}
                  />
                  <CountCard
                    label="Plans"
                    value={usage?.tab_plans.events ?? 0}
                    detail={`${formatCount(usage?.tab_plans.actors ?? 0)} people`}
                  />
                  <CountCard
                    label="Groups"
                    value={usage?.tab_groups.events ?? 0}
                    detail={`${formatCount(usage?.tab_groups.actors ?? 0)} people`}
                  />
                  <CountCard
                    label="Post details"
                    value={usage?.post_detail_open.events ?? 0}
                    detail={`${formatCount(usage?.post_detail_open.actors ?? 0)} people`}
                  />
                  <CountCard
                    label="Successful save operations"
                    value={usage?.post_save.events ?? 0}
                    detail={`${formatCount(usage?.post_save.actors ?? 0)} people`}
                  />
                  <CountCard
                    label="Unsaves"
                    value={usage?.post_unsave.events ?? 0}
                    detail={`${formatCount(usage?.post_unsave.actors ?? 0)} people`}
                  />
                  <CountCard
                    label="Profile views"
                    value={usage?.profile_view.events ?? 0}
                    detail={`${formatCount(usage?.profile_view.actors ?? 0)} people`}
                  />
                  <CountCard
                    label="Pair-up matches completed (Duo + Discover)"
                    value={usage?.duo_complete.events ?? 0}
                    detail={`${formatCount(usage?.duo_complete.actors ?? 0)} people`}
                  />
                </div>

                <p className="text-[10px] font-medium text-[var(--text)]/45 uppercase tracking-wide mb-2">
                  Existing records
                </p>
                <p className="text-[11px] text-[var(--text)]/55 mb-2">
                  Counted from records already stored. Current saves are rows
                  that are still saved.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <CountCard
                    label="Comments"
                    value={kpis?.product.commentsCreated ?? 0}
                  />
                  <CountCard
                    label="Open Plan requests"
                    value={kpis?.product.openPlanRequestsCreated ?? 0}
                  />
                  <CountCard
                    label="Group Up requests"
                    value={kpis?.product.groupUpRequestsCreated ?? 0}
                  />
                  <CountCard
                    label="Duo joins"
                    value={kpis?.product.duoJoinsCreated ?? 0}
                  />
                  <CountCard
                    label="Current saves"
                    value={kpis?.product.currentSavesCreated ?? 0}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </PrimaryPageContainer>
  );
}
