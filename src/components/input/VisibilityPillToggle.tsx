import { useEffect, useRef, useState } from "react";

type Visibility = "public" | "friends" | "anonymous";

export default function VisibilityPillToggle({
  value = "public",
  onChange,
}: {
  value?: Visibility;
  onChange: (v: Visibility) => void;
}) {
  const stops: Visibility[] = ["public", "friends", "anonymous"];
  const [pos, setPos] = useState<Visibility>(value);
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => setPos(value), [value]);

  const snapFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const idx = Math.round((x / rect.width) * 2); // 3 stops → 0..2
    const v = stops[Math.min(2, Math.max(0, idx))];
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

  return (
    <div
      ref={trackRef}
      onMouseDown={startDrag}
      onTouchStart={startDrag}
      className="relative grid grid-cols-3 gap-[1px] rounded-full border border-[var(--border)] bg-[var(--surface)]/20 p-[3px] select-none
                 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]"
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
          className={`h-9 rounded-full text-xs font-semibold relative z-10 transition-all duration-200 flex items-center justify-center
            ${
              i === idx
                ? "text-[var(--brand-ink)] bg-[var(--brand)] shadow-[0_4px_12px_rgba(0,0,0,0.5),0_2px_4px_rgba(0,0,0,0.7),inset_0_2px_0_rgba(255,255,255,0.3),inset_0_-2px_0_rgba(0,0,0,0.3)] border border-[var(--border)]/60"
                : "text-[var(--text)]/50 bg-[var(--surface)]/30 hover:bg-[var(--surface)]/40"
            }`}
        >
          {s.charAt(0).toUpperCase() + s.slice(1)}
        </button>
      ))}
    </div>
  );
}
