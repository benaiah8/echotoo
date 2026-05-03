import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import FrostedCenterModal, { frostedModalPanelClassName } from "./FrostedCenterModal";
import { getConfirmDialogButtonClass } from "./ConfirmDialog";
import type { PostReportReasonCode, ReportDraft } from "../../types/report";
import { submitPostReport, submitProfileReport } from "../../api/services/reports";
import { showErrorToast } from "../../lib/errorHandling";

const REASON_OPTIONS: {
  label: string;
  value: PostReportReasonCode;
}[] = [
  { label: "Spam", value: "spam" },
  { label: "Inappropriate content", value: "inappropriate_content" },
  { label: "Harassment", value: "harassment" },
  { label: "False information", value: "false_information" },
  { label: "Other", value: "other" },
];

const fieldBase =
  "rounded-lg text-xs font-medium text-[var(--text)] border transition " +
  "app-dark:bg-black app-dark:border-[var(--border)] " +
  "app-light:bg-white app-light:border-[var(--border)]";

const fieldPlaceholder = "placeholder:text-[color-mix(in_oklab,var(--text)_42%,transparent)]";

type Props = {
  open: boolean;
  draft: ReportDraft | null;
  onClose: () => void;
};

export default function ReportModal({ open, draft, onClose }: Props) {
  const [reason, setReason] = useState<PostReportReasonCode | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const draftKey =
    draft == null
      ? ""
      : draft.reportKind === "post"
        ? `post:${draft.targetPostId}`
        : `profile:${draft.targetProfileId}`;

  useEffect(() => {
    if (!open) {
      setReason(null);
      setDetails("");
      setSubmitting(false);
    }
  }, [open, draftKey]);

  /** Full-screen modal: lock page scroll (same idea as BottomDrawer). */
  useEffect(() => {
    if (!open || !draft) return;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [open, draftKey]);

  if (!open || !draft) return null;

  const reportTitle =
    draft.reportKind === "post" ? "Report post" : "Report profile";

  const handleSubmit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      if (draft.reportKind === "post") {
        await submitPostReport({
          targetPostId: draft.targetPostId,
          targetOwnerProfileId: draft.targetOwnerProfileId,
          postType: draft.postType,
          reason,
          details: details.trim() || null,
        });
      } else {
        await submitProfileReport({
          targetProfileId: draft.targetProfileId,
          targetOwnerUserId: draft.targetOwnerUserId,
          reason,
          details: details.trim() || null,
        });
      }
      toast.success("Thanks, your report has been submitted.");
      onClose();
    } catch (e: unknown) {
      console.error("[ReportModal]", e);
      showErrorToast(e, "Could not submit report. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FrostedCenterModal
      open={open}
      onBackdropClick={submitting ? undefined : onClose}
      zTier="blocking"
      backdropVariant="opaque"
      aria-labelledby="report-modal-title"
    >
      <div
        className={[
          frostedModalPanelClassName,
          "flex max-h-[min(88dvh,640px)] flex-col min-h-0",
          "app-light:bg-white/95 app-light:backdrop-blur-xl app-light:shadow-[0_12px_48px_rgba(0,0,0,0.12)]",
          "app-dark:bg-[color-mix(in_oklab,#0b0b0c_92%,transparent)] app-dark:backdrop-blur-xl app-dark:shadow-[0_12px_48px_rgba(0,0,0,0.45)]",
        ].join(" ")}
        style={{
          maxWidth: "var(--floating-confirm-max-width, min(380px, 92vw))",
          borderColor: "var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="report-modal-title"
          className="text-sm font-semibold text-[var(--text)] shrink-0"
        >
          {reportTitle}
        </h2>
        <p className="text-xs text-[var(--text)]/70 mt-1 mb-3 shrink-0">
          Tell us what is wrong. Reports are reviewed by our team.
        </p>

        <div className="text-[11px] font-medium text-[var(--text)]/80 mb-1.5 shrink-0">
          Reason
        </div>
        <div
          className="flex flex-col gap-1.5 mb-3 min-h-0 flex-1 overflow-y-auto pr-0.5 overscroll-contain"
          role="radiogroup"
          aria-label="Report reason"
        >
          {REASON_OPTIONS.map((opt) => {
            const selected = reason === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setReason(opt.value)}
                className={[
                  "w-full text-left px-3 py-2.5",
                  fieldBase,
                  selected
                    ? "border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_22%,transparent)] ring-1 ring-[var(--brand)]/35"
                    : "app-dark:hover:bg-neutral-950 app-light:hover:bg-neutral-50",
                ].join(" ")}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <label
          htmlFor="report-modal-details"
          className="text-[11px] font-medium text-[var(--text)]/80 mb-1 shrink-0"
        >
          Additional details (optional)
        </label>
        <textarea
          id="report-modal-details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={2000}
          rows={4}
          disabled={submitting}
          placeholder="Add context that may help us review…"
          className={[
            "w-full mb-3 resize-y min-h-[88px] shrink-0 px-3 py-2",
            fieldBase,
            fieldPlaceholder,
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/45",
          ].join(" ")}
        />

        <div className="mt-auto flex shrink-0 gap-2 border-t border-[var(--border)]/60 pt-3">
          <button
            type="button"
            className={[
              "flex-1 min-w-0 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:opacity-50",
              "app-dark:bg-black app-dark:border-[var(--border)] app-dark:text-[var(--text)] app-dark:hover:bg-neutral-950",
              "app-light:bg-white app-light:border-[var(--border)] app-light:text-[var(--text)] app-light:hover:bg-neutral-50",
            ].join(" ")}
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className={getConfirmDialogButtonClass("primary")}
            onClick={() => void handleSubmit()}
            disabled={!reason || submitting}
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </FrostedCenterModal>
  );
}
