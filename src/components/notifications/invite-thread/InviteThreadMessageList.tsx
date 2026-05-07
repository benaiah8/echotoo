import React, { Fragment } from "react";
import { format } from "date-fns";
import Avatar from "../../ui/Avatar";
import type {
  InviteThreadMessage,
  InviteThreadProfilePeek,
} from "../../../api/services/inviteThreads";

const HOUR_MS = 60 * 60 * 1000;

function dmSeparatorLabel(isoTime: string): string {
  return format(new Date(isoTime), "p");
}

function spacingSeparatorPrevMessage(
  messages: InviteThreadMessage[],
  index: number,
): boolean {
  if (index === 0) return true;
  const prev = messages[index - 1];
  if (!prev?.created_at) return true;
  const gap =
    new Date(messages[index].created_at).getTime() -
    new Date(prev.created_at).getTime();
  return gap >= HOUR_MS;
}

type Props = {
  messages: InviteThreadMessage[];
  viewerUserId: string | null;
  reactionsInteractive: boolean;
  reactingMessageId: string | null;
  onToggleReaction: (messageId: string) => void;
  counterparty: InviteThreadProfilePeek | null;
};

export default function InviteThreadMessageList({
  messages,
  viewerUserId,
  reactionsInteractive,
  reactingMessageId,
  onToggleReaction,
  counterparty,
}: Props) {
  if (messages.length === 0) {
    return (
      <p className="py-4 text-center text-[13px] text-[var(--text)]/42">
        No messages yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {messages.map((m, idx) => {
        const mine = viewerUserId != null && m.sender_user_id === viewerUserId;
        const showSep = spacingSeparatorPrevMessage(messages, idx);
        const showReactionCtl =
          reactionsInteractive ||
          (typeof m.thumb_up_count === "number" && m.thumb_up_count > 0);
        const senderPreview = m.sender_profile ?? counterparty;
        const senderAvatarUrl = senderPreview?.avatar_url || undefined;
        const senderName =
          senderPreview?.display_name || senderPreview?.username || undefined;

        const reactionActive = m.viewer_has_thumb_up === true;
        const reactionInnerClass = [
          "flex shrink-0 items-center justify-center rounded-full border transition-all duration-150",
          reactionActive
            ? "h-9 w-9 scale-[1.04] border-amber-400/80 bg-amber-400/28 text-amber-700 shadow-[0_0_16px_rgba(245,158,11,0.46)] app-dark:border-amber-300/78 app-dark:bg-amber-300/30 app-dark:text-amber-100 app-dark:shadow-[0_0_16px_rgba(251,191,36,0.35)]"
            : "h-8 w-8 border-neutral-900/14 bg-black/[0.04] text-neutral-700/76 hover:border-neutral-900/24 hover:bg-black/[0.08] hover:text-neutral-900/90 app-dark:border-white/16 app-dark:bg-white/[0.06] app-dark:text-white/74 app-dark:hover:bg-white/[0.11] app-dark:hover:text-white/90",
        ].join(" ");
        const reactionHitClass =
          "mt-0.5 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 disabled:pointer-events-none disabled:opacity-35";

        return (
          <Fragment key={m.id}>
            {showSep ? (
              <li className="mb-4 mt-3 flex justify-center">
                <span className="rounded-full bg-[color-mix(in_oklab,var(--surface-2)_60%,transparent)] px-3 py-0.5 text-[10px] font-medium text-[var(--text)]/40 shadow-sm backdrop-blur-sm tabular-nums">
                  {dmSeparatorLabel(m.created_at)}
                </span>
              </li>
            ) : null}
            <li
              className={`mb-3 flex last:mb-1 ${
                mine ? "justify-end" : "justify-start"
              }`}
            >
              <div className="flex max-w-[min(79%,20.35rem)] items-start gap-1.5">
                {!mine ? (
                  <span className="flex h-[44px] min-w-[44px] shrink-0 items-start justify-center pt-[1px]">
                    <Avatar
                      variant="default"
                      url={senderAvatarUrl}
                      name={senderName}
                      size={30}
                      tightLineBox
                      className="rounded-full"
                    />
                  </span>
                ) : null}
                {mine && showReactionCtl ? (
                  reactionsInteractive ? (
                    <button
                      type="button"
                      disabled={reactingMessageId === m.id}
                      aria-pressed={m.viewer_has_thumb_up === true}
                      aria-label={
                        (m.thumb_up_count ?? 0) > 0
                          ? `Thumbs up, ${m.thumb_up_count ?? 0}`
                          : "Thumbs up"
                      }
                      onClick={() => onToggleReaction(m.id)}
                      className={reactionHitClass}
                    >
                      <span className={reactionInnerClass} aria-hidden>
                        <span className="text-[17px] leading-none select-none">
                          👍
                        </span>
                      </span>
                    </button>
                  ) : typeof m.thumb_up_count === "number" &&
                    m.thumb_up_count > 0 ? (
                    <span
                      className="mt-0.5 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center"
                      aria-hidden
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-[17px] text-neutral-800/78 app-dark:text-white/78">
                        👍
                      </span>
                    </span>
                  ) : null
                ) : null}

                <div
                  className={`min-w-0 rounded-[1.15rem] px-3.5 py-2.5 text-[15px] leading-snug shadow-sm ${
                    mine
                      ? "bg-gradient-to-br from-amber-100/95 via-yellow-50/98 to-amber-50/88 text-neutral-900/[0.91] ring-1 ring-amber-200/55 app-dark:from-amber-300/34 app-dark:via-amber-400/22 app-dark:to-amber-500/26 app-dark:text-[var(--text)]/[0.94] app-dark:ring-amber-400/22"
                      : "bg-[color-mix(in_oklab,var(--surface-2)_84%,var(--bg))] text-[var(--text)]/88 ring-1 ring-black/[0.04] app-dark:bg-[color-mix(in_oklab,var(--surface-2)_56%,var(--bg))] app-dark:text-[var(--text)]/92 app-dark:ring-white/[0.08]"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>

                {!mine && showReactionCtl ? (
                  reactionsInteractive ? (
                    <button
                      type="button"
                      disabled={reactingMessageId === m.id}
                      aria-pressed={m.viewer_has_thumb_up === true}
                      aria-label={
                        (m.thumb_up_count ?? 0) > 0
                          ? `Thumbs up, ${m.thumb_up_count ?? 0}`
                          : "Thumbs up"
                      }
                      onClick={() => onToggleReaction(m.id)}
                      className={reactionHitClass}
                    >
                      <span className={reactionInnerClass} aria-hidden>
                        <span className="text-[17px] leading-none select-none">
                          👍
                        </span>
                      </span>
                    </button>
                  ) : typeof m.thumb_up_count === "number" &&
                    m.thumb_up_count > 0 ? (
                    <span
                      className="mt-0.5 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center"
                      aria-hidden
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-[17px] text-neutral-800/78 app-dark:text-white/78">
                        👍
                      </span>
                    </span>
                  ) : null
                ) : null}
              </div>
            </li>
          </Fragment>
        );
      })}
    </ul>
  );
}
