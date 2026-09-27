/**
 * V4 Finalize Location sheet.
 * One smart editor: place text + optional recognized Maps/link attachment.
 * Working copy of slot 0 name + URL until Done; X / backdrop discard.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
} from "react";
import { PiArrowSquareOut, PiLink, PiX } from "react-icons/pi";
import BottomDrawer from "../ui/BottomDrawer";
import { glassPeoplePanelClass } from "../../lib/glassActionSheetStyles";
import { CREATE_FLOW_LIMITS } from "../../lib/createFlowLimits";
import { clampString } from "../../lib/createFlowLimitUtils";
import {
  createFlowMapsSearchOrRootUrl,
  locationAttachmentLabel,
  normalizeCreateFlowLocationUrl,
  splitLocationTextAndCompleteUrl,
  tryRecognizeCompleteSafeHttpUrl,
} from "../../lib/createFlowLocation";
import {
  extractStoredMapsHref,
  openMapsLocationUrl,
} from "../../lib/openMapsLocationUrl";

export type CreateFinalizeLocationCommit = {
  location: string;
  locationUrl: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCommit: (next: CreateFinalizeLocationCommit) => void;
  location: string;
  locationUrl: string;
};

const closeBtnClass =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)]/70 text-[var(--text)]/75 transition hover:bg-[var(--text)]/8";

const doneClass =
  "flex h-10 min-h-10 w-full items-center justify-center rounded-full bg-amber-400/90 px-3 text-[13px] font-semibold text-neutral-900 transition active:scale-[0.99]";

const headerMapsClass =
  "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-full border border-[var(--border)]/55 bg-[color-mix(in_oklab,var(--surface)_14%,transparent)] px-2.5 text-[11px] font-semibold text-[var(--text)]/75 transition hover:bg-[color-mix(in_oklab,var(--surface)_24%,transparent)] active:scale-[0.99]";

const fieldClass =
  "w-full resize-none overflow-hidden border-0 bg-transparent px-0 py-1 text-[16px] font-normal leading-snug text-[var(--text)] outline-none shadow-none " +
  "placeholder:transition-colors placeholder:duration-700 placeholder:ease-out";

const PLACEHOLDER_PULSE_START_MS = 80;
const PLACEHOLDER_PULSE_DURATION_MS = 900;

const chipClass =
  "mt-1.5 inline-flex h-6 w-fit max-w-full items-center gap-1 rounded-full border border-[var(--border)]/35 bg-[var(--glass-active-bg)] py-0 pl-2 pr-0.5 text-[11px] font-semibold leading-none text-[var(--text)]/88 shadow-[var(--glass-active-shadow)] app-dark:border-white/16";

const subtleBtn =
  "inline-flex h-6 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-[var(--text)]/50 transition hover:text-[var(--text)]/75 active:scale-[0.99]";

const L = CREATE_FLOW_LIMITS.activities;

function snapshotWorkingUrl(rawUrl: string): {
  url: string;
  leftoverText: string;
} {
  const extracted = extractStoredMapsHref(rawUrl);
  const recognized = tryRecognizeCompleteSafeHttpUrl(extracted);
  if (recognized) return { url: recognized, leftoverText: "" };
  return { url: "", leftoverText: extracted.trim() };
}

function readPastedPayload(e: ClipboardEvent<HTMLTextAreaElement>): string {
  const plain = e.clipboardData.getData("text/plain");
  if (plain.trim()) return plain;
  return e.clipboardData.getData("text/html") || "";
}

function resizeLocationEditor(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export default function CreateFinalizeLocationSheet({
  open,
  onClose,
  onCommit,
  location,
  locationUrl,
}: Props) {
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const [workingName, setWorkingName] = useState("");
  const [workingUrl, setWorkingUrl] = useState("");
  const [placeholderPulse, setPlaceholderPulse] = useState(false);

  useEffect(() => {
    if (!open) {
      setPlaceholderPulse(false);
      return;
    }
    const ae = document.activeElement;
    if (ae instanceof HTMLElement && ae !== editorRef.current) ae.blur();
    const snap = snapshotWorkingUrl(locationUrl);
    setWorkingUrl(snap.url);
    const nextName = location.trim() ? location : snap.leftoverText;
    setWorkingName(nextName);

    const focusTimer = window.setTimeout(() => {
      editorRef.current?.focus({ preventScroll: true });
    }, 40);

    let pulseStart: number | undefined;
    let pulseEnd: number | undefined;
    if (!nextName.trim()) {
      pulseStart = window.setTimeout(() => {
        setPlaceholderPulse(true);
      }, PLACEHOLDER_PULSE_START_MS);
      pulseEnd = window.setTimeout(() => {
        setPlaceholderPulse(false);
      }, PLACEHOLDER_PULSE_START_MS + PLACEHOLDER_PULSE_DURATION_MS);
    }

    return () => {
      window.clearTimeout(focusTimer);
      if (pulseStart != null) window.clearTimeout(pulseStart);
      if (pulseEnd != null) window.clearTimeout(pulseEnd);
    };
  }, [open, location, locationUrl]);

  useLayoutEffect(() => {
    if (!open) return;
    resizeLocationEditor(editorRef.current);
  }, [open, workingName]);

  const hasWorkingLocation =
    workingName.trim().length > 0 || workingUrl.trim().length > 0;

  const attachUrl = (href: string) => {
    setWorkingUrl(clampString(href, L.googleMapsLinkMaxChars));
  };

  const absorbUrlLinesFromText = (raw: string): boolean => {
    const split = splitLocationTextAndCompleteUrl(raw);
    if (!split.url) return false;
    attachUrl(split.url);
    setWorkingName(split.text);
    return true;
  };

  const discard = () => {
    onClose();
  };

  const commit = () => {
    const split = splitLocationTextAndCompleteUrl(workingName);
    const nextName = clampString(split.text, L.placeNameMaxChars);
    const nextUrl = split.url || workingUrl;
    const normalized = normalizeCreateFlowLocationUrl(nextUrl);
    onCommit({
      location: nextName,
      locationUrl: normalized.error
        ? ""
        : clampString(normalized.href, L.googleMapsLinkMaxChars),
    });
  };

  const clearLocation = () => {
    setWorkingName("");
    setWorkingUrl("");
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const payload = readPastedPayload(e);
    const wholeUrl = tryRecognizeCompleteSafeHttpUrl(payload);
    if (wholeUrl) {
      e.preventDefault();
      attachUrl(wholeUrl);
      return;
    }
    const split = splitLocationTextAndCompleteUrl(payload);
    if (!split.url) return;
    e.preventDefault();
    attachUrl(split.url);
    const el = editorRef.current;
    const start = el?.selectionStart ?? workingName.length;
    const end = el?.selectionEnd ?? start;
    const insert = split.text;
    setWorkingName(workingName.slice(0, start) + insert + workingName.slice(end));
  };

  return (
    <BottomDrawer
      open={open}
      onClose={discard}
      transparentSheet
      backdropVariant="strong"
      portalClassName="z-[130]"
      maxHeight="88vh"
      shrinkSheetToContent
      liftWithKeyboard
      showCloseButton={false}
      contentClassName="px-4 pt-1"
    >
      <div
        className={`${glassPeoplePanelClass} mx-auto flex max-h-[min(82vh,40rem)] w-full max-w-lg flex-col`}
        role="dialog"
        aria-modal="true"
        aria-label="Location"
      >
        <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text)]">
            Location
          </p>
          <button
            type="button"
            className={headerMapsClass}
            onClick={() =>
              void openMapsLocationUrl(
                createFlowMapsSearchOrRootUrl(
                  workingName.replace(/\s+/g, " ").trim()
                )
              )
            }
          >
            <span>Open Maps</span>
            <PiArrowSquareOut className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
          </button>
          <button
            type="button"
            className={closeBtnClass}
            aria-label="Close"
            onClick={discard}
          >
            <PiX className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div
          className="min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-3"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              editorRef.current?.focus();
            }
          }}
        >
          <textarea
            ref={editorRef}
            rows={1}
            inputMode="text"
            enterKeyHint="enter"
            autoComplete="off"
            autoCorrect="on"
            spellCheck
            value={workingName}
            maxLength={L.googleMapsLinkMaxChars}
            placeholder="Place name, address, or Google Maps link"
            className={[
              fieldClass,
              placeholderPulse && !workingName.trim()
                ? "placeholder:text-[var(--brand)] app-dark:placeholder:text-[var(--brand)]"
                : "placeholder:text-[var(--text)]/40 app-dark:placeholder:text-white/40",
            ].join(" ")}
            style={{ fontSize: 16 }}
            onChange={(e) => {
              setWorkingName(e.target.value);
              resizeLocationEditor(e.currentTarget);
            }}
            onPaste={onPaste}
            onBlur={() => {
              absorbUrlLinesFromText(workingName);
            }}
          />
          {workingUrl ? (
            <div className={chipClass}>
              <PiLink
                className="h-3 w-3 shrink-0 text-[var(--text)]/55"
                aria-hidden
              />
              <span className="max-w-[11rem] truncate">
                {locationAttachmentLabel(workingUrl)}
              </span>
              <button
                type="button"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--text)]/45 transition hover:bg-[var(--text)]/8 hover:text-[var(--text)]/80"
                aria-label="Remove link"
                onClick={() => setWorkingUrl("")}
              >
                <PiX className="h-3 w-3" aria-hidden />
              </button>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 px-3 pb-2.5 pt-1">
          {hasWorkingLocation ? (
            <div className="mb-1 flex justify-end">
              <button type="button" className={subtleBtn} onClick={clearLocation}>
                Clear location
              </button>
            </div>
          ) : null}
          <button type="button" className={doneClass} onClick={commit}>
            Done
          </button>
        </div>
      </div>
    </BottomDrawer>
  );
}
