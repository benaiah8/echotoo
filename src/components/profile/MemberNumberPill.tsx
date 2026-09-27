/** Compact member-number badge attached to ProfilePhotoHero top edge. */
export type MemberNumberHeroBadgeProps = {
  memberNo: number;
  className?: string;
};

export function MemberNumberHeroBadge({
  memberNo,
  className = "",
}: MemberNumberHeroBadgeProps) {
  return (
    <div
      className={[
        "pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-[46%]",
        "rounded-full px-2.5 py-0.5",
        "text-[11px] font-semibold tabular-nums leading-tight",
        /* Dark mode: cream/white surface, near-black text */
        "app-dark:bg-[#f4f0e8] app-dark:text-[#141414]",
        "app-dark:border app-dark:border-[color-mix(in_oklab,var(--brand)_42%,transparent)]",
        "app-dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]",
        /* Light mode: near-black surface, light text */
        "app-light:bg-[#1a1a1a] app-light:text-[#f5f0e8]",
        "app-light:border app-light:border-[color-mix(in_oklab,var(--brand)_38%,transparent)]",
        "app-light:shadow-[0_2px_8px_rgba(0,0,0,0.18)]",
        className,
      ].join(" ")}
      aria-hidden
    >
      #{Number(memberNo).toLocaleString()}
    </div>
  );
}

/** @deprecated Standalone row removed — use MemberNumberHeroBadge on ProfilePhotoHero. */
export default function MemberNumberPill(props: MemberNumberHeroBadgeProps) {
  return <MemberNumberHeroBadge {...props} />;
}
