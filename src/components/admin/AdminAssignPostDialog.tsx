import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Avatar from "../ui/Avatar";
import ConfirmDialog from "../ui/ConfirmDialog";
import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "../ui/FrostedCenterModal";
import {
  searchProfiles,
  type ProfileSearchRow,
} from "../../api/queries/searchProfiles";
import {
  adminTransferPostOwnership,
  invalidateCachesAfterPostOwnershipTransfer,
  listRecentAdminAssignmentTargets,
} from "../../api/services/adminPosts";
import { getViewerAuthUserId } from "../../api/services/follows";
import { useCreateKeyboardInset } from "../../hooks/useCreateKeyboardInset";
import { useOverlayBackgroundScrollLock } from "../../hooks/useOverlayBackgroundScrollLock";
import { blurActiveEditableFirst } from "../../lib/blurActiveEditableFirst";

/** Aligns with BottomDrawer / useCreateKeyboardInset — keyboard affects layout. */
const KEYBOARD_MAX_HEIGHT_THRESHOLD_PX = 48;

type Props = {
  open: boolean;
  onClose: () => void;
  postId: string;
  currentAuthorId?: string | null;
  onTransferred?: () => void;
};

function profileLabel(p: ProfileSearchRow): string {
  const name = p.display_name?.trim() || p.username?.trim() || "User";
  const handle = p.username ? `@${p.username}` : null;
  return handle && handle !== name ? `${name} (${handle})` : name;
}

export default function AdminAssignPostDialog({
  open,
  onClose,
  postId,
  currentAuthorId,
  onTransferred,
}: Props) {
  const [query, setQuery] = useState("");
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [results, setResults] = useState<ProfileSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ProfileSearchRow | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [quickTargets, setQuickTargets] = useState<ProfileSearchRow[]>([]);
  const [quickTargetsLoading, setQuickTargetsLoading] = useState(false);

  const loadQuickTargets = useCallback(async () => {
    setQuickTargetsLoading(true);
    try {
      const rows = await listRecentAdminAssignmentTargets(8);
      setQuickTargets(rows);
    } catch (e) {
      console.error("[AdminAssignPostDialog] quick targets", e);
      setQuickTargets([]);
    } finally {
      setQuickTargetsLoading(false);
    }
  }, []);

  const { keyboardInsetPx } = useCreateKeyboardInset();
  const kbRounded = Math.round(keyboardInsetPx);
  const keyboardShrinksSheet = kbRounded > KEYBOARD_MAX_HEIGHT_THRESHOLD_PX;

  const panelMaxHeight = useMemo(
    () =>
      keyboardShrinksSheet
        ? `min(28rem, calc(100dvh - ${kbRounded}px - env(safe-area-inset-top, 0px) - 0.75rem))`
        : `min(28rem, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 2rem))`,
    [keyboardShrinksSheet, kbRounded]
  );

  const panelStyle = useMemo(
    () => ({
      ...frostedModalPanelStyle,
      maxHeight: panelMaxHeight,
      transition: "max-height 220ms ease-out",
    }),
    [panelMaxHeight]
  );

  const searchDialogVisible = open && !confirmOpen;

  const quickTargetUserIds = useMemo(
    () => new Set(quickTargets.map((t) => t.user_id)),
    [quickTargets]
  );

  const displayedSearchResults = useMemo(
    () => results.filter((r) => !quickTargetUserIds.has(r.user_id)),
    [results, quickTargetUserIds]
  );

  useEffect(() => {
    if (!open) return;
    void getViewerAuthUserId().then(setViewerId);
    void loadQuickTargets();
  }, [open, loadQuickTargets]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setQuickTargets([]);
      setSelected(null);
      setConfirmOpen(false);
      setSearching(false);
      setTransferring(false);
      setQuickTargetsLoading(false);
    }
  }, [open]);

  useOverlayBackgroundScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timeoutId = setTimeout(() => {
      void searchProfiles(q, viewerId ?? undefined, { limit: 20 })
        .then((rows) => {
          setResults(rows.filter((r) => !!r.user_id));
        })
        .catch((e) => {
          console.error("[AdminAssignPostDialog] search", e);
          setResults([]);
        })
        .finally(() => setSearching(false));
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [open, query, viewerId]);

  const handleSelect = useCallback(
    (profile: ProfileSearchRow) => {
      if (!profile.user_id) {
        toast.error("This profile cannot be assigned (missing user id).");
        return;
      }
      if (currentAuthorId && profile.user_id === currentAuthorId) {
        toast("This user is already the post owner.");
        return;
      }
      blurActiveEditableFirst();
      setSelected(profile);
      setConfirmOpen(true);
    },
    [currentAuthorId]
  );

  const handleConfirmTransfer = async () => {
    if (!selected?.user_id) return;
    setTransferring(true);
    try {
      const result = await adminTransferPostOwnership(
        postId,
        selected.user_id
      );

      await invalidateCachesAfterPostOwnershipTransfer(
        result.postId,
        result.oldAuthorId,
        result.newAuthorId
      );

      if (result.didChange) {
        toast.success(`Post assigned to ${profileLabel(selected)}`);
        setQuickTargets((prev) => {
          const rest = prev.filter((p) => p.user_id !== selected.user_id);
          return [selected, ...rest].slice(0, 8);
        });
        void loadQuickTargets();
      } else {
        toast("Post is already owned by that user.");
      }

      setConfirmOpen(false);
      onClose();
      onTransferred?.();
    } catch (e) {
      console.error("[AdminAssignPostDialog] transfer", e);
      const msg = e instanceof Error ? e.message : "Transfer failed";
      toast.error(msg.trim() ? msg : "Transfer failed");
    } finally {
      setTransferring(false);
    }
  };

  return (
    <>
      <FrostedCenterModal
        open={searchDialogVisible}
        onBackdropClick={onClose}
        zTier="aboveDialog"
        aria-labelledby="admin-assign-post-title"
        containerClassName={
          keyboardShrinksSheet
            ? "items-start justify-center pt-[max(0.5rem,env(safe-area-inset-top))]"
            : ""
        }
      >
        <div
          className={`${frostedModalPanelClassName} w-[min(100%,22rem)] flex min-h-0 flex-col !p-0 overflow-hidden`}
          style={panelStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 px-4 pt-4 pb-2 border-b border-[var(--border)]/60">
            <h2
              id="admin-assign-post-title"
              className="text-sm font-semibold text-[var(--text)]"
            >
              Assign post
            </h2>
            <p className="mt-1 text-[11px] text-[var(--text)]/55 leading-snug">
              Search for a user to transfer ownership. Uses their account id, not
              profile row id.
            </p>
          </div>

          <div className="shrink-0 px-4 pb-2 border-b border-[var(--border)]/40">
            <p className="text-[10px] font-medium text-[var(--text)]/50 uppercase tracking-wide mb-1.5">
              Quick targets
            </p>
            {quickTargetsLoading && quickTargets.length === 0 ? (
              <p className="text-[11px] text-[var(--text)]/45">Loading…</p>
            ) : quickTargets.length === 0 ? (
              <p className="text-[11px] text-[var(--text)]/45 leading-snug">
                Recent assignment targets will appear here.
              </p>
            ) : (
              <div
                className="flex gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [-webkit-overflow-scrolling:touch]"
                role="list"
                aria-label="Quick assignment targets"
              >
                {quickTargets.map((t) => {
                  const isCurrent =
                    !!currentAuthorId && t.user_id === currentAuthorId;
                  const label =
                    t.display_name?.trim() || t.username?.trim() || "User";
                  return (
                    <button
                      key={t.user_id}
                      type="button"
                      role="listitem"
                      disabled={isCurrent}
                      onClick={() => handleSelect(t)}
                      title={
                        isCurrent
                          ? "Current owner"
                          : t.username
                            ? `@${t.username}`
                            : label
                      }
                      className="shrink-0 flex max-w-[9.5rem] items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg)]/40 app-light:bg-white/80 px-2 py-1.5 text-left hover:bg-[var(--glass-active-bg)] disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                    >
                      <Avatar
                        url={t.avatar_url}
                        name={label}
                        size={22}
                        className="shrink-0"
                      />
                      <span className="min-w-0 truncate text-[11px] font-medium text-[var(--text)]">
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="shrink-0 px-4 py-3">
            <input
              type="search"
              autoComplete="off"
              enterKeyHint="search"
              placeholder="Search username or name…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] app-light:bg-white px-3 py-2 text-[16px] text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-3 [-webkit-overflow-scrolling:touch]">
            {query.trim().length < 2 ? (
              <p className="px-2 py-2 text-xs text-[var(--text)]/50">
                Type at least 2 characters to search.
              </p>
            ) : searching ? (
              <p className="px-2 py-2 text-xs text-[var(--text)]/50">
                Searching…
              </p>
            ) : displayedSearchResults.length === 0 ? (
              <p className="px-2 py-2 text-xs text-[var(--text)]/50">
                No users found.
              </p>
            ) : (
              <ul className="flex flex-col gap-1 pb-1">
                {displayedSearchResults.map((r) => {
                  const isCurrent =
                    !!currentAuthorId && r.user_id === currentAuthorId;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        disabled={isCurrent}
                        onClick={() => handleSelect(r)}
                        className="w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-[var(--glass-active-bg)] disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                      >
                        <Avatar
                          url={r.avatar_url}
                          name={r.display_name || r.username || ""}
                          size={36}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-[var(--text)] truncate">
                            {r.display_name || r.username || "User"}
                          </div>
                          {r.username ? (
                            <div className="text-[11px] text-[var(--text)]/55 truncate">
                              @{r.username}
                            </div>
                          ) : null}
                          {isCurrent ? (
                            <div className="text-[10px] text-[var(--text)]/45 mt-0.5">
                              Current owner
                            </div>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="shrink-0 px-4 py-3 border-t border-[var(--border)]/60">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]/80 hover:bg-[var(--glass-active-bg)] touch-manipulation"
            >
              Cancel
            </button>
          </div>
        </div>
      </FrostedCenterModal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          if (transferring) return;
          setConfirmOpen(false);
          setSelected(null);
        }}
        onConfirm={handleConfirmTransfer}
        title="Transfer ownership?"
        message={
          selected ? (
            <>
              Transfer this post to{" "}
              <span className="font-semibold">{profileLabel(selected)}</span>?
              Engagement stays on the post; only the owner changes.
            </>
          ) : (
            "Transfer this post?"
          )
        }
        confirmLabel="Transfer"
        confirmVariant="primary"
        isLoading={transferring}
        higherZIndex
      />
    </>
  );
}
