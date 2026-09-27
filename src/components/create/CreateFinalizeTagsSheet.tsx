/**
 * V4 Finalize Tags sheet — same BottomDrawer / keyboard pattern as Location.
 * Working copy until Done; X / backdrop discard.
 */
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import { PiX } from "react-icons/pi";
import BottomDrawer from "../ui/BottomDrawer";
import { glassPeoplePanelClass } from "../../lib/glassActionSheetStyles";
import {
  CREATE_FLOW_HASHTAG_MAX,
  formatHashtagForDisplay,
  normalizeHashtagToken,
} from "../../lib/createFlowLimits";
import { CREATE_FLOW_ADVISORY_FIELD_HIGHLIGHT_CLASS } from "../../lib/createFlowAdvisoryHighlight";

type Props = {
  open: boolean;
  onClose: () => void;
  onCommit: (tags: string[]) => void;
  tags: string[];
  advisoryHighlight?: boolean;
};

const closeBtnClass =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)]/70 text-[var(--text)]/75 transition hover:bg-[var(--text)]/8";

const doneClass =
  "flex h-10 min-h-10 w-full items-center justify-center rounded-full bg-amber-400/90 px-3 text-[13px] font-semibold text-neutral-900 transition active:scale-[0.99]";

const fieldClass =
  "w-full border-0 bg-transparent px-0 py-1 text-[16px] font-normal leading-snug text-[var(--text)] outline-none shadow-none " +
  "placeholder:transition-colors placeholder:duration-700 placeholder:ease-out";

const chipClass =
  "inline-flex items-center gap-0.5 rounded-full border border-[color-mix(in_oklab,var(--brand)_42%,var(--border))] bg-[color-mix(in_oklab,var(--brand)_12%,var(--surface))] px-1.5 py-0.5 text-[10px] font-medium leading-tight text-neutral-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)] app-dark:border-[color-mix(in_oklab,var(--brand)_45%,white)] app-dark:bg-[color-mix(in_oklab,var(--brand)_32%,rgba(15,15,18,0.92))] app-dark:text-white app-dark:shadow-[0_1px_4px_rgba(0,0,0,0.45)]";

const subtleBtn =
  "inline-flex h-6 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-[var(--text)]/50 transition hover:text-[var(--text)]/75 active:scale-[0.99]";

const PLACEHOLDER_PULSE_START_MS = 80;
const PLACEHOLDER_PULSE_DURATION_MS = 900;

function splitPasteTags(text: string): string[] {
  return text
    .split(/[,;\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function mergeNormalizedTokensIntoTags(prev: string[], rawTokens: string[]): string[] {
  const next = [...prev];
  for (const raw of rawTokens) {
    const v = normalizeHashtagToken(raw);
    if (!v || next.length >= CREATE_FLOW_HASHTAG_MAX) break;
    if (!next.includes(v)) next.push(v);
  }
  return next;
}

export default function CreateFinalizeTagsSheet({
  open,
  onClose,
  onCommit,
  tags,
  advisoryHighlight = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionRef = useRef(false);
  const [workingTags, setWorkingTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [placeholderPulse, setPlaceholderPulse] = useState(false);

  const atTagLimit = workingTags.length >= CREATE_FLOW_HASHTAG_MAX;

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setPlaceholderPulse(false);
      setTagInput("");
      return;
    }
    const ae = document.activeElement;
    if (ae instanceof HTMLElement && ae !== inputRef.current) ae.blur();
    setWorkingTags([...tags]);

    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, 40);

    let pulseStart: number | undefined;
    let pulseEnd: number | undefined;
    if (tags.length === 0) {
      pulseStart = window.setTimeout(() => {
        setPlaceholderPulse(true);
      }, PLACEHOLDER_PULSE_START_MS);
      pulseEnd = window.setTimeout(() => {
        setPlaceholderPulse(false);
      }, PLACEHOLDER_PULSE_START_MS + PLACEHOLDER_PULSE_DURATION_MS);
    }

    return () => {
      window.clearTimeout(focusTimer);
      if (pulseStart != null) window.clearTimeout(pulseStart);
      if (pulseEnd != null) window.clearTimeout(pulseEnd);
    };
  }, [open, tags]);

  const setTags: Dispatch<SetStateAction<string[]>> = (updater) => {
    setWorkingTags((prev) =>
      typeof updater === "function" ? updater(prev) : updater
    );
  };

  const addTag = (t: string) => {
    const v = normalizeHashtagToken(t);
    if (!v) return;
    setTags((prev) => {
      if (prev.length >= CREATE_FLOW_HASHTAG_MAX) return prev;
      return prev.includes(v) ? prev : [...prev, v];
    });
    setTagInput("");
  };

  const addTagsFromPaste = (raw: string) => {
    const parts = splitPasteTags(raw);
    if (!parts.length) return;
    setTags((prev) => mergeNormalizedTokensIntoTags(prev, parts));
    setTagInput("");
  };

  const scheduleBlurCommit = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => {
      blurTimerRef.current = null;
      const interacting = interactionRef.current;
      interactionRef.current = false;
      if (interacting) return;
      if (formRef.current?.contains(document.activeElement)) return;
      const pending = inputRef.current?.value ?? "";
      if (pending.trim()) addTag(pending);
    }, 120);
  };

  const removeTag = (t: string) =>
    setTags((prev) => prev.filter((x) => x !== t));

  const discard = () => {
    onClose();
  };

  const commit = () => {
    const pending = tagInput.trim();
    let next = workingTags;
    if (pending) {
      next = mergeNormalizedTokensIntoTags(workingTags, [pending]);
    }
    onCommit(next);
  };

  const clearTags = () => {
    setWorkingTags([]);
    setTagInput("");
  };

  const hasWorkingTags = workingTags.length > 0 || tagInput.trim().length > 0;

  return (
    <BottomDrawer
      open={open}
      onClose={discard}
      transparentSheet
      backdropVariant="strong"
      portalClassName="z-[130]"
      maxHeight="88vh"
      shrinkSheetToContent
      liftWithKeyboard
      showCloseButton={false}
      contentClassName="px-4 pt-1"
    >
      <div
        className={[
          glassPeoplePanelClass,
          "mx-auto flex max-h-[min(82vh,40rem)] w-full max-w-lg flex-col",
          advisoryHighlight ? CREATE_FLOW_ADVISORY_FIELD_HIGHLIGHT_CLASS : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label="Tags"
      >
        <div className="flex shrink-0 items-start gap-2 px-3 py-2.5">
          <div
            className="flex min-h-[36px] min-w-0 flex-1 flex-wrap items-center gap-1.5"
            onPointerDownCapture={(e) => {
              if ((e.target as HTMLElement).closest("button")) {
                interactionRef.current = true;
              }
            }}
          >
            {workingTags.map((t) => (
              <span key={t} className={chipClass}>
                {formatHashtagForDisplay(t)}
                <button
                  type="button"
                  className="pl-0.5 text-[10px] leading-none text-neutral-700 opacity-70 hover:text-neutral-900 hover:opacity-100 app-dark:text-white/85 app-dark:hover:text-white"
                  aria-label={`Remove ${formatHashtagForDisplay(t)}`}
                  onClick={() => removeTag(t)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <button
            type="button"
            className={closeBtnClass}
            aria-label="Close"
            onClick={discard}
          >
            <PiX className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div
          className="min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pb-1"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              inputRef.current?.focus();
            }
          }}
        >
          <form
            ref={formRef}
            onSubmit={(e) => {
              e.preventDefault();
              addTag(tagInput);
            }}
          >
            <input
              ref={inputRef}
              value={tagInput}
              disabled={atTagLimit}
              onChange={(e) => {
                const v = e.target.value;
                if (v.includes(",")) {
                  const parts = v.split(",");
                  const last = parts.pop() ?? "";
                  const toAdd = parts.map((p) => p.trim()).filter(Boolean);
                  if (toAdd.length) {
                    setTags((prev) => mergeNormalizedTokensIntoTags(prev, toAdd));
                  }
                  setTagInput(last);
                  return;
                }
                setTagInput(v);
              }}
              onKeyDown={(e) => {
                if (atTagLimit && e.key !== "Backspace" && e.key !== "Tab") {
                  if (e.key === "," || e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                  }
                  return;
                }
                if (e.key === "," || e.key === "Enter") {
                  e.preventDefault();
                  addTag(tagInput);
                  return;
                }
                if (e.key === " ") {
                  const v = tagInput.trim();
                  if (v.length > 0) {
                    e.preventDefault();
                    addTag(v);
                  }
                }
              }}
              onPaste={(e: ClipboardEvent<HTMLInputElement>) => {
                const text = e.clipboardData.getData("text");
                if (/[,;\n\r]/.test(text)) {
                  e.preventDefault();
                  addTagsFromPaste(text);
                }
              }}
              onBlur={scheduleBlurCommit}
              enterKeyHint="done"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={
                atTagLimit
                  ? `Max ${CREATE_FLOW_HASHTAG_MAX} tags`
                  : "Add tags people might search for"
              }
              className={[
                fieldClass,
                placeholderPulse && !tagInput.trim() && workingTags.length === 0
                  ? "placeholder:text-[var(--brand)] app-dark:placeholder:text-[var(--brand)]"
                  : "placeholder:text-[var(--text)]/40 app-dark:placeholder:text-white/40",
              ].join(" ")}
              style={{ fontSize: 16 }}
            />
          </form>
        </div>

        <div className="shrink-0 px-3 pb-2.5 pt-1">
          {hasWorkingTags ? (
            <div className="mb-1 flex justify-end">
              <button type="button" className={subtleBtn} onClick={clearTags}>
                Clear tags
              </button>
            </div>
          ) : null}
          <button type="button" className={doneClass} onClick={commit}>
            Done
          </button>
        </div>
      </div>
    </BottomDrawer>
  );
}
