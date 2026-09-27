import { finalizeMetaSurfaceClass } from "../lib/createFlowFinalizeMetaSurface";
import { useLayoutEffect, useRef, useState } from "react";

const RAIL_HIDE_SCROLLBAR =
  "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

const chipShellClass = `inline-flex max-w-[11rem] shrink-0 items-center font-medium leading-tight text-[var(--text)]/82 ${finalizeMetaSurfaceClass}`;

const chipPillClass = `${chipShellClass} rounded-full px-2 py-0.5 text-[11px]`;

function FeedKeyDetailChip({ value }: { value: string }) {
  return (
    <span className={`${chipPillClass} max-w-[11rem]`} title={value}>
      <span className="truncate">{value}</span>
    </span>
  );
}

type Props = {
  values: string[];
  className?: string;
};

/** Compact horizontal Special Notes / Key Details rail. Empty values render nothing. */
export default function PostV4KeyDetailsFeed({ values, className = "" }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edgeFade, setEdgeFade] = useState({ left: false, right: false });

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) {
      setEdgeFade({ left: false, right: false });
      return;
    }
    const update = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdgeFade({ left, right });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [values]);

  if (values.length === 0) return null;

  return (
    <div className={`relative min-w-0 ${className}`.trim()}>
      <div
        ref={scrollerRef}
        className={`flex min-h-0 min-w-0 items-center gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain ${RAIL_HIDE_SCROLLBAR}`}
        aria-label="Key details"
      >
        {values.map((value, index) => (
          <FeedKeyDetailChip key={`${index}-${value}`} value={value} />
        ))}
      </div>
      {edgeFade.left ? (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-[var(--bg)] to-transparent"
          aria-hidden
        />
      ) : null}
      {edgeFade.right ? (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-[var(--bg)] to-transparent"
          aria-hidden
        />
      ) : null}
    </div>
  );
}
