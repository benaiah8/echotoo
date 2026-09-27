/**
 * Below-compose open affordances for detected URLs (caption / section).
 * Inline highlight stays in the textarea overlay; these chips sit under the
 * field so they never cover typed text. Opens {@link OpenExternalLinkDialog}.
 */
import { useMemo, useState, type MutableRefObject } from "react";
import { PiLinkSimple } from "react-icons/pi";
import OpenExternalLinkDialog from "./OpenExternalLinkDialog";
import { composeTextHasLinkPreview } from "./ComposeLinkPreviewOverlay";
import {
  extractSafeHttpUrlsFromText,
  safeHttpUrlDisplayHost,
} from "../../lib/safeHttpUrlText";

/** Cap open chips so a paste of many URLs does not flood the canvas. */
const COMPOSE_LINK_OPEN_MAX = 5;

type Props = {
  /** Compose field text (same string as overlay / textarea). */
  text: string;
  /**
   * Section blur-remove: arm skip on chip press so opening the dialog
   * does not drop an empty section.
   */
  skipBlurRemoveRef?: MutableRefObject<boolean>;
};

const chipClass =
  "create-compose-link-open-chip inline-flex max-w-full min-w-0 items-center gap-1 " +
  "rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight " +
  "transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-[#3aa0d8]/45";

export default function ComposeLinkOpenIcons({
  text,
  skipBlurRemoveRef,
}: Props) {
  const [dialogHref, setDialogHref] = useState<string | null>(null);

  const links = useMemo(() => {
    if (!composeTextHasLinkPreview(text)) return [];
    return extractSafeHttpUrlsFromText(text, COMPOSE_LINK_OPEN_MAX).map(
      ({ href }) => ({
        href,
        label: safeHttpUrlDisplayHost(href) || href,
      }),
    );
  }, [text]);

  if (links.length === 0 && !dialogHref) return null;

  return (
    <>
      {links.length > 0 ? (
        <div
          className="mt-1.5 flex w-full min-w-0 flex-wrap gap-1.5"
          data-compose-link-open-icons
          role="group"
          aria-label="Open links from this text"
        >
          {links.map(({ href, label }) => (
            <button
              key={href}
              type="button"
              className={chipClass}
              aria-label={`Open external link ${label}`}
              title={href}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (skipBlurRemoveRef) {
                  skipBlurRemoveRef.current = true;
                  window.setTimeout(() => {
                    skipBlurRemoveRef.current = false;
                  }, 250);
                }
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDialogHref(href);
              }}
            >
              <PiLinkSimple
                className="create-compose-link-open-chip__icon h-3.5 w-3.5 shrink-0"
                aria-hidden
              />
              <span className="min-w-0 truncate">{label}</span>
            </button>
          ))}
        </div>
      ) : null}
      <OpenExternalLinkDialog
        open={dialogHref != null}
        href={dialogHref}
        onClose={() => setDialogHref(null)}
      />
    </>
  );
}
