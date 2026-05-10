import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  INVITE_MAX_PER_SEND,
  INVITE_NOTE_MAX_LENGTH,
  getInviteeIdsAlreadyInvitedForPost,
  sendInvites,
} from "../../api/services/invites";
import {
  getViewerAuthUserId,
  getProfileIdByUserId,
  getViewerId,
  getBatchFollowStatuses,
} from "../../api/services/follows";
import Avatar from "./Avatar";
import BottomDrawer from "./BottomDrawer";
import ConfirmDialog from "./ConfirmDialog";
import DrawerProfileCard from "./DrawerProfileCard";
import {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "./FrostedCenterModal";
import toast from "react-hot-toast";
import { PiCaretDown, PiCaretRight } from "react-icons/pi";

const inviteFrostedPanelStyle: CSSProperties = {
  ...frostedModalPanelStyle,
  maxWidth: "100%",
  boxShadow: "var(--glass-active-shadow, 0 2px 12px rgba(0, 0, 0, 0.1))",
};

const glassInputClass =
  "w-full rounded-full border pl-9 pr-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text)]/50 focus:outline-none focus:ring-2 focus:ring-primary/25";

const glassInputStyle: CSSProperties = {
  backgroundColor: "color-mix(in oklab, var(--glass-bg) 75%, var(--bg))",
  backdropFilter: "blur(var(--glass-blur))",
  WebkitBackdropFilter: "blur(var(--glass-blur))",
  borderColor: "var(--glass-active-border, var(--border))",
};

const INVITE_SEARCH_PAGE_SIZE = 10;

function isInviteeFkError(err: unknown): boolean {
  const msg =
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
      ? (err as { message: string }).message
      : String(err ?? "");
  return (
    msg.includes("invites_invitee_id_fkey") ||
    msg.includes("not present in table users")
  );
}

/** Room for the character counter in the bottom-right; text may pass underneath. */
const messageBoxClass =
  "w-full min-h-[2.75rem] max-h-24 resize-y rounded-xl pl-3 pr-11 pb-6 pt-2 text-sm text-[var(--text)] placeholder:text-[var(--text)]/40 focus:outline-none focus:ring-2 focus:ring-primary/30";

const messageBoxStyle: CSSProperties = {
  ...glassInputStyle,
  borderWidth: 1,
  borderStyle: "solid",
  boxShadow: "inset 0 1px 0 color-mix(in oklab, var(--text) 6%, transparent)",
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  postType: "experience" | "hangout";
  postCaption: string;
  onClosingChange?: (isClosing: boolean) => void; // NEW: callback to notify parent of closing state
};

type User = {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_following?: boolean;
};

type InviteOutcomeSheetState = {
  variant: string;
  title: string;
  message: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  confirmClosesDrawer: boolean;
  snapshot: User[];
  secondaryLabel?: string;
  secondaryVariant?: "primary" | "danger" | "dangerSoft" | "default";
  alreadyUserIds?: string[];
  remainingUserIds?: string[];
};

/** Cached profile rows for invite outcome modals (no profile fetch). */
function InviteOutcomeUserCards({
  userIds,
  snapshot,
  batchedFollowStatuses,
  viewerProfileId,
  className = "",
}: {
  userIds: string[];
  snapshot: User[];
  batchedFollowStatuses?: Record<
    string,
    "none" | "pending" | "following" | "friends"
  >;
  viewerProfileId?: string | null;
  className?: string;
}) {
  const seen = new Set<string>();
  const rows: User[] = [];
  for (const rawId of userIds) {
    const uid = (rawId ?? "").trim();
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    const u = snapshot.find((x) => (x.user_id ?? "").trim() === uid);
    if (u) rows.push(u);
  }
  if (rows.length === 0) return null;
  return (
    <div
      className={`max-h-[min(40vh,280px)] overflow-y-auto overscroll-contain space-y-2 pr-0.5 ${className}`.trim()}
    >
      {rows.map((u) => {
        const cachedStatus = batchedFollowStatuses?.[u.id];
        const showFollow =
          cachedStatus !== undefined && u.id !== viewerProfileId;
        return (
          <DrawerProfileCard
            key={u.user_id}
            id={u.id}
            username={u.username || null}
            display_name={u.display_name || null}
            avatar_url={u.avatar_url || null}
            rowShape="pill"
            showFollowButton={showFollow}
            followStatus={showFollow ? cachedStatus : undefined}
          />
        );
      })}
    </div>
  );
}

export default function InviteDrawer({
  isOpen,
  onClose,
  postId,
  postType,
  postCaption,
  onClosingChange,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedUsersData, setSelectedUsersData] = useState<User[]>([]);
  const [showFollowersOnly, setShowFollowersOnly] = useState(false);
  const [followers, setFollowers] = useState<User[]>([]);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [inviteNote, setInviteNote] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [selectedDetailsOpen, setSelectedDetailsOpen] = useState(false);
  const closingRef = useRef(false);
  /** Viewer profile ID resolved once per drawer load; used for batch follow status and self check */
  const [viewerProfileId, setViewerProfileId] = useState<string | null>(null);
  /** Batched follow statuses keyed by profile id; avoids per-row getFollowStatus */
  const [batchedFollowStatuses, setBatchedFollowStatuses] = useState<
    Record<string, "none" | "pending" | "following" | "friends">
  >({});
  /** Next row offset (Supabase `range`) or next index for local follower slices */
  const [listCursor, setListCursor] = useState(0);
  const [hasMoreList, setHasMoreList] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  /** Centered outcome modal (pre-send already-invited + post-send / errors). */
  const [inviteOutcomeSheet, setInviteOutcomeSheet] =
    useState<InviteOutcomeSheetState | null>(null);

  useEffect(() => {
    if (!isOpen) setInviteOutcomeSheet(null);
  }, [isOpen]);

  // Load followers when component mounts
  const loadFollowers = async () => {
    try {
      const userId = await getViewerAuthUserId();
      if (!userId) return;

      // [PHASE 2.3 - OPTIMIZATION] Use getProfileIdByUserId() for caching and deduplication
      // Why: Centralizes profile fetching, reduces duplicate profiles?select=id requests
      const profileId = await getProfileIdByUserId(userId);

      if (!profileId) {
        console.error("Failed to get current user profile: Profile not found");
        return;
      }

      // Get all users who follow the current user
      // follows table: follower_id follows following_id
      // So we want: follower_id where following_id = current user's profile id
      const { data: followsData, error: followsError } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("following_id", profileId);

      if (followsError) {
        console.error("Failed to load followers:", followsError);
        return;
      }

      if (!followsData || followsData.length === 0) {
        setFollowers([]);
        return;
      }

      // Get profile details for all followers
      const followerProfileIds = followsData.map((f) => f.follower_id);
      const { data: followersData, error: followersError } = await supabase
        .from("profiles")
        .select("id, user_id, username, display_name, avatar_url")
        .in("id", followerProfileIds);

      if (followersError) {
        console.error("Failed to load follower profiles:", followersError);
        return;
      }

      setFollowers(followersData || []);
    } catch (error) {
      console.error("Failed to load followers:", error);
    }
  };

  /**
   * Search (Supabase) or “all followers” list: paged, 10 at a time + optional next page.
   * `append` = load more; otherwise replaces `users` and resets cursor.
   */
  const loadUsers = async (append: boolean) => {
    if (!searchQuery.trim()) {
      setLoading(false);
      if (showFollowersOnly && followers.length > 0) {
        if (!append) {
          setHasMoreList(followers.length > INVITE_SEARCH_PAGE_SIZE);
          setUsers(followers.slice(0, INVITE_SEARCH_PAGE_SIZE));
          setListCursor(
            Math.min(INVITE_SEARCH_PAGE_SIZE, followers.length)
          );
        } else {
          setLoadingMore(true);
          const start = listCursor;
          const chunk = followers.slice(
            start,
            start + INVITE_SEARCH_PAGE_SIZE
          );
          setUsers((prev) => [...prev, ...chunk]);
          const end = start + chunk.length;
          setListCursor(end);
          setHasMoreList(end < followers.length);
          setLoadingMore(false);
        }
      } else if (!append) {
        setUsers([]);
        setListCursor(0);
        setHasMoreList(false);
      }
      return;
    }

    if (!append) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    const offset = append ? listCursor : 0;
    try {
      const userId = await getViewerAuthUserId();
      if (!userId) {
        if (!append) {
          setUsers([]);
          setListCursor(0);
          setHasMoreList(false);
        }
        return;
      }

      let query = supabase
        .from("profiles")
        .select("id, user_id, username, display_name, avatar_url")
        .neq("user_id", userId)
        .or(
          `username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`
        )
        .order("id", { ascending: true });

      if (showFollowersOnly) {
        const followerUserIds = followers.map((f) => f.user_id);
        if (followerUserIds.length === 0) {
          if (!append) {
            setUsers([]);
            setListCursor(0);
            setHasMoreList(false);
          }
          return;
        }
        query = query.in("user_id", followerUserIds);
      }

      // Fetch pageSize + 1 to know if another page exists
      const { data, error } = await query.range(
        offset,
        offset + INVITE_SEARCH_PAGE_SIZE
      );

      if (error) throw error;
      const raw = data || [];
      const hasMore = raw.length > INVITE_SEARCH_PAGE_SIZE;
      const page = hasMore
        ? raw.slice(0, INVITE_SEARCH_PAGE_SIZE)
        : raw;
      if (append) {
        setUsers((prev) => [...prev, ...page]);
      } else {
        setUsers(page);
      }
      setListCursor(offset + page.length);
      setHasMoreList(hasMore);
    } catch (error) {
      console.error("Failed to load users:", error);
    } finally {
      if (!append) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadUsers(false);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, showFollowersOnly, followers]);

  // Load followers when component mounts
  useEffect(() => {
    if (isOpen) {
      loadFollowers();
    } else {
      setInviteNote("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) setSelectedDetailsOpen(false);
  }, [isOpen]);

  useEffect(() => {
    if (selectedUsers.size === 0) setSelectedDetailsOpen(false);
  }, [selectedUsers.size]);

  // Batch load follow statuses once when we have rows to show (one viewer resolve + one batch call per list load)
  useEffect(() => {
    const list = users.length > 0 ? users : [];
    if (list.length === 0) {
      setBatchedFollowStatuses({});
      return;
    }
    let cancelled = false;
    (async () => {
      const vid =
        typeof localStorage !== "undefined"
          ? localStorage.getItem("my_profile_id")
          : null;
      const resolvedViewerId = vid || (await getViewerId());
      if (cancelled || !resolvedViewerId) {
        if (!resolvedViewerId) setViewerProfileId(null);
        setBatchedFollowStatuses({});
        return;
      }
      setViewerProfileId(resolvedViewerId);
      const targetProfileIds = list.map((u) => u.id);
      const statuses = await getBatchFollowStatuses(
        resolvedViewerId,
        targetProfileIds
      );
      if (!cancelled) setBatchedFollowStatuses(statuses);
    })();
    return () => {
      cancelled = true;
    };
  }, [users]);

  // Notify parent of closing state changes and set global flag
  useEffect(() => {
    closingRef.current = isClosing;
    onClosingChange?.(isClosing);

    // Set global flag to prevent navigation
    if (isOpen || isClosing) {
      (window as any).__inviteDrawerActive = true;
    } else {
      (window as any).__inviteDrawerActive = false;
    }

    // [FIX] Cleanup on unmount to ensure flag is never stuck
    return () => {
      if ((window as any).__inviteDrawerActive) {
        (window as any).__inviteDrawerActive = false;
      }
    };
  }, [isClosing, onClosingChange, isOpen]);

  const handleUserSelect = (userId: string) => {
    const uid = (userId ?? "").trim();
    if (!uid) {
      toast.error("This account can't be invited right now.");
      return;
    }

    setSelectedUsers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(uid)) {
        newSet.delete(uid);
        setSelectedUsersData((prevData) =>
          prevData.filter((u) => (u.user_id ?? "").trim() !== uid)
        );
      } else if (prev.size >= INVITE_MAX_PER_SEND) {
        toast.error(
          `You can select up to ${INVITE_MAX_PER_SEND.toLocaleString()} people at a time.`
        );
        return prev;
      } else {
        const allUsers = [...users, ...followers];
        const user = allUsers.find((u) => (u.user_id ?? "").trim() === uid);
        if (!user || !(user.user_id ?? "").trim()) {
          toast.error("This account can't be invited right now.");
          return prev;
        }
        const canonical = user.user_id.trim();
        newSet.add(canonical);
        setSelectedUsersData((prevData) => {
          if (prevData.some((u) => (u.user_id ?? "").trim() === canonical)) {
            return prevData;
          }
          return [...prevData, user];
        });
      }
      return newSet;
    });
  };

  const handleRemoveAllSelected = (e?: MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    setSelectedUsers(new Set());
    setSelectedUsersData([]);
  };

  const handleSelectAllFollowers = () => {
    if (showFollowersOnly && followers.length > 0) {
      const validFollowers = followers.filter((f) => (f.user_id ?? "").trim());
      if (validFollowers.length === 0) {
        toast.error("None of these followers can be invited right now.");
        return;
      }

      const currentlySelected = new Set(selectedUsers);

      if (
        validFollowers.every((f) =>
          currentlySelected.has(f.user_id.trim())
        )
      ) {
        setSelectedUsers(new Set());
        setSelectedUsersData([]);
      } else {
        const capped =
          validFollowers.length > INVITE_MAX_PER_SEND
            ? validFollowers.slice(0, INVITE_MAX_PER_SEND)
            : validFollowers;
        if (validFollowers.length > INVITE_MAX_PER_SEND) {
          toast(
            `Only the first ${INVITE_MAX_PER_SEND.toLocaleString()} followers are selected.`
          );
        }
        setSelectedUsers(new Set(capped.map((f) => f.user_id.trim())));
        setSelectedUsersData(capped);
      }
    }
  };

  const closeInviteDrawerAndReset = useCallback(() => {
    setInviteOutcomeSheet(null);
    setIsClosing(true);
    closingRef.current = true;
    onClose();
    setSelectedUsers(new Set());
    setSelectedUsersData([]);
    setSearchQuery("");
    setInviteNote("");
    setTimeout(() => {
      setIsClosing(false);
      closingRef.current = false;
    }, 1000);
  }, [onClose]);

  const renderOutcomeCards = useCallback(
    (userIds: string[], snapshot: User[], className?: string) => (
      <InviteOutcomeUserCards
        userIds={userIds}
        snapshot={snapshot}
        batchedFollowStatuses={batchedFollowStatuses}
        viewerProfileId={viewerProfileId}
        className={className}
      />
    ),
    [batchedFollowStatuses, viewerProfileId]
  );

  const runSendInvitesFlow = useCallback(
    async (inviteeIds: string[], snapshotSelectedData: User[]) => {
      try {
        const {
          data,
          error,
          alreadyInvited = [],
          skippedInvalidInviteeIds = [],
        } = await sendInvites(postId, inviteeIds, inviteNote);

        const skipped = skippedInvalidInviteeIds ?? [];
        const skippedCount = skipped.length;
        const newCount = data?.length ?? 0;
        const already = alreadyInvited ?? [];
        const alreadyCount = already.length;

        if (error) {
          throw error;
        }

        const nothingFromRpc = newCount === 0 && alreadyCount === 0;

        if (skippedCount > 0 && nothingFromRpc) {
          setInviteOutcomeSheet({
            variant: "post_invalid",
            title: "Couldn't invite",
            snapshot: snapshotSelectedData,
            message: (
              <>
                <p>Some selected accounts could not be invited.</p>
                {renderOutcomeCards(skipped, snapshotSelectedData, "mt-3")}
              </>
            ),
            cancelLabel: "Edit selection",
            confirmLabel: "Got it",
            confirmClosesDrawer: true,
          });
          return;
        }

        if (skippedCount > 0 && newCount === 0 && alreadyCount > 0) {
          setInviteOutcomeSheet({
            variant: "post_skipped_all_already",
            title: "Already invited to this post",
            snapshot: snapshotSelectedData,
            message: (
              <>
                <p>Some selected accounts could not be invited.</p>
                {renderOutcomeCards(skipped, snapshotSelectedData, "mt-3")}
                <p className="mt-3">
                  Everyone else you selected has already been invited to this
                  post. You can edit your selection or invite them to a
                  different post.
                </p>
                {renderOutcomeCards(already, snapshotSelectedData, "mt-3")}
              </>
            ),
            cancelLabel: "Edit selection",
            confirmLabel: "Got it",
            confirmClosesDrawer: true,
          });
          return;
        }

        if (newCount === 0 && alreadyCount > 0 && skippedCount === 0) {
          const single = snapshotSelectedData.length === 1;
          setInviteOutcomeSheet({
            variant: "post_all_already",
            title: "Already invited to this post",
            snapshot: snapshotSelectedData,
            message: (
              <>
                <p>
                  {single ? (
                    <>
                      This person has already been invited to this post. You can
                      invite them to a{" "}
                      <strong className="font-semibold text-[var(--text)]/90">
                        different post
                      </strong>
                      , or choose someone else for this one.
                    </>
                  ) : (
                    <>
                      Everyone selected has already been invited to this post.
                      You can edit your selection or invite different people.
                    </>
                  )}
                </p>
                {renderOutcomeCards(already, snapshotSelectedData, "mt-3")}
              </>
            ),
            cancelLabel: single ? "Choose someone else" : "Edit selection",
            confirmLabel: "Got it",
            confirmClosesDrawer: true,
          });
          return;
        }

        if (newCount > 0 && alreadyCount > 0) {
          setInviteOutcomeSheet({
            variant: "post_mixed_sent",
            title: "Invites sent",
            snapshot: snapshotSelectedData,
            message: (
              <>
                <p>
                  Invites were sent to the new people. The people below were
                  already invited to this post.
                </p>
                {skippedCount > 0 ? (
                  <>
                    <p className="mt-3">
                      Some selected accounts could not be invited.
                    </p>
                    {renderOutcomeCards(skipped, snapshotSelectedData, "mt-3")}
                  </>
                ) : null}
                {renderOutcomeCards(already, snapshotSelectedData, "mt-3")}
              </>
            ),
            cancelLabel: "Edit selection",
            confirmLabel: "Done",
            confirmClosesDrawer: true,
          });
          return;
        }

        if (skippedCount > 0 && newCount > 0) {
          toast.success(
            "Invites sent. Some selected accounts could not be invited."
          );
        } else if (newCount > 0) {
          toast.success(
            `Invites sent to ${newCount} ${newCount === 1 ? "person" : "people"}!`
          );
        } else {
          toast.success("Invites sent!");
        }

        closeInviteDrawerAndReset();
      } catch (error) {
        console.error("Failed to send invites:", error);
        if (isInviteeFkError(error)) {
          setInviteOutcomeSheet({
            variant: "fk",
            title: "Couldn't invite",
            snapshot: snapshotSelectedData,
            message: (
              <p>
                Some selected accounts could not be invited. Please adjust your
                selection and try again.
              </p>
            ),
            cancelLabel: "Edit selection",
            confirmLabel: "Got it",
            confirmClosesDrawer: false,
          });
        } else {
          toast.error("Failed to send invites");
        }
      }
    },
    [postId, inviteNote, renderOutcomeCards, closeInviteDrawerAndReset]
  );

  const handleSendInvites = async () => {
    if (selectedUsers.size === 0) return;

    const snapshot = [...selectedUsersData];
    const selectedIds = Array.from(selectedUsers)
      .map((s) => s.trim())
      .filter(Boolean);

    setSendingInvites(true);
    try {
      let alreadySet: Set<string>;
      try {
        alreadySet = await getInviteeIdsAlreadyInvitedForPost(
          postId,
          selectedIds
        );
      } catch (preErr) {
        console.error("Pre-send already-invited check failed:", preErr);
        toast.error("Could not check existing invites. Try again.");
        return;
      }

      const selectedAlready = selectedIds.filter((id) => alreadySet.has(id));

      if (selectedAlready.length === 0) {
        await runSendInvitesFlow(selectedIds, snapshot);
        return;
      }

      if (selectedIds.length === 1) {
        setInviteOutcomeSheet({
          variant: "pre_personal",
          title: "Already invited to this post",
          snapshot,
          message: (
            <>
              <p>
                This person has already been invited to this post. You can
                invite them to a{" "}
                <strong className="font-semibold text-[var(--text)]/90">
                  different post
                </strong>
                , or choose someone else for this one.
              </p>
              {renderOutcomeCards(selectedAlready, snapshot, "mt-3")}
            </>
          ),
          cancelLabel: "Choose someone else",
          confirmLabel: "Got it",
          confirmClosesDrawer: true,
        });
        return;
      }

      if (selectedAlready.length === selectedIds.length) {
        setInviteOutcomeSheet({
          variant: "pre_all",
          title: "Already invited to this post",
          snapshot,
          message: (
            <>
              <p>
                Everyone selected has already been invited to this post. You can
                edit your selection or invite different people.
              </p>
              {renderOutcomeCards(selectedAlready, snapshot, "mt-3")}
            </>
          ),
          cancelLabel: "Edit selection",
          confirmLabel: "Got it",
          confirmClosesDrawer: true,
        });
        return;
      }

      setInviteOutcomeSheet({
        variant: "pre_some",
        title: "Some people are already invited",
        snapshot,
        message: (
          <>
            <p>
              The people below can&apos;t be invited again to this post. You can
              send the invite to the remaining people, edit your selection, or
              cancel.
            </p>
            {renderOutcomeCards(selectedAlready, snapshot, "mt-3")}
          </>
        ),
        cancelLabel: "Cancel",
        secondaryLabel: "Edit selection",
        secondaryVariant: "default",
        confirmLabel: "Send to remaining people",
        confirmClosesDrawer: false,
        alreadyUserIds: selectedAlready,
        remainingUserIds: selectedIds.filter((id) => !alreadySet.has(id)),
      });
    } finally {
      setSendingInvites(false);
    }
  };

  // Handle close with closing state
  const handleClose = () => {
    setIsClosing(true);
    closingRef.current = true;
    onClose();
    setTimeout(() => {
      setIsClosing(false);
      closingRef.current = false;
    }, 500);
  };

  const headerOverlapCount = 5;

  return (
    <>
      <BottomDrawer
      open={isOpen}
      onClose={handleClose}
      maxHeight="80vh"
      showCloseButton={false}
      className="!inset-x-1.5 sm:!inset-x-2"
      contentClassName="px-4.5 pt-1 pb-0 sm:px-5.5"
      shrinkSheetToContent
      header={
        <div className="w-full">
          <div className="flex items-center justify-between gap-2 min-h-[2.5rem]">
            {selectedUsers.size === 0 ? (
              <div className="text-lg font-semibold text-[var(--text)]">
                Invite People
              </div>
            ) : (
              <button
                type="button"
                id="invite-selected-summary"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-0.5 pl-0.5 pr-1 text-left transition hover:bg-[var(--text)]/5"
                onClick={() => setSelectedDetailsOpen((o) => !o)}
                aria-expanded={selectedDetailsOpen}
                aria-controls="invite-selected-details"
              >
                <div className="flex shrink-0 items-center -space-x-2 pl-0.5">
                  {selectedUsersData
                    .slice(0, headerOverlapCount)
                    .map((user) => (
                      <div
                        key={user.user_id}
                        className="ring-2 ring-[var(--bg)] rounded-full bg-[var(--bg)]"
                      >
                        <Avatar
                          url={user.avatar_url || undefined}
                          name={
                            user.display_name || user.username || "User"
                          }
                          size={30}
                        />
                      </div>
                    ))}
                  {selectedUsers.size > headerOverlapCount ? (
                    <div
                      className="z-10 flex h-[30px] min-w-[30px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-1.5 text-[10px] font-semibold text-[var(--text)]/80 ring-2 ring-[var(--bg)]"
                      aria-label={`${
                        selectedUsers.size - headerOverlapCount
                      } more selected`}
                    >
                      +
                      {(
                        selectedUsers.size - headerOverlapCount
                      ).toLocaleString()}
                    </div>
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-1 text-sm font-medium text-[var(--text)]">
                  <span className="truncate">
                    {selectedUsers.size.toLocaleString()} selected
                  </span>
                  {selectedDetailsOpen ? (
                    <PiCaretDown
                      className="shrink-0 text-[var(--text)]/60"
                      size={18}
                      aria-hidden
                    />
                  ) : (
                    <PiCaretRight
                      className="shrink-0 text-[var(--text)]/60"
                      size={18}
                      aria-hidden
                    />
                  )}
                </div>
              </button>
            )}
            {selectedUsers.size > 0 ? (
              <button
                type="button"
                onClick={handleRemoveAllSelected}
                className="shrink-0 text-sm font-medium text-[var(--text)]/80 hover:text-[var(--text)] transition py-1"
              >
                Remove all
              </button>
            ) : null}
          </div>
          {selectedUsers.size > 0 ? (
            <p className="text-[10px] text-[var(--text)]/45 mt-1.5 pl-0.5">
              Max {INVITE_MAX_PER_SEND.toLocaleString()} per send
            </p>
          ) : null}
        </div>
      }
      footer={
        <div className="border-t border-[var(--border)]/20 px-4.5 pt-2 sm:px-5.5">
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <textarea
              id="invite-note"
              rows={2}
              maxLength={INVITE_NOTE_MAX_LENGTH}
              value={inviteNote}
              onChange={(e) => setInviteNote(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Add a short note with your invite (optional)…"
              aria-label="Optional note to include with your invite"
              className={messageBoxClass}
              style={messageBoxStyle}
            />
            <span
              className="pointer-events-none absolute bottom-2.5 right-3 text-[10px] tabular-nums text-[var(--text)]/45"
              aria-hidden
            >
              {inviteNote.length}/{INVITE_NOTE_MAX_LENGTH}
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleClose();
              }}
              className="flex h-9 min-h-9 min-w-0 flex-1 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--surface-2)]/80"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSendInvites}
              disabled={selectedUsers.size === 0 || sendingInvites}
              className="flex h-9 min-h-9 min-w-0 flex-1 items-center justify-center rounded-full bg-yellow-500 px-3 text-xs font-semibold text-black transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendingInvites
                ? "Sending…"
                : `Send invite${selectedUsers.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex w-full min-w-0 flex-col gap-3">
        {/* Expanded list: in-memory `selectedUsersData` only — no network */}
        {selectedUsers.size > 0 && selectedDetailsOpen ? (
          <div
            id="invite-selected-details"
            role="region"
            aria-labelledby="invite-selected-summary"
            className={`${frostedModalPanelClassName} !max-w-none !p-0 max-h-[min(40vh,280px)] shrink-0 overflow-y-auto overscroll-contain border-[var(--glass-active-border,var(--border))]`}
            style={{
              ...inviteFrostedPanelStyle,
              backgroundColor:
                "color-mix(in oklab, var(--glass-bg) 72%, transparent)",
            }}
          >
            <ul className="divide-y divide-[var(--border)]/35 py-0.5">
              {selectedUsersData.map((u) => (
                <li
                  key={u.user_id}
                  className="flex items-center gap-2.5 px-3 py-2 sm:px-3.5"
                >
                  <Avatar
                    url={u.avatar_url || undefined}
                    name={u.display_name || u.username || "User"}
                    size={32}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[var(--text)]">
                      {u.display_name || "Unnamed"}
                    </div>
                    <div className="truncate text-xs text-[var(--text)]/55">
                      @{u.username || "user"}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${u.display_name || u.username || "user"} from selection`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--text)]/18 bg-[var(--text)]/6 text-[var(--text)]/80 transition hover:border-[var(--text)]/32 hover:bg-[var(--text)]/12 hover:text-[var(--text)] active:bg-[var(--text)]/16"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUserSelect(u.user_id);
                    }}
                  >
                    <span
                      className="pointer-events-none select-none text-[1.5rem] font-light leading-[0] text-[var(--text)]/90 [transform:translateY(1px)]"
                      aria-hidden
                    >
                      ×
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Panel: post + search + followers / select all */}
        <div
          className={`${frostedModalPanelClassName} !max-w-none shrink-0 p-3 sm:p-3.5`}
          style={inviteFrostedPanelStyle}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <p className="text-xs text-[var(--text)]/50 line-clamp-2 break-words overflow-hidden mb-3">
            {postType === "hangout" ? "Hangout" : "Experience"}:{" "}
            {postCaption || "Untitled"}
          </p>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-2">
            <div className="relative min-w-0 flex-1">
              <input
                type="text"
                placeholder="Search by name or username…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onFocus={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                className={glassInputClass}
                style={glassInputStyle}
              />
              <div
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text)]/45 pointer-events-none"
                aria-hidden
              >
                🔍
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0 sm:justify-end sm:pt-0">
              <button
                type="button"
                role="switch"
                aria-checked={showFollowersOnly}
                aria-label="Show followers only"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setShowFollowersOnly(!showFollowersOnly);
                }}
                className="flex h-7 shrink-0 items-center gap-2 rounded-lg pl-0.5 pr-1 py-0.5 text-left transition hover:bg-[var(--text)]/5"
              >
                <span className="text-[11px] font-semibold leading-none text-[var(--text)]/90">
                  Followers
                </span>
                <span
                  className={`relative inline-flex h-[1.125rem] w-8 shrink-0 items-center rounded-full border transition-colors ${
                    showFollowersOnly
                      ? "border-yellow-500/60 bg-yellow-500/85"
                      : "border-[var(--glass-active-border)] bg-[color-mix(in_oklab,var(--text)_18%,transparent)]"
                  }`}
                  aria-hidden
                >
                  <span
                    className={`pointer-events-none absolute top-1/2 h-[0.875rem] w-[0.875rem] -translate-y-1/2 rounded-full bg-white shadow-sm transition-all duration-200 ${
                      showFollowersOnly ? "right-0.5 left-auto" : "left-0.5"
                    }`}
                  />
                </span>
              </button>

              {showFollowersOnly && followers.length > 0 ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleSelectAllFollowers();
                  }}
                  className="h-5 min-h-5 shrink-0 rounded-full border border-transparent bg-[var(--text)] px-2 text-[10px] font-semibold leading-none text-[var(--bg)] shadow-sm transition hover:opacity-90"
                >
                  {followers.filter((f) => (f.user_id ?? "").trim()).length >
                    0 &&
                  followers
                    .filter((f) => (f.user_id ?? "").trim())
                    .every((f) =>
                      selectedUsers.has((f.user_id ?? "").trim())
                    )
                    ? "Deselect all"
                    : "Select all"}
                </button>
              ) : null}
            </div>
          </div>

          {loading || users.length > 0 || searchQuery.trim().length > 0 ? (
            <div
              className="mt-3 -mx-0.5 max-h-[min(45vh,320px)] overflow-y-auto overscroll-contain px-0.5"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
            >
              {loading ? (
                <div className="py-2 text-center text-xs text-[var(--text)]/60">
                  Searching…
                </div>
              ) : users.length === 0 ? (
                <div className="py-2 text-center text-xs text-[var(--text)]/60">
                  No users found matching your search
                </div>
              ) : (
                <div className="space-y-2 pb-1">
                  {users.map((user) => (
                    <DrawerProfileCard
                      key={user.id}
                      id={user.id}
                      username={user.username || null}
                      display_name={user.display_name || null}
                      avatar_url={user.avatar_url || null}
                      rowShape="pill"
                      followStatus={
                        batchedFollowStatuses[user.id] ??
                        (user.id === viewerProfileId ? "self" : "none")
                      }
                      onClick={(e) => {
                        e?.stopPropagation?.();
                        handleUserSelect(user.user_id);
                      }}
                      showFollowButton={true}
                      showCustomBadge={
                        selectedUsers.has(user.user_id) ? (
                          <div
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--text)] text-[var(--bg)] text-xs font-bold leading-none shadow-sm"
                            aria-hidden
                          >
                            ✓
                          </div>
                        ) : undefined
                      }
                    />
                  ))}
                  {hasMoreList && !loading && users.length > 0 ? (
                    <div className="pt-1 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          void loadUsers(true);
                        }}
                        disabled={loadingMore}
                        className="text-xs font-semibold text-[var(--text)]/80 underline decoration-[var(--text)]/30 underline-offset-2 transition hover:text-[var(--text)] disabled:opacity-50"
                      >
                        {loadingMore ? "Loading…" : "See more"}
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </BottomDrawer>
      <ConfirmDialog
        open={inviteOutcomeSheet !== null}
        higherZIndex
        pillButtons
        stackThreeActionsPrimaryBelow={
          inviteOutcomeSheet?.variant === "pre_some"
        }
        isLoading={sendingInvites}
        title={inviteOutcomeSheet?.title ?? ""}
        message={inviteOutcomeSheet?.message ?? ""}
        cancelLabel={inviteOutcomeSheet?.cancelLabel ?? "Edit selection"}
        confirmLabel={inviteOutcomeSheet?.confirmLabel ?? "Got it"}
        confirmVariant="primary"
        secondaryLabel={
          inviteOutcomeSheet?.variant === "pre_some"
            ? inviteOutcomeSheet.secondaryLabel
            : undefined
        }
        secondaryVariant={
          inviteOutcomeSheet?.variant === "pre_some"
            ? inviteOutcomeSheet.secondaryVariant ?? "default"
            : undefined
        }
        onSecondary={
          inviteOutcomeSheet?.variant === "pre_some"
            ? () => {
                const sheet = inviteOutcomeSheet;
                const remove = new Set(sheet?.alreadyUserIds ?? []);
                if (remove.size === 0) return;
                setSelectedUsers((prev) => {
                  const next = new Set(prev);
                  remove.forEach((id) => next.delete(id));
                  return next;
                });
                setSelectedUsersData((prev) =>
                  prev.filter((u) => !remove.has(u.user_id))
                );
                setInviteOutcomeSheet(null);
              }
            : undefined
        }
        onClose={() => setInviteOutcomeSheet(null)}
        onConfirm={async () => {
          const sheet = inviteOutcomeSheet;
          if (
            sheet?.variant === "pre_some" &&
            sheet.remainingUserIds &&
            sheet.remainingUserIds.length > 0
          ) {
            const ids = sheet.remainingUserIds;
            const snap = sheet.snapshot;
            setInviteOutcomeSheet(null);
            setSendingInvites(true);
            try {
              await runSendInvitesFlow(ids, snap);
            } finally {
              setSendingInvites(false);
            }
            return;
          }
          setInviteOutcomeSheet(null);
          if (sheet?.confirmClosesDrawer !== false) {
            closeInviteDrawerAndReset();
          }
        }}
      />
    </>
  );
}
