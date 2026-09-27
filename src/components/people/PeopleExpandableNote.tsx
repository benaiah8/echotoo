/**
 * Shared People expandable note: three-line collapse with accessible expand.
 *
 * Embla must see pointerdown/move (no stopPropagation on those). Tap vs drag
 * uses the same 10px threshold as identity bio / photo cycle.
 *
 * expansionMode:
 * - "inline" (default): grows in-flow (Plans).
 * - "floating": opens a lightweight popover; collapsed shell never reflows (Mine).
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { PiX } from "react-icons/pi";
import { useInviteOverlaySyntheticHistory } from "../../hooks/useInviteOverlaySyntheticHistory";
import { peopleIdentityMovedPastTapThreshold } from "../../lib/people/mineIdentityGesture";
import Avatar from "../ui/Avatar";

/** Synthetic history marker so Android/browser Back closes the floating note first. */
export const PEOPLE_EXPANDABLE_NOTE_FLOATING_HISTORY_MARKER =
  "peopleExpandableNoteFloating";

/** Above People dock (45); below Mine profile overlay (90). */
const FLOATING_NOTE_Z = 80;

const FLOATING_AVATAR_PX = 32;

/**
 * Narrower than the Mine frame: ~32px total inset from frame, ≥48px from viewport.
 * Centered via flex on the floating root.
 */
export const PEOPLE_EXPANDABLE_NOTE_FLOATING_PANEL_MAX_W =
  "min(calc(var(--people-mine-frame-w, 22rem) - 32px), calc(100vw - 48px))";

export type PeopleExpandableNoteExpansionMode = "inline" | "floating";

/** Identity for the floating panel — must match `resetKey` (opportunity). */
export type PeopleExpandableNoteFloatingPerson = {
  /** Same value as `resetKey` — rejects stale A/B mixes. */
  identityKey: string;
  displayName: string;
  avatarUrl?: string | null;
  userId?: string | null;
  /** Open Plans pre-accept: no avatar / no real name in the floating header. */
  anonymous?: boolean;
};

type FloatingSnapshot = {
  resetKey: string;
  note: string;
  displayName: string;
  avatarUrl: string | null;
  userId: string | null;
  anonymous: boolean;
};

export type PeopleExpandableNoteProps = {
  note: string | null;
  /** Collapse when the opportunity / candidate changes. */
  resetKey: string;
  /** Neighbor slides stay non-interactive. */
  interactive?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /**
   * How expanded content is presented.
   * - inline: grow inside the carousel (Plans).
   * - floating: fixed popover; zero layout shift (Mine).
   */
  expansionMode?: PeopleExpandableNoteExpansionMode;
  /** Required for floating mode — person header; identityKey must equal resetKey. */
  floatingPerson?: PeopleExpandableNoteFloatingPerson;
  /** Collapsed shell min-height (divider + pads + 3-line text). */
  reserveHPx: number;
  collapsedTextHPx: number;
  expandedTextMaxHPx: number;
  textClassName: string;
  affordanceClassName: string;
  containerClassName?: string;
  containerStyle?: CSSProperties;
  showDivider?: boolean;
  emptyLabel: string;
  expandLabel: string;
  collapseLabel: string;
  /** Floating panel close control (defaults to collapseLabel). */
  closeLabel?: string;
  /** Decorative "Note" label under the person name (floating). */
  noteSectionLabel?: string;
  expandAffordance: string;
  collapseAffordance: string;
  /** Hit-target data attribute (Mine / Plans). */
  hitDataAttr?: string;
  /** When set, mirrors expanded as data-attr="true"|"false". */
  expandedDataAttr?: string;
  rootDataAttrs?: Record<string, string | boolean | undefined>;
};

export default function PeopleExpandableNote({
  note,
  resetKey,
  interactive = true,
  onExpandedChange,
  expansionMode = "inline",
  floatingPerson,
  reserveHPx,
  collapsedTextHPx,
  expandedTextMaxHPx,
  textClassName,
  affordanceClassName,
  containerClassName = "mx-auto flex w-full max-w-full shrink-0 flex-col px-1",
  containerStyle,
  showDivider = true,
  emptyLabel,
  expandLabel,
  collapseLabel,
  closeLabel,
  noteSectionLabel = "Note",
  expandAffordance,
  collapseAffordance,
  hitDataAttr,
  expandedDataAttr,
  rootDataAttrs,
}: PeopleExpandableNoteProps) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const [floatingSnapshot, setFloatingSnapshot] =
    useState<FloatingSnapshot | null>(null);
  const measureRef = useRef<HTMLElement | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const suppressToggleRef = useRef(false);
  const expandControlRef = useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const textId = useId();
  const personNameId = useId();
  const isFloating = expansionMode === "floating";
  const inlineExpanded = expanded && !isFloating;
  const personMatches =
    Boolean(floatingPerson) && floatingPerson!.identityKey === resetKey;
  const floatingOpen =
    expanded &&
    isFloating &&
    Boolean(note) &&
    personMatches &&
    floatingSnapshot !== null &&
    floatingSnapshot.resetKey === resetKey;
  const resolvedCloseLabel = closeLabel ?? collapseLabel;

  useEffect(() => {
    setExpanded(false);
    setFloatingSnapshot(null);
    suppressToggleRef.current = false;
    originRef.current = null;
  }, [resetKey]);

  useEffect(() => {
    if (!interactive && expanded) {
      setExpanded(false);
      setFloatingSnapshot(null);
    }
  }, [interactive, expanded]);

  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  // Snapshot identity+note at open so rapid candidate swaps cannot mix A/B.
  useEffect(() => {
    if (!isFloating) return;
    if (!expanded) {
      setFloatingSnapshot(null);
      return;
    }
    if (
      !note ||
      !floatingPerson ||
      floatingPerson.identityKey !== resetKey
    ) {
      setExpanded(false);
      setFloatingSnapshot(null);
      return;
    }
    setFloatingSnapshot({
      resetKey,
      note,
      displayName: floatingPerson.displayName.trim() || "Someone",
      avatarUrl: floatingPerson.anonymous
        ? null
        : (floatingPerson.avatarUrl ?? null),
      userId: floatingPerson.anonymous
        ? null
        : (floatingPerson.userId ?? null),
      anonymous: floatingPerson.anonymous === true,
    });
  }, [expanded, isFloating, note, floatingPerson, resetKey]);

  useLayoutEffect(() => {
    if (expanded && !isFloating) return;
    const el = measureRef.current;
    if (!el || !note) {
      setCanExpand(false);
      return;
    }
    setCanExpand(el.scrollHeight > el.clientHeight + 1);
  }, [note, expanded, resetKey, isFloating]);

  useEffect(() => {
    if (!floatingOpen) return;
    const id = window.requestAnimationFrame(() => {
      closeBtnRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [floatingOpen]);

  const closeFloating = useCallback(() => {
    setExpanded(false);
    setFloatingSnapshot(null);
    window.requestAnimationFrame(() => {
      expandControlRef.current?.focus();
    });
  }, []);

  useInviteOverlaySyntheticHistory({
    engage: floatingOpen,
    marker: PEOPLE_EXPANDABLE_NOTE_FLOATING_HISTORY_MARKER,
    onDismiss: closeFloating,
  });

  const toggle = useCallback(() => {
    if (!interactive || !canExpand) return;
    if (isFloating && !personMatches) return;
    setExpanded((v) => !v);
  }, [canExpand, interactive, isFloating, personMatches]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    },
    [toggle]
  );

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    // Do not stopPropagation — Embla must own horizontal drag.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    originRef.current = { x: e.clientX, y: e.clientY };
    suppressToggleRef.current = false;
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const origin = originRef.current;
    if (!origin) return;
    if (peopleIdentityMovedPastTapThreshold(origin, e.clientX, e.clientY)) {
      suppressToggleRef.current = true;
    }
  }, []);

  const onPointerUp = useCallback(() => {
    originRef.current = null;
  }, []);

  const onScroll = useCallback(() => {
    suppressToggleRef.current = true;
  }, []);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (suppressToggleRef.current) {
        suppressToggleRef.current = false;
        return;
      }
      toggle();
    },
    [toggle]
  );

  const stopOverlayPointer = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDismissLayerClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      closeFloating();
    },
    [closeFloating]
  );

  const showControl = Boolean(note && interactive && (canExpand || expanded));
  const controlAriaLabel =
    isFloating && floatingOpen
      ? resolvedCloseLabel
      : expanded
        ? collapseLabel
        : expandLabel;
  const affordanceText =
    isFloating || !expanded ? expandAffordance : collapseAffordance;

  const dataProps: Record<string, string> = {
    "data-people-duo-note": "true",
    "data-people-duo-note-empty": note ? "false" : "true",
    "data-people-expandable-note": "true",
    "data-people-expandable-note-expanded": expanded ? "true" : "false",
    "data-people-expandable-note-mode": expansionMode,
  };
  if (expandedDataAttr) {
    dataProps[expandedDataAttr] = expanded ? "true" : "false";
  }
  if (rootDataAttrs) {
    for (const [key, value] of Object.entries(rootDataAttrs)) {
      if (value === undefined || value === false) continue;
      dataProps[key] = value === true ? "true" : String(value);
    }
  }

  const snap = floatingSnapshot;
  const floatingPortal =
    floatingOpen && snap && typeof document !== "undefined"
      ? createPortal(
          <div
            className="pointer-events-auto fixed inset-0 flex items-center justify-center px-3"
            style={{
              zIndex: FLOATING_NOTE_Z,
              paddingBottom:
                "calc(7.5rem + var(--safe-area-bottom-layout, 0px))",
              paddingTop: "calc(4.5rem + var(--safe-area-top-layout, 0px))",
            }}
            data-people-expandable-note-floating-root="true"
            data-people-expandable-note-identity={snap.resetKey}
          >
            {/* Single backdrop: dim + light blur — panel itself stays opaque. */}
            <div
              className="absolute inset-0 bg-[color-mix(in_oklab,var(--bg)_40%,transparent)] backdrop-blur-[6px] app-light:bg-[color-mix(in_oklab,var(--bg)_28%,transparent)]"
              aria-hidden
              data-people-expandable-note-dismiss="true"
              data-people-expandable-note-scrim="true"
              onPointerDown={stopOverlayPointer}
              onPointerUp={stopOverlayPointer}
              onClick={onDismissLayerClick}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={personNameId}
              className="relative z-[1] flex w-full flex-col overflow-hidden rounded-2xl border border-[var(--glass-active-border,var(--border))] bg-[color-mix(in_oklab,var(--surface)_94%,var(--glass-bg))] shadow-[0_12px_40px_rgba(0,0,0,0.22)]"
              style={{
                maxWidth: PEOPLE_EXPANDABLE_NOTE_FLOATING_PANEL_MAX_W,
                maxHeight: "min(52dvh, calc(100dvh - 14rem))",
              }}
              data-people-expandable-note-floating-panel="true"
              onPointerDown={stopOverlayPointer}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="relative flex shrink-0 flex-col px-3.5 pb-0 pt-3"
                data-people-expandable-note-floating-header="true"
              >
                <button
                  ref={closeBtnRef}
                  type="button"
                  className="absolute right-2.5 top-2.5 z-[2] inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--text)]/55 touch-manipulation active:scale-[0.96] hover:bg-[color-mix(in_oklab,var(--text)_8%,transparent)] hover:text-[var(--text)]/80"
                  aria-label={resolvedCloseLabel}
                  data-people-expandable-note-floating-close="true"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    closeFloating();
                  }}
                >
                  <PiX className="h-3.5 w-3.5" aria-hidden />
                </button>

                <div
                  className="flex min-w-0 items-center gap-2.5 pr-9"
                  data-people-expandable-note-floating-person="true"
                  data-people-expandable-note-floating-anonymous={
                    snap.anonymous ? "true" : undefined
                  }
                >
                  {snap.anonymous ? null : (
                    <Avatar
                      url={snap.avatarUrl}
                      name={snap.displayName}
                      userId={snap.userId}
                      size={FLOATING_AVATAR_PX}
                      tightLineBox
                      disableInnerPointer
                      imageDraggable={false}
                      className="shrink-0"
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                    <h2
                      id={personNameId}
                      className="min-w-0 max-w-full truncate font-[family-name:var(--font-people-display)] text-[15px] font-medium leading-tight tracking-wide text-[var(--text)]/92"
                      data-people-expandable-note-floating-name="true"
                    >
                      {snap.displayName}
                    </h2>
                    <span
                      className="font-[family-name:var(--font-people-display)] text-[12px] font-medium italic leading-none tracking-wide text-[var(--text)]/48"
                      aria-hidden
                      data-people-expandable-note-floating-note-label="true"
                    >
                      {noteSectionLabel}
                    </span>
                  </div>
                </div>
                {/* Divider removed — keep former header→body breathing room via padding. */}
                <div
                  className="h-3.5 shrink-0"
                  aria-hidden
                  data-people-expandable-note-floating-header-gap="true"
                />
              </div>

              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pb-4"
                data-people-expandable-note-floating-body="true"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                <p
                  className={`${textClassName} whitespace-pre-wrap text-left`}
                  data-people-expandable-note-floating-text="true"
                >
                  {snap.note}
                </p>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div
      className={containerClassName}
      style={{
        minHeight: reserveHPx,
        // Inline only: grow into LOWER surplus first (padBottom + unusedHost).
        // Do not budget padTop here — that would invite portrait jump.
        // Floating never changes host size.
        maxHeight: inlineExpanded
          ? `min(${reserveHPx - collapsedTextHPx + expandedTextMaxHPx + 16}px, calc(${reserveHPx}px + var(--people-mine-surplus-pad-bottom, 0px) + var(--people-mine-unused-host, 0px) + 16px))`
          : undefined,
        paddingTop: 10,
        paddingBottom: 2,
        ...containerStyle,
      }}
      {...dataProps}
    >
      {showDivider ? (
        <span
          className="block h-px w-10 shrink-0 rounded-full"
          style={{
            background: "color-mix(in oklab, var(--text) 18%, transparent)",
          }}
          aria-hidden
          data-people-duo-note-divider="true"
        />
      ) : null}
      {note ? (
        showControl ? (
          <button
            ref={expandControlRef}
            type="button"
            className="mt-2 flex min-h-0 w-full cursor-pointer flex-col border-0 bg-transparent p-0 outline-none touch-manipulation"
            style={inlineExpanded ? { touchAction: "pan-y" } : undefined}
            aria-expanded={expanded}
            aria-controls={inlineExpanded ? textId : undefined}
            aria-haspopup={isFloating ? "dialog" : undefined}
            aria-label={controlAriaLabel}
            {...(hitDataAttr ? { [hitDataAttr]: "true" } : {})}
            onClick={onClick}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
          >
            <span
              id={textId}
              ref={(node) => {
                measureRef.current = node;
              }}
              className={`${textClassName} ${
                inlineExpanded
                  ? "block min-h-0 flex-1 whitespace-pre-wrap overflow-y-auto overscroll-contain"
                  : "line-clamp-3"
              }`}
              style={
                inlineExpanded
                  ? {
                      maxHeight: `min(${expandedTextMaxHPx}px, calc(${collapsedTextHPx}px + var(--people-mine-surplus-pad-bottom, 0px) + var(--people-mine-unused-host, 0px)))`,
                    }
                  : undefined
              }
              onScroll={inlineExpanded ? onScroll : undefined}
            >
              {note}
            </span>
            {/* Floating never shows "Less" — close lives on the panel. */}
            {!(isFloating && floatingOpen) ? (
              <span className={affordanceClassName} aria-hidden>
                {affordanceText}
              </span>
            ) : null}
          </button>
        ) : (
          <p
            id={textId}
            ref={(node) => {
              measureRef.current = node;
            }}
            className={`mt-2 line-clamp-3 ${textClassName}`}
          >
            {note}
          </p>
        )
      ) : (
        <span className="sr-only">{emptyLabel}</span>
      )}
      {floatingPortal}
    </div>
  );
}
