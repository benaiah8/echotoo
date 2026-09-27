/**
 * Add people to an existing group — BottomDrawer + frosted panel + PeopleGrid.
 * Reuses New Message search patterns; excludes active members; capacity-capped.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { PiMagnifyingGlass, PiX } from "react-icons/pi";
import toast from "react-hot-toast";
import BottomDrawer from "../ui/BottomDrawer";
import PeopleGrid, { type PeopleGridPerson } from "../people/PeopleGrid";
import SelectedPeopleSummary, {
  type SelectedPersonSummary,
} from "../people/SelectedPeopleSummary";
import {
  searchProfiles,
  type ProfileSearchRow,
} from "../../api/queries/searchProfiles";
import { addConversationMembers } from "../../api/services/messaging";
import { getViewerAuthUserId } from "../../api/services/follows";
import { getErrorMessage } from "../../lib/errorHandling";
import { glassPeoplePanelClass } from "../../lib/glassActionSheetStyles";
import { GROUP_ACTIVE_MEMBER_CAP } from "../../lib/groupActiveMemberCap";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 25;

type Props = {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  /** Currently active member user ids (excluded from selection). */
  activeMemberIds: ReadonlySet<string> | string[];
  activeMemberCount: number;
  /** After successful add + parent member refresh. */
  onAdded: () => void | Promise<void>;
};

const searchPillClass =
  "relative flex w-full min-w-0 min-h-[2.5rem] items-center rounded-full border focus-within:ring-2 focus-within:ring-primary/25";

const searchInputClass =
  "min-h-0 min-w-0 flex-1 border-0 bg-transparent py-2 pl-9 pr-2 text-sm text-[var(--text)] placeholder:text-[var(--text)]/50 outline-none";

const glassInputStyle: CSSProperties = {
  backgroundColor: "color-mix(in oklab, var(--glass-bg) 75%, var(--bg))",
  backdropFilter: "blur(var(--glass-blur))",
  WebkitBackdropFilter: "blur(var(--glass-blur))",
  borderColor: "var(--glass-active-border, var(--border))",
};

const addCtaClass =
  "flex h-10 w-[40%] min-w-[6.75rem] max-w-[42%] shrink-0 items-center justify-center rounded-full bg-amber-400/90 px-3 text-sm font-semibold text-neutral-900 transition-opacity disabled:pointer-events-none disabled:opacity-45";

function personLabel(p: ProfileSearchRow): string {
  return p.display_name?.trim() || p.username?.trim() || "Member";
}

function asIdSet(ids: ReadonlySet<string> | string[]): Set<string> {
  return ids instanceof Set ? ids : new Set(ids);
}

export default function AddPeoplePicker({
  open,
  onClose,
  conversationId,
  activeMemberIds,
  activeMemberCount,
  onAdded,
}: Props) {
  const [viewerAuthUserId, setViewerAuthUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<ProfileSearchRow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedById, setSelectedById] = useState<
    Record<string, ProfileSearchRow>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [selectionExpanded, setSelectionExpanded] = useState(false);

  const searchGenRef = useRef(0);
  const submitLockRef = useRef(false);
  const excludedIds = useMemo(
    () => asIdSet(activeMemberIds),
    [activeMemberIds]
  );
  const remainingSlots = Math.max(0, GROUP_ACTIVE_MEMBER_CAP - activeMemberCount);
  const availableSlots = Math.max(0, remainingSlots - selectedIds.length);

  const resetState = useCallback(() => {
    searchGenRef.current += 1;
    submitLockRef.current = false;
    setSearchQuery("");
    setResults([]);
    setSearchLoading(false);
    setSelectedIds([]);
    setSelectedById({});
    setSelectionExpanded(false);
    setSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const id = await getViewerAuthUserId();
      if (!cancelled) setViewerAuthUserId(id);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  useEffect(() => {
    if (!open) return;
    const q = searchQuery.trim();
    if (!q) {
      setResults([]);
      setSearchLoading(false);
      return;
    }

    const gen = ++searchGenRef.current;
    setSearchLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const rows = await searchProfiles(q, undefined, {
            limit: SEARCH_PAGE_SIZE,
            offset: 0,
          });
          if (gen !== searchGenRef.current) return;
          const filtered = rows.filter((r) => {
            const uid = (r.user_id ?? "").trim();
            if (!uid) return false;
            if (viewerAuthUserId && uid === viewerAuthUserId) return false;
            if (excludedIds.has(uid)) return false;
            return true;
          });
          setResults(filtered);
        } catch (e) {
          if (gen !== searchGenRef.current) return;
          console.error("[AddPeoplePicker] search failed", e);
          setResults([]);
        } finally {
          if (gen === searchGenRef.current) setSearchLoading(false);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [open, searchQuery, viewerAuthUserId, excludedIds]);

  const resultsById = useMemo(() => {
    const map: Record<string, ProfileSearchRow> = {};
    for (const row of results) {
      const uid = (row.user_id ?? "").trim();
      if (uid) map[uid] = row;
    }
    return map;
  }, [results]);

  const gridPeople: PeopleGridPerson[] = useMemo(
    () =>
      results.map((row) => ({
        id: row.user_id,
        displayName: personLabel(row),
        avatarUrl: row.avatar_url,
      })),
    [results]
  );

  const selectedSummaryPeople: SelectedPersonSummary[] = useMemo(
    () =>
      selectedIds
        .map((id) => selectedById[id])
        .filter((p): p is ProfileSearchRow => !!p)
        .map((p) => ({
          id: p.user_id,
          displayName: personLabel(p),
          avatarUrl: p.avatar_url,
        })),
    [selectedIds, selectedById]
  );

  useEffect(() => {
    if (selectedIds.length === 0) setSelectionExpanded(false);
  }, [selectedIds.length]);

  const toggleUser = useCallback(
    (row: ProfileSearchRow) => {
      const uid = (row.user_id ?? "").trim();
      if (!uid) return;
      if (viewerAuthUserId && uid === viewerAuthUserId) return;
      if (excludedIds.has(uid)) return;

      setSelectedIds((prev) => {
        if (prev.includes(uid)) {
          setSelectedById((map) => {
            const next = { ...map };
            delete next[uid];
            return next;
          });
          return prev.filter((id) => id !== uid);
        }
        if (prev.length >= remainingSlots) {
          toast.error(
            remainingSlots <= 0
              ? "This group is full."
              : `You can add up to ${remainingSlots} more ${remainingSlots === 1 ? "person" : "people"}.`
          );
          return prev;
        }
        setSelectedById((map) => ({ ...map, [uid]: row }));
        return [...prev, uid];
      });
    },
    [viewerAuthUserId, excludedIds, remainingSlots]
  );

  const handleSelectPerson = useCallback(
    (id: string) => {
      if (submitting) return;
      const row = resultsById[id] ?? selectedById[id];
      if (row) toggleUser(row);
    },
    [submitting, resultsById, selectedById, toggleUser]
  );

  const handleRemoveSelected = useCallback(
    (id: string) => {
      if (submitting) return;
      const row = selectedById[id];
      if (row) toggleUser(row);
    },
    [submitting, selectedById, toggleUser]
  );

  const handleAdd = useCallback(async () => {
    if (submitting || submitLockRef.current) return;
    if (selectedIds.length === 0) return;
    if (remainingSlots <= 0) {
      toast.error("This group is full.");
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const { data, error } = await addConversationMembers(
        conversationId,
        selectedIds
      );
      if (error || !data) {
        toast.error(getErrorMessage(error) || "Could not add people.");
        return;
      }
      await onAdded();
      resetState();
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e) || "Could not add people.");
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }, [
    submitting,
    selectedIds,
    remainingSlots,
    conversationId,
    onAdded,
    onClose,
    resetState,
  ]);

  return (
    <BottomDrawer
      open={open}
      onClose={handleClose}
      showCloseButton={false}
      shrinkSheetToContent
      maxHeight="88vh"
      portalClassName="z-[130]"
      disableBodyScrollLock
      transparentSheet
      contentClassName="px-4 pt-1"
    >
      <div className={`${glassPeoplePanelClass} mx-auto max-w-lg`}>
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)]/40 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--text)]">
              Add people
            </p>
            <p className="mt-0.5 text-[11px] tabular-nums text-[var(--text)]/55">
              {availableSlots}/{GROUP_ACTIVE_MEMBER_CAP} available
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)]/70 text-[var(--text)]/70"
            aria-label="Close"
            disabled={submitting}
          >
            <PiX className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-4 py-3">
          <div className={searchPillClass} style={glassInputStyle}>
            <PiMagnifyingGlass
              className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--text)]/45"
              aria-hidden
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name or username"
              className={searchInputClass}
              autoCapitalize="off"
              autoCorrect="off"
              enterKeyHint="search"
              disabled={submitting}
            />
          </div>

          <div
            className={`overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] ${
              selectionExpanded
                ? "max-h-[min(36vh,16rem)] min-h-[8rem]"
                : "max-h-[min(48vh,22rem)] min-h-[10rem]"
            }`}
          >
            {searchLoading ? (
              <p className="py-8 text-center text-sm text-[var(--text)]/55">
                Searching…
              </p>
            ) : !searchQuery.trim() ? (
              <p className="py-8 text-center text-sm text-[var(--text)]/50">
                Search for people to add.
              </p>
            ) : (
              <PeopleGrid
                people={gridPeople}
                selectedIds={selectedIds}
                onSelect={handleSelectPerson}
                emptyLabel="No people found."
              />
            )}
          </div>

          <SelectedPeopleSummary
            people={selectedSummaryPeople}
            expanded={selectionExpanded}
            onToggle={() => setSelectionExpanded((o) => !o)}
            onRemove={handleRemoveSelected}
            maxVisibleAvatars={3}
            disabled={submitting}
            action={
              <button
                type="button"
                className={addCtaClass}
                disabled={
                  submitting ||
                  selectedIds.length === 0 ||
                  remainingSlots <= 0
                }
                onClick={() => void handleAdd()}
              >
                {submitting ? "Adding…" : "Add"}
              </button>
            }
          />
        </div>
      </div>
    </BottomDrawer>
  );
}
