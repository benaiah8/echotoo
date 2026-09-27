/**
 * Client-side mirrors of cheap Pair Up / Open Plan source gates, used only to
 * decide whether to show the social action. The backend stays the authority;
 * a mutation it rejects still surfaces as a failed action.
 *
 * Optimized Home feed currently omits visibility and author privacy. Missing
 * fields must not hide the control; Post Detail has both and can hide it.
 *
 * hangout (Event) → Pair Up shared pool
 * experience (Place) → individual Open Plan
 *
 * Date rule (mirrors people_source_is_eligible / group_up_source_is_eligible):
 * - Non-recurring: ≥1 selected_dates whose Africa/Addis_Ababa calendar day
 *   is today or later (full day; date-only and timed alike)
 * - Recurring: nonempty valid recurrence_days (MO..SU)
 * - Empty selected_dates alone is NOT eligible
 */

import { CREATE_FLOW_WEEKDAYS } from "./createFlowScheduleConstants";
import { isDraftPostId } from "./drafts";
import { hasAnyUpcomingDate } from "./feedExpiryFilters";
import { HOME_EVENT_TIMEZONE } from "./homeFeedConstants";
import type { FeedItemWithDates } from "./feedSorting";

const VALID_RECURRENCE_CODES = new Set(
  CREATE_FLOW_WEEKDAYS.map((d) => d.code)
);

type SocialSourceEligibilityInput = {
  postId?: string | null;
  postType?: "experience" | "hangout" | null;
  isRecurring?: boolean | null;
  selectedDates?: string[] | null;
  recurrenceDays?: string[] | null;
  /** Drafts and unpublished posts never have a pool / plan. */
  status?: "draft" | "published" | null;
  /** When present and not `'public'`, hide the action. Absent → do not hide. */
  visibility?: string | null;
  /** When `true`, the source author is private. Absent → do not hide. */
  authorIsPrivate?: boolean | null;
};

/** Shared public/draft/author-private gates for Pair Up and Open Plan actions. */
function canOfferSocialSourceBase({
  postId,
  status,
  visibility,
  authorIsPrivate,
}: Pick<
  SocialSourceEligibilityInput,
  "postId" | "status" | "visibility" | "authorIsPrivate"
>): boolean {
  if (isDraftPostId(postId)) return false;
  if (status === "draft") return false;
  const vis = typeof visibility === "string" ? visibility.trim() : "";
  if (vis && vis !== "public") return false;
  if (authorIsPrivate === true) return false;
  return true;
}

/** True when recurrence_days has ≥1 valid MO..SU code (open-ended next occurrence). */
export function hasValidRecurrenceDays(
  recurrenceDays?: string[] | null
): boolean {
  if (!recurrenceDays?.length) return false;
  return recurrenceDays.some((raw) => {
    const code = String(raw).trim().toUpperCase();
    return VALID_RECURRENCE_CODES.has(code);
  });
}

/** Event / hangout → Pair Up shared pool. */
export function canOfferPairUp({
  postId,
  postType,
  isRecurring,
  selectedDates,
  recurrenceDays,
  status,
  visibility,
  authorIsPrivate,
}: SocialSourceEligibilityInput): boolean {
  if (
    !canOfferSocialSourceBase({
      postId,
      status,
      visibility,
      authorIsPrivate,
    })
  ) {
    return false;
  }
  if (postType !== "hangout") return false;

  if (isRecurring) {
    return hasValidRecurrenceDays(recurrenceDays);
  }

  if (!selectedDates || selectedDates.length === 0) return false;

  return hasAnyUpcomingDate(
    {
      type: "hangout",
      is_recurring: false,
      selected_dates: selectedDates,
    } as FeedItemWithDates,
    new Date(),
    HOME_EVENT_TIMEZONE
  );
}

/** Place / experience → individual Open Plan. */
export function canOfferOpenPlan({
  postId,
  postType,
  status,
  visibility,
  authorIsPrivate,
}: SocialSourceEligibilityInput): boolean {
  if (
    !canOfferSocialSourceBase({
      postId,
      status,
      visibility,
      authorIsPrivate,
    })
  ) {
    return false;
  }
  return postType === "experience";
}

/** Hangout or Experience → organizer-led Group Up (additive to Pair Up / Open Plan). */
export function canOfferGroupUp({
  postId,
  postType,
  isRecurring,
  selectedDates,
  recurrenceDays,
  status,
  visibility,
  authorIsPrivate,
}: SocialSourceEligibilityInput): boolean {
  if (
    !canOfferSocialSourceBase({
      postId,
      status,
      visibility,
      authorIsPrivate,
    })
  ) {
    return false;
  }
  if (postType === "experience") return true;
  if (postType !== "hangout") return false;

  if (isRecurring) {
    return hasValidRecurrenceDays(recurrenceDays);
  }

  if (!selectedDates || selectedDates.length === 0) return false;

  return hasAnyUpcomingDate(
    {
      type: "hangout",
      is_recurring: false,
      selected_dates: selectedDates,
    } as FeedItemWithDates,
    new Date(),
    HOME_EVENT_TIMEZONE
  );
}
