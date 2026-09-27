import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type MouseEvent,
} from "react";
import { PiHandshake, PiHandshakeFill } from "react-icons/pi";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import useAuthActionGate from "../../hooks/useAuthActionGate";
import { joinPairUp } from "../../api/services/pairUp";
import { openPairUpManage } from "../../lib/pairUpActiveOverlayStore";
import {
  getPairUpJoinStatus,
  isPairUpJoinStateLoadFailed,
  isPairUpJoinStateResolving,
  requestPairUpJoinState,
  setOptimisticPairUpJoinState,
  subscribePairUpJoinState,
} from "../../lib/pairUpJoinStore";
import { resolvePhotoPromptOffer } from "../../lib/peoplePhotoPromptPolicy";
import {
  isPairUpPhotoPromptOpen,
  openPairUpPhotoPrompt,
  subscribePairUpPhotoPrompt,
} from "../../lib/pairUpPhotoPromptStore";
import { showPairUpJoinToast } from "../../lib/showPairUpJoinToast";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import type { RootState } from "../../app/store";

/**
 * Shared P2P join/leave action for post surfaces (feed card actions, post
 * detail actions). State comes from the batched Pair Up join store, so a page
 * of cards costs one RPC. Manage / note / leave UI lives in PairUpActiveOverlay.
 *
 * Join-first cold start: tapping P2P joins immediately; optional photo
 * enrichment may appear after a successful join (cadence-gated).
 */
export default function PairUpActionButton({
  postId,
  size = 20,
  compactLabel = false,
  className = "",
}: {
  postId: string;
  size?: number;
  /** Post detail glass pill uses the smaller label, matching its counts. */
  compactLabel?: boolean;
  className?: string;
}) {
  const status = useSyncExternalStore(subscribePairUpJoinState, () =>
    getPairUpJoinStatus(postId),
  );
  const resolving = useSyncExternalStore(subscribePairUpJoinState, () =>
    isPairUpJoinStateResolving(postId),
  );
  const loadFailed = useSyncExternalStore(subscribePairUpJoinState, () =>
    isPairUpJoinStateLoadFailed(postId),
  );
  const photoPromptOpen = useSyncExternalStore(
    subscribePairUpPhotoPrompt,
    isPairUpPhotoPromptOpen,
  );

  const authUserId = useSelector(
    (state: RootState) => state.auth?.user?.id ?? null,
  );
  const [busy, setBusy] = useState(false);
  const { ensureAuthed } = useAuthActionGate();

  useEffect(() => {
    if (status === "pending") requestPairUpJoinState(postId);
  }, [postId, status]);

  useEffect(() => {
    setBusy(false);
  }, [postId]);

  const joined = status === "joined";
  /** Active/joined must remain tappable for manage even while photo prompt is open. */
  const disabled = joined ? false : busy || resolving || photoPromptOpen;

  const proceedJoin = useCallback(async (targetPostId: string): Promise<boolean> => {
    setBusy(true);
    const revert = setOptimisticPairUpJoinState(targetPostId, true);
    try {
      await joinPairUp(targetPostId);
      showPairUpJoinToast(targetPostId);
      return true;
    } catch {
      revert?.();
      toast.error(peopleUiCopy.joinError);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const maybeOpenPostJoinPhotoPrompt = useCallback(
    (userId: string, targetPostId: string) => {
      try {
        const profile = resolvePhotoPromptOffer(userId, "pair_up_join", false);
        if (!profile) return;
        openPairUpPhotoPrompt({
          intentKey: `join-done:${targetPostId}`,
          profileId: profile.profileId,
          userId: profile.userId,
          photos: profile.photos,
          onContinue: () => {},
        });
      } catch {
        /* Join already succeeded — photo prompt is optional enrichment. */
      }
    },
    [],
  );

  const handleClick = async (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!ensureAuthed()) return;
    if (joined) {
      openPairUpManage(postId);
      return;
    }
    if (busy) return;
    if (resolving) return;
    if (photoPromptOpen) return;
    if (loadFailed || status === "pending") {
      requestPairUpJoinState(postId);
      return;
    }

    const userId = authUserId;
    if (!userId) return;

    const ok = await proceedJoin(postId);
    if (!ok) return;

    void maybeOpenPostJoinPhotoPrompt(userId, postId);
  };

  const Icon = joined ? PiHandshakeFill : PiHandshake;

  return (
    <button
      type="button"
      onClick={(e) => void handleClick(e)}
      disabled={disabled}
      aria-pressed={joined}
      aria-busy={busy || resolving}
      aria-label={peopleUiCopy.rowAction}
      className={`flex shrink-0 items-center gap-1 transition-all duration-200 ${
        busy || resolving ? "opacity-50" : ""
      } ${className}`}
    >
      <Icon size={size} className={joined ? "text-primary" : undefined} />
      <span
        className={[
          compactLabel ? "text-[10px]" : "text-xs",
          "font-semibold leading-none",
          joined ? "text-primary" : "text-[var(--text)]/90",
        ].join(" ")}
      >
        {peopleUiCopy.rowAction}
      </span>
    </button>
  );
}
