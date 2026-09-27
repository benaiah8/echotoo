import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import PrimaryPageContainer from "../../components/container/PrimaryPageContainer";
import { getCurrentUserIsReportReviewer } from "../../api/services/reportReview";
import {
  companyAnnouncementIsoToLocalInput,
  companyAnnouncementLocalInputToIso,
  createCompanyAnnouncementAdmin,
  listCompanyAnnouncementsAdmin,
  updateCompanyAnnouncementAdmin,
  validateCompanyAnnouncementAdminSave,
} from "../../api/services/companyAnnouncementsAdmin";
import type {
  CompanyAnnouncementAdminRow,
  CompanyAnnouncementAdminSaveInput,
} from "../../types/companyAnnouncement";
import { showErrorToast, getErrorMessage } from "../../lib/errorHandling";
import { Paths } from "../../router/Paths";

const emptyForm = (): CompanyAnnouncementAdminSaveInput & {
  startsLocal: string;
  expiresLocal: string;
} => ({
  title: "",
  message: "",
  is_active: false,
  starts_at: null,
  expires_at: null,
  startsLocal: "",
  expiresLocal: "",
});

function rowToForm(row: CompanyAnnouncementAdminRow) {
  return {
    title: row.title,
    message: row.message,
    is_active: row.is_active,
    starts_at: row.starts_at,
    expires_at: row.expires_at,
    startsLocal: companyAnnouncementIsoToLocalInput(row.starts_at),
    expiresLocal: companyAnnouncementIsoToLocalInput(row.expires_at),
  };
}

function formToSaveInput(form: ReturnType<typeof emptyForm>): CompanyAnnouncementAdminSaveInput {
  return {
    title: form.title,
    message: form.message,
    is_active: form.is_active,
    starts_at: companyAnnouncementLocalInputToIso(form.startsLocal),
    expires_at: companyAnnouncementLocalInputToIso(form.expiresLocal),
  };
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const inputClass =
  "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] app-light:bg-white px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text)]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40 disabled:opacity-50";

export default function CompanyAnnouncementsPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [rows, setRows] = useState<CompanyAnnouncementAdminRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listCompanyAnnouncementsAdmin(50);
      setRows(data);
    } catch (e) {
      console.error("[CompanyAnnouncementsPage]", e);
      showErrorToast(e, "Could not load company announcements.");
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
      } catch (e) {
        console.error("[CompanyAnnouncementsPage] reviewer check", e);
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

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const startEdit = (row: CompanyAnnouncementAdminRow) => {
    setEditingId(row.id);
    setForm(rowToForm(row));
  };

  const onSave = async () => {
    const input = formToSaveInput(form);
    const err = validateCompanyAnnouncementAdminSave(input);
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateCompanyAnnouncementAdmin(editingId, input);
        toast.success("Announcement updated");
      } else {
        await createCompanyAnnouncementAdmin(input);
        toast.success("Announcement created");
      }
      setForm(emptyForm());
      setEditingId(null);
      await loadRows();
    } catch (e) {
      showErrorToast(e, getErrorMessage(e) || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const onDeactivate = async (row: CompanyAnnouncementAdminRow) => {
    setSaving(true);
    try {
      await updateCompanyAnnouncementAdmin(row.id, {
        title: row.title,
        message: row.message,
        is_active: false,
        starts_at: row.starts_at,
        expires_at: row.expires_at,
      });
      toast.success("Stopped for all users");
      if (editingId === row.id) {
        setForm((f) => ({ ...f, is_active: false }));
      }
      await loadRows();
    } catch (e) {
      showErrorToast(e, "Could not stop announcement.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PrimaryPageContainer back topSafeArea>
      <div className="w-full max-w-[720px] mx-auto px-3 pt-4 pb-8">
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => navigate(Paths.internal)}
            className="text-xs font-semibold text-[var(--text)]/80 hover:text-[var(--text)] px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]"
          >
            Back
          </button>
          <h1 className="text-base font-semibold text-[var(--text)]">
            Company announcements
          </h1>
        </div>
        <p className="text-[11px] text-[var(--text)]/60 mb-4">
          In-app messages for all signed-in users (separate from Activity,
          Invites, and Messages). A user closing the modal only marks it seen
          for them — use{" "}
          <span className="font-medium text-[var(--text)]/75">
            Stop announcement
          </span>{" "}
          (Inactive) to stop it for everyone.{" "}
          <span className="font-mono text-[10px]">
            {Paths.internalCompanyAnnouncements}
          </span>
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
          <div className="flex flex-col gap-5">
            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/90 p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  {editingId ? "Edit announcement" : "New announcement"}
                </h2>
                {editingId ? (
                  <button
                    type="button"
                    onClick={startCreate}
                    className="text-[11px] font-semibold text-[var(--text)]/70 hover:text-[var(--text)]"
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>

              <label className="block text-[11px] font-medium text-[var(--text)]/70 mb-3">
                Title
                <input
                  className={inputClass}
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  maxLength={120}
                  disabled={saving}
                />
              </label>

              <label className="block text-[11px] font-medium text-[var(--text)]/70 mb-3">
                Message
                <textarea
                  className={`${inputClass} min-h-[88px] resize-y`}
                  value={form.message}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, message: e.target.value }))
                  }
                  maxLength={2000}
                  disabled={saving}
                />
              </label>

              <label className="flex items-start gap-2 text-[12px] text-[var(--text)]/85 mb-1">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, is_active: e.target.checked }))
                  }
                  disabled={saving}
                />
                <span>
                  <span className="font-semibold">Active</span>
                  <span className="block text-[11px] text-[var(--text)]/55 mt-0.5 leading-snug">
                    When on, users can see this announcement during its start /
                    expire window. When off, it is stopped globally and the
                    runtime no longer returns it.
                  </span>
                </span>
              </label>
              <p className="text-[10px] text-[var(--text)]/45 mb-3">
                Status:{" "}
                <span className="font-semibold text-[var(--text)]/70">
                  {form.is_active ? "Active (can show)" : "Inactive (stopped)"}
                </span>
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <label className="block text-[11px] font-medium text-[var(--text)]/70">
                  Starts at (optional)
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={form.startsLocal}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, startsLocal: e.target.value }))
                    }
                    disabled={saving}
                  />
                </label>
                <label className="block text-[11px] font-medium text-[var(--text)]/70">
                  Expires at (optional)
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={form.expiresLocal}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, expiresLocal: e.target.value }))
                    }
                    disabled={saving}
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() => void onSave()}
                disabled={saving}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--brand)]/90 text-[var(--bg)] text-sm font-semibold py-2.5 disabled:opacity-50 touch-manipulation"
              >
                {saving ? "Saving…" : editingId ? "Save changes" : "Create"}
              </button>
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  Recent
                </h2>
                <button
                  type="button"
                  onClick={() => void loadRows()}
                  disabled={loading}
                  className="text-[11px] font-semibold text-[var(--text)]/70 hover:text-[var(--text)] disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>
              {loading ? (
                <p className="text-[12px] text-[var(--text)]/55">Loading…</p>
              ) : rows.length === 0 ? (
                <p className="text-[12px] text-[var(--text)]/55">
                  No announcements yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {rows.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/90 px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[var(--text)] truncate">
                            {row.title}
                          </div>
                          <div className="text-[11px] text-[var(--text)]/55 mt-0.5 line-clamp-2">
                            {row.message}
                          </div>
                          <div className="text-[10px] text-[var(--text)]/45 mt-1">
                            <span
                              className={
                                row.is_active
                                  ? "font-semibold text-emerald-700/90 app-dark:text-emerald-400/90"
                                  : "font-semibold text-[var(--text)]/55"
                              }
                            >
                              {row.is_active
                                ? "Active (can show)"
                                : "Inactive (stopped)"}
                            </span>
                            {row.starts_at
                              ? ` · starts ${formatWhen(row.starts_at)}`
                              : ""}
                            {row.expires_at
                              ? ` · expires ${formatWhen(row.expires_at)}`
                              : ""}
                            {" · "}
                            {formatWhen(row.created_at)}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)]"
                        >
                          Edit
                        </button>
                        {row.is_active ? (
                          <button
                            type="button"
                            onClick={() => void onDeactivate(row)}
                            disabled={saving}
                            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)]/80 disabled:opacity-50"
                          >
                            Stop announcement
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </PrimaryPageContainer>
  );
}
