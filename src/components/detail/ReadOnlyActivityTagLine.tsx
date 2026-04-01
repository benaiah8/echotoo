import {
  useRef,
  useState,
  useLayoutEffect,
  useEffect,
  useCallback,
} from "react";

/**
 * Read-only mirror of ActivitiesTagsInput’s ActivityTagLine: one visual line → pill;
 * explicit newline or wrapped text → full-width rounded block.
 */
export function ReadOnlyActivityTagLine({
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
        "flex w-full min-w-0 items-start rounded-lg border border-[var(--border)]/72 bg-[color-mix(in_oklab,var(--surface)_52%,transparent)] px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:border-[var(--border)]/60 dark:bg-[color-mix(in_oklab,var(--surface)_40%,transparent)]",
      ].join(" ")
    : [
        "inline-flex max-w-full min-w-0 items-center rounded-full border border-[var(--border)]/72 bg-[color-mix(in_oklab,var(--surface)_52%,transparent)] px-2.5 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:border-[var(--border)]/60 dark:bg-[color-mix(in_oklab,var(--surface)_40%,transparent)]",
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
            "m-0 min-w-0 flex-1 whitespace-pre-wrap break-words p-0 leading-snug",
            isFirst
              ? "text-[15px] font-extrabold tracking-tight text-[var(--text)]"
              : "text-[13px] font-medium text-[var(--text)]/72 dark:text-[var(--text)]/68",
          ].join(" ")}
        >
          {text}
        </p>
      </div>
    </div>
  );
}
