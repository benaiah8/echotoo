import {
  useRef,
  type CSSProperties,
  type PointerEvent,
  type MouseEvent,
} from "react";
import { PiCaretLeftBold, PiLockSimpleBold } from "react-icons/pi";
import {
  PEOPLE_ACTIVE_PILL_MIN_H_PX,
  PEOPLE_CENTER_H_PX,
  PEOPLE_CENTER_PAD_Y_PX,
  PEOPLE_CENTER_RING_PX,
  PEOPLE_CENTER_W_CSS,
  PEOPLE_DEST_PAD_X_PX,
  PEOPLE_FLAT_DESTINATION_ORDER,
  PEOPLE_FLUID_CENTER_RAISE_PX,
  PEOPLE_NAV_ITEM_GAP_PX,
  stepPeopleFlatDestination,
  type PeopleFlatDestination,
} from "./peopleShellLayout";
import { peopleUiCopy } from "./peopleUiCopy";

const INTENT_PX = 11;
const COMMIT_PX = 36;

/** Groups primary-tab visual: inactive | discovery (normal white) | yours (green). */
export type PeopleGroupsPillState = "inactive" | "new" | "yours";

export type PeopleFluidNavProps = {
  activeDestination: PeopleFlatDestination;
  discoverEnabled: boolean;
  /** Groups tab fill: inactive / New = Duo-style white / Yours = green. */
  groupsPillState?: PeopleGroupsPillState;
  onBack: () => void;
  onSelectDuo: () => void;
  onSelectDiscover: () => void;
  onSelectPlans: () => void;
  onSelectGroups: () => void;
};

/**
 * People flat primary nav — one frosted pill, one flex row:
 * [ ← ][ Duo ][ Discover ][ Plans ][ Groups ]
 */
export default function PeopleFluidNav(props: PeopleFluidNavProps) {
  const gestureRef = useRef<{
    x0: number;
    y0: number;
    locked: null | "v" | "h";
    committed: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const groupsPillState: PeopleGroupsPillState =
    props.groupsPillState ??
    (props.activeDestination === "groups" ? "new" : "inactive");

  const selectDestination = (id: PeopleFlatDestination) => {
    if (id === "duo") props.onSelectDuo();
    else if (id === "discover") props.onSelectDiscover();
    else if (id === "plans") props.onSelectPlans();
    else props.onSelectGroups();
  };

  const advance = (direction: 1 | -1) => {
    const next = stepPeopleFlatDestination(
      props.activeDestination,
      direction,
    );
    if (next !== props.activeDestination) selectDestination(next);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("[data-people-back]")) return;
    suppressClickRef.current = false;
    gestureRef.current = {
      x0: e.clientX,
      y0: e.clientY,
      locked: null,
      committed: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const g = gestureRef.current;
    if (!g || g.committed) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (!g.locked) {
      if (Math.abs(dx) < INTENT_PX && Math.abs(dy) < INTENT_PX) return;
      g.locked = Math.abs(dy) >= Math.abs(dx) ? "v" : "h";
    }
    if (g.locked !== "v") return;
    if (Math.abs(dy) < COMMIT_PX) return;
    g.committed = true;
    suppressClickRef.current = true;
    advance(dy < 0 ? 1 : -1);
  };

  const onPointerUp = () => {
    gestureRef.current = null;
  };

  const onClickCapture = (e: MouseEvent) => {
    if (!suppressClickRef.current) return;
    const target = e.target as HTMLElement | null;
    // Back is an exit control — never swallow after a prior carousel swipe.
    if (target?.closest?.("[data-people-back]")) {
      suppressClickRef.current = false;
      return;
    }
    suppressClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className="people-v12-nav relative w-full overflow-visible"
      data-people-pill-nav
      data-people-nav-version="v12.4-groups-white-green"
      data-people-flat-primary-nav="true"
      data-people-back-in-nav="true"
      data-people-content-sized-tabs="true"
      data-people-uniform-outer-pad="true"
      data-people-single-row-gap="true"
      data-people-primary-shelves="false"
      data-people-end-housings="false"
      data-people-stable-center-column="true"
      data-people-groups-dock-inverted="false"
      data-people-groups-pill-state={groupsPillState}
      role="navigation"
      aria-label={peopleUiCopy.shellDockAria}
    >
      <div
        className="people-nav-controls relative z-[2] flex w-full items-center justify-center overflow-visible px-2.5"
        data-people-nav-controls
        style={{
          paddingTop: PEOPLE_CENTER_RING_PX,
          paddingBottom: PEOPLE_CENTER_RING_PX,
          minHeight: PEOPLE_CENTER_H_PX + PEOPLE_CENTER_RING_PX * 2,
        }}
      >
        <div
          className="people-nav-center relative max-w-full shrink-0"
          data-people-center-column
          data-people-center-fixed-width="false"
          data-people-center-content-width="true"
          data-people-center-raise={PEOPLE_FLUID_CENTER_RAISE_PX}
          style={{
            width: "max-content",
            maxWidth: PEOPLE_CENTER_W_CSS,
            height: PEOPLE_CENTER_H_PX,
          }}
        >
          <div
            className={[
              "people-center-pill relative flex h-full w-full touch-none select-none",
              "items-center rounded-full",
              "border border-transparent box-border",
              "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
              "[-webkit-backdrop-filter:blur(var(--glass-blur))]",
              "shadow-[0_0_0_2px_var(--bottom-tab-pill-ring)]",
            ].join(" ")}
            data-people-center-pill
            data-people-center-surface="frosted"
            data-people-unified-nav="true"
            data-people-outer-pad={PEOPLE_CENTER_PAD_Y_PX}
            data-people-item-gap={PEOPLE_NAV_ITEM_GAP_PX}
            role="tablist"
            aria-label={peopleUiCopy.shellModeSwitchAria}
            style={{
              padding: PEOPLE_CENTER_PAD_Y_PX,
              boxSizing: "border-box",
              gap: PEOPLE_NAV_ITEM_GAP_PX,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClickCapture={onClickCapture}
          >
            <button
              type="button"
              onClick={props.onBack}
              aria-label={peopleUiCopy.shellBack}
              data-people-back="nav-leading"
              data-people-shell-bottom-back="true"
              data-people-back-selectable="false"
              data-people-nav-item="true"
              data-people-control-height={PEOPLE_ACTIVE_PILL_MIN_H_PX}
              className={[
                "inline-flex shrink-0 items-center justify-center rounded-full",
                "bg-[color-mix(in_oklab,var(--text)_14%,transparent)]",
                "border border-[color-mix(in_oklab,var(--text)_18%,transparent)]",
                "text-[var(--text)]",
                "transition active:scale-[0.94]",
              ].join(" ")}
              style={{
                width: PEOPLE_ACTIVE_PILL_MIN_H_PX,
                height: PEOPLE_ACTIVE_PILL_MIN_H_PX,
                minWidth: PEOPLE_ACTIVE_PILL_MIN_H_PX,
                margin: 0,
              }}
            >
              <PiCaretLeftBold className="h-[18px] w-[18px]" aria-hidden />
            </button>

            {PEOPLE_FLAT_DESTINATION_ORDER.map((id) => {
              const muted = id === "discover" && !props.discoverEnabled;
              const label =
                id === "duo"
                  ? peopleUiCopy.shellDuo
                  : id === "discover"
                    ? peopleUiCopy.scopeDiscover
                    : id === "plans"
                      ? peopleUiCopy.scopeOpenPlans
                      : peopleUiCopy.shellGroups;
              const selected =
                id === "groups"
                  ? groupsPillState !== "inactive"
                  : props.activeDestination === id;
              const groupsAccent =
                id === "groups" ? groupsPillState : undefined;
              return (
                <FlatDestinationItem
                  key={id}
                  destinationId={id}
                  label={label}
                  selected={selected}
                  groupsAccent={groupsAccent}
                  muted={muted}
                  onClick={() => selectDestination(id)}
                  lockIcon={muted}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function FlatDestinationItem({
  destinationId,
  label,
  selected,
  groupsAccent,
  muted,
  onClick,
  lockIcon,
}: {
  destinationId: PeopleFlatDestination;
  label: string;
  selected: boolean;
  /** Groups-only: new = normal white active; yours = green. */
  groupsAccent?: PeopleGroupsPillState;
  muted: boolean;
  onClick: () => void;
  lockIcon?: boolean;
}) {
  /* Same raised treatment as Duo / Discover / Plans (theme-aware white/dark). */
  const normalActive = [
    "opacity-100",
    "bg-[var(--bottom-tab-feed-notif-active-bg)]",
    "text-[var(--bottom-tab-feed-notif-active-fg)]",
    "shadow-[var(--bottom-tab-feed-notif-active-shadow)]",
    "border border-[var(--bottom-tab-feed-notif-active-border)]",
  ].join(" ");

  const greenActive = [
    "opacity-100",
    "bg-[var(--green-text)] text-white",
    "shadow-[var(--bottom-tab-feed-notif-active-shadow)]",
    "border border-[color-mix(in_oklab,var(--green-text)_55%,#000)]",
  ].join(" ");

  let selectedClass = normalActive;
  if (destinationId === "groups" && groupsAccent === "yours") {
    selectedClass = greenActive;
  }

  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
      className={[
        "people-flat-dest people-center-mode relative inline-flex shrink-0 items-center justify-center gap-0.5",
        "rounded-full text-[12px] font-semibold leading-none tracking-tight",
        "transition-[color,background-color,opacity,box-shadow] duration-150",
        "min-h-[var(--people-active-pill-min-h)]",
        muted
          ? "opacity-40 text-[var(--text)]"
          : selected
            ? selectedClass
            : "opacity-70 text-[var(--text)] border border-transparent",
      ].join(" ")}
      style={
        {
          ["--people-active-pill-min-h" as string]: `${PEOPLE_ACTIVE_PILL_MIN_H_PX}px`,
          height: "100%",
          paddingLeft: PEOPLE_DEST_PAD_X_PX,
          paddingRight: PEOPLE_DEST_PAD_X_PX,
          margin: 0,
        } as CSSProperties
      }
      data-people-center-mode={destinationId}
      data-people-flat-destination={destinationId}
      data-people-nav-item="true"
      data-people-active-pill={selected ? "true" : "false"}
      data-people-groups-accent={
        destinationId === "groups" ? groupsAccent ?? "inactive" : undefined
      }
      data-people-content-sized="true"
      data-people-selected-underline="false"
    >
      {lockIcon ? (
        <PiLockSimpleBold className="h-2.5 w-2.5 shrink-0" aria-hidden />
      ) : null}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
