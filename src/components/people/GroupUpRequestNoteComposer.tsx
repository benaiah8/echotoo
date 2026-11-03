/**
 * Group Up “Request to join” note composer — presentation aligned with
 * OpenPlanRequestNoteComposer / PeopleCommentComposerOverlay glass + BottomDrawer.
 * Submit / draft / toast lifecycle stay owned by GroupUpDeckBody.
 */
/* eslint-disable react-refresh/only-export-components -- helpers co-located with sheet */

import BottomDrawer from "../ui/BottomDrawer";
import { glassPeoplePanelClass } from "../../lib/glassActionSheetStyles";
import { SOCIAL_OVERLAY_LAYER } from "../../lib/socialOverlayLayers";
import type { PostScheduleLabelKind } from "../../lib/postScheduleLabel";
import type { ProfileIdentityMediaSource } from "../../lib/profileIdentityMedia";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import PeopleComposerContextCard from "./PeopleComposerContextCard";

export const GROUP_UP_REQUEST_NOTE_MAX = 200;

export const GROUP_UP_NO_REQUEST_SENT_TOAST = "No request sent";

export type GroupUpComposerToastEvent = "cancel" | "dismiss";

/** Cancel toasts once. Dismiss does not toast. */
export function emitGroupUpComposerToast(
  event: GroupUpComposerToastEvent,
  emit: { info: (message: string) => void }
): void {
  if (event === "cancel") {
    emit.info(GROUP_UP_NO_REQUEST_SENT_TOAST);
  }
}

/** Presentation snapshot for the context card (no host display_name). */
export type GroupUpRequestComposerContext = {
  identitySource: ProfileIdentityMediaSource;
  caption: string | null;
  scheduleLabel: string | null;
  scheduleLabelKind: PostScheduleLabelKind | null;
  /** Echo seed — opportunity id; never a restricted creator id. */
  feedNeutralEchoSeed: string;
};

export type GroupUpRequestComposerState = GroupUpRequestComposerContext & {
  opportunityId: string;
  draft: string;
};

export type GroupUpRequestRowGate = {
  opportunity_id: string | null;
  viewer_state: "none" | "pending" | "owner" | "member";
};

export function limitGroupUpRequestNote(value: string): string {
  return value.slice(0, GROUP_UP_REQUEST_NOTE_MAX);
}

export function trimGroupUpRequestNote(value: string): string {
  return value.trim();
}

/**
 * Same opportunity keeps its draft and refreshes presentation context.
 * A different opportunity starts with an empty draft.
 */
export function openGroupUpRequestComposer(
  current: GroupUpRequestComposerState | null,
  opportunityId: string,
  context: GroupUpRequestComposerContext
): GroupUpRequestComposerState {
  if (current?.opportunityId === opportunityId) {
    return { ...current, ...context };
  }
  return { opportunityId, draft: "", ...context };
}

export function groupUpHeartIntent(
  state: "none" | "pending" | "owner" | "member" | undefined
): "withdraw" | "compose" | "open" {
  if (state === "pending") return "withdraw";
  if (state === "member" || state === "owner") return "open";
  return "compose";
}

export function groupUpRequestComposerStillValid(
  state: GroupUpRequestComposerState | null,
  rows: readonly GroupUpRequestRowGate[]
): boolean {
  if (!state) return false;
  const row = rows.find(
    (item) => (item.opportunity_id?.trim() || "") === state.opportunityId
  );
  return Boolean(row) && row?.viewer_state === "none";
}

/**
 * Flight + trim helper for composer Send. Does not open or toast.
 * Empty note is allowed (trimmed to "").
 */
export async function runGroupUpRequestSubmit<T>(input: {
  flight: { current: boolean };
  opportunityId: string;
  draft: string;
  request: (
    opportunityId: string,
    options: { note: string }
  ) => Promise<T>;
  onStart?: () => void;
}): Promise<
  | { status: "skipped" }
  | { status: "ok"; result: T; note: string }
  | { status: "error"; note: string }
> {
  if (input.flight.current) return { status: "skipped" };
  input.flight.current = true;
  const note = trimGroupUpRequestNote(input.draft);
  input.onStart?.();
  try {
    const result = await input.request(input.opportunityId, { note });
    return { status: "ok", result, note };
  } catch {
    return { status: "error", note: input.draft };
  } finally {
    input.flight.current = false;
  }
}

const NOTE_LINE_PX = 26;
const NOTE_MIN_LINES = 3;
const NOTE_MAX_LINES = 5;
const NOTE_MIN_H = NOTE_LINE_PX * NOTE_MIN_LINES;
const NOTE_MAX_H = NOTE_LINE_PX * NOTE_MAX_LINES;
const NOTE_COUNTER_PAD_BOTTOM_PX = 22;
const NOTE_COUNTER_PAD_RIGHT_PX = 52;

const ACTION_H = "min-h-11 h-11";
const actionBase = [
  "inline-flex min-w-0 flex-1 items-center justify-center",
  "box-border rounded-full border",
  ACTION_H,
  "px-2 text-[13px] font-semibold leading-none tracking-tight",
  "whitespace-nowrap truncate",
  "max-[360px]:px-1.5 sm:px-2.5 sm:text-sm",
].join(" ");

const actionTrayClass = [
  "flex w-full items-center gap-1.5 overflow-visible rounded-full p-1.5",
  "max-[360px]:gap-1 max-[360px]:p-1",
  "bg-[color-mix(in_oklab,var(--surface)_55%,var(--bg))]",
  "backdrop-blur-md",
  "app-dark:bg-[color-mix(in_oklab,var(--surface-2)_42%,black)]",
].join(" ");

type SheetProps = {
  draft: string;
  busy: boolean;
  context: GroupUpRequestComposerContext;
  onDraftChange: (value: string) => void;
  onCancel: () => void;
  /** Backdrop / X close. Does not use the Cancel toast. */
  onDismiss?: () => void;
  onSubmit: (draft: string) => void;
};

/** Two-card glass body — presentation only (no portal). */
export function GroupUpRequestNoteComposerSheet({
  draft,
  busy,
  context,
  onDraftChange,
  onCancel,
  onDismiss,
  onSubmit,
}: SheetProps) {
  const handleDismiss = () => {
    if (busy) return;
    (onDismiss ?? onCancel)();
  };

  return (
    <div
      className="mx-auto flex w-full max-w-lg flex-col gap-2 pb-1 min-[320px]:w-full"
      data-group-up-request-composer="true"
      role="dialog"
      aria-modal="true"
      aria-labelledby="group-up-request-note-title"
    >
      <h2 id="group-up-request-note-title" className="sr-only">
        {peopleUiCopy.groupUpRequestTitle}
      </h2>

      <PeopleComposerContextCard
        identitySource={context.identitySource}
        displayName={peopleUiCopy.groupUpIncomingLabel}
        caption={context.caption}
        scheduleLabel={context.scheduleLabel}
        scheduleLabelKind={context.scheduleLabelKind}
        feedNeutralEchoSeed={context.feedNeutralEchoSeed}
        onClose={handleDismiss}
        closeDisabled={busy}
        closeDataAttribute="data-group-up-request-note-dismiss"
      />

      <div
        className={glassPeoplePanelClass}
        data-group-up-request-note-sheet="true"
        data-group-up-request-note-compose="true"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1.5 px-3 pb-3 pt-3 sm:px-4">
          <label
            className="block text-[12px] font-medium text-[var(--text)]/70"
            htmlFor="group-up-request-note-input"
          >
            {peopleUiCopy.groupUpRequestNoteLabel}
          </label>

          <div
            className="relative w-full"
            data-group-up-request-note-textarea-wrap="true"
          >
            <textarea
              id="group-up-request-note-input"
              value={draft}
              maxLength={GROUP_UP_REQUEST_NOTE_MAX}
              rows={NOTE_MIN_LINES}
              disabled={busy}
              placeholder={peopleUiCopy.groupUpRequestNotePlaceholder}
              onChange={(event) =>
                onDraftChange(limitGroupUpRequestNote(event.target.value))
              }
              className={[
                "w-full resize-none rounded-xl border border-[var(--border)]/45",
                "bg-[color-mix(in_oklab,var(--surface)_72%,transparent)]",
                "px-3 py-2.5 text-base leading-relaxed text-[var(--text)]",
                "outline-none ring-0 placeholder:text-[var(--text)]/42",
                "focus:border-[var(--brand)]/45",
                "overscroll-contain touch-pan-y",
              ].join(" ")}
              style={{
                minHeight: NOTE_MIN_H,
                maxHeight: NOTE_MAX_H,
                paddingBottom: NOTE_COUNTER_PAD_BOTTOM_PX,
                paddingRight: NOTE_COUNTER_PAD_RIGHT_PX,
              }}
              data-group-up-request-note-input="true"
              aria-label={peopleUiCopy.groupUpRequestNoteLabel}
            />
            <span
              className={[
                "pointer-events-none absolute bottom-2.5 right-3",
                "text-[10px] tabular-nums leading-none",
                "text-[var(--text)]/38",
                "app-dark:text-[var(--text)]/42",
              ].join(" ")}
              data-group-up-request-note-count="true"
              aria-hidden
            >
              {draft.length}/{GROUP_UP_REQUEST_NOTE_MAX}
            </span>
          </div>

          <div
            className={actionTrayClass}
            data-group-up-request-note-action-tray="true"
          >
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              data-group-up-request-note-cancel="true"
              className={[
                actionBase,
                "border-[var(--border)]/50",
                "bg-[color-mix(in_oklab,var(--surface)_50%,transparent)]",
                "text-[var(--text)]",
                "app-dark:bg-[color-mix(in_oklab,white_8%,transparent)]",
                "disabled:opacity-40",
              ].join(" ")}
            >
              <span className="truncate">{peopleUiCopy.noteSheetCancel}</span>
            </button>
            <button
              type="button"
              onClick={() => onSubmit(draft)}
              disabled={busy}
              className={[
                actionBase,
                "border-transparent",
                "bg-[var(--brand)] text-[var(--brand-ink)]",
                "shadow-[0_2px_6px_rgba(0,0,0,0.14)]",
                "disabled:opacity-40",
              ].join(" ")}
              data-group-up-request-note-send="true"
              aria-busy={busy || undefined}
            >
              <span className="truncate">
                {busy
                  ? peopleUiCopy.groupUpRequestSending
                  : peopleUiCopy.groupUpRequestSend}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GroupUpRequestNoteComposer({
  open,
  ...sheet
}: SheetProps & { open: boolean }) {
  const handleDrawerClose = () => {
    if (sheet.busy) return;
    (sheet.onDismiss ?? sheet.onCancel)();
  };

  return (
    <BottomDrawer
      open={open}
      onClose={handleDrawerClose}
      shrinkSheetToContent
      bodyScrollable
      liftWithKeyboard
      maxHeight="88vh"
      portalClassName={SOCIAL_OVERLAY_LAYER.browseOrNote}
      transparentSheet
      contentClassName="px-3 pt-1 sm:px-4"
      showCloseButton={false}
    >
      <GroupUpRequestNoteComposerSheet {...sheet} />
    </BottomDrawer>
  );
}
