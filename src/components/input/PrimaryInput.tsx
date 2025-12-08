import React, { useRef, useEffect } from "react";

type PrimaryInputProps = React.InputHTMLAttributes<HTMLInputElement> &
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    label?: string;
    textarea?: boolean;
  };

const PrimaryInput = React.forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  PrimaryInputProps
>(({ label, textarea = false, className = "", ...props }, ref) => {
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
    "w-full text-xs bg-transparent text-[var(--text)] placeholder-gray-400 border-b border-gray-700 transition-all pb-1 font-normal";

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label className="text-[var(--text)]/60 text-sm">{label}</label>
      )}
      {textarea ? (
        <textarea
          ref={setRefs}
          className={`${sharedStyles} resize-none overflow-hidden ${className}`}
          {...props}
        />
      ) : (
        <input
          ref={ref as React.Ref<HTMLInputElement>}
          className={`${sharedStyles} ${className}`}
          {...props}
        />
      )}
    </div>
  );
});

PrimaryInput.displayName = "PrimaryInput";

export default PrimaryInput;
