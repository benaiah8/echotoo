/**
 * Post-level tags field (shared by CreateCategoryPage and Finalize caption box).
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { PiInfo } from "react-icons/pi";
import {
  CREATE_FLOW_HASHTAG_MAX,
  CREATE_FLOW_HASHTAG_TOKEN_MAX,
  normalizeHashtagToken,
} from "../../lib/createFlowLimits";

const allSuggestions = [
  "food",
  "drinks",
  "coffee",
  "date",
  "friends",
  "family",
  "outdoors",
  "nightlife",
  "museum",
  "games",
  "walk",
  "weekend",
  "summer",
];

type Props = {
  tags: string[];
  onTagsChange: Dispatch<SetStateAction<string[]>>;
  /** `embedded` = inside finalize caption card; `standalone` = bordered section on categories */
  variant?: "embedded" | "standalone";
};

function splitPasteTags(text: string): string[] {
  return text
    .split(/[,;\n\r]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default function CreateFlowPostTagsField({
  tags,
  onTagsChange,
  variant = "standalone",
}: Props) {
  const [tagInput, setTagInput] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagFormRef = useRef<HTMLFormElement>(null);
  const tagBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tagInteractionRef = useRef(false);
  const [showTagsInfo, setShowTagsInfo] = useState(false);
  const [showHashtagHelp, setShowHashtagHelp] = useState(false);

  const isEmbedded = variant === "embedded";

  useEffect(() => {
    return () => {
      if (tagBlurTimerRef.current) clearTimeout(tagBlurTimerRef.current);
    };
  }, []);

  const suggestions = useMemo(
    () =>
      isEmbedded
        ? []
        : allSuggestions.filter((s) => !tags.includes(s)).slice(0, 6),
    [tags, isEmbedded]
  );

  const atTagLimit = tags.length >= CREATE_FLOW_HASHTAG_MAX;

  const addTag = (t: string) => {
    const v = normalizeHashtagToken(t);
    if (!v) return;
    onTagsChange((prev) => {
      if (prev.length >= CREATE_FLOW_HASHTAG_MAX) return prev;
      return prev.includes(v) ? prev : [...prev, v];
    });
    setTagInput("");
  };

  const addTagsFromPaste = (raw: string) => {
    const parts = splitPasteTags(raw).map((p) => normalizeHashtagToken(p));
    if (!parts.length) return;
    onTagsChange((prev) => {
      const next = [...prev];
      for (const p of parts) {
        if (!p || next.length >= CREATE_FLOW_HASHTAG_MAX) break;
        if (!next.includes(p)) next.push(p);
      }
      return next;
    });
    setTagInput("");
  };

  const scheduleTagBlurCommit = () => {
    if (isEmbedded) {
      if (tagBlurTimerRef.current) clearTimeout(tagBlurTimerRef.current);
      tagBlurTimerRef.current = setTimeout(() => {
        tagBlurTimerRef.current = null;
        const interacting = tagInteractionRef.current;
        tagInteractionRef.current = false;
        if (interacting) return;
        const root = tagFormRef.current;
        if (root?.contains(document.activeElement)) return;
        const pending = tagInputRef.current?.value ?? "";
        if (pending.trim()) addTag(pending);
      }, 120);
      return;
    }
    if (tagBlurTimerRef.current) clearTimeout(tagBlurTimerRef.current);
    tagBlurTimerRef.current = setTimeout(() => {
      tagBlurTimerRef.current = null;

      const interacting = tagInteractionRef.current;
      tagInteractionRef.current = false;
      if (interacting) return;

      const root = tagFormRef.current;
      if (root?.contains(document.activeElement)) return;

      const pending = tagInputRef.current?.value ?? "";
      addTag(pending);
    }, 120);
  };

  const removeTag = (t: string) =>
    onTagsChange((prev) => prev.filter((x) => x !== t));

  const chipClass = isEmbedded
    ? "inline-flex items-center gap-0.5 rounded-full border border-[color-mix(in_oklab,var(--brand)_42%,var(--border))] bg-[color-mix(in_oklab,var(--brand)_12%,var(--surface))] px-1.5 py-0.5 text-[10px] font-medium leading-tight text-neutral-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:border-[color-mix(in_oklab,var(--brand)_45%,white)] dark:bg-[color-mix(in_oklab,var(--brand)_32%,rgba(15,15,18,0.92))] dark:text-white dark:shadow-[0_1px_4px_rgba(0,0,0,0.45)]"
    : "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs bg-[var(--surface)]/40 text-[var(--text)]";

  const inner = (
    <>
      {variant === "standalone" ? (
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-[var(--text)]/85">Tags</h3>
            <button
              type="button"
              className="text-[var(--text)]/60 text-xs border border-[var(--border)] rounded-full px-2 py-0.5"
              onClick={() => setShowTagsInfo((s) => !s)}
              aria-expanded={showTagsInfo}
            >
              ⓘ
            </button>
          </div>
          <span
            className="shrink-0 text-[10px] tabular-nums text-[var(--text)]/38"
            aria-live="polite"
          >
            {tags.length}/{CREATE_FLOW_HASHTAG_MAX}
          </span>
        </div>
      ) : (
        <>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text)]/82 dark:text-white/88">
              Hashtags
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className="text-[10px] tabular-nums text-[var(--text)]/48 dark:text-white/55"
                aria-live="polite"
              >
                {tags.length}/{CREATE_FLOW_HASHTAG_MAX}
              </span>
              <button
                type="button"
                className="rounded-full p-0.5 text-[var(--text)]/48 hover:text-[var(--text)]/72 dark:text-white/55 dark:hover:text-white/80 transition-colors"
                aria-expanded={showHashtagHelp}
                aria-label="About hashtags"
                onClick={() => setShowHashtagHelp((s) => !s)}
              >
                <PiInfo className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </div>
          {showHashtagHelp ? (
            <p className="mb-1.5 text-[10px] leading-snug text-[var(--text)]/45">
              A few hashtags make your post easier to find in search and help
              the right people discover it.
            </p>
          ) : null}
        </>
      )}

      <div className={variant === "standalone" ? "mt-4" : ""}>
        <div
          className={[
            "flex flex-wrap",
            isEmbedded ? "gap-1.5 mb-4" : "gap-2 mb-2",
          ].join(" ")}
          onPointerDownCapture={(e) => {
            if ((e.target as HTMLElement).closest("button")) {
              tagInteractionRef.current = true;
            }
          }}
        >
          {tags.map((t) => (
            <span key={t} className={chipClass}>
              {t}
              <button
                type="button"
                className={
                  isEmbedded
                    ? "opacity-70 hover:opacity-100 text-[10px] leading-none pl-0.5 text-neutral-700 hover:text-neutral-900 dark:text-white/85 dark:hover:text-white"
                    : "opacity-80 hover:opacity-100"
                }
                aria-label={`Remove ${t}`}
                onClick={() => removeTag(t)}
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <form
          ref={tagFormRef}
          onSubmit={(e) => {
            e.preventDefault();
            addTag(tagInput);
          }}
          className="relative"
        >
          {isEmbedded ? (
            <input
              ref={tagInputRef}
              value={tagInput}
              onChange={(e) => {
                const v = e.target.value;
                if (v.includes(",")) {
                  const parts = v.split(",");
                  const last = parts.pop() ?? "";
                  const toAdd = parts
                    .map((p) => p.trim().toLowerCase())
                    .filter(Boolean);
                  if (toAdd.length) {
                    onTagsChange((prev) => {
                      const next = [...prev];
                      for (const t of toAdd) {
                        if (!next.includes(t)) next.push(t);
                      }
                      return next;
                    });
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
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (/[,;\n\r]/.test(text)) {
                  e.preventDefault();
                  addTagsFromPaste(text);
                }
              }}
              onBlur={scheduleTagBlurCommit}
              enterKeyHint="done"
              placeholder={
                atTagLimit
                  ? `Max ${CREATE_FLOW_HASHTAG_MAX} hashtags`
                  : "Add hashtags people might search for"
              }
              className="w-full rounded-md border border-[var(--border)]/70 bg-[var(--surface)]/10 px-2.5 py-1.5 text-[13px] text-[var(--text)]/92 outline-none placeholder:text-[var(--text)]/38 dark:border-white dark:bg-[color-mix(in_oklab,var(--surface)_12%,transparent)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] placeholder:dark:text-white/35 focus:border-[var(--brand)]/55 focus:ring-1 focus:ring-[color-mix(in_oklab,var(--brand)_28%,transparent)] dark:focus:border-[var(--brand)]/65 disabled:opacity-50"
            />
          ) : (
            <div className="flex items-center border border-[var(--border)] rounded-lg px-3 py-2">
              <input
                ref={tagInputRef}
                value={tagInput}
                maxLength={CREATE_FLOW_HASHTAG_TOKEN_MAX}
                disabled={atTagLimit}
                onChange={(e) =>
                  setTagInput(
                    e.target.value.slice(0, CREATE_FLOW_HASHTAG_TOKEN_MAX)
                  )
                }
                onBlur={scheduleTagBlurCommit}
                enterKeyHint="done"
                placeholder="Add hashtags people might search for"
                className="flex-1 bg-transparent text-sm text-[var(--text)] outline-none pr-16"
              />
              <button
                type="submit"
                className="absolute right-2 text-xs font-semibold rounded-lg px-3 py-1 bg-[var(--button-primary-bg)] text-[var(--button-primary-text)] border border-[var(--border)] hover:opacity-90 active:scale-[0.99] transition"
              >
                Add
              </button>
            </div>
          )}
        </form>

        {variant === "standalone" && showTagsInfo && (
          <p className="text-[var(--text)]/70 text-xs mt-2">
            Use a few keywords; we’ll also consider your caption.
          </p>
        )}

        {suggestions.length > 0 && (
          <div
            className={[
              "flex flex-wrap",
              isEmbedded ? "gap-1 mt-1.5" : "gap-2 mt-2",
            ].join(" ")}
            onPointerDownCapture={(e) => {
              if ((e.target as HTMLElement).closest("button")) {
                tagInteractionRef.current = true;
              }
            }}
          >
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addTag(s)}
                className={
                  isEmbedded
                    ? "text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--border)]/35 text-[var(--text)]/55 hover:bg-[var(--surface)]/25"
                    : "text-xs px-2 py-1 rounded-full border border-[var(--border)] text-[var(--text)]/85 hover:bg-[var(--surface)]/40"
                }
              >
                + {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );

  if (isEmbedded) {
    return <div className="mt-2 w-full">{inner}</div>;
  }

  return (
    <section className="w-full mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 px-3 py-3">
      {inner}
    </section>
  );
}
