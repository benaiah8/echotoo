import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import PrimaryPageContainer from "../../components/container/PrimaryPageContainer";
import { getCurrentUserIsReportReviewer } from "../../api/services/reportReview";
import {
  listAppUpdateConfig,
  updateAppUpdateConfig,
  validateAppUpdateConfigSave,
  type AppUpdateConfigSaveInput,
} from "../../api/services/appUpdateConfig";
import {
  APP_UPDATE_MODES,
  coerceAppUpdateMode,
  type AppUpdatePlatform,
  type AppUpdateConfigRow,
} from "../../types/appUpdateConfig";
import { showErrorToast, getErrorMessage } from "../../lib/errorHandling";
import {
  configFormToPreviewRow,
  previewModalTitle,
  previewModalMessage,
  previewStoreUrlForPlatform,
} from "../../lib/internalAppUpdatePreview";
import SoftUpdateModal from "../../components/ui/SoftUpdateModal";
import HardUpdateModal from "../../components/ui/HardUpdateModal";
import { Paths } from "../../router/Paths";
import { PiInfo } from "react-icons/pi";
import AppUpdatesHelpModal from "./AppUpdatesHelpModal";

const PLATFORMS: AppUpdatePlatform[] = ["android", "ios"];

function rowToForm(row: AppUpdateConfigRow): AppUpdateConfigSaveInput {
  return {
    latest_version: row.latest_version ?? "",
    latest_build: row.latest_build ?? "",
    minimum_supported_version: row.minimum_supported_version ?? "",
    minimum_supported_build: row.minimum_supported_build ?? "",
    update_mode: coerceAppUpdateMode(String(row.update_mode ?? "off")),
    title: row.title ?? "",
    message: row.message ?? "",
    android_store_url: row.android_store_url ?? "",
    ios_store_url: row.ios_store_url ?? "",
    is_active: !!row.is_active,
    store_release_ready: !!row.store_release_ready,
  };
}

function platformLabel(p: AppUpdatePlatform): string {
  return p === "android" ? "Android" : "iOS";
}

const inputClass =
  "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] app-light:bg-white px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text)]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40 disabled:opacity-50";

export default function AppUpdatesPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [forms, setForms] = useState<
    Partial<Record<AppUpdatePlatform, AppUpdateConfigSaveInput>>
  >({});
  const [selectedPlatform, setSelectedPlatform] =
    useState<AppUpdatePlatform>("android");
  const [savingPlatform, setSavingPlatform] = useState<AppUpdatePlatform | null>(
    null
  );
  const [previewSoftOpen, setPreviewSoftOpen] = useState(false);
  const [previewHardOpen, setPreviewHardOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
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
        console.error("[AppUpdatesPage] reviewer check", e);
        if (!cancelled) setAllowed(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadConfig = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) {
      setConfigLoading(true);
      setConfigError(null);
    }
    try {
      const rows = await listAppUpdateConfig();
      if (!mountedRef.current) return;
      const byPlatform = Object.fromEntries(
        rows.map((r) => [r.platform, r])
      ) as Partial<Record<AppUpdatePlatform, AppUpdateConfigRow>>;

      if (!byPlatform.android || !byPlatform.ios) {
        if (!silent) {
          setConfigError(
            "Configuration is incomplete: both android and ios rows must exist in app_update_config."
          );
          setForms({});
        }
        return;
      }

      setForms({
        android: rowToForm(byPlatform.android),
        ios: rowToForm(byPlatform.ios),
      });
    } catch (e) {
      console.error("[AppUpdatesPage] load config", e);
      if (!mountedRef.current) return;
      if (silent) {
        showErrorToast(e, "Saved, but could not refresh from server.");
      } else {
        setConfigError(
          getErrorMessage(e) ||
            "Could not load app update configuration. Check your connection and permissions."
        );
        setForms({});
      }
    } finally {
      if (mountedRef.current && !silent) setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    void loadConfig();
  }, [allowed, loadConfig]);

  const patchForm = (
    platform: AppUpdatePlatform,
    patch: Partial<AppUpdateConfigSaveInput>
  ) => {
    setForms((prev) => {
      const cur = prev[platform];
      if (!cur) return prev;
      return { ...prev, [platform]: { ...cur, ...patch } };
    });
  };

  const handleSave = async (platform: AppUpdatePlatform) => {
    const f = forms[platform];
    if (!f) return;
    const validationError = validateAppUpdateConfigSave(platform, f);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSavingPlatform(platform);
    try {
      await updateAppUpdateConfig(platform, f);
      toast.success("Saved");
      await loadConfig({ silent: true });
    } catch (e) {
      console.error("[AppUpdatesPage] save", e);
      showErrorToast(e, "Could not save.");
    } finally {
      setSavingPlatform(null);
    }
  };

  const busy = savingPlatform !== null;
  const f = forms[selectedPlatform];
  const previewRow = f ? configFormToPreviewRow(selectedPlatform, f) : null;
  const previewUpdateUrl = previewRow
    ? previewStoreUrlForPlatform(previewRow, selectedPlatform)
    : undefined;
  const canPreviewModal =
    !!f && (f.update_mode === "soft" || f.update_mode === "hard");

  const handlePreview = () => {
    if (!f || !canPreviewModal) return;
    if (f.update_mode === "soft") {
      setPreviewHardOpen(false);
      setPreviewSoftOpen(true);
    } else if (f.update_mode === "hard") {
      setPreviewSoftOpen(false);
      setPreviewHardOpen(true);
    }
  };

  return (
    <PrimaryPageContainer back topSafeArea>
      <div className="w-full max-w-[720px] mx-auto px-3 pt-4 pb-8">
        <div className="flex items-center gap-3 mb-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-xs font-semibold text-[var(--text)]/80 hover:text-[var(--text)] px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]"
          >
            Back
          </button>
          <div className="flex min-w-0 items-center gap-1.5">
            <h1 className="text-base font-semibold text-[var(--text)]">
              App updates
            </h1>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text)]/45 hover:text-[var(--text)]/85 hover:bg-[var(--surface-2)] active:opacity-80 touch-manipulation"
              aria-label="How app updates work"
              title="How app updates work"
            >
              <PiInfo className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
        <p className="text-[11px] text-[var(--text)]/60 mb-4">
          Internal tool —{" "}
          <span className="font-mono text-[10px]">{Paths.internalAppUpdates}</span>
        </p>

        {checking ? (
          <p className="text-sm text-[var(--text)]/70">Checking access…</p>
        ) : !allowed ? (
          <div
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text)]/85"
            role="status"
          >
            You don&apos;t have access to this page. App updates tools are only
            available to allowlisted reviewers.
          </div>
        ) : configLoading ? (
          <p className="text-sm text-[var(--text)]/70">Loading configuration…</p>
        ) : configError ? (
          <div
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text)]/85 space-y-3"
            role="alert"
          >
            <p className="font-medium text-[var(--text)]">Could not load config</p>
            <p className="text-[var(--text)]/80 leading-relaxed">{configError}</p>
            <button
              type="button"
              onClick={() => void loadConfig()}
              className="text-xs font-semibold text-[var(--text)]/90 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] app-light:bg-white hover:opacity-90 active:opacity-80 touch-manipulation"
            >
              Retry
            </button>
          </div>
        ) : f ? (
          <div className="flex flex-col">
            <div
              className="flex rounded-xl border border-[var(--border)] p-1 bg-[var(--bg)] app-light:bg-white/80 mb-1"
              role="tablist"
              aria-label="Platform"
            >
              {PLATFORMS.map((p) => {
                const selected = selectedPlatform === p;
                return (
                  <button
                    key={p}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    disabled={busy}
                    onClick={() => setSelectedPlatform(p)}
                    className={`flex-1 min-w-0 py-2.5 px-2 text-xs font-semibold rounded-lg transition-colors touch-manipulation disabled:opacity-50 ${
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
            <p className="text-[11px] text-[var(--text)]/50 mb-4 px-0.5">
              Editing{" "}
              <span className="font-medium text-[var(--text)]/70">
                {platformLabel(selectedPlatform)}
              </span>{" "}
              — targeting uses native build numbers (versionCode / CFBundleVersion).
            </p>

            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/90 p-4 text-[var(--text)] space-y-5">
              <div className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text)]/45">
                  Versions & builds
                </p>
                <p className="text-[10px] text-[var(--text)]/50 leading-snug">
                  Latest build = who should be offered the update. Minimum build =
                  who must update. Leave build blank only for legacy version-string
                  fallback.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[11px] font-medium text-[var(--text)]/70">
                      Latest version
                    </span>
                    <input
                      type="text"
                      value={f.latest_version}
                      onChange={(e) =>
                        patchForm(selectedPlatform, {
                          latest_version: e.target.value,
                        })
                      }
                      disabled={busy}
                      className={inputClass}
                      autoComplete="off"
                      placeholder="2.0"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium text-[var(--text)]/70">
                      Latest build
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={f.latest_build}
                      onChange={(e) =>
                        patchForm(selectedPlatform, {
                          latest_build: e.target.value,
                        })
                      }
                      disabled={busy}
                      className={inputClass}
                      autoComplete="off"
                      placeholder="11"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium text-[var(--text)]/70">
                      Minimum supported version
                    </span>
                    <input
                      type="text"
                      value={f.minimum_supported_version}
                      onChange={(e) =>
                        patchForm(selectedPlatform, {
                          minimum_supported_version: e.target.value,
                        })
                      }
                      disabled={busy}
                      className={inputClass}
                      autoComplete="off"
                      placeholder="1.0"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium text-[var(--text)]/70">
                      Minimum supported build
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={f.minimum_supported_build}
                      onChange={(e) =>
                        patchForm(selectedPlatform, {
                          minimum_supported_build: e.target.value,
                        })
                      }
                      disabled={busy}
                      className={inputClass}
                      autoComplete="off"
                      placeholder="10"
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-3 pt-1 border-t border-[var(--border)]/60">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text)]/45">
                  In-app prompt
                </p>
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--text)]/70">
                    Update mode
                  </span>
                  <select
                    value={f.update_mode}
                    disabled={busy}
                    onChange={(e) =>
                      patchForm(selectedPlatform, {
                        update_mode: e.target
                          .value as AppUpdateConfigSaveInput["update_mode"],
                      })
                    }
                    className={inputClass}
                  >
                    {APP_UPDATE_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[10px] text-[var(--text)]/45 leading-snug">
                    off: no enforcement · soft: optional latest (min still forces
                    hard) · hard: latest itself is mandatory
                  </span>
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--text)]/70">
                    Title
                  </span>
                  <input
                    type="text"
                    value={f.title}
                    onChange={(e) =>
                      patchForm(selectedPlatform, { title: e.target.value })
                    }
                    disabled={busy}
                    className={inputClass}
                    autoComplete="off"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--text)]/70">
                    Message
                  </span>
                  <textarea
                    value={f.message}
                    onChange={(e) =>
                      patchForm(selectedPlatform, { message: e.target.value })
                    }
                    disabled={busy}
                    rows={4}
                    className={`${inputClass} resize-y min-h-[5rem]`}
                  />
                </label>
              </div>

              <div className="space-y-3 pt-1 border-t border-[var(--border)]/60">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text)]/45">
                  Store
                </p>
                {selectedPlatform === "android" ? (
                  <label className="block">
                    <span className="text-[11px] font-medium text-[var(--text)]">
                      Google Play URL
                    </span>
                    <input
                      type="url"
                      value={f.android_store_url}
                      onChange={(e) =>
                        patchForm(selectedPlatform, {
                          android_store_url: e.target.value,
                        })
                      }
                      disabled={busy}
                      className={inputClass}
                      autoComplete="off"
                      placeholder="https://play.google.com/..."
                    />
                  </label>
                ) : (
                  <label className="block">
                    <span className="text-[11px] font-medium text-[var(--text)]">
                      App Store URL
                    </span>
                    <input
                      type="url"
                      value={f.ios_store_url}
                      onChange={(e) =>
                        patchForm(selectedPlatform, {
                          ios_store_url: e.target.value,
                        })
                      }
                      disabled={busy}
                      className={inputClass}
                      autoComplete="off"
                      placeholder="https://apps.apple.com/..."
                    />
                  </label>
                )}
                <label className="inline-flex items-start gap-2.5 cursor-pointer select-none touch-manipulation">
                  <input
                    type="checkbox"
                    checked={f.store_release_ready}
                    disabled={busy}
                    onChange={(e) =>
                      patchForm(selectedPlatform, {
                        store_release_ready: e.target.checked,
                      })
                    }
                    className="mt-0.5 h-4 w-4 rounded border-[var(--border)] text-[var(--brand)] focus:ring-[var(--brand)]/40 disabled:opacity-50"
                  />
                  <span className="text-sm text-[var(--text)]/85 leading-snug">
                    Store release ready
                    <span className="block text-[10px] text-[var(--text)]/50 font-normal">
                      Do not enable until this build is actually downloadable.
                      Hard prompts never lock users without a store URL.
                    </span>
                  </span>
                </label>
              </div>

              <div className="space-y-2 pt-1 border-t border-[var(--border)]/60">
                <label className="inline-flex items-center gap-2.5 cursor-pointer select-none touch-manipulation">
                  <input
                    type="checkbox"
                    checked={f.is_active}
                    disabled={busy}
                    onChange={(e) =>
                      patchForm(selectedPlatform, {
                        is_active: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-[var(--border)] text-[var(--brand)] focus:ring-[var(--brand)]/40 disabled:opacity-50"
                  />
                  <span className="text-sm text-[var(--text)]/85">
                    Config active
                  </span>
                </label>

                {f.update_mode === "off" ? (
                  <p className="text-[10px] text-[var(--text)]/50 leading-snug">
                    Mode off disables all update enforcement (including minimum).
                    Preview is disabled.
                  </p>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:justify-end">
                  <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
                    <button
                      type="button"
                      disabled={busy || !canPreviewModal}
                      title={
                        !canPreviewModal
                          ? "Set update mode to soft or hard to preview the modal"
                          : undefined
                      }
                      onClick={handlePreview}
                      className="flex-1 sm:flex-initial min-w-0 text-sm font-semibold text-[var(--text)] px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] hover:opacity-90 active:opacity-80 disabled:opacity-50 touch-manipulation min-h-[44px]"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleSave(selectedPlatform)}
                      className="flex-1 sm:flex-initial min-w-0 text-sm font-semibold text-[var(--text)] px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] app-light:bg-white hover:opacity-90 active:opacity-80 disabled:opacity-50 touch-manipulation min-h-[44px]"
                    >
                      {savingPlatform === selectedPlatform
                        ? "Saving…"
                        : `Save ${platformLabel(selectedPlatform)}`}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {previewRow ? (
              <>
                <SoftUpdateModal
                  open={previewSoftOpen}
                  onClose={() => setPreviewSoftOpen(false)}
                  title={previewModalTitle(previewRow, "soft")}
                  message={previewModalMessage(previewRow, "soft")}
                  updateUrl={previewUpdateUrl}
                />
                <HardUpdateModal
                  open={previewHardOpen}
                  title={previewModalTitle(previewRow, "hard")}
                  message={previewModalMessage(previewRow, "hard")}
                  updateUrl={previewUpdateUrl}
                  allowBackdropDismissForPreview
                  onClose={() => setPreviewHardOpen(false)}
                />
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      <AppUpdatesHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </PrimaryPageContainer>
  );
}
