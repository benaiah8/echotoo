import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PrimaryPageContainer from "../../components/container/PrimaryPageContainer";
import SoftUpdateModal from "../../components/ui/SoftUpdateModal";
import HardUpdateModal from "../../components/ui/HardUpdateModal";
import { getCurrentUserIsReportReviewer } from "../../api/services/reportReview";
import { listAppUpdateConfig } from "../../api/services/appUpdateConfig";
import type { AppUpdateConfigRow, AppUpdatePlatform } from "../../types/appUpdateConfig";
import {
  previewModalTitle,
  previewModalMessage,
  previewStoreUrlForPlatform,
} from "../../lib/internalAppUpdatePreview";
import { Paths } from "../../router/Paths";

const PLATFORMS: AppUpdatePlatform[] = ["android", "ios"];

function platformLabel(p: AppUpdatePlatform): string {
  return p === "android" ? "Android" : "iOS";
}

export default function InternalLandingPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [softUpdatePreviewOpen, setSoftUpdatePreviewOpen] = useState(false);
  const [hardUpdatePreviewOpen, setHardUpdatePreviewOpen] = useState(false);

  const [previewPlatform, setPreviewPlatform] =
    useState<AppUpdatePlatform>("android");
  const [previewConfigByPlatform, setPreviewConfigByPlatform] = useState<
    Partial<Record<AppUpdatePlatform, AppUpdateConfigRow>>
  >({});
  const [previewConfigLoading, setPreviewConfigLoading] = useState(false);
  const [previewConfigError, setPreviewConfigError] = useState<string | null>(
    null
  );

  const loadPreviewConfig = useCallback(async () => {
    setPreviewConfigLoading(true);
    setPreviewConfigError(null);
    try {
      const rows = await listAppUpdateConfig();
      const by = Object.fromEntries(rows.map((r) => [r.platform, r])) as Partial<
        Record<AppUpdatePlatform, AppUpdateConfigRow>
      >;
      setPreviewConfigByPlatform(by);
    } catch (e) {
      console.error("[InternalLandingPage] preview config", e);
      setPreviewConfigError("Could not load app update config.");
      setPreviewConfigByPlatform({});
    } finally {
      setPreviewConfigLoading(false);
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
        console.error("[InternalLandingPage] reviewer check", e);
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
    void loadPreviewConfig();
  }, [allowed, loadPreviewConfig]);

  const previewRow = previewConfigByPlatform[previewPlatform];
  const previewUpdateUrl = previewStoreUrlForPlatform(
    previewRow,
    previewPlatform
  );

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
            Internal tools
          </h1>
        </div>
        <p className="text-[11px] text-[var(--text)]/60 mb-4">
          <span className="font-mono text-[10px]">{Paths.internal}</span>
        </p>

        {checking ? (
          <p className="text-sm text-[var(--text)]/70">Checking access…</p>
        ) : !allowed ? (
          <div
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text)]/85"
            role="status"
          >
            You don&apos;t have access to this page. Internal tools are only
            available to allowlisted reviewers.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => navigate(Paths.internalReports)}
              className="w-full text-left rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/90 px-4 py-3 active:opacity-90 touch-manipulation"
            >
              <div className="text-sm font-semibold text-[var(--text)]">
                Reports
              </div>
              <div className="text-[11px] text-[var(--text)]/55 mt-0.5">
                Reviewer queue
              </div>
            </button>
            <button
              type="button"
              onClick={() => navigate(Paths.internalAppUpdates)}
              className="w-full text-left rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/90 px-4 py-3 active:opacity-90 touch-manipulation"
            >
              <div className="text-sm font-semibold text-[var(--text)]">
                App updates
              </div>
              <div className="text-[11px] text-[var(--text)]/55 mt-0.5">
                Platform config
              </div>
            </button>

            <div className="mt-5 pt-4 border-t border-[var(--border)]/50">
              <p className="text-[10px] font-medium text-[var(--text)]/45 uppercase tracking-wide mb-2">
                UI preview
              </p>

              <p className="text-[10px] text-[var(--text)]/50 mb-1.5">
                Preview platform
              </p>
              <div
                className="flex rounded-xl border border-[var(--border)] p-1 bg-[var(--bg)] app-light:bg-white/80 mb-2"
                role="tablist"
                aria-label="Preview platform"
              >
                {PLATFORMS.map((p) => {
                  const selected = previewPlatform === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setPreviewPlatform(p)}
                      className={`flex-1 min-w-0 py-2 px-2 text-xs font-semibold rounded-lg transition-colors touch-manipulation ${
                        selected
                          ? "bg-[var(--surface-2)] text-[var(--text)] shadow-sm border border-[var(--border)]/80"
                          : "text-[var(--text)]/55 hover:text-[var(--text)]/85"
                      }`}
                    >
                      {platformLabel(p)}
                    </button>
                  );
                })}
              </div>

              {previewConfigLoading ? (
                <p className="text-[11px] text-[var(--text)]/55 mb-2">
                  Loading config…
                </p>
              ) : previewConfigError ? (
                <p className="text-[11px] text-amber-600/90 app-dark:text-amber-400/90 mb-2">
                  {previewConfigError} Preview uses fallback copy.
                </p>
              ) : previewRow ? (
                <p className="text-[10px] text-[var(--text)]/50 mb-2 leading-snug">
                  Config: {previewRow.update_mode} · latest{" "}
                  {previewRow.latest_version?.trim() || "—"} · min{" "}
                  {previewRow.minimum_supported_version?.trim() || "—"}
                  {!previewRow.is_active ? " · inactive" : ""}
                </p>
              ) : (
                <p className="text-[11px] text-[var(--text)]/50 mb-2">
                  No row for this platform — preview uses fallbacks.
                </p>
              )}

              <button
                type="button"
                onClick={() => setSoftUpdatePreviewOpen(true)}
                disabled={previewConfigLoading}
                className="w-full text-left rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)]/50 app-light:bg-white/40 px-4 py-3 text-sm font-medium text-[var(--text)]/80 active:opacity-90 touch-manipulation disabled:opacity-50"
              >
                Preview soft update modal
              </button>
              <button
                type="button"
                onClick={() => setHardUpdatePreviewOpen(true)}
                disabled={previewConfigLoading}
                className="w-full text-left rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)]/50 app-light:bg-white/40 px-4 py-3 text-sm font-medium text-[var(--text)]/80 active:opacity-90 touch-manipulation disabled:opacity-50 mt-2"
              >
                Preview hard update modal
              </button>
            </div>

            <SoftUpdateModal
              open={softUpdatePreviewOpen}
              onClose={() => setSoftUpdatePreviewOpen(false)}
              title={previewModalTitle(previewRow, "soft")}
              message={previewModalMessage(previewRow, "soft")}
              updateUrl={previewUpdateUrl}
            />
            <HardUpdateModal
              open={hardUpdatePreviewOpen}
              title={previewModalTitle(previewRow, "hard")}
              message={previewModalMessage(previewRow, "hard")}
              updateUrl={previewUpdateUrl}
              allowBackdropDismissForPreview
              onClose={() => setHardUpdatePreviewOpen(false)}
            />
          </div>
        )}
      </div>
    </PrimaryPageContainer>
  );
}
