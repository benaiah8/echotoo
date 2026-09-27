/**
 * V4 Finalize Sections — inline body editors with drag reorder.
 * Rows are stored in draftActivities with activityType V4Section.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { PiDotsSix, PiX } from "react-icons/pi";
import { ActivityType } from "../../types/post";
import ComposeLinkPreviewOverlay, {
  COMPOSE_LINK_PREVIEW_SECTION_TYPE_CLASS,
  composeTextHasLinkPreview,
} from "../ui/ComposeLinkPreviewOverlay";
import ComposeLinkOpenIcons from "../ui/ComposeLinkOpenIcons";
import {
  V4_SECTION_BODY_MAX,
  clampV4SectionBody,
  ensureV4SectionClientId,
  getV4SectionClientId,
  isV4Section,
  moveV4SectionAtDisplayIndex,
  reorderV4SectionsByClientId,
  sanitizeV4SectionBodyForCommit,
} from "../../lib/createFlowV4Section";
import { activitiesSnapshotsEqual } from "../../lib/createFlowStructuralHistory";
import { scheduleFinalizeSectionComposeScroll } from "../../lib/createFlowScrollFieldIntoView";

const textareaClass =
  `${COMPOSE_LINK_PREVIEW_SECTION_TYPE_CLASS} relative z-[1] block w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent outline-none ring-0 shadow-none focus:outline-none focus:ring-0`;

const placeholderTransitionClass =
  "placeholder:transition-colors placeholder:duration-[900ms] placeholder:ease-in-out motion-reduce:placeholder:transition-none";

const placeholderMutedClass =
  "placeholder:text-[var(--text)]/38 app-dark:placeholder:text-white/38";

const placeholderBrandClass =
  "placeholder:text-[var(--brand)] app-dark:placeholder:text-[var(--brand)]";

const PLACEHOLDER_PULSE_START_MS = 80;
const PLACEHOLDER_PULSE_DURATION_MS = 900;

const sectionDraggingClass = "relative z-[2]";

const gripButtonClass =
  "-ml-1 inline-flex h-8 w-8 shrink-0 touch-none items-center justify-center rounded-full text-[var(--text)]/62 transition-colors hover:text-[var(--text)]/90 focus-visible:text-[var(--text)]/90 active:text-[var(--text)]";

const removeButtonClass =
  "-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text)]/50 transition-colors hover:text-[var(--text)]/82 focus-visible:text-[var(--text)]/82";

function resizeSectionTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export type ActiveWritingBlock =
  | { kind: "caption" }
  | { kind: "section"; sectionClientId: string }
  | null;

type SectionEntry = {
  activity: ActivityType;
  draftIndex: number;
  sectionClientId: string;
};

type SectionEditorRowProps = {
  displayIndex: number;
  sectionClientId: string;
  body: string;
  holdEmptyInComposeSession: boolean;
  isDragging: boolean;
  canReorder: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  autoFocus: boolean;
  onAutoFocusHandled: () => void;
  skipBlurRemoveRef: MutableRefObject<boolean>;
  onBodyChange: (next: string) => void;
  onBeforeInput?: (inputType: string) => void;
  onRemove: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  registerTextareaRef: (sectionClientId: string, el: HTMLTextAreaElement | null) => void;
  sortableRef: (node: HTMLElement | null) => void;
  sortableStyle: React.CSSProperties;
  dragHandleProps: {
    ref: (node: HTMLElement | null) => void;
    attributes: DraggableAttributes;
    listeners: SyntheticListenerMap | undefined;
  };
};

function SectionEditorRow({
  displayIndex,
  sectionClientId,
  body,
  holdEmptyInComposeSession,
  isDragging,
  canReorder,
  canMoveUp,
  canMoveDown,
  autoFocus,
  onAutoFocusHandled,
  skipBlurRemoveRef,
  onBodyChange,
  onBeforeInput,
  onRemove,
  onFocus,
  onBlur,
  onMoveUp,
  onMoveDown,
  registerTextareaRef,
  sortableRef,
  sortableStyle,
  dragHandleProps,
}: SectionEditorRowProps) {
  const localSkipBlurRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [placeholderPulse, setPlaceholderPulse] = useState(false);
  const pulseTimersRef = useRef<{ start?: number; end?: number }>({});
  const showLinkPreview = composeTextHasLinkPreview(body);

  const handleResize = useCallback(() => {
    resizeSectionTextarea(textareaRef.current);
  }, []);

  useLayoutEffect(() => {
    handleResize();
  }, [body, handleResize]);

  useEffect(() => {
    registerTextareaRef(sectionClientId, textareaRef.current);
    return () => registerTextareaRef(sectionClientId, null);
  }, [registerTextareaRef, sectionClientId]);

  const clearPlaceholderPulse = useCallback(() => {
    if (pulseTimersRef.current.start != null) {
      window.clearTimeout(pulseTimersRef.current.start);
    }
    if (pulseTimersRef.current.end != null) {
      window.clearTimeout(pulseTimersRef.current.end);
    }
    pulseTimersRef.current = {};
    setPlaceholderPulse(false);
  }, []);

  const startPlaceholderPulse = useCallback(() => {
    if (body.trim()) return;
    clearPlaceholderPulse();
    pulseTimersRef.current.start = window.setTimeout(() => {
      setPlaceholderPulse(true);
    }, PLACEHOLDER_PULSE_START_MS);
    pulseTimersRef.current.end = window.setTimeout(() => {
      setPlaceholderPulse(false);
    }, PLACEHOLDER_PULSE_START_MS + PLACEHOLDER_PULSE_DURATION_MS);
  }, [body, clearPlaceholderPulse]);

  useEffect(() => {
    return () => clearPlaceholderPulse();
  }, [clearPlaceholderPulse]);

  useEffect(() => {
    if (!autoFocus) return;

    let cancelled = false;
    let attempts = 0;

    const armSkipBlur = () => {
      localSkipBlurRef.current = true;
      skipBlurRemoveRef.current = true;
      window.setTimeout(() => {
        localSkipBlurRef.current = false;
        skipBlurRemoveRef.current = false;
      }, 200);
    };

    const tryFocus = () => {
      if (cancelled) return;
      const el = textareaRef.current;
      if (!el) {
        if (attempts < 24) {
          attempts += 1;
          requestAnimationFrame(tryFocus);
        } else {
          onAutoFocusHandled();
        }
        return;
      }

      armSkipBlur();
      el.focus({ preventScroll: true });
      handleResize();

      if (document.activeElement !== el) {
        if (attempts < 24) {
          attempts += 1;
          requestAnimationFrame(tryFocus);
        } else {
          onAutoFocusHandled();
        }
        return;
      }

      requestAnimationFrame(() => {
        if (cancelled) return;
        const closest = el.closest("[data-v4-section-editor]");
        const sectionRoot =
          closest instanceof HTMLElement ? closest : el;
        // Keep settle retries alive after autoFocus clears — do not cancel on effect cleanup.
        scheduleFinalizeSectionComposeScroll(sectionRoot);
        onAutoFocusHandled();
      });
    };

    requestAnimationFrame(() => requestAnimationFrame(tryFocus));
    return () => {
      cancelled = true;
    };
  }, [
    autoFocus,
    handleResize,
    onAutoFocusHandled,
    sectionClientId,
    skipBlurRemoveRef,
  ]);

  useEffect(() => {
    if (!autoFocus) return;
    // After focus/scroll settle; intentionally no cleanup — autoFocus clears before this fires.
    window.setTimeout(() => {
      startPlaceholderPulse();
    }, 320);
  }, [autoFocus, sectionClientId, startPlaceholderPulse]);

  const showBrandPlaceholder = placeholderPulse && !body.trim();

  const wrapperClass = [
    "group/section relative flex w-full min-w-0 flex-col",
    displayIndex === 0 ? "" : "mt-3",
    isDragging ? sectionDraggingClass : "",
  ]
    .filter(Boolean)
    .join(" ");

  const textareaClasses = [
    textareaClass,
    placeholderTransitionClass,
    showBrandPlaceholder ? placeholderBrandClass : placeholderMutedClass,
    showLinkPreview
      ? "create-finalize-caption-canvas--link-preview"
      : "text-[var(--text)]",
  ].join(" ");

  return (
    <div
      ref={sortableRef}
      style={sortableStyle}
      className={wrapperClass}
      data-section-client-id={sectionClientId}
      data-v4-section-editor
    >
      <div
        className="h-px w-full shrink-0 bg-[var(--border)]/48 app-dark:bg-white/14"
        aria-hidden
      />
      <div className="flex h-8 w-full min-w-0 items-center justify-between">
        <button
          type="button"
          ref={dragHandleProps.ref}
          className={[
            gripButtonClass,
            canReorder
              ? "cursor-grab active:cursor-grabbing"
              : "cursor-default opacity-40",
          ].join(" ")}
          {...(canReorder ? dragHandleProps.attributes : {})}
          {...(canReorder ? dragHandleProps.listeners : {})}
          aria-label={
            canReorder
              ? `Move section ${displayIndex + 1}. Use arrow keys to move up or down.`
              : `Move section ${displayIndex + 1} (reorder unavailable)`
          }
          aria-disabled={!canReorder}
          disabled={!canReorder}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" && canMoveUp) {
              e.preventDefault();
              onMoveUp();
            } else if (e.key === "ArrowDown" && canMoveDown) {
              e.preventDefault();
              onMoveDown();
            }
          }}
          onMouseDown={() => {
            if (!canReorder) return;
            localSkipBlurRef.current = true;
            skipBlurRemoveRef.current = true;
            window.setTimeout(() => {
              localSkipBlurRef.current = false;
              skipBlurRemoveRef.current = false;
            }, 120);
          }}
        >
          <PiDotsSix className="h-[17px] w-[17px]" aria-hidden />
        </button>
        <button
          type="button"
          className={removeButtonClass}
          aria-label={`Remove section ${displayIndex + 1}`}
          onMouseDown={(e) => {
            e.preventDefault();
            localSkipBlurRef.current = true;
            skipBlurRemoveRef.current = true;
          }}
          onClick={() => {
            localSkipBlurRef.current = true;
            skipBlurRemoveRef.current = true;
            onRemove();
            window.setTimeout(() => {
              localSkipBlurRef.current = false;
              skipBlurRemoveRef.current = false;
            }, 0);
          }}
        >
          <PiX className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <div className="relative w-full min-w-0">
        {showLinkPreview ? (
          <div
            className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
            aria-hidden
          >
            <ComposeLinkPreviewOverlay
              text={body}
              typeClassName={COMPOSE_LINK_PREVIEW_SECTION_TYPE_CLASS}
            />
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          rows={1}
          autoFocus={autoFocus}
          className={textareaClasses}
          value={body}
          maxLength={V4_SECTION_BODY_MAX}
          placeholder="Add details for this section…"
          aria-label={`Section ${displayIndex + 1} body`}
          data-create-section-link-preview={showLinkPreview ? "true" : "false"}
          inputMode="text"
          enterKeyHint="enter"
          autoCapitalize="sentences"
          autoCorrect="on"
          spellCheck
          onBeforeInput={(e) => {
            onBeforeInput?.(
              (e.nativeEvent as globalThis.InputEvent).inputType ?? "",
            );
          }}
          onChange={(e) => {
            onBodyChange(clampV4SectionBody(e.target.value));
            if (e.target.value.trim()) clearPlaceholderPulse();
            handleResize();
          }}
          onInput={handleResize}
          onFocus={() => {
            handleResize();
            onFocus();
          }}
          onBlur={() => {
            if (localSkipBlurRef.current || skipBlurRemoveRef.current) return;
            onBlur();
            if (
              !holdEmptyInComposeSession &&
              !sanitizeV4SectionBodyForCommit(body)
            ) {
              onRemove();
            }
          }}
        />
      </div>
      {showLinkPreview ? (
        <ComposeLinkOpenIcons
          text={body}
          skipBlurRemoveRef={skipBlurRemoveRef}
        />
      ) : null}
    </div>
  );
}

function SortableSectionRow(
  props: Omit<
    SectionEditorRowProps,
    "sortableRef" | "sortableStyle" | "dragHandleProps" | "isDragging"
  >
) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.sectionClientId,
    disabled: !props.canReorder,
  });

  return (
    <SectionEditorRow
      {...props}
      isDragging={isDragging}
      sortableRef={setNodeRef}
      sortableStyle={{
        transform: CSS.Translate.toString(transform),
        transition,
        boxShadow: "none",
      }}
      dragHandleProps={{
        ref: setActivatorNodeRef,
        attributes,
        listeners,
      }}
    />
  );
}

export type CreateFinalizeSectionsEditorsProps = {
  activities: ActivityType[];
  setActivities: React.Dispatch<React.SetStateAction<ActivityType[]>>;
  activeWritingBlock: ActiveWritingBlock;
  onSectionFocus: (sectionClientId: string) => void;
  onSectionBlur: (sectionClientId: string) => void;
  sectionComposeClientId: string | null;
  autoFocusSectionClientId: string | null;
  onAutoFocusSectionHandled: () => void;
  skipBlurRemoveRef: MutableRefObject<boolean>;
  onSectionRemoved: (sectionClientId: string) => void;
  captionTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  /** Call immediately before a discrete section mutation (delete / reorder). */
  recordDiscreteBefore?: () => void;
  onSectionBodyChange: (
    sectionClientId: string,
    draftIndex: number,
    next: string
  ) => void;
  onSectionBeforeInput?: (sectionClientId: string, inputType: string) => void;
};

/** Section body editors — render below Key details chips. */
export function CreateFinalizeSectionsEditors({
  activities,
  setActivities,
  activeWritingBlock,
  onSectionFocus,
  onSectionBlur,
  sectionComposeClientId,
  autoFocusSectionClientId,
  onAutoFocusSectionHandled,
  skipBlurRemoveRef,
  onSectionRemoved,
  captionTextareaRef,
  recordDiscreteBefore,
  onSectionBodyChange,
  onSectionBeforeInput,
}: CreateFinalizeSectionsEditorsProps) {
  const sectionTextareaRefs = useRef<Map<string, HTMLTextAreaElement>>(
    new Map()
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const registerTextareaRef = useCallback(
    (sectionClientId: string, el: HTMLTextAreaElement | null) => {
      if (el) sectionTextareaRefs.current.set(sectionClientId, el);
      else sectionTextareaRefs.current.delete(sectionClientId);
    },
    []
  );

  const sectionEntries = useMemo((): SectionEntry[] => {
    return activities
      .map((activity, index) => ({ activity, index }))
      .filter(({ activity }) => isV4Section(activity))
      .map(({ activity, index }) => {
        const withId = ensureV4SectionClientId(activity);
        const sectionClientId = getV4SectionClientId(withId)!;
        return { activity: withId, draftIndex: index, sectionClientId };
      });
  }, [activities]);

  const sortableIds = useMemo(
    () => sectionEntries.map((entry) => entry.sectionClientId),
    [sectionEntries]
  );

  const canReorder = sectionEntries.length > 1;

  useEffect(() => {
    setActivities((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        if (!isV4Section(row)) return row;
        if (getV4SectionClientId(row)) return row;
        changed = true;
        return ensureV4SectionClientId(row);
      });
      return changed ? next : prev;
    });
  }, [activities, setActivities]);

  const focusSectionByClientId = useCallback((sectionClientId: string) => {
    requestAnimationFrame(() => {
      sectionTextareaRefs.current.get(sectionClientId)?.focus();
    });
  }, []);

  const focusAfterRemove = useCallback(
    (removedClientId: string) => {
      const displayIndex = sectionEntries.findIndex(
        (entry) => entry.sectionClientId === removedClientId
      );
      const prevEntry =
        displayIndex > 0 ? sectionEntries[displayIndex - 1] : null;

      requestAnimationFrame(() => {
        if (prevEntry) {
          focusSectionByClientId(prevEntry.sectionClientId);
        } else {
          captionTextareaRef.current?.focus();
        }
      });
    },
    [captionTextareaRef, focusSectionByClientId, sectionEntries]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      setActivities((prev) => {
        const next = reorderV4SectionsByClientId(prev, activeId, overId);
        if (activitiesSnapshotsEqual(prev, next)) return prev;
        recordDiscreteBefore?.();
        return next;
      });

      if (
        activeWritingBlock?.kind === "section" &&
        activeWritingBlock.sectionClientId === activeId
      ) {
        focusSectionByClientId(activeId);
      }
    },
    [
      activeWritingBlock,
      focusSectionByClientId,
      recordDiscreteBefore,
      setActivities,
    ]
  );

  const handleMoveSection = useCallback(
    (displayIndex: number, direction: "up" | "down") => {
      const entry = sectionEntries[displayIndex];
      if (!entry) return;

      setActivities((prev) => {
        const next = moveV4SectionAtDisplayIndex(prev, displayIndex, direction);
        if (activitiesSnapshotsEqual(prev, next)) return prev;
        recordDiscreteBefore?.();
        return next;
      });

      if (
        activeWritingBlock?.kind === "section" &&
        activeWritingBlock.sectionClientId === entry.sectionClientId
      ) {
        focusSectionByClientId(entry.sectionClientId);
      }
    },
    [
      activeWritingBlock,
      focusSectionByClientId,
      recordDiscreteBefore,
      sectionEntries,
      setActivities,
    ]
  );

  if (sectionEntries.length === 0) return null;

  return (
    <div className="flex w-full min-w-0 flex-col" aria-label="Sections">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          {sectionEntries.map((entry, displayIndex) => (
            <SortableSectionRow
              key={entry.sectionClientId}
              displayIndex={displayIndex}
              sectionClientId={entry.sectionClientId}
              body={entry.activity.sectionBody ?? ""}
              holdEmptyInComposeSession={
                sectionComposeClientId === entry.sectionClientId
              }
              canReorder={canReorder}
              canMoveUp={displayIndex > 0}
              canMoveDown={displayIndex < sectionEntries.length - 1}
              autoFocus={
                sectionComposeClientId === entry.sectionClientId &&
                autoFocusSectionClientId === entry.sectionClientId
              }
              onAutoFocusHandled={onAutoFocusSectionHandled}
              skipBlurRemoveRef={skipBlurRemoveRef}
              registerTextareaRef={registerTextareaRef}
              onBodyChange={(next) => {
                onSectionBodyChange(entry.sectionClientId, entry.draftIndex, next);
              }}
              onBeforeInput={(inputType) => {
                onSectionBeforeInput?.(entry.sectionClientId, inputType);
              }}
              onFocus={() => onSectionFocus(entry.sectionClientId)}
              onBlur={() => onSectionBlur(entry.sectionClientId)}
              onMoveUp={() => handleMoveSection(displayIndex, "up")}
              onMoveDown={() => handleMoveSection(displayIndex, "down")}
              onRemove={() => {
                const wasActive =
                  activeWritingBlock?.kind === "section" &&
                  activeWritingBlock.sectionClientId === entry.sectionClientId;
                setActivities((prev) => {
                  recordDiscreteBefore?.();
                  return prev.filter((_, i) => i !== entry.draftIndex);
                });
                onSectionRemoved(entry.sectionClientId);
                if (wasActive) {
                  focusAfterRemove(entry.sectionClientId);
                }
              }}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
