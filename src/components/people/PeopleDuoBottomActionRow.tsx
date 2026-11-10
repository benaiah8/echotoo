/**
 * Duo fixed bottom row: Previous · Heart+Comment pill · Next (above global BottomTab).
 * Heart/Comment use shared PeopleActionStateButton size={52} (h-[52px]).
 * Comment chrome is parent-supplied; this row does not import the comment store.
 */
import { createPortal } from "react-dom";
import { PiCaretLeftBold, PiCaretRightBold } from "react-icons/pi";
import { useCallback, useRef, type RefObject } from "react";
import type { MineEdgeNavCardsHandle } from "./MineEdgeNavCards";
import type { PeopleFeedHeartState } from "./PeopleFeedActionRail";
import PeopleActionStateButton, {
  type PeopleActionConfirmedState,
  type PeopleActionVisualState,
} from "./PeopleActionStateButton";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import {
  PEOPLE_SHELL_Z_ABOVE_BOTTOM_TAB,
  peopleDuoModernTabBandPad,
} from "../../pages/people/peopleShellLayout";
import { settleMineEdgeCardDuoBottomFeedbackSide } from "../../lib/people/mineMotionProbeProgress";

/** Fixed layout slot — feedback scale happens on inner face only. */
const NAV_SLOT_PX = 48;

const DUO_FLOATING_CHROME_CLASS = [
  "border border-transparent",
  "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
  "[-webkit-backdrop-filter:blur(var(--glass-blur))]",
  "shadow-[0_0_0_2px_var(--bottom-tab-pill-ring),0_4px_16px_rgba(0,0,0,0.32)]",
  "app-light:border-black/12",
  "app-light:bg-[color-mix(in_oklab,var(--surface)_94%,#ebe6dc)]",
  "app-light:shadow-[0_0_0_2px_color-mix(in_oklab,#2b2b2b_10%,transparent),0_3px_12px_rgba(0,0,0,0.14)]",
].join(" ");

const CENTER_PILL_CLASS = [
  "relative z-[1] rounded-full p-2",
  DUO_FLOATING_CHROME_CLASS,
].join(" ");

/** Outer hit target — no visible chrome (inner face paints the circle). */
const NAV_SLOT_CLASS = [
  "group pointer-events-auto relative z-[1] inline-flex shrink-0 items-center justify-center",
  "rounded-full border-0 bg-transparent p-0 shadow-none disabled:opacity-100",
].join(" ");

/**
 * Idle chevron color is CSS (`currentColor`). JS only overrides color during
 * swipe engagement, then clears it so availability can interpolate.
 */
const NAV_FACE_CLASS = [
  "inline-flex h-[48px] w-[48px] items-center justify-center rounded-full",
  "border border-white/22 app-light:border-black/18",
  "bg-[#141414] text-[#f5f0e6] shadow-[0_2px_10px_rgba(0,0,0,0.28)]",
  "app-light:bg-white app-light:text-[#141414]",
  "app-light:shadow-[0_2px_8px_rgba(0,0,0,0.12)]",
  "group-disabled:text-[color-mix(in_oklab,#f5f0e6_42%,transparent)]",
  "app-light:group-disabled:text-[color-mix(in_oklab,#141414_62%,transparent)]",
  "motion-safe:transition-colors motion-safe:duration-[240ms] motion-safe:ease-out",
  "motion-reduce:transition-none",
  "will-change-[transform,background-color,color,box-shadow]",
  "[&_svg]:pointer-events-none [&_svg]:h-6 [&_svg]:w-6 [&_svg]:shrink-0 [&_svg]:fill-current",
].join(" ");

function bindEdgeNavFace(
  edgeNavCardsRef: RefObject<MineEdgeNavCardsHandle | null> | undefined,
  side: "prev" | "next",
  node: HTMLElement | null
): void {
  const handle = edgeNavCardsRef?.current;
  if (!handle) return;
  handle[side] = node;
  if (!node) return;
  if (node.dataset.peopleDuoNavFaceBound === "true") return;
  node.dataset.peopleDuoNavFaceBound = "true";
  if (node.style.transform) return;
  settleMineEdgeCardDuoBottomFeedbackSide(node);
}

function mapHeartVisualState(
  heartState: PeopleFeedHeartState
): PeopleActionVisualState {
  if (heartState === "busy") return "pending";
  if (heartState === "disabled") return "disabled";
  if (heartState === "active" || heartState === "pending") return "active";
  return "idle";
}

export default function PeopleDuoBottomActionRow({
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  edgeNavCardsRef,
  connectLabel,
  heartState,
  onHeart,
  messageLabel,
  messageDisabled = false,
  messageBusy = false,
  onMessage,
  navDisabled = false,
  /** From parent comment visual mapper — omit until Overlay wires sent/pending chrome. */
  commentState,
  commentConfirmedState,
}: {
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  edgeNavCardsRef?: RefObject<MineEdgeNavCardsHandle | null>;
  connectLabel: string;
  heartState: PeopleFeedHeartState;
  onHeart: () => void;
  messageLabel: string;
  messageDisabled?: boolean;
  /** Parent marks send/lookup in flight as pending. */
  messageBusy?: boolean;
  onMessage: () => void;
  navDisabled?: boolean;
  commentState?: PeopleActionVisualState;
  commentConfirmedState?: PeopleActionConfirmedState;
}) {
  const heartButtonState = mapHeartVisualState(heartState);
  const heartConfirmedRef = useRef<PeopleActionConfirmedState>("idle");
  if (heartState === "active" || heartState === "pending") {
    heartConfirmedRef.current = "active";
  } else if (heartState === "idle" || heartState === "disabled") {
    heartConfirmedRef.current = "idle";
  }

  const resolvedCommentState: PeopleActionVisualState = messageBusy
    ? "pending"
    : commentState ?? (messageDisabled || navDisabled ? "disabled" : "idle");
  const resolvedCommentConfirmed: PeopleActionConfirmedState =
    commentConfirmedState ?? "idle";
  const commentPressBlocked =
    messageDisabled ||
    navDisabled ||
    resolvedCommentState === "pending" ||
    resolvedCommentState === "disabled";

  const prevEnabled = canGoPrev && !navDisabled;
  const nextEnabled = canGoNext && !navDisabled;
  const tabBandPad = peopleDuoModernTabBandPad();
  const bindPrevFace = useCallback(
    (node: HTMLElement | null) => {
      bindEdgeNavFace(edgeNavCardsRef, "prev", node);
    },
    [edgeNavCardsRef]
  );
  const bindNextFace = useCallback(
    (node: HTMLElement | null) => {
      bindEdgeNavFace(edgeNavCardsRef, "next", node);
    },
    [edgeNavCardsRef]
  );

  const row = (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 flex justify-center overflow-visible bg-transparent"
      style={{ zIndex: PEOPLE_SHELL_Z_ABOVE_BOTTOM_TAB }}
      data-people-duo-bottom-action-row="true"
    >
      <div
        className="pointer-events-none relative mx-auto flex w-full max-w-[640px] flex-row items-center justify-center gap-3 px-2 min-[380px]:gap-4"
        style={{
          paddingBottom: tabBandPad,
        }}
        data-people-duo-bottom-action-cluster="true"
      >
        <div
          aria-hidden
          data-people-duo-action-cluster-wash="true"
          className={[
            "pointer-events-none absolute left-1/2 z-0 h-[180px] w-[min(360px,calc(100vw-16px))] -translate-x-1/2",
            "[--duo-wash-core:color-mix(in_oklab,var(--bg)_90%,transparent)]",
            "[--duo-wash-wing:color-mix(in_oklab,var(--bg)_55%,transparent)]",
            "app-light:[--duo-wash-core:color-mix(in_oklab,var(--app-canvas)_90%,transparent)]",
            "app-light:[--duo-wash-wing:color-mix(in_oklab,var(--app-canvas)_58%,transparent)]",
          ].join(" ")}
          style={{
            bottom: tabBandPad,
            background: [
              "radial-gradient(ellipse 120px 100px at 50% calc(100% - 34px), var(--duo-wash-core) 0%, transparent 78%)",
              "radial-gradient(ellipse 180px 72px at 50% calc(100% - 34px), var(--duo-wash-wing) 0%, transparent 80%)",
            ].join(", "),
            maskImage:
              "radial-gradient(ellipse 95% 88% at 50% calc(100% - 34px), #000 42%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 95% 88% at 50% calc(100% - 34px), #000 42%, transparent 100%)",
          }}
        />
        <button
          type="button"
          disabled={!prevEnabled}
          aria-label={peopleUiCopy.deckPrevLabel}
          data-people-duo-nav-prev="true"
          onClick={() => {
            if (!prevEnabled) return;
            onPrev();
          }}
          className={NAV_SLOT_CLASS}
          style={{
            width: NAV_SLOT_PX,
            height: NAV_SLOT_PX,
            minWidth: NAV_SLOT_PX,
            minHeight: NAV_SLOT_PX,
          }}
        >
          <span
            ref={bindPrevFace}
            className={NAV_FACE_CLASS}
            data-people-duo-nav-feedback="prev"
            aria-hidden
          >
            <PiCaretLeftBold aria-hidden strokeWidth={12} />
          </span>
        </button>

        <div
          className={[
            "pointer-events-auto inline-flex items-center gap-2",
            CENTER_PILL_CLASS,
          ].join(" ")}
          data-people-duo-heart-comment-pill="true"
        >
          <PeopleActionStateButton
            kind="heart"
            size={52}
            state={heartButtonState}
            confirmedState={heartConfirmedRef.current}
            disabled={navDisabled && heartButtonState !== "pending"}
            ariaLabel={connectLabel}
            onClick={onHeart}
          />

          <PeopleActionStateButton
            kind="comment"
            size={52}
            state={resolvedCommentState}
            confirmedState={resolvedCommentConfirmed}
            disabled={commentPressBlocked && resolvedCommentState !== "pending"}
            ariaLabel={messageLabel}
            onClick={onMessage}
          />
        </div>

        <button
          type="button"
          disabled={!nextEnabled}
          aria-label={peopleUiCopy.deckNextLabel}
          data-people-duo-nav-next="true"
          onClick={() => {
            if (!nextEnabled) return;
            onNext();
          }}
          className={NAV_SLOT_CLASS}
          style={{
            width: NAV_SLOT_PX,
            height: NAV_SLOT_PX,
            minWidth: NAV_SLOT_PX,
            minHeight: NAV_SLOT_PX,
          }}
        >
          <span
            ref={bindNextFace}
            className={NAV_FACE_CLASS}
            data-people-duo-nav-feedback="next"
            aria-hidden
          >
            <PiCaretRightBold aria-hidden strokeWidth={12} />
          </span>
        </button>
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(row, document.body);
  }
  return row;
}
