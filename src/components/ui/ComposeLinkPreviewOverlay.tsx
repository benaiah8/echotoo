/**
 * Mirror plain-text compose fields with inline URL highlights (not pills).
 * Pair with a real textarea as the source of truth:
 * - overlay: pointer-events-none, aria-hidden
 * - field: transparent text + visible caret when URLs are present
 *
 * Typography lockstep:
 * - Caption: `.create-finalize-caption-compose-type`
 * - Section: `.create-finalize-section-compose-type`
 *
 * Open affordances live below the field via ComposeLinkOpenIcons (not over text).
 */
import { useMemo, type ReactNode } from "react";
import { tokenizeSafeHttpUrlsInText } from "../../lib/safeHttpUrlText";

export type ComposeLinkPreviewOverlayProps = {
  text: string;
  className?: string;
  /**
   * Type metrics class shared with the companion textarea.
   * Defaults to caption metrics; sections pass {@link COMPOSE_LINK_PREVIEW_SECTION_TYPE_CLASS}.
   */
  typeClassName?: string;
};

/** True when the overlay would paint at least one URL highlight. */
export function composeTextHasLinkPreview(text: string): boolean {
  return tokenizeSafeHttpUrlsInText(text).some((s) => s.kind === "url");
}

/**
 * Must stay in lockstep with the companion caption textarea classes / CSS
 * (`.create-finalize-caption-compose-type`).
 */
export const COMPOSE_LINK_PREVIEW_TYPE_CLASS =
  "create-finalize-caption-compose-type";

/**
 * Section body metrics — same type as caption except zero vertical padding
 * to match section textarea (`py-0`).
 */
export const COMPOSE_LINK_PREVIEW_SECTION_TYPE_CLASS =
  "create-finalize-section-compose-type";

export default function ComposeLinkPreviewOverlay({
  text,
  className,
  typeClassName = COMPOSE_LINK_PREVIEW_TYPE_CLASS,
}: ComposeLinkPreviewOverlayProps) {
  const segments = useMemo(() => tokenizeSafeHttpUrlsInText(text), [text]);

  const nodes: ReactNode[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.kind === "text") {
      nodes.push(<span key={`t-${i}`}>{seg.value}</span>);
      continue;
    }
    nodes.push(
      <span
        key={`u-${i}-${seg.href}-${seg.value}`}
        className="create-compose-link-highlight"
      >
        {seg.value}
      </span>,
    );
  }

  return (
    <div
      aria-hidden
      className={[
        typeClassName,
        "pointer-events-none select-none text-[var(--text)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {nodes}
    </div>
  );
}
