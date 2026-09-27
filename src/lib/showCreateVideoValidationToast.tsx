/**
 * Scannable Create video validation toasts (PASS B.1.1).
 * Structured hierarchy only for typed limit/format failures.
 */

import toast from "react-hot-toast";
import { PiXBold } from "react-icons/pi";
import {
  getCreateVideoValidationToastContent,
  messageForCreateVideoAcquisitionFailure,
  type CreateVideoAcquisitionFailureReason,
} from "./createDraftVideo/createVideoConstraints";

const TOAST_ID = "create-video-validation";

/**
 * Show a validation toast from a typed acquisition/validation reason.
 * Limit/format → two-level scannable toast.
 * read_failed / persist_failed → ordinary error prose.
 */
export function showCreateVideoValidationToast(
  reason: CreateVideoAcquisitionFailureReason,
): void {
  const structured = getCreateVideoValidationToastContent(reason);
  if (!structured) {
    toast.error(messageForCreateVideoAcquisitionFailure(reason), {
      id: TOAST_ID,
    });
    return;
  }

  toast.custom(
    (t) => (
      <div
        role="alert"
        aria-label={structured.accessibleMessage}
        data-create-video-validation-toast
        data-validation-reason={reason}
        className={[
          "pointer-events-auto flex max-w-[min(100vw-24px,340px)] items-start gap-2.5",
          "rounded-xl bg-[#111] px-3 py-2.5 text-white shadow-lg",
          // Dark: subtle light edge. Light: darker theme-aware edge (never white).
          "border border-[color-mix(in_oklab,white_40%,transparent)]",
          "app-light:border-[color-mix(in_oklab,var(--text)_30%,transparent)]",
          "app-light:bg-[var(--surface)] app-light:text-[var(--text)]",
          "app-light:shadow-[0_8px_24px_rgba(0,0,0,0.12)]",
          t.visible ? "animate-enter" : "animate-leave",
        ].join(" ")}
      >
        <span
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#ef4444] text-white"
          aria-hidden
          data-validation-error-icon
        >
          <PiXBold className="h-3 w-3" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex flex-col gap-0.5 leading-snug">
          <p
            className="text-[13px] font-semibold text-white app-light:text-[var(--text)]"
            data-validation-primary
          >
            {structured.primary}
          </p>
          <p
            className="text-[13px] font-bold text-[var(--create-accent-icon-fg)] app-light:text-[var(--brand-readable)]"
            data-validation-action
          >
            {structured.action}
          </p>
        </div>
      </div>
    ),
    { id: TOAST_ID, duration: 4200 },
  );
}
