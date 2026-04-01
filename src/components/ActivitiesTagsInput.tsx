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

/** One visual line → pill; explicit newline or wrapped 2+ lines → rounded rectangle. */
function ActivityTagLine({
  text,
  isFirst,
  onRemove,
}: {
  text: string;
  isFirst: boolean;
  onRemove: () => void;
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
        "flex w-full min-w-0 items-start gap-1.5 rounded-lg border border-[var(--border)]/72 bg-[color-mix(in_oklab,var(--surface)_52%,transparent)] px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:border-[var(--border)]/60 dark:bg-[color-mix(in_oklab,var(--surface)_40%,transparent)]",
      ].join(" ")
    : [
        "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border border-[var(--border)]/72 bg-[color-mix(in_oklab,var(--surface)_52%,transparent)] px-2.5 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:border-[var(--border)]/60 dark:bg-[color-mix(in_oklab,var(--surface)_40%,transparent)]",
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
          className={[
            "m-0 min-w-0 flex-1 break-words p-0 leading-snug",
            isFirst
              ? "text-[15px] font-extrabold tracking-tight text-[var(--text)]"
              : "text-[13px] font-medium text-[var(--text)]/72 dark:text-[var(--text)]/68",
          ].join(" ")}
        >
          {text}
        </p>
        <button
          type="button"
          onClick={onRemove}
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

/** Preview of the next line before commit — dashed white shell, distinct from saved pills. */
function ActivityDraftPreviewLine({
  text,
  isFirst,
}: {
  text: string;
  isFirst: boolean;
}) {
  const multiline = text.includes("\n");
  const shell = multiline
    ? [
        "flex w-full min-w-0 items-start gap-1.5 rounded-xl border-2 border-dashed px-3 py-1.5",
        "border-white/45 bg-white/[0.06]",
        "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]",
        "dark:border-white/50 dark:bg-white/[0.07]",
      ].join(" ")
    : [
        "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border-2 border-dashed px-2.5 py-1",
        "border-white/45 bg-white/[0.06]",
        "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]",
        "dark:border-white/50 dark:bg-white/[0.07]",
      ].join(" ");

  return (
    <div
      className={
        multiline
          ? "flex w-full min-w-0 items-start justify-start"
          : "flex max-w-full items-center justify-start"
      }
    >
      <div className={["flex min-w-0", shell].join(" ")}>
        <p
          className={[
            "m-0 min-w-0 flex-1 whitespace-pre-wrap break-words p-0 leading-snug italic text-[var(--text)]/78",
            isFirst
              ? "text-[15px] font-extrabold tracking-tight"
              : "text-[13px] font-medium",
          ].join(" ")}
        >
          {text}
        </p>
        <span
          className={[
            "shrink-0 rounded-full bg-neutral-950 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-white dark:bg-neutral-950",
            multiline ? "self-start" : "self-center",
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
  const ref = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const tagsRef = useRef(tags);
  const blurCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectingSuggestionRef = useRef(false);

  tagsRef.current = tags;

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

  const removeTag = (t: string) => {
    onChange(tags.filter((x) => x !== t));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    addTag(input);
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

      const pending = ref.current?.value ?? "";
      addTag(pending);
      setOpen(false);
    }, 120);
  };

  const lines = visibleTagLines(tags);

  const composerMaxLen = useMemo(
    () => maxCharsForNextActivityTagEntry(tags),
    [tags]
  );

  const atTagLineLimit =
    visibleActivityTagLines(tags).length >=
    CREATE_FLOW_LIMITS.activities.maxActivityTagLinesPerStop;

  const composerTone = charLimitTone(input.length, composerMaxLen);
  const composerRingExtra = charFieldRingClassForTone(composerTone);

  const canCommitLine = !atTagLineLimit && input.trim().length > 0;

  const showDraftPreview = !atTagLineLimit && input.trim().length > 0;

  const maxLinesPerStop =
    CREATE_FLOW_LIMITS.activities.maxActivityTagLinesPerStop;

  return (
    <div className="w-full max-w-full overflow-hidden">
      {(lines.length > 0 || showDraftPreview) && (
        <div className="mb-3 flex flex-col gap-1.5">
          {lines.map((t, i) => (
            <ActivityTagLine
              key={`${t}-${i}`}
              text={t}
              isFirst={i === 0}
              onRemove={() => removeTag(t)}
            />
          ))}
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
            "relative min-w-0 overflow-hidden rounded-xl px-3 py-2.5 transition",
            atTagLineLimit ? "opacity-[0.72]" : "",
            "bg-[color-mix(in_oklab,var(--surface)_82%,transparent)]",
            "ring-[1.5px] ring-[color-mix(in_oklab,var(--brand)_28%,var(--border))] ring-inset",
            "shadow-[0_0_0_1px_color-mix(in_oklab,var(--brand)_18%,transparent),0_4px_20px_color-mix(in_oklab,var(--brand)_10%,transparent),0_8px_28px_rgba(0,0,0,0.06)]",
            "dark:bg-[color-mix(in_oklab,var(--surface)_52%,transparent)]",
            "focus-within:ring-[color-mix(in_oklab,var(--brand)_42%,var(--border))]",
            "focus-within:shadow-[0_0_0_1px_color-mix(in_oklab,var(--brand)_22%,transparent),0_0_0_4px_color-mix(in_oklab,var(--brand)_14%,transparent),0_8px_32px_color-mix(in_oklab,var(--brand)_12%,transparent)]",
            composerRingExtra,
            "dark:!ring-[1.5px] dark:!ring-inset dark:!ring-white/42 dark:!border-0 dark:!ring-offset-0",
            "dark:!shadow-[0_0_0_1px_rgba(255,255,255,0.32),0_6px_26px_rgba(0,0,0,0.42)]",
            "dark:focus-within:!ring-white/58",
            "dark:focus-within:!shadow-[0_0_0_1px_rgba(255,255,255,0.42),0_0_0_4px_rgba(255,255,255,0.07),0_8px_32px_rgba(0,0,0,0.45)]",
          ].join(" ")}
        >
          <button
            type="button"
            disabled={!canCommitLine}
            aria-label={
              canCommitLine
                ? "Add activity line"
                : "Add activity (type text first)"
            }
            title={canCommitLine ? "Add" : undefined}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => {
              if (!canCommitLine) return;
              addTag(input);
            }}
            className={[
              "absolute right-2 top-2 z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
              canCommitLine
                ? [
                    "cursor-pointer border-0 bg-white text-neutral-950 shadow-sm",
                    "hover:bg-neutral-100 active:scale-[0.98]",
                    "dark:bg-white dark:text-neutral-950",
                  ].join(" ")
                : [
                    "cursor-not-allowed border border-white/15 bg-white/[0.08] text-[var(--text)]/30",
                    "dark:border-white/12 dark:bg-white/[0.08] dark:text-white/30",
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
            readOnly={atTagLineLimit}
            autoCapitalize="sentences"
            autoCorrect="on"
            spellCheck
            aria-describedby={
              atTagLineLimit ? "activities-tag-line-limit-hint" : undefined
            }
            onChange={(e) => {
              setInput(clampString(e.target.value, composerMaxLen));
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={scheduleCloseAndMaybeCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (atTagLineLimit) return;
                addTag(input);
              }
            }}
            enterKeyHint="done"
            placeholder={
              atTagLineLimit
                ? "Max notes reached for this stop"
                : "Add ideas, plans, or notes for this stop"
            }
            className="min-h-[3.25rem] w-full resize-none bg-transparent pb-7 pr-12 pl-0.5 pt-0 text-[15px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[14px] placeholder:leading-relaxed placeholder:text-[var(--text)]/52"
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

        {atTagLineLimit && (
          <p
            className="mt-1.5 text-[11px] leading-snug text-[var(--text)]/48"
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
                    addTag(s);
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
