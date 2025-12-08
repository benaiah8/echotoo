// src/components/ui/Skeleton.tsx
type BoxProps = {
  className?: string;
};

export function SkeletonLine({ className = "" }: BoxProps) {
  return (
    <div
      className={[
        "h-3 rounded-md bg-[var(--text)]/10 animate-pulse",
        className,
      ].join(" ")}
    />
  );
}

export function SkeletonCircle({ className = "" }: BoxProps) {
  return (
    <div
      className={[
        "rounded-full bg-[var(--text)]/10 animate-pulse",
        className,
      ].join(" ")}
    />
  );
}

export function SkeletonPill({ className = "" }: BoxProps) {
  return (
    <div
      className={[
        "h-7 min-w-[92px] rounded-full bg-[var(--text)]/10 animate-pulse",
        className,
      ].join(" ")}
    />
  );
}

export function SkeletonCard({ className = "" }: BoxProps) {
  return (
    <div
      className={[
        "rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]/40 animate-pulse",
        className,
      ].join(" ")}
    />
  );
}
