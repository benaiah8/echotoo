/**
 * Opt-in DEV diagnostics for Event Duo (join_pair_up) activation.
 * Does not affect eligibility, requests, or UI. Logging must never throw.
 */

import { hasAnyUpcomingDate } from "./feedExpiryFilters";
import {
  canOfferPairUp,
  hasValidRecurrenceDays,
} from "./pairUpEligibility";
import { HOME_EVENT_TIMEZONE } from "./homeFeedConstants";
import {
  resolveViewerTimeZone,
  upcomingSelectedDateKeys,
} from "./postScheduleLabel";
import type { FeedItemWithDates } from "./feedSorting";

export const DUO_JOIN_DEBUG_STORAGE_KEY = "echoDuoDebug";

const UNAVAILABLE = "unavailable" as const;

type Unavailable = typeof UNAVAILABLE;

function isDuoJoinDebugEnv(): boolean {
  try {
    return Boolean(import.meta.env.DEV);
  } catch {
    return false;
  }
}

/** Read opt-in at call time (no reload required). Storage failures → off. */
export function isDuoJoinDebugEnabled(): boolean {
  if (!isDuoJoinDebugEnv()) return false;
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(DUO_JOIN_DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function fieldPresent<T extends object>(
  obj: T | null | undefined,
  key: keyof T
): boolean {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

function availOr<T>(
  present: boolean,
  value: T | null | undefined
): T | null | Unavailable {
  if (!present) return UNAVAILABLE;
  return value ?? null;
}

function parseInstantIso(raw: string, actionAtMs: number): {
  raw: string;
  parsedUtcIso: string | "invalid";
  gteActionUtc: boolean | "invalid";
} {
  const trimmed = String(raw).trim();
  if (!trimmed) {
    return { raw, parsedUtcIso: "invalid", gteActionUtc: "invalid" };
  }
  const t = new Date(trimmed);
  if (Number.isNaN(t.getTime())) {
    return { raw, parsedUtcIso: "invalid", gteActionUtc: "invalid" };
  }
  return {
    raw,
    parsedUtcIso: t.toISOString(),
    gteActionUtc: t.getTime() >= actionAtMs,
  };
}

/** Which canOfferPairUp branch allowed activation (diagnostic only). */
export function describeCanOfferPairUpBranch(input: {
  postId?: string | null;
  postType?: "experience" | "hangout" | null;
  isRecurring?: boolean | null;
  selectedDates?: string[] | null;
  recurrenceDays?: string[] | null;
  status?: "draft" | "published" | null;
  visibility?: string | null;
  authorIsPrivate?: boolean | null;
}): string {
  const offered = canOfferPairUp(input);
  if (!offered) return "not_offered";

  if (input.postType !== "hangout") return "unexpected_non_hangout";

  if (input.isRecurring) {
    return hasValidRecurrenceDays(input.recurrenceDays)
      ? "hangout_recurring_valid_days"
      : "hangout_recurring_unexpected";
  }

  if (!input.selectedDates || input.selectedDates.length === 0) {
    return "hangout_non_recurring_unexpected_empty_dates";
  }

  const calendarUpcoming = hasAnyUpcomingDate(
    {
      type: "hangout",
      is_recurring: false,
      selected_dates: input.selectedDates,
    } as FeedItemWithDates,
    new Date(),
    HOME_EVENT_TIMEZONE
  );

  return calendarUpcoming
    ? "hangout_non_recurring_calendar_upcoming"
    : "hangout_non_recurring_unexpected";
}

export type DuoJoinDebugOrigin = "feed" | "detailDock" | "compact" | Unavailable;

export type DuoJoinDebugSnapshotInput = {
  postId: string;
  origin: DuoJoinDebugOrigin;
  postType?: "experience" | "hangout" | null;
  post?: {
    type?: "experience" | "hangout" | null;
    selected_dates?: string[] | null;
    is_recurring?: boolean | null;
    recurrence_days?: string[] | null;
    status?: "draft" | "published" | null;
    visibility?: string | null;
    author?: { is_private?: boolean | null } | null;
  } | null;
  /** Raw prop presence: whether caller passed `post` at all. */
  postProvided: boolean;
  pairStatus: string | null | undefined;
};

export function buildDuoJoinDebugSnapshot(input: DuoJoinDebugSnapshotInput) {
  const actionAt = new Date();
  const actionAtMs = actionAt.getTime();
  const viewerTimeZone = resolveViewerTimeZone();

  const post = input.post;
  const postProvided = input.postProvided && post != null;

  const selectedDatesPresent =
    postProvided && fieldPresent(post, "selected_dates");
  const selectedDates = selectedDatesPresent
    ? (post!.selected_dates ?? null)
    : null;

  const isRecurringPresent =
    postProvided && fieldPresent(post, "is_recurring");
  const recurrenceDaysPresent =
    postProvided && fieldPresent(post, "recurrence_days");
  const statusPresent = postProvided && fieldPresent(post, "status");
  const visibilityPresent = postProvided && fieldPresent(post, "visibility");
  const authorPresent = postProvided && fieldPresent(post, "author");
  const authorIsPrivatePresent =
    authorPresent &&
    post!.author != null &&
    fieldPresent(post!.author, "is_private");

  const postTypeFromProp =
    input.postType === undefined ? UNAVAILABLE : (input.postType ?? null);
  const postTypeFromPost =
    postProvided && fieldPresent(post, "type")
      ? (post!.type ?? null)
      : UNAVAILABLE;

  const canOfferInputs = {
    postId: input.postId,
    postType:
      input.postType === undefined
        ? null
        : (input.postType ?? null),
    isRecurring: isRecurringPresent ? (post!.is_recurring ?? null) : null,
    selectedDates: selectedDatesPresent ? selectedDates : null,
    recurrenceDays: recurrenceDaysPresent
      ? (post!.recurrence_days ?? null)
      : null,
    status: statusPresent ? (post!.status ?? null) : null,
    visibility: visibilityPresent ? (post!.visibility ?? null) : null,
    authorIsPrivate: authorIsPrivatePresent
      ? (post!.author?.is_private ?? null)
      : null,
  };

  const canOfferResult = canOfferPairUp(canOfferInputs);
  const offerBranch = describeCanOfferPairUpBranch(canOfferInputs);

  const dateStrings: string[] = Array.isArray(selectedDates)
    ? selectedDates.map((d) => String(d))
    : [];

  const perDateComparisons = selectedDatesPresent
    ? dateStrings.map((raw) => parseInstantIso(raw, actionAtMs))
    : UNAVAILABLE;

  const anyParsedTimestampGteAction = selectedDatesPresent
    ? dateStrings.some((raw) => {
        const t = new Date(String(raw).trim());
        return !Number.isNaN(t.getTime()) && t.getTime() >= actionAtMs;
      })
    : UNAVAILABLE;

  let calendarDayHelper: Record<string, unknown> | Unavailable = UNAVAILABLE;
  if (selectedDatesPresent && Array.isArray(selectedDates)) {
    const keys = upcomingSelectedDateKeys(
      selectedDates.map((d) => String(d)),
      actionAt,
      HOME_EVENT_TIMEZONE
    );
    const calendarUpcoming = hasAnyUpcomingDate(
      {
        type: "hangout",
        is_recurring: false,
        selected_dates: selectedDates,
      } as FeedItemWithDates,
      actionAt,
      HOME_EVENT_TIMEZONE
    );
    calendarDayHelper = {
      socialRuleTimeZone: HOME_EVENT_TIMEZONE,
      viewerIanaTimeZone: viewerTimeZone,
      helper: "upcomingSelectedDateKeys / hasAnyUpcomingDate",
      upcomingDayKeys: keys,
      hasAnyUpcomingDate: calendarUpcoming,
    };
  }

  return {
    sourcePostId: input.postId,
    origin: input.origin,
    capturedAtUtc: actionAt.toISOString(),
    viewerIanaTimeZone: viewerTimeZone,
    viewerLocalTimestamp: actionAt.toLocaleString(undefined, {
      timeZone: viewerTimeZone,
      hour12: false,
    }),
    postType: {
      fromProp: postTypeFromProp,
      fromPost: postTypeFromPost,
    },
    selected_dates: selectedDatesPresent
      ? selectedDates
      : UNAVAILABLE,
    is_recurring: availOr(isRecurringPresent, post?.is_recurring),
    recurrence_days: availOr(recurrenceDaysPresent, post?.recurrence_days),
    explicitTimeOrDateOnlyFlags: UNAVAILABLE,
    status: availOr(statusPresent, post?.status),
    visibility: availOr(visibilityPresent, post?.visibility),
    authorIsPrivate: availOr(
      authorIsPrivatePresent,
      post?.author?.is_private
    ),
    pairStatus: input.pairStatus ?? null,
    canOfferPairUp: {
      inputs: {
        postId: canOfferInputs.postId,
        postType: canOfferInputs.postType,
        isRecurring: isRecurringPresent
          ? canOfferInputs.isRecurring
          : UNAVAILABLE,
        selectedDates: selectedDatesPresent
          ? canOfferInputs.selectedDates
          : UNAVAILABLE,
        recurrenceDays: recurrenceDaysPresent
          ? canOfferInputs.recurrenceDays
          : UNAVAILABLE,
        status: statusPresent ? canOfferInputs.status : UNAVAILABLE,
        visibility: visibilityPresent
          ? canOfferInputs.visibility
          : UNAVAILABLE,
        authorIsPrivate: authorIsPrivatePresent
          ? canOfferInputs.authorIsPrivate
          : UNAVAILABLE,
      },
      result: canOfferResult,
      offerBranch,
    },
    diagnosticDateComparisons: {
      note: "Diagnostic only; does not claim to reproduce every backend rule.",
      perSelectedDate: perDateComparisons,
      anyParsedTimestampGteActionUtc: anyParsedTimestampGteAction,
      calendarDayHelper,
    },
  };
}

export function sanitizeDuoJoinDebugError(err: unknown): {
  outcome: "failure";
  message: string | null;
  code: string | null;
  details: string | null;
  hint: string | null;
  httpStatus: number | Unavailable;
} {
  const empty = {
    outcome: "failure" as const,
    message: null as string | null,
    code: null as string | null,
    details: null as string | null,
    hint: null as string | null,
    httpStatus: UNAVAILABLE as number | Unavailable,
  };

  if (err == null) return empty;

  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const message =
      typeof o.message === "string"
        ? o.message
        : err instanceof Error
          ? err.message
          : null;
    const code = typeof o.code === "string" ? o.code : null;
    const details =
      o.details === null
        ? null
        : typeof o.details === "string"
          ? o.details
          : null;
    const hint =
      o.hint === null
        ? null
        : typeof o.hint === "string"
          ? o.hint
          : null;

    let httpStatus: number | Unavailable = UNAVAILABLE;
    if (typeof o.status === "number") httpStatus = o.status;
    else if (typeof o.statusCode === "number") httpStatus = o.statusCode;

    return {
      outcome: "failure",
      message,
      code,
      details,
      hint,
      httpStatus,
    };
  }

  return {
    ...empty,
    message: String(err),
  };
}

export function emitDuoJoinDebugLog(
  snapshot: ReturnType<typeof buildDuoJoinDebugSnapshot>,
  result:
    | { outcome: "success" }
    | ReturnType<typeof sanitizeDuoJoinDebugError>
): void {
  try {
    const payload = { ...snapshot, result };
    console.info("[Duo debug]", JSON.stringify(payload, null, 2));
  } catch {
    try {
      console.info("[Duo debug]", "[serialize_failed]");
    } catch {
      /* never throw */
    }
  }
}
