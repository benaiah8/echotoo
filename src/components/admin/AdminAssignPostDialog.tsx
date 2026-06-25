import { useCallback, useEffect, useState } from "react";
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
} from "../../api/services/adminPosts";
import { getViewerAuthUserId } from "../../api/services/follows";

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

  useEffect(() => {
    if (!open) return;
    void getViewerAuthUserId().then(setViewerId);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelected(null);
      setConfirmOpen(false);
      setSearching(false);
      setTransferring(false);
    }
  }, [open]);

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
        open={open && !confirmOpen}
        onBackdropClick={onClose}
        zTier="aboveDialog"
        aria-labelledby="admin-assign-post-title"
      >
        <div
          className={`${frostedModalPanelClassName} w-[min(100%,22rem)] max-h-[min(80vh,28rem)] flex flex-col`}
          style={frostedModalPanelStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 pt-4 pb-2 border-b border-[var(--border)]/60">
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

          <div className="px-4 py-3">
            <input
              type="search"
              autoComplete="off"
              enterKeyHint="search"
              placeholder="Search username or name…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] app-light:bg-white px-3 py-2 text-sm text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
            {query.trim().length < 2 ? (
              <p className="px-2 py-2 text-xs text-[var(--text)]/50">
                Type at least 2 characters to search.
              </p>
            ) : searching ? (
              <p className="px-2 py-2 text-xs text-[var(--text)]/50">
                Searching…
              </p>
            ) : results.length === 0 ? (
              <p className="px-2 py-2 text-xs text-[var(--text)]/50">
                No users found.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {results.map((r) => {
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

          <div className="px-4 py-3 border-t border-[var(--border)]/60">
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
