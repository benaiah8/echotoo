/**
 * M1B.1 — New Message compose (inset frosted panel).
 * Text sender: Send / Send separately / Send to new group.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PiArrowLeft, PiMagnifyingGlass, PiX } from "react-icons/pi";
import toast from "react-hot-toast";
import BottomDrawer from "../ui/BottomDrawer";
import PeopleGrid from "../people/PeopleGrid";
import type { PeopleGridPerson } from "../people/PeopleGridItem";
import SelectedPeopleSummary, {
  type SelectedPersonSummary,
} from "../people/SelectedPeopleSummary";
import {
  searchProfiles,
  type ProfileSearchRow,
} from "../../api/queries/searchProfiles";
import {
  createGroupConversation,
  getOrCreateDirectConversation,
  isDmStrangerLimitError,
  sendMessage,
} from "../../api/services/messaging";
import { getViewerAuthUserId } from "../../api/services/follows";
import { getErrorMessage } from "../../lib/errorHandling";
import { glassPeoplePanelClass } from "../../lib/glassActionSheetStyles";
import {
  composeFailureCopy,
  composeWaitingForReplyCopy,
  createComposeSendAttempt,
  ensureClientMessageId,
  SEND_SEPARATELY_MAX,
  sendTextToPeopleSeparately,
  type ComposeSendAttempt,
} from "../../lib/messages/composeMessageSend";
import { messagesConversationPath } from "../../router/Paths";

import { GROUP_MAX_OTHER_MEMBERS } from "../../lib/groupActiveMemberCap";

const GROUP_TITLE_MAX = 80;
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 25;
const MESSAGE_TEXTAREA_MAX_PX = 88;

type Step = "people" | "group";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Recent DM counterparts from held inbox rows (no extra RPC). */
  recentPeople?: PeopleGridPerson[];
};

const closeBtnClass =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)]/70 text-[var(--text)]/75 transition hover:bg-[var(--text)]/8 disabled:pointer-events-none disabled:opacity-45";

const ctaShellClass =
  "flex h-10 min-h-10 w-full min-w-0 basis-0 flex-1 items-center justify-center overflow-hidden rounded-full text-center text-[13px] leading-none whitespace-nowrap transition-opacity disabled:pointer-events-none disabled:opacity-45";

const primaryCtaClass = `${ctaShellClass} bg-amber-400/90 px-2.5 font-semibold text-neutral-900`;

const secondaryCtaClass = `${ctaShellClass} border border-[var(--border)]/70 bg-[var(--surface-2)]/70 px-3.5 font-medium tracking-[0.01em] text-[var(--text)]/90`;

const overlayCounterClass =
  "pointer-events-none absolute bottom-1.5 right-2 text-[10px] tabular-nums leading-none text-[var(--text)]/50";

const bottomDockClass = [
  "shrink-0 space-y-2 rounded-t-2xl px-3 pb-3 pt-2.5",
  "border-t border-[var(--border)]/45",
  "bg-[color-mix(in_oklab,var(--surface)_78%,transparent)]",
  "app-dark:border-white/12 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_42%,#050507)]",
  "shadow-[0_-6px_18px_-10px_rgba(0,0,0,0.28)] app-dark:shadow-[0_-8px_22px_-10px_rgba(0,0,0,0.55)]",
].join(" ");

/** CSS morph: equal flex slots; secondary collapses without changing primary height. */
function ComposeActionMorphRow({
  dual,
  primaryLabel,
  dualSecondaryLabel,
  disabled,
  onPrimary,
  onSecondary,
}: {
  dual: boolean;
  primaryLabel: string;
  dualSecondaryLabel: string;
  disabled: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  return (
    <div className="flex h-10 w-full items-stretch gap-2">
      <button
        type="button"
        className={`${primaryCtaClass} transition-[flex-grow,max-width] duration-200 ease-out motion-reduce:transition-none`}
        disabled={disabled}
        onClick={onPrimary}
      >
        <span className="truncate">{primaryLabel}</span>
      </button>
      <div
        className={[
          "flex min-w-0 overflow-hidden transition-[flex-grow,max-width,opacity,transform] duration-200 ease-out motion-reduce:transition-none",
          dual
            ? "max-w-none flex-1 basis-0 translate-x-0 opacity-100"
            : "pointer-events-none max-w-0 flex-[0_0_0%] basis-0 translate-x-2 opacity-0",
        ].join(" ")}
        aria-hidden={!dual}
      >
        <button
          type="button"
          tabIndex={dual ? 0 : -1}
          className={secondaryCtaClass}
          disabled={disabled || !dual}
          onClick={onSecondary}
        >
          <span className="truncate">{dualSecondaryLabel}</span>
        </button>
      </div>
    </div>
  );
}

function profileToPerson(row: ProfileSearchRow): PeopleGridPerson | null {
  const id = (row.user_id ?? "").trim();
  if (!id) return null;
  return {
    id,
    displayName:
      row.display_name?.trim() || row.username?.trim() || "Member",
    username: row.username,
    avatarUrl: row.avatar_url,
  };
}

function personMatchesQuery(p: PeopleGridPerson, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const name = (p.displayName ?? "").toLowerCase();
  const uname = (p.username ?? "").toLowerCase();
  return name.includes(needle) || uname.includes(needle);
}

function selectionSignature(ids: string[]): string {
  return [...ids].map((id) => id.trim()).filter(Boolean).sort().join("|");
}

export default function NewMessageOverlay({
  open,
  onClose,
  recentPeople = [],
}: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<Step>("people");
  const [viewerAuthUserId, setViewerAuthUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<PeopleGridPerson[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedById, setSelectedById] = useState<
    Record<string, PeopleGridPerson>
  >({});
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failedUserIds, setFailedUserIds] = useState<string[]>([]);
  const [failedLabels, setFailedLabels] = useState<Record<string, string>>({});
  const [lastBatchHadPartial, setLastBatchHadPartial] = useState(false);
  /** Mirrors attempt.createdGroupConversationId for render-safe CTA labels. */
  const [createdGroupConversationId, setCreatedGroupConversationId] = useState<
    string | null
  >(null);

  const searchGenRef = useRef(0);
  const submitLockRef = useRef(false);
  const searchCacheRef = useRef<Map<string, PeopleGridPerson[]>>(new Map());
  const attemptRef = useRef<ComposeSendAttempt | null>(null);
  const groupMemberSigAtCreateRef = useRef<string | null>(null);
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null);

  const recentFiltered = useMemo(() => {
    if (!viewerAuthUserId) return recentPeople;
    return recentPeople.filter((p) => p.id !== viewerAuthUserId);
  }, [recentPeople, viewerAuthUserId]);

  const resetState = useCallback(() => {
    searchGenRef.current += 1;
    submitLockRef.current = false;
    searchCacheRef.current.clear();
    attemptRef.current = null;
    groupMemberSigAtCreateRef.current = null;
    setStep("people");
    setSearchQuery("");
    setSearchHits([]);
    setSearchLoading(false);
    setSelectedIds([]);
    setSelectedById({});
    setSummaryExpanded(false);
    setDraft("");
    setGroupTitle("");
    setSubmitting(false);
    setFailedUserIds([]);
    setFailedLabels({});
    setLastBatchHadPartial(false);
    setCreatedGroupConversationId(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }
    let cancelled = false;
    (async () => {
      const id = await getViewerAuthUserId();
      if (!cancelled) setViewerAuthUserId(id);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, resetState]);

  useEffect(() => {
    if (!open || step !== "people") return;

    const q = searchQuery.trim();
    if (!q) {
      setSearchHits([]);
      setSearchLoading(false);
      return;
    }

    const cached = searchCacheRef.current.get(q);
    if (cached) {
      setSearchHits(cached);
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
          const people: PeopleGridPerson[] = [];
          const seen = new Set<string>();
          for (const row of rows) {
            const person = profileToPerson(row);
            if (!person) continue;
            if (viewerAuthUserId && person.id === viewerAuthUserId) continue;
            if (seen.has(person.id)) continue;
            seen.add(person.id);
            people.push(person);
          }
          searchCacheRef.current.set(q, people);
          setSearchHits(people);
        } catch (e) {
          if (gen !== searchGenRef.current) return;
          console.error("[NewMessageOverlay] search failed", e);
          setSearchHits([]);
        } finally {
          if (gen === searchGenRef.current) setSearchLoading(false);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [open, step, searchQuery, viewerAuthUserId]);

  const gridPeople = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return recentFiltered;

    const seen = new Set<string>();
    const out: PeopleGridPerson[] = [];

    for (const p of recentFiltered) {
      if (!personMatchesQuery(p, q)) continue;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    for (const p of searchHits) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  }, [searchQuery, recentFiltered, searchHits]);

  const selectedCount = selectedIds.length;

  const summaryPeople: SelectedPersonSummary[] = useMemo(
    () =>
      selectedIds
        .map((id) => selectedById[id])
        .filter((p): p is PeopleGridPerson => !!p)
        .map((p) => ({
          id: p.id,
          displayName: p.displayName,
          avatarUrl: p.avatarUrl,
        })),
    [selectedIds, selectedById]
  );

  const labelsByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const id of selectedIds) {
      const p = selectedById[id];
      map.set(id, p?.displayName?.trim() || "chat");
    }
    return map;
  }, [selectedIds, selectedById]);

  const trimmedDraft = draft.trim();
  const draftValid = trimmedDraft.length > 0;
  const trimmedTitle = groupTitle.trim();
  const titleValid =
    trimmedTitle.length > 0 && trimmedTitle.length <= GROUP_TITLE_MAX;

  const dualSeparateEligible =
    selectedCount >= 2 && selectedCount <= SEND_SEPARATELY_MAX;
  const groupOnlyActions =
    selectedCount >= SEND_SEPARATELY_MAX + 1 &&
    selectedCount <= GROUP_MAX_OTHER_MEMBERS;
  const showSeparateCapHint = groupOnlyActions;

  useEffect(() => {
    if (selectedCount === 0) setSummaryExpanded(false);
  }, [selectedCount]);

  /** If membership changes after a group was created for send-only, drop bind. */
  useEffect(() => {
    const attempt = attemptRef.current;
    if (!attempt?.createdGroupConversationId) return;
    const sig = selectionSignature(selectedIds);
    const locked = groupMemberSigAtCreateRef.current;
    if (locked && sig !== locked) {
      attempt.createdGroupConversationId = undefined;
      attempt.clientIdsByConversation.clear();
      attempt.succeededConversationIds.clear();
      attempt.failedUserIds = [];
      groupMemberSigAtCreateRef.current = null;
      setCreatedGroupConversationId(null);
      setFailedUserIds([]);
      setFailedLabels({});
      setLastBatchHadPartial(false);
    }
  }, [selectedIds]);

  const syncMessageTextareaHeight = useCallback(() => {
    const el = messageTextareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, MESSAGE_TEXTAREA_MAX_PX);
    el.style.height = `${Math.max(next, 24)}px`;
  }, []);

  useLayoutEffect(() => {
    if (selectedCount === 0) return;
    syncMessageTextareaHeight();
  }, [draft, selectedCount, step, syncMessageTextareaHeight]);

  const clearSendUi = useCallback(() => {
    setFailedUserIds([]);
    setFailedLabels({});
    setLastBatchHadPartial(false);
  }, []);

  const togglePerson = useCallback(
    (person: PeopleGridPerson) => {
      const uid = (person.id ?? "").trim();
      if (!uid) return;
      if (viewerAuthUserId && uid === viewerAuthUserId) return;

      setSelectedIds((prev) => {
        if (prev.includes(uid)) {
          setSelectedById((map) => {
            const next = { ...map };
            delete next[uid];
            return next;
          });
          return prev.filter((id) => id !== uid);
        }
        if (prev.length >= GROUP_MAX_OTHER_MEMBERS) {
          toast.error(
            `You can select up to ${GROUP_MAX_OTHER_MEMBERS} people for a group.`
          );
          return prev;
        }
        setSelectedById((map) => ({ ...map, [uid]: person }));
        return [...prev, uid];
      });
      clearSendUi();
    },
    [viewerAuthUserId, clearSendUi]
  );

  const removeSelected = useCallback(
    (id: string) => {
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      setSelectedById((map) => {
        const next = { ...map };
        delete next[id];
        return next;
      });
      clearSendUi();
    },
    [clearSendUi]
  );

  const applySeparateOutcome = useCallback(
    (results: Awaited<ReturnType<typeof sendTextToPeopleSeparately>>) => {
      const attempt = attemptRef.current;
      if (!attempt) return;

      const nextFailed: string[] = [];
      const nextLabels: Record<string, string> = {};
      const strangerWaitingLabels: string[] = [];
      let successCount = 0;

      for (const r of results) {
        if (r.ok && r.conversationId) {
          successCount += 1;
          attempt.succeededConversationIds.add(r.conversationId);
          continue;
        }
        if (isDmStrangerLimitError(r.error)) {
          strangerWaitingLabels.push(composeWaitingForReplyCopy(r.label));
          continue;
        }
        nextFailed.push(r.userId);
        nextLabels[r.userId] = composeFailureCopy(r.label, r.error);
      }

      attempt.failedUserIds = nextFailed;
      setFailedUserIds(nextFailed);
      setFailedLabels(nextLabels);

      const failCount = nextFailed.length;
      const strangerCount = strangerWaitingLabels.length;
      const attempted = new Set(results.map((r) => r.userId));

      setSelectedIds((prev) =>
        prev.filter((id) => !attempted.has(id) || nextFailed.includes(id))
      );
      setSelectedById((map) => {
        const next = { ...map };
        for (const id of attempted) {
          if (!nextFailed.includes(id)) delete next[id];
        }
        return next;
      });

      if (failCount === 0 && strangerCount === 0 && successCount > 0) {
        toast.success(
          successCount === 1 ? "Sent" : `Sent to ${successCount} chats`
        );
        handleClose();
        return;
      }

      if (failCount === 0 && strangerCount > 0 && successCount > 0) {
        toast(
          `Sent to ${successCount} chat${successCount === 1 ? "" : "s"}. ${
            strangerCount === 1
              ? strangerWaitingLabels[0]
              : `${strangerCount} waiting for a reply.`
          }`
        );
        if (nextFailed.length === 0) handleClose();
        return;
      }

      if (failCount === 0 && strangerCount > 0 && successCount === 0) {
        toast.error(
          strangerCount === 1
            ? strangerWaitingLabels[0]
            : `Waiting for replies (${strangerCount})`
        );
        return;
      }

      if (successCount > 0 && failCount > 0) {
        setLastBatchHadPartial(true);
        toast(
          `Sent to ${successCount} chat${successCount === 1 ? "" : "s"}. ${failCount} failed.`
        );
        return;
      }

      if (failCount > 0 && successCount === 0) {
        toast.error(
          failCount === 1
            ? nextLabels[nextFailed[0]] || "Couldn't send"
            : `Couldn't send to ${failCount} chats`
        );
      }
    },
    [handleClose]
  );

  const runSendDirect = useCallback(
    async (isRetry: boolean) => {
      if (submitLockRef.current || submitting) return;
      if (!draftValid) {
        toast.error("Write a message");
        return;
      }
      const otherUserId = selectedIds[0];
      if (!otherUserId) return;

      const attempt = isRetry
        ? attemptRef.current?.mode === "direct"
          ? attemptRef.current
          : createComposeSendAttempt("direct")
        : createComposeSendAttempt("direct");
      attemptRef.current = attempt;

      submitLockRef.current = true;
      setSubmitting(true);
      clearSendUi();

      try {
        let conversationId =
          attempt.resolvedConversationByUserId.get(otherUserId)?.trim() || "";

        if (!conversationId) {
          const { data, error } =
            await getOrCreateDirectConversation(otherUserId);
          if (error || !data?.conversation_id) {
            toast.error(
              getErrorMessage(error) || "Could not open conversation."
            );
            setFailedUserIds([otherUserId]);
            setFailedLabels({
              [otherUserId]: composeFailureCopy(
                labelsByUserId.get(otherUserId) || "chat",
                error
              ),
            });
            return;
          }
          conversationId = data.conversation_id;
          attempt.resolvedConversationByUserId.set(
            otherUserId,
            conversationId
          );
        }

        if (attempt.succeededConversationIds.has(conversationId)) {
          resetState();
          onClose();
          navigate(messagesConversationPath(conversationId), {
            state: {
              backgroundLocation: location,
              otherUserId,
            },
          });
          return;
        }

        const clientMessageId = ensureClientMessageId(
          attempt.clientIdsByConversation,
          conversationId
        );
        const { data, error } = await sendMessage(
          conversationId,
          trimmedDraft,
          clientMessageId
        );
        if (error || !data) {
          const label = labelsByUserId.get(otherUserId) || "chat";
          if (isDmStrangerLimitError(error)) {
            toast.error(composeWaitingForReplyCopy(label));
            clearSendUi();
            return;
          }
          toast.error(getErrorMessage(error) || "Could not send message.");
          setFailedUserIds([otherUserId]);
          setFailedLabels({
            [otherUserId]: composeFailureCopy(label, error),
          });
          return;
        }

        attempt.succeededConversationIds.add(conversationId);
        resetState();
        onClose();
        navigate(messagesConversationPath(conversationId), {
          state: {
            backgroundLocation: location,
            otherUserId,
          },
        });
      } catch (e) {
        const label = labelsByUserId.get(otherUserId) || "chat";
        if (isDmStrangerLimitError(e)) {
          toast.error(composeWaitingForReplyCopy(label));
        } else {
          toast.error(getErrorMessage(e) || "Could not send message.");
        }
      } finally {
        submitLockRef.current = false;
        setSubmitting(false);
      }
    },
    [
      submitting,
      draftValid,
      selectedIds,
      trimmedDraft,
      labelsByUserId,
      clearSendUi,
      resetState,
      onClose,
      navigate,
      location,
    ]
  );

  const runSendSeparately = useCallback(
    async (userIds: string[], isRetry: boolean) => {
      if (submitLockRef.current || submitting) return;
      if (!draftValid) {
        toast.error("Write a message");
        return;
      }
      if (userIds.length === 0) {
        toast("Select at least one person");
        return;
      }
      if (userIds.length > SEND_SEPARATELY_MAX) {
        toast.error(
          `Send separately supports up to ${SEND_SEPARATELY_MAX} people.`
        );
        return;
      }

      const attempt = isRetry
        ? attemptRef.current?.mode === "separate"
          ? attemptRef.current
          : createComposeSendAttempt("separate")
        : createComposeSendAttempt("separate");
      attemptRef.current = attempt;
      if (!isRetry) {
        attempt.failedUserIds = [];
      }

      submitLockRef.current = true;
      setSubmitting(true);
      setFailedUserIds([]);
      setFailedLabels({});
      setLastBatchHadPartial(false);

      try {
        const results = await sendTextToPeopleSeparately({
          userIds,
          labelsByUserId,
          body: trimmedDraft,
          attempt,
        });
        applySeparateOutcome(results);
      } catch (e) {
        toast.error(getErrorMessage(e) || "Couldn't send.");
      } finally {
        submitLockRef.current = false;
        setSubmitting(false);
      }
    },
    [
      submitting,
      draftValid,
      trimmedDraft,
      labelsByUserId,
      applySeparateOutcome,
    ]
  );

  const runCreateAndSendGroup = useCallback(async () => {
    if (submitLockRef.current || submitting) return;
    if (!draftValid) {
      toast.error("Write a message");
      return;
    }

    const attempt =
      attemptRef.current?.mode === "new_group"
        ? attemptRef.current
        : createComposeSendAttempt("new_group");
    attemptRef.current = attempt;

    const sendOnly = Boolean(attempt.createdGroupConversationId?.trim());

    if (!sendOnly) {
      if (!titleValid) {
        toast.error("Enter a group name");
        return;
      }
      if (selectedIds.length < 2) {
        toast.error("Select at least two people for a new group");
        return;
      }
    }

    submitLockRef.current = true;
    setSubmitting(true);
    clearSendUi();

    try {
      let conversationId = attempt.createdGroupConversationId?.trim() || "";

      if (!conversationId) {
        const { data, error } = await createGroupConversation(
          trimmedTitle,
          selectedIds
        );
        if (error || !data?.conversation_id) {
          toast.error(
            getErrorMessage(error) || "Could not create group."
          );
          return;
        }
        conversationId = data.conversation_id;
        attempt.createdGroupConversationId = conversationId;
        groupMemberSigAtCreateRef.current = selectionSignature(selectedIds);
        setCreatedGroupConversationId(conversationId);
      }

      if (attempt.succeededConversationIds.has(conversationId)) {
        resetState();
        onClose();
        navigate(messagesConversationPath(conversationId), {
          state: { backgroundLocation: location },
        });
        return;
      }

      const clientMessageId = ensureClientMessageId(
        attempt.clientIdsByConversation,
        conversationId
      );
      const { data, error } = await sendMessage(
        conversationId,
        trimmedDraft,
        clientMessageId
      );
      if (error || !data) {
        toast.error(getErrorMessage(error) || "Could not send message.");
        setFailedUserIds(["__group__"]);
        setFailedLabels({
          __group__: composeFailureCopy(trimmedTitle || "Group", error),
        });
        return;
      }

      attempt.succeededConversationIds.add(conversationId);
      resetState();
      onClose();
      navigate(messagesConversationPath(conversationId), {
        state: { backgroundLocation: location },
      });
    } catch (e) {
      toast.error(getErrorMessage(e) || "Could not create group.");
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }, [
    submitting,
    draftValid,
    titleValid,
    trimmedTitle,
    trimmedDraft,
    selectedIds,
    clearSendUi,
    resetState,
    onClose,
    navigate,
    location,
  ]);

  const handleRetryFailed = useCallback(() => {
    const attempt = attemptRef.current;
    if (attempt?.mode === "new_group" && attempt.createdGroupConversationId) {
      void runCreateAndSendGroup();
      return;
    }
    if (attempt?.mode === "direct") {
      void runSendDirect(true);
      return;
    }
    const failedSet = new Set(failedUserIds);
    const retryIds = selectedIds.filter((id) => failedSet.has(id));
    void runSendSeparately(
      retryIds.length > 0 ? retryIds : selectedIds,
      true
    );
  }, [
    failedUserIds,
    selectedIds,
    runCreateAndSendGroup,
    runSendDirect,
    runSendSeparately,
  ]);

  const goToGroupTitle = useCallback(() => {
    if (selectedCount < 2) return;
    clearSendUi();
    // Keep existing new_group attempt if send-only bind still valid.
    if (attemptRef.current?.mode !== "new_group") {
      attemptRef.current = null;
    }
    setSummaryExpanded(false);
    setStep("group");
  }, [selectedCount, clearSendUi]);

  const handlePeoplePrimary = useCallback(() => {
    if (selectedCount === 1) {
      void runSendDirect(false);
      return;
    }
    if (dualSeparateEligible) {
      void runSendSeparately(selectedIds, false);
      return;
    }
    if (groupOnlyActions || selectedCount >= 2) {
      goToGroupTitle();
    }
  }, [
    selectedCount,
    dualSeparateEligible,
    groupOnlyActions,
    selectedIds,
    runSendDirect,
    runSendSeparately,
    goToGroupTitle,
  ]);

  const showRetry = failedUserIds.length > 0 && !submitting;
  const groupSendOnly = Boolean(createdGroupConversationId?.trim());
  const groupCtaLabel = submitting
    ? groupSendOnly
      ? "Sending…"
      : "Creating…"
    : groupSendOnly
      ? "Retry send"
      : "Create & send";

  const morphPrimaryLabel = submitting
    ? "Sending…"
    : selectedCount === 1
      ? "Send"
      : dualSeparateEligible
        ? "Send separately"
        : "Send to new group";

  const peoplePrimaryDisabled =
    submitting || selectedCount === 0 || !draftValid;

  const groupPrimaryDisabled =
    submitting || !draftValid || (!groupSendOnly && !titleValid);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const emptyGridLabel = searchQuery.trim()
    ? searchLoading
      ? "Searching…"
      : "No people found."
    : recentFiltered.length === 0
      ? "Search for people"
      : "No people.";

  const messageComposer = (
    <div className="relative">
      <label className="sr-only" htmlFor="compose-message-body">
        Message
      </label>
      <textarea
        id="compose-message-body"
        ref={messageTextareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={1}
        placeholder="Write a message..."
        disabled={submitting}
        autoComplete="off"
        className="w-full resize-none overflow-y-auto border-0 bg-transparent py-0.5 pl-0.5 pr-1 text-base leading-snug text-[var(--text)] placeholder:text-[var(--text)]/40 outline-none"
        style={{ maxHeight: MESSAGE_TEXTAREA_MAX_PX }}
      />
    </div>
  );

  return (
    <BottomDrawer
      open={open}
      onClose={handleClose}
      transparentSheet
      shrinkSheetToContent
      showCloseButton={false}
      maxHeight="88vh"
      portalClassName="z-[120]"
      contentClassName="px-3 pt-1 sm:px-4"
    >
      <div
        className={`${glassPeoplePanelClass} mx-auto flex max-h-[min(78vh,36rem)] w-full max-w-lg flex-col`}
      >
        {step === "people" ? (
          <>
            <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
              <div className="relative flex min-h-[2.75rem] min-w-0 flex-1 items-center rounded-full border border-[var(--border)]/55 bg-[color-mix(in_oklab,var(--surface-2)_40%,transparent)] focus-within:ring-2 focus-within:ring-primary/25">
                <PiMagnifyingGlass
                  className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--text)]/45"
                  aria-hidden
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name or username"
                  className="min-h-0 min-w-0 flex-1 border-0 bg-transparent py-2.5 pl-9 pr-3 text-base text-[var(--text)] placeholder:text-[var(--text)]/45 outline-none"
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                  enterKeyHint="search"
                  disabled={submitting}
                  aria-label="Search name or username"
                />
              </div>
              <button
                type="button"
                onClick={handleClose}
                className={closeBtnClass}
                aria-label="Close"
                disabled={submitting}
              >
                <PiX className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 max-h-[min(42vh,18rem)] flex-1 overflow-y-auto overscroll-contain px-3 py-2 [-webkit-overflow-scrolling:touch]">
              {searchLoading && searchQuery.trim() && gridPeople.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--text)]/55">
                  Searching…
                </p>
              ) : (
                <PeopleGrid
                  people={gridPeople}
                  selectedIds={selectedIdSet}
                  onPersonClick={togglePerson}
                  emptyLabel={emptyGridLabel}
                />
              )}
            </div>

            {selectedCount > 0 ? (
              <div className={bottomDockClass}>
                {failedUserIds.length > 0 ? (
                  <p
                    className="truncate text-[11px] text-red-500/90"
                    role="status"
                  >
                    {failedUserIds.length === 1
                      ? failedLabels[failedUserIds[0]] || "Couldn't send"
                      : `${failedUserIds.length} sends failed`}
                    {lastBatchHadPartial ? " · Retry remaining" : null}
                  </p>
                ) : null}

                {messageComposer}

                <SelectedPeopleSummary
                  people={summaryPeople}
                  expanded={summaryExpanded}
                  onToggle={() => setSummaryExpanded((v) => !v)}
                  onRemove={removeSelected}
                  disabled={submitting}
                />

                {showSeparateCapHint ? (
                  <p className="text-center text-[11px] text-[var(--text)]/45">
                    Send separately supports up to {SEND_SEPARATELY_MAX} people.
                  </p>
                ) : null}

                {showRetry ? (
                  <button
                    type="button"
                    className={primaryCtaClass}
                    disabled={submitting}
                    onClick={handleRetryFailed}
                  >
                    Retry failures
                  </button>
                ) : (
                  <ComposeActionMorphRow
                    dual={dualSeparateEligible}
                    primaryLabel={morphPrimaryLabel}
                    dualSecondaryLabel="Send to new group"
                    disabled={peoplePrimaryDisabled}
                    onPrimary={handlePeoplePrimary}
                    onSecondary={goToGroupTitle}
                  />
                )}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
              <button
                type="button"
                onClick={() => {
                  if (submitting) return;
                  setStep("people");
                }}
                className={closeBtnClass}
                disabled={submitting}
                aria-label="Back to people"
              >
                <PiArrowLeft className="h-4 w-4" aria-hidden />
              </button>
              <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-[var(--text)]">
                New group
              </p>
              <button
                type="button"
                onClick={handleClose}
                className={closeBtnClass}
                aria-label="Close"
                disabled={submitting}
              >
                <PiX className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2.5">
              <div className="relative">
                <label className="sr-only" htmlFor="compose-new-group-title">
                  Group name
                </label>
                <input
                  id="compose-new-group-title"
                  type="text"
                  value={groupTitle}
                  onChange={(e) =>
                    setGroupTitle(e.target.value.slice(0, GROUP_TITLE_MAX))
                  }
                  placeholder="Group name"
                  disabled={submitting}
                  maxLength={GROUP_TITLE_MAX}
                  autoComplete="off"
                  autoFocus
                  className="w-full rounded-2xl border border-[var(--border)]/55 bg-[color-mix(in_oklab,var(--surface-2)_40%,transparent)] py-2.5 pl-3 pr-12 text-base text-[var(--text)] placeholder:text-[var(--text)]/45 outline-none focus:ring-2 focus:ring-primary/25"
                />
                <span className={overlayCounterClass} aria-hidden>
                  {groupTitle.length}/{GROUP_TITLE_MAX}
                </span>
              </div>

              {messageComposer}

              <SelectedPeopleSummary
                people={summaryPeople}
                expanded={summaryExpanded}
                onToggle={() => setSummaryExpanded((v) => !v)}
                onRemove={removeSelected}
                disabled={submitting}
              />
            </div>

            <div className={bottomDockClass}>
              {failedUserIds.length > 0 ? (
                <p
                  className="truncate text-[11px] text-red-500/90"
                  role="status"
                >
                  {failedLabels[failedUserIds[0]] || "Couldn't send"}
                </p>
              ) : null}

              <button
                type="button"
                className={primaryCtaClass}
                disabled={groupPrimaryDisabled}
                onClick={() => void runCreateAndSendGroup()}
              >
                {groupCtaLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </BottomDrawer>
  );
}
