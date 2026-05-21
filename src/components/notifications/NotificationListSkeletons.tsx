import React from "react";

const pulseBar = "rounded bg-[var(--text)]/10 animate-pulse";

/** Post-type chip footprint (~PostTypeMetaChip + icon). */
function ChipPlaceholder() {
  return (
    <span
      aria-hidden
      className={`inline-block h-[18px] w-[22px] shrink-0 rounded border border-[var(--text)]/8 ${pulseBar}`}
    />
  );
}

function UnreadDotPlaceholder() {
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--text)]/10"
    />
  );
}

/** Personal invite row — mirrors InviteNotificationItem `rowBody` (non-announcement). */
function InvitePersonalSkeletonRow() {
  return (
    <div
      role="presentation"
      className="border-b border-[var(--border)]/45 last:border-b-0"
    >
      <div className="pointer-events-none flex min-h-[4rem] w-full items-start gap-2 py-2.5 pl-1 pr-1 sm:min-h-[4.25rem] sm:gap-3">
        <div
          aria-hidden
          className="flex w-11 shrink-0 items-center justify-center self-center sm:w-12"
        >
          <div className={`h-[42px] w-[42px] shrink-0 rounded-full ${pulseBar}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-x-1.5 gap-y-1 sm:gap-x-2">
            <ChipPlaceholder />
            <div className="flex min-w-0 flex-[1_1_0] items-baseline gap-x-1.5">
              <div
                aria-hidden
                className={`h-[14px] min-w-0 flex-1 max-w-[14rem] ${pulseBar}`}
              />
              <UnreadDotPlaceholder />
            </div>
          </div>
          <div
            aria-hidden
            className={`mt-1.5 h-[11px] w-[92%] max-w-md sm:mt-2 sm:h-3 ${pulseBar}`}
          />
          <div
            aria-hidden
            className={`mt-1 h-[11px] w-[70%] max-w-sm sm:mt-1.5 sm:h-3 ${pulseBar}`}
          />
        </div>
        <div
          aria-hidden
          className="flex max-w-[4.875rem] shrink-0 flex-col items-end gap-1 self-start pt-0.5 pl-0.5 text-right sm:max-w-[5.125rem]"
        >
          <div className={`h-2.5 w-12 rounded sm:h-3 sm:w-14 ${pulseBar}`} />
          <div className={`h-5 w-16 shrink-0 rounded-full sm:w-[4.25rem] ${pulseBar}`} />
        </div>
      </div>
    </div>
  );
}

/** Group invite — overlapping circles like `rowGroupIcon` footprint. */
function InviteGroupSkeletonRow() {
  return (
    <div
      role="presentation"
      className="border-b border-[var(--border)]/45 last:border-b-0"
    >
      <div className="pointer-events-none flex min-h-[4rem] w-full items-start gap-2 py-2.5 pl-1 pr-1 sm:min-h-[4.25rem] sm:gap-3">
        <div
          aria-hidden
          className="flex w-11 shrink-0 items-center justify-center self-center sm:w-12"
        >
          <div className="relative h-[42px] w-[42px] shrink-0">
            <div
              className={`absolute left-0 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full ${pulseBar}`}
            />
            <div
              className={`absolute right-0 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full ${pulseBar}`}
            />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-x-1.5 gap-y-1 sm:gap-x-2">
            <ChipPlaceholder />
            <div className="flex min-w-0 flex-[1_1_0] items-baseline gap-x-1.5">
              <div
                aria-hidden
                className={`h-[14px] min-w-0 flex-1 max-w-[12rem] ${pulseBar}`}
              />
              <UnreadDotPlaceholder />
            </div>
          </div>
          <div
            aria-hidden
            className={`mt-1.5 h-[11px] w-[88%] sm:mt-2 sm:h-3 ${pulseBar}`}
          />
        </div>
        <div
          aria-hidden
          className="flex max-w-[4.875rem] shrink-0 flex-col items-end gap-1 self-start pt-0.5 pl-0.5 sm:max-w-[5.125rem]"
        >
          <div className={`h-2.5 w-12 rounded sm:h-3 sm:w-14 ${pulseBar}`} />
          <div className={`h-5 w-16 shrink-0 rounded-full sm:w-[4.25rem] ${pulseBar}`} />
        </div>
      </div>
    </div>
  );
}

/** Echo / announcement row — mirrors `announcementRowBody` rhythm. */
function InviteEchoSkeletonRow() {
  return (
    <div
      role="presentation"
      className="border-b border-[var(--border)]/45 last:border-b-0"
    >
      <div className="pointer-events-none flex min-h-[4rem] w-full items-start gap-2 py-2.5 pl-1 pr-1 sm:min-h-[4.25rem] sm:gap-3">
        <div
          aria-hidden
          className="flex w-11 shrink-0 items-center justify-center self-start pt-0.5 sm:w-12"
        >
          <div
            className={`h-[42px] w-[42px] shrink-0 rounded-full border border-[var(--text)]/8 ${pulseBar}`}
          />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <ChipPlaceholder />
            <div
              aria-hidden
              className={`h-[14px] min-w-0 flex-1 ${pulseBar}`}
            />
            <UnreadDotPlaceholder />
          </div>
          <div
            aria-hidden
            className={`h-[11px] w-full max-w-sm sm:h-3 ${pulseBar}`}
          />
          <div
            aria-hidden
            className={`h-[11px] w-[72%] max-w-xs sm:h-3 ${pulseBar}`}
          />
          <div className="flex min-w-0 items-center justify-between gap-2 pt-0.5">
            <div className={`h-2.5 w-14 rounded sm:h-3 sm:w-16 ${pulseBar}`} />
            <div className={`h-2.5 w-16 shrink-0 rounded sm:h-3 sm:w-20 ${pulseBar}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

const INVITE_SKELETON_SEQUENCE: Array<"personal" | "group" | "echo"> = [
  "personal",
  "echo",
  "group",
  "personal",
  "echo",
];

/** Initial invites-tab list placeholders (no notification text). */
export function NotificationListInviteSkeletonRows() {
  return (
    <>
      {INVITE_SKELETON_SEQUENCE.map((kind, i) =>
        kind === "personal" ? (
          <InvitePersonalSkeletonRow key={i} />
        ) : kind === "group" ? (
          <InviteGroupSkeletonRow key={i} />
        ) : (
          <InviteEchoSkeletonRow key={i} />
        )
      )}
    </>
  );
}

/** Matches NotificationItem `activityCalm` row footprint. */
function ActivitySkeletonRow() {
  return (
    <div
      role="presentation"
      className="border-b border-[var(--border)]/50 last:border-b-0"
    >
      <div className="pointer-events-none flex w-full items-start gap-2.5 py-2.5 pl-0.5 pr-0">
        <div
          aria-hidden
          className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-[var(--text)]/10 animate-pulse"
        />
        <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
          <div className="min-w-0">
            <div
              aria-hidden
              className={`h-[13px] w-full max-w-md ${pulseBar}`}
            />
            <div
              aria-hidden
              className={`mt-1.5 h-[11px] w-24 ${pulseBar}`}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text)]/10"
            />
            <div
              aria-hidden
              className={`h-5 w-[3.25rem] shrink-0 rounded-full border border-[var(--border)]/50 ${pulseBar}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Initial activity-tab list placeholders. */
export function NotificationListActivitySkeletonRows() {
  return (
    <>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <ActivitySkeletonRow key={i} />
      ))}
    </>
  );
}
