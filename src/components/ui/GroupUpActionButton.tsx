import {
  useEffect,
  useSyncExternalStore,
  type MouseEvent,
} from "react";
import { PiUsers, PiUsersFill } from "react-icons/pi";
import useAuthActionGate from "../../hooks/useAuthActionGate";
import {
  openGroupUpCreate,
  openGroupUpManage,
  type GroupUpSourceScheduleContext,
} from "../../lib/groupUpActiveOverlayStore";
import {
  getGroupUpOwnStatus,
  isGroupUpOwnStateLoadFailed,
  isGroupUpOwnStateResolving,
  isGroupUpOwnViewerSignedIn,
  requestGroupUpOwnState,
  subscribeGroupUpOwnState,
} from "../../lib/groupUpOwnStore";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

/**
 * Group Up action — create / manage organizer-led group discovery.
 */
export default function GroupUpActionButton({
  postId,
  sourceCaption,
  sourceSchedule,
  size = 20,
  compactLabel = false,
  className = "",
}: {
  postId: string;
  sourceCaption?: string | null;
  sourceSchedule?: GroupUpSourceScheduleContext | null;
  size?: number;
  compactLabel?: boolean;
  className?: string;
}) {
  const signedIn = useSyncExternalStore(
    subscribeGroupUpOwnState,
    isGroupUpOwnViewerSignedIn
  );
  const status = useSyncExternalStore(subscribeGroupUpOwnState, () =>
    getGroupUpOwnStatus(postId)
  );
  const resolving = useSyncExternalStore(subscribeGroupUpOwnState, () =>
    isGroupUpOwnStateResolving(postId)
  );
  const loadFailed = useSyncExternalStore(subscribeGroupUpOwnState, () =>
    isGroupUpOwnStateLoadFailed(postId)
  );
  const { ensureAuthed } = useAuthActionGate();

  useEffect(() => {
    if (!signedIn) return;
    if (status === "loading" || loadFailed) {
      requestGroupUpOwnState(postId);
    }
  }, [postId, signedIn, status, loadFailed]);

  const active = signedIn && status === "active";
  const showLoading = signedIn && resolving;

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!ensureAuthed()) return;
    if (!isGroupUpOwnViewerSignedIn()) return;
    if (resolving) return;

    if (loadFailed || status === "loading") {
      requestGroupUpOwnState(postId);
      return;
    }

    if (status === "active") {
      openGroupUpManage(postId, sourceCaption, sourceSchedule);
      return;
    }

    openGroupUpCreate(postId, sourceCaption, sourceSchedule);
  };

  const Icon = active ? PiUsersFill : PiUsers;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={showLoading}
      aria-pressed={active}
      aria-busy={showLoading}
      aria-label={peopleUiCopy.groupUp}
      className={`flex shrink-0 items-center gap-1 transition-all duration-200 ${
        showLoading ? "opacity-50" : ""
      } ${className}`}
    >
      <Icon size={size} className={active ? "text-primary" : undefined} />
      <span
        className={[
          compactLabel ? "text-[10px]" : "text-xs",
          "font-semibold leading-none",
          active ? "text-primary" : "text-[var(--text)]/90",
        ].join(" ")}
      >
        {peopleUiCopy.groupUp}
      </span>
    </button>
  );
}
