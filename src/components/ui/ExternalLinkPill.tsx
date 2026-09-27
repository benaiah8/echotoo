/**
 * Compact inline external-link chip for published surfaces.
 * Opens {@link OpenExternalLinkDialog} on tap.
 * No favicon / OpenGraph / destination network requests while rendering.
 */
import { useState } from "react";
import { PiLinkSimple } from "react-icons/pi";
import OpenExternalLinkDialog from "./OpenExternalLinkDialog";
import { safeHttpUrlPillLabel } from "../../lib/safeHttpUrlText";

/**
 * Published interactive link highlight (Create compose preview uses inline highlight instead).
 * Soft brand tint, no border — reads as highlighted text, not a CTA pill.
 */
export const EXTERNAL_LINK_PILL_CLASS = [
  "relative -top-px mx-0.5 inline-flex max-w-full translate-y-px items-center gap-0.5",
  "align-baseline rounded-sm border-0 px-1 py-0",
  "bg-[color-mix(in_oklab,var(--brand-dark)_16%,transparent)]",
  "text-[0.85em] font-medium leading-[1.2]",
  "text-[var(--brand-readable)]",
  "transition-colors",
  "hover:bg-[color-mix(in_oklab,var(--brand-dark)_22%,transparent)]",
  "active:scale-[0.99]",
  "app-dark:bg-[color-mix(in_oklab,var(--brand)_14%,transparent)]",
  "app-dark:text-[var(--brand)]",
  "app-dark:hover:bg-[color-mix(in_oklab,var(--brand)_20%,transparent)]",
].join(" ");

type Props = {
  href: string;
  /** Override compact label (defaults to host + short path). */
  label?: string;
  /** When true, stop click/keyboard bubbling (feed cards). */
  stopPropagation?: boolean;
  className?: string;
};

export default function ExternalLinkPill({
  href,
  label,
  stopPropagation = false,
  className,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const display = (label ?? safeHttpUrlPillLabel(href)).trim() || href;
  const openDialog = () => setDialogOpen(true);

  return (
    <>
      <button
        type="button"
        className={[EXTERNAL_LINK_PILL_CLASS, className].filter(Boolean).join(" ")}
        aria-label={`Open link ${display}`}
        title={href}
        onClick={(e) => {
          if (stopPropagation) {
            e.preventDefault();
            e.stopPropagation();
          }
          openDialog();
        }}
        onKeyDown={(e) => {
          if (!stopPropagation) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            openDialog();
          }
        }}
      >
        <PiLinkSimple
          className="h-[0.95em] w-[0.95em] shrink-0 opacity-80"
          aria-hidden
        />
        <span className="min-w-0 truncate">{display}</span>
      </button>
      <OpenExternalLinkDialog
        open={dialogOpen}
        href={href}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}
