/**
 * V4 Finalize "Key details" — quick action (writing layer) + inline editor + chips.
 * Stored as additional_info title V4KeyInfo. Use Root + QuickAction + Chips in layout slots.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { PiCheck, PiPlus, PiSparkle, PiX } from "react-icons/pi";
import {
  V4_KEY_INFO_MAX_ITEMS,
  V4_KEY_INFO_VALUE_MAX,
  clampV4KeyInfoValue,
  sanitizeV4KeyInfoValueForCommit,
} from "../../lib/createFlowV4KeyInfo";
import {
  finalizeMetaChipSurfaceClass,
  finalizeMetaNotesComposerSurfaceClass,
  finalizeMetaChipGhostSurfaceClass,
} from "../../lib/createFlowFinalizeMetaSurface";


type KeyInfoContextValue = {
  values: string[];
  onValuesChange: (next: string[]) => void;
  editorOpen: boolean;
  editingIndex: number | null;
  draft: string;
  setDraft: (v: string) => void;
  openAddEditor: () => void;
  openEditEditor: (index: number) => void;
  closeEditor: () => void;
  commitDraft: (opts?: { fromEnter?: boolean }) => void;
  removeAt: (index: number) => void;
  skipBlurCommitRef: MutableRefObject<boolean>;
  inputId: string;
};

const KeyInfoContext = createContext<KeyInfoContextValue | null>(null);

function useKeyInfoContext(): KeyInfoContextValue {
  const ctx = useContext(KeyInfoContext);
  if (!ctx) {
    throw new Error(
      "CreateFinalizeKeyInfo components must be used within CreateFinalizeKeyInfoRoot"
    );
  }
  return ctx;
}

/** Shared by writing toolbar and Key details UI within CreateFinalizeKeyInfoRoot. */
export function useCreateFinalizeKeyInfo(): KeyInfoContextValue {
  return useKeyInfoContext();
}

type RootProps = {
  values: string[];
  onValuesChange: (next: string[]) => void;
  children: ReactNode;
  registerCloseEditor?: (close: () => void) => void;
};

export function CreateFinalizeKeyInfoRoot({
  values,
  onValuesChange,
  children,
  registerCloseEditor,
}: RootProps) {
  const inputId = useId();
  const skipBlurCommitRef = useRef(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraftState] = useState("");

  const setDraft = useCallback((raw: string) => {
    setDraftState(clampV4KeyInfoValue(raw));
  }, []);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditingIndex(null);
    setDraftState("");
  }, []);

  useEffect(() => {
    registerCloseEditor?.(closeEditor);
    return () => registerCloseEditor?.(() => {});
  }, [closeEditor, registerCloseEditor]);

  const removeAt = useCallback(
    (index: number) => {
      onValuesChange(values.filter((_, i) => i !== index));
      if (editingIndex === index) closeEditor();
      else if (editingIndex != null && editingIndex > index) {
        setEditingIndex(editingIndex - 1);
      }
    },
    [closeEditor, editingIndex, onValuesChange, values]
  );

  const openAddEditor = useCallback(() => {
    if (values.length >= V4_KEY_INFO_MAX_ITEMS) return;
    setEditingIndex(null);
    setDraftState("");
    setEditorOpen(true);
  }, [values.length]);

  const openEditEditor = useCallback((index: number) => {
    setEditingIndex(index);
    setDraftState(values[index] ?? "");
    setEditorOpen(true);
  }, [values]);

  const commitDraft = useCallback(
    (opts?: { fromEnter?: boolean }) => {
      const sanitized = sanitizeV4KeyInfoValueForCommit(draft);

      if (!sanitized) {
        if (editingIndex != null) {
          removeAt(editingIndex);
        } else {
          closeEditor();
        }
        return;
      }

      let nextValues: string[];
      if (editingIndex != null) {
        nextValues = values.map((v, i) => (i === editingIndex ? sanitized : v));
      } else if (values.length >= V4_KEY_INFO_MAX_ITEMS) {
        closeEditor();
        return;
      } else {
        nextValues = [...values, sanitized];
      }

      onValuesChange(nextValues);

      if (opts?.fromEnter && nextValues.length < V4_KEY_INFO_MAX_ITEMS) {
        setEditingIndex(null);
        setDraftState("");
        setEditorOpen(true);
        return;
      }

      closeEditor();
    },
    [closeEditor, draft, editingIndex, onValuesChange, removeAt, values]
  );

  const ctx: KeyInfoContextValue = {
    values,
    onValuesChange,
    editorOpen,
    editingIndex,
    draft,
    setDraft,
    openAddEditor,
    openEditEditor,
    closeEditor,
    commitDraft,
    removeAt,
    skipBlurCommitRef,
    inputId,
  };

  return (
    <KeyInfoContext.Provider value={ctx}>{children}</KeyInfoContext.Provider>
  );
}

const quickActionClass =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium leading-none text-[var(--text)]/72 transition-colors hover:bg-[color-mix(in_oklab,var(--surface)_28%,transparent)] hover:text-[var(--text)]/88 active:scale-[0.99]";

const quickActionActiveClass =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium leading-none text-[var(--brand)] transition-colors active:scale-[0.99] app-dark:text-[var(--create-accent-icon-fg)]";

const quickActionDisabledClass =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium leading-none text-[var(--text)]/72 opacity-40";

const chipClass = `inline-flex max-w-full items-center gap-0.5 rounded-[14px] px-2.5 py-1 text-[12px] font-medium leading-tight text-[var(--text)]/88 transition active:scale-[0.99] ${finalizeMetaChipSurfaceClass}`;

const chipEditingClass =
  "border-[color-mix(in_oklab,var(--brand)_28%,var(--border))] bg-[color-mix(in_oklab,var(--brand)_6%,transparent)] app-dark:bg-[color-mix(in_oklab,var(--brand)_8%,transparent)]";

const editorShellClass = "flex w-full min-w-0 items-center gap-2";

const inputClass =
  "min-w-0 flex-1 border-0 bg-transparent px-0 py-0.5 text-[16px] font-normal leading-snug text-[var(--text)] outline-none ring-0 shadow-none focus:outline-none focus:ring-0";

const inputPlaceholderTransitionClass =
  "placeholder:transition-colors placeholder:duration-[900ms] placeholder:ease-in-out motion-reduce:placeholder:transition-none";

const inputPlaceholderMutedClass =
  "placeholder:text-[var(--text)]/38 app-dark:placeholder:text-white/38";

const inputPlaceholderBrandClass =
  "placeholder:text-[var(--brand)] app-dark:placeholder:text-[var(--brand)]";

const PLACEHOLDER_PULSE_START_MS = 80;
const PLACEHOLDER_PULSE_DURATION_MS = 900;

const commitBtnClass =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text)]/45 transition hover:text-[var(--brand)] active:scale-[0.96] app-dark:hover:text-[var(--create-accent-icon-fg)]";

const wrapRowClass = "flex w-full min-w-0 flex-wrap gap-1.5";

function runSkipBlurCommit(
  skipBlurCommitRef: MutableRefObject<boolean>,
  fn: () => void
) {
  skipBlurCommitRef.current = true;
  fn();
  window.setTimeout(() => {
    skipBlurCommitRef.current = false;
  }, 0);
}

function AddKeyDetailButton() {
  const { values, editorOpen, openAddEditor, closeEditor, editingIndex } =
    useKeyInfoContext();

  const atMax = values.length >= V4_KEY_INFO_MAX_ITEMS;
  const isAdding = editorOpen && editingIndex == null;

  return (
    <button
      type="button"
      className={
        atMax
          ? quickActionDisabledClass
          : isAdding
            ? quickActionActiveClass
            : quickActionClass
      }
      aria-label={
        atMax ? "Key detail limit reached (4 items)" : "Add key detail"
      }
      aria-pressed={isAdding}
      aria-disabled={atMax}
      disabled={atMax}
      onClick={() => {
        if (atMax) return;
        if (editorOpen && editingIndex == null) {
          closeEditor();
          return;
        }
        openAddEditor();
      }}
    >
      <PiSparkle
        className={`h-3.5 w-3.5 shrink-0 ${isAdding && !atMax ? "" : "opacity-80"}`}
        aria-hidden
      />
      <span>Add key detail</span>
    </button>
  );
}

function KeyDetailInlineEditor() {
  const {
    values,
    editorOpen,
    editingIndex,
    draft,
    setDraft,
    commitDraft,
    skipBlurCommitRef,
    inputId,
  } = useKeyInfoContext();

  const [placeholderPulse, setPlaceholderPulse] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const showEditor =
    editorOpen &&
    (editingIndex != null || values.length < V4_KEY_INFO_MAX_ITEMS);
  const isEditingExisting = editingIndex != null;
  const isAdding = showEditor && !isEditingExisting;

  useEffect(() => {
    if (!isAdding) {
      setPlaceholderPulse(false);
      return;
    }

    let pulseStart: number | undefined;
    let pulseEnd: number | undefined;
    pulseStart = window.setTimeout(() => {
      setPlaceholderPulse(true);
    }, PLACEHOLDER_PULSE_START_MS);
    pulseEnd = window.setTimeout(() => {
      setPlaceholderPulse(false);
    }, PLACEHOLDER_PULSE_START_MS + PLACEHOLDER_PULSE_DURATION_MS);

    return () => {
      if (pulseStart != null) window.clearTimeout(pulseStart);
      if (pulseEnd != null) window.clearTimeout(pulseEnd);
    };
  }, [isAdding, editorOpen, editingIndex]);

  if (!showEditor) return null;

  const commitLabel = isEditingExisting ? "Save key detail" : "Add key detail";
  const showBrandPlaceholder = placeholderPulse && !draft.trim();

  return (
    <div className={editorShellClass}>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        enterKeyHint="done"
        className={[
          inputClass,
          inputPlaceholderTransitionClass,
          showBrandPlaceholder
            ? inputPlaceholderBrandClass
            : inputPlaceholderMutedClass,
        ].join(" ")}
        value={draft}
        maxLength={V4_KEY_INFO_VALUE_MAX}
        placeholder="Add a key detail (price, duration, age limit…)"
        autoFocus
        onChange={(e) => {
          setDraft(e.target.value);
          if (e.target.value.trim()) setPlaceholderPulse(false);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          runSkipBlurCommit(skipBlurCommitRef, () =>
            commitDraft({ fromEnter: true })
          );
        }}
        onBlur={() => {
          if (skipBlurCommitRef.current) return;
          commitDraft();
        }}
      />
      <button
        type="button"
        className={commitBtnClass}
        aria-label={commitLabel}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          runSkipBlurCommit(skipBlurCommitRef, () => commitDraft());
        }}
      >
        {isEditingExisting ? (
          <PiCheck className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <PiPlus className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
    </div>
  );
}

/** Inline key-detail editor — only mounts while adding/editing (no ghost gap). */
export function CreateFinalizeKeyInfoInlineEditor() {
  const { values, editorOpen, editingIndex } = useCreateFinalizeKeyInfo();
  const showEditor =
    editorOpen &&
    (editingIndex != null || values.length < V4_KEY_INFO_MAX_ITEMS);
  if (!showEditor) return null;

  return (
    <div
      className="flex w-full min-w-0 flex-col gap-2"
      data-create-key-info-editor
    >
      <KeyDetailInlineEditor />
    </div>
  );
}

function KeyDetailChipsRow() {
  const { values, editorOpen, editingIndex, openEditEditor, removeAt } =
    useKeyInfoContext();

  if (values.length === 0) return null;

  return (
    <div className={wrapRowClass} aria-label="Key details" data-create-key-info-chips>
      {values.map((value, index) => {
        const isEditing = editorOpen && editingIndex === index;
        return (
          <div
            key={`${index}-${value}`}
            className={`${chipClass}${isEditing ? ` ${chipEditingClass}` : ""}`}
          >
            <button
              type="button"
              className="min-w-0 max-w-full truncate text-left"
              onClick={() => openEditEditor(index)}
              aria-label={`Edit key detail: ${value}`}
            >
              {value}
            </button>
            <button
              type="button"
              className="shrink-0 rounded-full p-0.5 text-[var(--text)]/40 transition hover:text-[var(--text)]/75"
              aria-label={`Remove ${value}`}
              onClick={(e) => {
                e.stopPropagation();
                removeAt(index);
              }}
            >
              <PiX className="h-2.5 w-2.5" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Notes area under Add notes:
 * - editor closed → saved chips only (no panel)
 * - editor open → outlined composer with chips (if any) + existing inline editor
 * Chips never render twice.
 */
export function CreateFinalizeKeyInfoNotesArea() {
  const { values, editorOpen, editingIndex } = useCreateFinalizeKeyInfo();
  const showEditor =
    editorOpen &&
    (editingIndex != null || values.length < V4_KEY_INFO_MAX_ITEMS);

  if (showEditor) {
    return (
      <div
        className={`flex w-full min-w-0 flex-col gap-2.5 ${finalizeMetaNotesComposerSurfaceClass}`}
        data-create-key-info-composer
      >
        {values.length === 0 ? (
          <span
            aria-hidden="true"
            className={finalizeMetaChipGhostSurfaceClass}
            data-create-key-info-chip-ghost
          />
        ) : (
          <KeyDetailChipsRow />
        )}
        <KeyDetailInlineEditor />
      </div>
    );
  }

  if (values.length === 0) return null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <KeyDetailChipsRow />
    </div>
  );
}

/** @deprecated Prefer CreateFinalizeCaptionMetaActions + CreateFinalizeKeyInfoNotesArea */
export function CreateFinalizeKeyInfoQuickAction({
  suffix,
}: {
  /** Additional writing-layer quick actions (e.g. + Section). */
  suffix?: ReactNode;
}) {
  return (
    <div
      className="mt-2 flex w-full min-w-0 flex-col gap-2"
      data-create-writing-actions
    >
      <div className="flex w-full min-w-0 flex-wrap items-center gap-1">
        <AddKeyDetailButton />
        {suffix}
      </div>
      <KeyDetailInlineEditor />
    </div>
  );
}

/** Saved note chips only — prefer CreateFinalizeKeyInfoNotesArea for layout. */
export function CreateFinalizeKeyInfoChips() {
  const { values, editorOpen } = useKeyInfoContext();

  if (values.length === 0 || editorOpen) return null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <KeyDetailChipsRow />
    </div>
  );
}

