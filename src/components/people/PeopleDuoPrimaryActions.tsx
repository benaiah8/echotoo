/**
 * Duo fixed primary actions — icon-only Heart + Message above BottomTab.
 */
import { PiChatCircleBold, PiHeartBold, PiHeartFill } from "react-icons/pi";
import type { PeopleFeedHeartState } from "./PeopleFeedActionRail";
import {
  peopleShellActionFaceClass,
  type PeopleShellActionTone,
} from "../../pages/people/peopleShellPrimaryAction";

/** Visual diameter — ≥44px touch target (approved ~54–60px). */
const DUO_ACTION_DIAMETER_PX = 56;

export type PeopleDuoPrimaryActionsProps = {
  connectLabel: string;
  heartState: PeopleFeedHeartState;
  onConnect: () => void;
  messageLabel: string;
  messageBusy?: boolean;
  messageDisabled?: boolean;
  onMessage: () => void;
  connectTone?: PeopleShellActionTone;
};

export default function PeopleDuoPrimaryActions({
  connectLabel,
  heartState,
  onConnect,
  messageLabel,
  messageBusy = false,
  messageDisabled = false,
  onMessage,
  connectTone = "brand",
}: PeopleDuoPrimaryActionsProps) {
  const heartBusy = heartState === "busy";
  const heartDisabled = heartState === "disabled" || heartBusy;
  const heartActive =
    heartState === "active" || heartState === "pending";
  const msgDisabled = messageDisabled || messageBusy;

  const connectFace = peopleShellActionFaceClass(
    heartDisabled ? "muted" : connectTone,
    heartDisabled
  );
  const messageFace = peopleShellActionFaceClass(
    msgDisabled ? "muted" : "brand",
    msgDisabled
  );

  const circleClass =
    "pointer-events-auto inline-flex shrink-0 items-center justify-center rounded-full border box-border shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition active:scale-[0.94]";

  return (
    <div
      className="pointer-events-none mx-auto flex w-full max-w-[640px] shrink-0 justify-center gap-4 px-[var(--gutter,14px)] pb-2 pt-2"
      data-people-duo-primary-actions="true"
      data-people-duo-primary-actions-shape="icon-circle"
    >
      <button
        type="button"
        disabled={heartDisabled}
        aria-label={connectLabel}
        aria-busy={heartBusy || undefined}
        aria-pressed={heartActive || undefined}
        title={connectLabel}
        data-people-feed-heart="true"
        data-people-feed-heart-state={heartState}
        onClick={() => {
          if (!heartDisabled) onConnect();
        }}
        className={[
          circleClass,
          connectFace,
          heartActive ? "text-[rgb(225,29,72)]" : "",
        ].join(" ")}
        style={{
          width: DUO_ACTION_DIAMETER_PX,
          height: DUO_ACTION_DIAMETER_PX,
          minWidth: DUO_ACTION_DIAMETER_PX,
          minHeight: DUO_ACTION_DIAMETER_PX,
        }}
      >
        {heartBusy ? (
          <span className="sr-only">{connectLabel}</span>
        ) : null}
        {heartActive ? (
          <PiHeartFill className="h-7 w-7 shrink-0" aria-hidden />
        ) : (
          <PiHeartBold className="h-7 w-7 shrink-0" aria-hidden />
        )}
      </button>

      <button
        type="button"
        disabled={msgDisabled}
        aria-label={messageLabel}
        aria-busy={messageBusy || undefined}
        title={messageLabel}
        data-people-feed-message="true"
        onClick={() => {
          if (!msgDisabled) onMessage();
        }}
        className={[circleClass, messageFace].join(" ")}
        style={{
          width: DUO_ACTION_DIAMETER_PX,
          height: DUO_ACTION_DIAMETER_PX,
          minWidth: DUO_ACTION_DIAMETER_PX,
          minHeight: DUO_ACTION_DIAMETER_PX,
        }}
      >
        {messageBusy ? (
          <span className="sr-only">{messageLabel}</span>
        ) : null}
        <PiChatCircleBold className="h-7 w-7 shrink-0" aria-hidden />
      </button>
    </div>
  );
}
