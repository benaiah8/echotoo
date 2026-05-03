import {
  useRef,
  useState,
  useEffect,
  useMemo,
  useLayoutEffect,
  useCallback,
  type FormEvent,
} from "react";
import { PiCheck } from "react-icons/pi";
import { activitiesData } from "../data/data";
import { CREATE_FLOW_LIMITS } from "../lib/createFlowLimits";
import {
  clampString,
  charCounterClassForTone,
  charFieldRingClassForTone,
  charLimitTone,
  formatCharCount,
  maxCharsForActivityTagLineAtVisibleIndex,
  maxCharsForNextActivityTagEntry,
  visibleActivityTagLines,
} from "../lib/createFlowLimitUtils";

/** True if tags already include the custom activity sentinel (any casing). */
function tagsIncludeCustomSentinel(tagList: string[]): boolean {
  return tagList.some((x) => x.toLowerCase() === "custom");
}

/** Display lines only (exclude custom sentinel from the stacked list). */
function visibleTagLines(tags: string[]): string[] {
  return tags.filter((t) => t.toLowerCase() !== "custom");
}

/** Physical index in `tags` for the n-th visible (non-custom) line. */
function tagIndexForVisibleLine(tags: string[], visibleIndex: number): number {
  let n = -1;
  for (let i = 0; i < tags.length; i++) {
    if (tags[i].toLowerCase() === "custom") continue;
    n++;
    if (n === visibleIndex) return i;
  }
  return -1;
}

function removeTagAtVisibleIndex(
  tags: string[],
  visibleIndex: number
): string[] {
  const ti = tagIndexForVisibleLine(tags, visibleIndex);
  if (ti < 0) return tags;
  return tags.filter((_, j) => j !== ti);
}

function replaceVisibleLine(
  tags: string[],
  visibleIndex: number,
  newText: string
): string[] {
  const ti = tagIndexForVisibleLine(tags, visibleIndex);
  if (ti < 0) return tags;
  const next = [...tags];
  next[ti] = newText;
  return next;
}

/** Commit edit: empty removes line; duplicate of another visible line returns null. */
function tryCommitEdit(
  tags: string[],
  visibleIndex: number,
  rawInput: string
): string[] | null {
  const raw = rawInput.trim();
  if (raw === "") {
    return removeTagAtVisibleIndex(tags, visibleIndex);
  }
  const maxLen = maxCharsForActivityTagLineAtVisibleIndex(visibleIndex);
  const next = clampString(raw, maxLen);
  if (!next) return removeTagAtVisibleIndex(tags, visibleIndex);
  const visible = visibleTagLines(tags);
  const otherVis = visible.filter((_, j) => j !== visibleIndex);
  if (otherVis.includes(next)) return null;
  return replaceVisibleLine(tags, visibleIndex, next);
}

/** One visual line → pill; explicit newline or wrapped 2+ lines → rounded rectangle. */
function ActivityTagLine({
  text,
  isFirst,
  onRemove,
  onLineClick,
}: {
  text: string;
  isFirst: boolean;
  onRemove: () => void;
  /** Tap the line to load text into the composer for editing. */
  onLineClick?: () => void;
}) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  /** Mirrors wrapIsMultiline for hysteresis without stale closures in ResizeObserver. */
  const wrapRef = useRef(false);
  const explicitMultiline = text.includes("\n");
  const [wrapIsMultiline, setWrapIsMultiline] = useState(false);

  const measure = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    if (explicitMultiline) {
      if (!wrapRef.current) {
        wrapRef.current = true;
        setWrapIsMultiline(true);
      }
      return;
    }
    const style = window.getComputedStyle(el);
    const lh = parseFloat(style.lineHeight);
    const fs = parseFloat(style.fontSize);
    const lineHeightPx =
      Number.isFinite(lh) && lh > 0 ? lh : Number.isFinite(fs) ? fs * 1.25 : 16;
    const h = el.scrollHeight;
    const prev = wrapRef.current;
    // Hysteresis: pill↔block must not depend on leading/width feedback (avoids flicker on first row).
    let next: boolean;
    if (prev) {
      next = h > lineHeightPx + 1;
    } else {
      next = h > lineHeightPx + 6;
    }
    if (next !== prev) {
      wrapRef.current = next;
      setWrapIsMultiline(next);
    }
  }, [text, explicitMultiline]);

  useLayoutEffect(() => {
    if (explicitMultiline) {
      wrapRef.current = true;
      setWrapIsMultiline(true);
      return;
    }
    wrapRef.current = false;
    setWrapIsMultiline(false);
    measure();
  }, [text, explicitMultiline, measure]);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const useBlock = explicitMultiline || wrapIsMultiline;

  const shell = useBlock
    ? [
        "flex w-full min-w-0 items-start gap-1.5 rounded-[var(--create-radius-field)] border-2 border-[var(--create-border-primary-field)] bg-white/95 px-3 py-1.5 shadow-[inset_0_1px_0_rgba(0,0,0,0.04)] app-dark:bg-[color-mix(in_oklab,var(--surface)_40%,transparent)] app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
      ].join(" ")
    : [
        "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border-2 border-[var(--create-border-primary-field)] bg-white/95 px-2.5 py-1 shadow-[inset_0_1px_0_rgba(0,0,0,0.04)] app-dark:bg-[color-mix(in_oklab,var(--surface)_40%,transparent)] app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
      ].join(" ");

  return (
    <div
      ref={rowRef}
      className={
        useBlock
          ? "flex w-full min-w-0 items-start justify-start"
          : "flex max-w-full items-center justify-start"
      }
    >
      <div className={["flex min-w-0", shell].join(" ")}>
        <p
          ref={textRef}
          role={onLineClick ? "button" : undefined}
          tabIndex={onLineClick ? 0 : undefined}
          onClick={
            onLineClick
              ? (e) => {
                  e.stopPropagation();
                  onLineClick();
                }
              : undefined
          }
          onKeyDown={
            onLineClick
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onLineClick();
                  }
                }
              : undefined
          }
          className={[
            "m-0 min-w-0 flex-1 break-words p-0 leading-snug",
            isFirst
              ? "text-[15px] font-extrabold tracking-tight text-neutral-900 app-dark:text-[var(--text)]"
              : "text-[13px] font-medium text-neutral-800/90 app-dark:text-[var(--text)]/68",
            onLineClick
              ? "cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg)]"
              : "",
          ].join(" ")}
        >
          {text}
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={[
            "shrink-0 rounded-full p-px text-[var(--text)]/50 hover:bg-[var(--surface)]/45 hover:text-[var(--text)]/82",
            useBlock ? "self-start leading-none" : "self-center leading-none",
          ].join(" ")}
          aria-label={`Remove “${text}”`}
          title="Remove"
        >
          ×
        </button>
      </div>
    </div>
  );
}

/** Preview of the next line before commit — dashed shell; pill for one visual line, rounded rect for explicit newlines or wrapped text. */
function ActivityDraftPreviewLine({
  text,
  isFirst,
}: {
  text: string;
  isFirst: boolean;
}) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef(false);
  const explicitMultiline = text.includes("\n");
  const [wrapIsMultiline, setWrapIsMultiline] = useState(false);

  const measure = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    if (explicitMultiline) {
      if (!wrapRef.current) {
        wrapRef.current = true;
        setWrapIsMultiline(true);
      }
      return;
    }
    const style = window.getComputedStyle(el);
    const lh = parseFloat(style.lineHeight);
    const fs = parseFloat(style.fontSize);
    const lineHeightPx =
      Number.isFinite(lh) && lh > 0 ? lh : Number.isFinite(fs) ? fs * 1.25 : 16;
    const h = el.scrollHeight;
    const prev = wrapRef.current;
    let next: boolean;
    if (prev) {
      next = h > lineHeightPx + 1;
    } else {
      next = h > lineHeightPx + 6;
    }
    if (next !== prev) {
      wrapRef.current = next;
      setWrapIsMultiline(next);
    }
  }, [text, explicitMultiline]);

  useLayoutEffect(() => {
    if (explicitMultiline) {
      wrapRef.current = true;
      setWrapIsMultiline(true);
      return;
    }
    wrapRef.current = false;
    setWrapIsMultiline(false);
    measure();
  }, [text, explicitMultiline, measure]);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const useBlock = explicitMultiline || wrapIsMultiline;

  const shell = useBlock
    ? [
        "flex w-full min-w-0 items-start gap-1.5 rounded-[var(--create-radius-panel)] border-2 border-dashed border-[var(--create-border-dashed)] px-3 py-1.5",
        "bg-neutral-950/[0.04]",
        "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]",
        "app-dark:bg-white/[0.07] app-dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]",
      ].join(" ")
    : [
        "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border-2 border-dashed border-[var(--create-border-dashed)] px-2.5 py-1",
        "bg-neutral-950/[0.04]",
        "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]",
        "app-dark:bg-white/[0.07] app-dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]",
      ].join(" ");

  const pClass = [
    "m-0 min-w-0 flex-1 whitespace-pre-wrap break-words p-0 leading-snug italic text-neutral-900/85 app-dark:text-[var(--text)]/78",
    isFirst
      ? "text-[15px] font-extrabold tracking-tight"
      : "text-[13px] font-medium",
  ].join(" ");

  return (
    <div
      ref={rowRef}
      className={
        useBlock
          ? "flex w-full min-w-0 items-start justify-start"
          : "flex max-w-full items-center justify-start"
      }
    >
      <div className={["flex min-w-0", shell].join(" ")}>
        <p ref={textRef} className={pClass}>
          {text}
        </p>
        <span
          className={[
            "shrink-0 rounded-full bg-neutral-950 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-white app-dark:bg-neutral-950",
            useBlock ? "self-start" : "self-center",
          ].join(" ")}
        >
          Draft
        </span>
      </div>
    </div>
  );
}

export default function ActivitiesTagsInput({
  tags,
  onChange,
  autoFocus,
  /** When the active stop changes, refocus the composer (Capacitor-safe: preventScroll). */
  activityKey,
}: {
  tags: string[];
  onChange: (newTags: string[]) => void;
  autoFocus?: boolean;
  activityKey?: number;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  /** Which visible line (0-based) is loaded into the composer for edit; null = composing a new line. */
  const [editingVisibleIndex, setEditingVisibleIndex] = useState<number | null>(
    null
  );
  const ref = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const tagsRef = useRef(tags);
  const blurCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectingSuggestionRef = useRef(false);
  const editingVisibleIndexRef = useRef<number | null>(null);

  tagsRef.current = tags;
  editingVisibleIndexRef.current = editingVisibleIndex;

  const suggestions = activitiesData
    .map((a) => a.title)
    .filter((title) => {
      if (title.toLowerCase() === "custom" && tagsIncludeCustomSentinel(tags)) {
        return false;
      }
      return (
        !tags.includes(title) &&
        title.toLowerCase().includes(input.toLowerCase())
      );
    });

  useEffect(() => {
    if (open) setTimeout(() => ref.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (autoFocus) {
      const id = requestAnimationFrame(() => {
        ref.current?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(id);
    }
  }, [autoFocus]);

  const prevActivityKeyRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (activityKey === undefined) return;
    if (prevActivityKeyRef.current === undefined) {
      prevActivityKeyRef.current = activityKey;
      return;
    }
    if (prevActivityKeyRef.current === activityKey) return;
    prevActivityKeyRef.current = activityKey;
    setEditingVisibleIndex(null);
    setInput("");
    const id = requestAnimationFrame(() => {
      ref.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [activityKey]);

  useEffect(() => {
    return () => {
      if (blurCloseTimerRef.current) clearTimeout(blurCloseTimerRef.current);
    };
  }, []);

  const addTag = (t: string) => {
    if (editingVisibleIndexRef.current !== null) return;
    const raw = t.trim();
    if (!raw) return;
    const currentTags = tagsRef.current;
    const maxLines = CREATE_FLOW_LIMITS.activities.maxActivityTagLinesPerStop;

    if (raw.toLowerCase() === "custom") {
      if (tagsIncludeCustomSentinel(currentTags)) return;
      const rest = currentTags.filter((x) => x.toLowerCase() !== "custom");
      onChange([...rest, "custom"]);
      setInput("");
      setOpen(false);
      return;
    }

    if (visibleActivityTagLines(currentTags).length >= maxLines) {
      return;
    }

    const maxLen = maxCharsForNextActivityTagEntry(currentTags);
    const next = clampString(raw, maxLen);

    if (!next) return;

    if (!currentTags.includes(next)) {
      onChange([...currentTags, next]);
      setInput("");
      setOpen(false);
      ref.current?.focus();
    }
  };

  const removeAtVisibleIndex = (visibleIndex: number) => {
    const editing = editingVisibleIndexRef.current;
    if (editing !== null) {
      if (editing === visibleIndex) {
        setEditingVisibleIndex(null);
        setInput("");
      } else if (visibleIndex < editing) {
        setEditingVisibleIndex(editing - 1);
      }
    }
    onChange(removeTagAtVisibleIndex(tagsRef.current, visibleIndex));
  };

  const applySuggestionOrAppend = (s: string) => {
    const evi = editingVisibleIndexRef.current;
    if (evi !== null) {
      const maxLen = maxCharsForActivityTagLineAtVisibleIndex(evi);
      const next = clampString(s, maxLen);
      const currentTags = tagsRef.current;
      const visible = visibleTagLines(currentTags);
      const otherVis = visible.filter((_, j) => j !== evi);
      if (otherVis.includes(next)) return;
      onChange(replaceVisibleLine(currentTags, evi, next));
      setEditingVisibleIndex(null);
      setInput("");
      setOpen(false);
      return;
    }
    addTag(s);
  };

  const commitOrAppendFromComposer = () => {
    const evi = editingVisibleIndexRef.current;
    const pending = ref.current?.value ?? "";
    if (evi !== null) {
      const res = tryCommitEdit(tagsRef.current, evi, pending);
      if (res === null) return;
      onChange(res);
      setEditingVisibleIndex(null);
      setInput("");
      setOpen(false);
      return;
    }
    addTag(pending);
    setOpen(false);
  };

  const startEditLine = (visibleIndex: number) => {
    let working = tagsRef.current;
    const prevEdit = editingVisibleIndexRef.current;
    if (prevEdit !== null && prevEdit !== visibleIndex) {
      const res = tryCommitEdit(working, prevEdit, ref.current?.value ?? "");
      if (res === null) return;
      onChange(res);
      working = res;
    }
    const linesAfter = visibleTagLines(working);
    if (visibleIndex < 0 || visibleIndex >= linesAfter.length) return;
    setEditingVisibleIndex(visibleIndex);
    setInput(linesAfter[visibleIndex]);
    setOpen(true);
    requestAnimationFrame(() => {
      ref.current?.focus({ preventScroll: true });
    });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    commitOrAppendFromComposer();
  };

  const scheduleCloseAndMaybeCommit = () => {
    if (blurCloseTimerRef.current) clearTimeout(blurCloseTimerRef.current);
    blurCloseTimerRef.current = setTimeout(() => {
      blurCloseTimerRef.current = null;

      const picking = selectingSuggestionRef.current;
      selectingSuggestionRef.current = false;
      if (picking) {
        setOpen(false);
        return;
      }

      const root = formRef.current;
      if (root?.contains(document.activeElement)) {
        setOpen(false);
        return;
      }

      commitOrAppendFromComposer();
    }, 120);
  };

  const lines = visibleTagLines(tags);

  const composerMaxLen = useMemo(() => {
    if (editingVisibleIndex !== null) {
      return maxCharsForActivityTagLineAtVisibleIndex(editingVisibleIndex);
    }
    return maxCharsForNextActivityTagEntry(tags);
  }, [tags, editingVisibleIndex]);

  const atTagLineLimit =
    visibleActivityTagLines(tags).length >=
    CREATE_FLOW_LIMITS.activities.maxActivityTagLinesPerStop;

  const composerReadOnly = atTagLineLimit && editingVisibleIndex === null;

  const composerTone = charLimitTone(input.length, composerMaxLen);
  const composerRingExtra = charFieldRingClassForTone(composerTone);

  const canCommitLine =
    editingVisibleIndex !== null
      ? true
      : !atTagLineLimit && input.trim().length > 0;

  const showDraftPreview =
    editingVisibleIndex === null && !atTagLineLimit && input.trim().length > 0;

  const maxLinesPerStop =
    CREATE_FLOW_LIMITS.activities.maxActivityTagLinesPerStop;

  return (
    <div className="w-full max-w-full overflow-hidden">
      {(lines.length > 0 ||
        showDraftPreview ||
        editingVisibleIndex !== null) && (
        <div className="mb-3 flex flex-col gap-1.5">
          {lines.map((t, i) => {
            if (editingVisibleIndex === i) {
              return (
                <ActivityDraftPreviewLine
                  key={`draft-edit-${i}`}
                  text={clampString(input, composerMaxLen)}
                  isFirst={i === 0}
                />
              );
            }
            return (
              <ActivityTagLine
                key={`line-${i}`}
                text={t}
                isFirst={i === 0}
                onRemove={() => removeAtVisibleIndex(i)}
                onLineClick={() => startEditLine(i)}
              />
            );
          })}
          {showDraftPreview && (
            <ActivityDraftPreviewLine
              text={clampString(input, composerMaxLen)}
              isFirst={lines.length === 0}
            />
          )}
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} className="relative">
        <div
          className={[
            "relative min-w-0 overflow-hidden rounded-[var(--create-radius-panel)] border-2 border-[var(--create-border-primary-field)] bg-white/98 px-3 py-2.5 transition",
            atTagLineLimit && editingVisibleIndex === null
              ? "opacity-[0.72]"
              : "",
            "app-dark:bg-[color-mix(in_oklab,var(--surface)_52%,transparent)]",
            "shadow-[inset_0_1px_0_rgba(0,0,0,0.04)] app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_6px_22px_rgba(0,0,0,0.28)]",
            "focus-within:border-[var(--brand)]/50 focus-within:shadow-[0_0_0_2px_color-mix(in_oklab,var(--brand)_18%,transparent),inset_0_1px_0_rgba(0,0,0,0.04)]",
            "app-dark:focus-within:border-[var(--brand)]/55 app-dark:focus-within:shadow-[0_0_0_2px_color-mix(in_oklab,var(--brand)_22%,transparent),inset_0_1px_0_rgba(255,255,255,0.08)]",
            composerRingExtra,
          ].join(" ")}
        >
          <button
            type="button"
            disabled={!canCommitLine}
            aria-label={
              editingVisibleIndex !== null
                ? "Save activity line"
                : canCommitLine
                ? "Add activity line"
                : "Add activity (type text first)"
            }
            title={
              editingVisibleIndex !== null
                ? "Save"
                : canCommitLine
                ? "Add"
                : undefined
            }
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => {
              if (!canCommitLine) return;
              commitOrAppendFromComposer();
            }}
            className={[
              "absolute right-2 top-2 z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
              canCommitLine
                ? [
                    "cursor-pointer border-0 bg-white text-neutral-950 shadow-sm",
                    "hover:bg-neutral-100 active:scale-[0.98]",
                    "app-dark:bg-white app-dark:text-neutral-950",
                  ].join(" ")
                : [
                    "cursor-not-allowed border border-white/15 bg-white/[0.08] text-[var(--text)]/30",
                    "app-dark:border-white/12 app-dark:bg-white/[0.08] app-dark:text-white/30",
                  ].join(" "),
            ].join(" ")}
          >
            <PiCheck
              className={[
                "h-4 w-4",
                canCommitLine ? "text-neutral-950" : "",
              ].join(" ")}
              strokeWidth={2.5}
              aria-hidden
            />
          </button>
          <textarea
            ref={ref}
            value={input}
            rows={3}
            maxLength={composerMaxLen}
            readOnly={composerReadOnly}
            autoCapitalize="sentences"
            autoCorrect="on"
            spellCheck
            aria-describedby={
              composerReadOnly ? "activities-tag-line-limit-hint" : undefined
            }
            onChange={(e) => {
              setInput(clampString(e.target.value, composerMaxLen));
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={scheduleCloseAndMaybeCommit}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                if (editingVisibleIndex !== null) {
                  e.preventDefault();
                  setEditingVisibleIndex(null);
                  setInput("");
                  setOpen(false);
                }
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (composerReadOnly) return;
                commitOrAppendFromComposer();
              }
            }}
            enterKeyHint="done"
            placeholder={
              composerReadOnly
                ? "Max notes reached for this stop"
                : editingVisibleIndex !== null
                ? "Edit this line, then tap the check or press Enter"
                : "Add ideas, plans, or notes for this stop"
            }
            className="min-h-[3.25rem] w-full resize-none bg-transparent pb-7 pr-12 pl-0.5 pt-0 text-[15px] leading-relaxed text-neutral-900 outline-none placeholder:text-[14px] placeholder:leading-relaxed placeholder:text-neutral-500 app-dark:text-[var(--text)] app-dark:placeholder:text-[var(--text)]/52"
          />
          <span
            className={`pointer-events-none absolute bottom-1 right-1 text-[10px] tabular-nums leading-none ${charCounterClassForTone(
              composerTone
            )}`}
            aria-hidden
          >
            {formatCharCount(input, composerMaxLen)}
          </span>
        </div>

        {composerReadOnly && (
          <p
            className="mt-1.5 text-[11px] leading-snug text-neutral-600 app-dark:text-[var(--text)]/48"
            id="activities-tag-line-limit-hint"
          >
            Max {maxLinesPerStop} notes for this stop
          </p>
        )}

        {open && (
          <div
            role="listbox"
            onPointerDownCapture={(e) => {
              if ((e.target as HTMLElement).closest('[role="option"]')) {
                selectingSuggestionRef.current = true;
              }
            }}
            className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow"
          >
            {suggestions.length > 0 ? (
              suggestions.map((s) => (
                <div
                  key={s}
                  role="option"
                  className="cursor-pointer px-3 py-2 text-sm hover:bg-[var(--surface-2)]/50"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    selectingSuggestionRef.current = false;
                    applySuggestionOrAppend(s);
                  }}
                >
                  {s}
                </div>
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-[var(--text)]/55">
                Type and press Enter to add
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
