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
  };

const PrimaryInput = React.forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  PrimaryInputProps
>(({ label, textarea = false, className = "", counterMax, ...props }, ref) => {
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

  const sharedStyles =
    "w-full text-xs bg-transparent text-[var(--text)] placeholder-gray-400 border-b border-gray-700 transition-all font-normal";

  const valStr =
    props.value !== undefined && props.value !== null
      ? String(props.value)
      : "";
  const showCounter =
    typeof counterMax === "number" && counterMax > 0 && !props.disabled;
  const tone = charLimitTone(valStr.length, counterMax ?? 0);
  const counterPad = showCounter
    ? textarea
      ? " !pb-7 !pr-12"
      : " !pb-6 !pr-11"
    : " pb-1";

  const counterEl = showCounter ? (
    <span
      className={`pointer-events-none absolute bottom-1 right-1 text-[10px] tabular-nums leading-none ${charCounterClassForTone(
        tone
      )}`}
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
              className={`${sharedStyles} resize-none overflow-hidden ${counterPad} ${className}`}
              {...props}
            />
            {counterEl}
          </div>
        ) : (
          <textarea
            ref={setRefs}
            className={`${sharedStyles} resize-none overflow-hidden ${counterPad} ${className}`}
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
