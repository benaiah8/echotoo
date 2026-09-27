import {
  clampCreateHeroPaginationIndex,
  shouldShowCreateHeroPagination,
} from "../../lib/createFinalizeHeroPagination";

type Props = {
  count: number;
  activeIndex: number;
};

export default function CreateFinalizeHeroPaginationDots({
  count,
  activeIndex,
}: Props) {
  if (!shouldShowCreateHeroPagination(count)) return null;
  const clamped = clampCreateHeroPaginationIndex(activeIndex, count);

  return (
    <div
      className="flex items-center justify-center gap-1"
      data-create-hero-pagination
      role="tablist"
      aria-label="Media position"
    >
      {Array.from({ length: count }, (_, i) => {
        const active = i === clamped;
        return (
          <span
            key={i}
            data-create-hero-dot={i}
            data-active={active ? "true" : "false"}
            className={
              active
                ? "h-[5px] w-[5px] rounded-full bg-[var(--text)]/70"
                : "h-1 w-1 rounded-full bg-[var(--text)]/35"
            }
            aria-current={active ? "true" : undefined}
          />
        );
      })}
    </div>
  );
}
