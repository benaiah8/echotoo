import React, { useRef, useEffect } from "react";
import {
  charCounterClassForTone,
  charLimitTone,
  formatCharCount,
} from "../../lib/createFlowLimitUtils";

type PrimaryInputProps = React.InputHTMLAttributes<HTMLInputElement> &
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    label?: string;
    textarea?: boolean;
    /** Renders n/max inside the field (bottom-right); uses value length vs max. */
    counterMax?: number;
    /**
     * Minimal bottom/right padding so the counter overlays the corner instead of
     * reserving a tall strip (use for compact editors).
     */
    compactCounter?: boolean;
    /**
     * Borderless inset field for embedded editor panels (no bottom rule line).
     */
    editorChrome?: boolean;
    /**
     * With `compactCounter`, where to pin n/max (`top-right` avoids overlap with last line).
     */
    counterCorner?: "bottom-right" | "top-right";
  };

const PrimaryInput = React.forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  PrimaryInputProps
>(({ label, textarea = false, className = "", counterMax, compactCounter, editorChrome, counterCorner = "bottom-right", ...props }, ref) => {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);

  // Set both internal + forwarded ref
  const setRefs = (node: HTMLTextAreaElement | HTMLInputElement | null) => {
    if (textarea) internalRef.current = node as HTMLTextAreaElement;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.MutableRefObject<any>).current = node;
  };

  useEffect(() => {
    if (!textarea || !internalRef.current) return;

    const el = internalRef.current;

    const handleInput = () => {
      el.style.height = "auto"; // Reset height first
      el.style.height = `${el.scrollHeight}px`; // Set to scrollHeight
    };

    handleInput(); // Initial size
    el.addEventListener("input", handleInput);

    return () => {
      el.removeEventListener("input", handleInput);
    };
  }, [textarea]);

  /** `placeholder:` so per-field overrides (e.g. `!placeholder:text-white`) win over element `color`. */
  const sharedStyles =
    "w-full text-xs bg-transparent text-[var(--text)] placeholder:text-neutral-400/55 border-b border-gray-700 transition-all font-normal";

  /** Editor panels: no bottom rule; inset edge + placeholders tuned for light/dark. */
  const editorChromeStyles =
    "w-full resize-none overflow-hidden rounded-lg border-0 bg-[color-mix(in_oklab,var(--surface)_42%,transparent)] px-2.5 py-2 text-xs font-normal text-[var(--text)] outline-none transition " +
    "shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--text)_8%,transparent)] placeholder:text-[var(--text)]/42 " +
    "focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--brand)_38%,transparent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg)] " +
    "app-dark:bg-[color-mix(in_oklab,var(--surface)_24%,transparent)] app-dark:shadow-[inset_0_0_0_1px_color-mix(in_oklab,white_11%,transparent)] app-dark:placeholder:text-[var(--text)]/38";

  const valStr =
    props.value !== undefined && props.value !== null
      ? String(props.value)
      : "";
  const showCounter =
    typeof counterMax === "number" && counterMax > 0 && !props.disabled;
  const tone = charLimitTone(valStr.length, counterMax ?? 0);
  const counterPad = showCounter
    ? textarea
      ? compactCounter
        ? counterCorner === "top-right"
          ? " !pt-1.5 !pb-1.5 !pl-2 !pr-[3.35rem]"
          : " !pb-2 !pr-11"
        : " !pb-7 !pr-12"
      : compactCounter
        ? " !pb-1.5 !pr-10"
        : " !pb-6 !pr-11"
    : editorChrome && textarea
      ? " pb-2"
      : " pb-1";

  const textareaClassName = editorChrome
    ? `${editorChromeStyles} ${counterPad} ${className}`
    : `${sharedStyles} resize-none overflow-hidden ${counterPad} ${className}`;

  const counterEl = showCounter ? (
    <span
      className={`pointer-events-none absolute z-10 text-[10px] tabular-nums leading-none ${
        compactCounter && counterCorner === "top-right"
          ? "top-1 right-1.5 opacity-90"
          : compactCounter
            ? "bottom-0.5 right-0.5 opacity-90"
            : "bottom-1 right-1"
      } ${charCounterClassForTone(tone)}`}
      aria-hidden
    >
      {formatCharCount(valStr, counterMax!)}
    </span>
  ) : null;

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label className="text-[var(--text)]/60 text-sm">{label}</label>
      )}
      {textarea ? (
        showCounter ? (
          <div className="relative">
            <textarea
              ref={setRefs}
              className={textareaClassName}
              {...props}
            />
            {counterEl}
          </div>
        ) : (
          <textarea
            ref={setRefs}
            className={textareaClassName}
            {...props}
          />
        )
      ) : showCounter ? (
        <div className="relative">
          <input
            ref={ref as React.Ref<HTMLInputElement>}
            className={`${sharedStyles} ${counterPad} ${className}`}
            {...props}
          />
          {counterEl}
        </div>
      ) : (
        <input
          ref={ref as React.Ref<HTMLInputElement>}
          className={`${sharedStyles} ${counterPad} ${className}`}
          {...props}
        />
      )}
    </div>
  );
});

PrimaryInput.displayName = "PrimaryInput";

export default PrimaryInput;
