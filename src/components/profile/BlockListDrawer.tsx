import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { PiArrowCounterClockwise, PiX } from "react-icons/pi";
import toast from "react-hot-toast";
import Avatar from "../ui/Avatar";
import FrostedCenterModal from "../ui/FrostedCenterModal";
import {
  listMyBlockedUsersWithProfiles,
  unblockUser,
  type BlockedUserListRow,
} from "../../api/services/blocks";
import { getViewerId } from "../../api/services/follows";
import { getErrorMessage } from "../../lib/errorHandling";

type Props = {
  open: boolean;
  onClose: () => void;
};

const CONTENT_MAX_WIDTH = "min(420px, calc(100vw - 40px))";

const glassPillClass =
  "rounded-full border border-[var(--bottom-tab-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] [-webkit-backdrop-filter:blur(var(--glass-blur))] shadow-[0_2px_10px_rgba(0,0,0,0.12),0_0_14px_color-mix(in_oklab,var(--brand)_12%,transparent)]";

const closeButtonClass = [
  glassPillClass,
  "flex h-9 w-9 shrink-0 items-center justify-center p-0 text-[var(--text)]",
  "transition-[background-color,transform] hover:bg-[var(--glass-active-bg)] active:scale-[0.99]",
  "disabled:pointer-events-none disabled:opacity-40",
].join(" ");

const rowPillClass = [
  "flex w-full min-h-[56px] items-center gap-3",
  glassPillClass,
  "py-2.5 pl-3 pr-2.5",
  "transition-[background-color,transform] hover:bg-[var(--glass-active-bg)]/60",
].join(" ");

const statusPillClass = [
  "w-full px-4 py-3 text-center text-sm text-[var(--text)]/65",
  glassPillClass,
].join(" ");

const listScrollFadeStyle: CSSProperties = {
  maskImage:
    "linear-gradient(to bottom, transparent 0, black 24px, black calc(100% - 24px), transparent 100%)",
  WebkitMaskImage:
    "linear-gradient(to bottom, transparent 0, black 24px, black calc(100% - 24px), transparent 100%)",
};

export default function BlockListDrawer({ open, onClose }: Props) {
  const [rows, setRows] = useState<BlockedUserListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const fetchGenerationRef = useRef(0);

  const loadRows = useCallback(async () => {
    const generation = ++fetchGenerationRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await listMyBlockedUsersWithProfiles();
      if (generation !== fetchGenerationRef.current) return;
      setRows(data);
    } catch (e) {
      if (generation !== fetchGenerationRef.current) return;
      console.error("[BlockListDrawer] load failed", e);
      setError(getErrorMessage(e) || "Could not load blocked accounts.");
      setRows([]);
    } finally {
      if (generation === fetchGenerationRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setRows([]);
    setError(null);
    void loadRows();
  }, [open, loadRows]);

  useEffect(() => {
    if (!open) return;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || unblockingId) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, unblockingId]);

  const handleUnblock = async (row: BlockedUserListRow) => {
    if (unblockingId) return;
    setUnblockingId(row.blockedUserId);
    try {
      const viewerProfileId = await getViewerId();
      await unblockUser(row.blockedUserId, {
        affectedProfileId: row.profileId,
        viewerProfileId,
      });
      setRows((prev) =>
        prev.filter((r) => r.blockedUserId !== row.blockedUserId)
      );
      toast.success("Unblocked");
    } catch (e) {
      toast.error(getErrorMessage(e) || "Could not unblock.");
    } finally {
      setUnblockingId(null);
    }
  };

  if (!open) return null;

  return (
    <FrostedCenterModal
      open={open}
      onBackdropClick={unblockingId ? undefined : onClose}
      zTier="dialog"
      aria-labelledby="block-list-title"
      containerClassName="px-5 py-6 sm:px-6"
    >
      <div
        className="pointer-events-auto flex w-full min-w-0 max-h-[min(88dvh,calc(100vh-48px))] flex-col gap-3 px-0.5"
        style={{ maxWidth: CONTENT_MAX_WIDTH }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2">
          <h2
            id="block-list-title"
            className={`${glassPillClass} inline-flex h-9 max-w-[min(240px,calc(100vw-120px))] items-center truncate px-3 text-[12px] font-semibold tracking-tight text-[var(--text)]`}
          >
            Blocked accounts
          </h2>
          <button
            type="button"
            disabled={!!unblockingId}
            onClick={onClose}
            className={closeButtonClass}
            aria-label="Close blocked accounts"
          >
            <PiX size={18} aria-hidden />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {loading && rows.length === 0 && !error ? (
            <p className={statusPillClass}>Loading…</p>
          ) : null}

          {!loading && error ? (
            <div className="flex flex-col gap-2">
              <p className={statusPillClass}>{error}</p>
              <button
                type="button"
                onClick={() => void loadRows()}
                className={`${glassPillClass} w-full px-4 py-2.5 text-[11px] font-medium text-[var(--text)] transition hover:bg-[var(--glass-active-bg)] active:scale-[0.99]`}
              >
                Retry
              </button>
            </div>
          ) : null}

          {!loading && !error && rows.length === 0 ? (
            <p className={statusPillClass}>
              You haven&apos;t blocked anyone.
            </p>
          ) : null}

          {!error && rows.length > 0 ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] flex flex-col gap-2 pt-3 pb-3"
                style={listScrollFadeStyle}
              >
              <ul className="flex flex-col gap-2">
                {rows.map((row) => {
                  const displayName =
                    row.display_name?.trim() ||
                    row.username?.trim() ||
                    "Unknown user";
                  const busy = unblockingId === row.blockedUserId;

                  return (
                    <li key={row.blockId}>
                      <div className={rowPillClass}>
                        <Avatar
                          url={row.avatar_url}
                          name={displayName}
                          size={40}
                          userId={row.profileId ?? row.blockedUserId}
                          tightLineBox
                          disableInnerPointer
                          className="shrink-0 self-center"
                        />
                        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 self-center">
                          <div className="truncate text-sm font-medium leading-tight text-[var(--text)]">
                            {displayName}
                          </div>
                          <div className="truncate text-xs leading-tight text-[var(--text)]/60">
                            @{row.username?.trim() || "user"}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={busy || !!unblockingId}
                          onClick={() => void handleUnblock(row)}
                          className="inline-flex h-9 shrink-0 items-center justify-center self-center rounded-full border border-emerald-500/45 bg-[color-mix(in_oklab,#22c55e_16%,var(--glass-bg))] px-3.5 text-[10px] font-semibold text-emerald-950 shadow-sm backdrop-blur-[var(--glass-blur)] transition hover:bg-[color-mix(in_oklab,#22c55e_24%,var(--glass-bg))] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 app-dark:border-emerald-400/35 app-dark:bg-[color-mix(in_oklab,#22c55e_22%,var(--glass-bg))] app-dark:text-emerald-50"
                          aria-label={`Unblock ${displayName}`}
                        >
                          <span className="inline-flex items-center gap-1">
                            <PiArrowCounterClockwise
                              size={12}
                              className="shrink-0 opacity-90"
                              aria-hidden
                            />
                            Unblock
                          </span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </FrostedCenterModal>
  );
}
