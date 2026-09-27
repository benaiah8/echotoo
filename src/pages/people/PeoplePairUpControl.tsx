import { useState, type MouseEvent } from "react";
import { PiCheck } from "react-icons/pi";
import toast from "react-hot-toast";
import type { PeoplePairUpJoinStatus } from "../../hooks/usePeoplePairUpJoinState";
import { openPairUpManage } from "../../lib/pairUpActiveOverlayStore";
import { showPairUpJoinToast } from "../../lib/showPairUpJoinToast";
import { peopleUiCopy } from "./peopleUiCopy";

export default function PeoplePairUpControl({
  sourcePostId,
  status,
  onJoin,
}: {
  sourcePostId: string;
  status: PeoplePairUpJoinStatus;
  onJoin: (sourcePostId: string) => Promise<void>;
  /** Leave is owned by PairUpActiveOverlay; kept for caller API stability. */
  onLeave: (sourcePostId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const joined = status === "joined";
  const pending = status === "pending";
  const disabled = busy || pending;

  const handleClick = async (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy || pending) return;
    if (joined) {
      openPairUpManage(sourcePostId);
      return;
    }
    setBusy(true);
    try {
      await onJoin(sourcePostId);
      showPairUpJoinToast(sourcePostId);
    } catch {
      toast.error(peopleUiCopy.joinError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => void handleClick(e)}
      disabled={disabled}
      aria-pressed={joined}
      aria-busy={busy || pending}
      aria-label={peopleUiCopy.rowAction}
      className={[
        "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold leading-none",
        "border transition-colors",
        joined
          ? "border-[var(--bottom-tab-feed-notif-active-border)] bg-[var(--bottom-tab-feed-notif-active-bg)] text-[var(--bottom-tab-feed-notif-active-fg)] shadow-[var(--bottom-tab-feed-notif-active-shadow)]"
          : "border-[var(--bottom-tab-border)] bg-[var(--glass-bg)] text-[var(--text)]",
        pending || busy ? "opacity-50" : "active:scale-[0.98]",
      ].join(" ")}
    >
      {joined ? (
        <PiCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : null}
      {peopleUiCopy.rowAction}
    </button>
  );
}
