import {
  useEffect,
  useSyncExternalStore,
  type MouseEvent,
} from "react";
import { PiHandshake, PiHandshakeFill } from "react-icons/pi";
import useAuthActionGate from "../../hooks/useAuthActionGate";
import {
  openOpenPlanCreate,
  openOpenPlanManage,
} from "../../lib/openPlanActiveOverlayStore";
import {
  getOpenPlanOwnStatus,
  isOpenPlanOwnStateLoadFailed,
  isOpenPlanOwnStateResolving,
  isOpenPlanOwnViewerSignedIn,
  requestOpenPlanOwnState,
  subscribeOpenPlanOwnState,
} from "../../lib/openPlanOwnStore";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

/**
 * Experience (Place) P2P action — create / manage Open Plan.
 * Signed-out: idle look, Auth gate, never loading / never batch RPC.
 * Signed-in: openPlanOwnStore loading | idle | active.
 */
export default function OpenPlanActionButton({
  postId,
  size = 20,
  compactLabel = false,
  className = "",
}: {
  postId: string;
  size?: number;
  compactLabel?: boolean;
  className?: string;
}) {
  const signedIn = useSyncExternalStore(
    subscribeOpenPlanOwnState,
    isOpenPlanOwnViewerSignedIn
  );
  const status = useSyncExternalStore(subscribeOpenPlanOwnState, () =>
    getOpenPlanOwnStatus(postId)
  );
  const resolving = useSyncExternalStore(subscribeOpenPlanOwnState, () =>
    isOpenPlanOwnStateResolving(postId)
  );
  const loadFailed = useSyncExternalStore(subscribeOpenPlanOwnState, () =>
    isOpenPlanOwnStateLoadFailed(postId)
  );
  const { ensureAuthed } = useAuthActionGate();

  useEffect(() => {
    if (!signedIn) return;
    if (status === "loading" || loadFailed) {
      requestOpenPlanOwnState(postId);
    }
  }, [postId, signedIn, status, loadFailed]);

  const active = signedIn && status === "active";
  const showLoading = signedIn && resolving;

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!ensureAuthed()) return;

    if (!isOpenPlanOwnViewerSignedIn()) return;

    if (resolving) return;

    if (loadFailed || status === "loading") {
      requestOpenPlanOwnState(postId);
      return;
    }

    if (status === "active") {
      openOpenPlanManage(postId);
      return;
    }

    openOpenPlanCreate(postId);
  };

  const Icon = active ? PiHandshakeFill : PiHandshake;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={showLoading}
      aria-pressed={active}
      aria-busy={showLoading}
      aria-label={peopleUiCopy.rowAction}
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
        {peopleUiCopy.rowAction}
      </span>
    </button>
  );
}
