import { useEffect, useRef, useState } from "react";

// [LAUNCH] Anonymous posting disabled - only public and friends options
type Visibility = "public" | "friends";

export default function VisibilityPillToggle({
  value = "public",
  onChange,
  tone = "default",
}: {
  value?: Visibility;
  onChange: (v: Visibility) => void;
  /** Softer, lighter chrome (e.g. create finalize metadata panel). */
  tone?: "default" | "soft";
}) {
  const stops: Visibility[] = ["public", "friends"];
  const [pos, setPos] = useState<Visibility>(value);
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => setPos(value), [value]);

  const snapFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const idx = Math.round((x / rect.width) * 1); // 2 stops → 0..1
    const v = stops[Math.min(1, Math.max(0, idx))];
    setPos(v);
    onChange(v);
  };

  const startDrag = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX =
      "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    snapFromClientX(clientX);
  };

  useEffect(() => {
    const move = (e: MouseEvent | TouchEvent) => {
      const el = trackRef.current;
      if (!el) return;
      if ("touches" in e) snapFromClientX(e.touches[0].clientX);
      else snapFromClientX((e as MouseEvent).clientX);
    };
    const up = () => document.removeEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => document.removeEventListener("mouseup", up);
  }, []);

  const idx = stops.indexOf(pos);

  const trackClass =
    tone === "soft"
      ? "relative grid grid-cols-2 gap-px rounded-full border border-[var(--border)]/55 bg-[var(--surface)]/12 p-[2px] select-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]"
      : "relative grid grid-cols-2 gap-[1px] rounded-full border border-[var(--border)] bg-[var(--surface)]/20 p-[3px] select-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]";

  const btnClass = (i: number) => {
    const base =
      tone === "soft"
        ? "h-8 rounded-full text-[11px] font-medium relative z-10 transition-all duration-200 flex items-center justify-center"
        : "h-9 rounded-full text-xs font-semibold relative z-10 transition-all duration-200 flex items-center justify-center";
    if (i === idx) {
      return tone === "soft"
        ? `${base} text-[var(--brand-ink)] bg-[var(--brand)] border border-[color-mix(in_oklab,var(--brand)_35%,var(--border))] shadow-[0_1px_3px_rgba(0,0,0,0.12)]`
        : `${base} text-[var(--brand-ink)] bg-[var(--brand)] shadow-[0_4px_12px_rgba(0,0,0,0.5),0_2px_4px_rgba(0,0,0,0.7),inset_0_2px_0_rgba(255,255,255,0.3),inset_0_-2px_0_rgba(0,0,0,0.3)] border border-[var(--border)]/60`;
    }
    return `${base} text-[var(--text)]/55 bg-[var(--surface)]/20 hover:bg-[var(--surface)]/35`;
  };

  return (
    <div
      ref={trackRef}
      onMouseDown={startDrag}
      onTouchStart={startDrag}
      className={trackClass}
      role="tablist"
      aria-label="Visibility"
    >
      {stops.map((s, i) => (
        <button
          key={s}
          type="button"
          role="tab"
          aria-selected={pos === s}
          onClick={() => {
            setPos(s);
            onChange(s);
          }}
          className={btnClass(i)}
        >
          {s.charAt(0).toUpperCase() + s.slice(1)}
        </button>
      ))}
    </div>
  );
}
