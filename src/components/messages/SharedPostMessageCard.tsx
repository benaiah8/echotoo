/**
 * Presentation-only shared_post card for DM/group threads (Share S1).
 * Does not fetch, navigate itself, or know Invite/Share picker.
 */

import { PiArrowRight } from "react-icons/pi";
import type { SharedPostCardData } from "../../api/services/posts";
import type { SharedPostResolveStatus } from "../../hooks/useSharedPostResolution";
import { postTypeCompactLabel } from "../../lib/postTypeLabels";
import RailCardImageBackdrop from "../RailCardImageBackdrop";

const cardShellClass =
  "w-full min-w-0 overflow-hidden rounded-[1.05rem] border border-black/[0.06] bg-[color-mix(in_oklab,var(--surface-2)_78%,transparent)] text-left shadow-sm backdrop-blur-md app-dark:border-white/[0.09] app-dark:bg-[color-mix(in_oklab,var(--surface-2)_48%,transparent)]";

const readyRowClass = `${cardShellClass} flex items-stretch gap-2 p-2`;

export type SharedPostMessageCardProps = {
  status: SharedPostResolveStatus | "malformed";
  data?: SharedPostCardData | null;
  /** From message.reference_snapshot.post_type when unavailable. */
  fallbackPostType?: "hangout" | "experience" | null;
  onOpen?: () => void;
  onRetry?: () => void;
};

function unavailableLabel(
  fallbackPostType: "hangout" | "experience" | null | undefined
): string {
  if (fallbackPostType === "hangout" || fallbackPostType === "experience") {
    return `${postTypeCompactLabel(fallbackPostType)} unavailable`;
  }
  return "Post unavailable";
}

export default function SharedPostMessageCard({
  status,
  data,
  fallbackPostType = null,
  onOpen,
  onRetry,
}: SharedPostMessageCardProps) {
  if (status === "pending") {
    return (
      <div
        className={`${cardShellClass} flex min-h-[3.6rem] animate-pulse items-stretch gap-2 p-2`}
        aria-hidden
      >
        <div className="w-[3.15rem] shrink-0 self-stretch rounded-lg bg-[var(--text)]/[0.06]" />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <div className="h-2 w-16 rounded bg-[var(--text)]/[0.08]" />
          <div className="h-3 w-[85%] rounded bg-[var(--text)]/[0.07]" />
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={`${cardShellClass} px-3 py-2`}>
        <p className="text-[12px] leading-snug text-[var(--text)]/55">
          Couldn&apos;t load post
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            className="mt-1 text-[12px] font-medium text-amber-800/80 underline-offset-2 hover:underline app-dark:text-amber-200/75"
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (status === "unavailable" || status === "malformed") {
    return (
      <div
        className={`${cardShellClass} px-3 py-2 opacity-75`}
        aria-label={unavailableLabel(
          status === "malformed" ? null : fallbackPostType
        )}
      >
        <p className="text-[13px] font-medium leading-snug text-[var(--text)]/55">
          {unavailableLabel(status === "malformed" ? null : fallbackPostType)}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`${cardShellClass} px-3 py-2 opacity-75`}>
        <p className="text-[13px] font-medium leading-snug text-[var(--text)]/55">
          Post unavailable
        </p>
      </div>
    );
  }

  const typeLabel = postTypeCompactLabel(data.post_type);
  const title = data.caption?.trim() || typeLabel;
  const schedule = data.schedule_label?.trim() || "";

  const body = (
    <>
      {data.cover_url ? (
        <span className="relative w-[3.15rem] shrink-0 self-stretch overflow-hidden rounded-lg">
          <span className="absolute inset-0">
            <RailCardImageBackdrop coverUrl={data.cover_url} compact />
          </span>
        </span>
      ) : (
        <span
          className="w-[3.15rem] shrink-0 self-stretch rounded-lg border border-black/[0.05] bg-[color-mix(in_oklab,var(--surface)_70%,transparent)] app-dark:border-white/[0.08]"
          aria-hidden
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-[var(--text)]/45">
            {typeLabel}
          </span>
          {schedule ? (
            <span className="min-w-0 truncate text-right text-[10px] font-medium text-[var(--text)]/50">
              {schedule}
            </span>
          ) : null}
        </div>
        <p className="line-clamp-2 break-words text-[13px] font-medium leading-snug text-[var(--text)]/88">
          {title}
        </p>
        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--text)]/40">
          See post
          <PiArrowRight className="h-2.5 w-2.5" aria-hidden />
        </span>
      </div>
    </>
  );

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={`${readyRowClass} transition-[background-color] hover:bg-[color-mix(in_oklab,var(--surface-2)_62%,transparent)] app-dark:hover:bg-[color-mix(in_oklab,var(--surface-2)_38%,transparent)]`}
        aria-label={`Open ${typeLabel}: ${title}`}
      >
        {body}
      </button>
    );
  }

  return <div className={readyRowClass}>{body}</div>;
}
