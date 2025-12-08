import { useEffect, useMemo, useRef, useState } from "react";

export default function HorizontalNumberWheel({
  value,
  onChange,
  max = 1000,
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  const items = useMemo(
    () => Array.from({ length: max + 1 }, (_, i) => i),
    [max]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const [cellW, setCellW] = useState(44);
  const [containerW, setContainerW] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [viewIndex, setViewIndex] = useState<number>(value); // float index under center

  // input flip state - start in picker mode, not input mode
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [hasInitialized, setHasInitialized] = useState(false);

  // --- measure sizes ---------------------------------------------------------
  useEffect(() => {
    setMounted(true);
    const measure = () => {
      const track = trackRef.current;
      const container = containerRef.current;
      if (!track || !container) return;
      const first = track.querySelector<HTMLButtonElement>("[data-cell='0']");
      const w = first?.offsetWidth ?? 40;
      setCellW(w + 8); // + gap-2 (8px)
      setContainerW(container.clientWidth);
    };
    measure();

    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, []);

  // helper: left scroll so index i sits in center
  const leftForIndex = (i: number) => i * cellW - (containerW / 2 - cellW / 2);

  // Initialize picker on mount
  useEffect(() => {
    if (!mounted || editing || hasInitialized) return;

    const initializePicker = () => {
      const track = trackRef.current;
      if (!track) return;

      if (containerW > 0 && cellW > 0) {
        const idx = clamp(value, 1, 99);
        setViewIndex(idx);
        track.scrollLeft = leftForIndex(idx);
        setHasInitialized(true);
      } else {
        // Retry if measurements not ready
        setTimeout(initializePicker, 10);
      }
    };

    initializePicker();
  }, [mounted, containerW, cellW, value, editing, hasInitialized, onChange]);

  // Force initial viewIndex to ensure picker shows
  useEffect(() => {
    if (mounted && !editing) {
      setViewIndex(value);
    }
  }, [mounted, editing, value]);

  // Ensure component starts in picker mode, not input mode
  useEffect(() => {
    setEditing(false);
  }, []);

  // Simple, smooth scroll tracking
  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const idx = (el.scrollLeft + (containerW / 2 - cellW / 2)) / cellW;
    setViewIndex(idx);
  };

  // Simple snap behavior - no complex debouncing
  let snapTimer: number | undefined;
  const debounceSnap = () => {
    if (snapTimer) clearTimeout(snapTimer);
    // @ts-ignore
    snapTimer = window.setTimeout(() => {
      if (editing) return;
      const el = trackRef.current;
      if (!el) return;
      const nearest = clamp(Math.round(viewIndex), 1, 99); // Start from 1, not 0
      if (nearest !== value) {
        onChange(nearest);
      }
    }, 100);
  };

  // click to pick
  const onPick = (n: number) => {
    onChange(n);
    // Snap the selected number to center
    const el = trackRef.current;
    if (el) {
      el.scrollTo({
        left: leftForIndex(n),
        behavior: "smooth",
      });
    }
  };

  // flip to input
  const openInput = () => {
    setDraft(String(value));
    setEditing(true);
  };
  const applyInput = () => {
    const n = sanitizeToRange(draft, 0, Infinity); // Allow unlimited numbers in text input
    setEditing(false);
    if (n !== value) onChange(n);
    // Let the useEffect handle scrolling to the new position
  };

  // visual helpers for smoothness
  const scaleFor = (i: number) => {
    const d = Math.abs(i - viewIndex);
    // close to center => ~1.0..1.2; far => ~0.88
    return 1.2 - Math.min(0.32, d * 0.08);
  };
  const opacityFor = (i: number) => {
    const d = Math.abs(i - viewIndex);
    return 1 - Math.min(0.55, d * 0.18);
  };

  return (
    <div key="picker" className="w-full relative mt-4">
      {/* Main picker container */}
      <div ref={containerRef} className="relative">
        {/* edge fades */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-10 z-10"
          style={{
            background:
              "linear-gradient(to right, var(--surface) 0%, rgba(0,0,0,0) 100%)",
            opacity: 0.9,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10 z-10"
          style={{
            background:
              "linear-gradient(to left, var(--surface) 0%, rgba(0,0,0,0) 100%)",
            opacity: 0.9,
          }}
        />

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-3 pt-1 pb-1 relative overflow-hidden">
          {/* center marker - only show when not editing */}
          {!editing && (
            <div className="pointer-events-none absolute left-1/2 top-1 bottom-1 -translate-x-1/2 grid place-items-center">
              <div className="w-10 h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 backdrop-blur-[2px]" />
            </div>
          )}

          {/* Content with smooth transition */}
          <div
            className="relative overflow-hidden"
            style={{ minHeight: "32px" }}
          >
            <div
              className={`transition-transform duration-300 ease-in-out ${
                editing
                  ? "-translate-x-full opacity-0"
                  : "translate-x-0 opacity-100"
              }`}
              style={{ display: editing ? "none" : "block" }}
            >
              {/* track */}
              <div
                ref={trackRef}
                onScroll={onScroll}
                className="flex gap-2 overflow-x-auto scroll-hide px-3"
                style={{
                  scrollSnapType: "x mandatory",
                  scrollBehavior: "auto",
                  overscrollBehaviorX: "contain",
                  paddingTop: 2,
                  paddingBottom: 2,
                  WebkitOverflowScrolling: "touch",
                }}
                aria-label="Number picker"
                role="listbox"
              >
                {items.slice(0, 100).map((n) => {
                  const isSelected = Math.round(viewIndex) === n;
                  const s = scaleFor(n);
                  const o = opacityFor(n);
                  return (
                    <button
                      key={n}
                      data-cell={n}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => onPick(n)}
                      className={`shrink-0 w-10 h-8 rounded-md grid place-items-center text-sm transition-transform duration-150
                        ${
                          isSelected
                            ? "bg-[var(--brand)] text-[var(--brand-ink)]"
                            : "bg-transparent text-[var(--text)]/80 border border-[var(--border)]"
                        }`}
                      style={{
                        scrollSnapAlign: "center",
                        transform: `scale(${s})`,
                        opacity: o,
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Input mode with horizontal layout */}
            <div
              className={`absolute inset-0 transition-transform duration-300 ease-in-out ${
                editing
                  ? "translate-x-0 opacity-100"
                  : "translate-x-full opacity-0"
              }`}
              style={{ display: editing ? "block" : "none" }}
            >
              <div className="relative h-full">
                <input
                  type="number"
                  inputMode="numeric"
                  enterKeyHint="done"
                  min={0}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyInput();
                    if (e.key === "Escape") setEditing(false);
                  }}
                  className="w-full h-full rounded-xl px-3 pr-16 text-base tabular-nums bg-transparent focus:outline-none"
                  style={{ color: "var(--text)" }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={applyInput}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold rounded-lg px-3 py-1 bg-[var(--button-primary-bg)] text-[var(--button-primary-text)] border border-[var(--border)] hover:opacity-90 active:scale-[0.99] transition"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Type a number button - outside and below the picker */}
      <div className="flex justify-center mt-1">
        <button
          type="button"
          onClick={() => {
            if (editing) {
              setEditing(false);
            } else {
              openInput();
            }
          }}
          className="px-2 py-0.5 rounded-full text-xs border border-gray-300 bg-white text-black hover:bg-gray-50 transition-colors dark:border-gray-600 dark:bg-white dark:text-black dark:hover:bg-gray-100"
          style={{ fontSize: "10px", lineHeight: "1" }}
        >
          {editing ? "Use picker" : "Type a number"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function sanitizeToRange(raw: string, min: number, max: number) {
  const num = Number(String(raw).replace(/[^\d]/g, ""));
  if (Number.isNaN(num)) return min;
  return clamp(num, min, max);
}
