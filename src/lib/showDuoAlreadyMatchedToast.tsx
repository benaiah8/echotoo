/**
 * Duo already-matched status — compact SocialActionToast below People top nav.
 * Informational only; does not use OrdinaryErrorToastBar.
 */

import { PiCheckCircleFill } from "react-icons/pi";
import { peopleUiCopy } from "../pages/people/peopleUiCopy";
import { peopleDuoModernScrollTopInset } from "./people/peopleFeedLayout";
import {
  showSocialActionToast,
  SOCIAL_ACTION_TOAST_DURATION_MS,
} from "./showSocialActionToast";

/** Dedicated top Toaster — Duo already-matched notice only. */
export const DUO_ALREADY_MATCHED_TOASTER_ID = "duo-already-matched";

export const DUO_ALREADY_MATCHED_TOAST_ID = "duo-already-matched-notice";

/** Below People category nav (same inset as Duo match toast island + 8px). */
export const DUO_ALREADY_MATCHED_TOAST_TOP = `calc(${peopleDuoModernScrollTopInset()} + 8px)`;

/** Compact informational notice when Duo heart hits an existing match. */
export function showDuoAlreadyMatchedToast(): void {
  showSocialActionToast({
    id: DUO_ALREADY_MATCHED_TOAST_ID,
    toasterId: DUO_ALREADY_MATCHED_TOASTER_ID,
    position: "top-center",
    variant: "compact",
    durationMs: SOCIAL_ACTION_TOAST_DURATION_MS,
    title: (
      <span className="inline-flex items-center gap-1.5">
        <PiCheckCircleFill
          className="h-3.5 w-3.5 shrink-0 text-[var(--brand-readable)]"
          aria-hidden
        />
        {peopleUiCopy.duoHeartMatched}
      </span>
    ),
  });
}
