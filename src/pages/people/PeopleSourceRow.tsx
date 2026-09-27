import { useMemo } from "react";
import type { FeedItem } from "../../api/queries/getPublicFeed";
import { getRailCardCoverUrl } from "../../lib/railCardCoverUrl";
import { getPostScheduleLabel } from "../../lib/postScheduleLabel";
import type { PeoplePairUpJoinStatus } from "../../hooks/usePeoplePairUpJoinState";
import PeoplePairUpControl from "./PeoplePairUpControl";

export default function PeopleSourceRow({
  post,
  joinStatus,
  onJoin,
  onLeave,
  onOpenDetail,
}: {
  post: FeedItem;
  joinStatus: PeoplePairUpJoinStatus;
  onJoin: (sourcePostId: string) => Promise<void>;
  onLeave: (sourcePostId: string) => Promise<void>;
  onOpenDetail: (post: FeedItem) => void;
}) {
  const coverUrl = useMemo(() => getRailCardCoverUrl(post), [post]);
  const schedule = useMemo(
    () =>
      getPostScheduleLabel({
        type: post.type,
        createdAt: post.created_at,
        selectedDates: post.selected_dates,
        isRecurring: post.is_recurring,
        recurrenceDays: post.recurrence_days,
      }),
    [
      post.type,
      post.created_at,
      post.selected_dates,
      post.is_recurring,
      post.recurrence_days,
    ]
  );
  const title = post.caption?.trim() || "Untitled";

  return (
    <div className="flex items-center gap-3 border-b border-[var(--border)]/50 px-1 py-2.5">
      <button
        type="button"
        onClick={() => onOpenDetail(post)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-2)]">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-[var(--text)]">
            {title}
          </span>
          {schedule.label ? (
            <span className="mt-0.5 block truncate text-[12px] text-[var(--text)]/55">
              {schedule.label}
            </span>
          ) : null}
        </span>
      </button>
      <PeoplePairUpControl
        sourcePostId={post.id}
        status={joinStatus}
        onJoin={onJoin}
        onLeave={onLeave}
      />
    </div>
  );
}
